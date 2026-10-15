// Szablony lekcji i testów: gotowe (wbudowane) oraz zapisane przez nauczycieli.
// Szablon = ten sam układ (rodzaje i liczba slajdów/pytań, elementy, wygląd, obrazki, czasy, ustawienia),
// ale BEZ TEKSTU – nauczyciel wpisuje własną treść. Wspólne dla serwera i przeglądarki (bez DOM).
import { emptyQuestion, newId, TYPE, DEFAULT_SETTINGS } from './quiz-rules.js';
import { emptySlide, emptyBlock, emptyBoard, emptyQA } from './lesson-rules.js';

const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const blank = (n) => Array.from({ length: Math.max(0, n) }, () => '');

/* ---------- Usuwanie tekstu: pytanie ---------- */
export function stripQuestion(src) {
  const q = clone(src) || {};
  const out = { ...emptyQuestion(TYPE[q.type] ? q.type : null), id: newId() };
  if (!out.type) return out;
  out.image = q.image || null;
  out.time = q.time || '';
  out.cat = q.cat || '';
  switch (q.type) {
    case 'single': break;
    case 'multi': out.options = (q.options || []).map(() => ({ text: '', correct: false })); break;
    case 'truefalse': out.statements = (q.statements || []).map(() => ({ text: '', answer: null })); break;
    case 'open': out.series = blank((q.series || ['']).length || 1); out.minWords = q.minWords || ''; out.maxWords = q.maxWords || ''; break;
    case 'match': out.pairs = (q.pairs || []).map(() => ({ left: '', right: '' })); break;
    case 'timeline': out.items = blank((q.items || []).length || 3); break;
    case 'table': {
      const t = q.table || {};
      out.table = { ...out.table, ...t, cells: (t.cells || out.table.cells).map((row) => row.map((c) => ({ t: '', s: c.s, lock: !!c.lock, g: c.g || '' }))), groupRepeat: t.groupRepeat || {} };
      break;
    }
    case 'categorize': out.categories = (q.categories || []).map(() => ({ name: '', items: '' })); break;
    case 'image_labels': out.diagram = q.diagram || null; out.points = (q.points || []).map((p) => ({ x: p.x, y: p.y, label: '' })); break;
    case 'data': out.questions = (q.questions || [{}]).map((s) => ({ prompt: '', series: blank((s.series || ['']).length || 1), minWords: s.minWords || '', maxWords: s.maxWords || '', sample: '' })); break;
    case 'listen': out.lang = q.lang || out.lang; out.voice = q.voice || ''; out.exact = q.exact !== false; break;
    default: break;
  }
  return out;
}

/* ---------- Usuwanie tekstu: slajd lekcji ---------- */
export function stripSlide(src) {
  const s = clone(src) || {};
  const out = { ...emptySlide(s.type), id: newId(), title: '' };
  if (s.look) out.look = s.look;
  switch (s.type) {
    case 'title': out.subtitle = ''; out.image = s.image || null; break;
    case 'info':
    case 'copy':
      out.blocks = (s.blocks || []).map((b) => {
        const nb = { ...emptyBlock(b.kind), style: b.style || 'normal', appear: b.appear || 'now', delay: b.delay || '' };
        if (b.look) nb.look = b.look;
        if (b.kind === 'list') nb.items = blank((b.items || []).length || 2);
        if (b.kind === 'table') { const t = b.table || {}; nb.table = { rows: t.rows || 2, cols: t.cols || 2, header: t.header !== false, cells: Array.from({ length: t.rows || 2 }, () => blank(t.cols || 2)) }; }
        if (b.kind === 'image') { nb.image = b.image || null; nb.covered = !!b.covered; }
        return nb;
      });
      if (s.type === 'copy') out.time = s.time || '5';
      break;
    case 'question': out.question = stripQuestion(s.question); break;
    case 'flashcards': out.cards = (s.cards || [{}, {}]).map(() => ({ front: '', back: '' })); break;
    case 'brainstorm': out.prompt = ''; break;
    case 'wheel': out.title = 'Koło fortuny'; out.questions = (s.questions || []).map(emptyQA); out.removePicked = s.removePicked !== false; break;
    case 'game':
      out.game = s.game || 'duel';
      out.questions = (s.questions || []).map(emptyQA);
      out.board = (s.board && s.board.length ? s.board : emptyBoard()).map((c) => ({ name: '', questions: (c.questions || []).map(emptyQA) }));
      break;
    default: break;
  }
  return out;
}
export const stripLesson = (doc) => ({ settings: {}, slides: (doc?.slides || []).map(stripSlide) });

/* ---------- Usuwanie tekstu: test ---------- */
export function stripTest(doc) {
  const st = { ...DEFAULT_SETTINGS, ...clone(doc?.settings || {}) };
  const cats = (st.categories || []).map((c) => ({ id: c.id, name: '' }));
  return {
    settings: { ...st, categories: cats, deadline: null, expiresAt: null },
    questions: (doc?.questions || []).map(stripQuestion),
  };
}

/* ---------- Gotowe szablony ---------- */
const S = (type, extra = {}) => ({ ...emptySlide(type), ...extra });
const B = (kind, extra = {}) => ({ ...emptyBlock(kind), ...extra });
const Q = (type, extra = {}) => ({ ...emptyQuestion(type), ...extra });

export const BUILTIN_LESSONS = [
  { id: 'b:krotka', name: 'Krótka lekcja', desc: '5 slajdów: tytuł, wyjaśnienie z punktami, pytanie A–D, fiszki i notatka do zeszytu.',
    make: () => [S('title'), S('info', { blocks: [B('text'), B('list', { items: blank(3), appear: 'click' })] }), S('question', { question: Q('single') }),
      S('flashcards', { cards: [0, 1, 2, 3].map(() => ({ front: '', back: '' })) }), S('copy', { blocks: [B('text', { style: 'definition' }), B('list', { items: blank(3) })], time: '4' })] },
  { id: 'b:powtorka', name: 'Lekcja z powtórką i grą', desc: 'Burza mózgów, wyjaśnienie z obrazkiem, notatka-tabela, prawda/fałsz, koło fortuny i pojedynek drużyn.',
    make: () => [S('title'), S('brainstorm'), S('info', { blocks: [B('text'), B('image'), B('text', { style: 'important' })] }),
      S('copy', { blocks: [B('table', { table: { rows: 4, cols: 3, header: true, cells: Array.from({ length: 4 }, () => blank(3)) } })], time: '5' }),
      S('question', { question: Q('truefalse') }), S('wheel', { questions: [0, 1, 2, 3, 4].map(emptyQA) }), S('game', { game: 'duel', questions: [0, 1, 2, 3, 4].map(emptyQA) })] },
  { id: 'b:jezykowa', name: 'Lekcja językowa', desc: 'Fiszki ze słówkami, zasada gramatyczna, zadanie na słuch, ułóż zdanie i kółko i krzyżyk.',
    make: () => [S('title'), S('flashcards', { cards: [0, 1, 2, 3, 4, 5].map(() => ({ front: '', back: '' })) }),
      S('info', { blocks: [B('text', { style: 'definition' }), B('list', { items: blank(3), style: 'example' })] }),
      S('question', { question: Q('listen') }), S('question', { question: Q('order_words') }),
      S('game', { game: 'tictactoe', questions: Array.from({ length: 12 }, emptyQA) })] },
  { id: 'b:prezentacja', name: 'Prezentacja tematu', desc: 'Tytuł i cztery slajdy informacyjne (tekst, punkty na kliknięcie, obrazek) z podsumowaniem.',
    make: () => [S('title'), ...[0, 1, 2].map(() => S('info', { blocks: [B('text'), B('list', { items: blank(3), appear: 'click' })] })),
      S('info', { blocks: [B('image'), B('text', { style: 'important' })] }), S('copy', { blocks: [B('list', { items: blank(4) })], time: '3' })] },
];

const catIds = () => [newId(), newId(), newId()];
export const BUILTIN_TESTS = [
  { id: 'b:sprawdzian', name: 'Klasyczny sprawdzian', kind: 'quiz', desc: '20 pytań z 3 działów: A–D, prawda/fałsz, luki, pary, odpowiedzi pisemne i liczba. Ocena 1–6.',
    make: () => {
      const c = catIds();
      const plan = ['single', 'single', 'single', 'truefalse', 'cloze', 'single', 'single', 'match', 'open', 'number', 'single', 'single', 'truefalse', 'cloze', 'single', 'truefalse', 'match', 'open', 'cloze_choice', 'single'];
      return { settings: { ...DEFAULT_SETTINGS, categories: c.map((id, i) => ({ id, name: `Dział ${i + 1}` })) }, questions: plan.map((t, i) => Q(t, { cat: c[Math.floor(i / 7)] })) };
    } },
  { id: 'b:kartkowka', name: 'Kartkówka na czas', kind: 'exam_test', desc: '8 krótkich pytań po 45 sekund, można pomylić się 2 razy.',
    make: () => ({ settings: { ...DEFAULT_SETTINGS, defaultTime: '0.45', maxMistakes: 2 }, questions: ['single', 'single', 'truefalse', 'single', 'number', 'single', 'truefalse', 'single'].map((t) => Q(t)) }) },
  { id: 'b:powtorka', name: 'Powtórka przed sprawdzianem', kind: 'teaching_test', desc: '10 pytań różnych rodzajów – uczeń uczy się na błędach.',
    make: () => ({ settings: { ...DEFAULT_SETTINGS }, questions: ['single', 'multi', 'truefalse', 'match', 'timeline', 'cloze', 'categorize', 'single', 'open', 'cloze_choice'].map((t) => Q(t)) }) },
  { id: 'b:slowka', name: 'Test ze słówek (język obcy)', kind: 'teaching_test', desc: 'Zadania na słuch z lektorem, pary słówek, luki i układanie zdań.',
    make: () => ({ settings: { ...DEFAULT_SETTINGS }, questions: ['listen', 'listen', 'match', 'cloze', 'listen', 'order_words', 'match', 'listen', 'cloze_choice', 'order_words'].map((t) => Q(t)) }) },
];
export const builtinLesson = (id) => BUILTIN_LESSONS.find((t) => t.id === id) || null;
export const builtinTest = (id) => BUILTIN_TESTS.find((t) => t.id === id) || null;
