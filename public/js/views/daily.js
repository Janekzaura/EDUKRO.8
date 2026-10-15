// Dzienne pytania.
//  Uczeń: pasek „Dzienne pytania” na liście przedmiotów – seria (streak), losowanie i odpowiedź w okienku.
//  Nauczyciel / administrator: baza pytań przedmiotu (dowolnie wiele) i edytor pytania.
import { h, icon, notice, toast, dialog, withBusy, switchEl, plural, formatDate } from '../ui.js';
import { get, post, put, del } from '../api.js';
import { navigate, setCrumbs, state, setPointsChip, leaveGuards } from '../app.js';
import { TYPES, TYPE, LIMITS, emptyQuestion, validateQuestion, clean, cellName } from '../shared/quiz-rules.js';
import { WIDGETS } from './qplay.js';
import { EDITORS, area, box, imageField } from './qedit.js';
import { TYPE_ICON } from './test-editor.js';
import { cmdLine } from './tests-list.js';
import { celebrate } from '../celebrate.js';
import { pulseNow } from '../fun.js';
import { g } from '../g.js';
import * as sound from '../sound.js';

const dni = (n) => `${n} ${plural(n, ['dzień', 'dni', 'dni'])}`;

/* ====================================================================== */
/* Uczeń                                                                   */
/* ====================================================================== */
/** Pasek dziennych pytań (lista przedmiotów ucznia). Pusty, gdy żaden przedmiot nie ma pytań. */
export async function dailyStrip() {
  if (state.user.role !== 'student') return null;
  let D;
  try { D = await get('/api/daily'); } catch { return null; }
  if (!D.subjects.length) return null;
  const root = h('section', { class: 'daily', 'data-help': 'Dzienne pytania: raz dziennie z każdego przedmiotu. Pierwsze pytanie dnia buduje serię (1, 2, 3… pkt), każde kolejne daje +2 pkt.' });
  function render() {
    const left = D.subjects.filter((s) => s.state !== 'done').length;
    const flame = h('div', { class: ['daily__flame', D.streak > 0 && 'is-on'] }, icon('flame'), h('b', {}, String(D.streak)));
    const head = h('div', { class: 'daily__head' }, flame,
      h('div', { class: 'daily__txt' },
        h('h2', {}, 'Dzienne pytania'),
        h('p', {}, D.streak ? `Seria: ${dni(D.streak)} z rzędu${D.best > D.streak ? ` · rekord: ${dni(D.best)}` : ''}.` : D.best ? `Seria przerwana – rekord: ${dni(D.best)}. Zacznij nową!` : 'Odpowiadaj codziennie i buduj serię!'),
        h('p', { class: 'small muted' }, !D.firstDone
          ? `Pierwsze pytanie dnia: dobra odpowiedź = +${D.nextPoints} pkt (${D.streak ? `seria ${D.streak + 1}` : 'początek serii'}), zła – seria od zera. Kolejne przedmioty: +${D.bonus} pkt.`
          : D.firstCorrect === null ? 'Dokończ pierwsze pytanie dnia – to ono liczy się do serii.'
            : `Seria na dziś ${D.firstCorrect ? 'zaliczona' : 'przerwana'}. Pytania z innych przedmiotów: +${D.bonus} pkt za dobrą odpowiedź.`)),
      left ? null : h('span', { class: 'badge badge--ok' }, icon('check'), 'Na dziś wszystko!'));
    const chips = h('div', { class: 'daily__chips' }, ...D.subjects.map((s) => {
      const st = s.state === 'done' ? (s.correct ? h('span', { class: 'daily__st is-ok' }, icon('check'), s.points ? `+${s.points}` : '') : h('span', { class: 'daily__st is-bad' }, icon('x')))
        : s.state === 'open' ? h('span', { class: 'daily__st' }, 'dokończ') : h('span', { class: 'daily__st' }, icon('shuffle'), 'losuj');
      return h('button', { class: ['daily__chip', `acc-${s.accent}`, `is-${s.state}`], type: 'button', disabled: s.state === 'done', title: s.state === 'done' ? 'Wróć jutro po nowe pytanie' : `Dzienne pytanie: ${s.name}`,
        onClick: () => openDaily(s, (ov) => { D = ov; render(); }, async () => { try { D = await get('/api/daily'); render(); } catch { /* nic */ } }) },
      h('span', { class: 'daily__name' }, s.name, s.first ? h('small', {}, 'seria') : null), st);
    }));
    root.replaceChildren(head, chips);
  }
  render();
  return root;
}

async function openDaily(s, onDone, onClose) {
  let r;
  try { r = await post(`/api/daily/${s.id}/draw`); } catch (e) { toast(e.message, 'error'); return; }
  const q = r.question;
  let widget;
  const check = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true }, 'Sprawdź');
  const onChange = () => { check.disabled = !widget.ready(); };
  widget = WIDGETS[q.type](q, { onChange, serve: null });
  const hintBox = q.hint ? h('div', { class: 'hint-box', hidden: true }, icon('bulb'), h('span', {}, q.hint)) : null;
  const hint = q.hint ? h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => { hintBox.hidden = false; hint.remove(); } }, icon('bulb'), 'Podpowiedź') : null;
  const stake = r.first
    ? h('p', { class: 'daily-q__stake' }, icon('flame'), h('b', {}, `Pierwsze pytanie dnia – za dobrą odpowiedź +${r.stake} pkt`), h('span', {}, r.streak ? ` (seria ${r.streak} → ${r.streak + 1})` : ' (początek serii)'), h('small', {}, 'Zła odpowiedź zeruje serię.'))
    : h('p', { class: 'daily-q__stake' }, icon('star'), h('b', {}, `Bonus: +${r.stake} pkt za dobrą odpowiedź`), h('small', {}, 'Seria liczy się z pierwszego pytania dnia – to pytanie jej nie zmienia.'));
  const card = h('article', { class: ['q-card-play', 'daily-q', `q-type-${q.type}`] },
    stake,
    h('h2', { class: 'q-prompt' }, q.prompt),
    q.image ? h('img', { class: 'daily-q__img', src: q.image, alt: 'Obrazek do pytania' }) : null,
    hintBox, h('div', { class: 'q-answer' }, widget.el), h('div', { class: 'slide-q-actions' }, hint, check));
  check.addEventListener('click', () => withBusy(check, async () => {
    widget.lock();
    try {
      const res = await post(`/api/daily/${s.id}/answer`, { answer: widget.answer() });
      widget.reveal(res);
      card.classList.add(res.correct ? 'is-correct' : 'is-incorrect');
      check.remove(); hint?.remove();
      const msg = res.correct
        ? (res.first ? `Dobrze! Seria: ${dni(res.streak)} · +${res.points} pkt` : `Dobrze! +${res.points} pkt bonusu`)
        : (res.first ? 'Nie tym razem – seria zaczyna się od nowa. Jutro kolejna szansa!' : 'Nie tym razem. Seria zostaje – liczy się pierwsze pytanie dnia.');
      card.querySelector('.q-answer').after(h('div', { class: ['slide-fb', res.correct ? 'is-ok' : 'is-bad', 'pop-in'] }, icon(res.correct ? 'check' : 'x'), h('b', {}, msg),
        res.explanation ? h('span', {}, res.explanation) : null));
      sound.play(res.correct ? 'success' : 'error');
      if (res.correct) { setTimeout(() => sound.play('coin'), 400); const b = card.getBoundingClientRect(); celebrate({ count: 70, origin: [b.left + b.width / 2, b.top + 60], style: state.user.card?.cele || 'confetti' }); }
      if (res.balance !== undefined) { state.user.points = res.balance; setPointsChip?.(res.balance); }
      pulseNow?.();
      onDone(res.overview);
    } catch (e) { toast(e.message, 'error'); }
  }));
  if (r.answered) { // już odpowiedziane (np. inna karta) – tylko informacja
    toast(r.answered.correct ? 'To pytanie już masz zaliczone. Wróć jutro!' : 'Na to pytanie już odpowiedziałeś(-aś). Wróć jutro!', 'info');
    return;
  }
  const dlg = dialog({ iconName: 'flame', title: `Dzienne pytanie · ${r.subject.name}`, body: card, actions: [{ label: 'Zamknij', kind: 'quiet' }], onClose: () => { sound.stopSpeaking(); onClose?.(); } });
  dlg.el.classList.add('dialog--wide', 'dialog--daily');
  onChange();
}

/* ====================================================================== */
/* Nauczyciel / administrator: baza pytań                                  */
/* ====================================================================== */
const SUBJ_KEY = 'edukro-daily-subject';
export async function dailySection({ base }) {
  const keep = (() => { try { return Number(sessionStorage.getItem(SUBJ_KEY)) || ''; } catch { return ''; } })();
  const D = await get(`/api/daily/manage${keep ? `?subjectId=${keep}` : ''}`);
  if (!D.subjects.length) return notice('info', 'Nie masz jeszcze przypisanych przedmiotów. Administrator przypisze je w Administracja → Nauczyciele.');
  const wrap = h('div', { class: 'daily-admin' });
  const sel = h('select', { class: 'select', 'aria-label': 'Przedmiot' }, ...D.subjects.map((s) => h('option', { value: String(s.id), selected: s.id === D.subjectId }, `${s.name} (${s.count})`)));
  const reload = async () => { try { sessionStorage.setItem(SUBJ_KEY, sel.value); } catch { /* nic */ } wrap.replaceWith(await dailySection({ base })); };
  sel.addEventListener('change', reload);
  const add = h('a', { class: 'btn btn--primary', href: `${base}/dzienne/nowe?przedmiot=${D.subjectId}`, 'data-link': '' }, icon('plus'), 'Dodaj pytanie');
  const rows = D.questions.map((x) => {
    const sw = switchEl({ label: '', checked: x.active, onChange: async (v, el) => {
      try { await put(`/api/daily/manage/${x.id}`, { active: v }); toast(v ? 'Pytanie wróciło do losowania.' : 'Pytanie wyłączone z losowania.'); } catch (e) { el.checked = !v; toast(e.message, 'error'); }
    } });
    if (!x.canEdit) sw.el.querySelector('input').disabled = true;
    return h('tr', { class: x.active ? null : 'is-off' },
      h('td', {}, h('b', {}, x.prompt || '(bez treści)'), h('div', { class: 'small muted' }, x.typeLabel, x.author ? ` · ${x.author}` : '')),
      h('td', { 'data-label': 'Odpowiedzi', class: 'num' }, x.answered ? `${x.correct}/${x.answered} dobrze` : '—'),
      h('td', { 'data-label': 'W losowaniu' }, sw.el),
      h('td', {}, h('div', { class: 'row-actions' },
        x.canEdit ? h('a', { class: 'btn btn--ghost btn--sm', href: `${base}/dzienne/${x.id}`, 'data-link': '' }, icon('edit'), 'Edytuj') : h('span', { class: 'small muted' }, 'pytanie innej osoby'),
        x.canEdit ? h('button', { class: 'btn btn--quiet btn--sm', type: 'button', 'aria-label': 'Usuń pytanie', onClick: () => dialog({
          iconName: 'trash', title: 'Usunąć to pytanie?', body: h('p', {}, x.prompt),
          actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń', kind: 'danger', onClick: async () => { await del(`/api/daily/manage/${x.id}`); toast('Pytanie usunięte.'); reload(); } }],
        }) }, icon('trash')) : null)));
  });
  wrap.append(
    h('h2', { class: 'section-title' }, 'Dzienne pytania'),
    h('p', { class: 'section-lead' }, 'Dodaj do przedmiotu dowolnie wiele pytań – nie muszą dotyczyć bieżącego tematu. Każdy uczeń raz dziennie losuje jedno pytanie z każdego przedmiotu.'),
    h('ul', { class: 'how-list daily-how' },
      h('li', {}, icon('flame'), h('span', {}, h('b', {}, 'Seria'), ` – liczy się pierwsze dzienne pytanie, które uczeń wybierze danego dnia. Dobra odpowiedź: seria rośnie, a punkty = długość serii (1, 2, 3… pkt). Zła odpowiedź albo opuszczony dzień – seria od zera.`)),
      h('li', {}, icon('star'), h('span', {}, h('b', {}, `Bonus +${D.bonus} pkt`), ' – za każde kolejne dzienne pytanie tego dnia (z innych przedmiotów).')),
      h('li', {}, icon('clock'), h('span', {}, 'Nowe pytania – codziennie o północy. Wylosowane pytanie nie zmienia się do końca dnia.'))),
    h('div', { class: 'toolbar' }, sel, add),
    D.questions.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Pytanie', 'Odpowiedzi', 'W losowaniu', ''].map((x) => h('th', {}, x)))), h('tbody', {}, ...rows)))
      : h('div', { class: 'empty' }, icon('flame', 'empty__icon'), h('div', {}, h('h3', {}, 'Brak dziennych pytań w tym przedmiocie'), h('p', {}, 'Kliknij „Dodaj pytanie”. Uczniowie zobaczą przedmiot w „Dziennych pytaniach”, gdy będzie miał co najmniej jedno pytanie.'))));
  return wrap;
}

/* ---------- Edytor jednego pytania (ten sam formularz co w testach) ---------- */
export async function dailyEditorView({ base, id }) {
  const isNew = id === 'nowe';
  const back = base === '/administracja' ? '/administracja/dzienne' : '/nauczyciel/panel/dzienne';
  let q, subjects, subjectId;
  if (isNew) {
    subjects = (await get('/api/editor/subjects')).subjects;
    subjectId = Number(new URLSearchParams(location.search).get('przedmiot')) || subjects[0]?.id;
    q = emptyQuestion(null);
  } else {
    const r = await get(`/api/daily/manage/${id}`);
    q = r.question; subjects = r.subjects; subjectId = r.item.subjectId;
  }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: base === '/administracja' ? 'Administracja' : 'Panel nauczyciela', href: back }, { label: 'Dzienne pytania', href: back }, { label: isNew ? 'Nowe pytanie' : 'Edycja pytania' }]);
  let dirty = false;
  const root = h('div', { class: 'wrap daily-ed' });
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', beforeUnload);
  leaveGuards.add(() => removeEventListener('beforeunload', beforeUnload));

  function render() {
    const subj = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id), selected: s.id === subjectId }, s.name)));
    subj.addEventListener('change', () => { subjectId = Number(subj.value); dirty = true; });
    const top = h('div', { class: 'daily-ed__top' },
      h('a', { class: 'back', href: back, 'data-link': '' }, icon('arrowLeft'), 'Dzienne pytania'),
      h('h1', {}, isNew ? 'Nowe dzienne pytanie' : 'Edycja dziennego pytania'),
      h('label', { class: 'field', style: { maxWidth: '360px' } }, h('span', { class: 'field__label' }, 'Przedmiot'), subj));
    if (!q.type) {
      root.replaceChildren(top, box('Wybierz rodzaj pytania', 'Takie same rodzaje jak w testach – także zadanie na słuch.',
        h('div', { class: 'type-grid' }, ...TYPES.map((t) => {
          const b = h('button', { type: 'button', class: 'type-card' }, h('span', { class: 'type-card__icon' }, icon(TYPE_ICON[t.key])), h('span', { class: 'type-card__title' }, t.label), h('span', { class: 'type-card__desc' }, t.desc));
          b.addEventListener('click', () => { const fresh = emptyQuestion(t.key); fresh.id = q.id; q = fresh; dirty = true; render(); });
          return b;
        }))));
      return;
    }
    const cmdLines = new Map();
    const anyChange = [], problemL = [];
    const problemsBox = h('div', { class: 'qp-problems', 'aria-live': 'polite' });
    const save = h('button', { class: 'btn btn--primary btn--lg', type: 'button' }, icon('check'), isNew ? 'Zapisz pytanie' : 'Zapisz zmiany');
    const c = {
      ui: {}, kind: 'teaching_test', cellErrors: new Set(),
      changed(structural) { dirty = true; if (structural) { const y = scrollY; render(); scrollTo({ top: y }); } else refresh(); },
      cmd(field) { const l = cmdLine(); cmdLines.set(field, l); return l.el; },
      onAnyChange(fn) { anyChange.push(fn); },
      onProblems(fn) { problemL.push(fn); },
      spellingNote: () => h('p', { class: 'field__hint spell-note' }, icon('info'), 'Ortografio-zaliczacz jest włączony: drobne literówki i brak polskich znaków nie są błędem.'),
    };
    function refresh() {
      const v = validateQuestion(q, { kind: 'teaching_test' });
      for (const [field, line] of cmdLines) { const cmd = v.commands.find((x) => x.field === field); line.set(cmd ? cmd.ok : false, cmd ? cmd.msg : null); }
      c.cellErrors = new Set(v.problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));
      const errs = v.problems.filter((p) => p.level === 'error');
      problemsBox.replaceChildren(v.problems.length ? h('div', { class: 'problems' }, h('h3', {}, errs.length ? 'Do uzupełnienia' : 'Uwagi'),
        h('ul', {}, ...v.problems.map((p) => h('li', { class: `problem problem--${p.level}` }, icon(p.level === 'error' ? 'warn' : 'info'), h('span', {}, p.msg, p.cell ? ` (komórka ${cellName(p.cell[0], p.cell[1])})` : '')))))
        : notice('ok', h('strong', {}, 'Pytanie jest gotowe. '), 'Zapisz je – trafi do losowania.'));
      save.disabled = !!errs.length;
      anyChange.forEach((f) => f()); problemL.forEach((f) => f());
    }
    c.cellErrors = new Set(validateQuestion(q, { kind: 'teaching_test' }).problems.filter((p) => p.cell && p.level === 'error').map((p) => p.cell.join(',')));
    save.addEventListener('click', () => withBusy(save, async () => {
      try {
        if (isNew) await post('/api/daily/manage', { subjectId, question: q });
        else await put(`/api/daily/manage/${id}`, { subjectId, question: q });
        dirty = false;
        try { sessionStorage.setItem(SUBJ_KEY, String(subjectId)); } catch { /* nic */ }
        toast(isNew ? 'Pytanie dodane do dziennych pytań.' : 'Zapisano pytanie.');
        navigate(back);
      } catch (e) { toast(e.message, 'error'); }
    }));
    root.replaceChildren(top,
      box(null, null,
        h('div', { class: 'qp-title' }, h('span', { class: 'type-chip' }, icon(TYPE_ICON[q.type]), TYPE[q.type].label),
          h('button', { class: 'linkish', type: 'button', onClick: () => { q = { ...emptyQuestion(null), id: q.id, prompt: q.prompt === TYPE[q.type]?.prompt ? '' : q.prompt }; render(); } }, 'Zmień rodzaj pytania')),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Treść pytania'),
          area(q.prompt, (v) => { q.prompt = v; c.changed(); }, { rows: 2, maxlength: LIMITS.prompt, 'data-field': 'prompt', placeholder: 'np. Jaki jest symbol chemiczny sodu?' })),
        q.type === 'image_labels' ? null : h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Obrazek (opcjonalnie)'), imageField({ value: q.image, onChange: (img) => { q.image = img; c.changed(); } }))),
      h('div', { 'data-field': 'type' }, EDITORS[q.type](q, c)),
      box('Dodatkowe (opcjonalnie)', null,
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Podpowiedź'), area(q.hint, (v) => { q.hint = v; c.changed(); }, { rows: 1, maxlength: LIMITS.hint, placeholder: 'Uczeń zobaczy ją po kliknięciu „Podpowiedź”.' })),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Wyjaśnienie'), area(q.explanation, (v) => { q.explanation = v; c.changed(); }, { rows: 2, maxlength: LIMITS.explanation, placeholder: 'Uczeń zobaczy je po odpowiedzi.' }))),
      problemsBox,
      h('div', { class: 'actions actions--end' }, h('a', { class: 'btn btn--ghost btn--lg', href: back, 'data-link': '' }, 'Anuluj'), save));
    refresh();
  }
  render();
  return root;
}

export { dni };
void clean; void formatDate; void g;
