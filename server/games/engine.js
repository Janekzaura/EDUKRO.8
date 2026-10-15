// Gry EDUKRO: czyszczenie danych z edytora, widok dla gracza (bez odpowiedzi) i sprawdzanie ruchów.
// Odpowiedzi zna tylko serwer. Widok i klucz powstają deterministycznie z „ziarna” podejścia,
// więc serwer odtwarza je przy każdym ruchu bez przechowywania kopii.
import { cleanQuestion } from '../quiz/schema.js';
import { prepare, grade, seededRng, shuffle, fold } from '../quiz/engine.js';
import { clean } from '../../public/js/shared/quiz-rules.js';
import {
  GAME_TYPE, GL, SAPER_EVENT, HAMMER_STAGES, letters, cellKey, crosswordMap, crosswordCode, emptyGame,
} from '../../public/js/shared/game-rules.js';

/* ================= Czyszczenie (edytor → baza) ================= */
const S = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const gid = (v) => (typeof v === 'string' && /^[a-z0-9]{4,24}$/i.test(v) ? v : Math.random().toString(36).slice(2, 12));
const int = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const bool = (v) => (typeof v === 'boolean' ? v : null);
const qOf = (raw, type) => { const x = cleanQuestion(raw && typeof raw === 'object' ? { ...raw, type } : { type }); x.type = type; return x; };

function cleanChoice(x, n = null) {
  const opts = arr(x?.options, 6).map((o) => S(o, GL.option));
  while (n && opts.length < n) opts.push('');
  const out = { id: gid(x?.id), kind: 'choice', prompt: S(x?.prompt, GL.prompt), options: n ? opts.slice(0, n) : opts, correct: null };
  if (Number.isInteger(x?.correct) && x.correct >= 0 && x.correct < out.options.length) out.correct = x.correct;
  return out;
}
const cleanTf = (x) => ({ id: gid(x?.id), kind: 'tf', text: S(x?.text, GL.prompt), answer: bool(x?.answer) });
const cleanItem = (x) => (x?.kind === 'tf' ? cleanTf(x) : cleanChoice(x, 4));
const cleanCells = (list, rows, cols, max = 30) => arr(list, max)
  .filter((c) => Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[1] >= 0 && c[0] < rows && c[1] < cols)
  .map((c) => [c[0], c[1]]);

function cleanEvent(ev) {
  const kind = SAPER_EVENT[ev?.kind] ? ev.kind : null;
  const base = { id: gid(ev?.id), kind };
  switch (kind) {
    case 'wire': {
      const c = cleanChoice(ev);
      const options = c.options.slice(0, 5);
      while (options.length < 3) options.push('');
      return { ...base, prompt: c.prompt, options, correct: Number.isInteger(c.correct) && c.correct < options.length ? c.correct : null };
    }
    case 'torch': return { ...base, question: qOf(ev.question, 'open') };
    case 'trojan': return { ...base, question: qOf(ev.question, 'timeline') };
    case 'crossword': {
      const rows = int(ev.rows, 4, GL.grid, 9), cols = int(ev.cols, 4, GL.grid, 11);
      const words = arr(ev.words, 10).map((w) => ({ id: gid(w?.id), clue: S(w?.clue, GL.clue), answer: S(w?.answer, GL.word), cells: cleanCells(w?.cells, rows, cols, GL.word) }));
      const tasks = arr(ev.tasks, 3);
      return { ...base, rows, cols, words, code: cleanCells(ev.code, rows, cols, 16),
        tasks: [qOf(tasks[0], 'open'), qOf(tasks[1], 'table'), qOf(tasks[2], 'truefalse')] };
    }
    case 'files': {
      const qs = arr(ev.questions, 4).map((x) => ({ prompt: S(x?.prompt, GL.prompt), answer: S(x?.answer, GL.file) }));
      while (qs.length < 4) qs.push({ prompt: '', answer: '' });
      const decoys = arr(ev.decoys, 12).map((x) => S(x, GL.file));
      while (decoys.length < 12) decoys.push('');
      return { ...base, questions: qs, decoys };
    }
    default: return base;
  }
}

export function cleanGame(raw) {
  const type = GAME_TYPE[raw?.type] ? raw.type : 'saper';
  const def = emptyGame(type);
  if (type === 'saper') {
    return {
      type, time: int(raw?.time, GL.minTime, GL.maxTime, def.time), points: int(raw?.points, 0, GL.maxPoints, def.points),
      events: arr(raw?.events, GL.events).map(cleanEvent),
      katana: { questions: arr(raw?.katana?.questions, GL.katanaQ).map(cleanItem) },
    };
  }
  const st = raw?.stages || {};
  return {
    type, points: int(raw?.points, 0, GL.maxPoints, def.points),
    stages: Object.fromEntries(HAMMER_STAGES.map((s) => [s.key, st[s.key] !== false])),
    cards: arr(raw?.cards, GL.cards).map(cleanItem),
    bugs: {
      questions: arr(raw?.bugs?.questions, GL.bugQ).map((x) => ({ id: gid(x?.id), prompt: S(x?.prompt, GL.prompt), answer: S(x?.answer, GL.option) })),
      decoys: arr(raw?.bugs?.decoys, GL.bugDecoys).map((x) => S(x, GL.option)),
    },
    pairs: arr(raw?.pairs, GL.pairs).map((p) => ({ id: gid(p?.id), left: S(p?.left, GL.option), right: S(p?.right, GL.option) })),
    test: arr(raw?.test, GL.testQ).map((x) => cleanChoice(x, 4)),
    approve: arr(raw?.approve, GL.approve).map(cleanTf),
  };
}
export function parseGame(a) {
  try { return cleanGame(JSON.parse(a.content_json || '{}')); } catch { return cleanGame({}); }
}
export function gameMedia(doc) {
  const out = [];
  const qs = doc.type === 'saper' ? doc.events.flatMap((e) => [e.question, ...(e.tasks || [])].filter(Boolean)) : [];
  for (const q of qs) { if (q.image) out.push(q.image); }
  return out;
}

/* ================= Widok gracza i klucz ================= */
const rngFor = (seed, part) => seededRng(`${seed}:${part}`);
/** Opcje w losowej kolejności z identyfikatorami (klucz: id → indeks oryginalny). */
function shuffled(options, seed, part) {
  const rng = rngFor(seed, part);
  const ids = options.map(() => rng.id());
  const order = shuffle(options.map((_, i) => i), rng);
  return { view: order.map((i) => ({ id: ids[i], text: options[i] })), ids };
}
function itemView(it, seed) {
  if (it.kind === 'tf') return { view: { id: it.id, kind: 'tf', text: it.text }, key: { answer: it.answer } };
  const s = shuffled(it.options, seed, it.id);
  return { view: { id: it.id, kind: 'choice', prompt: it.prompt, options: s.view }, key: { correct: s.ids[it.correct] } };
}
const qPrep = (q, seed) => prepare(q, { shuffleAnswers: true }, { rng: rngFor(seed, q.id), noHints: true });

export function buildPlay(doc, seed) {
  const V = { type: doc.type, points: doc.points }; const K = {};
  if (doc.type === 'saper') {
    V.time = doc.time;
    V.events = doc.events.map((ev) => {
      const v = { id: ev.id, kind: ev.kind };
      if (ev.kind === 'wire') {
        const s = shuffled(ev.options, seed, ev.id);
        v.prompt = ev.prompt; v.options = s.view; K[ev.id] = { correct: s.ids[ev.correct] };
      } else if (ev.kind === 'torch' || ev.kind === 'trojan') {
        const p = qPrep(ev.question, seed); v.question = p.view; K[ev.id] = { key: p.key };
      } else if (ev.kind === 'crossword') {
        v.rows = ev.rows; v.cols = ev.cols; v.code = ev.code;
        v.words = ev.words.map((w, i) => ({ id: w.id, n: i + 1, clue: w.clue, cells: w.cells }));
        v.tasks = ev.tasks.map((t) => qPrep(t, seed).view);
        K[ev.id] = { tasks: ev.tasks.map((t) => qPrep(t, seed).key) };
      } else if (ev.kind === 'files') {
        const names = [...ev.questions.map((x) => x.answer), ...ev.decoys];
        const s = shuffled(names, seed, ev.id);
        v.questions = ev.questions.map((x) => x.prompt);
        v.files = s.view.map((f) => ({ id: f.id, name: f.text }));
        K[ev.id] = { answers: s.ids.slice(0, 4) };
      }
      return v;
    });
    const kv = doc.katana.questions.map((it) => itemView(it, seed));
    V.katana = kv.map((x) => x.view); K.katana = Object.fromEntries(kv.map((x, i) => [doc.katana.questions[i].id, x.key]));
  } else {
    V.stages = HAMMER_STAGES.filter((s) => doc.stages[s.key]).map((s) => s.key);
    const cv = shuffle(doc.cards, rngFor(seed, 'cards')).map((it) => ({ it, x: itemView(it, seed) }));
    V.cards = cv.map((c) => c.x.view); K.cards = Object.fromEntries(cv.map((c) => [c.it.id, c.x.key]));
    const answers = [...doc.bugs.questions.map((x) => x.answer), ...doc.bugs.decoys];
    const bs = shuffled(answers, seed, 'bugs');
    V.bugs = { questions: doc.bugs.questions.map((x) => ({ id: x.id, prompt: x.prompt })), answers: bs.view.map((a, i) => ({ ...a, letter: 'ABCDEFGH'[i] })) };
    K.bugs = Object.fromEntries(doc.bugs.questions.map((x, i) => [x.id, bs.ids[i]]));
    const rng = rngFor(seed, 'pairs');
    const L = doc.pairs.map((p) => ({ pid: p.id, id: rng.id(), text: p.left }));
    const R = doc.pairs.map((p) => ({ pid: p.id, id: rng.id(), text: p.right }));
    V.pairs = shuffle([...L, ...R], rng).map((x) => ({ id: x.id, text: x.text, side: L.includes(x) ? 'L' : 'R' }));
    K.pairs = Object.fromEntries([...L, ...R].map((x) => [x.id, x.pid]));
    const tv = doc.test.map((it) => itemView(it, seed));
    V.test = tv.map((x) => x.view); K.test = Object.fromEntries(tv.map((x, i) => [doc.test[i].id, x.key]));
    const av = shuffle(doc.approve, rngFor(seed, 'approve'));
    V.approve = av.map((it) => ({ id: it.id, text: it.text })); K.approve = Object.fromEntries(av.map((it) => [it.id, it.answer]));
    V.total = expectedKeys(doc).length;
  }
  return { view: V, key: K };
}

/** Wszystkie „punkty kontrolne” gry (klucze stanu), które trzeba zaliczyć. */
export function expectedKeys(doc) {
  if (doc.type === 'saper') {
    const out = [];
    for (const ev of doc.events) {
      if (ev.kind === 'crossword') { ev.words.forEach((w) => out.push(`cw:${ev.id}:${w.id}`)); out.push(`code:${ev.id}`); ev.tasks.forEach((_, i) => out.push(`task:${ev.id}:${i}`)); }
      else if (ev.kind === 'files') out.push(`files:${ev.id}`);
      else out.push(`ev:${ev.id}`);
    }
    doc.katana.questions.forEach((x) => out.push(`k:${x.id}`));
    return out;
  }
  const st = doc.stages; const out = [];
  if (st.cards) doc.cards.forEach((x) => out.push(`card:${x.id}`));
  if (st.bugs) doc.bugs.questions.forEach((x) => out.push(`bug:${x.id}`));
  if (st.pairs) doc.pairs.forEach((x) => out.push(`pair:${x.id}`));
  if (st.test) doc.test.forEach((x) => out.push(`test:${x.id}`));
  if (st.approve) doc.approve.forEach((x) => out.push(`ap:${x.id}`));
  return out;
}

/* ================= Ruchy ================= */
const eqFold = (a, b) => fold(letters(a).join('').toLocaleLowerCase('pl-PL')) === fold(letters(b).join('').toLocaleLowerCase('pl-PL'));
function itemCorrect(key, body) {
  if ('answer' in key) return typeof body.value === 'boolean' && body.value === key.answer;
  return body.choice === key.correct;
}
/** Zapis wyniku punktu kontrolnego: liczy się pierwsza próba. */
function mark(state, k, ok) {
  const c = state.checks[k] || { ok: false, first: null, n: 0 };
  c.n += 1;
  if (c.first === null) c.first = !!ok;
  if (ok) c.ok = true;
  state.checks[k] = c;
  return c;
}

/**
 * Ruch gracza. Zwraca odpowiedź dla przeglądarki i zmienia state.
 * Saper: każdy błąd (poza wpisywaniem krzyżówki i kodu) = wybuch.
 */
export function act(doc, seed, state, body) {
  const { key: K } = buildPlay(doc, seed);
  const b = body && typeof body === 'object' ? body : {};
  state.checks ||= {};
  if (doc.type === 'saper') {
    if (state.exploded) return { exploded: true, ended: true };
    const boom = (why) => { state.exploded = why || 'mistake'; return { ok: false, exploded: true }; };
    if (b.kind === 'timeout') return boom('time');
    if (b.kind === 'katana-start') { state.katanaAt ||= Date.now(); return { ok: true }; }
    const ev = doc.events.find((e) => e.id === b.ev);
    if (b.kind === 'katana') {
      const k = K.katana[b.id];
      if (!k) return { ok: false, error: 'Nie ma takiego pytania.' };
      const ok = !b.timeout && itemCorrect(k, b);
      mark(state, `k:${b.id}`, ok);
      return ok ? { ok: true } : boom(b.timeout ? 'time' : 'mistake');
    }
    if (!ev) return { ok: false, error: 'Nie ma takiego zdarzenia.' };
    if (ev.kind === 'wire') {
      const ok = b.choice === K[ev.id].correct;
      mark(state, `ev:${ev.id}`, ok);
      return ok ? { ok: true } : { ...boom(), correct: K[ev.id].correct };
    }
    if (ev.kind === 'torch' || ev.kind === 'trojan') {
      const g = grade(ev.question, K[ev.id].key, b.answer, { spelling: true });
      mark(state, `ev:${ev.id}`, g.correct);
      return g.correct ? { ok: true } : { ...boom(), parts: g.parts };
    }
    if (ev.kind === 'crossword') {
      if (b.part === 'word') {
        const w = ev.words.find((x) => x.id === b.word);
        if (!w) return { ok: false };
        const ok = eqFold(b.text, w.answer);
        mark(state, `cw:${ev.id}:${w.id}`, ok);
        return { ok, letters: ok ? letters(w.answer) : null };
      }
      if (b.part === 'code') {
        const all = ev.words.every((w) => state.checks[`cw:${ev.id}:${w.id}`]?.ok);
        if (!all) return { ok: false, error: 'Najpierw rozwiąż całą krzyżówkę.' };
        const ok = eqFold(b.text, crosswordCode(ev));
        mark(state, `code:${ev.id}`, ok);
        return { ok };
      }
      if (b.part === 'task') {
        if (!state.checks[`code:${ev.id}`]?.ok) return { ok: false, error: 'Najpierw wpisz kod dostępu.' };
        const i = Number(b.i);
        const t = ev.tasks[i];
        if (!t) return { ok: false };
        const g = grade(t, K[ev.id].tasks[i], b.answer, { spelling: true });
        mark(state, `task:${ev.id}:${i}`, g.correct);
        return g.correct ? { ok: true, parts: g.parts } : { ...boom(), parts: g.parts };
      }
      return { ok: false };
    }
    if (ev.kind === 'files') {
      const del = state.deleted?.[ev.id] || [];
      if (K[ev.id].answers.includes(b.file)) { mark(state, `files:${ev.id}`, false); return { ...boom(), wasAnswer: true }; }
      if (!del.includes(b.file)) del.push(b.file);
      state.deleted = { ...(state.deleted || {}), [ev.id]: del };
      const done = del.length >= 12;
      if (done) mark(state, `files:${ev.id}`, true);
      return { ok: true, left: 12 - del.length, done };
    }
    return { ok: false };
  }

  /* ---------- Hammer Game ---------- */
  if (b.kind === 'card') {
    const k = K.cards[b.id];
    if (!k) return { ok: false };
    const ok = !b.timeout && itemCorrect(k, b);
    mark(state, `card:${b.id}`, ok);
    return { ok, correct: 'answer' in k ? k.answer : k.correct };
  }
  if (b.kind === 'bug') {
    const want = K.bugs[b.q];
    if (!want) return { ok: false };
    const ok = b.answer === want;
    const c = mark(state, `bug:${b.q}`, ok);
    return { ok, first: c.first };
  }
  if (b.kind === 'pair') {
    const pa = K.pairs[b.a], pb = K.pairs[b.b];
    if (!pa || !pb || b.a === b.b) return { ok: false };
    const ok = pa === pb;
    mark(state, `pair:${pa}`, ok);
    return { ok };
  }
  if (b.kind === 'test') {
    const ans = b.answers && typeof b.answers === 'object' ? b.answers : {};
    const out = {};
    for (const it of doc.test) {
      if (state.checks[`test:${it.id}`]) { out[it.id] = { ok: state.checks[`test:${it.id}`].first, correct: K.test[it.id].correct }; continue; }
      const ok = ans[it.id] === K.test[it.id].correct;
      mark(state, `test:${it.id}`, ok);
      out[it.id] = { ok, correct: K.test[it.id].correct };
    }
    const good = Object.values(out).filter((x) => x.ok).length;
    return { results: out, good, total: doc.test.length, pct: Math.round((good / doc.test.length) * 100) };
  }
  if (b.kind === 'approve') {
    if (!(b.id in K.approve)) return { ok: false };
    const ok = typeof b.value === 'boolean' && b.value === K.approve[b.id];
    mark(state, `ap:${b.id}`, ok);
    return { ok, correct: K.approve[b.id] };
  }
  return { ok: false };
}

/** Wynik gry na koniec: saper – wygrana/przegrana, hammer – procent (pierwsza próba). */
export function outcome(doc, state, { elapsedMs = 0 } = {}) {
  const keys = expectedKeys(doc);
  const ch = state.checks || {};
  if (doc.type === 'saper') {
    const allOk = keys.every((k) => ch[k]?.ok);
    const inTime = elapsedMs <= (doc.time * 2 + 180) * 1000;
    const win = !state.exploded && allOk && inTime;
    return { win, score: win ? 1 : 0, max: 1, pct: win ? 100 : 0, reason: state.exploded || (allOk ? (inTime ? null : 'time') : 'unfinished') };
  }
  const good = keys.filter((k) => ch[k]?.first === true).length;
  const pct = keys.length ? Math.round((good / keys.length) * 100) : 0;
  return { win: pct >= 55, score: good, max: keys.length, pct };
}
export { clean, cellKey, crosswordMap };
