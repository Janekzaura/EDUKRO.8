// Wspólne reguły lekcji EDUKRO (edytor + serwer): rodzaje slajdów, komendy, sprawdzanie kompletności.
import { validateQuestion, parseTime, clean, isBlank, newId, emptyQuestion, TYPE, SPEECH_LANGS, SPEECH_VOICES } from './quiz-rules.js';
import { GRADES, SECTIONS, className } from './classes.js';

export const LL = {
  title: 120, summary: 400, slides: 80, blocks: 12, text: 2000, item: 400, listItems: 12, tableDim: 8, cell: 200,
  caption: 200, cards: 20, cardText: 300, gameQuestions: 40, q: 400, a: 200, vbCats: 5, vbPer: 5, vbMinPer: 3,
  wheelQuestions: 40, prompt: 600,
};

export const SLIDE_TYPES = [
  { key: 'title', label: 'Slajd tytułowy', desc: 'Duży tytuł lekcji albo nowego tematu, z podtytułem i obrazkiem.' },
  { key: 'info', label: 'Slajd informacyjny', desc: 'Tytuł, tekst, punkty, tabela i obrazki. Słowa zasłonięte do kliknięcia, tekst pojawiający się na kliknięcie albo po czasie.' },
  { key: 'copy', label: 'Slajd do przepisania', desc: 'Jak informacyjny, ale u góry jest pasek czasu – uruchamiasz go kliknięciem, gdy uczniowie zaczynają pisać.' },
  { key: 'question', label: 'Slajd z pytaniem', desc: 'Pytanie takie jak w testach (15 rodzajów) – klasa odpowiada na tablicy, EDUKRO od razu sprawdza.' },
  { key: 'flashcards', label: 'Fiszki', desc: 'Pojęcie z przodu, wyjaśnienie z tyłu – kliknięcie odwraca kartę. Dobre na powtórkę.' },
  { key: 'brainstorm', label: 'Burza mózgów', desc: 'Pytanie do klasy – w trakcie lekcji wpisujesz pomysły uczniów na kolorowych karteczkach.' },
  { key: 'wheel', label: 'Koło fortuny', desc: 'Koło z imionami uczniów klasy. Wylosowana osoba odpowiada ustnie – za dobrą odpowiedź dostaje punkty.' },
  { key: 'game', label: 'Gra klasowa', desc: 'Drużyny czerwonych i niebieskich: pojedynek na szybkość, kółko i krzyżyk albo Va banque. Wygrana drużyna dostaje punkty.' },
];
export const SLIDE = Object.fromEntries(SLIDE_TYPES.map((t) => [t.key, t]));

export const GAMES = [
  { key: 'duel', label: 'Czerwoni vs Niebiescy', desc: 'Z każdej drużyny losujemy jedną osobę. Po 3 sekundach na tablicy pojawia się pytanie – kto pierwszy odpowie poprawnie, zdobywa punkt dla drużyny. Liczba pytań: nieparzysta, co najmniej 5.' },
  { key: 'tictactoe', label: 'Kółko i krzyżyk', desc: 'Drużyny na zmianę wybierają pole planszy 3×3 i odpowiadają na pytanie. Dobra odpowiedź stawia znak drużyny. Wygrywa trzy znaki w linii – albo więcej pól, gdy plansza się zapełni. Co najmniej 9 pytań.' },
  { key: 'vabanque', label: 'Va banque', desc: 'Plansza z kategoriami i pytaniami za 100–500. Drużyny na zmianę wybierają pytanie, a dobra odpowiedź dodaje jego wartość do wyniku drużyny. Wygrywa większa suma.' },
];
export const GAME = Object.fromEntries(GAMES.map((g) => [g.key, g]));
/** Punkty przyznawane na lekcji (ustala serwer, nie przeglądarka). */
export const AWARD = { wheel: 10, gameWin: 5, gameDraw: 2, lessonStar: 100, schoolStar: 300 };

export const BLOCK_KINDS = [
  { key: 'text', label: 'Tekst' },
  { key: 'list', label: 'Punkty' },
  { key: 'table', label: 'Tabela' },
  { key: 'image', label: 'Obrazek' },
];
export const BLOCK_STYLES = [
  { key: 'normal', label: 'Zwykły' },
  { key: 'important', label: 'Ważne!' },
  { key: 'definition', label: 'Definicja' },
  { key: 'example', label: 'Przykład' },
];
export const APPEAR = [
  { key: 'now', label: 'Od razu' },
  { key: 'click', label: 'Na kliknięcie' },
  { key: 'delay', label: 'Po czasie' },
];

const uniq = (arr) => new Set(arr).size === arr.length;
const lower = (s) => clean(s).toLocaleLowerCase('pl-PL');
const quote = (s) => `„${s}”`;

/* ---------- Wygląd ustawiany w podglądzie lekcji (rozmiar, czcionka, kolor, położenie, kadr, tło) ---------- */
export const LOOK_FONTS = [
  ['', 'Jak w EDUKRO', ''], ['serif', 'Książkowa', "'Pagella', Georgia, serif"], ['sans', 'Prosta', "'Inter', system-ui, sans-serif"],
  ['round', 'Okrągła', "'Poppins', 'Inter', sans-serif"], ['school', 'Elementarz', "'Schola', 'Pagella', serif"], ['geo', 'Geometryczna', "'Adventor', 'Inter', sans-serif"],
  ['type', 'Maszyna do pisania', "'Cursor', monospace"], ['pen', 'Ozdobna (pióro)', "'Chorus', 'Pagella', serif"],
];
export const LOOK_COLORS = [
  ['', 'Domyślny', ''], ['white', 'Biały', '#FFFFFF'], ['amber', 'Bursztyn', '#F2A541'], ['lemon', 'Cytrynowy', '#FFE66D'], ['mint', 'Zielony', '#8DCB6A'],
  ['sky', 'Niebieski', '#76A9F6'], ['violet', 'Fioletowy', '#B39BFF'], ['rose', 'Różowy', '#FF8FB8'], ['red', 'Czerwony', '#F0566E'], ['black', 'Czarny', '#14100A'],
];
// [id, nazwa, kolor tła, jasne tło (ciemny tekst)]
export const SLIDE_BGS = [
  ['', 'Jak w EDUKRO', '', false], ['board', 'Tablica', '#1F3B2E', false], ['night', 'Noc', '#0A1022', false], ['navy', 'Granat', '#1A2756', false],
  ['plum', 'Śliwka', '#33193F', false], ['wine', 'Bordo', '#45162A', false], ['forest', 'Las', '#12382A', false], ['coffee', 'Kawa', '#3A2618', false],
  ['paper', 'Papier', '#F6F0E2', true], ['sky', 'Niebo', '#DCEBFF', true], ['sun', 'Słońce', '#FFF0C2', true], ['mintbg', 'Mięta', '#DDF6E6', true],
];
const num = (v, d, min, max, step = 0.01) => { const n = Number(v); return Number.isFinite(n) ? Number((Math.round(Math.min(max, Math.max(min, n)) / step) * step).toFixed(3)) : d; };
/** Wygląd jednego elementu – tylko dozwolone wartości, bez wartości domyślnych (mały zapis). */
export function cleanLook(x) {
  if (!x || typeof x !== 'object') return null;
  const out = {};
  const size = num(x.size, 1, 0.4, 3.5, 0.05); if (Math.abs(size - 1) > 0.001) out.size = size;
  if (LOOK_FONTS.some(([id]) => id && id === x.font)) out.font = x.font;
  if (LOOK_COLORS.some(([id]) => id && id === x.color)) out.color = x.color;
  const dx = num(x.dx, 0, -100, 100, 0.1), dy = num(x.dy, 0, -150, 150, 0.1);
  if (dx) out.dx = dx; if (dy) out.dy = dy;
  if (x.crop && typeof x.crop === 'object') {
    const z = num(x.crop.z, 1, 1, 5, 0.05), cx = num(x.crop.x, 50, 0, 100, 0.5), cy = num(x.crop.y, 50, 0, 100, 0.5);
    if (z > 1.001 || cx !== 50 || cy !== 50) out.crop = { z, x: cx, y: cy };
  }
  return Object.keys(out).length ? out : null;
}
export function cleanSlideLook(x) {
  if (!x || typeof x !== 'object') return null;
  const out = {};
  if (SLIDE_BGS.some(([id]) => id && id === x.bg)) out.bg = x.bg;
  for (const k of ['title', 'sub', 'img']) { const l = cleanLook(x[k]); if (l) out[k] = l; }
  return Object.keys(out).length ? out : null;
}

/* ---------- Komenda: „Do wymowy” [[…]] ----------
 * [[słowo]] – lektor czyta słowo po kliknięciu (podkreślone na tablicy).
 * [[The weather is {nice}|en-GB|kobieta]] – język i głos lektora po kresce (oba opcjonalne).
 * Zasłonięte słowo {…} w środku nie jest czytane, dopóki go nie odsłonisz – wtedy lektor czyta je od razu.
 */
const SAY_RE = /\[\[([\s\S]*?)\]\]/g;
export function parseSay(raw) {
  const text = String(raw ?? '');
  const segments = [], errors = [];
  let last = 0, m;
  SAY_RE.lastIndex = 0;
  while ((m = SAY_RE.exec(text))) {
    if (m.index > last) segments.push({ t: 'text', v: text.slice(last, m.index) });
    const parts = m[1].split('|');
    let v = parts[0], lang = 'pl-PL', voice = '';
    for (const p of parts.slice(1)) {
      const x = p.trim();
      if (SPEECH_LANGS.some(([id]) => id === x)) lang = x;
      else if (x && SPEECH_VOICES.includes(x)) voice = x;
      else v += `|${p}`;
    }
    if (!clean(v.replace(/[{}]/g, ''))) errors.push('Puste [[ ]] – w podwójnych nawiasach wpisz słowo do wymowy.');
    segments.push({ t: 'say', v, lang, voice });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ t: 'text', v: text.slice(last) });
  if (segments.some((x) => x.t === 'text' && x.v.includes('[['))) errors.push('Brakuje ]] – zamknij słowo do wymowy podwójnym nawiasem.');
  return { segments, says: segments.filter((x) => x.t === 'say'), errors };
}
/** Tekst bez znaczników „Do wymowy” (zostaje sama treść). */
export const stripSay = (raw) => parseSay(raw).segments.map((x) => x.v).join('');
export const langLabel = (id) => (SPEECH_LANGS.find(([l]) => l === id) || [null, 'polski'])[1];

/* ---------- Komenda: zasłonięte słowa {…} ---------- */
/** „Stolicą Polski jest {Warszawa}.” → segmenty; słowo w klamrach jest zasłonięte do kliknięcia. Zwykła klamra: \{ \}. */
export function parseHidden(raw) {
  const text = stripSay(raw);
  const segments = [];
  const errors = [];
  let buf = '', inside = false, hid = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) { if (inside) hid += text[i + 1]; else buf += text[i + 1]; i++; continue; }
    if (ch === '{') {
      if (inside) { errors.push(`Klamra { otwarta wewnątrz innej (znak ${i + 1}). Zamknij poprzednie zasłonięte słowo.`); continue; }
      inside = true; hid = '';
      if (buf) segments.push({ t: 'text', v: buf });
      buf = '';
      continue;
    }
    if (ch === '}') {
      if (!inside) { errors.push(`Klamra } zamknięta bez otwarcia (znak ${i + 1}). Zwykłą klamrę napisz tak: \\}.`); buf += ch; continue; }
      inside = false;
      if (!clean(hid)) errors.push('Puste zasłonięcie {} – wpisz w klamrze słowo do odsłonięcia.');
      else segments.push({ t: 'hide', v: hid });
      continue;
    }
    if (inside) hid += ch; else buf += ch;
  }
  if (inside) { errors.push('Brakuje klamry zamykającej } dla zasłoniętego słowa.'); buf = `{${hid}`; }
  if (buf) segments.push({ t: 'text', v: buf });
  return { segments, hidden: segments.filter((s) => s.t === 'hide').map((s) => clean(s.v)), errors };
}

/* ---------- Puste elementy ---------- */
export function emptyBlock(kind = 'text') {
  const base = { id: newId(), kind, style: 'normal', appear: 'now', delay: '' };
  switch (kind) {
    case 'list': return { ...base, items: ['', ''] };
    case 'table': return { ...base, table: { rows: 3, cols: 2, header: true, cells: Array.from({ length: 3 }, () => ['', '']) } };
    case 'image': return { ...base, image: null, caption: '', covered: false };
    default: return { ...base, text: '' };
  }
}
export const emptyQA = () => ({ q: '', a: '' });
export function emptySlide(type) {
  const base = { id: newId(), type, title: '' };
  switch (type) {
    case 'title': return { ...base, subtitle: '', image: null };
    case 'info': return { ...base, blocks: [emptyBlock('text')] };
    case 'copy': return { ...base, blocks: [emptyBlock('text')], time: '5' };
    case 'question': return { ...base, question: emptyQuestion(null) };
    case 'flashcards': return { ...base, cards: [{ front: '', back: '' }, { front: '', back: '' }] };
    case 'brainstorm': return { ...base, prompt: '' };
    case 'wheel': return { ...base, title: 'Koło fortuny', questions: [], removePicked: true };
    case 'game': return { ...base, title: '', game: 'duel', questions: [emptyQA(), emptyQA(), emptyQA(), emptyQA(), emptyQA()], board: emptyBoard() };
    default: return base;
  }
}
export function emptyBoard(cats = 3, per = 3) {
  return Array.from({ length: cats }, () => ({ name: '', questions: Array.from({ length: per }, emptyQA) }));
}

/** Krótki opis slajdu do listy w edytorze. */
export function slideLabel(s) {
  if (!s) return '';
  if (s.type === 'question') return clean(s.question?.prompt) || (s.question?.type ? TYPE[s.question.type].label : 'Pytanie – wybierz rodzaj');
  if (s.type === 'game') return clean(s.title) || GAME[s.game]?.label || 'Gra klasowa';
  if (s.type === 'brainstorm') return clean(s.title) || clean(s.prompt) || 'Burza mózgów';
  return clean(s.title) || SLIDE[s.type]?.label || 'Slajd';
}

/* ---------- Sprawdzanie ---------- */
function checkHidden(text, where, P, K, field) {
  const r = parseHidden(text);
  const sy = parseSay(text);
  const errors = [...r.errors, ...sy.errors];
  errors.forEach((e) => P.push({ level: 'error', msg: `${where}: ${e}`, field }));
  const parts = [];
  if (r.hidden.length) parts.push(`zasłonięte: ${r.hidden.map(quote).join(', ')}`);
  if (sy.says.length) parts.push(`do wymowy: ${sy.says.map((x) => `${quote(clean(x.v.replace(/[{}]/g, '')))}${x.lang !== 'pl-PL' ? ` (${langLabel(x.lang)})` : ''}`).join(', ')}`);
  if (K && !errors.length && parts.length) K.push({ field, ok: true, msg: `Komenda napisana poprawnie – ${parts.join('; ')}.` });
  if (K && errors.length) K.push({ field, ok: false, msg: errors[0] });
}
/** Wszystkie komendy w tekstach (do zielonej linijki pod punktami, tabelą i fiszkami). */
export function commandSummary(texts) {
  const hidden = [], says = [];
  for (const t of texts) { hidden.push(...parseHidden(t).hidden); says.push(...parseSay(t).says); }
  const parts = [];
  if (hidden.length) parts.push(`zasłonięte: ${hidden.map(quote).join(', ')}`);
  if (says.length) parts.push(`do wymowy: ${says.map((x) => quote(clean(x.v.replace(/[{}]/g, '')))).join(', ')}`);
  return parts.join('; ');
}

export function validateSlide(s, ctx = {}) {
  const P = [], K = [];
  const err = (msg, field, extra = {}) => P.push({ level: 'error', msg, field, ...extra });
  const warn = (msg, field, extra = {}) => P.push({ level: 'warn', msg, field, ...extra });
  if (!s || !SLIDE[s.type]) { err('Wybierz rodzaj slajdu.', 'type'); return { problems: P, commands: K }; }
  switch (s.type) {
    case 'title':
      if (isBlank(s.title)) err('Wpisz tytuł slajdu.', 'title');
      break;
    case 'info':
    case 'copy': {
      if (isBlank(s.title)) err('Wpisz tytuł slajdu.', 'title');
      const blocks = s.blocks || [];
      if (!blocks.length) err('Dodaj co najmniej jeden element (tekst, punkty, tabelę albo obrazek).', 'blocks');
      if (blocks.length > LL.blocks) err(`Najwyżej ${LL.blocks} elementów na slajdzie.`, 'blocks');
      blocks.forEach((b, i) => {
        const n = `Element ${i + 1}`;
        const field = `block${i}`;
        if (b.kind === 'text') { if (isBlank(b.text)) err(`${n} (tekst) jest pusty.`, field, { index: i }); else checkHidden(b.text, n, P, K, field); }
        else if (b.kind === 'list') {
          const items = (b.items || []).filter((x) => !isBlank(x));
          if (!items.length) err(`${n} (punkty) nie ma żadnego punktu.`, field, { index: i });
          (b.items || []).forEach((x, j) => { if (!isBlank(x)) checkHidden(x, `${n}, punkt ${j + 1}`, P, null, field); });
          const sum = commandSummary(items);
          if (sum && !P.some((p) => p.field === field)) K.push({ field, ok: true, msg: `Komenda napisana poprawnie – ${sum}.` });
        } else if (b.kind === 'table') {
          const t = b.table || {};
          if (!(t.rows >= 1 && t.rows <= LL.tableDim && t.cols >= 1 && t.cols <= LL.tableDim)) err(`${n}: tabela musi mieć od 1 do ${LL.tableDim} wierszy i kolumn.`, field, { index: i });
          else if (!(t.cells || []).flat().some((x) => !isBlank(x))) err(`${n} (tabela) jest pusta.`, field, { index: i });
          else {
            (t.cells || []).flat().forEach((x) => { if (!isBlank(x)) checkHidden(x, n, P, null, field); });
            const sum = commandSummary((t.cells || []).flat());
            if (sum && !P.some((p) => p.field === field)) K.push({ field, ok: true, msg: `Komenda napisana poprawnie – ${sum}.` });
          }
        } else if (b.kind === 'image') { if (!b.image) err(`${n}: dodaj obrazek.`, field, { index: i }); }
        else err(`${n}: nieznany rodzaj elementu.`, field, { index: i });
        if (b.appear === 'delay') {
          const t = parseTime(b.delay);
          if (!t.ok) { err(`${n} – czas pojawienia się: ${t.error}`, field, { index: i }); K.push({ field: `delay${i}`, ok: false, msg: t.error }); }
          else if (t.empty) { err(`${n}: wpisz, po jakim czasie ma się pojawić (np. 0.20 = 20 s).`, field, { index: i }); K.push({ field: `delay${i}`, ok: false, msg: 'Wpisz czas, np. 0.20 = 20 sekund, 1 = minuta.' }); }
          else K.push({ field: `delay${i}`, ok: true, msg: `Komenda napisana poprawnie – pojawi się ${t.pretty} po pokazaniu slajdu.` });
        }
      });
      if (s.type === 'copy') {
        const t = parseTime(s.time);
        if (!t.ok) { err(`Czas na przepisanie: ${t.error}`, 'time'); K.push({ field: 'time', ok: false, msg: t.error }); }
        else if (t.empty) { err('Wpisz czas na przepisanie, np. 5 (minut) albo 2.30.', 'time'); K.push({ field: 'time', ok: false, msg: 'Wpisz czas, np. 5 = 5 minut.' }); }
        else K.push({ field: 'time', ok: true, msg: `Komenda napisana poprawnie – uczniowie mają ${t.pretty} na przepisanie.` });
      }
      break;
    }
    case 'question': {
      const q = s.question;
      if (!q || !q.type) { err('Wybierz rodzaj pytania.', 'type'); break; }
      for (const p of validateQuestion(q, { kind: 'teaching_test' }).problems) P.push(p);
      break;
    }
    case 'flashcards': {
      if (isBlank(s.title)) err('Wpisz tytuł slajdu.', 'title');
      const cards = s.cards || [];
      if (cards.length < 1 || cards.length > LL.cards) err(`Dodaj od 1 do ${LL.cards} fiszek.`, 'cards');
      cards.forEach((c, i) => {
        if (isBlank(c.front) || isBlank(c.back)) err(`Fiszka ${i + 1}: uzupełnij obie strony.`, 'cards', { index: i });
        else { checkHidden(c.front, `Fiszka ${i + 1}`, P, null, 'cards'); checkHidden(c.back, `Fiszka ${i + 1}`, P, null, 'cards'); }
      });
      { const sum = commandSummary(cards.flatMap((c) => [c.front, c.back])); if (sum && !P.some((p) => p.level === 'error')) K.push({ field: 'cards', ok: true, msg: `Komenda napisana poprawnie – ${sum}.` }); }
      break;
    }
    case 'brainstorm':
      if (isBlank(s.prompt)) err('Wpisz pytanie albo temat burzy mózgów.', 'prompt');
      break;
    case 'wheel': {
      (s.questions || []).forEach((x, i) => { if (isBlank(x.q)) err(`Pytanie ${i + 1} do koła jest puste – uzupełnij je albo usuń.`, 'questions', { index: i }); });
      break;
    }
    case 'game': {
      if (!GAME[s.game]) { err('Wybierz rodzaj gry.', 'game'); break; }
      if (s.game === 'vabanque') {
        const board = s.board || [];
        if (board.length < 2 || board.length > LL.vbCats) err(`Va banque: od 2 do ${LL.vbCats} kategorii.`, 'board');
        board.forEach((c, i) => {
          if (isBlank(c.name)) err(`Kategoria ${i + 1} nie ma nazwy.`, 'board', { index: i });
          const qs = c.questions || [];
          if (qs.length < LL.vbMinPer || qs.length > LL.vbPer) err(`Kategoria ${i + 1}: od ${LL.vbMinPer} do ${LL.vbPer} pytań.`, 'board', { index: i });
          qs.forEach((x, j) => { if (isBlank(x.q)) err(`Kategoria ${i + 1}, pytanie za ${(j + 1) * 100}: brak treści.`, 'board', { index: i }); });
        });
        if (!uniq(board.filter((c) => !isBlank(c.name)).map((c) => lower(c.name)))) err('Nazwy kategorii się powtarzają.', 'board');
        break;
      }
      const qs = s.questions || [];
      qs.forEach((x, i) => { if (isBlank(x.q)) err(`Pytanie ${i + 1} jest puste – uzupełnij je albo usuń.`, 'questions', { index: i }); });
      if (s.game === 'duel') {
        if (qs.length < 5) err(`Pojedynek wymaga co najmniej 5 pytań (jest ${qs.length}).`, 'questions');
        else if (qs.length % 2 === 0) err(`Liczba pytań musi być nieparzysta, żeby nie było remisu (jest ${qs.length}). Dodaj albo usuń jedno pytanie.`, 'questions');
        else K.push({ field: 'questions', ok: true, msg: `Liczba pytań w porządku: ${qs.length} (nieparzysta) – zawsze wyłoni zwycięzcę.` });
      }
      if (s.game === 'tictactoe' && qs.length < 9) err(`Kółko i krzyżyk wymaga co najmniej 9 pytań (jest ${qs.length}). Najlepiej 12–15, bo po błędnej odpowiedzi pole zostaje wolne.`, 'questions');
      if (s.game === 'tictactoe' && qs.length >= 9 && qs.length < 12) warn('Przy błędnych odpowiedziach pytania mogą się skończyć przed zapełnieniem planszy – dodaj kilka zapasowych.', 'questions');
      if (qs.length > LL.gameQuestions) err(`Najwyżej ${LL.gameQuestions} pytań.`, 'questions');
      break;
    }
    default: break;
  }
  return { problems: P, commands: K };
}

export function validateLesson(doc) {
  const problems = [];
  const s = doc.settings || {};
  const P = (msg, field) => problems.push({ level: 'error', msg, where: 'settings', field });
  // Klasa nie jest częścią lekcji: wybiera się ją przy „Prowadź” albo „Opublikuj dla…”.
  void s;
  if (isBlank(doc.title)) P('Lekcja nie ma nazwy.', 'title');
  const slides = doc.slides || [];
  if (!slides.length) P('Lekcja nie ma żadnego slajdu.', 'slides');
  if (slides.length > LL.slides) P(`Lekcja może mieć najwyżej ${LL.slides} slajdów.`, 'slides');
  slides.forEach((sl, i) => {
    for (const p of validateSlide(sl, {}).problems) problems.push({ ...p, where: 'slide', i, sid: sl.id });
  });
  return { problems, errors: problems.filter((p) => p.level === 'error').length };
}

export function slideStatus(s, ctx) {
  if (!s.type) return 'empty';
  const { problems } = validateSlide(s, ctx);
  if (problems.some((p) => p.level === 'error')) return 'error';
  return problems.length ? 'warn' : 'ok';
}

export const lessonClassName = (settings = {}) => className(settings.grade, settings.section);
