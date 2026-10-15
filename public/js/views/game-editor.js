// Edytor gier (0.7): Saper (zdarzenia + katana) i Hammer Game (etapy). Zapis automatyczny, podpowiedzi na żywo.
import { h, icon, notice, toast, dialog, withBusy, switchEl, plural } from '../ui.js';
import { get, put, post, del } from '../api.js';
import { navigate, setCrumbs, leaveGuards } from '../app.js';
import { EDITORS, txt, area, box } from './qedit.js';
import { cmdLine } from './tests-list.js';
import { validateQuestion, LIMITS, TYPE } from '../shared/quiz-rules.js';
import {
  GAME_TYPE, GL, SAPER_EVENTS, SAPER_EVENT, HAMMER_STAGES, validateGame, emptyEvent, emptyChoice, emptyTf, emptyWord,
  letters, cellKey, crosswordMap, crosswordCode,
} from '../shared/game-rules.js';
import { newId } from '../shared/quiz-rules.js';

const labelled = (label, el, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), el, hint ? h('span', { class: 'field__hint' }, hint) : null);
const rm = (label, onClick, disabled = false) => h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': label, title: label, disabled, onClick }, icon('trash'));
const addBtn = (label, onClick, count, max) => h('button', { class: 'btn btn--ghost btn--sm add-btn', type: 'button', disabled: count >= max, onClick }, icon('plus'), label, h('span', { class: 'add-btn__count' }, `${count}/${max}`));
const mv = (label, ic, onClick, disabled) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, disabled, onClick }, icon(ic));

export async function gameEditorView({ base, id }) {
  const isAdmin = base === '/administracja';
  const listHref = isAdmin ? '/administracja/gry' : '/nauczyciel/panel/gry';
  const { game: G, subjects } = await get(`/api/editor/games/${id}`);
  const doc = G.content;
  const meta = { title: G.title, summary: G.summary || '', subjectId: G.subjectId };
  let status = G.status;
  const saper = doc.type === 'saper';
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: isAdmin ? 'Administracja' : 'Panel nauczyciela', href: listHref }, { label: 'Gry', href: listHref }, { label: G.title }]);

  /* ---------- Zapis ---------- */
  let dirty = false, timer = null, saving = null;
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  const setSave = (st, msg) => {
    saveState.className = `save-state save-state--${st}`;
    saveState.replaceChildren(icon(st === 'saved' ? 'check' : st === 'error' ? 'warn' : 'clock'), h('span', {}, { pending: 'Zmiany czekają na zapis…', saving: 'Zapisywanie…', saved: 'Zapisano', error: msg || 'Nie zapisano – ponawiam' }[st]));
  };
  setSave('saved');
  function changed() { dirty = true; setSave('pending'); clearTimeout(timer); timer = setTimeout(save, 900); renderNav(); refreshProblems(); }
  async function save() {
    clearTimeout(timer);
    if (saving) await saving;
    if (!dirty) return;
    dirty = false; setSave('saving');
    saving = put(`/api/editor/games/${id}`, { title: meta.title, summary: meta.summary, subjectId: meta.subjectId, content: doc }).then((r) => {
      setSave('saved');
      if (r.unpublished) { status = 'draft'; toast('Uczniowie chwilowo nie widzą gry, bo czegoś w niej brakuje. Po poprawkach kliknij „Opublikuj”.', 'error'); }
      renderTop();
    }).catch((e) => { dirty = true; setSave('error', e.message); timer = setTimeout(save, 5000); }).finally(() => { saving = null; });
    return saving;
  }
  const beforeUnload = (e) => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  leaveGuards.add(async () => { await save(); removeEventListener('beforeunload', beforeUnload); });

  /* ---------- Górny pasek ---------- */
  const top = h('header', { class: 'ed__top' });
  function renderTop() {
    const v = validateGame(doc);
    top.replaceChildren(
      h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie gry'),
      h('div', { class: 'ed__title' }, h('h1', {}, meta.title || 'Gra bez nazwy'),
        h('div', { class: 'ed__badges' }, h('span', { class: `gm-chip gm-chip--${doc.type}` }, icon(saper ? 'bomb' : 'hammer'), GAME_TYPE[doc.type].label),
          status === 'published' ? h('span', { class: 'badge badge--ok' }, 'Opublikowana – uczniowie mogą grać') : v.errors ? h('span', { class: 'badge badge--wait' }, `Szkic · ${v.errors} ${plural(v.errors, ['rzecz', 'rzeczy', 'rzeczy'])} do uzupełnienia`) : h('span', { class: 'badge badge--info' }, 'Szkic – gotowa do publikacji'),
          saveState)),
      h('div', { class: 'actions ed__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: async () => { await save(); navigate(`${base}/gra/${id}/podglad`); }, 'data-help': 'Zagraj w swoją grę tak jak uczeń – bez punktów.' }, icon('play'), 'Zagraj (podgląd)'),
        status === 'published'
          ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await save(); await post(`/api/editor/games/${id}/unpublish`); status = 'draft'; toast('Gra ukryta przed uczniami.'); renderTop(); }) }, icon('eye'), 'Ukryj przed uczniami')
          : h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => withBusy(e.currentTarget, publish) }, icon('flag'), 'Opublikuj')));
  }
  async function publish() {
    await save();
    try {
      const r = await post(`/api/editor/games/${id}/publish`);
      status = 'published'; renderTop();
      toast(r.notified ? `Gra opublikowana – powiadomiono uczniów (${r.notified}).` : 'Gra opublikowana.');
    } catch (e) { toast(e.message, 'error'); show({ view: 'check' }); }
  }

  /* ---------- Nawigacja ---------- */
  const nav = h('nav', { class: 'ed__nav', 'aria-label': 'Części gry' });
  const main = h('div', { class: 'ed__main' });
  let current = { view: 'settings' };
  const errAt = (where) => validateGame(doc).problems.filter((p) => p.level === 'error' && p.where === where).length;
  const dot = (n) => h('span', { class: ['ed-nav__count', n ? 'ed-nav__count--bad' : 'ed-nav__count--ok'] }, n ? String(n) : icon('check'));
  function item(label, ic, view, extra) {
    const active = current.view === view.view && current.index === view.index;
    return h('button', { type: 'button', class: ['ed-nav__item', active && 'is-active'], 'aria-current': active ? 'page' : null, onClick: () => show(view) }, icon(ic), h('span', {}, label), extra || null);
  }
  function renderNav() {
    const v = validateGame(doc);
    const kids = [item('Ustawienia gry', 'settings', { view: 'settings' }, errAt('settings') ? dot(errAt('settings')) : null)];
    if (saper) {
      kids.push(h('p', { class: 'ge-nav__h' }, 'Zdarzenia (po kolei)'));
      kids.push(h('ol', { class: 'ed-qs' }, ...doc.events.map((ev, i) => {
        const n = errAt(`ev:${i}`);
        const active = current.view === 'event' && current.index === i;
        return h('li', {}, h('button', { type: 'button', class: ['ed-q', n ? 'ed-q--error' : 'ed-q--ok', active && 'is-active'], onClick: () => show({ view: 'event', index: i }) },
          h('span', { class: 'ed-q__num' }, String(i + 1)), h('span', { class: 'ed-q__text' }, h('b', {}, SAPER_EVENT[ev.kind]?.label || '—'), h('small', {}, evLabel(ev))),
          h('span', { class: 'ed-q__st', 'aria-hidden': 'true' }, icon(n ? 'warn' : 'check'))));
      })));
      if (doc.events.length < GL.events) kids.push(item('Dodaj zdarzenie', 'plus', { view: 'add' }));
      kids.push(item('Katana (finał)', 'flame', { view: 'katana' }, dot(errAt('katana'))));
    } else {
      for (const s of HAMMER_STAGES) kids.push(item(s.label, doc.stages[s.key] ? 'check' : 'x', { view: 'stage', index: s.key }, doc.stages[s.key] ? dot(errAt(s.key)) : h('span', { class: 'ed-nav__count' }, 'wył.')));
    }
    kids.push(item('Sprawdź grę', 'check', { view: 'check' }, v.errors ? h('span', { class: 'ed-nav__count ed-nav__count--bad' }, String(v.errors)) : h('span', { class: 'ed-nav__count ed-nav__count--ok' }, icon('check'))));
    nav.replaceChildren(...kids);
  }
  function show(next) { current = next; renderPanel(); renderNav(); const y = main.getBoundingClientRect().top + scrollY - 90; if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
  const problemsBox = h('div', { class: 'ge-problems', 'aria-live': 'polite' });
  function refreshProblems() {
    const where = current.view === 'event' ? `ev:${current.index}` : current.view === 'stage' ? current.index : current.view;
    const list = validateGame(doc).problems.filter((p) => current.view === 'check' || p.where === where);
    problemsBox.replaceChildren(list.length ? h('div', { class: 'problems' }, h('h3', {}, list.some((p) => p.level === 'error') ? 'Do uzupełnienia' : 'Uwagi'),
      h('ul', {}, ...list.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg)))))
      : notice('ok', current.view === 'check' ? h('strong', {}, 'Gra jest gotowa! Kliknij „Opublikuj”.') : 'Ta część jest gotowa.'));
  }
  function renderPanel() {
    let panel;
    if (current.view === 'settings') panel = settingsPanel();
    else if (current.view === 'event') panel = eventPanel(current.index);
    else if (current.view === 'add') panel = addPanel();
    else if (current.view === 'katana') panel = itemsPanel(doc.katana.questions, { title: 'Katana – finał', lead: 'Po rozbrojeniu bomby uczeń niszczy ją kataną: tnie po liniach, a co dwa cięcia pojawia się pytanie na 6 sekund (prawda/fałsz albo A–D). Błąd albo brak odpowiedzi = wybuch.', min: 2, max: GL.katanaQ, what: 'pytanie' });
    else if (current.view === 'stage') panel = stagePanel(current.index);
    else panel = checkPanel();
    main.replaceChildren(panel, current.view === 'add' ? '' : problemsBox);
    refreshProblems();
  }

  /* ---------- Ustawienia ---------- */
  function settingsPanel() {
    const subj = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id), selected: s.id === meta.subjectId }, s.name)));
    subj.addEventListener('change', () => { meta.subjectId = Number(subj.value); changed(); });
    const time = h('select', { class: 'select' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30].map((m) => h('option', { value: String(m * 60), selected: doc.time === m * 60 }, `${m} min`)));
    time.addEventListener('change', () => { doc.time = Number(time.value); changed(); });
    const pts = h('input', { class: 'input', type: 'number', min: 0, max: GL.maxPoints, value: String(doc.points), style: { maxWidth: '120px' } });
    pts.addEventListener('input', () => { doc.points = Math.max(0, Math.min(GL.maxPoints, Math.round(Number(pts.value) || 0))); changed(); });
    return h('div', {},
      box('Ustawienia gry', null,
        labelled('Nazwa gry', txt(meta.title, (v) => { meta.title = v; changed(); renderTop(); }, { maxlength: GL.title })),
        labelled('Krótki opis dla ucznia (opcjonalnie)', txt(meta.summary, (v) => { meta.summary = v; changed(); }, { maxlength: GL.summary, placeholder: 'np. Rozbrój bombę pytaniami z działu „Atomy”' })),
        labelled('Przedmiot', subj),
        saper ? labelled('Czas bomby', time, 'Tyle czasu ma uczeń na rozbrojenie. Na katanę zegar startuje od nowa z tym samym czasem.') : null,
        labelled(saper ? 'Punkty za pierwsze rozbrojenie' : 'Punkty za pierwsze APPROVED (przy 100%)', pts, saper ? 'Kolejne wygrane są dla treningu – bez punktów.' : 'Uczeń dostaje część punktów zależną od procentu, np. 80% → 80% punktów. Poniżej 55% – DECLINED, bez punktów.')),
      saper ? null : box('Etapy gry', 'Wyłączone etapy uczeń pominie. Na końcu zawsze jest „chwila prawdy”: APPROVED od 55%.',
        ...HAMMER_STAGES.map((s) => switchEl({ label: s.label, sub: s.desc, checked: !!doc.stages[s.key], onChange: (v) => { doc.stages[s.key] = v; changed(); } }).el)));
  }

  /* ---------- Saper: zdarzenia ---------- */
  function evLabel(ev) {
    if (ev.kind === 'wire') return ev.prompt || 'pytanie…';
    if (ev.kind === 'torch' || ev.kind === 'trojan') return ev.question.prompt || 'pytanie…';
    if (ev.kind === 'crossword') return `${ev.words.length} haseł · kod ${crosswordCode(ev) || '…'}`;
    if (ev.kind === 'files') return ev.questions.map((x) => x.answer).filter(Boolean).join(', ') || 'pliki…';
    return '';
  }
  function addPanel() {
    return box('Dodaj zdarzenie', 'Zdarzenia mogą się powtarzać – na przykład dwa razy „Przetnij kabel”. Kolejność zmienisz strzałkami przy zdarzeniu.',
      h('div', { class: 'type-grid' }, ...SAPER_EVENTS.map((e) => {
        const b = h('button', { type: 'button', class: 'type-card' }, h('span', { class: 'type-card__icon' }, icon(e.icon)), h('span', { class: 'type-card__title' }, e.label), h('span', { class: 'type-card__desc' }, e.desc));
        b.addEventListener('click', () => { doc.events.push(emptyEvent(e.key)); changed(); show({ view: 'event', index: doc.events.length - 1 }); });
        return b;
      })));
  }
  function eventPanel(i) {
    const ev = doc.events[i];
    if (!ev) return addPanel();
    const head = h('div', { class: 'ge-evhead' },
      h('h2', {}, `Zdarzenie ${i + 1}: ${SAPER_EVENT[ev.kind].label}`),
      h('div', { class: 'row-actions' },
        mv('Wcześniej', 'up', () => { [doc.events[i - 1], doc.events[i]] = [doc.events[i], doc.events[i - 1]]; changed(); show({ view: 'event', index: i - 1 }); }, i === 0),
        mv('Później', 'down', () => { [doc.events[i + 1], doc.events[i]] = [doc.events[i], doc.events[i + 1]]; changed(); show({ view: 'event', index: i + 1 }); }, i === doc.events.length - 1),
        mv('Powiel zdarzenie', 'copy', () => { const c = JSON.parse(JSON.stringify(ev)); c.id = newId(); doc.events.splice(i + 1, 0, c); changed(); show({ view: 'event', index: i + 1 }); }, doc.events.length >= GL.events),
        rm('Usuń zdarzenie', () => dialog({ iconName: 'trash', title: 'Usunąć zdarzenie?', body: h('p', {}, `„${SAPER_EVENT[ev.kind].label}” zniknie z gry.`), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń', kind: 'danger', onClick: () => { doc.events.splice(i, 1); changed(); show(doc.events.length ? { view: 'event', index: Math.max(0, i - 1) } : { view: 'add' }); } }] }), doc.events.length <= 1)),
      h('p', { class: 'section-lead' }, SAPER_EVENT[ev.kind].desc));
    let body;
    if (ev.kind === 'wire') body = choiceEditor(ev, { min: 3, max: 5, optLabel: 'Kabel', title: 'Pytanie i kable', lead: 'Każdy kabel ma karteczkę z odpowiedzią. Zaznacz kabel z poprawną odpowiedzią – uczeń musi przeciąć właśnie ten.' });
    else if (ev.kind === 'torch') body = quizBlock(ev.question, { title: 'Pytanie na blaszce (odpowiedź pisemna)', lead: 'Pojawi się, gdy uczeń wytnie palnikiem otwór. Zła odpowiedź = wybuch, więc dodaj kilka słów kluczowych (np. odmiany).' });
    else if (ev.kind === 'trojan') body = quizBlock(ev.question, { title: 'Kolejność na kablu (trojan)', lead: 'Uczeń ustawia elementy na pionowym kablu od góry do dołu. W treści napisz, według czego układać.' });
    else if (ev.kind === 'crossword') body = crosswordEditor(ev);
    else body = filesEditor(ev);
    return h('div', {}, head, body);
  }

  /** Pytanie z odpowiedziami: prompt + opcje (min–max) + poprawna. */
  function choiceEditor(it, { min, max, optLabel = 'Odpowiedź', title, lead, fixed = false }) {
    const wrap = h('div', {});
    function render() {
      const rows = it.options.map((o, k) => {
        const on = it.correct === k;
        const mark = h('button', { class: ['mark', on && 'is-on'], type: 'button', 'aria-pressed': String(on) }, icon('check'), h('span', {}, on ? 'Poprawna' : 'Ustaw jako poprawną'));
        mark.addEventListener('click', () => { it.correct = k; changed(); render(); });
        return h('div', { class: ['opt-row', on && 'is-correct'] }, h('span', { class: 'opt-letter' }, 'ABCDEF'[k]),
          txt(o, (v) => { it.options[k] = v; changed(); }, { maxlength: GL.option, placeholder: `${optLabel} ${'ABCDEF'[k]}`, 'aria-label': `${optLabel} ${k + 1}` }), mark,
          fixed ? null : rm(`Usuń: ${optLabel} ${k + 1}`, () => { it.options.splice(k, 1); if (it.correct === k) it.correct = null; else if (it.correct > k) it.correct--; changed(); render(); }, it.options.length <= min));
      });
      wrap.replaceChildren(box(title, lead,
        labelled('Pytanie', area(it.prompt, (v) => { it.prompt = v; changed(); }, { rows: 2, maxlength: GL.prompt, placeholder: 'np. Który pierwiastek ma symbol O?' })),
        ...rows, fixed ? null : addBtn(optLabel === 'Kabel' ? 'Dodaj kabel' : 'Dodaj odpowiedź', () => { it.options.push(''); changed(); render(); }, it.options.length, max)));
    }
    render();
    return wrap;
  }
  function tfEditor(it) {
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Prawda czy fałsz' }, ...[[true, 'Prawda'], [false, 'Fałsz']].map(([v, l]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(it.answer === v), class: v ? 'seg--true' : 'seg--false' }, l);
      b.addEventListener('click', () => { it.answer = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); changed(); });
      return b;
    }));
    return h('div', { class: 'tf-edit' }, area(it.text, (v) => { it.text = v; changed(); }, { rows: 1, maxlength: GL.prompt, placeholder: 'np. Złoto ma symbol Au.', 'aria-label': 'Stwierdzenie' }), seg);
  }
  /** Lista pytań prawda/fałsz albo A–D (katana, kartki). */
  function itemsPanel(list, { title, lead, min, max, what = 'pytanie', onlyTf = false, onlyChoice = false }) {
    const wrap = h('div', {});
    function render() {
      wrap.replaceChildren(box(title, lead,
        ...list.map((it, k) => {
          const kind = h('div', { class: 'seg seg--sm', role: 'radiogroup', 'aria-label': 'Rodzaj' }, ...(onlyTf || onlyChoice ? [] : [['tf', 'Prawda / fałsz'], ['choice', 'A–D']]).map(([kk, l]) => {
            const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(it.kind === kk) }, l);
            b.addEventListener('click', () => { if (it.kind === kk) return; const fresh = kk === 'tf' ? emptyTf() : emptyChoice(); fresh.id = it.id; if (kk === 'tf') fresh.text = it.prompt || ''; else fresh.prompt = it.text || ''; list[k] = fresh; changed(); render(); });
            return b;
          }));
          return h('div', { class: 'ge-item' },
            h('div', { class: 'ge-item__head' }, h('b', {}, `${k + 1}.`), kind,
              mv('Wyżej', 'up', () => { [list[k - 1], list[k]] = [list[k], list[k - 1]]; changed(); render(); }, k === 0),
              rm(`Usuń ${what} ${k + 1}`, () => { list.splice(k, 1); changed(); render(); }, list.length <= min)),
            it.kind === 'tf' ? tfEditor(it) : choiceEditor(it, { min: 4, max: 4, fixed: true, title: null, lead: null }));
        }),
        h('div', { class: 'actions' },
          onlyChoice ? null : addBtn('Dodaj prawda / fałsz', () => { list.push(emptyTf()); changed(); render(); }, list.length, max),
          onlyTf ? null : addBtn('Dodaj pytanie A–D', () => { list.push(emptyChoice()); changed(); render(); }, list.length, max))));
    }
    render();
    return wrap;
  }

  /** Pytanie z testów (pisemne, oś czasu, tabela, prawda/fałsz) – te same formularze co w edytorze testu. */
  function quizBlock(q, { title, lead }) {
    const wrap = h('div', { class: 'ge-quiz' });
    const cmdLines = new Map();
    const c = {
      ui: {}, kind: 'teaching_test', cellErrors: new Set(),
      changed(structural) { changed(); refresh(); if (structural) render(); },
      cmd(field) { const l = cmdLine(); cmdLines.set(field, l); return l.el; },
      onAnyChange() {}, onProblems() {},
      spellingNote: () => h('p', { class: 'field__hint spell-note' }, icon('info'), 'Drobne literówki i brak polskich znaków nie są błędem.'),
    };
    function refresh() {
      const v = validateQuestion(q, { kind: 'teaching_test' });
      for (const [field, line] of cmdLines) { const cmd = v.commands.find((x) => x.field === field); line.set(cmd ? cmd.ok : false, cmd ? cmd.msg : null); }
      c.cellErrors = new Set(v.problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));
    }
    function render() {
      cmdLines.clear();
      wrap.replaceChildren(box(title, lead, h('span', { class: 'type-chip' }, TYPE[q.type].label),
        labelled('Treść pytania', area(q.prompt, (v) => { q.prompt = v; c.changed(); }, { rows: 2, maxlength: LIMITS.prompt }))),
      h('div', {}, EDITORS[q.type](q, c)));
      refresh();
    }
    render();
    return wrap;
  }

  /* ---------- Krzyżówka ---------- */
  function crosswordEditor(ev) {
    const wrap = h('div', {});
    let mode = { kind: 'word', wi: 0 }; // word = zaznaczanie pól hasła wi; code = kod dostępu
    function render() {
      const { map, conflicts } = crosswordMap(ev);
      const sel = mode.kind === 'word' ? ev.words[mode.wi] : null;
      const order = new Map((sel?.cells || []).map((c, k) => [cellKey(c), k + 1]));
      const codeOrder = new Map(ev.code.map((c, k) => [cellKey(c), k + 1]));
      const grid = h('div', { class: 'ge-cw', style: { '--rows': ev.rows, '--cols': ev.cols } });
      for (let r = 0; r < ev.rows; r++) for (let c = 0; c < ev.cols; c++) {
        const k = `${r},${c}`;
        const ch = map.get(k);
        const cell = h('button', { type: 'button', class: ['ge-cw__c', map.has(k) && 'is-used', order.has(k) && 'is-sel', codeOrder.has(k) && 'is-code', conflicts.has(k) && 'is-bad'], 'aria-label': `Pole ${r + 1}, ${c + 1}` },
          h('span', { class: 'ge-cw__l' }, ch || ''), order.has(k) ? h('i', { class: 'ge-cw__o' }, String(order.get(k))) : null, codeOrder.has(k) ? h('i', { class: 'ge-cw__k' }, String(codeOrder.get(k))) : null);
        cell.addEventListener('click', () => clickCell(r, c));
        grid.append(cell);
      }
      const sizeSel = (label, key) => {
        const s = h('select', { class: 'select select--sm' }, ...Array.from({ length: GL.grid - 3 }, (_, i) => i + 4).map((n) => h('option', { value: String(n), selected: ev[key] === n }, String(n))));
        s.addEventListener('change', () => { ev[key] = Number(s.value); for (const w of ev.words) w.cells = w.cells.filter(([rr, cc]) => rr < ev.rows && cc < ev.cols); ev.code = ev.code.filter(([rr, cc]) => rr < ev.rows && cc < ev.cols); changed(); render(); });
        return h('label', { class: 'ge-size' }, label, s);
      };
      const words = ev.words.map((w, wi) => {
        const L = letters(w.answer);
        const active = mode.kind === 'word' && mode.wi === wi;
        return h('div', { class: ['ge-word', active && 'is-active'] },
          h('span', { class: 'opt-letter' }, String(wi + 1)),
          h('div', { class: 'ge-word__f' },
            txt(w.clue, (v) => { w.clue = v; changed(); }, { maxlength: GL.clue, placeholder: 'Pytanie (np. Najlżejszy pierwiastek)', 'aria-label': `Pytanie ${wi + 1}` }),
            txt(w.answer, (v) => { w.answer = v; changed(); renderSoft(); }, { maxlength: GL.word, placeholder: 'Odpowiedź (np. WODÓR)', 'aria-label': `Odpowiedź ${wi + 1}`, class: 'input ge-word__ans' }),
            h('small', { class: ['ge-word__st', L.length && w.cells.length === L.length ? 'is-ok' : 'is-bad'] }, `pola: ${w.cells.length}/${L.length || '?'}`)),
          h('div', { class: 'ge-word__acts' },
            h('button', { class: ['btn btn--sm', active ? 'btn--primary' : 'btn--ghost'], type: 'button', onClick: () => { mode = { kind: 'word', wi }; render(); } }, icon('target'), active ? 'Zaznaczasz' : 'Zaznacz pola'),
            h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => { w.cells = []; ev.code = ev.code.filter((c) => crosswordMap(ev).map.get(cellKey(c))); changed(); mode = { kind: 'word', wi }; render(); } }, 'Wyczyść'),
            rm(`Usuń hasło ${wi + 1}`, () => { ev.words.splice(wi, 1); mode = { kind: 'word', wi: 0 }; changed(); render(); }, ev.words.length <= 2)));
      });
      const code = crosswordCode(ev);
      wrap.replaceChildren(
        box('Krzyżówka', 'Wpisz hasła, a potem przy każdym kliknij „Zaznacz pola” i klikaj pola w siatce po kolei – pierwsze kliknięte to pierwsza litera. Pola nie muszą być w linii prostej. Hasła mogą się krzyżować, jeśli mają w tym polu tę samą literę.',
          h('div', { class: 'ge-cw-wrap' },
            h('div', {}, h('div', { class: 'ge-cw-tools' }, sizeSel('Wiersze', 'rows'), sizeSel('Kolumny', 'cols')),
              h('p', { class: 'ge-cw-mode' }, mode.kind === 'code' ? h('b', {}, '🔑 Zaznaczasz KOD DOSTĘPU – klikaj pola z literami po kolei.') : sel ? h('span', {}, h('b', {}, `Hasło ${mode.wi + 1}: `), `kliknij ${Math.max(0, letters(sel.answer).length - sel.cells.length)} ${plural(Math.max(0, letters(sel.answer).length - sel.cells.length), ['pole', 'pola', 'pól'])} (kliknięcie zaznaczonego pola cofa).`) : null),
              grid),
            h('div', { class: 'ge-words' }, ...words, addBtn('Dodaj hasło', () => { ev.words.push(emptyWord()); mode = { kind: 'word', wi: ev.words.length - 1 }; changed(); render(); }, ev.words.length, 10)))),
        box('Kod dostępu', 'Litery z wybranych pól (w kolejności) tworzą kod, który uczeń wpisze, żeby wejść do oprogramowania bomby.',
          h('p', { class: 'ge-code' }, 'Kod: ', h('b', {}, code || '—'), ` (${ev.code.length} ${plural(ev.code.length, ['pole', 'pola', 'pól'])})`),
          h('div', { class: 'actions' },
            h('button', { class: ['btn btn--sm', mode.kind === 'code' ? 'btn--primary' : 'btn--ghost'], type: 'button', onClick: () => { mode = { kind: 'code' }; render(); } }, icon('key'), mode.kind === 'code' ? 'Zaznaczasz kod' : 'Zaznacz pola kodu'),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { ev.code = ev.words.filter((w) => w.cells.length).map((w) => w.cells[0]); changed(); render(); } }, 'Kod z pierwszych liter haseł'),
            h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => { ev.code = []; changed(); render(); } }, 'Wyczyść kod'))),
        h('h3', { class: 'ge-sub' }, 'Oprogramowanie bomby – 3 kroki'),
        quizBlock(ev.tasks[0], { title: 'Krok 1: odpowiedź pisemna', lead: 'Zła odpowiedź = wybuch – dodaj odmiany słów kluczowych.' }),
        quizBlock(ev.tasks[1], { title: 'Krok 2: tabela', lead: 'Zaznacz komórki do uzupełnienia.' }),
        quizBlock(ev.tasks[2], { title: 'Krok 3: prawda czy fałsz', lead: null }));
    }
    // po wpisaniu odpowiedzi odśwież siatkę bez gubienia kursora
    function renderSoft() { const a = document.activeElement; const sel = a?.selectionStart; const idx = [...wrap.querySelectorAll('input')].indexOf(a); render(); const b = wrap.querySelectorAll('input')[idx]; if (b) { b.focus(); try { b.setSelectionRange(sel, sel); } catch { /* nic */ } } }
    function clickCell(r, c) {
      const k = `${r},${c}`;
      if (mode.kind === 'code') {
        if (!crosswordMap(ev).map.get(k)) { toast('Kod może leżeć tylko na polach z literami haseł.', 'error'); return; }
        const i = ev.code.findIndex((x) => cellKey(x) === k);
        if (i >= 0) ev.code.splice(i, 1); else if (ev.code.length < 16) ev.code.push([r, c]);
      } else {
        const w = ev.words[mode.wi]; if (!w) return;
        const i = w.cells.findIndex((x) => cellKey(x) === k);
        if (i >= 0) w.cells.splice(i, w.cells.length - i); // cofnij od tego pola
        else {
          const need = letters(w.answer).length;
          if (!need) { toast('Najpierw wpisz odpowiedź tego hasła.', 'error'); return; }
          if (w.cells.length >= need) { toast(`To hasło ma ${need} liter – wszystkie pola już zaznaczone.`, 'error'); return; }
          w.cells.push([r, c]);
          if (w.cells.length === need) { const next = ev.words.findIndex((x, j) => j > mode.wi && x.cells.length < letters(x.answer).length); if (next >= 0) mode = { kind: 'word', wi: next }; }
        }
      }
      changed(); render();
    }
    render();
    return wrap;
  }

  /* ---------- Pliki ---------- */
  function filesEditor(ev) {
    return h('div', {},
      box('4 pytania – ich odpowiedzi to pliki, które ZOSTAJĄ', 'Uczeń zobaczy pytania i 16 plików. Usuwa wszystkie, które nie są odpowiedzią. Usunięcie pliku-odpowiedzi = wybuch.',
        ...ev.questions.map((q, k) => h('div', { class: 'row-2 ge-file' }, h('span', { class: 'opt-letter' }, String(k + 1)),
          txt(q.prompt, (v) => { q.prompt = v; changed(); }, { maxlength: GL.prompt, placeholder: 'Pytanie (np. Symbol żelaza)', 'aria-label': `Pytanie ${k + 1}` }),
          txt(q.answer, (v) => { q.answer = v; changed(); }, { maxlength: GL.file, placeholder: 'Plik-odpowiedź (np. Fe)', 'aria-label': `Odpowiedź ${k + 1}` })))),
      box('12 plików-pułapek', 'Nie są odpowiedzią, ale powinny brzmieć sensownie – żeby uczeń musiał pomyśleć (np. podobne symbole, mylące nazwy).',
        h('div', { class: 'ge-decoys' }, ...ev.decoys.map((d, k) => txt(d, (v) => { ev.decoys[k] = v; changed(); }, { maxlength: GL.file, placeholder: `Plik ${k + 1}`, 'aria-label': `Plik-pułapka ${k + 1}` })))));
  }

  /* ---------- Hammer Game: etapy ---------- */
  function stagePanel(key) {
    const st = HAMMER_STAGES.find((s) => s.key === key);
    const on = switchEl({ label: `Etap „${st.label}” włączony`, sub: st.desc, checked: !!doc.stages[key], onChange: (v) => { doc.stages[key] = v; changed(); renderPanel(); } }).el;
    let body = null;
    if (doc.stages[key]) {
      if (key === 'cards') body = itemsPanel(doc.cards, { title: 'Kartki', lead: 'Kartki pojawiają się w losowej kolejności. Większość niech będzie TAK/NIE (prawda/fałsz); czasem pytanie A–D. Seria 5 dobrych = 5 kartek naraz w 20 sekund i INSTANT REPLAY – dlatego warto mieć 10 kartek albo więcej.', min: 5, max: GL.cards, what: 'kartkę' });
      else if (key === 'bugs') body = bugsEditor();
      else if (key === 'pairs') body = pairsEditor();
      else if (key === 'test') body = h('div', {}, ...doc.test.map((it, k) => choiceEditor(it, { min: 4, max: 4, fixed: true, title: `Pytanie ${k + 1} z 6`, lead: k === 0 ? 'Test ma zawsze 6 pytań A–D na jednej kartce. Na końcu uczeń widzi procent i ocenę.' : null })));
      else body = itemsPanel(doc.approve, { title: 'Stwierdzenia do APPROVED / DECLINED', lead: 'Prawdziwe uczeń stempluje APPROVED, fałszywe – DECLINED. Wynik zobaczy dopiero w „chwili prawdy”.', min: 3, max: GL.approve, what: 'stwierdzenie', onlyTf: true });
    }
    return h('div', {}, box(null, null, on), body);
  }
  function bugsEditor() {
    const wrap = h('div', {});
    const B = doc.bugs;
    function render() {
      wrap.replaceChildren(
        box('Pytania i żuki', 'Każde pytanie ma odpowiedź – to jeden żuk. Po trafieniu żuk odlatuje, a reszta zostaje, więc z każdym pytaniem jest łatwiej. Żuki-pułapki odlecą na końcu.',
          ...B.questions.map((q, k) => h('div', { class: 'row-2 ge-file' }, h('span', { class: 'opt-letter' }, String(k + 1)),
            txt(q.prompt, (v) => { q.prompt = v; changed(); }, { maxlength: GL.prompt, placeholder: 'Pytanie (np. Który pierwiastek ma symbol He?)', 'aria-label': `Pytanie ${k + 1}` }),
            txt(q.answer, (v) => { q.answer = v; changed(); }, { maxlength: GL.option, placeholder: 'Odpowiedź – żuk (np. hel)', 'aria-label': `Odpowiedź ${k + 1}` }),
            rm(`Usuń pytanie ${k + 1}`, () => { B.questions.splice(k, 1); changed(); render(); }, B.questions.length <= 2))),
          addBtn('Dodaj pytanie', () => { B.questions.push({ id: newId(), prompt: '', answer: '' }); changed(); render(); }, B.questions.length, GL.bugQ)),
        box('Żuki-pułapki', 'Odpowiedzi, które nie pasują do żadnego pytania.',
          ...B.decoys.map((d, k) => h('div', { class: 'ge-decoy-row' }, txt(d, (v) => { B.decoys[k] = v; changed(); }, { maxlength: GL.option, placeholder: `Pułapka ${k + 1} (np. żelazo)` }), rm(`Usuń pułapkę ${k + 1}`, () => { B.decoys.splice(k, 1); changed(); render(); }, B.decoys.length <= 1))),
          addBtn('Dodaj pułapkę', () => { B.decoys.push(''); changed(); render(); }, B.decoys.length, GL.bugDecoys)));
    }
    render();
    return wrap;
  }
  function pairsEditor() {
    const wrap = h('div', {});
    function render() {
      wrap.replaceChildren(box('Pary', 'Uczeń uderza jedną rzecz, potem drugą. Dobra para wybucha i zdrapuje kawałek ekranu.',
        ...doc.pairs.map((p, k) => h('div', { class: 'row-2 ge-file' }, h('span', { class: 'opt-letter' }, String(k + 1)),
          txt(p.left, (v) => { p.left = v; changed(); }, { maxlength: GL.option, placeholder: 'np. Na', 'aria-label': `Para ${k + 1} – lewa` }),
          txt(p.right, (v) => { p.right = v; changed(); }, { maxlength: GL.option, placeholder: 'np. sód', 'aria-label': `Para ${k + 1} – prawa` }),
          rm(`Usuń parę ${k + 1}`, () => { doc.pairs.splice(k, 1); changed(); render(); }, doc.pairs.length <= 3))),
        addBtn('Dodaj parę', () => { doc.pairs.push({ id: newId(), left: '', right: '' }); changed(); render(); }, doc.pairs.length, GL.pairs)));
    }
    render();
    return wrap;
  }

  /* ---------- Sprawdź ---------- */
  function checkPanel() {
    const v = validateGame(doc);
    return box('Sprawdź grę', v.errors ? 'Popraw zaznaczone rzeczy – dopiero wtedy gra może być opublikowana.' : 'Wszystko gotowe. Zagraj w podglądzie, a potem kliknij „Opublikuj”.',
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: async () => { await save(); navigate(`${base}/gra/${id}/podglad`); } }, icon('play'), 'Zagraj (podgląd)'),
        status !== 'published' ? h('button', { class: 'btn btn--primary', type: 'button', disabled: !!v.errors, onClick: (e) => withBusy(e.currentTarget, publish) }, icon('flag'), 'Opublikuj') : null,
        h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => dialog({ iconName: 'trash', title: `Usunąć grę „${meta.title}”?`, body: h('p', {}, 'Punkty zdobyte już przez uczniów zostaną.'),
          actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń grę', kind: 'danger', onClick: async () => { dirty = false; await del(`/api/editor/games/${id}`); toast('Gra usunięta.'); navigate(listHref); } }] }) }, icon('trash'), 'Usuń grę')));
  }

  renderTop();
  renderNav();
  renderPanel();
  return h('div', { class: 'ed wrap ge' }, top, h('div', { class: 'ed__body' }, nav, main));
}
