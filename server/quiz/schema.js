// Oczyszczanie danych testu przysłanych z edytora: tylko znane pola, przycięte długości i liczności.
// Nie sprawdza kompletności (to robi validateTest) – szkic może być niekompletny.
import { LIMITS, TYPE, DEFAULT_SETTINGS, emptyTable, upgradeQuestion, newId, SPEECH_LANGS, SPEECH_VOICES } from '../../public/js/shared/quiz-rules.js';
import { itemOf, isDefault } from '../../public/js/shared/shop.js';
import { PROMO_KEYS } from '../shop/pricing.js';

/** Nagroda za test: przedmiot ze sklepu (kolor, kolor tekstu, czcionka) albo osobista promocja na wybrany produkt. */
export function cleanReward(r) {
  if (!r || typeof r !== 'object') return null;
  const item = String(r.item || '');
  if (r.type === 'item') return itemOf(item) && !isDefault(item) ? { type: 'item', item } : null;
  if (r.type === 'promo') {
    if (!PROMO_KEYS.includes(item)) return null;
    const off = intOr(r.off, 30, 5, 90);
    const hours = intOr(r.hours, 24, 1, 720);
    return { type: 'promo', item, off, hours };
  }
  return null;
}

const S = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').slice(0, max) : '');
const line = (v, max) => S(v, max).replace(/[\n\t]+/g, ' ');
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const bool = (v) => v === true;
const tri = (v) => (v === true ? true : v === false ? false : null);
const MEDIA_RE = /^[a-f0-9]{24}$/;
const media = (v) => (typeof v === 'string' && MEDIA_RE.test(v) ? v : null);
const intOr = (v, d, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
const numStr = (v) => line(String(v ?? ''), 20);

const CAT_ID = /^[a-z0-9]{4,24}$/i;
export function cleanCategories(list) {
  const seen = new Set();
  return arr(list, LIMITS.qCategories).map((c) => {
    let cid = typeof c?.id === 'string' && CAT_ID.test(c.id) ? c.id : newId();
    while (seen.has(cid)) cid = newId();
    seen.add(cid);
    return { id: cid, name: line(c?.name, LIMITS.qCategoryName) };
  });
}

export function cleanSettings(s = {}) {
  const p = s.points || {};
  const sc = Array.isArray(s.gradeScale) && s.gradeScale.length === 5 ? s.gradeScale.map((x) => intOr(x, 0, 0, 100)) : DEFAULT_SETTINGS.gradeScale;
  const dl = Number(s.deadline);
  return {
    maxMistakes: intOr(s.maxMistakes, DEFAULT_SETTINGS.maxMistakes, 0, 50),
    defaultTime: line(s.defaultTime ?? DEFAULT_SETTINGS.defaultTime, 12),
    spelling: s.spelling === undefined ? true : bool(s.spelling),
    shuffleQuestions: bool(s.shuffleQuestions),
    shuffleAnswers: s.shuffleAnswers === undefined ? true : bool(s.shuffleAnswers),
    drawCount: intOr(s.drawCount, 0, 0, LIMITS.questions),
    categories: cleanCategories(s.categories),
    deadline: Number.isFinite(dl) && dl > 0 ? Math.round(dl) : null,
    gradeScale: sc,
    expiresAt: Number.isFinite(Number(s.expiresAt)) && Number(s.expiresAt) > 0 ? Math.round(Number(s.expiresAt)) : null,
    reward: cleanReward(s.reward),
    rewardMinGrade: intOr(s.rewardMinGrade, 4, 2, 6),
    points: {
      examFirst: intOr(p.examFirst, DEFAULT_SETTINGS.points.examFirst, 0, 1000),
      examRepeat: intOr(p.examRepeat, DEFAULT_SETTINGS.points.examRepeat, 0, 1000),
      teachingFirst: intOr(p.teachingFirst, DEFAULT_SETTINGS.points.teachingFirst, 0, 1000),
    },
  };
}

function cleanCell(c) {
  const x = c && typeof c === 'object' ? c : {};
  const s = ['show', 'blank', 'gone'].includes(x.s) ? x.s : 'show';
  const g = typeof x.g === 'string' && /^[A-H]$/.test(x.g) ? x.g : '';
  return { t: line(x.t, LIMITS.text), s, lock: bool(x.lock), g };
}

function cleanTable(t) {
  if (!t || typeof t !== 'object') return emptyTable();
  const rows = intOr(t.rows, 3, 1, LIMITS.tableDim);
  const cols = intOr(t.cols, 3, 1, LIMITS.tableDim);
  const src = Array.isArray(t.cells) ? t.cells : [];
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cleanCell(src[r]?.[c])));
  const groupRepeat = {};
  for (const [k, v] of Object.entries(t.groupRepeat || {})) if (/^[A-H]$/.test(k) && v === true) groupRepeat[k] = true;
  return { rows, cols, headerRow: bool(t.headerRow), headerCol: bool(t.headerCol), cells, groupRepeat };
}

const wordsField = (v) => line(String(v ?? ''), 4);
function cleanOpen(x) {
  const series = arr(x.series, LIMITS.series).map((t) => line(t, LIMITS.seriesText));
  return { series: series.length ? series : [''], minWords: wordsField(x.minWords), maxWords: wordsField(x.maxWords), sample: S(x.sample, LIMITS.sample) };
}

export function cleanQuestion(q) {
  const x = upgradeQuestion(q && typeof q === 'object' ? q : {}) || {};
  const type = TYPE[x.type] ? x.type : null;
  const out = {
    id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/i.test(x.id) ? x.id : Math.random().toString(36).slice(2, 12),
    type,
    prompt: S(x.prompt, LIMITS.prompt),
    image: media(x.image),
    hint: S(x.hint, LIMITS.hint),
    explanation: S(x.explanation, LIMITS.explanation),
    time: line(x.time, 12),
    cat: typeof x.cat === 'string' && CAT_ID.test(x.cat) ? x.cat : '',
  };
  switch (type) {
    case 'single':
      out.options = Array.from({ length: 4 }, (_, i) => line(arr(x.options, 4)[i], LIMITS.text));
      out.correct = Number.isInteger(x.correct) && x.correct >= 0 && x.correct < 4 ? x.correct : null;
      break;
    case 'multi':
      out.options = arr(x.options, LIMITS.options).map((o) => ({ text: line(o?.text, LIMITS.text), correct: bool(o?.correct) }));
      break;
    case 'truefalse':
      out.statements = arr(x.statements, LIMITS.statements).map((s) => ({ text: line(s?.text, LIMITS.text), answer: tri(s?.answer) }));
      break;
    case 'open':
      Object.assign(out, cleanOpen(x));
      break;
    case 'number':
      out.value = numStr(x.value); out.tolerance = numStr(x.tolerance); out.unit = line(x.unit, 20);
      break;
    case 'match':
      out.pairs = arr(x.pairs, LIMITS.pairs).map((p) => ({ left: line(p?.left, LIMITS.text), right: line(p?.right, LIMITS.text) }));
      break;
    case 'order_words':
      out.sentence = line(x.sentence, LIMITS.text); out.distractors = line(x.distractors, LIMITS.text);
      break;
    case 'timeline':
      out.items = arr(x.items, LIMITS.timeline).map((i) => line(i, LIMITS.text));
      break;
    case 'cloze':
    case 'cloze_choice':
      out.text = S(x.text, LIMITS.clozeText);
      break;
    case 'table':
      out.table = cleanTable(x.table);
      break;
    case 'categorize':
      out.categories = arr(x.categories, LIMITS.categories).map((c) => ({ name: line(c?.name, 80), items: line(c?.items, 1000) }));
      break;
    case 'image_labels':
      out.diagram = media(x.diagram);
      out.points = arr(x.points, LIMITS.points).map((p) => ({
        x: Math.min(100, Math.max(0, Number(p?.x) || 0)), y: Math.min(100, Math.max(0, Number(p?.y) || 0)), label: line(p?.label, 80),
      }));
      out.distractors = line(x.distractors, LIMITS.text);
      break;
    case 'data':
      out.passage = S(x.passage, LIMITS.passage);
      out.questions = arr(x.questions, LIMITS.subQuestions).map((s) => ({ prompt: S(s?.prompt, LIMITS.prompt), ...cleanOpen(s || {}) }));
      break;
    case 'listen':
      out.phrase = line(x.phrase, LIMITS.text);
      out.lang = SPEECH_LANGS.some(([l]) => l === x.lang) ? x.lang : 'en-GB';
      out.voice = SPEECH_VOICES.includes(x.voice) ? x.voice : '';
      out.accept = line(x.accept, LIMITS.text);
      out.exact = x.exact !== false;
      break;
    default: break;
  }
  return out;
}

export function cleanQuestions(list) {
  const seen = new Set();
  return arr(list, LIMITS.questions).map(cleanQuestion).map((q) => {
    while (seen.has(q.id)) q.id = Math.random().toString(36).slice(2, 12);
    seen.add(q.id);
    return q;
  });
}

/** Identyfikatory obrazów użytych w teście (do kontroli uprawnień i sprzątania). */
export function mediaIds(questions) {
  const ids = new Set();
  for (const q of questions) {
    if (q.image) ids.add(q.image);
    if (q.diagram) ids.add(q.diagram);
  }
  return [...ids];
}
