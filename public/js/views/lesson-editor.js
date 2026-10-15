// Edytor lekcji: ustawienia (klasa i oddział), lista slajdów, edycja slajdu, sprawdzanie i publikacja.
// Zmiany zapisują się automatycznie (szkic może być niekompletny).
import { livePreview } from './live-preview.js';
import { h, icon, notice, toast, dialog, withBusy, switchEl, plural } from '../ui.js';
import { get, put, post, del } from '../api.js';
import { navigate, setCrumbs, leaveGuards } from '../app.js';
import {
  SLIDE_TYPES, SLIDE, GAMES, GAME, LL, BLOCK_KINDS, BLOCK_STYLES, APPEAR, AWARD,
  emptySlide, emptyBlock, emptyQA, emptyBoard, validateSlide, validateLesson, slideStatus, slideLabel,
} from '../shared/lesson-rules.js';
import { TYPES, TYPE, emptyQuestion, validateQuestion, cellName, clean, newId, seriesOf, parseCloze, sentenceWords, parseSlash, SPEECH_LANGS } from '../shared/quiz-rules.js';
import * as sound from '../sound.js';
import { pickClassForLesson, publishDialog, classSummary, classChips } from './lesson-classes.js';
import { EDITORS, area, txt, box, imageField } from './qedit.js';
import { stepper, cmdLine } from './tests-list.js';
import { TYPE_ICON } from './test-editor.js';
import { extractDialog } from './extract.js';
import { lockBadge, lockedDialog, copyItem, lockText } from './locked.js';
import { saveTemplateDialog } from './templates.js';

export const SLIDE_ICON = { title: 'title', info: 'slides', copy: 'copyText', question: 'quiz', flashcards: 'cards', brainstorm: 'sticky', wheel: 'wheel', game: 'game' };
const STATUS_ICON = { ok: 'check', warn: 'info', error: 'warn', empty: 'plus' };
const STATUS_LABEL = { ok: 'gotowy', warn: 'gotowy (z uwagą)', error: 'do uzupełnienia', empty: 'pusty' };

/** Pytanie z testu → pytanie ustne do koła lub gry (tekst + odpowiedź dla nauczyciela). */
export function toQA(q) {
  const P = clean(q.prompt);
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const L = 'ABCDEFGH';
  let qq = P, a = '';
  switch (q.type) {
    case 'single': qq = `${P} ${q.options.map((o, i) => `${L[i]}) ${o}`).join('  ')}`; a = q.options[q.correct] ?? ''; break;
    case 'multi': qq = `${P} ${q.options.map((o, i) => `${L[i]}) ${o.text}`).join('  ')}`; a = q.options.filter((o) => o.correct).map((o) => o.text).join(', '); break;
    case 'truefalse': qq = `${P} ${q.statements.map((x, i) => `${i + 1}. ${x.text}`).join(' ')}`; a = q.statements.map((x, i) => `${i + 1} – ${x.answer ? 'prawda' : 'fałsz'}`).join(', '); break;
    case 'open': a = clean(q.sample) || seriesOf(q).map((x) => x[0]).filter(Boolean).join(', '); break;
    case 'number': a = `${q.value}${q.unit ? ` ${q.unit}` : ''}`; break;
    case 'match': a = q.pairs.map((p) => `${p.left} – ${p.right}`).join('; '); break;
    case 'order_words': qq = `${P} (${[...sentenceWords(q.sentence), ...parseSlash(q.distractors)].sort().join(', ')})`; a = q.sentence; break;
    case 'timeline': qq = `${P} (${[...q.items].sort().join(', ')})`; a = q.items.join(' → '); break;
    case 'cloze': case 'cloze_choice': {
      const segs = parseCloze(q.text, q.type === 'cloze' ? 'open' : 'choice').segments;
      qq = segs.map((x) => (x.t === 'gap' ? (q.type === 'cloze' ? '…' : `[${x.answers.join(' / ')}]`) : x.v)).join('');
      a = segs.filter((x) => x.t === 'gap').map((x) => x.answers[0]).join(', ');
      break;
    }
    case 'categorize': a = q.categories.map((c) => `${c.name}: ${parseSlash(c.items).join(', ')}`).join('; '); break;
    default: return null;
  }
  return { q: cut(clean(qq), LL.q), a: cut(clean(a), LL.a) };
}

export async function lessonEditorView({ base, id }) {
  const isAdmin = base === '/administracja';
  const listHref = isAdmin ? '/administracja/lekcje' : '/nauczyciel/panel/lekcje';
  const { lesson: L, subjects, classes: initialClasses } = await get(`/api/editor/lessons/${id}`);
  let classes = initialClasses || [];
  const wantCheck = new URLSearchParams(location.search).get('sprawdz') === '1';
  const wantSlide = Number(new URLSearchParams(location.search).get('slajd')) || 0;
  if (wantCheck || wantSlide) history.replaceState({}, '', location.pathname);
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: isAdmin ? 'Administracja' : 'Panel nauczyciela', href: listHref }, { label: 'Lekcje', href: listHref }, { label: L.title }]);
  const ui = new Map();
  const uiOf = (key) => { if (!ui.has(key)) ui.set(key, {}); return ui.get(key); };
  let current = wantCheck ? { view: 'check' } : wantSlide >= 1 && wantSlide <= L.slides.length ? { view: 'slide', index: wantSlide - 1 } : { view: L.slides.length > 1 ? 'all' : 'slide', index: 0 };

  /* ---------- Zapisywanie ---------- */
  let dirty = false, timer = null, saving = null;
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  const setSave = (st, msg) => {
    saveState.className = `save-state save-state--${st}`;
    saveState.replaceChildren(icon(st === 'saved' ? 'check' : st === 'error' ? 'warn' : 'clock'),
      h('span', {}, { pending: 'Zmiany czekają na zapis…', saving: 'Zapisywanie…', saved: 'Zapisano', error: msg || 'Nie zapisano – ponawiam' }[st]));
  };
  setSave('saved');
  function schedule() { dirty = true; setSave('pending'); clearTimeout(timer); timer = setTimeout(save, 900); lp?.update(); }
  let lp = null;
  async function save() {
    clearTimeout(timer);
    if (saving) await saving;
    if (!dirty) return;
    dirty = false;
    setSave('saving');
    saving = put(`/api/editor/lessons/${L.id}`, { title: L.title, summary: L.summary, subjectId: L.subjectId, settings: L.settings, slides: L.slides }).then((r) => {
      setSave('saved');
      if (r.classes) classes = r.classes;
      if (r.lock !== undefined && r.lock !== L.lock) { L.lock = r.lock; if (!r.lock) toast('Kopia ma już zmiany – możesz ją opublikować.'); }
      if (r.unpublished) { L.status = 'draft'; toast('Uczniowie chwilowo nie widzą lekcji, bo ma niekompletny slajd. Po poprawkach kliknij „Opublikuj dla…”, żeby ją przywrócić.', 'error'); }
      renderTop();
    }).catch((e) => {
      dirty = true;
      setSave('error', e.status === 0 ? 'Brak połączenia – zmiany zapiszą się, gdy wróci' : e.message);
      timer = setTimeout(save, 5000);
    }).finally(() => { saving = null; });
    return saving;
  }
  const beforeUnload = (e) => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  leaveGuards.add(async () => { lp?.destroy(); lp = null; await save(); removeEventListener('beforeunload', beforeUnload); if (window.__edukroEd?.id === L.id) delete window.__edukroEd; });
  const hasClass = () => true; // klasę wybiera się przy „Prowadź”
  const rosterText = () => 'Uczniów na koło i do drużyn EDUKRO bierze z klasy, którą wybierzesz po kliknięciu „Prowadź” (z rejestru szkoły – także tych bez konta).';

  /* ---------- Górny pasek ---------- */
  const top = h('header', { class: 'ed__top' });
  function renderTop() {
    const { pub, paused } = classSummary(classes);
    top.replaceChildren(
      h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie lekcje'),
      h('div', { class: 'ed__title' },
        h('h1', {}, L.title || 'Lekcja bez nazwy'),
        h('div', { class: 'ed__badges' },
          h('span', { class: 'kind-chip kind-chip--lesson' }, icon('lesson'), 'Lekcja'),
          L.lock ? lockBadge(L.lock, 'lesson') : pub.length ? h('span', { class: 'badge badge--ok', 'data-help': 'Klasy, których uczniowie widzą tę lekcję.' }, `Widzą: ${pub.map((c) => (c === 'wszyscy' ? 'wszyscy uczniowie' : c)).join(', ')}`)
            : paused.length ? h('span', { class: 'badge badge--wait' }, `Wstrzymana dla: ${paused.join(', ')}`) : h('span', { class: 'badge badge--plain' }, 'Uczniowie jej jeszcze nie widzą'),
          saveState)),
      h('div', { class: 'actions ed__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: previewLesson, title: 'Przejrzyj lekcję – punkty nie są zapisywane' }, icon('eye'), 'Podgląd'),
        L.lock === 'tutorial'
          ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await save(); await copyItem({ kind: 'lesson', id: L.id, base }); }), 'data-help': lockText('tutorial', 'lesson') }, icon('copy'), 'Kopiuj, aby opublikować')
          : h('button', { class: 'btn btn--ghost', type: 'button', onClick: openPublish, 'data-help': 'Wybierz klasy, które mają widzieć lekcję – bez prowadzenia jej na tablicy.' }, icon('flag'), 'Opublikuj dla…'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: presentLesson }, icon('present'), 'Prowadź lekcję')));
  }
  async function previewLesson() { await save(); navigate(`${base}/lekcja/${L.id}/podglad?slajd=${current.view === 'slide' ? current.index + 1 : 1}`); }
  async function presentLesson() { await save(); pickClassForLesson({ lessonId: L.id, base, lessonTitle: L.title, fromEditor: true }); }
  async function openPublish() {
    await save();
    if (L.lock) { lockedDialog({ kind: 'lesson', id: L.id, lock: L.lock, base }); return; }
    publishDialog({
      lessonId: L.id,
      onDone: (r) => { classes = r.classes; L.status = r.status; renderTop(); renderNav(); },
      onProblems: (e) => show({ view: 'check', serverProblems: e.body.problems, message: e.message }),
    });
  }
  const publish = () => openPublish();

  /* ---------- Nawigacja ---------- */
  const nav = h('nav', { class: 'ed__nav', 'aria-label': 'Części lekcji' });
  function renderNav() {
    const issues = validateLesson(L).errors;
    const item = (label, iconName, active, onClick, extra) => h('button', { type: 'button', class: ['ed-nav__item', active && 'is-active'], 'aria-current': active ? 'page' : null, onClick }, icon(iconName), h('span', {}, label), extra || null);
    const list = L.slides.map((s, i) => {
      const st = slideStatus(s, { hasClass: hasClass() });
      const active = current.view === 'slide' && current.index === i;
      return h('li', {}, h('button', { type: 'button', class: ['ed-q', `ed-q--${st}`, active && 'is-active'], 'aria-current': active ? 'page' : null, onClick: () => show({ view: 'slide', index: i }),
        'aria-label': `Slajd ${i + 1}: ${SLIDE[s.type].label} – ${STATUS_LABEL[st]}` },
      h('span', { class: 'ed-q__num' }, String(i + 1)),
      h('span', { class: 'ed-q__text' }, h('b', {}, SLIDE[s.type].label), h('small', {}, slideLabel(s))),
      h('span', { class: 'ed-q__st', 'aria-hidden': 'true' }, icon(STATUS_ICON[st]))));
    });
    nav.replaceChildren(
      item('Ustawienia lekcji', 'settings', current.view === 'settings', () => show({ view: 'settings' })),
      item('Wszystkie slajdy', 'list', current.view === 'all', () => show({ view: 'all' }), h('span', { class: 'ed-nav__count' }, String(L.slides.length))),
      h('ol', { class: 'ed-qs' }, ...list),
      L.slides.length < LL.slides ? item('Dodaj slajd', 'plus', current.view === 'add', () => show({ view: 'add' })) : null,
      item('Sprawdź lekcję', 'check', current.view === 'check', () => show({ view: 'check' }), issues ? h('span', { class: 'ed-nav__count ed-nav__count--bad' }, String(issues)) : h('span', { class: 'ed-nav__count ed-nav__count--ok' }, icon('check'))));
    nav.querySelector('.ed-q.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------- Panele ---------- */
  const main = h('div', { class: 'ed__main' });
  function show(next, { scroll = true } = {}) {
    current = next;
    let panel;
    if (next.view === 'settings') panel = settingsPanel();
    else if (next.view === 'all') panel = allPanel();
    else if (next.view === 'check') panel = checkPanel(next);
    else if (next.view === 'add') panel = addPanel(next.at);
    else panel = slidePanel(next.index);
    main.replaceChildren(panel);
    renderNav();
    lp?.now();
    if (scroll) { const y = main.getBoundingClientRect().top + scrollY - 90; if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
    if (next.focusField) requestAnimationFrame(() => {
      const el = main.querySelector(`[data-field="${next.focusField}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    });
  }

  /* --- Ustawienia --- */
  function settingsPanel() {
    const title = txt(L.title, (v) => { L.title = v; schedule(); renderTop(); }, { maxlength: LL.title, 'data-field': 'title' });
    const summary = area(L.summary, (v) => { L.summary = v; schedule(); }, { rows: 2, maxlength: LL.summary, placeholder: 'Krótki opis widoczny dla ucznia (opcjonalnie)' });
    const subject = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id), selected: s.id === L.subjectId }, s.name)));
    subject.addEventListener('change', () => { L.subjectId = Number(subject.value); schedule(); });
    return h('div', { class: 'ed-panel' },
      h('h2', { class: 'ed-panel__title' }, 'Ustawienia lekcji'),
      box('Podstawowe informacje', null,
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nazwa lekcji'), title),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Przedmiot'), subject),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Opis dla ucznia'), summary)),
      box('Klasy', 'Jedna lekcja służy wszystkim klasom – nie trzeba robić osobnej dla 7a i 7b.',
        h('ul', { class: 'how-list' },
          h('li', {}, icon('present'), h('span', {}, h('b', {}, 'Prowadź lekcję'), ' – wybierasz klasę. Na kole fortuny i w grach są jej uczniowie, a gdy dojdziesz do końca, uczniowie tej klasy zobaczą lekcję u siebie.')),
          h('li', {}, icon('flag'), h('span', {}, h('b', {}, 'Opublikuj dla…'), ' – udostępniasz lekcję wybranym klasom bez prowadzenia (albo ją ukrywasz).'))),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Kto teraz widzi lekcję'), classChips(classes)),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: openPublish }, icon('flag'), 'Opublikuj dla…'))),
      L.lock ? notice(L.lock === 'tutorial' ? 'info' : 'warn', lockText(L.lock, 'lesson')) : null,
      h('div', { class: 'actions actions--end' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'all' }) }, 'Przejdź do slajdów', icon('arrowRight'))),
      h('div', { class: 'danger-zone' },
        h('span', { class: 'muted small' }, L.author ? `Autor: ${L.author}` : ''),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await save(); await copyItem({ kind: 'lesson', id: L.id, base }); }) }, icon('copy'), 'Kopiuj lekcję'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-help': 'Zapisuje układ tej lekcji (slajdy, elementy, wygląd, obrazki, czasy) bez tekstu – jako szablon do kolejnych lekcji.', onClick: () => saveTemplateDialog({ kind: 'lesson', sourceId: L.id, title: L.title, beforeSave: save }) }, icon('sparkle'), 'Zapisz jako szablon'),
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', disabled: !L.canDelete, title: L.canDelete ? 'Usuń lekcję' : 'Usunąć może tylko autor albo administrator', onClick: () => dialog({
            iconName: 'trash', title: `Usunąć lekcję „${L.title}”?`, body: h('p', {}, 'Lekcja zniknie z listy. Punkty przyznane już uczniom na lekcjach zostaną zachowane.'),
            actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń lekcję', kind: 'danger', onClick: async () => { dirty = false; clearTimeout(timer); await del(`/api/editor/lessons/${L.id}`); toast('Lekcja usunięta.'); navigate(listHref); } }],
          }) }, icon('trash'), 'Usuń lekcję'))));
  }

  /* --- Wszystkie slajdy --- */
  function allPanel() {
    const ctx = { hasClass: hasClass() };
    const cards = L.slides.map((s, i) => {
      const st = slideStatus(s, ctx);
      const act = (label, ic, fn, disabled) => h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': `${label} (slajd ${i + 1})`, disabled, onClick: (e) => { e.stopPropagation(); fn(); } }, icon(ic));
      return h('div', { class: ['q-card', `q-card--${st}`] },
        h('button', { class: 'q-card__main', type: 'button', onClick: () => show({ view: 'slide', index: i }) },
          h('span', { class: 'q-card__num' }, String(i + 1)),
          h('span', { class: 'q-card__icon' }, icon(SLIDE_ICON[s.type])),
          h('span', { class: 'q-card__body' }, h('b', {}, SLIDE[s.type].label, s.type === 'game' ? ` · ${GAME[s.game]?.label || ''}` : ''), h('span', {}, slideLabel(s))),
          h('span', { class: `q-card__st q-card__st--${st}` }, icon(STATUS_ICON[st]), STATUS_LABEL[st])),
        h('div', { class: 'q-card__acts' },
          act('Przesuń w górę', 'up', () => move(i, -1), i === 0),
          act('Przesuń w dół', 'down', () => move(i, 1), i === L.slides.length - 1),
          act('Duplikuj', 'copy', () => dup(i), L.slides.length >= LL.slides),
          act('Usuń', 'trash', () => del(i), L.slides.length <= 1)));
    });
    return h('div', { class: 'ed-panel' },
      h('div', { class: 'ed-panel__head' }, h('div', {}, h('h2', { class: 'ed-panel__title' }, 'Wszystkie slajdy'),
        h('p', { class: 'muted' }, `Slajdów: ${L.slides.length}. Kliknij slajd, aby go edytować. Kolejność zmienisz strzałkami.`)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: extractQuestions }, icon('extract'), 'Slajdy z pytań z testów'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => saveTemplateDialog({ kind: 'lesson', sourceId: L.id, title: L.title, beforeSave: save }) }, icon('sparkle'), 'Zapisz jako szablon'))),
      h('div', { class: 'q-cards' }, ...cards),
      L.slides.length < LL.slides ? h('button', { class: 'btn btn--ghost add-q', type: 'button', onClick: () => show({ view: 'add' }) }, icon('plus'), 'Dodaj slajd') : null);
  }
  function move(i, d) { const [x] = L.slides.splice(i, 1); L.slides.splice(i + d, 0, x); schedule(); show({ view: 'all' }, { scroll: false }); }
  function dup(i) { const c = JSON.parse(JSON.stringify(L.slides[i])); c.id = newId(); if (c.question) c.question.id = newId(); L.slides.splice(i + 1, 0, c); schedule(); show({ view: 'all' }, { scroll: false }); toast(`Skopiowano slajd ${i + 1}.`); }
  function del(i) {
    dialog({ iconName: 'trash', title: `Usunąć slajd ${i + 1}?`, body: h('p', {}, `${SLIDE[L.slides[i].type].label}: ${slideLabel(L.slides[i])}`),
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń slajd', kind: 'danger', onClick: () => { L.slides.splice(i, 1); schedule(); show({ view: 'all' }, { scroll: false }); } }] });
  }
  function extractQuestions() {
    extractDialog({
      title: 'Slajdy z pytaniami z testów i sprawdzianów', excludeId: L.id, room: LL.slides - L.slides.length,
      onPick(list) {
        for (const q of list) {
          const copy = JSON.parse(JSON.stringify(q)); delete copy.catName; copy.id = newId(); copy.cat = '';
          L.slides.push({ ...emptySlide('question'), question: copy });
        }
        schedule(); show({ view: 'all' }); toast(`Dodano slajdy z pytaniami: ${list.length}.`);
      },
    });
  }

  /* --- Nowy slajd --- */
  function addPanel(at = L.slides.length) {
    return h('div', { class: 'ed-panel' },
      h('h2', { class: 'ed-panel__title' }, 'Dodaj slajd'),
      h('div', { class: 'type-grid type-grid--slides' }, ...SLIDE_TYPES.map((t) => {
        const b = h('button', { type: 'button', class: 'type-card' }, h('span', { class: 'type-card__icon' }, icon(SLIDE_ICON[t.key])), h('span', { class: 'type-card__title' }, t.label), h('span', { class: 'type-card__desc' }, t.desc));
        b.addEventListener('click', () => { L.slides.splice(at, 0, emptySlide(t.key)); schedule(); show({ view: 'slide', index: at }); });
        return b;
      })));
  }

  /* --- Edycja slajdu --- */
  function slidePanel(i) {
    const s = L.slides[i];
    if (!s) return allPanel();
    const n = L.slides.length;
    const cmdLines = new Map();
    const problemsBox = h('div', { class: 'qp-problems', 'aria-live': 'polite' });
    const listeners = [];
    const c = {
      ui: uiOf(s.id),
      changed(structural) { schedule(); if (structural) rerender(); else refresh(); },
      cmd(field) { const l = cmdLine(); cmdLines.set(field, l); return l.el; },
      onAnyChange(fn) { listeners.push(fn); },
    };
    const rerender = () => { const y = scrollY; main.replaceChildren(slidePanel(i)); renderNav(); scrollTo({ top: y }); };
    function refresh() {
      const v = validateSlide(s, { hasClass: hasClass() });
      for (const [field, line] of cmdLines) { const cmd = v.commands.find((x) => x.field === field); line.set(cmd ? cmd.ok : false, cmd ? cmd.msg : null); }
      problemsBox.replaceChildren(v.problems.length ? h('div', { class: 'problems' }, h('h3', {}, v.problems.some((p) => p.level === 'error') ? 'Do uzupełnienia na tym slajdzie' : 'Uwagi'),
        h('ul', {}, ...v.problems.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg),
          p.field === 'class' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => show({ view: 'settings', focusField: 'grade' }) }, 'Wybierz klasę') : null))))
        : notice('ok', h('strong', {}, 'Slajd jest gotowy. '), 'Zobacz go w podglądzie, żeby sprawdzić, jak wygląda na tablicy.'));
      listeners.forEach((f) => f());
      renderNav();
    }
    const head = h('div', { class: 'qp-head' },
      h('button', { class: 'back qp-back', type: 'button', onClick: () => show({ view: 'all' }) }, icon('arrowLeft'), 'Wszystkie slajdy'),
      h('div', { class: 'qp-title' }, h('h2', {}, `Slajd ${i + 1}`, h('span', { class: 'muted' }, ` z ${n}`)),
        h('span', { class: 'type-chip' }, icon(SLIDE_ICON[s.type]), SLIDE[s.type].label),
        h('button', { class: 'linkish', type: 'button', onClick: async () => { await save(); navigate(`${base}/lekcja/${L.id}/podglad?slajd=${i + 1}`); } }, 'Podgląd tego slajdu'),
        h('button', { class: 'linkish', type: 'button', 'data-help': 'W podglądzie kliknij „Wygląd”: zmienisz rozmiar, czcionkę i kolor napisów, przesuniesz elementy, wykadrujesz obrazek i wybierzesz tło slajdu.', onClick: async () => { await save(); navigate(`${base}/lekcja/${L.id}/podglad?slajd=${i + 1}&wyglad=1`); } }, icon('palette'), 'Zmień wygląd'),
        s.look ? h('button', { class: 'linkish', type: 'button', onClick: () => { delete s.look; c.changed(true); toast('Przywrócono zwykły wygląd slajdu (tło i napisy tytułu).'); } }, 'Przywróć zwykłe tło i tytuł') : null));
    const foot = h('div', { class: 'qp-foot' },
      h('button', { class: 'btn btn--ghost', type: 'button', disabled: i === 0, onClick: () => show({ view: 'slide', index: i - 1 }) }, icon('arrowLeft'), 'Poprzedni'),
      i < n - 1 ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'slide', index: i + 1 }) }, 'Następny slajd', icon('arrowRight'))
        : h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'add', at: n }) }, icon('plus'), 'Dodaj kolejny slajd'));
    const body = SLIDE_EDITORS[s.type](s, c, { rerender, hasClass, rosterText, sayLang: subjectLang(subjects.find((x) => x.id === L.subjectId)?.name) });
    const panel = h('div', { class: 'ed-panel' }, head, body, problemsBox, foot);
    refresh();
    return panel;
  }

  /* --- Sprawdź lekcję --- */
  function checkPanel({ serverProblems, message }) {
    const { problems } = serverProblems ? { problems: serverProblems } : validateLesson(L);
    const errors = problems.filter((p) => p.level === 'error');
    const groups = new Map();
    for (const p of problems) { const k = p.where === 'settings' ? 'settings' : p.i; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const goBtn = (p) => (p.where === 'settings'
      ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => show({ view: p.field === 'slides' ? 'add' : 'settings', focusField: p.field }) }, p.field === 'slides' ? 'Dodaj slajd' : 'Przejdź do ustawień')
      : h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => (p.field === 'class' ? show({ view: 'settings', focusField: 'grade' }) : show({ view: 'slide', index: p.i })) }, p.field === 'class' ? 'Wybierz klasę' : `Przejdź do slajdu ${p.i + 1}`));
    return h('div', { class: 'ed-panel' },
      h('h2', { class: 'ed-panel__title' }, 'Sprawdź lekcję'),
      errors.length ? notice('warn', h('strong', {}, message || `Do poprawienia: ${errors.length} ${plural(errors.length, ['rzecz', 'rzeczy', 'rzeczy'])}. `), ' Lekcję możesz już prowadzić na tablicy, ale uczniowie zobaczą ją dopiero po publikacji.')
        : notice('ok', h('strong', {}, 'Wszystko gotowe! '), L.status === 'published' ? 'Lekcja jest opublikowana.' : 'Możesz opublikować lekcję.'),
      ...[...groups].map(([k, list]) => h('section', { class: 'check-group' },
        h('h3', {}, k === 'settings' ? 'Ustawienia lekcji' : `Slajd ${k + 1} · ${SLIDE[L.slides[k]?.type]?.label || ''}`),
        h('ul', {}, ...list.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg), goBtn(p)))))),
      !errors.length && L.status !== 'published' ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => publish(e.currentTarget) }, icon('flag'), 'Opublikuj lekcję')) : null);
  }

  /* Samouczek: „Wpisz za mnie” wstawia gotowy slajd w miejsce bieżącego (albo na koniec). */
  window.__edukroEd = {
    kind: 'lesson', id: L.id,
    count: () => L.slides.length,
    current: () => ({ ...current }),
    slideType: (i) => L.slides[i]?.type || null,
    fill(index, data) {
      const sl = JSON.parse(JSON.stringify(data));
      const at = Math.min(Math.max(0, index), L.slides.length);
      sl.id = L.slides[at]?.id || newId();
      for (const b of sl.blocks || []) b.id = newId();
      if (sl.question) sl.question.id = L.slides[at]?.question?.id || newId();
      if (at >= L.slides.length) L.slides.push(sl); else L.slides[at] = sl;
      schedule();
      show({ view: 'slide', index: at });
    },
    show: (next) => show(next),
  };

  renderTop();
  const root = h('div', { class: 'ed wrap' }, top, h('div', { class: 'ed__body' }, nav, main));
  main.addEventListener('focusin', (e) => { if (e.target.matches('textarea, input.input:not([type="number"])') && e.target.closest('.say-scope')) lastField = e.target; });
  // podgląd na żywo: bieżący slajd (w widoku listy – pierwszy)
  lp = livePreview({
    getSlide: () => { const i = current.view === 'slide' ? Math.min(current.index, L.slides.length - 1) : 0; return { slide: L.slides[i], index: i, total: L.slides.length }; },
    accent: () => subjects.find((x) => x.id === L.subjectId)?.accent || 'amber',
    // kliknięcie = zwykły podgląd tego slajdu; po wyjściu wracasz do edytora tego samego slajdu
    onOpen: async () => { await save(); const i = current.view === 'slide' ? Math.min(current.index, L.slides.length - 1) : 0; navigate(`${base}/lekcja/${L.id}/podglad?slajd=${i + 1}&z=slajd`); },
  });
  show(current, { scroll: false });
  return root;
}

/* ====================================================================== */
/* Edytory poszczególnych rodzajów slajdów                                 */
/* ====================================================================== */
const labelled = (label, el, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), el, hint ? h('span', { class: 'field__hint' }, hint) : null);
const removeBtn = (label, onClick, disabled) => h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': label, title: label, disabled, onClick }, icon('trash'));
const addBtn = (label, onClick, { count, max } = {}) => h('button', { class: 'btn btn--ghost btn--sm add-btn', type: 'button', disabled: max !== undefined && count >= max, onClick }, icon('plus'), label, max !== undefined ? h('span', { class: 'add-btn__count' }, `${count}/${max}`) : null);
const titleField = (s, c, label = 'Tytuł slajdu', placeholder = 'np. Budowa atomu') => labelled(label, txt(s.title, (v) => { s.title = v; c.changed(); }, { maxlength: LL.title, placeholder, 'data-field': 'title' }));
const hiddenHelp = () => h('p', { class: 'field__hint' }, 'Słowo w klamrach ', h('code', {}, '{Warszawa}'), ' będzie zasłonięte – odsłonisz je kliknięciem na tablicy.');

/* ---------- „Do wymowy”: zaznacz słowo w tekście → lektor przeczyta je po kliknięciu na tablicy ---------- */
let lastField = null;
const sayPrefs = { lang: null, voice: '' };
function subjectLang(name = '') {
  const n = String(name).toLocaleLowerCase('pl-PL');
  return /angiel/.test(n) ? 'en-GB' : /niemiec/.test(n) ? 'de-DE' : /francus/.test(n) ? 'fr-FR' : /hiszpa/.test(n) ? 'es-ES' : /włos/.test(n) ? 'it-IT' : /rosyj/.test(n) ? 'ru-RU' : 'pl-PL';
}
function sayTool(defLang = 'pl-PL') {
  const open = () => {
    const f = lastField;
    const a = f?.selectionStart ?? 0, b = f?.selectionEnd ?? 0;
    if (!f || !f.isConnected || a === b) {
      dialog({ iconName: 'mic', title: 'Do wymowy – zaznacz słowo', body: [
        h('p', {}, 'Najpierw zaznacz myszką słowo albo całe zdanie w tekście slajdu (w tekście, punktach, tabeli albo na fiszce), a potem kliknij „Do wymowy”.'),
        h('p', { class: 'small muted' }, 'Na tablicy takie słowo będzie podkreślone – po kliknięciu lektor przeczyta je na głos, za każdym razem od nowa.')],
      actions: [{ label: 'Rozumiem', kind: 'primary' }] });
      return;
    }
    const raw = f.value.slice(a, b);
    if (/\[\[|\]\]/.test(raw)) { toast('To zaznaczenie jest już (częściowo) do wymowy. Zaznacz inny fragment.', 'error'); return; }
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    const sel = raw.trim();
    if (!sel) return;
    let lang = sayPrefs.lang || defLang, voice = sayPrefs.voice;
    const langSel = h('select', { class: 'select' }, ...SPEECH_LANGS.map(([id, n]) => h('option', { value: id, selected: id === lang }, n)));
    langSel.addEventListener('change', () => { lang = langSel.value; });
    const voiceSel = h('select', { class: 'select' }, ...[['', 'Głos z ustawień osoby, która ogląda'], ...sound.VOICES.map((v) => [v.id, `${v.name} – ${v.sub}`])].map(([id, n]) => h('option', { value: id, selected: id === voice }, n)));
    voiceSel.addEventListener('change', () => { voice = voiceSel.value; });
    const spoken = sel.replace(/\{[^}]*\}/g, ', ').replace(/\s+/g, ' ');
    dialog({
      iconName: 'mic', title: 'Do wymowy',
      body: [h('p', {}, 'Lektor przeczyta: ', h('b', {}, `„${sel.replace(/[{}]/g, '')}”`)),
        /\{/.test(sel) ? h('p', { class: 'small muted' }, 'Zasłonięte słowo {…} lektor pominie, dopóki go nie odsłonisz – po odsłonięciu przeczyta je od razu.') : null,
        h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Język'), langSel), h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Lektor (opcjonalnie)'), voiceSel)),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => sound.speak(spoken, { force: true, lang, voice: voice || null }) }, icon('play'), 'Posłuchaj'))],
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Zaznacz do wymowy', kind: 'primary', onClick: () => {
        sayPrefs.lang = lang; sayPrefs.voice = voice;
        const opts = lang !== 'pl-PL' || voice ? `|${lang}${voice ? `|${voice}` : ''}` : '';
        f.value = `${f.value.slice(0, a)}${lead}[[${sel}${opts}]]${trail}${f.value.slice(b)}`;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        toast('Gotowe – na tablicy to słowo będzie podkreślone i przeczytane po kliknięciu.');
      } }],
    });
  };
  // mousedown nie zabiera zaznaczenia z pola tekstowego
  const btn = h('button', { class: 'btn btn--ghost btn--sm say-tool__btn', type: 'button', onMousedown: (e) => e.preventDefault(), onClick: open }, icon('mic'), 'Do wymowy');
  return h('div', { class: 'say-tool', 'data-help': 'Do wymowy: zaznacz słowo albo zdanie w tekście i kliknij – na tablicy lektor przeczyta je po kliknięciu.' }, btn,
    h('span', { class: 'field__hint' }, 'Zaznacz słowo albo zdanie i kliknij – lektor przeczyta je na tablicy po kliknięciu. Zapis: ', h('code', {}, '[[słowo]]'), '.'));
}

function blocksEditor(s, c) {
  const root = h('div', { class: 'blocks-ed' });
  s.blocks.forEach((b, i) => {
    const kind = h('div', { class: 'seg seg--sm', role: 'radiogroup', 'aria-label': 'Rodzaj elementu' }, ...BLOCK_KINDS.map((k) => {
      const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': String(b.kind === k.key) }, k.label);
      btn.addEventListener('click', () => { if (b.kind === k.key) return; const nb = emptyBlock(k.key); nb.id = b.id; nb.style = b.style; nb.appear = b.appear; nb.delay = b.delay; s.blocks[i] = nb; c.changed(true); });
      return btn;
    }));
    const style = h('select', { class: 'select select--sm', 'aria-label': 'Wygląd' }, ...BLOCK_STYLES.map((x) => h('option', { value: x.key, selected: b.style === x.key }, x.label)));
    style.addEventListener('change', () => { b.style = style.value; c.changed(); });
    const appear = h('select', { class: 'select select--sm', 'aria-label': 'Kiedy się pojawia' }, ...APPEAR.map((x) => h('option', { value: x.key, selected: b.appear === x.key }, x.label)));
    appear.addEventListener('change', () => { b.appear = appear.value; c.changed(true); });
    const delay = b.appear === 'delay' ? h('div', { class: 'blk-delay' }, txt(b.delay, (v) => { b.delay = v; c.changed(); }, { maxlength: 8, inputmode: 'decimal', placeholder: 'np. 0.20', style: { maxWidth: '120px' }, 'aria-label': 'Po jakim czasie' }),
      h('span', { class: 'field__hint' }, 'minuty.sekundy od pokazania slajdu, np. 0.20 = 20 s'), c.cmd(`delay${i}`)) : null;
    let content;
    if (b.kind === 'text') content = [area(b.text, (v) => { b.text = v; c.changed(); }, { rows: 3, maxlength: LL.text, placeholder: 'np. Stolicą Polski jest {Warszawa}.' }), hiddenHelp()];
    else if (b.kind === 'list') {
      content = [h('div', { class: 'blk-items' }, ...b.items.map((it, j) => h('div', { class: 'blk-item' }, h('span', { class: 'blk-item__dot' }),
        txt(it, (v) => { b.items[j] = v; c.changed(); }, { maxlength: LL.item, placeholder: `Punkt ${j + 1}`, class: 'input blk-item-input' }),
        removeBtn(`Usuń punkt ${j + 1}`, () => { b.items.splice(j, 1); c.changed(true); }, b.items.length <= 1)))),
      addBtn('Dodaj punkt', () => { b.items.push(''); c.changed(true); }, { count: b.items.length, max: LL.listItems }), hiddenHelp()];
    } else if (b.kind === 'table') {
      const t = b.table;
      const rows = stepper({ value: t.rows, min: 1, max: LL.tableDim, label: 'Wiersze', onChange: (v) => { resize(v, t.cols); } });
      const cols = stepper({ value: t.cols, min: 1, max: LL.tableDim, label: 'Kolumny', onChange: (v) => { resize(t.rows, v); } });
      const resize = (R, C) => { t.cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, k) => t.cells[r]?.[k] ?? '')); t.rows = R; t.cols = C; c.changed(true); };
      const head = h('input', { type: 'checkbox', checked: t.header });
      head.addEventListener('change', () => { t.header = head.checked; c.changed(true); });
      content = [h('div', { class: 'tb-dims' }, h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Wiersze'), rows.el), h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Kolumny'), cols.el), h('label', { class: 'check-row' }, head, 'Pierwszy wiersz to nagłówek')),
        h('div', { class: 'blk-table-ed' }, h('table', {}, ...t.cells.map((row, r) => h('tr', {}, ...row.map((cell, k) => h('td', { class: t.header && r === 0 ? 'is-head' : null },
          txt(cell, (v) => { t.cells[r][k] = v; c.changed(); }, { maxlength: LL.cell, 'aria-label': `Komórka ${cellName(r, k)}`, placeholder: t.header && r === 0 ? 'nagłówek' : '' }))))))), hiddenHelp()];
    } else {
      const cov = switchEl({ label: 'Zasłoń obrazek', sub: 'Na tablicy obrazek jest zakryty, dopóki go nie klikniesz.', checked: b.covered, onChange: (v) => { b.covered = v; c.changed(); } });
      content = [imageField({ value: b.image, onChange: (img) => { b.image = img; c.changed(true); } }),
        labelled('Podpis (opcjonalnie)', txt(b.caption, (v) => { b.caption = v; c.changed(); }, { maxlength: LL.caption, placeholder: 'np. Budowa komórki zwierzęcej' })), cov.el,
        h('p', { class: 'field__hint' }, 'Na tablicy obrazek można powiększać, przesuwać i obracać.')];
    }
    root.append(h('section', { class: 'blk-ed', 'data-field': `block${i}` },
      h('div', { class: 'blk-ed__head' }, h('span', { class: 'opt-letter' }, String(i + 1)), kind,
        h('div', { class: 'blk-ed__acts' },
          b.look ? h('button', { class: 'linkish small', type: 'button', title: 'Rozmiar, czcionkę, kolor, położenie albo kadr ustawiono w podglądzie („Wygląd”).', onClick: () => { delete b.look; c.changed(true); } }, icon('palette'), 'Przywróć zwykły wygląd') : null,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Wyżej', disabled: i === 0, onClick: () => { const [x] = s.blocks.splice(i, 1); s.blocks.splice(i - 1, 0, x); c.changed(true); } }, icon('up')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Niżej', disabled: i === s.blocks.length - 1, onClick: () => { const [x] = s.blocks.splice(i, 1); s.blocks.splice(i + 1, 0, x); c.changed(true); } }, icon('down')),
          removeBtn(`Usuń element ${i + 1}`, () => { s.blocks.splice(i, 1); c.changed(true); }, s.blocks.length <= 1))),
      h('div', { class: 'blk-ed__opts' }, labelled('Wygląd', style), labelled('Kiedy się pojawia', appear), delay),
      ...content, b.kind !== 'image' ? c.cmd(`block${i}`) : null));
  });
  root.append(h('div', { class: 'actions' }, ...BLOCK_KINDS.map((k) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: s.blocks.length >= LL.blocks, onClick: () => { s.blocks.push(emptyBlock(k.key)); c.changed(true); } }, icon('plus'), k.label))));
  return root;
}

function qaList(list, c, { title, lead, minHint, max = LL.gameQuestions, allowExtract = true }) {
  const root = box(title, lead);
  list.forEach((x, i) => {
    root.append(h('div', { class: 'qa-row' }, h('span', { class: 'opt-letter' }, String(i + 1)),
      h('div', { class: 'qa-row__fields' },
        area(x.q, (v) => { x.q = v; c.changed(); }, { rows: 1, maxlength: LL.q, placeholder: 'Pytanie, np. Jaki jest symbol chemiczny tlenu?', class: 'textarea qa-q', 'aria-label': `Pytanie ${i + 1}` }),
        txt(x.a, (v) => { x.a = v; c.changed(); }, { maxlength: LL.a, placeholder: 'Odpowiedź (widzisz ją po kliknięciu „Pokaż odpowiedź”)', 'aria-label': `Odpowiedź ${i + 1}` })),
      removeBtn(`Usuń pytanie ${i + 1}`, () => { list.splice(i, 1); c.changed(true); })));
  });
  root.append(h('div', { class: 'actions' },
    addBtn('Dodaj pytanie', () => { list.push(emptyQA()); c.changed(true); requestAnimationFrame(() => [...document.querySelectorAll('.qa-q')].pop()?.focus()); }, { count: list.length, max }),
    allowExtract ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => extractDialog({
      title: 'Pytania z testów do gry', room: max - list.length,
      onPick(qs) {
        let added = 0, skipped = 0;
        for (const q of qs) { const qa = toQA(q); if (qa && list.length < max) { list.push(qa); added++; } else skipped++; }
        c.changed(true);
        toast(`Dodano pytania: ${added}.${skipped ? ` Pominięto ${skipped} (tabele i obrazki nie nadają się do zadawania ustnie).` : ''}`);
      },
    }) }, icon('extract'), 'Dodaj pytania z testów') : null),
  minHint ? h('p', { class: 'field__hint' }, minHint) : null, c.cmd('questions'));
  return root;
}

const SLIDE_EDITORS = {
  title(s, c) {
    return box(null, null, titleField(s, c, 'Tytuł', 'np. Budowa atomu'),
      labelled('Podtytuł (opcjonalnie)', area(s.subtitle, (v) => { s.subtitle = v; c.changed(); }, { rows: 2, maxlength: LL.summary, placeholder: 'np. Chemia, klasa 7 – lekcja 5' })),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Obrazek (opcjonalnie)'), imageField({ value: s.image, onChange: (img) => { s.image = img; c.changed(); } })));
  },
  info(s, c, o) {
    return h('div', {}, box(null, null, titleField(s, c)),
      box('Zawartość slajdu', 'Dodaj tekst, punkty, tabelę albo obrazek. Każdy element może pojawić się od razu, na kliknięcie (strzałka w prawo / „Pokaż dalej”) albo sam po czasie.', sayTool(o.sayLang), h('div', { class: 'say-scope' }, blocksEditor(s, c))));
  },
  copy(s, c, o) {
    const time = txt(s.time, (v) => { s.time = v; c.changed(); }, { maxlength: 8, inputmode: 'decimal', placeholder: 'np. 5', style: { maxWidth: '140px' }, 'data-field': 'time' });
    return h('div', {}, box(null, null, titleField(s, c, 'Tytuł slajdu', 'np. Notatka: budowa atomu'),
      labelled('Czas na przepisanie', time, 'W minutach: 5 = 5 minut, 2.30 = 2 min 30 s. Na tablicy u góry pojawi się pasek czasu – uruchomisz go przyciskiem Start.'), c.cmd('time')),
    box('Tekst do przepisania', 'Tak jak na slajdzie informacyjnym.', sayTool(o.sayLang), h('div', { class: 'say-scope' }, blocksEditor(s, c))));
  },
  question(s, c, { rerender }) {
    const q = s.question;
    if (!q.type) {
      return box('Wybierz rodzaj pytania', 'Pytanie działa jak w testach – klasa odpowiada na tablicy, a EDUKRO od razu sprawdza odpowiedź i pokazuje poprawną.',
        h('div', { class: 'type-grid' }, ...TYPES.map((t) => {
          const b = h('button', { type: 'button', class: 'type-card' }, h('span', { class: 'type-card__icon' }, icon(TYPE_ICON[t.key])), h('span', { class: 'type-card__title' }, t.label), h('span', { class: 'type-card__desc' }, t.desc));
          b.addEventListener('click', () => { const fresh = emptyQuestion(t.key); fresh.id = q.id; if (clean(q.prompt)) fresh.prompt = q.prompt; s.question = fresh; c.changed(true); });
          return b;
        })));
    }
    // ten sam formularz co w edytorze testów
    const qc = {
      ui: c.ui, kind: 'teaching_test', cellErrors: new Set(),
      changed: (structural) => c.changed(structural),
      cmd: (f) => c.cmd(f),
      onAnyChange: (fn) => c.onAnyChange(fn),
      onProblems: (fn) => c.onAnyChange(() => { qc.cellErrors = new Set(validateQuestion(q, { kind: 'teaching_test' }).problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(','))); fn(); }),
      spellingNote: () => h('p', { class: 'field__hint spell-note' }, icon('info'), 'Ortografio-zaliczacz jest włączony: drobne literówki i brak polskich znaków nie są błędem.'),
    };
    qc.cellErrors = new Set(validateQuestion(q, { kind: 'teaching_test' }).problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));
    return h('div', {},
      box(null, null,
        h('div', { class: 'qp-title' }, h('span', { class: 'type-chip' }, icon(TYPE_ICON[q.type]), TYPE[q.type].label),
          h('button', { class: 'linkish', type: 'button', onClick: () => dialog({ iconName: 'info', title: 'Zmienić rodzaj pytania?', body: h('p', {}, 'Treść pytania zostanie, odpowiedzi trzeba będzie wpisać od nowa.'), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Wybierz inny rodzaj', kind: 'primary', onClick: () => { s.question = { ...emptyQuestion(null), id: q.id, prompt: q.prompt === TYPE[q.type]?.prompt ? '' : q.prompt }; c.changed(true); } }] }) }, 'Zmień rodzaj pytania')),
        titleField(s, c, 'Nagłówek nad pytaniem (opcjonalnie)', 'np. Sprawdź się!'),
        labelled('Treść pytania', area(q.prompt, (v) => { q.prompt = v; c.changed(); }, { rows: 2, maxlength: 1200, 'data-field': 'prompt', placeholder: 'np. Jaki jest symbol chemiczny sodu?' })),
        q.type === 'image_labels' ? null : h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Obrazek do pytania (opcjonalnie)'), imageField({ value: q.image, onChange: (img) => { q.image = img; c.changed(); } }))),
      EDITORS[q.type](q, qc),
      box('Dodatkowe (opcjonalnie)', null,
        labelled('Podpowiedź', area(q.hint, (v) => { q.hint = v; c.changed(); }, { rows: 1, maxlength: 500, placeholder: 'Pojawi się po kliknięciu „Podpowiedź”.' })),
        labelled('Wyjaśnienie', area(q.explanation, (v) => { q.explanation = v; c.changed(); }, { rows: 2, maxlength: 1200, placeholder: 'Pokazywane po błędnej odpowiedzi.' }))));
  },
  flashcards(s, c, o) {
    const root = box('Fiszki', `Od 1 do ${LL.cards} kart. Z przodu pojęcie albo pytanie, z tyłu wyjaśnienie. Na tablicy karta odwraca się po kliknięciu.`, sayTool(o.sayLang));
    root.classList.add('say-scope');
    s.cards.forEach((card, i) => root.append(h('div', { class: 'fc-row' }, h('span', { class: 'opt-letter' }, String(i + 1)),
      area(card.front, (v) => { card.front = v; c.changed(); }, { rows: 2, maxlength: LL.cardText, placeholder: 'Przód, np. Proton', class: 'textarea fc-front', 'aria-label': `Fiszka ${i + 1} – przód` }),
      area(card.back, (v) => { card.back = v; c.changed(); }, { rows: 2, maxlength: LL.cardText, placeholder: 'Tył, np. cząstka o ładunku dodatnim w jądrze atomu', 'aria-label': `Fiszka ${i + 1} – tył` }),
      removeBtn(`Usuń fiszkę ${i + 1}`, () => { s.cards.splice(i, 1); c.changed(true); }, s.cards.length <= 1))));
    root.append(addBtn('Dodaj fiszkę', () => { s.cards.push({ front: '', back: '' }); c.changed(true); requestAnimationFrame(() => [...document.querySelectorAll('.fc-front')].pop()?.focus()); }, { count: s.cards.length, max: LL.cards }));
    return h('div', {}, box(null, null, titleField(s, c, 'Tytuł slajdu', 'np. Powtórka pojęć')), root, c.cmd('cards'));
  },
  brainstorm(s, c) {
    return box('Burza mózgów', 'Na tablicy pojawi się pytanie i pole do wpisywania. W trakcie lekcji wpisujesz pomysły uczniów – pojawiają się jako kolorowe karteczki (kliknięcie usuwa karteczkę).',
      titleField(s, c, 'Nagłówek (opcjonalnie)', 'np. Burza mózgów'),
      labelled('Pytanie albo temat', area(s.prompt, (v) => { s.prompt = v; c.changed(); }, { rows: 2, maxlength: LL.prompt, placeholder: 'np. Gdzie w domu spotykasz reakcje chemiczne?', 'data-field': 'prompt' })));
  },
  wheel(s, c, { rosterText }) {
    const rm = switchEl({ label: 'Wylosowana osoba znika z koła', sub: 'Dzięki temu każdy odpowie raz, zanim ktoś odpowie drugi raz. Wylosowanych przywrócisz jednym kliknięciem.', checked: s.removePicked !== false, onChange: (v) => { s.removePicked = v; c.changed(); } });
    return h('div', {},
      box('Koło fortuny', null,
        h('div', { class: 'help-card' }, icon('wheel'), h('div', {},
          h('p', {}, 'Na kole są imiona uczniów klasy. Klikasz „Zakręć kołem”, wylosowana osoba odpowiada ustnie, a Ty klikasz ', h('b', {}, 'Dobrze'), ' albo ', h('b', {}, 'Źle'), '.'),
          h('p', {}, `Za dobrą odpowiedź uczeń dostaje +${AWARD.wheel} pkt. Jeśli nie ma jeszcze konta, punkty czekają na niego pod jego imieniem i nazwiskiem.`),
          h('p', { class: 'small muted', 'data-roster-info': '' }, rosterText()))),
        titleField(s, c, 'Tytuł slajdu', 'np. Kto odpowie?'), rm.el),
      qaList(s.questions, c, { title: 'Pytania (opcjonalnie)', lead: 'Jeśli je wpiszesz, po każdym losowaniu na tablicy pojawi się kolejne pytanie. Bez pytań – pytasz ustnie.', max: LL.wheelQuestions }));
  },
  game(s, c) {
    const picker = h('div', { class: 'kind-cards kind-cards--3 kind-cards--compact', role: 'radiogroup', 'aria-label': 'Rodzaj gry' }, ...GAMES.map((g) => {
      const b = h('button', { type: 'button', class: 'kind-card', role: 'radio', 'aria-checked': String(s.game === g.key) },
        h('span', { class: 'kind-card__icon' }, icon(g.key === 'duel' ? 'users' : g.key === 'tictactoe' ? 'qTable' : 'trophy')), h('span', { class: 'kind-card__title' }, g.label), h('p', { class: 'small muted' }, g.desc));
      b.addEventListener('click', () => { s.game = g.key; if (g.key === 'vabanque' && !(s.board || []).length) s.board = emptyBoard(); c.changed(true); });
      return b;
    }));
    const common = box('Gra klasowa', `Klasa dzieli się losowo na dwie drużyny (czerwoni i niebiescy) – zaznaczasz osoby nieobecne, a gdy przez nie różnica przekroczy 2 osoby, drużyny losują się od nowa. Każda osoba z wygranej drużyny dostaje +${AWARD.gameWin} pkt (remis: +${AWARD.gameDraw} pkt dla wszystkich).`,
      picker, titleField(s, c, 'Tytuł slajdu (opcjonalnie)', 'np. Pojedynek chemików'));
    if (s.game === 'vabanque') return h('div', {}, common, boardEditor(s, c));
    return h('div', {}, common, qaList(s.questions, c, {
      title: 'Pytania', lead: s.game === 'duel' ? 'Pytania pojawiają się po kolei. Liczba pytań musi być nieparzysta (co najmniej 5), żeby zawsze był zwycięzca.' : 'Każde wybrane pole to kolejne pytanie z listy. Po błędnej odpowiedzi pole zostaje wolne, więc przygotuj kilka zapasowych (najlepiej 12–15).',
    }));
  },
};

function boardEditor(s, c) {
  s.board ||= emptyBoard();
  const root = box('Plansza Va banque', `Od 2 do ${LL.vbCats} kategorii, w każdej od ${LL.vbMinPer} do ${LL.vbPer} pytań – za 100, 200, 300… punktów (od najłatwiejszego).`);
  const grid = h('div', { class: 'vb-ed', style: { '--cols': String(s.board.length) } });
  s.board.forEach((cat, i) => {
    grid.append(h('div', { class: 'vb-ed__col' },
      h('div', { class: 'vb-ed__head' }, txt(cat.name, (v) => { cat.name = v; c.changed(); }, { maxlength: 60, placeholder: `Kategoria ${i + 1}`, 'aria-label': `Nazwa kategorii ${i + 1}` }),
        removeBtn(`Usuń kategorię ${i + 1}`, () => { s.board.splice(i, 1); c.changed(true); }, s.board.length <= 2)),
      ...cat.questions.map((x, j) => h('div', { class: 'vb-ed__q' }, h('span', { class: 'vb-ed__val' }, String((j + 1) * 100)),
        area(x.q, (v) => { x.q = v; c.changed(); }, { rows: 2, maxlength: LL.q, placeholder: 'Pytanie', 'aria-label': `${cat.name || `Kategoria ${i + 1}`} za ${(j + 1) * 100} – pytanie` }),
        txt(x.a, (v) => { x.a = v; c.changed(); }, { maxlength: LL.a, placeholder: 'Odpowiedź', 'aria-label': `${cat.name || `Kategoria ${i + 1}`} za ${(j + 1) * 100} – odpowiedź` }))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', disabled: cat.questions.length >= LL.vbPer, onClick: () => { cat.questions.push(emptyQA()); c.changed(true); } }, icon('plus'), `+ ${(cat.questions.length + 1) * 100}`),
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', disabled: cat.questions.length <= LL.vbMinPer, onClick: () => { cat.questions.pop(); c.changed(true); } }, icon('minus'), 'Usuń ostatnie'))));
  });
  root.append(h('div', { class: 'vb-ed-wrap' }, grid),
    addBtn('Dodaj kategorię', () => { s.board.push({ name: '', questions: [emptyQA(), emptyQA(), emptyQA()] }); c.changed(true); }, { count: s.board.length, max: LL.vbCats }));
  return root;
}
