// Wspólne reguły testów EDUKRO – używane przez edytor (podpowiedzi na żywo)
// i przez serwer (blokada publikacji niekompletnych pytań). Bez DOM, bez zależności.

export const LIMITS = {
  title: 120, summary: 400, prompt: 1200, text: 300, hint: 500, explanation: 1200, passage: 6000,
  questions: 100, options: 8, statements: 5, keywords: 10, pairs: 6, timeline: 8, subQuestions: 5,
  categories: 6, categoryItems: 30, points: 26, tableDim: 12, distractors: 10, clozeText: 3000,
  series: 5, seriesWords: 15, seriesText: 400, sample: 1200, words: 300, qCategories: 20, qCategoryName: 60,
};

export const TYPES = [
  { key: 'single', label: 'Jedna poprawna (A–D)', desc: 'Cztery odpowiedzi, uczeń wybiera jedną poprawną.', prompt: '' },
  { key: 'multi', label: 'Wszystkie poprawne', desc: 'Kilka odpowiedzi, uczeń zaznacza wszystkie poprawne.', prompt: '' },
  { key: 'truefalse', label: 'Prawda czy fałsz', desc: 'Seria 3–5 zdań – przy każdym uczeń wybiera prawdę albo fałsz.', prompt: 'Oceń, czy zdania są prawdziwe.' },
  { key: 'open', label: 'Odpowiedź pisemna', desc: 'Uczeń pisze odpowiedź własnymi słowami. EDUKRO sprawdza ją po seriach słów kluczowych – uczeń nie wie, jakich.', prompt: '' },
  { key: 'number', label: 'Odpowiedź liczbowa', desc: 'Uczeń wpisuje liczbę.', prompt: '' },
  { key: 'match', label: 'Połącz w pary', desc: 'Do 6 par – uczeń łączy linią elementy z dwóch kolumn.', prompt: 'Połącz w pary.' },
  { key: 'order_words', label: 'Ułóż zdanie', desc: 'Rozsypane słowa (także zbędne) – uczeń układa z nich zdanie.', prompt: 'Ułóż zdanie z rozsypanych słów.' },
  { key: 'timeline', label: 'Ułóż w kolejności', desc: 'Uczeń ustawia elementy w kolejności, która ma sens.', prompt: '' },
  { key: 'cloze', label: 'Uzupełnij zdanie – wpisz', desc: 'Zdanie z lukami, uczeń wpisuje brakujące słowa.', prompt: 'Uzupełnij luki.' },
  { key: 'cloze_choice', label: 'Uzupełnij zdanie – wybierz', desc: 'Zdanie z lukami, uczeń wybiera słowo z listy.', prompt: 'Wybierz właściwe słowa.' },
  { key: 'table', label: 'Uzupełnij tabelę', desc: 'Gotowa tabela z ukrytymi komórkami do wpisania.', prompt: 'Uzupełnij tabelę.' },
  { key: 'categorize', label: 'Przeciągnij do kategorii', desc: 'Uczeń rozdziela słowa do właściwych kategorii.', prompt: 'Przeciągnij słowa do właściwych kategorii.' },
  { key: 'image_labels', label: 'Podpisz obrazek', desc: 'Punkty na obrazku – uczeń przeciąga do nich nazwy.', prompt: 'Przeciągnij nazwy do właściwych miejsc na obrazku.' },
  { key: 'data', label: 'Przeczytaj i odpowiedz', desc: 'Uczeń czyta tekst, który potem znika, i odpowiada pisemnie.', prompt: 'Przeczytaj uważnie tekst. Po kliknięciu „Dalej” zniknie i odpowiesz na pytania.' },
  { key: 'listen', label: 'Zadanie na słuch', desc: 'Lektor czyta słowo albo zdanie (także po angielsku czy niemiecku), a uczeń zapisuje, co usłyszał.', prompt: 'Posłuchaj lektora i zapisz, co mówi.' },
];
/** Języki lektora w zadaniach na słuch i „Do wymowy”. */
export const SPEECH_LANGS = [
  ['pl-PL', 'polski'], ['en-GB', 'angielski (brytyjski)'], ['en-US', 'angielski (amerykański)'], ['de-DE', 'niemiecki'],
  ['fr-FR', 'francuski'], ['es-ES', 'hiszpański'], ['it-IT', 'włoski'], ['ru-RU', 'rosyjski'],
];
export const SPEECH_VOICES = ['', 'standard', 'kobieta', 'mlody']; // '' = głos wybrany przez ucznia
/** Tekst dla lektora nie jest wysyłany wprost (uczeń nie podejrzy go w przeglądarce jednym kliknięciem). */
export function hideSpeech(text, seed = 'edukro') {
  const k = [...String(seed)].map((c) => c.charCodeAt(0));
  const bytes = [...new TextEncoder().encode(String(text))].map((b, i) => b ^ k[i % k.length] ^ (i * 7 & 255));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function showSpeech(hex, seed = 'edukro') {
  const k = [...String(seed)].map((c) => c.charCodeAt(0));
  const bytes = (String(hex).match(/../g) || []).map((x, i) => parseInt(x, 16) ^ k[i % k.length] ^ (i * 7 & 255));
  return new TextDecoder().decode(new Uint8Array(bytes));
}
export const TYPE = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export const DEFAULT_SETTINGS = {
  maxMistakes: 3,
  defaultTime: '1.00',
  spelling: true,
  shuffleQuestions: false,
  shuffleAnswers: true,
  drawCount: 0,            // 0 = uczeń dostaje wszystkie pytania; N = losowe N pytań z puli
  categories: [],          // [{ id, name }] – kategorie (działy) pytań
  deadline: null,          // sprawdzian: termin (ms od 1970), po którym nie można go rozwiązać
  expiresAt: null,         // test tymczasowy (nauczający/egzaminacyjny): po tym czasie znika z listy ucznia
  reward: null,            // nagroda: { type: 'item', item } albo { type: 'promo', item, off, hours }
  rewardMinGrade: 4,       // sprawdzian: od jakiej oceny jest nagroda
  gradeScale: [30, 50, 70, 86, 96], // sprawdzian: minimalny % na ocenę 2, 3, 4, 5, 6
  points: { examFirst: 100, examRepeat: 10, teachingFirst: 20 },
};

export const RULES = {
  examFailCooldownMin: 20, examRepeatDays: 7,
  quizMaxAttempts: 3, quizMinQuestions: 20,
  gradePoints: [1, 5, 12, 22, 35, 50], // punkty za ocenę 1…6 ze sprawdzianu (liczy się najlepsza ocena)
  weakCategoryPct: 60,                 // poniżej tego % sprawdzian zaleca powtórkę kategorii
};

export const KINDS_TEST = ['teaching_test', 'exam_test', 'quiz'];
export const GRADE_NAMES = ['niedostateczny', 'dopuszczający', 'dostateczny', 'dobry', 'bardzo dobry', 'celujący'];

/** Ocena 1–6 na podstawie procentu poprawnych odpowiedzi i progów skali. */
export function gradeFor(pct, scale = DEFAULT_SETTINGS.gradeScale) {
  let g = 1;
  (scale || DEFAULT_SETTINGS.gradeScale).forEach((min, i) => { if (pct >= min) g = i + 2; });
  return g;
}

/** Ile pytań faktycznie dostaje uczeń (losowanie z puli). */
export function effectiveCount(doc) {
  const n = (doc.questions || []).length;
  const d = Number(doc.settings?.drawCount) || 0;
  return d > 0 ? Math.min(d, n) : n;
}

/* ---------- Drobne narzędzia ---------- */
export const clean = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
export const isBlank = (s) => !clean(s);
const uniq = (arr) => new Set(arr).size === arr.length;
const lower = (s) => clean(s).toLocaleLowerCase('pl-PL');
const quote = (s) => `„${s}”`;

/** „a / b / c” → ['a','b','c'] (puste części są pomijane). */
export function parseSlash(raw) {
  return String(raw ?? '').split('/').map(clean).filter(Boolean);
}

export function colName(c) { return String.fromCharCode(65 + c); }
export function cellName(r, c) { return `${colName(c)}${r + 1}`; }

/* ---------- Komenda: czas ---------- */
/** Czas w minutach: „2” = 2 min, „2.30” = 2 min 30 s, „0.45” = 45 s (także 2:30 i 2,30). */
export function parseTime(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, empty: true, seconds: null };
  const m = /^(\d{1,3})(?:[.:,](\d+))?$/.exec(s);
  if (!m) return { ok: false, error: `Nie rozumiem zapisu czasu ${quote(s)}. Wpisz minuty, np. 2, albo minuty i sekundy po kropce, np. 2.30.` };
  if (m[2] !== undefined && m[2].length !== 2) {
    return { ok: false, error: `Sekundy wpisz dwiema cyframi – np. ${m[1]}.05 (${m[1]} min 5 s) albo ${m[1]}.50 (${m[1]} min 50 s).` };
  }
  const min = +m[1], sec = m[2] === undefined ? 0 : +m[2];
  if (sec > 59) return { ok: false, error: `Sekund może być najwyżej 59 (wpisano ${sec}).` };
  const seconds = min * 60 + sec;
  if (seconds < 5) return { ok: false, error: 'Najkrótszy czas to 5 sekund (0.05).' };
  if (seconds > 60 * 60) return { ok: false, error: 'Najdłuższy czas na pytanie to 60 minut.' };
  return { ok: true, seconds, pretty: formatSeconds(seconds) };
}
export function formatSeconds(t) {
  const m = Math.floor(t / 60), s = t % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/* ---------- Komenda: luki w zdaniu ---------- */
/**
 * mode 'open'   – luki w nawiasach okrągłych: „Drzewo to (roślina).”, alternatywy przez „/”.
 * mode 'choice' – luki w nawiasach kwadratowych: „W nocy jest [ciemno/jasno].”, pierwsza = poprawna.
 * Zwykły nawias: poprzedź go ukośnikiem wstecznym, np. \( lub \[.
 */
export function parseCloze(raw, mode = 'open') {
  const text = String(raw ?? '');
  const [O, C] = mode === 'choice' ? ['[', ']'] : ['(', ')'];
  const segments = [];
  const errors = [];
  const warnings = [];
  let buf = '', inside = false, gapBuf = '', gapStart = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && (text[i + 1] === O || text[i + 1] === C)) {
      if (inside) gapBuf += text[i + 1]; else buf += text[i + 1];
      i++; continue;
    }
    if (ch === O) {
      if (inside) { errors.push(`Nawias ${O} otwarty wewnątrz innego nawiasu (znak ${i + 1}). Zamknij poprzednią lukę.`); continue; }
      inside = true; gapBuf = ''; gapStart = i;
      if (buf) segments.push({ t: 'text', v: buf });
      buf = '';
      continue;
    }
    if (ch === C) {
      if (!inside) { errors.push(`Nawias ${C} zamknięty bez otwarcia (znak ${i + 1}). Jeśli to zwykły nawias, napisz \\${C}.`); buf += ch; continue; }
      inside = false;
      const answers = parseSlash(gapBuf);
      const n = segments.filter((x) => x.t === 'gap').length + 1;
      if (!answers.length) errors.push(`Luka nr ${n} jest pusta – wpisz w nawiasie ${mode === 'choice' ? 'odpowiedzi' : 'poprawne słowo'}.`);
      if (mode === 'choice') {
        if (answers.length > 4) errors.push(`Luka nr ${n}: najwyżej 4 odpowiedzi do wyboru (jest ${answers.length}).`);
        if (answers.length === 1) warnings.push(`Luka nr ${n} ma tylko jedną odpowiedź – uczeń nie będzie miał wyboru. Dopisz błędne odpowiedzi po ukośniku.`);
      }
      if (!uniq(answers.map(lower))) errors.push(`Luka nr ${n}: odpowiedzi się powtarzają.`);
      segments.push({ t: 'gap', answers, raw: gapBuf });
      continue;
    }
    if (inside) gapBuf += ch; else buf += ch;
  }
  if (inside) {
    errors.push(`Brakuje nawiasu zamykającego ${C} dla luki zaczynającej się na znaku ${gapStart + 1}.`);
    buf = O + gapBuf;
  }
  if (buf) segments.push({ t: 'text', v: buf });
  const gaps = segments.filter((x) => x.t === 'gap');
  if (!gaps.length && !errors.length) {
    const other = mode === 'choice' ? /\([^)]+\)/ : /\[[^\]]+\]/;
    errors.push(mode === 'choice'
      ? 'Nie ma żadnej luki. Odpowiedzi do wyboru wpisz w nawiasie kwadratowym, np. W nocy jest [ciemno/jasno].'
      : 'Nie ma żadnej luki. Poprawne słowo wpisz w nawiasie okrągłym, np. Drzewo to (roślina).');
    if (other.test(text)) warnings.push(mode === 'choice'
      ? 'Użyto nawiasów okrągłych ( ). W tym rodzaju pytania luki zaznacza się nawiasem kwadratowym [ ].'
      : 'Użyto nawiasów kwadratowych [ ]. W tym rodzaju pytania luki zaznacza się nawiasem okrągłym ( ).');
  }
  return { segments, gaps: gaps.length, errors, warnings };
}

/** Tokeny zdania do układania (interpunkcja zostaje przy słowie). */
export function sentenceWords(s) { return clean(s).split(' ').filter(Boolean); }

/* ---------- Puste pytanie wybranego rodzaju ---------- */
let seq = 0;
export function newId() {
  seq = (seq + 1) % 1e6;
  return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7) + seq.toString(36);
}

export function emptyTable(rows = 3, cols = 3) {
  return {
    rows, cols, headerRow: true, headerCol: false,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ t: '', s: 'show', lock: false, g: '' }))),
    groupRepeat: {},
  };
}

export function emptyQuestion(type = null) {
  const base = { id: newId(), type, prompt: type ? TYPE[type].prompt : '', image: null, hint: '', explanation: '', time: '', cat: '' };
  switch (type) {
    case 'single': return { ...base, options: ['', '', '', ''], correct: null };
    case 'multi': return { ...base, options: [{ text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }] };
    case 'truefalse': return { ...base, statements: [0, 1, 2].map(() => ({ text: '', answer: null })) };
    case 'open': return { ...base, ...emptyOpen() };
    case 'number': return { ...base, value: '', tolerance: '', unit: '' };
    case 'match': return { ...base, pairs: [0, 1, 2].map(() => ({ left: '', right: '' })) };
    case 'order_words': return { ...base, sentence: '', distractors: '' };
    case 'timeline': return { ...base, items: ['', '', ''] };
    case 'cloze': return { ...base, text: '' };
    case 'cloze_choice': return { ...base, text: '' };
    case 'table': return { ...base, table: emptyTable(3, 3) };
    case 'categorize': return { ...base, categories: [{ name: '', items: '' }, { name: '', items: '' }] };
    case 'image_labels': return { ...base, diagram: null, points: [], distractors: '' };
    case 'data': return { ...base, passage: '', questions: [{ prompt: '', ...emptyOpen() }] };
    case 'listen': return { ...base, phrase: '', lang: 'en-GB', voice: '', accept: '', exact: true };
    default: return base;
  }
}

export const emptyOpen = () => ({ series: [''], minWords: '', maxWords: '', sample: '' });

/**
 * Starszy zapis pytania pisemnego (lista słów kluczowych + „ile musi się pojawić”)
 * zamieniamy na serie: każda seria to słowa oddzielone ukośnikiem, z każdej serii uczeń musi użyć jednego.
 */
export function upgradeOpen(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s.series)) return s;
  const { keywords, minKeywords, wordLimit, ...rest } = s;
  const kw = (Array.isArray(keywords) ? keywords : []).map(clean).filter(Boolean);
  const need = Number(minKeywords) || 1;
  const series = !kw.length ? [''] : need > 1 && need >= kw.length ? kw : [kw.join(' / ')];
  return { ...rest, series, minWords: '', maxWords: wordLimit ? String(wordLimit) : '', sample: rest.sample || '' };
}
export function upgradeQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  if (q.cat === undefined) q = { ...q, cat: '' };
  if (q.type === 'open') return upgradeOpen(q);
  if (q.type === 'data' && Array.isArray(q.questions)) return { ...q, questions: q.questions.map(upgradeOpen) };
  return q;
}

/** Przeniesienie wspólnej treści przy zmianie rodzaju pytania. */
export function changeType(q, type) {
  const next = emptyQuestion(type);
  next.id = q.id;
  for (const k of ['image', 'hint', 'explanation', 'time', 'cat']) next[k] = q[k] ?? next[k];
  if (!isBlank(q.prompt) && q.prompt !== TYPE[q.type]?.prompt) next.prompt = q.prompt;
  return next;
}

/* ---------- Liczby ---------- */
export function parseNumber(raw) {
  const s = String(raw ?? '').replace(/\s+/g, '').replace(',', '.').replace(/[−–]/g, '-');
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Walidacja pytania ---------- */
/**
 * Zwraca { problems, commands }.
 *  problems: [{ level: 'error'|'warn', msg, field, cell?:[r,c], index? }]
 *  commands: [{ field, ok, msg }] – potwierdzenia dla pól z „komendami” (czas, luki, ukośniki).
 */
export function validateQuestion(q, ctx = {}) {
  const P = [];
  const K = [];
  const err = (msg, field, extra = {}) => P.push({ level: 'error', msg, field, ...extra });
  const warn = (msg, field, extra = {}) => P.push({ level: 'warn', msg, field, ...extra });
  if (!q || !q.type || !TYPE[q.type]) { err('Wybierz rodzaj pytania.', 'type'); return { problems: P, commands: K }; }

  if (isBlank(q.prompt)) err('Wpisz treść pytania (polecenie dla ucznia).', 'prompt');

  // czas – komenda
  const t = parseTime(q.time);
  if (!t.ok) { err(t.error, 'time'); K.push({ field: 'time', ok: false, msg: t.error }); }
  else if (!t.empty) K.push({ field: 'time', ok: true, msg: `Komenda napisana poprawnie – czas na to pytanie: ${t.pretty}.` });
  if (ctx.kind === 'exam_test' && t.ok && t.empty && ctx.defaultTimeMissing) {
    err('Test egzaminacyjny wymaga czasu: wpisz czas tego pytania albo domyślny czas w ustawieniach testu.', 'time');
  }
  // kategoria (dział) pytania – w sprawdzianie obowiązkowa
  const cats = ctx.categories || [];
  if (q.cat && cats.length && !cats.some((c) => c.id === q.cat)) err('Wybrana kategoria pytania została usunięta – wybierz inną.', 'cat');
  else if (!q.cat && ctx.kind === 'quiz') err(cats.length ? 'Przypisz pytanie do kategorii (sprawdzian pokazuje uczniowi, które działy ma powtórzyć).' : 'Sprawdzian wymaga kategorii pytań – utwórz je w ustawieniach testu i przypisz do każdego pytania.', 'cat');

  switch (q.type) {
    case 'single': {
      const opts = q.options || [];
      opts.forEach((o, i) => { if (isBlank(o)) err(`Odpowiedź ${'ABCD'[i]} jest pusta.`, 'options', { index: i }); });
      if (q.correct === null || q.correct === undefined || !(q.correct >= 0 && q.correct < 4)) err('Zaznacz, która odpowiedź jest poprawna.', 'options');
      const filled = opts.filter((o) => !isBlank(o)).map(lower);
      if (!uniq(filled)) err('Dwie odpowiedzi mają taką samą treść.', 'options');
      break;
    }
    case 'multi': {
      const opts = q.options || [];
      if (opts.length < 2) err('Dodaj co najmniej 2 odpowiedzi.', 'options');
      opts.forEach((o, i) => { if (isBlank(o.text)) err(`Odpowiedź nr ${i + 1} jest pusta – uzupełnij ją albo usuń.`, 'options', { index: i }); });
      if (!opts.some((o) => o.correct)) err('Zaznacz co najmniej jedną poprawną odpowiedź.', 'options');
      if (!uniq(opts.filter((o) => !isBlank(o.text)).map((o) => lower(o.text)))) err('Dwie odpowiedzi mają taką samą treść.', 'options');
      if (opts.length && opts.every((o) => o.correct)) warn('Wszystkie odpowiedzi są poprawne – upewnij się, że tak ma być.', 'options');
      break;
    }
    case 'truefalse': {
      const st = q.statements || [];
      if (st.length < 3 || st.length > 5) err('Seria prawda/fałsz musi mieć od 3 do 5 zdań.', 'statements');
      st.forEach((s, i) => {
        if (isBlank(s.text)) err(`Zdanie nr ${i + 1} jest puste.`, 'statements', { index: i });
        if (s.answer !== true && s.answer !== false) err(`Przy zdaniu nr ${i + 1} wybierz: prawda czy fałsz.`, 'statements', { index: i });
      });
      break;
    }
    case 'open': checkOpen(q, err, warn, K); break;
    case 'number': {
      if (parseNumber(q.value) === null) err('Wpisz poprawny wynik jako liczbę, np. 12 albo 3,5.', 'value');
      if (!isBlank(q.tolerance)) {
        const tol = parseNumber(q.tolerance);
        if (tol === null || tol < 0) err('Dopuszczalny błąd musi być liczbą nieujemną (np. 0,5) albo pustym polem.', 'tolerance');
      }
      break;
    }
    case 'match': {
      const pairs = q.pairs || [];
      if (pairs.length < 2 || pairs.length > LIMITS.pairs) err(`Dodaj od 2 do ${LIMITS.pairs} par.`, 'pairs');
      pairs.forEach((p, i) => {
        if (isBlank(p.left) || isBlank(p.right)) err(`Para nr ${i + 1} nie jest uzupełniona (obie strony muszą mieć treść).`, 'pairs', { index: i });
      });
      if (!uniq(pairs.filter((p) => !isBlank(p.left)).map((p) => lower(p.left)))) err('Elementy w lewej kolumnie powtarzają się.', 'pairs');
      if (!uniq(pairs.filter((p) => !isBlank(p.right)).map((p) => lower(p.right)))) err('Elementy w prawej kolumnie powtarzają się.', 'pairs');
      break;
    }
    case 'order_words': {
      const words = sentenceWords(q.sentence);
      const extra = parseSlash(q.distractors);
      if (words.length < 2) err('Wpisz zdanie, które uczeń ma ułożyć (co najmniej 2 słowa).', 'sentence');
      if (words.length > 25) err('Zdanie może mieć najwyżej 25 słów.', 'sentence');
      if (extra.length > LIMITS.distractors) err(`Najwyżej ${LIMITS.distractors} zbędnych słów.`, 'distractors');
      if (words.length >= 2) K.push({ field: 'distractors', ok: true, msg: `Komenda napisana poprawnie – zdanie ma ${words.length} słów, zbędnych słów: ${extra.length}.` });
      break;
    }
    case 'timeline': {
      const items = q.items || [];
      if (items.length < 2 || items.length > LIMITS.timeline) err(`Dodaj od 2 do ${LIMITS.timeline} elementów.`, 'items');
      items.forEach((x, i) => { if (isBlank(x)) err(`Element nr ${i + 1} jest pusty.`, 'items', { index: i }); });
      if (!uniq(items.filter((x) => !isBlank(x)).map(lower))) err('Elementy się powtarzają – każdy musi być inny, inaczej kolejność nie będzie jednoznaczna.', 'items');
      break;
    }
    case 'cloze':
    case 'cloze_choice': {
      const mode = q.type === 'cloze' ? 'open' : 'choice';
      const r = parseCloze(q.text, mode);
      if (isBlank(q.text)) { err('Wpisz zdanie z lukami.', 'text'); break; }
      r.errors.forEach((e) => err(e, 'text'));
      r.warnings.forEach((w) => warn(w, 'text'));
      if (!r.errors.length && r.gaps) {
        const g = r.segments.filter((x) => x.t === 'gap');
        K.push({ field: 'text', ok: true, msg: mode === 'open'
          ? `Komenda napisana poprawnie – ${g.length === 1 ? 'znaleziono 1 lukę' : `znaleziono luki: ${g.length}`}: ${g.map((x) => `(${x.answers.join(' / ')})`).join(', ')}.`
          : `Komenda napisana poprawnie – ${g.length === 1 ? '1 luka' : `luki: ${g.length}`}; poprawne: ${g.map((x) => quote(x.answers[0])).join(', ')}.` });
      } else if (r.errors.length) K.push({ field: 'text', ok: false, msg: r.errors[0] });
      break;
    }
    case 'table': checkTable(q.table, err, warn, K); break;
    case 'categorize': {
      const cats = q.categories || [];
      if (cats.length < 2 || cats.length > LIMITS.categories) err(`Dodaj od 2 do ${LIMITS.categories} kategorii.`, 'categories');
      const all = [];
      cats.forEach((c, i) => {
        if (isBlank(c.name)) err(`Kategoria nr ${i + 1} nie ma nazwy.`, 'categories', { index: i });
        const items = parseSlash(c.items);
        if (!items.length) err(`Kategoria ${isBlank(c.name) ? `nr ${i + 1}` : quote(clean(c.name))} nie ma słów – wpisz je oddzielone ukośnikiem /.`, 'categories', { index: i });
        else K.push({ field: `cat${i}`, ok: true, msg: `Komenda napisana poprawnie – ${items.length} ${items.length === 1 ? 'słowo' : items.length < 5 ? 'słowa' : 'słów'}: ${items.join(', ')}.` });
        all.push(...items.map(lower));
      });
      if (!uniq(cats.filter((c) => !isBlank(c.name)).map((c) => lower(c.name)))) err('Nazwy kategorii się powtarzają.', 'categories');
      if (!uniq(all)) err('To samo słowo występuje dwa razy – każde słowo może należeć tylko do jednej kategorii.', 'categories');
      if (all.length > LIMITS.categoryItems) err(`Najwyżej ${LIMITS.categoryItems} słów we wszystkich kategoriach razem.`, 'categories');
      break;
    }
    case 'image_labels': {
      if (!q.diagram) err('Dodaj obrazek, na którym zaznaczysz punkty.', 'diagram');
      const pts = q.points || [];
      if (!pts.length) err('Zaznacz na obrazku co najmniej jeden punkt (przycisk „Zaznacz punkty”).', 'points');
      if (pts.length > LIMITS.points) err(`Najwyżej ${LIMITS.points} punktów.`, 'points');
      pts.forEach((p, i) => { if (isBlank(p.label)) err(`Punkt ${String.fromCharCode(97 + i)}) nie ma nazwy.`, 'points', { index: i }); });
      const labels = pts.filter((p) => !isBlank(p.label)).map((p) => lower(p.label));
      if (!uniq(labels)) err('Nazwy punktów się powtarzają.', 'points');
      const extra = parseSlash(q.distractors).map(lower);
      if (extra.some((x) => labels.includes(x))) err('Zbędna nazwa jest taka sama jak nazwa jednego z punktów.', 'distractors');
      if (extra.length > LIMITS.distractors) err(`Najwyżej ${LIMITS.distractors} zbędnych nazw.`, 'distractors');
      break;
    }
    case 'data': {
      if (isBlank(q.passage)) err('Wpisz tekst (dane), który uczeń przeczyta.', 'passage');
      const qs = q.questions || [];
      if (!qs.length || qs.length > LIMITS.subQuestions) err(`Dodaj od 1 do ${LIMITS.subQuestions} pytań do tekstu.`, 'questions');
      qs.forEach((s, i) => {
        if (isBlank(s.prompt)) err(`Pytanie do tekstu nr ${i + 1} jest puste.`, 'questions', { index: i });
        const pre = (m) => `Pytanie do tekstu nr ${i + 1}: ${m.charAt(0).toLowerCase()}${m.slice(1)}`;
        checkOpen(s, (m, f, ex) => err(pre(m), 'questions', { index: i, ...ex }), (m, f, ex) => warn(pre(m), 'questions', { index: i, ...ex }), null);
      });
      break;
    }
    case 'listen': {
      if (isBlank(q.phrase)) err('Wpisz, co ma powiedzieć lektor (słowo albo zdanie).', 'phrase');
      else if (clean(q.phrase).length > LIMITS.text) err(`Tekst dla lektora może mieć najwyżej ${LIMITS.text} znaków.`, 'phrase');
      if (!SPEECH_LANGS.some(([id]) => id === q.lang)) err('Wybierz język lektora.', 'lang');
      const alt = parseSlash(q.accept);
      if (alt.length > LIMITS.distractors) err(`Najwyżej ${LIMITS.distractors} innych poprawnych zapisów.`, 'accept');
      if (!isBlank(q.phrase)) K.push({ field: 'accept', ok: true, msg: alt.length ? `Uczeń zaliczy: „${clean(q.phrase)}” albo ${alt.map(quote).join(', ')}.` : `Uczeń zaliczy: „${clean(q.phrase)}” (wielkość liter i kropki na końcu nie mają znaczenia).` });
      break;
    }
    default: break;
  }
  return { problems: P, commands: K };
}

/** Liczba słów w polu „minimum / maksimum słów” (puste = brak ograniczenia). */
export function wordBound(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, value: 0 };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.words) return { ok: false, value: 0 };
  return { ok: true, value: n };
}

/** Serie słów kluczowych: z KAŻDEJ serii uczeń musi użyć co najmniej jednego słowa (kolejność dowolna). */
export function seriesOf(q) { return (q.series || []).map((s) => parseSlash(s)); }

function checkOpen(q, err, warn, K) {
  const series = q.series || [];
  const parsed = series.map((s) => parseSlash(s));
  if (!series.length) err('Dodaj co najmniej jedną serię słów kluczowych.', 'series');
  if (series.length > LIMITS.series) err(`Najwyżej ${LIMITS.series} serii słów kluczowych.`, 'series');
  parsed.forEach((words, i) => {
    if (!words.length) { err(`Seria ${i + 1} jest pusta – wpisz słowa oddzielone ukośnikiem / albo usuń tę serię.`, 'series', { index: i }); if (K) K.push({ field: `series${i}`, ok: false, msg: 'Wpisz słowa tej serii oddzielone ukośnikiem, np. ser / białko / mleko.' }); return; }
    if (words.length > LIMITS.seriesWords) err(`Seria ${i + 1}: najwyżej ${LIMITS.seriesWords} słów.`, 'series', { index: i });
    if (!uniq(words.map(lower))) err(`Seria ${i + 1}: słowa się powtarzają.`, 'series', { index: i });
    else if (K) K.push({ field: `series${i}`, ok: true, msg: `Komenda napisana poprawnie – w odpowiedzi musi być jedno z ${words.length === 1 ? 'tego słowa' : `${words.length} słów`}: ${words.join(', ')}.` });
  });
  const seen = new Map();
  parsed.forEach((words, i) => words.forEach((w) => {
    const k = lower(w);
    if (seen.has(k) && seen.get(k) !== i) warn(`Słowo ${quote(w)} jest w serii ${seen.get(k) + 1} i ${i + 1} – jedno słowo zaliczy wtedy obie serie.`, 'series');
    else seen.set(k, i);
  }));
  const min = wordBound(q.minWords), max = wordBound(q.maxWords);
  if (!min.ok) err(`Minimalna liczba słów musi być liczbą od 1 do ${LIMITS.words} (albo puste pole).`, 'minWords');
  if (!max.ok) err(`Maksymalna liczba słów musi być liczbą od 1 do ${LIMITS.words} (albo puste pole – bez limitu).`, 'maxWords');
  if (min.ok && max.ok && min.value && max.value && min.value > max.value) err(`Minimum słów (${min.value}) jest większe niż maksimum (${max.value}).`, 'minWords');
  if (min.ok && max.ok && max.value && parsed.length > max.value) err(`Serii słów kluczowych jest ${parsed.length}, a odpowiedź może mieć najwyżej ${max.value} słów – uczeń nie zmieści wszystkich.`, 'maxWords');
}

/** Reguły tabeli (pkt 8 specyfikacji). Każdy problem wskazuje komórkę do poprawy. */
export function checkTable(tb, err, warn, K) {
  if (!tb || !Array.isArray(tb.cells)) { err('Utwórz tabelę – ustaw liczbę wierszy i kolumn.', 'table'); return; }
  const { rows, cols } = tb;
  if (!(rows >= 1 && rows <= LIMITS.tableDim && cols >= 1 && cols <= LIMITS.tableDim)) {
    err(`Tabela musi mieć od 1 do ${LIMITS.tableDim} wierszy i kolumn.`, 'table'); return;
  }
  if (tb.cells.length !== rows || tb.cells.some((r) => !Array.isArray(r) || r.length !== cols)) { err('Wymiary tabeli są niespójne – utwórz ją ponownie.', 'table'); return; }
  let blanks = 0;
  const groups = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = tb.cells[r][c];
      const name = cellName(r, c);
      const isHeader = (tb.headerRow && r === 0) || (tb.headerCol && c === 0);
      if (x.s === 'blank') {
        blanks++;
        const answers = parseSlash(x.t);
        if (!answers.length) err(`Komórka ${name} jest luką, ale nie ma poprawnej odpowiedzi. Wpisz ją (kilka możliwych – oddziel ukośnikiem /).`, 'table', { cell: [r, c] });
        if (x.lock && x.g) err(`Komórka ${name} ma kłódkę i jednocześnie należy do grupy ${x.g}. Kłódka oznacza odpowiedź przypisaną tylko do tej komórki – usuń grupę albo kłódkę.`, 'table', { cell: [r, c] });
        if (x.g) (groups[x.g] ||= []).push([r, c]);
        if (!uniq(answers.map(lower))) warn(`Komórka ${name}: odpowiedzi po ukośniku się powtarzają.`, 'table', { cell: [r, c] });
      } else if (x.s === 'show') {
        if (x.g || x.lock) err(`Komórka ${name} jest widoczna, ale ma ustawioną grupę lub kłódkę – te ustawienia dotyczą tylko luk.`, 'table', { cell: [r, c] });
        if (isBlank(x.t) && !(r === 0 && c === 0 && tb.headerRow && tb.headerCol) && !isHeader) {
          warn(`Komórka ${name} jest pusta i widoczna. Wpisz treść, zrób z niej lukę albo usuń okienko.`, 'table', { cell: [r, c] });
        }
      }
    }
  }
  if (!blanks) err('Zaznacz co najmniej jedną komórkę do uzupełnienia (przycisk „Zostaw puste”).', 'table');
  for (const [g, cells] of Object.entries(groups)) {
    if (cells.length < 2) {
      const [r, c] = cells[0];
      err(`Grupa ${g} ma tylko jedną lukę (${cellName(r, c)}). Grupa łączy co najmniej 2 luki – dodaj luki do grupy albo usuń grupę.`, 'table', { cell: [r, c] });
    }
  }
  if (blanks && K) K.push({ field: 'table', ok: true, msg: `Luki do uzupełnienia: ${blanks}${Object.keys(groups).length ? `, grupy: ${Object.keys(groups).sort().join(', ')}` : ''}.` });
}

/* ---------- Walidacja całego testu ---------- */
export function validateTest(doc) {
  const problems = [];
  const s = doc.settings || {};
  const P = (msg, field, level = 'error') => problems.push({ level, msg, where: 'settings', field });
  if (isBlank(doc.title)) P('Test nie ma nazwy.', 'title');
  const exam = doc.kind === 'exam_test';
  const quiz = doc.kind === 'quiz';
  const dt = parseTime(s.defaultTime);
  if (exam) {
    const mm = Number(s.maxMistakes);
    if (!Number.isInteger(mm) || mm < 0 || mm > 50) P('Maksymalna liczba błędów musi być liczbą od 0 do 50.', 'maxMistakes');
    if (!dt.ok) P(`Domyślny czas: ${dt.error}`, 'defaultTime');
  }
  const qs = doc.questions || [];
  const cats = Array.isArray(s.categories) ? s.categories : [];
  cats.forEach((c, i) => { if (isBlank(c.name)) P(`Kategoria nr ${i + 1} nie ma nazwy.`, 'categories'); });
  if (!uniq(cats.filter((c) => !isBlank(c.name)).map((c) => lower(c.name)))) P('Nazwy kategorii pytań się powtarzają.', 'categories');
  if (!qs.length) P('Test nie ma żadnego pytania.', 'questions');
  if (qs.length > LIMITS.questions) P(`Test może mieć najwyżej ${LIMITS.questions} pytań.`, 'questions');
  const draw = Number(s.drawCount) || 0;
  if (draw && (!Number.isInteger(draw) || draw < 1)) P('Liczba losowanych pytań musi być liczbą całkowitą.', 'drawCount');
  else if (draw && draw > qs.length) P(`Uczeń ma dostać ${draw} losowych pytań, a w puli jest tylko ${qs.length}. Dodaj pytania albo zmniejsz liczbę losowanych.`, 'drawCount');
  if (quiz) {
    const n = effectiveCount(doc);
    if (n < RULES.quizMinQuestions) P(`Sprawdzian musi mieć co najmniej ${RULES.quizMinQuestions} pytań (uczeń dostaje teraz ${n}).`, 'questions');
    if (!cats.length) P('Sprawdzian wymaga kategorii pytań (działów) – dodaj je w „Kategorie pytań”.', 'categories');
    if (!s.deadline || !Number.isFinite(Number(s.deadline))) P('Ustaw termin sprawdzianu – po nim uczniowie nie będą mogli go rozwiązać.', 'deadline');
    const sc = s.gradeScale || [];
    if (sc.length !== 5 || sc.some((x, i) => !Number.isFinite(Number(x)) || x < 1 || x > 100 || (i && Number(x) <= Number(sc[i - 1])))) {
      P('Progi ocen muszą rosnąć (np. 30, 50, 70, 86, 96 %).', 'gradeScale');
    }
  }
  qs.forEach((q, i) => {
    const r = validateQuestion(q, { kind: doc.kind, categories: cats, defaultTimeMissing: exam && (dt.empty || !dt.ok) });
    for (const p of r.problems) problems.push({ ...p, where: 'question', q: i, qid: q.id });
  });
  return { problems, errors: problems.filter((p) => p.level === 'error').length };
}

/** Status pytania do listy w edytorze: 'empty' | 'error' | 'warn' | 'ok'. */
export function questionStatus(q, ctx) {
  if (!q.type) return 'empty';
  const { problems } = validateQuestion(q, ctx);
  if (problems.some((p) => p.level === 'error')) return 'error';
  if (problems.length) return 'warn';
  return 'ok';
}
