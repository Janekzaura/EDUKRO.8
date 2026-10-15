// Edytor testu: ustawienia, lista pytań, edycja pojedynczego pytania, sprawdzanie i publikacja.
// Zmiany zapisują się automatycznie (szkic może być niekompletny).
import { h, icon, notice, toast, dialog, withBusy, switchEl, plural } from '../ui.js';
import { get, put, post, del } from '../api.js';
import { navigate, setCrumbs, leaveGuards } from '../app.js';
import {
  TYPES, TYPE, LIMITS, RULES, emptyQuestion, newId, validateQuestion, validateTest, questionStatus, parseTime, cellName, clean,
  DEFAULT_SETTINGS, GRADE_NAMES, effectiveCount,
} from '../shared/quiz-rules.js';
import { extractDialog } from './extract.js';
import { EDITORS, area, txt, box, imageField } from './qedit.js';
import { KIND, stepper, cmdLine } from './tests-list.js';
import { COLORS, TEXTS, FONTS } from '../shared/shop.js';
import { lockBadge, lockedDialog, copyItem, lockText } from './locked.js';
import { saveTemplateDialog } from './templates.js';

const REWARD_ITEMS = [
  ['Kolory', COLORS.filter((c) => c.tier !== 'default').map((c) => [`color:${c.id}`, `${c.name}${c.tier === 'premium' ? ' (premium)' : ''}`])],
  ['Kolor tekstu', TEXTS.filter((c) => c.tier !== 'default').map((c) => [`text:${c.id}`, c.name])],
  ['Czcionki', FONTS.filter((c) => c.tier !== 'default').map((c) => [`font:${c.id}`, c.name])],
];
const PROMO_ITEMS = [['Inne', [['all', 'Cały sklep'], ['lifeline', 'Koło ratunkowe'], ['praise', 'Pochwała od wychowawcy']]], ...REWARD_ITEMS];
const DURATIONS = [[1, '1 godzina'], [3, '3 godziny'], [24, '1 dzień'], [72, '3 dni'], [168, '1 tydzień'], [336, '2 tygodnie']];
function grouped(groups, value) {
  return groups.map(([label, items]) => h('optgroup', { label }, ...items.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
}

export const TYPE_ICON = {
  single: 'qSingle', multi: 'qMulti', truefalse: 'qTrueFalse', open: 'qOpen', number: 'qNumber', match: 'qMatch',
  order_words: 'qOrder', timeline: 'qTimeline', cloze: 'qCloze', cloze_choice: 'qClozeChoice', table: 'qTable',
  categorize: 'qCategorize', image_labels: 'qImage', data: 'qData', listen: 'volume',
};
const STATUS_ICON = { ok: 'check', warn: 'info', error: 'warn', empty: 'plus' };
const STATUS_LABEL = { ok: 'gotowe', warn: 'gotowe (z uwagą)', error: 'do uzupełnienia', empty: 'nie wybrano rodzaju' };

export async function editorView({ base, id }) {
  const isAdmin = base === '/administracja';
  const listHref = isAdmin ? '/administracja/testy' : '/nauczyciel/panel/testy';
  const { test: T, subjects } = await get(`/api/editor/tests/${id}`);
  T.settings.categories ||= [];
  T.settings.gradeScale ||= DEFAULT_SETTINGS.gradeScale.slice();
  const wantExtract = new URLSearchParams(location.search).get('wyodrebnij') === '1';
  if (wantExtract) history.replaceState({}, '', location.pathname);
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: isAdmin ? 'Administracja' : 'Panel nauczyciela', href: listHref }, { label: 'Testy', href: listHref }, { label: T.title }]);

  const qui = new Map(); // stan interfejsu pytań (np. wybrane narzędzie tabeli)
  const uiOf = (q) => { if (!qui.has(q.id)) qui.set(q.id, {}); return qui.get(q.id); };
  let current = { view: T.questions.some((q) => q.type) || !T.questions.length ? 'all' : 'question', index: 0 };

  /* ---------- Zapisywanie ---------- */
  let dirty = false, timer = null, saving = null;
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  const setSave = (s, msg) => {
    saveState.className = `save-state save-state--${s}`;
    saveState.replaceChildren(icon(s === 'saved' ? 'check' : s === 'error' ? 'warn' : 'clock'),
      h('span', {}, { pending: 'Zmiany czekają na zapis…', saving: 'Zapisywanie…', saved: 'Zapisano', error: msg || 'Nie zapisano – ponawiam' }[s]));
  };
  setSave('saved');
  const payload = () => ({ title: T.title, summary: T.summary, kind: T.kind, subjectId: T.subjectId, settings: T.settings, questions: T.questions });
  function schedule() { dirty = true; setSave('pending'); clearTimeout(timer); timer = setTimeout(save, 900); }
  async function save() {
    clearTimeout(timer);
    if (saving) await saving;
    if (!dirty) return;
    dirty = false;
    setSave('saving');
    saving = put(`/api/editor/tests/${T.id}`, payload()).then((r) => {
      setSave('saved');
      if (r.lock !== undefined && r.lock !== T.lock) { T.lock = r.lock; if (!r.lock) toast('Kopia ma już zmiany – możesz ją opublikować.'); }
      if (r.unpublished) {
        T.status = 'draft';
        toast('Test wrócił do szkicu, bo ma niekompletne pytanie. Po poprawkach opublikuj go ponownie.', 'error');
      }
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
  leaveGuards.add(async () => { await save(); removeEventListener('beforeunload', beforeUnload); if (window.__edukroEd?.id === T.id) delete window.__edukroEd; });

  const vctx = () => {
    const dt = parseTime(T.settings.defaultTime);
    return { kind: T.kind, categories: T.settings.categories, defaultTimeMissing: T.kind === 'exam_test' && (dt.empty || !dt.ok) };
  };
  const quiz = () => T.kind === 'quiz';

  /* ---------- Górny pasek ---------- */
  const top = h('header', { class: 'ed__top' });
  function renderTop() {
    const pub = T.status === 'published';
    const publishBtn = pub
      ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: unpublish }, 'Wycofaj publikację')
      : T.lock === 'tutorial'
        ? h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await save(); await copyItem({ kind: 'test', id: T.id, base }); }), 'data-help': lockText('tutorial', 'test') }, icon('copy'), 'Kopiuj, aby opublikować')
        : h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => publish(e.currentTarget) }, icon('flag'), 'Opublikuj');
    top.replaceChildren(
      h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie testy'),
      h('div', { class: 'ed__title' },
        h('h1', {}, T.title || 'Test bez nazwy'),
        h('div', { class: 'ed__badges' },
          h('span', { class: `kind-chip kind-chip--${T.kind}` }, icon(KIND[T.kind].icon), KIND[T.kind].label),
          T.lock ? lockBadge(T.lock, 'test') : pub ? h('span', { class: 'badge badge--ok' }, 'Opublikowany – uczniowie go widzą') : h('span', { class: 'badge badge--plain' }, 'Szkic – uczniowie go nie widzą'),
          saveState)),
      h('div', { class: 'actions ed__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: preview }, icon('eye'), 'Podgląd ucznia'),
        publishBtn));
  }
  async function preview() { await save(); navigate(`${base}/test/${T.id}/podglad`); }
  async function publish(btn) {
    await withBusy(btn, async () => {
      await save();
      if (T.lock) { lockedDialog({ kind: 'test', id: T.id, lock: T.lock, base }); return; }
      try {
        await post(`/api/editor/tests/${T.id}/publish`);
        T.status = 'published';
        renderTop();
        toast('Test opublikowany – uczniowie już go widzą.');
      } catch (e) {
        if (e.status === 422) { show({ view: 'check', serverProblems: e.body.problems, message: e.message }); }
        else toast(e.message, 'error');
      }
    });
  }
  function unpublish() {
    dialog({
      iconName: 'info', title: 'Wycofać publikację?',
      body: h('p', {}, 'Test zniknie z listy uczniów i wróci do szkicu. Wyniki uczniów, którzy już go rozwiązali, zostaną zachowane.'),
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Wycofaj publikację', kind: 'primary', onClick: async () => {
        await save(); await post(`/api/editor/tests/${T.id}/unpublish`); T.status = 'draft'; renderTop(); toast('Test wrócił do szkicu.');
      } }],
    });
  }

  /* ---------- Nawigacja (lewa kolumna / pasek na telefonie) ---------- */
  const nav = h('nav', { class: 'ed__nav', 'aria-label': 'Części testu' });
  function renderNav() {
    const ctx = vctx();
    const issues = validateTest(T).errors;
    const item = (label, iconName, active, onClick, extra) => h('button', { type: 'button', class: ['ed-nav__item', active && 'is-active'], 'aria-current': active ? 'page' : null, onClick }, icon(iconName), h('span', {}, label), extra || null);
    const qs = T.questions.map((q, i) => {
      const st = questionStatus(q, ctx);
      const active = current.view === 'question' && current.index === i;
      return h('li', {}, h('button', { type: 'button', class: ['ed-q', `ed-q--${st}`, active && 'is-active'], 'aria-current': active ? 'page' : null,
        'aria-label': `Pytanie ${i + 1}: ${q.type ? TYPE[q.type].label : 'nie wybrano rodzaju'} – ${STATUS_LABEL[st]}`, onClick: () => show({ view: 'question', index: i }) },
      h('span', { class: 'ed-q__num' }, String(i + 1)),
      h('span', { class: 'ed-q__text' }, h('b', {}, q.type ? TYPE[q.type].label : 'Wybierz rodzaj'), h('small', {}, clean(q.prompt) || (q.type ? 'bez treści' : '—'))),
      h('span', { class: 'ed-q__st', 'aria-hidden': 'true' }, icon(STATUS_ICON[st]))));
    });
    nav.replaceChildren(
      item('Ustawienia testu', 'settings', current.view === 'settings', () => show({ view: 'settings' })),
      item('Wszystkie pytania', 'list', current.view === 'all', () => show({ view: 'all' }), h('span', { class: 'ed-nav__count' }, String(T.questions.length))),
      h('ol', { class: 'ed-qs' }, ...qs),
      T.questions.length < LIMITS.questions ? h('button', { type: 'button', class: 'ed-nav__item ed-nav__add', onClick: addQuestion }, icon('plus'), h('span', {}, 'Dodaj pytanie')) : null,
      T.questions.length < LIMITS.questions ? h('button', { type: 'button', class: 'ed-nav__item ed-nav__add', onClick: openExtract }, icon('extract'), h('span', {}, 'Wyodrębnij pytania')) : null,
      item('Sprawdź test', 'check', current.view === 'check', () => show({ view: 'check' }), issues ? h('span', { class: 'ed-nav__count ed-nav__count--bad' }, String(issues)) : h('span', { class: 'ed-nav__count ed-nav__count--ok' }, icon('check'))));
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
    else panel = questionPanel(next.index, next);
    main.replaceChildren(panel);
    renderNav();
    if (scroll) {
      const y = main.getBoundingClientRect().top + scrollY - 90;
      if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    if (next.focusCell || next.focusField) requestAnimationFrame(() => jumpTo(next));
  }

  function jumpTo({ focusCell, focusField }) {
    let el = null;
    if (focusCell) el = main.querySelector(`td[data-cell="${focusCell.join(',')}"]`);
    else if (focusField) el = main.querySelector(`[data-field="${focusField}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    const inp = el.matches('input, textarea') ? el : el.querySelector('input:not([readonly]), textarea');
    setTimeout(() => inp?.focus({ preventScroll: true }), 350);
  }

  function addQuestion() {
    if (T.questions.length >= LIMITS.questions) return toast(`Test może mieć najwyżej ${LIMITS.questions} pytań.`, 'error');
    T.questions.push(emptyQuestion(null));
    schedule();
    show({ view: 'question', index: T.questions.length - 1 });
  }

  /* --- Wyodrębnianie pytań z innych testów, sprawdzianów i lekcji --- */
  function openExtract() {
    extractDialog({
      excludeId: T.id,
      room: LIMITS.questions - T.questions.filter((q) => q.type || clean(q.prompt)).length,
      onPick(list) {
        // puste, nieruszone pytania z kreatora testu zastępujemy wyodrębnionymi
        T.questions = T.questions.filter((q) => q.type || clean(q.prompt));
        const cats = T.settings.categories;
        for (const src of list) {
          const q = JSON.parse(JSON.stringify(src));
          const name = clean(q.catName || '');
          delete q.catName;
          q.id = newId();
          q.cat = '';
          if (name) {
            let c = cats.find((x) => clean(x.name).toLocaleLowerCase('pl-PL') === name.toLocaleLowerCase('pl-PL'));
            if (!c && cats.length < LIMITS.qCategories) { c = { id: newId(), name }; cats.push(c); }
            if (c) q.cat = c.id;
          }
          if (T.questions.length < LIMITS.questions) T.questions.push(q);
        }
        if (!T.questions.length) T.questions.push(emptyQuestion(null));
        let msg = `Wyodrębniono pytania: ${list.length}.`;
        if (T.kind === 'exam_test') {
          T.settings.maxMistakes = Math.floor(effectiveCount(T) / 5);
          msg += ` Dozwolone błędy: ${T.settings.maxMistakes} (liczba pytań ÷ 5, w dół).`;
        }
        schedule();
        show({ view: 'all' });
        toast(msg);
      },
    });
  }

  /* --- Ustawienia testu --- */
  function settingsPanel() {
    const S = T.settings;
    const title = txt(T.title, (v) => { T.title = v; schedule(); renderTop(); }, { maxlength: LIMITS.title, 'data-field': 'title' });
    const summary = area(T.summary, (v) => { T.summary = v; schedule(); }, { rows: 2, maxlength: LIMITS.summary, placeholder: 'Krótki opis widoczny dla ucznia (opcjonalnie)' });
    const subject = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id), selected: s.id === T.subjectId }, s.name)));
    subject.addEventListener('change', () => { T.subjectId = Number(subject.value); schedule(); });

    const kindCards = h('div', { class: 'kind-cards kind-cards--compact', role: 'radiogroup', 'aria-label': 'Rodzaj testu' }, ...Object.entries(KIND).map(([k, v]) => {
      const b = h('button', { type: 'button', class: 'kind-card', role: 'radio', 'aria-checked': String(T.kind === k) }, h('span', { class: 'kind-card__icon' }, icon(v.icon)), h('span', { class: 'kind-card__title' }, v.label),
        h('ul', {}, ...(k === 'exam_test'
          ? ['Czas na każde pytanie', 'Limit błędów – po przekroczeniu przegrana', `Przegrana: ${RULES.examFailCooldownMin} min przerwy · zaliczenie: powtórka za ${RULES.examRepeatDays} dni`]
          : k === 'quiz'
            ? [`Co najmniej ${RULES.quizMinQuestions} pytań z kategorii (działów)`, 'Sprawdzany dopiero na końcu, bez podpowiedzi', `Ocena 1–6, najwyżej ${RULES.quizMaxAttempts} podejścia, termin`]
            : ['Bez limitu czasu', 'Po błędzie poprawna odpowiedź i wyjaśnienie', 'Błędne pytania wracają do skutku']).map((x) => h('li', {}, x))));
      b.addEventListener('click', () => {
        T.kind = k;
        if (k === 'quiz' && !T.settings.deadline) T.settings.deadline = defaultDeadline();
        schedule(); renderTop(); show({ view: 'settings' }, { scroll: false });
      });
      return b;
    }));

    const time = txt(S.defaultTime, (v) => { S.defaultTime = v; schedule(); checkTime(); renderNav(); }, { maxlength: 8, inputmode: 'decimal', style: { maxWidth: '140px' }, 'data-field': 'defaultTime' });
    const tline = cmdLine();
    const checkTime = () => { const t = parseTime(S.defaultTime); tline.set(t.ok && !t.empty, t.ok ? (t.empty ? 'Wpisz domyślny czas, np. 1.00 – albo ustaw czas przy każdym pytaniu.' : `Komenda napisana poprawnie – ${t.pretty} na pytanie (jeśli pytanie nie ma własnego czasu).`) : t.error); };
    checkTime();

    const sw = (label, sub, key) => switchEl({ label, sub, checked: S[key], onChange: (v) => { S[key] = v; schedule(); } }).el;
    const pts = (label, key) => h('div', { class: 'field' }, h('span', { class: 'field__label' }, label),
      stepper({ value: S.points[key], min: 0, max: 1000, label, onChange: (v) => { S.points[key] = v; schedule(); } }).el);
    const exam = T.kind === 'exam_test';
    const isQuiz = T.kind === 'quiz';

    // losowanie pytań z puli
    const n = T.questions.length;
    const drawOn = Number(S.drawCount) > 0;
    const drawStep = stepper({ value: drawOn ? Number(S.drawCount) : Math.max(1, Math.min(n, isQuiz ? RULES.quizMinQuestions : Math.ceil(n / 2))), min: 1, max: Math.max(1, n), label: 'Ile pytań dostaje uczeń', onChange: (v) => { S.drawCount = v; schedule(); drawInfo(); renderNav(); } });
    const drawLine = h('p', { class: 'field__hint' });
    const drawInfo = () => { drawLine.textContent = Number(S.drawCount) > 0 ? `Każdy uczeń dostanie ${Math.min(Number(S.drawCount), n)} z ${n} pytań – wybranych losowo, za każdym razem innych.` : `Każdy uczeń dostaje wszystkie pytania (${n}).`; };
    drawInfo();
    const drawSw = switchEl({ label: 'Losuj pytania z puli', sub: 'Przygotuj więcej pytań (np. 20), a uczeń dostanie tylko część (np. 10) – za każdym razem inne, losowo wybrane.', checked: drawOn,
      onChange: (v) => { S.drawCount = v ? drawStep.value() : 0; schedule(); drawBox.hidden = !v; drawInfo(); renderNav(); } });
    const drawBox = h('div', { class: 'field', hidden: !drawOn, 'data-field': 'drawCount' }, h('span', { class: 'field__label' }, 'Ile pytań dostaje uczeń'), drawStep.el);

    // kategorie pytań (działy)
    const catList = h('div', { class: 'cat-list', 'data-field': 'categories' });
    const renderCats = () => {
      catList.replaceChildren(...S.categories.map((c, i) => {
        const used = T.questions.filter((q) => q.cat === c.id).length;
        return h('div', { class: 'cat-row' },
          h('span', { class: 'cat-row__dot', style: { '--h': String((i * 67) % 360) } }),
          txt(c.name, (v) => { c.name = v; schedule(); renderNav(); }, { maxlength: LIMITS.qCategoryName, placeholder: `np. ${['Budowa atomu', 'Wiązania chemiczne', 'Reakcje chemiczne'][i % 3]}`, 'aria-label': `Nazwa kategorii ${i + 1}` }),
          h('span', { class: 'muted small' }, `${used} ${plural(used, ['pytanie', 'pytania', 'pytań'])}`),
          h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': `Usuń kategorię ${c.name || i + 1}`, onClick: () => {
            const go = () => { S.categories.splice(i, 1); T.questions.forEach((q) => { if (q.cat === c.id) q.cat = ''; }); schedule(); renderCats(); renderNav(); };
            if (!used) return go();
            dialog({ iconName: 'trash', title: `Usunąć kategorię „${c.name}”?`, body: h('p', {}, `${used} ${plural(used, ['pytanie straci', 'pytania stracą', 'pytań straci'])} przypisanie – trzeba będzie wybrać dla nich inną kategorię.`), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń kategorię', kind: 'danger', onClick: go }] });
          } }, icon('trash')));
      }), S.categories.length < LIMITS.qCategories ? h('button', { class: 'btn btn--ghost btn--sm add-btn', type: 'button', onClick: () => { S.categories.push({ id: newId(), name: '' }); schedule(); renderCats(); catList.querySelector('.cat-row:last-of-type input')?.focus(); } }, icon('plus'), 'Dodaj kategorię') : null);
    };
    renderCats();

    // sprawdzian: termin i progi ocen
    const toLocal = (ms) => { if (!ms) return ''; const d = new Date(ms); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const deadline = h('input', { class: 'input', type: 'datetime-local', value: toLocal(S.deadline), 'data-field': 'deadline', style: { maxWidth: '260px' } });
    const dlInfo = h('p', { class: 'field__hint' });
    const dlUpd = () => { dlInfo.textContent = S.deadline ? (S.deadline < Date.now() ? 'Ten termin już minął – uczniowie nie mogą rozwiązać sprawdzianu.' : `Uczniowie mogą rozwiązywać sprawdzian do: ${new Date(S.deadline).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`) : 'Ustaw termin – po nim sprawdzianu nie da się już rozwiązać.'; };
    deadline.addEventListener('change', () => { S.deadline = deadline.value ? new Date(deadline.value).getTime() : null; schedule(); dlUpd(); renderNav(); });
    dlUpd();
    const scale = h('div', { class: 'grade-scale', 'data-field': 'gradeScale' }, h('div', { class: 'grade-scale__row grade-scale__row--1' }, h('b', {}, '1'), h('span', {}, GRADE_NAMES[0]), h('span', { class: 'muted small' }, 'poniżej progu na 2')),
      ...S.gradeScale.map((v, i) => {
        const inp = h('input', { class: 'input', type: 'number', min: 1, max: 100, value: String(v), inputmode: 'numeric', 'aria-label': `Próg na ocenę ${i + 2} (%)` });
        inp.addEventListener('input', () => { S.gradeScale[i] = Number(inp.value); schedule(); renderNav(); });
        return h('div', { class: `grade-scale__row grade-scale__row--${i + 2}` }, h('b', {}, String(i + 2)), h('span', {}, GRADE_NAMES[i + 1]), h('label', { class: 'grade-scale__in' }, 'od', inp, '%'));
      }));

    /* --- test tymczasowy --- */
    function tempBox() {
      const on = !!S.expiresAt;
      const inp = h('input', { class: 'input', type: 'datetime-local', value: toLocal(S.expiresAt), 'data-field': 'expiresAt', style: { maxWidth: '260px' } });
      const info = h('p', { class: 'field__hint' });
      const upd = () => {
        info.textContent = S.expiresAt ? (S.expiresAt < Date.now() ? 'Ten czas już minął – test zniknął z listy uczniów.' : `Uczniowie widzą test do: ${new Date(S.expiresAt).toLocaleString('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Na liście ma specjalną ramkę z odliczaniem, a gdy zostaje mało czasu, uczniowie dostają przypomnienie w skrzynce.`) : '';
      };
      const set = (ms) => { S.expiresAt = ms; inp.value = toLocal(ms); schedule(); upd(); renderNav(); };
      inp.addEventListener('change', () => set(inp.value ? new Date(inp.value).getTime() : null));
      const presets = h('div', { class: 'chips' }, ...[[1, 'za godzinę'], [24, 'za dzień'], [168, 'za tydzień']].map(([hrs, l]) => h('button', { class: 'chip chip--btn', type: 'button', onClick: () => set(Date.now() + hrs * 3600e3) }, l)));
      const body = h('div', { class: 'field', hidden: !on }, h('span', { class: 'field__label' }, 'Test zniknie'), presets, inp, info);
      const sw = switchEl({ label: 'Test tymczasowy', sub: 'Po wybranym czasie test sam zniknie z listy uczniów (wyniki zostają). Dobre na wyzwanie dnia albo tygodnia.', checked: on,
        onChange: (v) => { body.hidden = !v; if (v && !S.expiresAt) set(Date.now() + 24 * 3600e3); if (!v) set(null); } });
      upd();
      return box('Test tymczasowy', null, sw.el, body);
    }
    /* --- nagroda --- */
    function rewardBox() {
      const r = S.reward || null;
      const type = h('select', { class: 'select', 'data-field': 'reward' }, h('option', { value: '' }, 'Bez nagrody (tylko punkty)'), h('option', { value: 'item', selected: r?.type === 'item' }, 'Przedmiot ze sklepu (kolor, kolor tekstu, czcionka)'), h('option', { value: 'promo', selected: r?.type === 'promo' }, 'Promocja na wybrany produkt'));
      const item = h('select', { class: 'select' }, ...grouped(REWARD_ITEMS, r?.type === 'item' ? r.item : 'color:emerald'));
      const pitem = h('select', { class: 'select' }, ...grouped(PROMO_ITEMS, r?.type === 'promo' ? r.item : 'color:gold'));
      const off = stepper({ value: r?.type === 'promo' ? r.off : 30, min: 5, max: 90, label: 'Zniżka (%)', onChange: () => save2() });
      const hours = h('select', { class: 'select' }, ...DURATIONS.map(([v, l]) => h('option', { value: String(v), selected: (r?.hours || 24) === v }, l)));
      const minGrade = h('select', { class: 'select' }, ...[2, 3, 4, 5, 6].map((g) => h('option', { value: String(g), selected: (S.rewardMinGrade || 4) === g }, `${g} (${GRADE_NAMES[g - 1]}) lub wyższa`)));
      const itemRow = h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Co uczeń dostanie'), item);
      const promoRow = h('div', {}, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Na co promocja'), pitem),
        h('div', { class: 'row-2' }, h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Zniżka (%)'), off.el), h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Ważna przez'), hours)),
        h('p', { class: 'field__hint' }, 'Promocja działa tylko dla tego ucznia – zaczyna się, gdy odbierze nagrodę w skrzynce.'));
      const gradeRow = isQuiz ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Za jaką ocenę'), minGrade) : null;
      const vis = () => { itemRow.hidden = type.value !== 'item'; promoRow.hidden = type.value !== 'promo'; if (gradeRow) gradeRow.hidden = !type.value; };
      function save2() {
        S.reward = type.value === 'item' ? { type: 'item', item: item.value } : type.value === 'promo' ? { type: 'promo', item: pitem.value, off: off.value(), hours: Number(hours.value) } : null;
        if (isQuiz) S.rewardMinGrade = Number(minGrade.value);
        vis(); schedule();
      }
      [type, item, pitem, hours, minGrade].forEach((x) => x.addEventListener('change', save2));
      vis();
      return box('Nagroda za test', `Oprócz punktów możesz dać nagrodę – trafi do skrzynki ucznia ${isQuiz ? 'za wybraną ocenę' : T.kind === 'exam_test' ? 'po zaliczeniu egzaminu' : 'po ukończeniu testu'} (raz na ucznia). Uczniowie widzą ją na liście testów.`,
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Rodzaj nagrody'), type), itemRow, promoRow, gradeRow);
    }

    return h('div', { class: 'ed-panel' },
      h('h2', { class: 'ed-panel__title' }, 'Ustawienia testu'),
      box('Podstawowe informacje', null,
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nazwa testu'), title),
        h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Przedmiot'), subject),
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Liczba pytań'), h('p', { class: 'static-val' }, `${T.questions.length} – dodawaj i usuwaj w „Wszystkie pytania”`))),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Opis dla ucznia'), summary)),
      box('Rodzaj testu', 'Testy różnią się czasem, limitem błędów, sprawdzaniem i zasadami powtarzania.', kindCards),
      isQuiz ? box('Zasady sprawdzianu', `Uczeń odpowiada na wszystkie pytania bez podpowiedzi i bez informacji, czy dobrze odpowiedział – wszystko sprawdzamy na końcu. Sprawdzian można rozwiązać najwyżej ${RULES.quizMaxAttempts} razy. Ocena jest tylko dla ucznia (nie trafia do dziennika).`,
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Termin (do kiedy można rozwiązywać)'), deadline, dlInfo),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Progi ocen (% poprawnych odpowiedzi)'), scale),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Punkty za ocenę (liczy się najlepsza ocena ucznia)'),
          h('div', { class: 'chips' }, ...RULES.gradePoints.map((p, i) => h('span', { class: 'chip' }, `${i + 1} → ${p} pkt`))))) : null,
      box('Kategorie pytań (działy)', isQuiz ? 'Sprawdzian łączy pytania z kilku tematów. Każde pytanie musi mieć kategorię – na końcu uczeń zobaczy, z których działów poszło mu najsłabiej i co powtórzyć.' : 'Opcjonalne – pomagają porządkować pytania. Przy wyodrębnianiu pytań kategorie przenoszą się razem z nimi.', catList),
      isQuiz ? null : tempBox(),
      rewardBox(),
      box('Losowanie pytań', null, drawSw.el, drawBox, drawLine),
      exam ? box('Zasady egzaminu', null,
        h('div', { class: 'row-2' },
          h('div', { class: 'field', 'data-field': 'maxMistakes' }, h('span', { class: 'field__label' }, 'Ile błędów może popełnić uczeń'),
            stepper({ value: S.maxMistakes, min: 0, max: 50, label: 'Maksymalna liczba błędów', onChange: (v) => { S.maxMistakes = v; schedule(); } }).el,
            h('span', { class: 'field__hint' }, 'Jeden błąd więcej = egzamin przegrany. Przekroczenie czasu też jest błędem.')),
          h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Domyślny czas na pytanie'), time,
            h('span', { class: 'field__hint' }, 'W minutach: 1 = minuta, 2.30 = 2 min 30 s, 0.45 = 45 s.'), tline.el))) : null,
      box('Sprawdzanie odpowiedzi', null,
        sw('Ortografio-zaliczacz', 'Odpowiedź różniąca się 1–2 literami (krótkie słowa: 1 literą) jest zaliczana. Brak polskich znaków (s zamiast ś, o zamiast ó) nie jest błędem. Liczby muszą być dokładne.', 'spelling'),
        sw('Losowa kolejność pytań', 'Każdy uczeń dostaje pytania w innej kolejności.', 'shuffleQuestions'),
        sw('Losowa kolejność odpowiedzi', 'Odpowiedzi A–D i opcje wyboru są tasowane.', 'shuffleAnswers')),
      isQuiz ? null : box('Punkty dla ucznia', 'Punkty uczeń wymienia w sklepie EDUKRO.',
        h('div', { class: 'row-3' }, ...(exam
          ? [pts('Pierwsze zaliczenie', 'examFirst'), pts('Każda powtórka (co tydzień)', 'examRepeat')]
          : [pts('Pierwsze ukończenie', 'teachingFirst'), h('p', { class: 'field__hint', style: { alignSelf: 'center' } }, 'Kolejne ukończenia testu nauczającego nie dają punktów.')]))),
      T.lock ? notice(T.lock === 'tutorial' ? 'info' : 'warn', lockText(T.lock, 'test')) : null,
      h('div', { class: 'actions actions--end' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'all' }) }, 'Przejdź do pytań', icon('arrowRight'))),
      h('div', { class: 'danger-zone' },
        h('span', { class: 'muted small' }, T.author ? `Autor: ${T.author}` : ''),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await save(); await copyItem({ kind: 'test', id: T.id, base }); }) }, icon('copy'), 'Kopiuj test'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-help': 'Zapisuje układ tego testu (rodzaje pytań, ustawienia, czasy) bez tekstu – jako szablon do kolejnych testów.', onClick: () => saveTemplateDialog({ kind: 'test', sourceId: T.id, title: T.title, beforeSave: save }) }, icon('sparkle'), 'Zapisz jako szablon'),
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', disabled: !T.canDelete, title: T.canDelete ? 'Usuń test' : 'Usunąć może tylko autor albo administrator', onClick: () => dialog({
            iconName: 'trash', title: `Usunąć test „${T.title}”?`, body: h('p', {}, T.attempts ? 'Uczniowie już rozwiązywali ten test – zniknie z listy, ale ich wyniki i punkty zostaną zachowane.' : 'Test zostanie usunięty na stałe.'),
            actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń test', kind: 'danger', onClick: async () => { dirty = false; clearTimeout(timer); await del(`/api/editor/tests/${T.id}`); toast('Test usunięty.'); navigate(listHref); } }],
          }) }, icon('trash'), 'Usuń test'))));
  }

  /* --- Wszystkie pytania --- */
  function allPanel() {
    const ctx = vctx();
    const cards = T.questions.map((q, i) => {
      const st = questionStatus(q, ctx);
      const act = (label, ic, fn, disabled) => h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': `${label} (pytanie ${i + 1})`, disabled, onClick: (e) => { e.stopPropagation(); fn(); } }, icon(ic));
      return h('div', { class: ['q-card', `q-card--${st}`] },
        h('button', { class: 'q-card__main', type: 'button', onClick: () => show({ view: 'question', index: i }) },
          h('span', { class: 'q-card__num' }, String(i + 1)),
          h('span', { class: 'q-card__icon' }, icon(q.type ? TYPE_ICON[q.type] : 'plus')),
          h('span', { class: 'q-card__body' }, h('b', {}, q.type ? TYPE[q.type].label : 'Pytanie bez rodzaju – kliknij, aby wybrać',
            q.cat && T.settings.categories.find((x) => x.id === q.cat) ? h('span', { class: 'q-cat-chip' }, T.settings.categories.find((x) => x.id === q.cat).name) : null),
            h('span', {}, clean(q.prompt) || 'Brak treści pytania')),
          h('span', { class: `q-card__st q-card__st--${st}` }, icon(STATUS_ICON[st]), STATUS_LABEL[st])),
        h('div', { class: 'q-card__acts' },
          act('Przesuń w górę', 'up', () => moveQ(i, -1), i === 0),
          act('Przesuń w dół', 'down', () => moveQ(i, 1), i === T.questions.length - 1),
          act('Duplikuj', 'copy', () => dupQ(i), T.questions.length >= LIMITS.questions),
          act('Usuń', 'trash', () => delQ(i), T.questions.length <= 1)));
    });
    const ready = T.questions.filter((q) => ['ok', 'warn'].includes(questionStatus(q, ctx))).length;
    return h('div', { class: 'ed-panel' },
      h('div', { class: 'ed-panel__head' }, h('div', {}, h('h2', { class: 'ed-panel__title' }, 'Wszystkie pytania'),
        h('p', { class: 'muted' }, `Gotowe: ${ready} z ${T.questions.length}.${Number(T.settings.drawCount) > 0 ? ` Uczeń dostaje losowo ${effectiveCount(T)} z nich.` : ''} Kliknij pytanie, aby je edytować.`)),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: openExtract, title: 'Skopiuj pytania z innego testu, sprawdzianu albo lekcji' }, icon('extract'), 'Wyodrębnij z innych materiałów')),
      h('div', { class: 'q-cards' }, ...cards),
      T.questions.length < LIMITS.questions ? h('button', { class: 'btn btn--ghost add-q', type: 'button', onClick: addQuestion }, icon('plus'), 'Dodaj pytanie') : null);
  }
  function moveQ(i, d) { const [q] = T.questions.splice(i, 1); T.questions.splice(i + d, 0, q); schedule(); show({ view: 'all' }, { scroll: false }); }
  function dupQ(i) { const copy = JSON.parse(JSON.stringify(T.questions[i])); copy.id = newId(); T.questions.splice(i + 1, 0, copy); schedule(); show({ view: 'all' }, { scroll: false }); toast(`Skopiowano pytanie ${i + 1}.`); }
  function delQ(i) {
    const q = T.questions[i];
    const doDel = () => { T.questions.splice(i, 1); schedule(); show({ view: current.view === 'question' ? 'all' : current.view }, { scroll: false }); toast(`Usunięto pytanie ${i + 1}.`); };
    if (!q.type && !clean(q.prompt)) return doDel();
    dialog({ iconName: 'trash', title: `Usunąć pytanie ${i + 1}?`, body: h('p', {}, 'Pytanie zniknie z testu.'), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń pytanie', kind: 'danger', onClick: doDel }] });
  }

  /* --- Pojedyncze pytanie --- */
  function questionPanel(i) {
    const q = T.questions[i];
    const n = T.questions.length;
    const head = h('div', { class: 'qp-head' },
      h('button', { class: 'back qp-back', type: 'button', onClick: () => show({ view: 'all' }) }, icon('arrowLeft'), 'Wszystkie pytania'),
      h('div', { class: 'qp-title' }, h('h2', {}, `Pytanie ${i + 1}`, h('span', { class: 'muted' }, ` z ${n}`)),
        q.type ? h('span', { class: 'type-chip' }, icon(TYPE_ICON[q.type]), TYPE[q.type].label) : null,
        q.type ? h('button', { class: 'linkish', type: 'button', onClick: () => askChangeType(i) }, 'Zmień rodzaj pytania') : null));
    const foot = h('div', { class: 'qp-foot' },
      h('button', { class: 'btn btn--ghost', type: 'button', disabled: i === 0, onClick: () => show({ view: 'question', index: i - 1 }) }, icon('arrowLeft'), 'Poprzednie'),
      i < n - 1
        ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'question', index: i + 1 }) }, 'Następne pytanie', icon('arrowRight'))
        : h('button', { class: 'btn btn--primary', type: 'button', onClick: () => show({ view: 'check' }) }, 'Sprawdź cały test', icon('check')));
    if (!q.type) return h('div', { class: 'ed-panel' }, head, typePicker(i), foot);

    const cmdLines = new Map();
    const anyChange = [], problemL = [];
    const problemsBox = h('div', { class: 'qp-problems', 'aria-live': 'polite' });
    const c = {
      ui: uiOf(q), kind: T.kind, cellErrors: new Set(),
      changed(structural) { schedule(); if (structural) rerender(); else refreshLive(); },
      cmd(field) { const l = cmdLine(); cmdLines.set(field, l); return l.el; },
      onAnyChange(fn) { anyChange.push(fn); },
      onProblems(fn) { problemL.push(fn); },
      spellingNote: () => h('p', { class: 'field__hint spell-note' }, icon('info'), T.settings.spelling
        ? 'Ortografio-zaliczacz jest włączony: drobne literówki i brak polskich znaków nie są błędem (zmienisz to w ustawieniach testu).'
        : 'Ortografio-zaliczacz jest wyłączony: odpowiedź musi być napisana dokładnie (bez znaczenia mają tylko wielkie litery).'),
    };
    const rerender = () => { const y = scrollY; main.replaceChildren(questionPanel(i)); renderNav(); scrollTo({ top: y }); };
    function refreshLive() {
      const v = validateQuestion(q, vctx());
      for (const [field, line] of cmdLines) {
        const cmd = v.commands.find((x) => x.field === field);
        line.set(cmd ? cmd.ok : false, cmd ? cmd.msg : null);
      }
      c.cellErrors = new Set(v.problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));
      renderProblems(v.problems);
      anyChange.forEach((f) => f());
      problemL.forEach((f) => f());
      renderNav();
    }
    function renderProblems(list) {
      if (!list.length) { problemsBox.replaceChildren(notice('ok', h('strong', {}, 'Pytanie jest gotowe. '), 'Wszystkie wymagane pola są uzupełnione.')); return; }
      problemsBox.replaceChildren(h('div', { class: 'problems' },
        h('h3', {}, list.some((p) => p.level === 'error') ? 'Do uzupełnienia w tym pytaniu' : 'Uwagi'),
        h('ul', {}, ...list.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg),
          p.cell ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => jumpTo({ focusCell: p.cell }) }, `Przejdź do komórki ${cellName(p.cell[0], p.cell[1])}`) : null)))));
    }
    // wstępne wyliczenie (potrzebne tabeli przed narysowaniem)
    const v0 = validateQuestion(q, vctx());
    c.cellErrors = new Set(v0.problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));

    const exam = T.kind === 'exam_test';
    const promptLabel = q.type === 'timeline' ? 'Treść pytania – napisz, według czego układać' : q.type === 'data' ? 'Polecenie dla ucznia' : 'Treść pytania';
    const common = box(null, null,
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, promptLabel),
        area(q.prompt, (v) => { q.prompt = v; c.changed(); }, { rows: 2, maxlength: LIMITS.prompt, 'data-field': 'prompt',
          placeholder: q.type === 'timeline' ? 'np. Ułóż liczby od największej do najmniejszej.' : 'np. Jaki jest symbol chemiczny sodu?' })),
      q.type === 'image_labels' ? null : h('div', { class: 'field' }, h('span', { class: 'field__label' }, q.type === 'data' ? 'Obrazek do tekstu (opcjonalnie)' : 'Obrazek do pytania (opcjonalnie)'),
        imageField({ value: q.image, onChange: (img) => { q.image = img; c.changed(); } })),
      categoryField(q, c));

    const timeIn = txt(q.time, (val) => { q.time = val; c.changed(); }, { maxlength: 8, inputmode: 'decimal', placeholder: exam ? `domyślnie ${parseTime(T.settings.defaultTime).pretty || '—'}` : 'np. 1.30', 'data-field': 'time', style: { maxWidth: '180px' } });
    const extras = box('Dodatkowe (opcjonalnie)', quiz() ? 'W sprawdzianie uczeń nie widzi podpowiedzi ani wyjaśnień – zostaną użyte, jeśli wyodrębnisz to pytanie do testu nauczającego.' : null,
      quiz() ? null : h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Podpowiedź'),
        area(q.hint, (val) => { q.hint = val; c.changed(); }, { rows: 1, maxlength: LIMITS.hint, placeholder: 'Uczeń zobaczy ją po kliknięciu „Podpowiedź”.' })),
      quiz() ? null : h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Wyjaśnienie'),
        area(q.explanation, (val) => { q.explanation = val; c.changed(); }, { rows: 2, maxlength: LIMITS.explanation, placeholder: 'Pokazywane w teście nauczającym po błędnej odpowiedzi – razem z poprawną odpowiedzią.' })),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Czas na to pytanie'), timeIn,
        h('span', { class: 'field__hint' }, exam ? 'W minutach: 2 = 2 min, 2.30 = 2 min 30 s, 0.45 = 45 s. Puste = czas domyślny z ustawień.' : 'W teście nauczającym czas nie jest liczony – przyda się, jeśli zmienisz rodzaj testu na egzaminacyjny.'),
        c.cmd('time')));

    const panel = h('div', { class: 'ed-panel' }, head, common, h('div', { 'data-field': 'type' }, EDITORS[q.type](q, c)), extras, problemsBox, foot);
    refreshLive();
    return panel;
  }

  function categoryField(q, c) {
    const cats = T.settings.categories;
    if (!cats.length && !quiz()) return null;
    if (!cats.length) {
      return h('div', { class: 'field', 'data-field': 'cat' }, h('span', { class: 'field__label' }, 'Kategoria (dział)'),
        notice('warn', 'Sprawdzian wymaga kategorii pytań. ', h('button', { class: 'linkish', type: 'button', onClick: () => show({ view: 'settings', focusField: 'categories' }) }, 'Utwórz kategorie w ustawieniach testu')));
    }
    const sel = h('select', { class: 'select', 'data-field': 'cat', style: { maxWidth: '360px' } },
      h('option', { value: '' }, quiz() ? '— wybierz kategorię —' : '— bez kategorii —'),
      ...cats.map((x) => h('option', { value: x.id, selected: q.cat === x.id }, clean(x.name) || '(kategoria bez nazwy)')));
    sel.addEventListener('change', () => { q.cat = sel.value; c.changed(); });
    return h('label', { class: 'field' }, h('span', { class: 'field__label' }, quiz() ? 'Kategoria (dział) – wymagana w sprawdzianie' : 'Kategoria (dział)'), sel);
  }

  function typePicker(i) {
    return h('div', { class: 'type-picker' },
      h('h3', {}, 'Wybierz rodzaj pytania'),
      h('div', { class: 'type-grid' }, ...TYPES.map((t) => {
        const b = h('button', { type: 'button', class: 'type-card' }, h('span', { class: 'type-card__icon' }, icon(TYPE_ICON[t.key])),
          h('span', { class: 'type-card__title' }, t.label), h('span', { class: 'type-card__desc' }, t.desc));
        b.addEventListener('click', () => {
          const old = T.questions[i];
          const fresh = emptyQuestion(t.key);
          fresh.id = old.id;
          for (const k of ['image', 'hint', 'explanation', 'time', 'cat']) if (old[k]) fresh[k] = old[k];
          if (clean(old.prompt)) fresh.prompt = old.prompt;
          T.questions[i] = fresh;
          schedule();
          show({ view: 'question', index: i }, { scroll: false });
        });
        return b;
      })));
  }
  function askChangeType(i) {
    dialog({
      iconName: 'info', title: 'Zmienić rodzaj pytania?',
      body: h('p', {}, 'Treść pytania, obrazek, podpowiedź, wyjaśnienie i czas zostaną zachowane. Odpowiedzi trzeba będzie wpisać od nowa.'),
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Wybierz inny rodzaj', kind: 'primary', onClick: () => {
        const q = T.questions[i];
        T.questions[i] = { id: q.id, type: null, prompt: q.prompt === TYPE[q.type]?.prompt ? '' : q.prompt, image: q.image, hint: q.hint, explanation: q.explanation, time: q.time, cat: q.cat || '' };
        schedule();
        show({ view: 'question', index: i });
      } }],
    });
  }

  /* --- Sprawdź test --- */
  function checkPanel({ serverProblems, message }) {
    const { problems } = serverProblems ? { problems: serverProblems } : validateTest(T);
    const errors = problems.filter((p) => p.level === 'error');
    const warns = problems.filter((p) => p.level === 'warn');
    const groups = new Map();
    for (const p of problems) {
      const k = p.where === 'settings' ? 'settings' : p.q;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const goBtn = (p) => {
      if (p.where === 'settings') return h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => show({ view: 'settings', focusField: p.field }) }, 'Przejdź do ustawień');
      if (p.cell) return h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => show({ view: 'question', index: p.q, focusCell: p.cell }) }, `Przejdź do komórki ${cellName(p.cell[0], p.cell[1])}`);
      return h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => show({ view: 'question', index: p.q, focusField: ['prompt', 'time', 'cat', 'minWords', 'maxWords'].includes(p.field) ? p.field : 'type' }) }, `Przejdź do pytania ${p.q + 1}`);
    };
    const pubBtn = h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => publish(e.currentTarget) }, icon('flag'), 'Opublikuj test');
    return h('div', { class: 'ed-panel' },
      h('h2', { class: 'ed-panel__title' }, 'Sprawdź test'),
      errors.length
        ? notice('warn', h('strong', {}, message || `Do poprawienia: ${errors.length} ${plural(errors.length, ['rzecz', 'rzeczy', 'rzeczy'])}. `), ' Test możesz dalej zapisywać jako szkic, ale nie da się go opublikować, dopóki pytania nie są kompletne.')
        : notice('ok', h('strong', {}, 'Wszystko gotowe! '), T.status === 'published' ? 'Test jest opublikowany.' : 'Możesz opublikować test – uczniowie od razu go zobaczą.'),
      ...[...groups].map(([k, list]) => h('section', { class: 'check-group' },
        h('h3', {}, k === 'settings' ? 'Ustawienia testu' : `Pytanie ${k + 1}${T.questions[k]?.type ? ` · ${TYPE[T.questions[k].type].label}` : ''}`),
        h('ul', {}, ...list.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg), goBtn(p)))))),
      !errors.length && T.status !== 'published' ? h('div', { class: 'actions' }, pubBtn) : null,
      warns.length && !errors.length ? h('p', { class: 'muted small' }, 'Uwagi (niebieskie) nie blokują publikacji.') : null);
  }

  /* Samouczek: „Wpisz za mnie” wstawia gotowe pytanie w miejsce wskazanego (albo na koniec). */
  window.__edukroEd = {
    kind: 'test', id: T.id,
    count: () => T.questions.length,
    current: () => ({ ...current }),
    ensure(i) { let added = false; while (T.questions.length <= i && T.questions.length < LIMITS.questions) { T.questions.push(emptyQuestion(null)); added = true; } if (added) schedule(); },
    fill(index, data) {
      const q = JSON.parse(JSON.stringify(data));
      const at = Math.min(Math.max(0, index), T.questions.length);
      q.id = T.questions[at]?.id || newId();
      q.cat = '';
      if (at >= T.questions.length) T.questions.push(q); else T.questions[at] = q;
      schedule();
      show({ view: 'question', index: at });
    },
    show: (next) => show(next),
  };

  /* ---------- Złożenie ekranu ---------- */
  renderTop();
  const root = h('div', { class: 'ed wrap' }, top, h('div', { class: 'ed__body' }, nav, main));
  if (wantExtract) current = { view: 'all' };
  show(current, { scroll: false });
  if (wantExtract) setTimeout(openExtract, 450);
  return root;
}

export function defaultDeadline() {
  const d = new Date(Date.now() + 7 * 86400e3);
  d.setHours(20, 0, 0, 0);
  return d.getTime();
}
