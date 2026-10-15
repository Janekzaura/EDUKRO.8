// Tryb ucznia: wybór ścieżki, logowanie, gość, przedmioty, panel przedmiotu, profil, zgłoszenia.
import { dailyStrip } from './daily.js';
import { h, icon, motif, notice, field, input, switchEl, dialog, toast, withBusy, plural, formatDate, pinInput } from '../ui.js';
import { GRADE_NAMES } from '../shared/quiz-rules.js';
import { get, post, put } from '../api.js';
import { navigate, state, setCrumbs, refreshSession, leaveGuards, refreshAvatar, exitButton } from '../app.js';
import { avatarEl, titleTags } from '../avatar.js';
import { isDefault, titleText } from '../shared/shop.js';
import { appearanceEditor } from './appearance.js';
import { celebrate } from '../celebrate.js';
import * as sound from '../sound.js';
import { openProfile } from './profile-card.js';

/** „2 dni 3 godz.”, „5 godz. 12 min”, „14 min” – ile zostało do zniknięcia testu. */
export function leftText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d} ${d === 1 ? 'dzień' : 'dni'}${hh ? ` ${hh} godz.` : ''}`;
  if (hh) return `${hh} godz.${mm ? ` ${mm} min` : ''}`;
  return `${Math.max(1, mm)} min`;
}
function liveLeft(until) {
  const el = h('span', { class: 'temp-left' });
  const tick = () => { const left = until - Date.now(); el.textContent = left > 0 ? `znika za ${leftText(left)}` : 'właśnie zniknął'; return left > 0; };
  tick();
  const t = setInterval(() => { if (!el.isConnected || !tick()) clearInterval(t); }, 30000);
  return el;
}

export const CATEGORIES = [
  { kind: 'lesson', slug: 'lekcje', label: 'Lekcje', icon: 'lesson', forms: ['lekcja', 'lekcje', 'lekcji'],
    desc: 'Zagadnienia wyjaśnione krok po kroku – z ilustracjami, przykładami i elementami do samodzielnego sprawdzenia.' },
  { kind: 'teaching_test', slug: 'testy-nauczajace', label: 'Testy nauczające', icon: 'teaching', forms: ['test', 'testy', 'testów'],
    desc: 'Bez stresu i bez zegara. Po pomyłce od razu zobaczysz poprawną odpowiedź, a błędne pytania wrócą na końcu – aż wszystko opanujesz.' },
  { kind: 'exam_test', slug: 'testy-egzaminacyjne', label: 'Testy egzaminacyjne', icon: 'exam', forms: ['test', 'testy', 'testów'],
    desc: 'Na czas i z limitem pomyłek – jak na prawdziwym sprawdzianie. Pierwsze zaliczenie trafia do nauczyciela i daje najwięcej punktów.' },
  { kind: 'quiz', slug: 'sprawdziany', label: 'Sprawdziany', icon: 'quiz', forms: ['sprawdzian', 'sprawdziany', 'sprawdzianów'],
    desc: 'Pytania z całego działu, sprawdzane dopiero na końcu. Dostaniesz ocenę 1–6 i wskazówki, co powtórzyć. Masz 3 podejścia i termin.' },
  { kind: 'game', slug: 'gry', label: 'Gry', icon: 'game', forms: ['gra', 'gry', 'gier'],
    desc: 'Gry z pytaniami z lekcji: rozbrój bombę w Saperze albo chwyć młotek w Hammer Game.' },
];

/** „Chemia” → „chemii”, „Fizyka” → „fizyki” (dopełniacz do komunikatów). */
export function genitive(name) {
  const n = name.toLocaleLowerCase('pl-PL');
  if (/ia$/.test(n)) return n.replace(/ia$/, 'ii');
  if (/[kg]a$/.test(n)) return n.replace(/a$/, 'i');
  if (/a$/.test(n)) return n.replace(/a$/, 'y');
  return `przedmiotu ${name}`;
}
const teacherNames = (list) => list.map((t) => `${t.firstName} ${t.lastName}`).join(', ');

function back(label, path) {
  return h('button', { class: 'back', type: 'button', onClick: () => (path ? navigate(path) : history.back()) }, icon('arrowLeft'), label);
}
function errorBox() { return h('div', { class: 'form-error', 'aria-live': 'assertive' }); }
function showError(box, err) { box.replaceChildren(notice('error', err.message)); }

/* ---------- Wybór: logowanie / rejestracja / gość ---------- */
export async function hubView() {
  if (state.user.role === 'student') { navigate('/uczen/przedmioty', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia' }]);
  const path = (title, desc, to, primary) => h('a', { class: ['path', primary && 'path--primary'], href: to, 'data-link': '' },
    h('span', { class: 'path__title' }, title), h('span', { class: 'path__desc' }, desc), icon('arrowRight', 'path__arrow'));
  return h('div', { class: 'wrap wrap--narrow' },
    back('Ekran główny', '/'),
    h('div', { class: 'sheet' },
      h('h1', {}, 'Tryb ucznia'),
      h('p', { class: 'sheet__lead' }, 'Zaloguj się, aby uczyć się i zapisywać postępy. Możesz też najpierw rozejrzeć się jako gość.'),
      h('div', { class: 'paths' },
        path('Zaloguj się', 'Mam już konto w EDUKRO.', '/uczen/logowanie', true),
        path('Utwórz konto', 'Pierwszy raz w EDUKRO – założę konto ucznia.', '/uczen/rejestracja'),
        path('Przeglądaj jako gość', 'Zobaczę przedmioty i materiały bez logowania.', '/uczen/przedmioty'))));
}

/* ---------- Logowanie ucznia ---------- */
export async function loginView() {
  if (state.user.role === 'student') { navigate('/uczen/profil', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia', href: '/uczen' }, { label: 'Logowanie' }]);
  const first = input({ name: 'given-name', autocomplete: 'given-name', required: true, maxlength: 60 });
  const last = input({ name: 'family-name', autocomplete: 'family-name', required: true, maxlength: 80 });
  const len = state.status?.pinLength || 4;
  const pin = pinInput({ length: len, label: 'Kod PIN', onComplete: () => form.requestSubmit() });
  const longCode = input({ type: 'password', autocomplete: 'current-password', maxlength: 64 });
  let useLong = false;
  const codeField = h('div', { class: 'field' });
  const renderCode = () => {
    codeField.replaceChildren(h('span', { class: 'field__label' }, useLong ? 'Twój kod dostępu' : `Twój kod PIN (${len} cyfry)`), useLong ? longCode : pin.el,
      h('button', { class: 'linkish', type: 'button', style: { justifySelf: 'start' }, onClick: () => { useLong = !useLong; renderCode(); (useLong ? longCode : pin).focus(); } }, useLong ? `Mam kod PIN (${len} cyfry)` : 'Mój kod jest dłuższy (konto założone wcześniej)'));
  };
  renderCode();
  const err = errorBox();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Zaloguj się');
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })),
    codeField, err, submit);
  const codeValue = () => (useLong ? longCode.value : pin.value());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!first.value.trim() || !last.value.trim() || !codeValue()) return showError(err, new Error('Uzupełnij imię, nazwisko i kod.'));
    withBusy(submit, async () => {
      try {
        const r = await post('/api/auth/student/login', { firstName: first.value, lastName: last.value, code: codeValue() });
        state.user = r.user;
        toast(`Witaj, ${r.user.firstName}!`);
        navigate('/uczen/profil');
      } catch (ex) { longCode.value = ''; pin.error(); pin.clear(); showError(err, ex); }
    });
  });
  setTimeout(() => first.focus(), 50);
  return h('div', { class: 'wrap wrap--narrow' },
    back('Tryb ucznia', '/uczen'),
    h('div', { class: 'sheet' },
      h('h1', {}, 'Logowanie ucznia'),
      form,
      h('div', { class: 'sheet__foot' },
        h('span', {}, 'Nie masz konta? ', h('a', { href: '/uczen/rejestracja', 'data-link': '' }, 'Utwórz konto')),
        h('a', { href: '/uczen/zgloszenie', 'data-link': '' }, 'Moje imię i nazwisko jest zajęte'),
        h('a', { href: '/uczen/nowy-kod', 'data-link': '' }, 'Mam kod resetu od administratora'),
        h('span', {}, 'Nie pamiętasz kodu? Poproś administratora EDUKRO o reset dostępu.'))));
}

/* ---------- „Moje imię i nazwisko jest zajęte” ---------- */
export async function claimView() {
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia', href: '/uczen' }, { label: 'Zgłoszenie' }]);
  const first = input({ autocomplete: 'given-name', maxlength: 60 });
  const last = input({ autocomplete: 'family-name', maxlength: 80 });
  const cls = input({ maxlength: 40, placeholder: 'np. 6b' });
  const desc = h('textarea', { class: 'textarea', maxlength: 1000, placeholder: 'Np. chcę założyć konto, ale EDUKRO informuje, że dla moich danych konto już istnieje.' });
  const err = errorBox();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Wyślij zgłoszenie');
  const sheet = h('div', { class: 'sheet' });
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })),
    field({ label: 'Twoja klasa', input: cls, hint: 'Administrator znajdzie Cię w szkole i pomoże z kontem.' }),
    field({ label: 'Opis problemu (opcjonalnie)', input: desc }),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(submit, async () => {
      try {
        await post('/api/claims', { firstName: first.value, lastName: last.value, classLabel: cls.value, description: desc.value });
        sheet.replaceChildren(
          icon('check', 'dialog__icon'),
          h('h1', {}, 'Zgłoszenie wysłane'),
          h('p', { class: 'sheet__lead' }, 'Status zgłoszenia: oczekuje na weryfikację. Administrator EDUKRO sprawdzi sytuację i odezwie się do Ciebie w szkole (np. przez wychowawcę).'),
          h('div', { class: 'sheet__body' }, h('a', { class: 'btn btn--ghost', href: '/uczen', 'data-link': '' }, 'Wróć do trybu ucznia')));
      } catch (ex) { showError(err, ex); }
    });
  });
  sheet.append(h('h1', {}, 'Moje imię i nazwisko jest zajęte'),
    h('p', { class: 'sheet__lead' }, 'Jeśli nie możesz założyć konta, bo ktoś już używa Twoich danych, wyślij zgłoszenie. Administrator je sprawdzi – samo zgłoszenie nie daje dostępu do żadnego konta.'),
    form);
  return h('div', { class: 'wrap wrap--narrow' }, back('Wróć', null), sheet);
}

/* ---------- Nowy kod po resecie administratora ---------- */
export async function resetView() {
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia', href: '/uczen' }, { label: 'Nowy kod dostępu' }]);
  const len = state.status?.pinLength || 4;
  const first = input({ autocomplete: 'given-name', maxlength: 60 });
  const last = input({ autocomplete: 'family-name', maxlength: 80 });
  const reset = input({ autocomplete: 'one-time-code', maxlength: 14, placeholder: 'XXXXX-XXXXX', style: { textTransform: 'uppercase', letterSpacing: '.08em' } });
  const c1 = pinInput({ length: len, label: 'Nowy kod PIN' });
  const c2 = pinInput({ length: len, label: 'Powtórz nowy kod PIN' });
  const err = errorBox();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Ustaw nowy kod');
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })),
    field({ label: 'Kod resetu od administratora', input: reset }),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, `Nowy kod PIN (${len} cyfry)`), c1.el, h('p', { class: 'field__hint' }, 'Unikaj prostych kodów jak 1234 czy 7777.')),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Powtórz nowy kod PIN'), c2.el),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(submit, async () => {
      try {
        const r = await post('/api/auth/student/reset', { firstName: first.value, lastName: last.value, resetCode: reset.value, newCode: c1.value(), newCodeRepeat: c2.value() });
        state.user = r.user;
        toast('Nowy kod dostępu został ustawiony.');
        navigate('/uczen/profil');
      } catch (ex) { showError(err, ex); }
    });
  });
  return h('div', { class: 'wrap wrap--narrow' }, back('Logowanie', '/uczen/logowanie'),
    h('div', { class: 'sheet' }, h('h1', {}, 'Nowy kod dostępu'),
      h('p', { class: 'sheet__lead' }, 'Wpisz kod resetu otrzymany od administratora i ustaw nowy kod dostępu do konta.'), form));
}

/* ---------- Okno: aktywność wymaga konta ---------- */
export function lockedDialog() {
  dialog({
    iconName: 'lock',
    title: 'Zaloguj się, aby zacząć',
    body: h('p', {}, 'Ta aktywność jest dostępna dla zalogowanych uczniów. Utwórz konto lub zaloguj się, aby rozpocząć naukę i zapisywać swoje postępy.'),
    actions: [
      { label: 'Wróć do przeglądania', kind: 'quiet' },
      { label: 'Utwórz konto', kind: 'ghost', onClick: () => navigate('/uczen/rejestracja') },
      { label: 'Zaloguj się', kind: 'primary', onClick: () => navigate('/uczen/logowanie') },
    ],
  });
}
const pendingDialog = () => {}; // konto oczekujące ma dostęp do aktywności – blokada dotyczy tylko wydawania punktów

function guestStrip() {
  return h('div', { class: 'guest-strip' }, icon('info', 'lock'),
    h('span', {}, 'Przeglądasz EDUKRO jako gość. Aby uruchamiać lekcje, testy i gry oraz zapisywać wyniki, zaloguj się.'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn btn--ghost btn--sm', href: '/uczen/rejestracja', 'data-link': '' }, 'Utwórz konto'),
      h('a', { class: 'btn btn--primary btn--sm', href: '/uczen/logowanie', 'data-link': '' }, 'Zaloguj się')));
}
function pendingStrip() {
  return notice('info', h('strong', {}, 'Konto czeka na zatwierdzenie. '), 'Możesz się uczyć i zbierać punkty – wydasz je w sklepie, gdy administrator zatwierdzi konto.');
}

/* ---------- Wybór przedmiotu ---------- */
export async function subjectsView() {
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia', href: state.user.role === 'student' ? null : '/uczen' }, { label: 'Przedmioty' }]);
  const { subjects } = await get('/api/subjects');
  const u = state.user;
  const head = h('header', { class: 'page-head' },
    h('h1', {}, u.role === 'student' ? `Cześć, ${u.firstName}` : 'Wybierz przedmiot'),
    h('p', {}, u.role === 'student' ? 'Wybierz przedmiot, z którym chcesz dziś pracować.' : 'Zobacz, jakie materiały czekają w EDUKRO.'));
  const totalOf = (s) => Object.values(s.counts).reduce((a, b) => a + b, 0);
  const card = (s) => {
    const total = totalOf(s);
    return h('a', { class: `subject acc-${s.accent}`, href: `/uczen/przedmiot/${s.slug}`, 'data-link': '' },
      h('span', { class: 'subject__motif' }, motif(s.motif)),
      h('h2', { class: 'subject__name' }, s.name),
      h('p', { class: 'subject__desc' }, s.description),
      h('div', { class: 'subject__meta' },
        s.teachers.length ? h('span', {}, 'Prowadzi ', h('b', {}, teacherNames(s.teachers))) : null,
        h('span', {}, total ? `${total} ${plural(total, ['materiał', 'materiały', 'materiałów'])}` : 'Materiały w przygotowaniu')),
      h('span', { class: 'subject__go', 'aria-hidden': 'true' }, icon('arrowRight')));
  };
  // Przedmioty z materiałami na górze; pozostałe (jeszcze puste) zwinięte, żeby nie przewijać 20 kafelków.
  const ready = subjects.filter((s) => totalOf(s) > 0);
  const empty = subjects.filter((s) => !totalOf(s));
  const main = ready.length ? ready : subjects;
  const grid = h('div', { class: 'subjects' }, ...main.map(card));
  const rest = ready.length && empty.length ? h('details', { class: 'acc subjects-more', 'data-help': 'Przedmioty, w których nauczyciele jeszcze nie dodali materiałów.' },
    h('summary', { class: 'acc__head' }, h('span', { class: 'acc__icon' }, icon('subjects')), h('span', { class: 'acc__txt' }, h('b', {}, 'Pozostałe przedmioty'), h('small', {}, 'Materiały w przygotowaniu')),
      h('span', { class: 'acc__count' }, String(empty.length)), icon('chevron', 'acc__caret')),
    h('div', { class: 'acc__body' }, h('div', { class: 'subjects subjects--small' }, ...empty.map(card)))) : null;
  const body = [u.role === 'guest' ? guestStrip() : null, u.role === 'student' && u.status === 'pending' ? h('div', { style: { marginBottom: '24px' } }, pendingStrip()) : null];
  if (!subjects.length) grid.replaceChildren(h('p', { class: 'muted' }, 'Żaden przedmiot nie jest jeszcze dostępny.'));
  const daily = await dailyStrip();
  return h('div', { class: 'wrap' }, head, ...body, daily, grid, rest);
}

/* ---------- Panel przedmiotu ---------- */
export async function subjectView({ params }) {
  const [slug, catSlug] = params;
  const data = await get(`/api/subjects/${encodeURIComponent(slug)}`);
  const s = data.subject;
  const u = state.user;
  let cat = CATEGORIES.find((c) => c.slug === catSlug) || CATEGORIES[0];
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: s.name }]);

  const view = h('div', { class: 'cat-view', role: 'tabpanel' });
  const tabs = CATEGORIES.map((c) => {
    const n = data.categories[c.kind].length;
    const b = h('button', { class: 'cat', type: 'button', role: 'tab', 'aria-selected': String(c === cat), 'aria-controls': 'cat-panel' },
      icon(c.icon), h('span', {}, c.label), h('span', { class: 'cat__count', 'aria-label': `${n} ${plural(n, c.forms)}` }, String(n)));
    b.addEventListener('click', () => select(c, true));
    return b;
  });
  view.id = 'cat-panel';

  function select(c, push) {
    cat = c;
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(CATEGORIES[i] === c)));
    const active = tabs[CATEGORIES.indexOf(c)];
    if (active.isConnected) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    else requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    if (push) history.replaceState({}, '', `/uczen/przedmiot/${s.slug}/${c.slug}`);
    const items = data.categories[c.kind];
    const fresh = h('div', { class: 'cat-view', id: 'cat-panel', role: 'tabpanel' },
      h('header', { class: 'cat-view__head' }, h('h2', {}, c.label), h('p', {}, c.kind === 'game' ? `Gry z pytaniami z ${genitive(s.name)}: rozbrój bombę w Saperze albo chwyć młotek w Hammer Game. Pierwsza wygrana daje punkty.` : c.desc)),
      items.length ? h('div', { class: 'items' }, ...items.map((a) => activityRow(a, c))) : emptyState(c));
    currentView.replaceWith(fresh);
    currentView = fresh;
  }
  let currentView = view;

  function emptyState(c) {
    const who = s.teachers.length ? teacherNames(s.teachers) : 'nauczyciel';
    return h('div', { class: 'empty' }, icon(c.icon, 'empty__icon'),
      h('div', {}, h('h3', {}, `Nie ma jeszcze ${c.forms[2]} z ${genitive(s.name)}`),
        h('p', {}, c.kind === 'lesson' && u.role === 'student' ? 'Lekcje pojawiają się tutaj, gdy nauczyciel przerobi je z Twoją klasą (albo opublikuje dla niej).' : `Gdy ${who} opublikuje pierwsze materiały w tej kategorii, pojawią się tutaj.`),
        u.role === 'guest' ? h('p', {}, 'Załóż konto już teraz, aby od razu zacząć, gdy materiały będą gotowe.') : null));
  }

  function testRow(a, c) {
    const exam = c.kind === 'exam_test';
    const quiz = c.kind === 'quiz';
    const st = a.status;
    let badge = null, label = 'Rozpocznij';
    if (quiz) return quizRow(a, st);
    if (st?.activeAttemptId) { badge = h('span', { class: 'badge badge--info' }, 'W trakcie'); label = 'Kontynuuj'; }
    else if (st && !st.canStart && st.reason === 'failed') badge = h('span', { class: 'badge badge--wait' }, 'Przerwa po nieudanej próbie');
    else if (st && !st.canStart && st.reason === 'passed') { badge = h('span', { class: 'badge badge--ok' }, 'Zaliczony'); label = 'Szczegóły'; }
    else if (st?.passedCount) { badge = h('span', { class: 'badge badge--ok' }, exam ? 'Zaliczony – można powtórzyć' : 'Ukończony'); label = exam ? 'Powtórz' : 'Jeszcze raz'; }
    const btn = h('button', { class: ['btn btn--sm', st?.activeAttemptId ? 'btn--primary' : 'btn--ghost'], type: 'button' }, label, icon('arrowRight'));
    btn.addEventListener('click', () => {
      if (u.role !== 'student') return lockedDialog();
      navigate(`/uczen/test/${a.id}`);
    });
    const meta = h('span', { class: 'test-meta' },
      h('span', {}, icon('list'), `${a.questionCount} ${plural(a.questionCount, ['pytanie', 'pytania', 'pytań'])}`),
      exam ? h('span', {}, icon('clock'), 'na czas') : null,
      exam ? h('span', {}, icon('heart'), a.maxMistakes ? `${a.maxMistakes} ${plural(a.maxMistakes, ['pomyłka', 'pomyłki', 'pomyłek'])}` : 'bez pomyłek') : null,
      a.points ? h('span', { class: 'test-meta__pts' }, icon('star'), `+${a.points} pkt`) : null,
      a.reward ? h('span', { class: 'test-meta__reward', title: 'Nagroda za ukończenie – trafi do skrzynki' }, icon('gift'), a.reward) : null);
    const temp = a.expiresAt ? h('span', { class: 'temp-flag', 'data-help': 'Test tymczasowy – po tym czasie zniknie z listy. Rozwiąż go wcześniej!' }, icon('hourglass'), 'Test tymczasowy · ', liveLeft(a.expiresAt)) : null;
    return h('div', { class: ['item item--test', a.expiresAt && 'item--temp'] }, temp, h('h3', { class: 'item__title' }, a.title, badge ? ' ' : null, badge),
      h('p', { class: 'item__summary' }, a.summary ? h('span', { class: 'item__desc' }, a.summary) : null, meta,
        a.requiresAccount && u.role === 'guest' ? h('span', { class: 'lock' }, ' ', icon('lock'), 'Wymaga konta') : null), btn);
  }

  function quizRow(a, st) {
    let badge = null, label = 'Rozpocznij';
    const past = a.deadline && a.deadline < Date.now();
    if (st?.activeAttemptId) { badge = h('span', { class: 'badge badge--info' }, 'W trakcie'); label = 'Kontynuuj'; }
    else if (st?.bestGrade) { badge = h('span', { class: `badge ${st.bestGrade >= 3 ? 'badge--ok' : 'badge--wait'}` }, `Ocena ${st.bestGrade} – ${GRADE_NAMES[st.bestGrade - 1]}`); label = st.canStart ? 'Popraw ocenę' : 'Szczegóły'; }
    else if (past) badge = h('span', { class: 'badge badge--plain' }, 'Termin minął');
    const btn = h('button', { class: ['btn btn--sm', st?.activeAttemptId ? 'btn--primary' : 'btn--ghost'], type: 'button' }, label, icon('arrowRight'));
    btn.addEventListener('click', () => { if (u.role !== 'student') return lockedDialog(); navigate(`/uczen/test/${a.id}`); });
    const meta = h('span', { class: 'test-meta' },
      h('span', {}, icon('list'), `${a.questionCount} ${plural(a.questionCount, ['pytanie', 'pytania', 'pytań'])}`),
      a.deadline ? h('span', { class: past ? 'is-past' : null }, icon('calendar'), `do ${new Date(a.deadline).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`) : null,
      st && st.attemptsLeft !== undefined ? h('span', {}, icon('repeat'), `podejścia: ${st.attemptsLeft}/3`) : null,
      h('span', { class: 'test-meta__pts' }, icon('star'), `do +${a.points} pkt`),
      a.reward ? h('span', { class: 'test-meta__reward', title: 'Nagroda – trafi do skrzynki' }, icon('gift'), a.reward) : null);
    return h('div', { class: 'item item--test' }, h('h3', { class: 'item__title' }, a.title, badge ? ' ' : null, badge),
      h('p', { class: 'item__summary' }, a.summary ? h('span', { class: 'item__desc' }, a.summary) : null, meta,
        u.role === 'guest' ? h('span', { class: 'lock' }, ' ', icon('lock'), 'Wymaga konta') : null), btn);
  }

  function lessonRow(a) {
    const btn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Otwórz lekcję', icon('arrowRight'));
    btn.addEventListener('click', () => { if (u.role !== 'student') return lockedDialog(); navigate(`/uczen/lekcja/${a.id}`); });
    const meta = h('span', { class: 'test-meta' }, h('span', {}, icon('slides'), `${a.slideCount} ${plural(a.slideCount, ['slajd', 'slajdy', 'slajdów'])}`),
      a.taughtAt ? h('span', {}, icon('check'), `z lekcji ${new Date(a.taughtAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`) : a.className ? h('span', {}, icon('users'), a.className) : null);
    return h('div', { class: 'item item--test' }, h('h3', { class: 'item__title' }, a.title),
      h('p', { class: 'item__summary' }, a.summary ? h('span', { class: 'item__desc' }, a.summary) : null, meta,
        u.role === 'guest' ? h('span', { class: 'lock' }, ' ', icon('lock'), 'Wymaga konta') : null), btn);
  }

  function gameRow(a) {
    const st = a.status;
    const badge = st?.wins ? h('span', { class: 'badge badge--ok' }, a.gameType === 'saper' ? 'Bomba rozbrojona' : `APPROVED${st.best !== null ? ` · ${st.best}%` : ''}`)
      : st?.played ? h('span', { class: 'badge badge--wait' }, a.gameType === 'saper' ? 'Bomba wybuchła – spróbuj jeszcze raz' : `DECLINED · najlepiej ${st.best}%`) : null;
    const btn = h('button', { class: ['btn btn--sm', st?.played ? 'btn--ghost' : 'btn--primary'], type: 'button' }, st?.played ? 'Zagraj jeszcze raz' : 'Zagraj', icon('arrowRight'));
    btn.addEventListener('click', () => { if (u.role !== 'student') return lockedDialog(); navigate(`/uczen/gra/${a.id}`); });
    const meta = h('span', { class: 'test-meta' }, h('span', {}, icon(a.gameType === 'saper' ? 'bomb' : 'hammer'), a.typeLabel), h('span', {}, icon('list'), a.summaryLine),
      a.points ? h('span', { class: 'test-meta__pts' }, icon('star'), st?.wins ? 'punkty zdobyte' : `${a.gameType === 'hammer' ? 'do ' : ''}+${a.points} pkt`) : null);
    return h('div', { class: ['item item--test item--game', `item--${a.gameType}`] }, h('h3', { class: 'item__title' }, a.title, badge ? ' ' : null, badge),
      h('p', { class: 'item__summary' }, a.summary ? h('span', { class: 'item__desc' }, a.summary) : null, meta,
        u.role === 'guest' ? h('span', { class: 'lock' }, ' ', icon('lock'), 'Wymaga konta') : null), btn);
  }

  function activityRow(a, c) {
    if (a.isGame) return gameRow(a);
    if (a.isTest) return testRow(a, c);
    if (a.isLesson) return lessonRow(a);
    const btn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Rozpocznij', icon('arrowRight'));
    btn.addEventListener('click', () => {
      if (a.requiresAccount && u.role !== 'student') return lockedDialog();
      pendingDialog();
      withBusy(btn, async () => {
        try {
          await post(`/api/activities/${a.id}/start`);
          dialog({ iconName: 'info', title: a.title, body: h('p', {}, 'Ta aktywność jest gotowa do uruchomienia, ale moduł odtwarzania materiałów zostanie dodany w kolejnym etapie rozwoju EDUKRO.'), actions: [{ label: 'Zamknij', kind: 'primary' }] });
        } catch (e) {
          if (e.body?.needLogin) lockedDialog(); else if (e.body?.pending) pendingDialog(); else toast(e.message, 'error');
        }
      });
    });
    return h('div', { class: 'item' }, h('h3', { class: 'item__title' }, a.title),
      h('p', { class: 'item__summary' }, a.summary || '', a.requiresAccount && u.role === 'guest' ? h('span', { class: 'lock' }, ' ', icon('lock'), 'Wymaga konta') : null), btn);
  }

  const layout = h('div', { class: 'subject-layout' },
    h('nav', { 'aria-label': 'Kategorie' }, h('div', { class: 'cats', role: 'tablist', 'aria-orientation': 'vertical' }, ...tabs)), view);
  const root = h('div', { class: `wrap acc-${s.accent}` },
    back('Przedmioty', '/uczen/przedmioty'),
    u.role === 'guest' ? guestStrip() : null,
    u.role === 'student' && u.status === 'pending' ? h('div', { style: { marginBottom: '24px' } }, pendingStrip()) : null,
    h('header', { class: `subject-head acc-${s.accent}` },
      h('span', { class: 'subject-head__motif' }, motif(s.motif)),
      h('h1', {}, s.name),
      h('p', {}, s.description),
      s.teachers.length ? h('p', { class: 'teacher-line' }, `Nauczyciel: ${teacherNames(s.teachers)}`) : null),
    layout);
  // pierwsze wypełnienie
  queueMicrotask(() => select(cat, false));
  return root;
}

/* ---------- Mój profil: personalizacja (bez sklepu – sklep jest na dole strony) ---------- */
export async function profileView() {
  if (state.user.role !== 'student') { navigate('/uczen/logowanie', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: 'Mój profil' }]);
  const [p, S] = await Promise.all([get('/api/me/profile'), get('/api/shop')]);
  state.user = { ...state.user, ...p.user };
  const u = state.user;
  let prof = { ...S.profile };
  let stopPreview = null;
  leaveGuards.add(() => stopPreview?.());
  const owned = (key) => isDefault(key) || S.owned.includes(key);
  const me = () => ({ ...S.me, avatar: prof.avatar, frame: prof.frame, title: titleText(prof.title, u.gender), music: prof.music, cele: prof.cele, schoolStar: S.me?.schoolStar });

  /* nagłówek: profilowe z ramką, imię z tytułami, punkty */
  const hero = h('div', { class: 'pf-hero__av' });
  const heroName = h('div', { class: 'pf-hero__name' });
  const drawHero = () => {
    const c = me();
    hero.replaceChildren(h('button', { class: 'profile-head__av', type: 'button', 'aria-label': 'Zobacz, jak inni widzą Twój profil', 'data-help': 'Tak inni widzą Twój profil – kliknij, żeby zobaczyć (zagra Twoja muzyka).', onClick: () => openProfile(u.id) }, avatarEl(c, { size: 92 })));
    heroName.replaceChildren(h('h1', {}, `${u.firstName} ${u.lastName}`), h('div', { class: 'profile-head__titles' }, ...titleTags(c)),
      h('p', { class: 'muted' }, [p.classLabel ? `klasa ${p.classLabel}` : null, u.status === 'pending' ? 'konto czeka na zatwierdzenie' : null].filter(Boolean).join(' · ') || 'Twój profil w EDUKRO'));
  };
  async function choose(part, id, label) {
    if (prof[part] === id) return;
    try {
      const r = await put('/api/me/profile', { profile: { [part]: id } });
      prof = { ...r.profile }; S.profile = r.profile;
      state.user.card = r.card;
      refreshAvatar();
      sound.setTrack(r.card.music);
      drawHero(); drawChoosers();
      toast(`Ustawiono: ${label}.`);
    } catch (e) { toast(e.message, 'error'); }
  }

  /* wybór z posiadanych rzeczy – kliknięcie od razu zapisuje */
  const choosers = [];
  const drawChoosers = () => choosers.forEach((f) => f());
  function chooser(part, list, tile) {
    const grid = h('div', { class: `pf-grid pf-grid--${part}`, role: 'radiogroup' });
    const draw = () => grid.replaceChildren(...list.filter((x) => owned(`${part === 'cele' ? 'cele' : part}:${x.id}`)).map((x) => {
      const on = prof[part] === x.id;
      const label = part === 'title' ? (x.id === 'none' ? 'Bez tytułu' : titleText(x.id, u.gender)) : x.name;
      return h('button', { class: ['pf-tile', on && 'is-on'], type: 'button', role: 'radio', 'aria-checked': String(on), title: label, onClick: () => choose(part, x.id, label) }, tile(x, label));
    }));
    choosers.push(draw); draw();
    return grid;
  }
  const playBtn = (fn, label) => h('span', { class: 'pf-play', role: 'button', tabindex: '0', 'aria-label': label, onClick: (e) => { e.stopPropagation(); fn(e); } }, icon('play'));
  const moreLink = (txt, hash) => h('a', { class: 'pf-more', href: `/uczen/sklep#${hash}`, 'data-link': '' }, icon('bag'), txt);

  let openSet;
  try { openSet = new Set(JSON.parse(sessionStorage.getItem('edukro-profile-open') || '["p-profilowe"]')); } catch { openSet = new Set(['p-profilowe']); }
  function acc(id, ic, title, sub, ...content) {
    const d = h('details', { class: 'acc', id, open: openSet.has(id) },
      h('summary', { class: 'acc__head' }, h('span', { class: 'acc__icon' }, icon(ic)), h('span', { class: 'acc__txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null), icon('chevron', 'acc__caret')),
      h('div', { class: 'acc__body' }, ...content));
    d.addEventListener('toggle', () => { if (d.open) openSet.add(id); else openSet.delete(id); try { sessionStorage.setItem('edukro-profile-open', JSON.stringify([...openSet])); } catch { /* nic */ } });
    return d;
  }

  const kindLabel = Object.fromEntries(CATEGORIES.map((c) => [c.kind, c.label]));
  const results = p.results.length
    ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Aktywność'), h('th', {}, 'Przedmiot'), h('th', {}, 'Wynik'), h('th', {}, 'Data'))),
      h('tbody', {}, ...p.results.map((r) => h('tr', {},
        h('td', {}, r.title, h('div', { class: 'small muted' }, kindLabel[r.kind])),
        h('td', { 'data-label': 'Przedmiot' }, r.subject),
        h('td', { 'data-label': 'Wynik', class: 'num' }, r.maxScore ? `${r.score} / ${r.maxScore}` : '—', r.grade ? h('div', { class: 'small muted' }, `ocena ${r.grade}`) : null, r.direct ? h('div', { class: 'small muted' }, 'wysłany do nauczyciela') : null),
        h('td', { 'data-label': 'Data' }, formatDate(r.completedAt)))))))
    : h('p', { class: 'muted' }, 'Ukończone testy i sprawdziany będą zapisywać się tutaj.');
  const history = p.points.history.length
    ? h('ul', { class: 'points-list' }, ...p.points.history.slice(0, 20).map((x) => h('li', { class: x.amount < 0 ? 'is-spent' : null }, h('span', {}, x.reason), h('b', {}, `${x.amount > 0 ? '+' : ''}${x.amount}`), h('small', {}, formatDate(x.createdAt)))))
    : h('p', { class: 'muted' }, 'Jeszcze nic – punkty zdobywasz za testy, sprawdziany i na lekcjach.');

  drawHero();
  return h('div', { class: 'wrap wrap--mid pf' },
    h('div', { class: 'page-top' }, exitButton()),
    h('header', { class: 'pf-hero' }, hero, heroName,
      h('a', { class: 'wallet pf-wallet', href: '#p-punkty', 'data-help': 'Twoje punkty – historia jest niżej („Punkty”).', onClick: (e) => { e.preventDefault(); const d = document.getElementById('p-punkty'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, icon('star'), h('b', {}, String(p.points.balance)), h('span', {}, 'pkt'))),
    u.status === 'pending' ? notice('info', h('strong', {}, 'Konto czeka na zatwierdzenie. '), 'Możesz się uczyć i zbierać punkty, ale wydasz je dopiero po zatwierdzeniu przez administratora.') : null,
    p.points.toClaim ? h('a', { class: 'claim-strip', href: '/skrzynka', 'data-link': '' }, icon('gift'), h('span', {}, h('b', {}, p.points.pointsToClaim ? `+${p.points.pointsToClaim} pkt czeka na odebranie` : 'Nagroda czeka na odebranie'), ' w Twojej skrzynce'), icon('arrowRight')) : null,
    h('div', { class: 'acc-list' },
      acc('p-profilowe', 'user', 'Profilowe i ramka', 'Kliknij, żeby ustawić – zapisuje się od razu',
        h('h3', { class: 'pf-sub' }, 'Profilowe'), chooser('avatar', S.catalog.avatars, (x) => avatarEl({ ...S.me, avatar: x.id, frame: 'none' }, { size: 46, frame: false })),
        h('h3', { class: 'pf-sub' }, 'Ramka'), chooser('frame', S.catalog.frames, (x, label) => [avatarEl({ ...S.me, avatar: prof.avatar, frame: x.id }, { size: 34 }), h('small', {}, label)]),
        moreLink('Więcej profilowych i ramek w sklepie', 'profilowe')),
      acc('p-tytul', 'medal', 'Tytuł', 'Widać go przy Twoim imieniu w rankingach',
        chooser('title', S.catalog.titles, (x, label) => h('span', { class: 'pf-title' }, x.id === 'none' ? label : `〈${label}〉`)),
        moreLink('Więcej tytułów w sklepie', 'tytuly')),
      acc('p-muzyka', 'music', 'Muzyka i efekt po teście', 'Muzyka gra też u osoby, która otworzy Twój profil',
        h('h3', { class: 'pf-sub' }, 'Muzyka'),
        chooser('music', S.catalog.music, (x, label) => [playBtn(() => { stopPreview?.(); stopPreview = sound.previewTrack(x.id, 10000); }, `Posłuchaj: ${label}`), h('span', {}, label)]),
        h('p', { class: 'muted small' }, 'Żeby muzyka grała w tle, włącz ją w Ustawienia → Dźwięk → „Muzyka w tle”.'),
        h('h3', { class: 'pf-sub' }, 'Efekt po teście'),
        chooser('cele', S.catalog.cele, (x, label) => [playBtn((e) => { const r = e.currentTarget.getBoundingClientRect(); celebrate({ count: 70, style: x.id, origin: [r.left + r.width / 2, r.top] }); }, `Pokaż: ${label}`), h('span', {}, label)]),
        moreLink('Więcej muzyki i efektów w sklepie', 'muzyka')),
      acc('p-wyglad', 'palette', 'Wygląd aplikacji', 'Kolory tła, przycisków i kart pytań, kolor tekstu, czcionka', appearanceEditor(S), moreLink('Więcej kolorów i czcionek w sklepie', 'kolory')),
      acc('p-wyniki', 'results', 'Moje wyniki', `${p.results.length} ${plural(p.results.length, ['wynik', 'wyniki', 'wyników'])}`, results),
      acc('p-punkty', 'star', 'Punkty', `Masz ${p.points.balance} pkt${p.points.lifelines ? ` · koła ratunkowe: ${p.points.lifelines}` : ''}`, history)),
    h('a', { class: 'shop-cta', href: '/uczen/sklep', 'data-link': '', 'data-help': 'Sklep EDUKRO: nowe profilowe, ramki, tytuły, muzyka, kolory, czcionki, koła ratunkowe i pochwała od wychowawcy.' },
      h('span', { class: 'shop-cta__icon' }, icon('bag')),
      h('span', { class: 'shop-cta__txt' }, h('b', {}, 'Sklep EDUKRO'), h('small', {}, 'Profilowe, ramki, tytuły, muzyka, kolory, koła ratunkowe i pochwała – za punkty')),
      h('span', { class: 'shop-cta__pts' }, icon('star'), String(p.points.balance)), icon('arrowRight', 'shop-cta__go')));
}

/** Okno zmiany własnego kodu (uczeń). */
export function changeCodeDialog() {
  const len = state.status?.pinLength || 4;
  const cur = input({ type: 'password', autocomplete: 'current-password', maxlength: 64 });
  const n1 = pinInput({ length: len, label: 'Nowy kod PIN' });
  const n2 = pinInput({ length: len, label: 'Powtórz nowy kod PIN' });
  const err = errorBox();
  dialog({
    iconName: 'key', title: 'Zmień kod PIN',
    body: [field({ label: 'Obecny kod', input: cur }),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, `Nowy kod PIN (${len} cyfry)`), n1.el),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Powtórz nowy kod PIN'), n2.el), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Zapisz nowy kod', kind: 'primary', onClick: async () => {
        try { await post('/api/auth/change-code', { current: cur.value, next: n1.value(), nextRepeat: n2.value() }); toast('Kod PIN został zmieniony.'); await refreshSession(); }
        catch (e) { showError(err, e); return false; }
      },
    }],
  });
}
