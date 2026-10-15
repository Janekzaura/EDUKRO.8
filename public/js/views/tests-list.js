// Zakładka „Testy” (nauczyciel i administrator) oraz ekran tworzenia nowego testu.
import { h, icon, notice, field, input, dialog, toast, withBusy, formatDate, plural } from '../ui.js';
import { get, post, del } from '../api.js';
import { navigate, setCrumbs } from '../app.js';
import { parseTime, DEFAULT_SETTINGS, RULES } from '../shared/quiz-rules.js';
import { defaultDeadline } from './test-editor.js';
import { lockBadge, copyItem } from './locked.js';
import { tourId } from '../tour.js';
import { g } from '../g.js';
import { templatePicker } from './templates.js';

export const KIND = {
  teaching_test: { label: 'Test nauczający', short: 'Nauczający', icon: 'teaching' },
  exam_test: { label: 'Test egzaminacyjny', short: 'Egzaminacyjny', icon: 'exam' },
  quiz: { label: 'Sprawdzian', short: 'Sprawdzian', icon: 'quiz' },
};

export function statusBadge(t) {
  if (t.status === 'published') return h('span', { class: 'badge badge--ok' }, 'Opublikowany');
  if (t.errors) return h('span', { class: 'badge badge--wait' }, `Szkic · ${t.errors} ${plural(t.errors, ['rzecz', 'rzeczy', 'rzeczy'])} do uzupełnienia`);
  return h('span', { class: 'badge badge--info' }, 'Szkic – gotowy do publikacji');
}

/** Lista testów; base = '/nauczyciel' albo '/administracja'. */
export async function testsSection({ base, admin = false }) {
  const { tests } = await get('/api/editor/tests');
  const create = h('a', { class: 'btn btn--primary', href: `${base}/test/nowy`, 'data-link': '' }, icon('plus'), 'Stwórz test');
  const head = h('header', { class: 'admin__head' },
    h('div', {}, admin ? h('h1', {}, 'Testy') : h('h2', { class: 'section-title' }, 'Testy'),
      h('p', { class: admin ? null : 'section-lead', style: { marginBottom: 0 } }, 'Testy nauczające, egzaminacyjne i sprawdziany. Szkic możesz zapisywać w dowolnym momencie – uczniowie zobaczą test dopiero po opublikowaniu. Pytania możesz też wyodrębnić z innych testów i lekcji.')),
    h('div', { class: 'actions' }, admin ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: demoStudent }, icon('user'), 'Konto testowe ucznia') : null, create));

  if (!tests.length) {
    return h('div', {}, head, h('div', { class: 'empty' }, icon('exam', 'empty__icon'),
      h('div', {}, h('h3', {}, 'Nie ma jeszcze żadnych testów'),
        h('p', {}, 'Kliknij „Stwórz test”, wybierz rodzaj testu i liczbę pytań, a potem uzupełniaj pytania po kolei. Wszystko zapisuje się samo.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: `${base}/test/nowy`, 'data-link': '' }, icon('plus'), 'Stwórz pierwszy test')))));
  }

  const bySubject = new Map();
  for (const t of tests) { if (!bySubject.has(t.subject)) bySubject.set(t.subject, []); bySubject.get(t.subject).push(t); }

  const row = (t) => {
    const open = () => navigate(`${base}/test/${t.id}`);
    const more = h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: open }, icon('edit'), 'Edytuj'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'Zobacz test oczami ucznia', onClick: () => navigate(`${base}/test/${t.id}/podglad`) }, icon('eye'), 'Podgląd'),
      h('button', { class: 'btn btn--quiet btn--sm', type: 'button', title: 'Utwórz kopię testu', 'aria-label': `Kopia testu ${t.title}`, 'data-help': 'Tworzy kopię testu, którą możesz zmieniać niezależnie od oryginału.', onClick: (e) => withBusy(e.currentTarget, () => copyItem({ kind: 'test', id: t.id, base })) }, icon('copy'), 'Kopiuj'),
      h('button', { class: 'btn btn--quiet btn--sm', type: 'button', disabled: !t.canDelete, title: t.canDelete ? 'Usuń test' : `Usunąć może tylko autor (${t.author || 'administrator'}) albo administrator`, 'aria-label': `Usuń test ${t.title}`,
        'data-help': t.canDelete ? 'Usuwa test. Jeśli uczniowie już go rozwiązywali, ich wyniki i punkty zostaną zachowane.' : 'Ten test utworzył ktoś inny – usunąć może go tylko autor albo administrator.', onClick: () => removeTest(t) }, icon('trash'), 'Usuń'));
    return h('tr', {},
      h('td', {}, h('button', { class: 'linkish test-title', type: 'button', onClick: open }, t.title),
        h('div', { class: 'small muted' }, `${KIND[t.kind].label}${!t.mine && t.author ? ` · autor: ${t.author}` : ''} · ${t.questionCount} ${plural(t.questionCount, ['pytanie', 'pytania', 'pytań'])}${t.drawCount < t.questionCount ? ` (uczeń dostaje ${t.drawCount})` : ''}${t.kind === 'quiz' && t.deadline ? ` · termin ${new Date(t.deadline).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}` : ''}`)),
      h('td', { 'data-label': 'Stan' }, t.lock ? lockBadge(t.lock, 'test') : statusBadge(t),
        t.expiresAt ? h('div', { style: { marginTop: '6px' } }, h('span', { class: `badge ${t.expired ? 'badge--plain' : 'badge--wait'}`, title: new Date(t.expiresAt).toLocaleString('pl-PL') }, icon('hourglass'), t.expired ? 'Tymczasowy – już zniknął' : `Tymczasowy – do ${new Date(t.expiresAt).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`)) : null,
        t.reward ? h('div', { style: { marginTop: '6px' } }, h('span', { class: 'badge badge--info' }, icon('gift'), `Nagroda: ${t.reward}`)) : null),
      h('td', { 'data-label': 'Ukończyło', class: 'num' }, String(t.completions)),
      h('td', { 'data-label': 'Zmiana' }, formatDate(t.updatedAt)),
      h('td', {}, more));
  };

  async function removeTest(t) {
    dialog({
      iconName: 'trash', title: `Usunąć test „${t.title}”?`,
      body: h('p', {}, t.completions ? 'Uczniowie już rozwiązywali ten test – zniknie z listy, ale ich wyniki i punkty zostaną zachowane.' : 'Test zostanie usunięty na stałe.'),
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń test', kind: 'danger', onClick: async () => {
        await del(`/api/editor/tests/${t.id}`); toast('Test usunięty.'); navigate(location.pathname, { replace: true });
      } }],
    });
  }

  return h('div', {}, head,
    ...[...bySubject].map(([subject, list]) => h('section', { class: `block acc-${list[0].accent}` },
      h('h2', { class: 'subject-dot' }, subject),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards tests-table' },
        h('thead', {}, h('tr', {}, ...['Test', 'Stan', 'Ukończyło', 'Ostatnia zmiana', ''].map((x) => h('th', { class: x === 'Ukończyło' ? 'num' : null }, x)))),
        h('tbody', {}, ...list.map(row)))))));
}

function demoStudent() {
  dialog({
    iconName: 'user', title: 'Konto testowe ucznia',
    body: [h('p', {}, `Utworzę (albo odnowię) konto „Uczeń Testowy”, żebyś ${g('mógł', 'mogła')} rozwiązać testy jak uczeń – z punktami, przerwami po egzaminie i wynikami u nauczyciela.`),
      h('p', { class: 'small' }, 'Nowy kod zobaczysz tylko raz. Poprzedni kod tego konta przestanie działać.')],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Utwórz konto testowe', kind: 'primary', onClick: async () => {
      const r = await post('/api/admin/demo-student');
      setTimeout(() => dialog({
        iconName: 'key', title: 'Dane do logowania ucznia', dismissible: false,
        body: [h('p', {}, 'Wyloguj się, wybierz „Jestem uczniem” → „Zaloguj się” i wpisz:'),
          h('dl', { class: 'facts' }, h('div', {}, h('dt', {}, 'Imię'), h('dd', {}, r.firstName)), h('div', {}, h('dt', {}, 'Nazwisko'), h('dd', {}, r.lastName))),
          h('div', { class: 'secret-box', tabindex: '0' }, r.code)],
        actions: [{ label: g('Zapisałem kod – zamknij', 'Zapisałam kod – zamknij'), kind: 'primary' }],
      }), 60);
    } }],
  });
}

/* ---------- Nowy test ---------- */
export async function newTestView({ base }) {
  const area = base === '/administracja' ? 'Administracja' : 'Panel nauczyciela';
  const listHref = base === '/administracja' ? '/administracja/testy' : '/nauczyciel/panel/testy';
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: area, href: listHref }, { label: 'Nowy test' }]);
  const { subjects } = await get('/api/editor/subjects');
  if (!subjects.length) {
    return h('div', { class: 'wrap wrap--mid' }, notice('info', 'Nie masz przypisanych przedmiotów. Administrator EDUKRO może je przypisać w swoim panelu.'));
  }
  let kind = new URLSearchParams(location.search).get('rodzaj') === 'sprawdzian' ? 'quiz' : 'teaching_test';
  let fromSources = false;
  const title = input({ maxlength: 120, placeholder: 'np. Budowa atomu – powtórka' });
  const summary = input({ maxlength: 400, placeholder: 'np. 10 pytań o protonach, neutronach i elektronach' });
  const subject = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id) }, s.name)));
  const count = stepper({ value: kind === 'quiz' ? RULES.quizMinQuestions : 10, min: 1, max: 100, label: 'Liczba pytań' });
  const mistakes = stepper({ value: DEFAULT_SETTINGS.maxMistakes, min: 0, max: 50, label: 'Maksymalna liczba błędów' });
  const time = input({ value: DEFAULT_SETTINGS.defaultTime, maxlength: 8, inputmode: 'decimal', style: { maxWidth: '140px' } });
  const timeCheck = cmdLine();
  const checkTime = () => { const t = parseTime(time.value); timeCheck.set(t.ok && !t.empty, t.ok ? (t.empty ? 'Wpisz czas, np. 1.00' : `Komenda napisana poprawnie – ${t.pretty} na każde pytanie.`) : t.error); };
  time.addEventListener('input', checkTime); checkTime();

  const toLocal = (ms) => { const d = new Date(ms); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const deadline = h('input', { class: 'input', type: 'datetime-local', value: toLocal(defaultDeadline()), style: { maxWidth: '260px' } });
  const quizFields = h('div', { class: 'quiz-only', hidden: kind !== 'quiz' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Termin sprawdzianu'), deadline,
      h('span', { class: 'field__hint' }, `Po terminie uczniowie nie rozwiążą sprawdzianu. Sprawdzian musi mieć co najmniej ${RULES.quizMinQuestions} pytań i kategorie (działy) – ustawisz je w edytorze.`)));
  const examFields = h('div', { class: 'exam-only', hidden: true },
    h('div', { class: 'row-2' },
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Ile błędów może popełnić uczeń'), mistakes.el,
        h('p', { class: 'field__hint' }, 'Jeden błąd więcej i egzamin jest przegrany. 0 = bez pomyłek.')),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'nt-time' }, 'Domyślny czas na pytanie'), time,
        h('p', { class: 'field__hint' }, 'W minutach: 1 = minuta, 1.30 = półtorej minuty, 0.45 = 45 sekund. Każde pytanie może mieć własny czas.'), timeCheck.el)));
  time.id = 'nt-time';

  const kindCard = (k, bullets) => {
    const b = h('button', { type: 'button', class: 'kind-card', role: 'radio', 'aria-checked': String(k === kind) },
      h('span', { class: 'kind-card__icon' }, icon(KIND[k].icon)), h('span', { class: 'kind-card__title' }, KIND[k].label),
      h('ul', {}, ...bullets.map((x) => h('li', {}, x))));
    b.addEventListener('click', () => {
      kind = k; cards.querySelectorAll('.kind-card').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
      examFields.hidden = kind !== 'exam_test'; quizFields.hidden = kind !== 'quiz';
      if (kind === 'quiz' && count.value() < RULES.quizMinQuestions) count.input.value = String(RULES.quizMinQuestions);
    });
    return b;
  };
  const cards = h('div', { class: 'kind-cards kind-cards--3', role: 'radiogroup', 'aria-label': 'Rodzaj testu' },
    kindCard('teaching_test', ['Bez limitu czasu', 'Po błędzie uczeń od razu widzi poprawną odpowiedź (i Twoje wyjaśnienie)', 'Błędne pytania wracają na końcu – aż do skutku', 'Można powtarzać bez ograniczeń']),
    kindCard('exam_test', ['Czas na każde pytanie', 'Ustalasz, ile błędów wolno popełnić – po przekroczeniu uczeń przegrywa', `Po przegranej ${RULES.examFailCooldownMin} min przerwy, po zaliczeniu powtórka za ${RULES.examRepeatDays} dni`, 'Pierwsze zaliczenie trafia od razu do Ciebie i daje najwięcej punktów']),
    kindCard('quiz', [`Co najmniej ${RULES.quizMinQuestions} pytań z różnych działów`, 'Bez sprawdzania na bieżąco i bez podpowiedzi – wynik dopiero na końcu', `Ocena 1–6 i wskazówki, co powtórzyć · najwyżej ${RULES.quizMaxAttempts} podejścia`, 'Termin, po którym nie da się go rozwiązać']));
  const startCard = (v, ttl, sub, ic) => {
    const b = h('button', { type: 'button', class: 'start-card', role: 'radio', 'aria-checked': String(v === fromSources) }, icon(ic), h('span', {}, h('b', {}, ttl), h('small', {}, sub)));
    b.addEventListener('click', () => { fromSources = v; starts.querySelectorAll('.start-card').forEach((c) => c.setAttribute('aria-checked', String(c === b))); countField.hidden = !!v; tplBox.hidden = v !== 'tpl'; });
    return b;
  };
  const starts = h('div', { class: 'start-cards start-cards--3', role: 'radiogroup', 'aria-label': 'Jak zacząć' },
    startCard(false, 'Puste pytania', g('Wpiszę pytania sam.', 'Wpiszę pytania sama.'), 'plus'),
    startCard(true, 'Wyodrębnij z innych materiałów', 'Skopiuję pytania z testów, sprawdzianów i lekcji – potem mogę je zmieniać.', 'extract'),
    tourId() === 'teacher-test' ? null : startCard('tpl', 'Z szablonu', 'Gotowy układ pytań (np. klasyczny sprawdzian) – wpiszę tylko treść.', 'copy'));
  let template = null;
  const tplBox = h('div', { class: 'field', hidden: true }, h('span', { class: 'field__label' }, 'Szablon'));
  if (tourId() !== 'teacher-test') {
    tplBox.append(await templatePicker({ kind: 'test', emptyLabel: 'Bez szablonu', emptySub: 'Puste pytania', onPick: (t) => {
      template = t;
      if (t?.testKind) cards.querySelector(`.kind-card:nth-child(${['teaching_test', 'exam_test', 'quiz'].indexOf(t.testKind) + 1})`)?.click();
    } }));
  }

  const countField = h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Liczba pytań'), count.el, h('p', { class: 'field__hint' }, 'Możesz później dodawać i usuwać pytania. Możesz też dodać więcej pytań i losować część dla każdego ucznia.'));
  const err = h('div', { 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Utwórz test i przejdź do pytań', icon('arrowRight'));
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '1. Rodzaj testu'), cards),
    field({ label: '2. Nazwa testu', input: title }),
    field({ label: '3. Przedmiot', input: subject }),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '4. Pytania'), starts),
    countField, tplBox,
    examFields, quizFields,
    field({ label: 'Krótki opis dla ucznia (opcjonalnie)', input: summary }),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) { err.replaceChildren(notice('error', 'Wpisz nazwę testu.')); title.focus(); return; }
    if (kind === 'exam_test' && !parseTime(time.value).ok) { err.replaceChildren(notice('error', 'Popraw domyślny czas na pytanie.')); time.focus(); return; }
    withBusy(submit, async () => {
      try {
        const useTpl = fromSources === 'tpl' && template;
        if (fromSources === 'tpl' && !template) { err.replaceChildren(notice('error', 'Wybierz szablon albo zacznij od pustych pytań.')); return; }
        const r = await post('/api/editor/tests', {
          title: title.value, summary: summary.value, subjectId: Number(subject.value), kind, questionCount: fromSources ? 0 : count.value(), tutorial: tourId() === 'teacher-test', templateId: useTpl ? template.id : null,
          settings: { ...DEFAULT_SETTINGS, maxMistakes: mistakes.value(), defaultTime: time.value, deadline: kind === 'quiz' && deadline.value ? new Date(deadline.value).getTime() : null },
        });
        navigate(`${base}/test/${r.test.id}${fromSources === true ? '?wyodrebnij=1' : ''}`, { replace: true });
      } catch (ex) { err.replaceChildren(notice('error', ex.message)); }
    });
  });
  setTimeout(() => title.focus(), 60);
  return h('div', { class: 'wrap wrap--mid' },
    h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie testy'),
    h('div', { class: 'sheet' }, h('h1', {}, 'Nowy test'),
      h('p', { class: 'sheet__lead' }, 'Ustal podstawowe cechy testu. Wszystko możesz zmienić później w „Ustawieniach testu”.'), form));
}

/* ---------- Drobne kontrolki współdzielone z edytorem ---------- */
export function stepper({ value, min, max, label, onChange }) {
  const inp = h('input', { class: 'input stepper__input', type: 'number', inputmode: 'numeric', min, max, value: String(value), 'aria-label': label });
  const clamp = (v) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min));
  const set = (v) => { inp.value = String(clamp(v)); onChange && onChange(clamp(v)); };
  inp.addEventListener('change', () => set(Number(inp.value)));
  inp.addEventListener('input', () => { if (inp.value !== '' && Number(inp.value) >= min && Number(inp.value) <= max) onChange && onChange(Number(inp.value)); });
  const el = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'stepper__btn', 'aria-label': `${label}: mniej`, onClick: () => set(Number(inp.value) - 1) }, icon('minus')),
    inp,
    h('button', { type: 'button', class: 'stepper__btn', 'aria-label': `${label}: więcej`, onClick: () => set(Number(inp.value) + 1) }, icon('plus')));
  return { el, value: () => clamp(Number(inp.value)), input: inp };
}

/** Linia potwierdzenia „komendy” – zielona (poprawna) albo czerwona (do poprawy). */
export function cmdLine() {
  const el = h('p', { class: 'cmd', 'aria-live': 'polite', hidden: true });
  return {
    el,
    set(ok, msg) {
      if (!msg) { el.hidden = true; return; }
      el.hidden = false;
      el.className = `cmd ${ok ? 'cmd--ok' : 'cmd--bad'}`;
      el.replaceChildren(icon(ok ? 'check' : 'warn'), h('span', {}, msg));
    },
  };
}

