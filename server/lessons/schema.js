// Oczyszczanie danych lekcji przysłanych z edytora (tylko znane pola, przycięte długości).
import { LL, SLIDE, GAME, emptyBoard, cleanLook, cleanSlideLook } from '../../public/js/shared/lesson-rules.js';
import { GRADES, SECTIONS } from '../../public/js/shared/classes.js';
import { cleanQuestion } from '../quiz/schema.js';

const S = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').slice(0, max) : '');
const line = (v, max) => S(v, max).replace(/[\n\t]+/g, ' ');
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const MEDIA_RE = /^[a-f0-9]{24}$/;
const media = (v) => (typeof v === 'string' && MEDIA_RE.test(v) ? v : null);
const intOr = (v, d, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
const ID_RE = /^[a-z0-9]{4,24}$/i;
const sid = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : Math.random().toString(36).slice(2, 12));
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function parseLesson(a) {
  let doc = {};
  try { doc = a.content_json ? JSON.parse(a.content_json) : {}; } catch { doc = {}; }
  const s = doc.settings || {};
  return {
    settings: { grade: GRADES.includes(String(s.grade)) ? String(s.grade) : '', section: SECTIONS.includes(s.section) ? s.section : '' },
    slides: Array.isArray(doc.slides) ? doc.slides : [],
  };
}

export function cleanLessonSettings(s = {}) {
  return { grade: GRADES.includes(String(s.grade)) ? String(s.grade) : '', section: SECTIONS.includes(s.section) ? s.section : '' };
}

function cleanBlock(b) {
  const x = b && typeof b === 'object' ? b : {};
  const kind = pick(x.kind, ['text', 'list', 'table', 'image'], 'text');
  const out = {
    id: sid(x.id), kind,
    style: pick(x.style, ['normal', 'important', 'definition', 'example'], 'normal'),
    appear: pick(x.appear, ['now', 'click', 'delay'], 'now'),
    delay: line(x.delay, 12),
  };
  if (kind === 'text') out.text = S(x.text, LL.text);
  if (kind === 'list') out.items = arr(x.items, LL.listItems).map((t) => line(t, LL.item));
  if (kind === 'table') {
    const t = x.table && typeof x.table === 'object' ? x.table : {};
    const rows = intOr(t.rows, 2, 1, LL.tableDim), cols = intOr(t.cols, 2, 1, LL.tableDim);
    const src = Array.isArray(t.cells) ? t.cells : [];
    out.table = { rows, cols, header: t.header !== false, cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => line(src[r]?.[c], LL.cell))) };
  }
  if (kind === 'image') { out.image = media(x.image); out.caption = line(x.caption, LL.caption); out.covered = x.covered === true; }
  const look = cleanLook(x.look);
  if (look) out.look = look;
  return out;
}

const qa = (v) => ({ q: S(v?.q, LL.q), a: line(v?.a, LL.a) });

function cleanSlide(sl) {
  const x = sl && typeof sl === 'object' ? sl : {};
  const type = SLIDE[x.type] ? x.type : 'info';
  const out = { id: sid(x.id), type, title: line(x.title, LL.title) };
  const look = cleanSlideLook(x.look);
  if (look) out.look = look;
  switch (type) {
    case 'title': out.subtitle = S(x.subtitle, LL.summary); out.image = media(x.image); break;
    case 'info':
    case 'copy':
      out.blocks = arr(x.blocks, LL.blocks).map(cleanBlock);
      if (type === 'copy') out.time = line(x.time, 12);
      break;
    case 'question': out.question = cleanQuestion(x.question || {}); break;
    case 'flashcards': out.cards = arr(x.cards, LL.cards).map((c) => ({ front: S(c?.front, LL.cardText), back: S(c?.back, LL.cardText) })); break;
    case 'brainstorm': out.prompt = S(x.prompt, LL.prompt); break;
    case 'wheel': out.questions = arr(x.questions, LL.wheelQuestions).map(qa); out.removePicked = x.removePicked !== false; break;
    case 'game':
      out.game = GAME[x.game] ? x.game : 'duel';
      out.questions = arr(x.questions, LL.gameQuestions).map(qa);
      out.board = Array.isArray(x.board) && x.board.length
        ? arr(x.board, LL.vbCats).map((c) => ({ name: line(c?.name, 60), questions: arr(c?.questions, LL.vbPer).map(qa) }))
        : emptyBoard();
      break;
    default: break;
  }
  return out;
}

export function cleanSlides(list) {
  const seen = new Set();
  return arr(list, LL.slides).map(cleanSlide).map((s) => {
    while (seen.has(s.id)) s.id = Math.random().toString(36).slice(2, 12);
    seen.add(s.id);
    return s;
  });
}

/** Obrazy użyte w lekcji. */
export function lessonMediaIds(slides) {
  const ids = new Set();
  for (const s of slides) {
    if (s.image) ids.add(s.image);
    for (const b of s.blocks || []) if (b.image) ids.add(b.image);
    if (s.question) { if (s.question.image) ids.add(s.question.image); if (s.question.diagram) ids.add(s.question.diagram); }
  }
  return [...ids];
}
