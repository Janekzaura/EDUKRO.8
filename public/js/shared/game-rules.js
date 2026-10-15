// Gry EDUKRO (0.7): „Saper” (rozbrajanie bomby) i „Hammer Game” (młotek).
// Wspólne dla edytora (podpowiedzi na żywo) i serwera (czyszczenie danych, blokada publikacji). Bez DOM.
import { emptyQuestion, validateQuestion, newId, clean, isBlank } from './quiz-rules.js';

export const GAME_TYPES = [
  { key: 'saper', label: 'Saper', icon: 'bomb',
    desc: 'Rozbrój bombę, zanim wybuchnie: przecinanie kabli, palnik, trojan, krzyżówka z kodem, usuwanie plików, a na koniec katana. Jeden błąd = wybuch!' },
  { key: 'hammer', label: 'Hammer Game', icon: 'hammer',
    desc: 'Gra na spryt i szybkość: młotkiem zatwierdzasz kartki, łapiesz żuki, łączysz pary, rozwiązujesz test i stemplujesz APPROVED / DECLINED.' },
];
export const GAME_TYPE = Object.fromEntries(GAME_TYPES.map((t) => [t.key, t]));

export const GL = {
  title: 120, summary: 400, prompt: 400, option: 120, word: 24, clue: 200, file: 40,
  events: 12, katanaQ: 12, cards: 30, bugQ: 5, bugDecoys: 3, pairs: 6, testQ: 6, approve: 10, grid: 12,
  minTime: 60, maxTime: 1800, maxPoints: 60,
};
export const PASS_PCT = 55; // Hammer Game: poniżej 55% – DECLINED

/* ---------- Saper: zdarzenia ---------- */
export const SAPER_EVENTS = [
  { key: 'wire', label: 'Przetnij kabel', icon: 'scissors', desc: 'Pytanie i od 3 do 5 kabli z odpowiedziami. Uczeń przecina kabel z poprawną odpowiedzią.' },
  { key: 'torch', label: 'Palnik', icon: 'flame', desc: 'Uczeń wycina palnikiem otwór w obudowie (rysuje kwadrat), a na blaszce pojawia się pytanie pisemne.' },
  { key: 'trojan', label: 'Programowanie – trojan', icon: 'code', desc: 'Uczeń podłącza komputer i układa elementy w kolejności na pionowym kablu, żeby wpuścić wirusa do bomby.' },
  { key: 'crossword', label: 'Krzyżówka i oprogramowanie', icon: 'grid', desc: 'Krzyżówka zdradza kod dostępu. Po wpisaniu kodu uczeń wchodzi do oprogramowania bomby i rozwiązuje 3 zadania: pisemne, tabelę i prawda/fałsz.' },
  { key: 'files', label: 'Usuwanie plików', icon: 'trash', desc: '4 pytania i 16 plików w środku bomby. Uczeń usuwa wszystkie pliki, które NIE są odpowiedzią – zostają tylko 4 poprawne.' },
];
export const SAPER_EVENT = Object.fromEntries(SAPER_EVENTS.map((e) => [e.key, e]));

/* ---------- Hammer Game: etapy ---------- */
export const HAMMER_STAGES = [
  { key: 'cards', label: 'Kartki: TAK / NIE', desc: 'Kartki pojawiają się w losowych miejscach. Uczeń uderza TAK albo NIE (albo właściwą odpowiedź A–D). Seria 5 dobrych = zwolnienie czasu i 5 kartek naraz na 20 sekund.' },
  { key: 'bugs', label: 'Żuki', desc: 'Żuki z odpowiedziami chodzą po ekranie. Uczeń uderza żuka z dobrą odpowiedzią – ten odlatuje, a pytanie się zmienia.' },
  { key: 'pairs', label: 'Połącz w pary', desc: 'Uderz jedną rzecz, potem drugą. Dobra para wybucha i zdrapuje kawałek ekranu – na końcu rozbijasz resztę.' },
  { key: 'test', label: 'Test młotkiem', desc: '6 pytań A–D na jednej kartce. Uderzasz literę, a na końcu dostajesz procent i ocenę.' },
  { key: 'approve', label: 'APPROVED / DECLINED', desc: 'Stwierdzenia: prawdziwe stemplujesz APPROVED, fałszywe – DECLINED. Na końcu podpis i chwila prawdy.' },
];

/* ---------- Puste elementy ---------- */
export const emptyChoice = (n = 4) => ({ id: newId(), kind: 'choice', prompt: '', options: Array.from({ length: n }, () => ''), correct: null });
export const emptyTf = () => ({ id: newId(), kind: 'tf', text: '', answer: null });
const q = (type, extra = {}) => ({ ...emptyQuestion(type), ...extra });

export function emptyEvent(kind) {
  const id = newId();
  switch (kind) {
    case 'wire': return { id, kind, prompt: '', options: ['', '', ''], correct: null };
    case 'torch': return { id, kind, question: q('open') };
    case 'trojan': return { id, kind, question: q('timeline', { items: ['', '', '', ''] }) };
    case 'crossword': return { id, kind, rows: 9, cols: 11, words: [emptyWord(), emptyWord(), emptyWord()], code: [],
      tasks: [q('open'), q('table'), q('truefalse', { prompt: 'Oceń, czy zdania są prawdziwe.' })] };
    case 'files': return { id, kind, questions: [0, 1, 2, 3].map(() => ({ prompt: '', answer: '' })), decoys: Array.from({ length: 12 }, () => '') };
    default: return { id, kind: null };
  }
}
export const emptyWord = () => ({ id: newId(), clue: '', answer: '', cells: [] });

export function emptyGame(type) {
  if (type === 'saper') {
    return { type, time: 300, points: 25, events: [emptyEvent('wire'), emptyEvent('torch'), emptyEvent('files')],
      katana: { questions: [emptyTf(), emptyChoice(), emptyTf(), emptyChoice()] } };
  }
  return { type: 'hammer', points: 25,
    stages: { cards: true, bugs: true, pairs: true, test: true, approve: true },
    cards: Array.from({ length: 10 }, (_, i) => (i % 4 === 3 ? emptyChoice() : emptyTf())),
    bugs: { questions: [0, 1, 2, 3].map(() => ({ id: newId(), prompt: '', answer: '' })), decoys: ['', ''] },
    pairs: [0, 1, 2, 3].map(() => ({ id: newId(), left: '', right: '' })),
    test: Array.from({ length: 6 }, () => emptyChoice()),
    approve: Array.from({ length: 5 }, () => emptyTf()) };
}

/* ---------- Krzyżówka ---------- */
/** Litery odpowiedzi: wielkie, bez spacji i myślników (Ą, Ę… zostają). */
export const letters = (s) => [...String(s ?? '').normalize('NFC').toLocaleUpperCase('pl-PL').replace(/[\s\-–'’.]/g, '')];
export const cellKey = (c) => `${c[0]},${c[1]}`;
/** Mapa komórek → litera (i konflikty). */
export function crosswordMap(ev) {
  const map = new Map(); const conflicts = new Set();
  for (const w of ev.words || []) {
    const L = letters(w.answer);
    (w.cells || []).forEach((c, i) => {
      const k = cellKey(c);
      const ch = L[i] || '';
      if (map.has(k) && ch && map.get(k) && map.get(k) !== ch) conflicts.add(k);
      if (!map.has(k) || !map.get(k)) map.set(k, ch);
    });
  }
  return { map, conflicts };
}
export function crosswordCode(ev) {
  const { map } = crosswordMap(ev);
  return (ev.code || []).map((c) => map.get(cellKey(c)) || '').join('');
}

/* ---------- Walidacja ---------- */
const txtLen = (s) => clean(s).length;
function vChoice(item, where, P, { min = 2, max = 6 } = {}) {
  const err = (msg) => P.push({ level: 'error', msg, where });
  if (isBlank(item.prompt)) err('Wpisz treść pytania.');
  const opts = item.options || [];
  if (opts.length < min || opts.length > max) err(`Potrzeba od ${min} do ${max} odpowiedzi.`);
  if (opts.some(isBlank)) err('Uzupełnij wszystkie odpowiedzi.');
  else if (new Set(opts.map((o) => clean(o).toLocaleLowerCase('pl-PL'))).size !== opts.length) err('Odpowiedzi nie mogą się powtarzać.');
  if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct >= opts.length) err('Zaznacz poprawną odpowiedź.');
}
function vTf(item, where, P) {
  if (isBlank(item.text)) P.push({ level: 'error', msg: 'Wpisz stwierdzenie.', where });
  if (typeof item.answer !== 'boolean') P.push({ level: 'error', msg: 'Wybierz, czy stwierdzenie jest prawdziwe.', where });
}
function vItem(item, where, P, opts) { if (item.kind === 'tf') vTf(item, where, P); else vChoice(item, where, P, opts); }
function vQuestion(qq, where, P, type) {
  if (!qq || qq.type !== type) { P.push({ level: 'error', msg: 'Brakuje pytania.', where }); return; }
  for (const p of validateQuestion(qq, { kind: 'teaching_test' }).problems.filter((x) => x.level === 'error')) P.push({ level: 'error', msg: p.msg, where });
}

/** Zwraca { errors, problems: [{ level, msg, where }] } – where = np. 'ev:3', 'katana', 'cards', 'settings'. */
export function validateGame(doc) {
  const P = [];
  if (!doc || !GAME_TYPE[doc.type]) return { errors: 1, problems: [{ level: 'error', msg: 'Wybierz rodzaj gry.', where: 'settings' }] };
  if (doc.type === 'saper') {
    if (!(doc.time >= GL.minTime && doc.time <= GL.maxTime)) P.push({ level: 'error', msg: 'Czas bomby: od 1 do 30 minut.', where: 'settings' });
    if (!doc.events?.length) P.push({ level: 'error', msg: 'Dodaj co najmniej jedno zdarzenie.', where: 'events' });
    (doc.events || []).forEach((ev, i) => {
      const where = `ev:${i}`;
      const err = (msg) => P.push({ level: 'error', msg, where });
      switch (ev.kind) {
        case 'wire': vChoice(ev, where, P, { min: 3, max: 5 }); break;
        case 'torch': vQuestion(ev.question, where, P, 'open'); break;
        case 'trojan': vQuestion(ev.question, where, P, 'timeline'); break;
        case 'crossword': {
          const words = ev.words || [];
          if (words.length < 2) err('Krzyżówka potrzebuje co najmniej 2 haseł.');
          words.forEach((w, k) => {
            const L = letters(w.answer);
            if (isBlank(w.clue)) err(`Hasło ${k + 1}: wpisz pytanie.`);
            if (L.length < 2) err(`Hasło ${k + 1}: odpowiedź musi mieć co najmniej 2 litery.`);
            else if ((w.cells || []).length !== L.length) err(`Hasło ${k + 1}: zaznacz w siatce ${L.length} pól (zaznaczone: ${(w.cells || []).length}).`);
            if (new Set((w.cells || []).map(cellKey)).size !== (w.cells || []).length) err(`Hasło ${k + 1}: to samo pole zaznaczone dwa razy.`);
          });
          const { conflicts, map } = crosswordMap(ev);
          if (conflicts.size) err('Dwa hasła dzielą pole, ale mają w nim różne litery.');
          if ((ev.code || []).length < 3) err('Zaznacz w krzyżówce co najmniej 3 pola kodu dostępu.');
          else if ((ev.code || []).some((c) => !map.get(cellKey(c)))) err('Pola kodu muszą leżeć na literach haseł.');
          const [t0, t1, t2] = ev.tasks || [];
          vQuestion(t0, where, P, 'open'); vQuestion(t1, where, P, 'table'); vQuestion(t2, where, P, 'truefalse');
          break;
        }
        case 'files': {
          const qs = ev.questions || [];
          if (qs.length !== 4) err('Usuwanie plików: dokładnie 4 pytania.');
          qs.forEach((x, k) => { if (isBlank(x.prompt) || isBlank(x.answer)) err(`Pytanie ${k + 1}: wpisz pytanie i odpowiedź (nazwę pliku).`); });
          if ((ev.decoys || []).length !== 12 || ev.decoys.some(isBlank)) err('Wpisz 12 plików-pułapek (nie są odpowiedzią, ale mają brzmieć sensownie).');
          const all = [...qs.map((x) => x.answer), ...(ev.decoys || [])].filter((x) => !isBlank(x)).map((x) => clean(x).toLocaleLowerCase('pl-PL'));
          if (new Set(all).size !== all.length) err('Nazwy plików nie mogą się powtarzać.');
          break;
        }
        default: err('Wybierz rodzaj zdarzenia.');
      }
    });
    const kq = doc.katana?.questions || [];
    if (kq.length < 2) P.push({ level: 'error', msg: 'Katana: dodaj co najmniej 2 pytania.', where: 'katana' });
    kq.forEach((it) => vItem(it, 'katana', P, { min: 4, max: 4 }));
  } else {
    const st = doc.stages || {};
    if (!HAMMER_STAGES.some((s) => st[s.key])) P.push({ level: 'error', msg: 'Włącz co najmniej jeden etap.', where: 'settings' });
    if (st.cards) {
      if ((doc.cards || []).length < 5) P.push({ level: 'error', msg: 'Kartki: dodaj co najmniej 5 kartek (do serii potrzeba 10).', where: 'cards' });
      else if (doc.cards.length < 10) P.push({ level: 'warn', msg: 'Kartki: przy mniej niż 10 kartkach seria 5 dobrych odpowiedzi może się nie zdarzyć.', where: 'cards' });
      (doc.cards || []).forEach((it) => vItem(it, 'cards', P, { min: 4, max: 4 }));
    }
    if (st.bugs) {
      const bq = doc.bugs?.questions || [];
      if (bq.length < 2) P.push({ level: 'error', msg: 'Żuki: dodaj co najmniej 2 pytania.', where: 'bugs' });
      bq.forEach((x, k) => { if (isBlank(x.prompt) || isBlank(x.answer)) P.push({ level: 'error', msg: `Żuki, pytanie ${k + 1}: wpisz pytanie i odpowiedź.`, where: 'bugs' }); });
      if (!(doc.bugs?.decoys || []).length || doc.bugs.decoys.some(isBlank)) P.push({ level: 'error', msg: 'Żuki: wpisz odpowiedzi-pułapki (żuki, które na końcu odlecą).', where: 'bugs' });
      const all = [...bq.map((x) => x.answer), ...(doc.bugs?.decoys || [])].filter((x) => !isBlank(x)).map((x) => clean(x).toLocaleLowerCase('pl-PL'));
      if (new Set(all).size !== all.length) P.push({ level: 'error', msg: 'Żuki: odpowiedzi nie mogą się powtarzać (każdy żuk ma inną).', where: 'bugs' });
    }
    if (st.pairs) {
      if ((doc.pairs || []).length < 3) P.push({ level: 'error', msg: 'Pary: dodaj co najmniej 3 pary.', where: 'pairs' });
      if ((doc.pairs || []).some((p) => isBlank(p.left) || isBlank(p.right))) P.push({ level: 'error', msg: 'Pary: uzupełnij obie strony każdej pary.', where: 'pairs' });
      const all = (doc.pairs || []).flatMap((p) => [p.left, p.right]).filter((x) => !isBlank(x)).map((x) => clean(x).toLocaleLowerCase('pl-PL'));
      if (new Set(all).size !== all.length) P.push({ level: 'error', msg: 'Pary: elementy nie mogą się powtarzać.', where: 'pairs' });
    }
    if (st.test) {
      if ((doc.test || []).length !== GL.testQ) P.push({ level: 'error', msg: 'Test: dokładnie 6 pytań A–D.', where: 'test' });
      (doc.test || []).forEach((it) => vChoice(it, 'test', P, { min: 4, max: 4 }));
    }
    if (st.approve) {
      if ((doc.approve || []).length < 3) P.push({ level: 'error', msg: 'APPROVED / DECLINED: dodaj co najmniej 3 stwierdzenia.', where: 'approve' });
      (doc.approve || []).forEach((it) => vTf(it, 'approve', P));
    }
  }
  // każdy komunikat raz na miejsce
  const seen = new Set();
  const problems = P.filter((p) => { const k = `${p.where}|${p.msg}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { errors: problems.filter((p) => p.level === 'error').length, problems };
}

/** Ile „punktów kontrolnych” ma gra (do procentu w Hammer Game). */
export function hammerTotal(doc) {
  const st = doc.stages || {};
  return (st.cards ? doc.cards.length : 0) + (st.bugs ? doc.bugs.questions.length : 0) + (st.pairs ? doc.pairs.length : 0)
    + (st.test ? doc.test.length : 0) + (st.approve ? doc.approve.length : 0);
}
export const gameSummary = (doc) => (doc.type === 'saper'
  ? `${doc.events.length} ${doc.events.length === 1 ? 'zdarzenie' : doc.events.length < 5 ? 'zdarzenia' : 'zdarzeń'} · ${Math.round(doc.time / 60)} min`
  : `${HAMMER_STAGES.filter((s) => doc.stages?.[s.key]).length} etapów · ${hammerTotal(doc)} pytań`);
void txtLen;
