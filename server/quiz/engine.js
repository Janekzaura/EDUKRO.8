// Silnik testów: przygotowanie pytania dla ucznia (bez poprawnych odpowiedzi) i ocenianie.
// Klucz (mapowanie losowych identyfikatorów) zostaje po stronie serwera, w stanie próby.
import crypto from 'node:crypto';
import { parseCloze, parseSlash, parseNumber, sentenceWords, clean, seriesOf, wordBound, hideSpeech } from '../../public/js/shared/quiz-rules.js';

/* ---------- Tekst: normalizacja i „ortografio-zaliczacz” ---------- */
const FOLD = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
export function norm(s) {
  return clean(s).toLocaleLowerCase('pl-PL')
    .replace(/[„”"«»‚‘’'`]/g, '')
    .replace(/^[\s.,;:!?()[\]-]+|[\s.,;:!?()[\]-]+$/g, '')
    .replace(/\s+/g, ' ');
}
export const fold = (s) => s.replace(/[ąćęłńóśźż]/g, (c) => FOLD[c]).normalize('NFD').replace(/[̀-ͯ]/g, '');

export function levenshtein(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Ile liter różnicy wybacza zaliczacz: krótkie słowa 1, dłuższe 2 (polskie znaki nie liczą się jako błąd). */
export const allowedEdits = (len) => (len <= 2 ? 0 : len <= 4 ? 1 : 2);

/** Porównanie odpowiedzi ucznia z oczekiwaną. tolerant = ortografio-zaliczacz włączony. */
export function textMatches(input, expected, tolerant) {
  const a = norm(input), b = norm(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!tolerant) return false;
  if (/^[+-]?\d+([.,]\d+)?$/.test(b)) return a.replace(',', '.') === b.replace(',', '.'); // liczby – zawsze dokładnie
  if (a.replace(/\D/g, '') !== b.replace(/\D/g, '')) return false; // cyfry w tekście (np. 1 zł / 2 zł) muszą się zgadzać
  const fa = fold(a), fb = fold(b);
  if (fa === fb) return true;
  const allowed = allowedEdits(fb.replace(/\s/g, '').length);
  return allowed > 0 && levenshtein(fa, fb, allowed) <= allowed;
}

const tokens = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export const wordCount = (s) => tokens(s).length;

/* ---------- Słowa kluczowe w odpowiedzi pisemnej ----------
 * Zasady są celowo ostrożne, żeby przypadkowe słowa nie zaliczały odpowiedzi:
 *  – zawsze: ta sama forma albo typowa polska końcówka (białko → białka, białkiem; talerz → talerzu),
 *  – z ortografio-zaliczaczem: brak polskich znaków oraz 1 literówka w słowach od 6 liter
 *    (2 literówki od 10 liter), ale pierwsza litera musi się zgadzać; liczby zawsze dokładnie.
 */
const ENDINGS = ['ami', 'ach', 'owi', 'ego', 'emu', 'ych', 'ymi', 'imi', 'iem', 'iom', 'ów', 'om', 'em', 'ej', 'ie', 'ia', 'iu', 'ii', 'ą', 'ę', 'a', 'e', 'i', 'o', 'u', 'y'];
const ENDINGS_FOLDED = [...new Set(ENDINGS.map(fold))].sort((a, b) => b.length - a.length);
const ENDINGS_EXACT = [...ENDINGS].sort((a, b) => b.length - a.length);
// e ruchome: kubek → kubka, dwutlenek → dwutlenku, ojciec → ojca, węgiel → węgla
const FLEETING = [[/ek$/, 'k'], [/ec$/, 'c'], [/iel$/, 'l']];
function stems(w, endings) {
  const out = new Set([w]);
  for (const e of endings) if (w.length - e.length >= 3 && w.endsWith(e)) out.add(w.slice(0, -e.length));
  for (const [re, rep] of FLEETING) if (w.length >= 5 && re.test(w)) out.add(w.replace(re, rep));
  return out;
}
function sameStem(a, b, endings) {
  const A = stems(a, endings);
  for (const x of stems(b, endings)) if (A.has(x)) return true;
  return false;
}
export function wordMatches(t, k, tolerant) {
  if (!t || !k) return false;
  if (t === k) return true;
  if (/\d/.test(k) || /\d/.test(t)) return t.replace(',', '.') === k.replace(',', '.');
  if (!tolerant) return sameStem(t, k, ENDINGS_EXACT);
  const ft = fold(t), fk = fold(k);
  if (ft === fk || sameStem(ft, fk, ENDINGS_FOLDED)) return true;
  const allowed = fk.length >= 10 ? 2 : fk.length >= 6 ? 1 : 0;
  if (!allowed || ft[0] !== fk[0]) return false;
  return levenshtein(ft, fk, allowed) <= allowed;
}

/** Czy w odpowiedzi występuje słowo (lub kilkuwyrazowe wyrażenie) kluczowe. */
export function containsKeyword(answer, keyword, tolerant) {
  const A = Array.isArray(answer) ? answer : tokens(answer), K = tokens(keyword);
  if (!K.length) return false;
  for (let i = 0; i + K.length <= A.length; i++) {
    if (K.every((k, j) => wordMatches(A[i + j], k, tolerant))) return true;
  }
  return false;
}

/**
 * Ocena odpowiedzi pisemnej: z KAŻDEJ serii musi paść co najmniej jedno słowo (kolejność dowolna),
 * odpowiedź ma mieć co najmniej minWords słów i najwyżej maxWords słów.
 * Wynik nie zawiera słów kluczowych – uczeń nigdy nie poznaje zasady sprawdzania.
 */
export function gradeOpen(text, spec, tolerant) {
  const t = String(text ?? '').slice(0, 5000);
  const A = tokens(t);
  const words = A.length;
  const min = wordBound(spec.minWords).value, max = wordBound(spec.maxWords).value;
  const series = seriesOf(spec).filter((x) => x.length);
  const tooShort = !!min && words < min;
  const tooLong = !!max && words > max;
  const hits = series.filter((list) => list.some((k) => containsKeyword(A, k, tolerant))).length;
  return { correct: words > 0 && !!series.length && hits === series.length && !tooShort && !tooLong, tooShort, tooLong };
}

/** Luka do wpisania: dowolna z alternatyw; uczeń może wpisać kilka – każda musi być poprawna. */
export function gradeGap(input, alternatives, tolerant) {
  const raw = clean(input);
  if (!raw) return false;
  if (alternatives.some((a) => textMatches(raw, a, tolerant))) return true;
  const parts = raw.split(/\s*(?:[,/;]|\s(?:i|lub|albo|oraz)\s)\s*/i).map(clean).filter(Boolean);
  if (parts.length < 2) return false;
  const seen = new Set();
  for (const p of parts) {
    const idx = alternatives.findIndex((a) => textMatches(p, a, tolerant));
    if (idx < 0 || seen.has(idx)) return false;
    seen.add(idx);
  }
  return true;
}

/* ---------- Zadanie na słuch ----------
 * Porównanie bez wielkości liter, cudzysłowów i znaków interpunkcyjnych (kropka, przecinek, ?!).
 * „Dokładna pisownia” (domyślnie) – liczy się każda litera; bez niej działa ortografio-zaliczacz testu.
 */
const speechNorm = (s) => norm(s).replace(/[.,;:!?…¿¡()"–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function gradeListen(input, q, tolerant) {
  const a = speechNorm(input);
  if (!a) return false;
  const want = [q.phrase, ...parseSlash(q.accept)].map(speechNorm).filter(Boolean);
  if (want.includes(a)) return true;
  if (q.exact !== false || !tolerant) return false;
  return want.some((w) => textMatches(a, w, true));
}

/* ---------- Losowość ----------
 * Domyślnie kryptograficzna. Lekcje używają losowości „z ziarnem”, żeby serwer mógł odtworzyć
 * to samo pytanie przy sprawdzaniu odpowiedzi bez przechowywania stanu.
 */
export const cryptoRng = { int: (n) => crypto.randomInt(n), id: () => crypto.randomBytes(5).toString('hex') };
export function seededRng(seed) {
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12);
  const next = () => { // sfc32
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return { int: (n) => Math.floor(next() * n), id: () => Array.from({ length: 10 }, () => '0123456789abcdef'[Math.floor(next() * 16)]).join('') };
}
let R = cryptoRng; // bieżące źródło losowości (ustawiane na czas prepare/assist)
const rid = () => R.id();
export function shuffle(list, rng = null) {
  const g = rng || R;
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = g.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Tasowanie, które (gdy to możliwe) nie zostawia poprawnej kolejności. */
function shuffleNotIdentity(list) {
  if (list.length < 2) return list.slice();
  for (let k = 0; k < 8; k++) { const s = shuffle(list); if (s.some((x, i) => x !== list[i])) return s; }
  return [...list.slice(1), list[0]];
}
function withRng(rng, fn) { const prev = R; R = rng || cryptoRng; try { return fn(); } finally { R = prev; } }
/** Losowy wybór k elementów (bez powtórzeń). */
function sample(list, k) { return shuffle(list).slice(0, Math.max(0, Math.min(k, list.length))); }
/** Ile elementów odsłania koło ratunkowe: 75% (zaokrąglone w dół), co najmniej jeden. */
const share75 = (n) => Math.max(1, Math.floor(n * 0.75));
const mediaUrl = (id) => (id ? `/api/media/${id}` : null);

/* ---------- Tabela ---------- */
function tableBlanks(tb) {
  const out = [];
  tb.cells.forEach((row, r) => row.forEach((c, cc) => { if (c.s === 'blank') out.push({ r, c: cc, key: `${r},${cc}`, answers: parseSlash(c.t), lock: c.lock, g: c.lock ? '' : c.g }); }));
  return out;
}

/** Maksymalne skojarzenie odpowiedzi ucznia z lukami grupy (każda oczekiwana odpowiedź użyta raz). */
function groupMatching(studentCells, expectedCells, ok) {
  const matchOfExpected = new Array(expectedCells.length).fill(-1);
  const assign = new Array(studentCells.length).fill(-1);
  const tryAssign = (i, seen) => {
    for (let j = 0; j < expectedCells.length; j++) {
      if (seen[j] || !ok(i, j)) continue;
      seen[j] = true;
      if (matchOfExpected[j] < 0 || tryAssign(matchOfExpected[j], seen)) { matchOfExpected[j] = i; assign[i] = j; return true; }
    }
    return false;
  };
  studentCells.forEach((_, i) => tryAssign(i, new Array(expectedCells.length).fill(false)));
  return { assign, matchOfExpected };
}

/* ---------- Przygotowanie pytania dla ucznia ---------- */
export function prepare(q, settings = {}, { rng = null, noHints = false } = {}) {
  return withRng(rng, () => prepareInner(q, settings, noHints));
}
function prepareInner(q, settings, noHints) {
  const shuffleAnswers = settings.shuffleAnswers !== false;
  const view = { type: q.type, prompt: q.prompt, image: q.type === 'data' ? null : mediaUrl(q.image), hint: noHints ? null : (q.hint || null) };
  const key = {};
  switch (q.type) {
    case 'single': {
      key.ids = q.options.map(rid);
      const order = shuffleAnswers ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3];
      view.options = order.map((i) => ({ id: key.ids[i], text: q.options[i] }));
      break;
    }
    case 'multi': {
      key.ids = q.options.map(rid);
      const order = q.options.map((_, i) => i);
      view.options = (shuffleAnswers ? shuffle(order) : order).map((i) => ({ id: key.ids[i], text: q.options[i].text }));
      break;
    }
    case 'truefalse':
      view.statements = q.statements.map((s) => s.text);
      break;
    case 'open':
      view.minWords = wordBound(q.minWords).value || null;
      view.maxWords = wordBound(q.maxWords).value || null;
      break;
    case 'number':
      view.unit = q.unit || '';
      break;
    case 'match': {
      key.right = q.pairs.map(rid);
      view.left = q.pairs.map((p, i) => ({ id: `L${i}`, text: p.left }));
      const order = shuffleNotIdentity(q.pairs.map((_, i) => i));
      view.right = order.map((i) => ({ id: key.right[i], text: q.pairs[i].right }));
      break;
    }
    case 'order_words': {
      const words = [...sentenceWords(q.sentence), ...parseSlash(q.distractors)];
      key.tiles = {};
      const tiles = words.map((w) => { const id = rid(); key.tiles[id] = w; return { id, text: w }; });
      view.tiles = shuffleNotIdentity(tiles);
      break;
    }
    case 'timeline': {
      key.ids = q.items.map(rid);
      view.items = shuffleNotIdentity(q.items.map((_, i) => i)).map((i) => ({ id: key.ids[i], text: q.items[i] }));
      break;
    }
    case 'cloze': {
      let g = 0;
      view.segments = parseCloze(q.text, 'open').segments.map((s) => (s.t === 'gap' ? { t: 'gap', i: g++ } : { t: 'text', v: s.v }));
      break;
    }
    case 'cloze_choice': {
      key.gaps = [];
      view.segments = parseCloze(q.text, 'choice').segments.map((s) => {
        if (s.t !== 'gap') return { t: 'text', v: s.v };
        const ids = s.answers.map(rid);
        key.gaps.push(ids);
        return { t: 'gap', i: key.gaps.length - 1, options: shuffle(s.answers.map((a, i) => ({ id: ids[i], text: a }))) };
      });
      break;
    }
    case 'table': {
      const tb = q.table;
      view.table = {
        rows: tb.rows, cols: tb.cols, headerRow: tb.headerRow, headerCol: tb.headerCol,
        cells: tb.cells.map((row) => row.map((c) => (c.s === 'blank' ? { s: 'blank' } : c.s === 'gone' ? { s: 'gone' } : { s: 'show', t: c.t }))),
      };
      break;
    }
    case 'categorize': {
      view.categories = q.categories.map((c, i) => ({ i, name: c.name }));
      key.items = {};
      const items = [];
      q.categories.forEach((c, ci) => parseSlash(c.items).forEach((w) => { const id = rid(); key.items[id] = ci; items.push({ id, text: w }); }));
      view.items = shuffle(items);
      break;
    }
    case 'image_labels': {
      view.diagram = mediaUrl(q.diagram);
      view.points = q.points.map((p, i) => ({ i, x: p.x, y: p.y, letter: String.fromCharCode(97 + i) }));
      key.labels = q.points.map(rid);
      const labels = q.points.map((p, i) => ({ id: key.labels[i], text: p.label }));
      for (const d of parseSlash(q.distractors)) labels.push({ id: rid(), text: d });
      view.labels = shuffle(labels);
      break;
    }
    case 'listen': {
      // tekst dla lektora – zakodowany (odczytuje go dopiero przycisk „Posłuchaj”)
      const seed = rid();
      view.speech = { code: hideSpeech(q.phrase, seed), seed, lang: q.lang, voice: q.voice || null };
      break;
    }
    case 'data':
      view.passage = q.passage;
      view.passageImage = mediaUrl(q.image);
      view.questions = q.questions.map((s) => ({ prompt: s.prompt, minWords: wordBound(s.minWords).value || null, maxWords: wordBound(s.maxWords).value || null }));
      break;
    default: break;
  }
  return { view, key };
}

/* ---------- Ocena odpowiedzi ---------- */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v, max = 200) => (Array.isArray(v) ? v.slice(0, max) : []);
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Zwraca { correct, parts, solution }.
 *  parts    – które fragmenty odpowiedzi są dobre (do podświetlenia),
 *  solution – poprawna odpowiedź w „języku” widoku ucznia (pokazywana tylko w teście nauczającym).
 */
export function grade(q, key, answerRaw, settings = {}) {
  const tol = settings.spelling !== false;
  const a = obj(answerRaw);
  switch (q.type) {
    case 'single': {
      const ok = key.ids.indexOf(a.choice) === q.correct;
      return { correct: ok, parts: { [a.choice]: ok }, solution: { correct: key.ids[q.correct] } };
    }
    case 'multi': {
      const chosen = new Set(list(a.choices).filter((x) => key.ids.includes(x)));
      const correctIds = key.ids.filter((_, i) => q.options[i].correct);
      const ok = chosen.size === correctIds.length && correctIds.every((x) => chosen.has(x));
      const parts = Object.fromEntries([...chosen].map((x) => [x, correctIds.includes(x)]));
      return { correct: ok, parts, solution: { correct: correctIds } };
    }
    case 'truefalse': {
      const vals = list(a.values);
      const parts = q.statements.map((s, i) => vals[i] === s.answer);
      return { correct: parts.every(Boolean), parts, solution: { answers: q.statements.map((s) => s.answer) } };
    }
    case 'open': {
      const r = gradeOpen(str(a.text, 5000), q, tol);
      // celowo bez słów kluczowych – uczeń dostaje tylko przykładową odpowiedź nauczyciela (jeśli jest)
      return { correct: r.correct, parts: { tooShort: r.tooShort, tooLong: r.tooLong }, solution: { sample: clean(q.sample) || null } };
    }
    case 'number': {
      const n = parseNumber(str(a.value, 40));
      const want = parseNumber(q.value);
      const tolv = parseNumber(q.tolerance) || 0;
      const ok = n !== null && want !== null && Math.abs(n - want) <= tolv + 1e-9;
      return { correct: ok, parts: {}, solution: { value: q.value, tolerance: tolv ? q.tolerance : null, unit: q.unit || '' } };
    }
    case 'match': {
      const links = obj(a.links);
      const parts = {};
      q.pairs.forEach((_, i) => { parts[`L${i}`] = links[`L${i}`] === key.right[i]; });
      return { correct: Object.values(parts).every(Boolean), parts, solution: { links: Object.fromEntries(q.pairs.map((_, i) => [`L${i}`, key.right[i]])) } };
    }
    case 'order_words': {
      const seq = list(a.sequence, 60).filter((id) => key.tiles[id] !== undefined);
      if (new Set(seq).size !== seq.length) return { correct: false, parts: {}, solution: { sentence: q.sentence } };
      const want = sentenceWords(q.sentence).map((w) => norm(w));
      const got = seq.map((id) => norm(key.tiles[id]));
      const ok = got.length === want.length && got.every((w, i) => w === want[i]);
      return { correct: ok, parts: {}, solution: { sentence: q.sentence } };
    }
    case 'timeline': {
      const order = list(a.order, 20);
      const parts = key.ids.map((id, i) => order[i] === id);
      return { correct: order.length === key.ids.length && parts.every(Boolean), parts, solution: { order: key.ids } };
    }
    case 'cloze': {
      const gaps = parseCloze(q.text, 'open').segments.filter((s) => s.t === 'gap');
      const vals = list(a.gaps, 100);
      const parts = gaps.map((g, i) => gradeGap(str(vals[i], 300), g.answers, tol));
      return { correct: parts.every(Boolean), parts, solution: { gaps: gaps.map((g) => g.answers) } };
    }
    case 'cloze_choice': {
      const vals = list(a.gaps, 100);
      const parts = key.gaps.map((ids, i) => vals[i] === ids[0]);
      return { correct: parts.every(Boolean), parts, solution: { gaps: key.gaps.map((ids) => ids[0]) } };
    }
    case 'table': return gradeTable(q.table, obj(a.cells), tol);
    case 'categorize': {
      const pl = obj(a.placement);
      const parts = {};
      for (const [id, ci] of Object.entries(key.items)) parts[id] = pl[id] === ci;
      return { correct: Object.values(parts).every(Boolean), parts, solution: { placement: key.items } };
    }
    case 'image_labels': {
      const pl = obj(a.placement);
      const parts = q.points.map((_, i) => pl[i] === key.labels[i]);
      return { correct: parts.every(Boolean), parts, solution: { placement: Object.fromEntries(key.labels.map((id, i) => [i, id])) } };
    }
    case 'listen': {
      const ok = gradeListen(str(a.text, 600), q, tol);
      return { correct: ok, parts: {}, solution: { text: q.phrase, lang: q.lang } };
    }
    case 'data': {
      const vals = list(a.answers, 10);
      const parts = q.questions.map((s, i) => gradeOpen(str(vals[i], 5000), s, tol).correct);
      return { correct: parts.every(Boolean), parts, solution: { samples: q.questions.map((s) => clean(s.sample) || null) } };
    }
    default: return { correct: false, parts: {}, solution: null };
  }
}

export function gradeTable(tb, cellsIn, tol) {
  const blanks = tableBlanks(tb);
  const parts = {};
  const solution = {};
  const val = (b) => str(cellsIn[b.key], 300);
  // luki ścisłe (bez grupy lub z kłódką)
  for (const b of blanks.filter((x) => !x.g)) {
    parts[b.key] = gradeGap(val(b), b.answers, tol);
    solution[b.key] = b.answers.join(' / ');
  }
  // grupy – odpowiedzi w dowolnej kolejności
  const groups = {};
  for (const b of blanks.filter((x) => x.g)) (groups[b.g] ||= []).push(b);
  for (const [g, cells] of Object.entries(groups)) {
    const repeat = tb.groupRepeat?.[g] === true;
    const ok = (i, j) => gradeGap(val(cells[i]), cells[j].answers, tol);
    if (repeat) {
      cells.forEach((c, i) => { parts[c.key] = cells.some((_, j) => ok(i, j)); });
      cells.forEach((c) => { solution[c.key] = c.answers.join(' / '); });
    } else {
      const { assign, matchOfExpected } = groupMatching(cells, cells, ok);
      cells.forEach((c, i) => { parts[c.key] = assign[i] >= 0; });
      // ta sama odpowiedź może zaliczyć kilka luk tylko tyle razy, ile razy występuje w przygotowanym zestawie
      const byValue = new Map();
      cells.forEach((c, i) => {
        if (!parts[c.key]) return;
        const k = fold(norm(val(c)));
        if (!byValue.has(k)) byValue.set(k, []);
        byValue.get(k).push(i);
      });
      for (const [k, idxs] of byValue) {
        // np. dwie luki „1 zł” → dwa razy wolno; luki „pies/kot/koń” → każde zwierzę tylko raz
        const allowed = Math.max(1, cells.filter((e) => e.answers.length && e.answers.every((x) => textMatches(k, x, tol))).length);
        for (const i of idxs.slice(allowed)) {
          parts[cells[i].key] = false;
          const j = assign[i];
          assign[i] = -1;
          if (j >= 0) matchOfExpected[j] = -1;
        }
      }
      // błędnym komórkom pokaż oczekiwane odpowiedzi, których uczeń nie użył
      const unused = cells.filter((_, j) => matchOfExpected[j] < 0);
      cells.forEach((c, i) => {
        if (assign[i] >= 0) solution[c.key] = cells[assign[i]].answers.join(' / ');
        else solution[c.key] = (unused.shift() || c).answers.join(' / ');
      });
    }
  }
  return { correct: blanks.length > 0 && Object.values(parts).every(Boolean), parts, solution: { cells: solution } };
}

/* ---------- Koło ratunkowe ----------
 * Zwraca { ok: true, assist } – gotowe fragmenty odpowiedzi (zablokowane w widoku ucznia),
 * albo { ok: false, reason }, gdy w tym rodzaju pytania koło nie ma zastosowania.
 */
export const NO_LIFELINE = 'Na to pytanie nie można użyć koła ratunkowego.';
export function assist(q, key, view) {
  return withRng(null, () => assistInner(q, key, view));
}
function assistInner(q, key, view) {
  const no = { ok: false, reason: NO_LIFELINE };
  switch (q.type) {
    case 'single': {
      const wrong = key.ids.filter((_, i) => i !== q.correct);
      return { ok: true, assist: { remove: sample(wrong, 2) }, note: 'Pół na pół – dwie błędne odpowiedzi zniknęły.' };
    }
    case 'multi': {
      const wrong = key.ids.filter((_, i) => !q.options[i].correct);
      if (!wrong.length) return no;
      return { ok: true, assist: { remove: sample(wrong, Math.max(1, Math.floor(wrong.length / 2))) }, note: 'Część błędnych odpowiedzi zniknęła.' };
    }
    case 'truefalse': {
      const idx = sample(q.statements.map((_, i) => i), share75(q.statements.length));
      return { ok: true, assist: { set: Object.fromEntries(idx.map((i) => [i, q.statements[i].answer])) }, note: 'Część zdań została oceniona za Ciebie.' };
    }
    case 'open': {
      const series = seriesOf(q).filter((x) => x.length);
      const max = wordBound(q.maxWords).value;
      if (series.length !== 1 || !max || max > 3) return no;
      return { ok: true, assist: { text: series[0][0] }, note: 'Koło ratunkowe wpisało odpowiedź.' };
    }
    case 'match': {
      const idx = sample(q.pairs.map((_, i) => i), share75(q.pairs.length));
      return { ok: true, assist: { links: Object.fromEntries(idx.map((i) => [`L${i}`, key.right[i]])) }, note: 'Część par została połączona za Ciebie.' };
    }
    case 'order_words': {
      const words = sentenceWords(q.sentence);
      const k = share75(words.length);
      const free = Object.entries(key.tiles);
      const prefix = [];
      for (const w of words.slice(0, k)) {
        const i = free.findIndex(([, t]) => norm(t) === norm(w));
        if (i < 0) break;
        prefix.push(free[i][0]); free.splice(i, 1);
      }
      if (!prefix.length) return no;
      return { ok: true, assist: { prefix }, note: 'Początek zdania jest już ułożony.' };
    }
    case 'timeline': {
      const idx = sample(key.ids.map((_, i) => i), share75(key.ids.length));
      return { ok: true, assist: { fixed: idx.map((i) => ({ id: key.ids[i], index: i })) }, note: 'Część elementów stoi już na swoich miejscach.' };
    }
    case 'cloze': {
      const gaps = parseCloze(q.text, 'open').segments.filter((s) => s.t === 'gap');
      const idx = sample(gaps.map((_, i) => i), share75(gaps.length));
      return { ok: true, assist: { gaps: Object.fromEntries(idx.map((i) => [i, gaps[i].answers[0]])) }, note: 'Część luk została uzupełniona.' };
    }
    case 'cloze_choice': {
      const idx = sample(key.gaps.map((_, i) => i), share75(key.gaps.length));
      return { ok: true, assist: { gaps: Object.fromEntries(idx.map((i) => [i, key.gaps[i][0]])) }, note: 'Część luk została uzupełniona.' };
    }
    case 'table': {
      const blanks = tableBlanks(q.table);
      const chosen = sample(blanks, share75(blanks.length));
      const usedInGroup = {};
      const cells = {};
      for (const b of chosen) {
        let val = b.answers[0];
        if (b.g && q.table.groupRepeat?.[b.g] !== true) {
          // w grupie bez powtórzeń każda podpowiedź musi być inna
          const used = (usedInGroup[b.g] ||= new Set());
          val = b.answers.find((x) => !used.has(fold(norm(x)))) ?? b.answers[0];
          used.add(fold(norm(val)));
        }
        cells[b.key] = val;
      }
      return { ok: true, assist: { cells }, note: 'Tabela została w większości uzupełniona.' };
    }
    case 'categorize': {
      const ids = Object.keys(key.items);
      const pick = sample(ids, share75(ids.length));
      return { ok: true, assist: { placement: Object.fromEntries(pick.map((id) => [id, key.items[id]])) }, note: 'Większość słów trafiła już do kategorii.' };
    }
    case 'listen': {
      const w = clean(q.phrase).split(' ');
      if (w.length < 2) return no;
      return { ok: true, assist: { text: w.slice(0, share75(w.length)).join(' ') }, note: 'Początek jest już zapisany – dopisz resztę.' };
    }
    case 'image_labels': {
      const idx = sample(q.points.map((_, i) => i), share75(q.points.length));
      return { ok: true, assist: { placement: Object.fromEntries(idx.map((i) => [i, key.labels[i]])) }, note: 'Większość punktów jest już podpisana.' };
    }
    default: return no;
  }
}
