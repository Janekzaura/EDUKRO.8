// Panel administratora. Wejście ukryte na ekranie głównym; uprawnienia nadaje WYŁĄCZNIE serwer.
import { h, icon, notice, pinInput, field, input, dialog, toast, withBusy, formatDate } from '../ui.js';
import { get, post, patch, del } from '../api.js';
import { navigate, state, setCrumbs, refreshSession } from '../app.js';
import { CATEGORIES } from './student.js';
import { changePinForm } from './pin.js';
import { testsSection } from './tests-list.js';
import { lessonsSection } from './lessons-list.js';
import { gamesSection } from './games-list.js';
import { praiseSection } from './praise.js';
import { grantsSection, grantDialog } from './grants.js';
import { shopAdminSection } from './admin-shop.js';
import { openTutorialMenu } from '../tutorials.js';
import { GRADES, SECTIONS as CLASS_SECTIONS, parseClass } from '../shared/classes.js';
import { g } from '../g.js';
import { genderToggle } from './gender-pick.js';
import { dailySection } from './daily.js';

/** Dwa pola: klasa (1–8) i oddział (a–f). */
function classSelects(label = '', { grade = '', section = '' } = {}) {
  const g = h('select', { class: 'select', 'aria-label': 'Klasa' }, h('option', { value: '' }, '—'), ...GRADES.map((x) => h('option', { value: x, selected: x === grade }, x)));
  const s = h('select', { class: 'select', 'aria-label': 'Oddział' }, h('option', { value: '' }, '—'), ...CLASS_SECTIONS.map((x) => h('option', { value: x, selected: x === section }, x)));
  return { el: h('div', { class: 'field' }, label ? h('span', { class: 'field__label' }, label) : null, h('div', { class: 'class-pick' }, g, s)), grade: () => g.value, section: () => s.value };
}

const SECTIONS = [
  { slug: 'przeglad', label: 'Przegląd', icon: 'overview' },
  { slug: 'rejestr', label: 'Rejestr uczniów', icon: 'registry' },
  { slug: 'konta', label: 'Konta', icon: 'users' },
  { slug: 'nauczyciele', label: 'Nauczyciele', icon: 'teacher' },
  { slug: 'przedmioty', label: 'Przedmioty', icon: 'subjects' },
  { slug: 'lekcje', label: 'Lekcje', icon: 'lesson' },
  { slug: 'testy', label: 'Testy i sprawdziany', icon: 'exam' },
  { slug: 'gry', label: 'Gry', icon: 'game' },
  { slug: 'dzienne', label: 'Dzienne pytania', icon: 'flame' },
  { slug: 'pochwaly', label: 'Pochwały', icon: 'medal' },
  { slug: 'punkty', label: 'Punkty', icon: 'gift' },
  { slug: 'sklep', label: 'Sklep', icon: 'bag' },
  { slug: 'materialy', label: 'Materiały', icon: 'materials' },
  { slug: 'zgloszenia', label: 'Zgłoszenia', icon: 'inbox' },
  { slug: 'ustawienia', label: 'Ustawienia', icon: 'settings' },
];

const REG_STATUS = {
  added: ['Dodany do listy', 'plain'],
  registration_started: ['Rozpoczął rejestrację', 'info'],
  email_verified: ['Rozpoczął rejestrację', 'info'],
  pending_approval: ['Konto czeka na zatwierdzenie', 'wait'],
  active: ['Konto aktywne', 'ok'],
  blocked: ['Konto zablokowane', 'bad'],
};
const ACC_STATUS = { active: ['Aktywne', 'ok'], pending: ['Oczekuje', 'wait'], blocked: ['Zablokowane', 'bad'] };
const CLAIM_STATUS = { pending: ['Oczekuje na weryfikację', 'wait'], needs_info: ['Potrzebna dodatkowa weryfikacja', 'info'], resolved: ['Rozwiązane', 'ok'], rejected: ['Odrzucone', 'plain'] };
const ACCENT_LABEL = { copper: 'Błękit miedziany', chlorophyll: 'Zieleń chlorofilu', amber: 'Bursztyn', violet: 'Fiolet', rose: 'Róż', sky: 'Błękit nieba', teal: 'Morski', coral: 'Koralowy' };
const MOTIF_LABEL = { hex: 'Pierścienie (chemia)', leaf: 'Liść (biologia, przyroda)', orbit: 'Orbity (fizyka)', grid: 'Siatka (matematyka)', book: 'Książka (polski)', speech: 'Dymki (języki obce)', column: 'Kolumny (historia, WOS)', globe: 'Globus (geografia)', code: 'Kod (informatyka)', gear: 'Koło zębate (technika)', notes: 'Nuty (muzyka)', palette: 'Paleta (plastyka)', shield: 'Tarcza (EDB)', heart: 'Serce (edukacja zdrowotna)', compass: 'Kompas (doradztwo)', none: 'Bez motywu' };

const badge = ([label, kind]) => h('span', { class: `badge badge--${kind}` }, label);
const errBox = () => h('div', { 'aria-live': 'assertive' });
const fullName = (x) => `${x.firstName} ${x.lastName}`;

/** Potwierdzenie operacji wrażliwej kodem administratora (weryfikowanym na serwerze). */
function confirmWithCode({ title, text, confirmName, danger = false, label, run }) {
  const len = state.status?.pinLength || 4;
  const pin = pinInput({ length: len, label: 'Kod administratora' });
  const nameInput = confirmName ? input({ autocomplete: 'off', spellcheck: false }) : null;
  const err = errBox();
  dialog({
    iconName: danger ? 'warn' : 'shield', title,
    body: [h('p', {}, text),
      nameInput ? field({ label: `Aby potwierdzić, wpisz: ${confirmName}`, input: nameInput }) : null,
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Kod administratora'), pin.el), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label, kind: danger ? 'danger' : 'primary', onClick: async () => {
        if (nameInput && nameInput.value.trim() !== confirmName) { err.replaceChildren(notice('error', 'Wpisane imię i nazwisko nie zgadza się.')); return false; }
        try { await run(pin.value(), nameInput?.value.trim()); }
        catch (e) { pin.error(); pin.clear(); err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
}

function showSecret({ title, intro, secret, outro }) {
  dialog({
    iconName: 'key', title, dismissible: false,
    body: [h('p', {}, intro), h('div', { class: 'secret-box', tabindex: '0' }, secret), h('p', { class: 'small' }, outro)],
    actions: [{ label: g('Zapisałem kod – zamknij', 'Zapisałam kod – zamknij'), kind: 'primary' }],
  });
}

/* ========================================================================== */

export async function adminView({ params }) {
  const u = state.user.role === 'admin' ? await refreshSession() : state.user;
  if (u.role !== 'admin') {
    if (!state.adminGate) { navigate('/', { replace: true }); return null; }
    return gate();
  }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Administracja' }]);
  if (u.mustChangeCode) {
    return h('div', { class: 'wrap wrap--narrow' }, h('div', { class: 'sheet' }, h('h1', {}, 'Ustaw kod administratora'),
      h('p', { class: 'sheet__lead' }, 'Przed pierwszym użyciem panelu ustaw własny kod administratora.'),
      h('div', { style: { marginTop: '24px' } }, changePinForm({ onDone: () => navigate('/administracja', { replace: true }) }))));
  }
  return panel(params[0]);
}

function gate() {
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Autoryzacja' }]);
  const len = state.status?.pinLength || 4;
  const err = errBox();
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Wejdź do panelu');
  const pin = pinInput({ length: len, label: 'Kod administratora', onComplete: () => form.requestSubmit() });
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Kod administratora'), pin.el), err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(submit, async () => {
      try {
        const r = await post('/api/auth/admin/login', { code: pin.value() });
        state.user = r.user;
        navigate('/administracja/przeglad', { replace: true });
      } catch (ex) { pin.error(); pin.clear(); err.replaceChildren(notice('error', ex.message)); }
    });
  });
  setTimeout(() => pin.focus(), 80);
  return h('div', { class: 'wrap wrap--narrow' },
    h('button', { class: 'back', type: 'button', onClick: () => navigate('/') }, icon('arrowLeft'), 'Ekran główny'),
    h('div', { class: 'sheet' }, icon('shield', 'dialog__icon'), h('h1', {}, 'Panel administratora'),
      h('p', { class: 'sheet__lead' }, 'Wpisz kod administratora. Kod jest sprawdzany przez serwer, a liczba prób jest ograniczona.'), form));
}

function panel(initial) {
  let section = SECTIONS.find((s) => s.slug === initial) || SECTIONS[0];
  const main = h('div', { class: 'admin__main', id: 'admin-main' });
  const navBtns = SECTIONS.map((s) => {
    const b = h('button', { type: 'button', 'aria-current': s === section ? 'page' : null }, icon(s.icon), h('span', {}, s.label));
    b.addEventListener('click', () => go(s));
    return b;
  });
  const counter = (slug) => { const c = h('span', { class: 'count', hidden: true }); navBtns[SECTIONS.findIndex((x) => x.slug === slug)].append(c); return c; };
  const claimCount = counter('zgloszenia'), accCount = counter('konta'), praiseCount = counter('pochwaly');
  const setCount = (el, n) => { el.hidden = !n; el.textContent = String(n || 0); };

  async function refreshCounts() {
    try {
      const o = await get('/api/admin/overview');
      setCount(claimCount, o.openClaims); setCount(accCount, o.students.pending); setCount(praiseCount, o.pendingPraise);
      return o;
    } catch { return null; }
  }

  async function go(s, { push = true } = {}) {
    section = s;
    navBtns.forEach((b, i) => (SECTIONS[i] === s ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    if (push) history.replaceState({}, '', `/administracja/${s.slug}`);
    setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Administracja', href: '/administracja/przeglad' }, { label: s.label }]);
    main.replaceChildren(h('div', { class: 'loading' }, 'Wczytywanie'));
    try {
      const content = await RENDER[s.slug]({ reload: () => go(section, { push: false }), go: (slug) => go(SECTIONS.find((x) => x.slug === slug)), refreshCounts });
      main.replaceChildren(h('div', { class: 'tabpanel' }, content));
    } catch (e) {
      if (e.status === 401) { state.user = { role: 'guest' }; navigate('/administracja', { replace: true }); return; }
      main.replaceChildren(notice('error', e.message));
    }
    refreshCounts();
  }
  queueMicrotask(() => go(section, { push: false }));
  return h('div', { class: 'admin' },
    h('nav', { class: 'admin__nav', 'aria-label': 'Sekcje panelu administratora' }, h('h2', {}, 'Administracja'), h('ul', {}, ...navBtns.map((b) => h('li', {}, b)))),
    main);
}

const head = (title, lead, ...right) => h('header', { class: 'admin__head' }, h('div', {}, h('h1', {}, title), lead ? h('p', {}, lead) : null), right.length ? h('div', { class: 'actions' }, ...right) : null);

function searchFilter(table, placeholder) {
  const q = input({ type: 'search', class: 'input search', placeholder, 'aria-label': placeholder });
  q.addEventListener('input', () => {
    const v = q.value.trim().toLocaleLowerCase('pl-PL');
    table.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = v && !tr.textContent.toLocaleLowerCase('pl-PL').includes(v); });
  });
  return q;
}

/* ========================================================================== */
const RENDER = {
  /* ---------- Przegląd ---------- */
  async przeglad({ go }) {
    const o = await get('/api/admin/overview');
    const photoOk = await new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = state.status.schoolPhoto.url; });
    const stat = (n, label) => h('div', {}, h('b', {}, String(n)), h('span', {}, label));
    const checks = [];
    if (o.initialCodes.length) checks.push(notice('warn', h('strong', {}, 'Kody początkowe są nadal w użyciu: '), o.initialCodes.map((x) => (x.role === 'admin' ? 'administrator' : `${x.firstName} ${x.lastName}`)).join(', '), '. Zmień je przed użyciem w szkole.'));
    if (!photoOk) checks.push(notice('info', h('strong', {}, 'Brak zdjęcia szkoły. '), 'Umieść plik public/assets/szkola.jpg na serwerze – pojawi się w tle bez zmian w kodzie.'));
    if (!o.production) checks.push(notice('info', 'Serwer działa w trybie deweloperskim (EDUKRO_ENV=development).'));
    return h('div', {},
      head('Przegląd', 'Stan EDUKRO i rzeczy wymagające uwagi.'),
      h('div', { class: 'overview' },
        stat(o.registry, 'Uczniów w rejestrze'), stat(o.students.active, 'Aktywnych kont uczniów'),
        stat(o.students.pending, 'Kont do zatwierdzenia'), stat(o.openClaims, 'Otwartych zgłoszeń'),
        stat(o.teachers, 'Nauczycieli'), stat(o.lessons, 'Lekcji'), stat(o.tests ?? 0, 'Testów i sprawdzianów'),
        stat(o.pendingPraise, 'Próśb o pochwałę')),
      o.students.pending ? h('div', { style: { marginBottom: '14px' } }, notice('warn', h('strong', {}, `Nowe konta uczniów czekają na zatwierdzenie: ${o.students.pending}. `), 'Uczniowie mogą już się uczyć i zbierać punkty, ale nie wydadzą ich, dopóki nie zatwierdzisz konta. Odrzucenie usuwa konto razem z punktami zdobytymi na nim.')) : null,
      h('div', { class: 'actions', style: { marginBottom: '20px' } },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('/administracja/lekcja/nowa') }, icon('plus'), 'Stwórz lekcję'),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('/administracja/test/nowy') }, icon('plus'), 'Stwórz test lub sprawdzian'),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => grantDialog() }, icon('gift'), 'Przyznaj punkty'),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => go('sklep') }, icon('tag'), 'Ceny i promocje'),
        h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => openTutorialMenu() }, icon('play'), 'Samouczki')),
      o.students.pending || o.openClaims || o.pendingPraise ? h('div', { class: 'actions', style: { marginBottom: '24px' } },
        o.students.pending ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => go('konta') }, 'Zatwierdź albo odrzuć konta') : null,
        o.pendingPraise ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => go('pochwaly') }, 'Prośby o pochwałę') : null,
        o.openClaims ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => go('zgloszenia') }, 'Przejrzyj zgłoszenia') : null) : null,
      h('h2', { class: 'section-title' }, 'Konfiguracja'),
      checks.length ? h('div', { style: { display: 'grid', gap: '10px' } }, ...checks) : notice('ok', 'Konfiguracja serwera nie wymaga uwagi.'));
  },

  /* ---------- Rejestr uczniów ---------- */
  async rejestr({ reload }) {
    const { registry } = await get('/api/admin/registry');
    const first = input({ maxlength: 60, autocomplete: 'off' });
    const last = input({ maxlength: 80, autocomplete: 'off' });
    const cls = classSelects('Klasa i oddział');
    const err = errBox();
    const add = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Dodaj do rejestru');
    const form = h('form', { class: 'inline-form', novalidate: true },
      field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last }),
      cls.el, add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(add, async () => {
        try {
          const r = await post('/api/admin/registry', { firstName: first.value, lastName: last.value, grade: cls.grade(), section: cls.section() });
          toast(`Dodano: ${fullName(r.entry)}.`); reload();
        } catch (ex) { err.replaceChildren(notice('error', ex.message)); }
      });
    });
    const table = h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Imię i nazwisko', 'Klasa', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...registry.map((r) => h('tr', { dataset: { cls: (() => { const c = parseClass(r.classLabel); return c ? `${c.grade}${c.section}` : ''; })() } },
        h('td', {}, fullName(r)),
        h('td', { 'data-label': 'Klasa' }, r.classLabel || h('span', { class: 'muted' }, '—')),
        h('td', { 'data-label': 'Status' }, badge(REG_STATUS[r.status] || [r.status, 'plain'])),
        h('td', {}, h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => editRegistry(r, reload) }, 'Edytuj'),
          h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => removeRegistry(r, reload) }, 'Usuń')))))));
    const classes = [...new Set(registry.map((r) => { const c = parseClass(r.classLabel); return c ? `${c.grade}${c.section}` : null; }).filter(Boolean))].sort();
    const clsFilter = h('select', { class: 'select', 'aria-label': 'Filtruj klasę' }, h('option', { value: '' }, 'Wszystkie klasy'), ...classes.map((c) => h('option', { value: c }, `klasa ${c}`)));
    clsFilter.addEventListener('change', () => table.querySelectorAll('tbody tr').forEach((tr) => { tr.classList.toggle('is-filtered', !!clsFilter.value && tr.dataset.cls !== clsFilter.value); }));
    const demo = registry.filter((r) => /^Przykładow[ay]$/.test(r.lastName) && !['active', 'pending_approval', 'blocked'].includes(r.status));
    const demoBox = demo.length ? h('div', { style: { marginBottom: '14px' } }, notice('info',
      h('strong', {}, `Przykładowa klasa: ${demo.length} os. `), 'To wymyśleni uczniowie do wypróbowania koła fortuny i gier na lekcji. Gdy dodasz prawdziwych uczniów, możesz ich usunąć. ',
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { marginLeft: '6px' }, onClick: (e) => withBusy(e.currentTarget, async () => {
        try { const r = await post('/api/admin/registry/remove-demo'); toast(`Usunięto przykładowych uczniów: ${r.removed}.`); reload(); } catch (ex) { toast(ex.message, 'error'); }
      }) }, 'Usuń przykładowych uczniów'))) : null;
    const bulkBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-help': 'Szybkie dodawanie: wybierz klasę, wklej listę uczniów (imię i nazwisko w każdej linii), kliknij „Zamień” – sprawdzisz tabelę i przeniesiesz wszystkich do rejestru naraz.', onClick: () => bulkRegistry(registry, reload) }, icon('users'), 'Szybkie dodawanie całej klasy');
    return h('div', {},
      head('Rejestr uczniów', 'Tylko osoby z tej listy mogą założyć konto. Klasa i oddział są ważne: z nich lekcje losują uczniów do koła fortuny i gier (także tych bez konta – punkty poczekają na nich).'),
      demoBox, h('div', { class: 'actions', style: { marginBottom: '12px' } }, bulkBtn), form, err,
      registry.length ? h('div', {}, h('div', { class: 'toolbar' }, searchFilter(table, 'Szukaj w rejestrze'), classes.length ? clsFilter : null, h('span', { class: 'muted small' }, `${registry.length} os.`)), h('div', { class: 'table-wrap' }, table))
        : h('div', { class: 'empty' }, icon('registry', 'empty__icon'), h('div', {}, h('h3', {}, 'Rejestr jest pusty'), h('p', {}, 'Dodaj pierwszych uczniów formularzem powyżej. Bez tego nikt nie założy konta ucznia.'))));
  },

  /* ---------- Konta ---------- */
  async konta({ reload }) {
    const role = sessionStorage.getItem('edukro-admin-acc-role') === 'teacher' ? 'teacher' : 'student';
    const { accounts } = await get(`/api/admin/accounts?role=${role}`);
    const seg = h('div', { class: 'tabs', role: 'tablist', style: { margin: '0 0 18px' } },
      ...[['student', 'Uczniowie'], ['teacher', 'Nauczyciele']].map(([r, l]) => h('button', {
        class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(r === role),
        onClick: () => { sessionStorage.setItem('edukro-admin-acc-role', r); reload(); },
      }, l)));
    const act = async (path, msg) => { try { await post(path); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); } };
    const rows = accounts.map((a) => {
      const actions = [];
      if (a.status === 'pending') {
        actions.push(h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => act(`/api/admin/accounts/${a.id}/approve`, `Zatwierdzono konto: ${fullName(a)}.`) }, icon('check'), 'Zatwierdź'));
        actions.push(h('button', { class: 'btn btn--danger btn--sm', type: 'button', onClick: () => dialog({
          iconName: 'warn', title: `Odrzucić konto: ${fullName(a)}?`,
          body: [h('p', {}, 'Konto zostanie usunięte razem ze wszystkimi punktami i wynikami zdobytymi na nim. Wpis w rejestrze zostaje – prawdziwy uczeń może założyć konto ponownie.'),
            h('p', { class: 'small' }, 'Punkty przyznane tej osobie na lekcjach (koło fortuny, gry) należą do ucznia z rejestru i poczekają na jego konto.')],
          actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Odrzuć i usuń konto', kind: 'danger', onClick: () => act(`/api/admin/accounts/${a.id}/reject`, `Odrzucono i usunięto konto: ${fullName(a)}.`) }],
        }) }, 'Odrzuć'));
        return h('tr', { class: 'is-pending-row' },
          h('td', {}, h('div', { class: 'acc-name' }, fullName(a), genderToggle(a))),
          h('td', { 'data-label': 'Klasa' }, a.classLabel ? `klasa ${a.classLabel}` : '—'),
          h('td', { 'data-label': 'Status' }, badge(ACC_STATUS[a.status]), h('div', { class: 'small muted' }, `${a.points} pkt · założone ${formatDate(a.createdAt)}`)),
          h('td', { 'data-label': 'Ostatnie logowanie' }, formatDate(a.lastLoginAt)),
          h('td', {}, h('div', { class: 'row-actions' }, ...actions)));
      }
      if (a.status === 'blocked') actions.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => act(`/api/admin/accounts/${a.id}/unblock`, `Odblokowano: ${fullName(a)}.`) }, 'Odblokuj'));
      else actions.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => dialog({ iconName: 'lock', title: `Zablokować konto: ${fullName(a)}?`, body: h('p', {}, 'Osoba zostanie natychmiast wylogowana i nie zaloguje się, dopóki nie odblokujesz konta. Dane i wyniki zostaną zachowane.'), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Zablokuj', kind: 'danger', onClick: () => act(`/api/admin/accounts/${a.id}/block`, `Zablokowano: ${fullName(a)}.`) }] }) }, 'Zablokuj'));
      if (role === 'student' && a.status === 'active') actions.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => grantDialog({ preselect: [a.id], onDone: reload }), 'data-help': 'Przyznaj temu uczniowi punkty – trafią do jego skrzynki.' }, icon('gift'), 'Punkty'));
      actions.push(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => resetAccess(a, reload) }, 'Reset dostępu'));
      actions.push(h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => deleteAccount(a, reload) }, 'Usuń'));
      return h('tr', {},
        h('td', {}, h('div', { class: 'acc-name' }, fullName(a), genderToggle(a)), role === 'teacher' && a.subjects ? h('div', { class: 'chips', style: { marginTop: '4px' } }, ...a.subjects.map((s) => h('span', { class: 'chip' }, s.name))) : null),
        role === 'student' ? h('td', { 'data-label': 'Klasa' }, a.classLabel ? `klasa ${a.classLabel}` : '—') : null,
        h('td', { 'data-label': 'Status' }, badge(ACC_STATUS[a.status]), a.mustChangeCode ? h('div', { class: 'small muted' }, 'kod tymczasowy') : null, role === 'student' ? h('div', { class: 'small muted' }, `${a.points} pkt`) : null,
          role === 'teacher' && a.homeroomClass ? h('div', { class: 'small muted' }, `${a.gender === 'f' ? 'wychowawczyni' : 'wychowawca'} ${a.homeroomClass}`) : null),
        h('td', { 'data-label': 'Ostatnie logowanie' }, formatDate(a.lastLoginAt)),
        h('td', {}, h('div', { class: 'row-actions' }, ...actions)));
    });
    const table = h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...[role === 'student' ? 'Uczeń' : 'Nauczyciel', role === 'student' ? 'Klasa' : null, 'Status', 'Ostatnie logowanie', ''].filter((x) => x !== null).map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows));
    return h('div', {},
      head('Konta', 'Nowe konta uczniów czekają tu na zatwierdzenie (na górze listy). Uczeń może się od razu uczyć, ale punkty wyda dopiero po zatwierdzeniu. Odrzucenie usuwa konto i punkty zdobyte na nim. Kodów kont nie można odczytać – można jedynie wydać jednorazowy kod resetu.'),
      seg,
      accounts.length ? h('div', {}, h('div', { class: 'toolbar' }, searchFilter(table, 'Szukaj konta')), h('div', { class: 'table-wrap' }, table))
        : h('div', { class: 'empty' }, icon('users', 'empty__icon'), h('div', {}, h('h3', {}, role === 'student' ? 'Nie ma jeszcze kont uczniów' : 'Nie ma kont nauczycieli'),
          h('p', {}, role === 'student' ? 'Konta pojawią się, gdy uczniowie z rejestru przejdą rejestrację.' : 'Dodaj nauczyciela w sekcji Nauczyciele.'))));
  },

  /* ---------- Nauczyciele ---------- */
  async nauczyciele({ reload }) {
    const [{ accounts }, { subjects }] = await Promise.all([get('/api/admin/accounts?role=teacher'), get('/api/admin/subjects')]);
    const first = input({ maxlength: 60, autocomplete: 'off' });
    const last = input({ maxlength: 80, autocomplete: 'off' });
    const greet = input({ maxlength: 60, autocomplete: 'off', placeholder: 'np. Joanno' });
    const hr = classSelects('Wychowawca klasy (opcjonalnie)');
    const checks = subjects.map((s) => h('input', { type: 'checkbox', value: String(s.id) }));
    const err = errBox();
    const add = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Dodaj nauczyciela');
    const form = h('form', { class: 'inline-form', novalidate: true },
      field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last }),
      field({ label: 'Powitanie (wołacz)', input: greet, hint: 'Pojawi się jako „Witaj, …!”' }),
      hr.el,
      h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: 0 } }, h('legend', { class: 'field__label' }, 'Czego uczy (zaznacz przedmioty)'),
        h('div', { class: 'checks checks--subjects' }, ...subjects.map((s, i) => h('label', { class: 'check-row' }, checks[i], s.name)))),
      add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(add, async () => {
        try {
          const r = await post('/api/admin/teachers', { firstName: first.value, lastName: last.value, greetingName: greet.value, homeroomGrade: hr.grade(), homeroomSection: hr.section(), subjectIds: checks.filter((c) => c.checked).map((c) => +c.value) });
          showSecret({ title: 'Konto nauczyciela utworzone', intro: `Przekaż ten kod tymczasowy osobie: ${fullName(r.teacher)}. Przy pierwszym logowaniu EDUKRO poprosi o ustawienie własnego kodu.`, secret: r.temporaryCode, outro: 'Kod jest pokazywany tylko raz. Nie zapisuj go w miejscach dostępnych dla uczniów.' });
          reload();
        } catch (ex) { err.replaceChildren(notice('error', ex.message)); }
      });
    });
    const table = h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Nauczyciel', 'Powitanie', 'Przedmioty', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...accounts.map((t) => h('tr', {},
        h('td', {}, h('div', { class: 'acc-name' }, fullName(t), genderToggle(t)), t.homeroomClass ? h('div', { class: 'small muted' }, `${t.gender === 'f' ? 'wychowawczyni' : 'wychowawca'} klasy ${t.homeroomClass}`) : null),
        h('td', { 'data-label': 'Powitanie' }, `Witaj, ${t.greetingName || t.firstName}!`),
        h('td', { 'data-label': 'Przedmioty' }, t.subjects.length ? h('div', { class: 'chips' }, ...t.subjects.map((s) => h('span', { class: 'chip' }, s.name))) : h('span', { class: 'muted' }, 'brak')),
        h('td', { 'data-label': 'Status' }, badge(ACC_STATUS[t.status])),
        h('td', {}, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => editTeacher(t, subjects, reload) }, 'Edytuj')))))));
    return h('div', {},
      head('Nauczyciele', 'Każdy nauczyciel ma własne konto i widzi wyłącznie wyniki z przypisanych mu przedmiotów. Blokowanie, reset i usuwanie kont znajdziesz w sekcji Konta.'),
      form, err, h('div', { class: 'table-wrap' }, table));
  },

  /* ---------- Przedmioty ---------- */
  async przedmioty({ reload }) {
    const [{ subjects, accents, motifs }, { accounts: teachers }] = await Promise.all([get('/api/admin/subjects'), get('/api/admin/accounts?role=teacher')]);
    const name = input({ maxlength: 60, autocomplete: 'off' });
    const desc = input({ maxlength: 200, autocomplete: 'off' });
    const acc = h('select', { class: 'select' }, ...accents.map((a) => h('option', { value: a }, ACCENT_LABEL[a] || a)));
    const mot = h('select', { class: 'select' }, ...motifs.map((m) => h('option', { value: m }, MOTIF_LABEL[m] || m)));
    const visible = h('input', { type: 'checkbox' });
    const err = errBox();
    const add = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Dodaj przedmiot');
    const form = h('form', { class: 'inline-form', novalidate: true },
      field({ label: 'Nazwa', input: name }), field({ label: 'Krótki opis', input: desc }),
      field({ label: 'Kolor akcentu', input: acc }), field({ label: 'Motyw graficzny', input: mot }),
      h('label', { class: 'check-row' }, visible, 'Widoczny dla uczniów od razu'), add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(add, async () => {
        try { const r = await post('/api/admin/subjects', { name: name.value, description: desc.value, accent: acc.value, motif: mot.value, isAvailable: visible.checked }); toast(`Dodano przedmiot: ${r.subject.name}.`); reload(); }
        catch (ex) { err.replaceChildren(notice('error', ex.message)); }
      });
    });
    const toggle = async (s) => { try { await patch(`/api/admin/subjects/${s.id}`, { isAvailable: !s.isAvailable }); toast(s.isAvailable ? `Ukryto: ${s.name}.` : `Udostępniono: ${s.name}.`); reload(); } catch (e) { toast(e.message, 'error'); } };
    const table = h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Przedmiot', 'Nauczyciele', 'Widoczność', 'Materiały', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...subjects.map((s) => h('tr', { class: `acc-${s.accent}` },
        h('td', {}, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px' } }, h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: 'var(--acc)' } }), s.name), h('div', { class: 'small muted' }, s.description)),
        h('td', { 'data-label': 'Nauczyciele' }, s.teachers.length ? h('div', { class: 'chips' }, ...s.teachers.map((t) => h('span', { class: 'chip' }, fullName(t)))) : h('span', { class: 'muted' }, 'brak')),
        h('td', { 'data-label': 'Widoczność' }, s.isAvailable ? badge(['Widoczny', 'ok']) : badge(['Ukryty', 'plain'])),
        h('td', { 'data-label': 'Materiały', class: 'num' }, String(s.activities)),
        h('td', {}, h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => editSubject(s, teachers, accents, motifs, reload) }, 'Edytuj'),
          h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => toggle(s) }, s.isAvailable ? 'Ukryj' : 'Udostępnij')))))));
    return h('div', {},
      head('Przedmioty', 'Przypisania nauczycieli są zapisywane w bazie – po dodaniu przedmiotu i nauczyciela wszystko działa bez zmian w kodzie.'),
      form, err, h('div', { class: 'table-wrap' }, table));
  },

  /* ---------- Lekcje, testy, pochwały ---------- */
  async lekcje() {
    return lessonsSection({ base: '/administracja', admin: true });
  },
  async dzienne() { return dailySection({ base: '/administracja' }); },

  async testy() {
    return testsSection({ base: '/administracja', admin: true });
  },
  async gry() { return gamesSection({ base: '/administracja', admin: true }); },
  async pochwaly({ reload, refreshCounts }) {
    return praiseSection({ admin: true, reload: () => { reload(); refreshCounts(); } });
  },
  async punkty({ reload }) {
    return grantsSection({ admin: true, reload });
  },
  async sklep({ reload }) {
    return shopAdminSection({ reload });
  },

  /* ---------- Materiały ---------- */
  async materialy() {
    const { subjects } = await get('/api/admin/materials');
    return h('div', {},
      head('Materiały', 'Stan materiałów we wszystkich przedmiotach. Lekcje tworzysz w sekcji „Lekcje”, testy i sprawdziany – w „Testy i sprawdziany”. Gry klasowe są częścią lekcji.'),
      ...subjects.map((s) => h('section', { class: `block acc-${s.accent}` },
        h('h2', {}, s.name),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Rodzaj'), h('th', { class: 'num' }, 'Opublikowane'), h('th', { class: 'num' }, 'W przygotowaniu'), h('th', { class: 'num' }, 'Zarchiwizowane'))),
          h('tbody', {}, ...CATEGORIES.map((c) => h('tr', {}, h('td', {}, c.label),
            h('td', { class: 'num' }, String(s.counts[c.kind].published)), h('td', { class: 'num' }, String(s.counts[c.kind].draft)), h('td', { class: 'num' }, String(s.counts[c.kind].archived))))))))));
  },

  /* ---------- Zgłoszenia ---------- */
  async zgloszenia({ reload, refreshCounts }) {
    const { claims } = await get('/api/admin/claims');
    const KIND = { name_taken: 'Zajęte imię i nazwisko', registration: 'Rejestracja', access: 'Dostęp do konta' };
    const table = h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Zgłoszenie', 'Kontakt', 'Status', 'Data', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, ...claims.map((c) => h('tr', {},
        h('td', {}, fullName(c), h('div', { class: 'small muted' }, KIND[c.kind])),
        h('td', { 'data-label': 'Kontakt' }, c.contactEmail),
        h('td', { 'data-label': 'Status' }, badge(CLAIM_STATUS[c.status])),
        h('td', { 'data-label': 'Data' }, formatDate(c.createdAt)),
        h('td', {}, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => openClaim(c.id, () => { reload(); refreshCounts(); }) }, 'Otwórz')))))));
    return h('div', {},
      head('Zgłoszenia', 'Zgłoszenia uczniów, którzy nie mogą założyć konta lub uzyskać dostępu. Samo zgłoszenie nigdy nie daje dostępu do konta.'),
      claims.length ? h('div', { class: 'table-wrap' }, table)
        : h('div', { class: 'empty' }, icon('inbox', 'empty__icon'), h('div', {}, h('h3', {}, 'Brak zgłoszeń'), h('p', {}, 'Gdy uczeń zgłosi, że jego imię i nazwisko jest zajęte, zgłoszenie pojawi się tutaj.'))));
  },

  /* ---------- Ustawienia ---------- */
  async ustawienia() {
    const o = await get('/api/admin/overview');
    return h('div', {},
      head('Ustawienia', null),
      h('div', { class: 'profile-grid' },
        h('section', {}, h('h2', { class: 'section-title' }, 'Kod administratora'),
          h('p', { class: 'section-lead' }, 'Po zmianie kodu inne sesje administratora zostaną wylogowane.'),
          changePinForm()),
        h('section', {}, h('h2', { class: 'section-title' }, 'Konfiguracja serwera'),
          h('p', { class: 'section-lead' }, 'Te ustawienia zmienia się w pliku .env na serwerze (opis w README).'),
          h('dl', { class: 'facts' },
            h('div', {}, h('dt', {}, 'Konta uczniów'), h('dd', {}, 'Uczeń z rejestru zakłada konto sam (imię, nazwisko, kod PIN) – każde nowe konto zatwierdzasz w sekcji Konta')),
            h('div', {}, h('dt', {}, 'Kody PIN'), h('dd', {}, `${state.status.pinLength} cyfry dla uczniów, nauczycieli i administratora (PIN_LENGTH)`)),
            h('div', {}, h('dt', {}, 'Tryb'), h('dd', {}, o.production ? 'Produkcyjny' : 'Deweloperski')),
            h('div', {}, h('dt', {}, 'Wejście do panelu'), h('dd', {}, 'Sekwencję zmienisz w pliku public/js/config.js (ADMIN_GESTURE).'))))));
  },
};

/* ---------- Okna edycji ---------- */
/** Szybkie dodawanie: klasa → wklejona lista („Jan Kowalski” w linii) → „Zamień” (tabela do poprawek) → „Przenieś do rejestru”. */
export function splitName(line) {
  const parts = String(line).replace(/[\t;]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // ostatni wyraz = nazwisko (nazwiska dwuczłonowe pisze się z łącznikiem), reszta = imię (imiona)
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
export function parseNameList(text) {
  return String(text).split(/[\n\r,]+/).map((x) => x.replace(/^\s*\d+[.)]\s*/, '')).map(splitName).filter(Boolean);
}
function bulkRegistry(registry, reload) {
  const cls = classSelects('Klasa i oddział');
  const paste = h('textarea', { class: 'textarea bulk__paste', placeholder: 'Jan Kowalski\nAnna Maria Nowak\nPiotr Wiśniewski-Zając\n…', 'aria-label': 'Lista uczniów' });
  const area = h('div', {});
  const err = errBox();
  const known = new Set(registry.map((r) => `${r.firstName} ${r.lastName}`.toLocaleLowerCase('pl-PL')));
  let rows = [];
  const tableView = () => {
    const tbody = h('tbody', {});
    const sum = h('div', { class: 'bulk__sum' });
    // przerysowanie po zmianie pola – po zdarzeniu (usunięcie pola z fokusem wywołuje kolejne „change”)
    let pending = false;
    const redraw = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; if (tbody.isConnected) draw(); }, 0); };
    const draw = () => {
      tbody.replaceChildren(...rows.map((r, i) => {
        const dup = known.has(`${r.firstName} ${r.lastName}`.trim().toLocaleLowerCase('pl-PL'));
        const f = input({ value: r.firstName, maxlength: 60, 'aria-label': `Imię, wiersz ${i + 1}` });
        const l = input({ value: r.lastName, maxlength: 80, 'aria-label': `Nazwisko, wiersz ${i + 1}` });
        f.addEventListener('input', () => { r.firstName = f.value; });
        l.addEventListener('input', () => { r.lastName = l.value; });
        f.addEventListener('change', redraw); l.addEventListener('change', redraw);
        return h('tr', { class: dup ? 'is-dup' : null }, h('td', { class: 'num muted' }, String(i + 1)), h('td', {}, f), h('td', {}, l),
          h('td', {}, dup ? h('span', { class: 'badge badge--wait' }, 'już w rejestrze') : !r.firstName.trim() || !r.lastName.trim() ? h('span', { class: 'badge badge--bad' }, 'uzupełnij') : null),
          h('td', {}, h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': `Usuń wiersz ${i + 1}`, onClick: () => { rows.splice(i, 1); draw(); } }, icon('trash'))));
      }));
      const missing = rows.filter((r) => !r.firstName.trim() || !r.lastName.trim()).length;
      sum.replaceChildren(h('span', {}, `Osób: ${rows.length}`), missing ? h('span', { class: 'badge badge--bad' }, `bez nazwiska lub imienia: ${missing}`) : null,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { rows.push({ firstName: '', lastName: '' }); draw(); } }, icon('plus'), 'Dodaj wiersz'));
    };
    draw();
    return h('div', {}, h('p', { class: 'muted small' }, 'Sprawdź, czy imiona i nazwiska są dobrze rozdzielone – możesz je tu poprawić. Osoby, które już są w rejestrze, zostaną pominięte.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table bulk-table' }, h('thead', {}, h('tr', {}, ...['#', 'Imię', 'Nazwisko', '', ''].map((x) => h('th', {}, x)))), tbody)), sum);
  };
  let mode = 'paste';
  const render = () => { area.replaceChildren(mode === 'paste' ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Lista uczniów – każda osoba w osobnej linii (albo po przecinku); spacja oddziela imię od nazwiska'), paste) : tableView()); };
  render();
  const d = dialog({
    iconName: 'users', title: 'Szybkie dodawanie uczniów',
    body: [cls.el, area, err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Zamień', kind: 'ghost', onClick: (close, btn) => {
      err.replaceChildren();
      if (mode === 'paste') {
        rows = parseNameList(paste.value);
        if (!rows.length) { err.replaceChildren(notice('error', 'Wklej listę uczniów.')); return false; }
        mode = 'table'; btn.textContent = 'Wróć do listy';
      } else {
        paste.value = rows.map((r) => `${r.firstName} ${r.lastName}`.trim()).join('\n');
        mode = 'paste'; btn.textContent = 'Zamień';
      }
      render();
      return false;
    } }, { label: 'Przenieś do rejestru', kind: 'primary', onClick: async () => {
      err.replaceChildren();
      if (mode === 'paste') rows = parseNameList(paste.value);
      if (!cls.grade() || !cls.section()) { err.replaceChildren(notice('error', 'Wybierz klasę i oddział.')); return false; }
      const people = rows.filter((r) => r.firstName.trim() || r.lastName.trim());
      if (!people.length) { err.replaceChildren(notice('error', 'Lista uczniów jest pusta.')); return false; }
      if (people.some((r) => !r.firstName.trim() || !r.lastName.trim())) { err.replaceChildren(notice('error', 'Każda osoba musi mieć imię i nazwisko – kliknij „Zamień” i popraw tabelę.')); return false; }
      try {
        const r = await post('/api/admin/registry/bulk', { grade: cls.grade(), section: cls.section(), people });
        toast(`Dodano do klasy ${r.classLabel}: ${r.added} ${r.added === 1 ? 'osobę' : 'osób'}${r.skipped.length ? ` (pominięto ${r.skipped.length} – już były w rejestrze)` : ''}.`);
        reload();
      } catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
    } }],
  });
  return d;
}

function editRegistry(r, reload) {
  const first = input({ value: r.firstName, maxlength: 60 });
  const last = input({ value: r.lastName, maxlength: 80 });
  const pc = parseClass(r.classLabel) || {};
  const cls = classSelects('Klasa i oddział', { grade: pc.grade || '', section: pc.section || '' });
  const err = errBox();
  dialog({
    title: `Edytuj wpis: ${fullName(r)}`,
    body: [h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })),
      cls.el,
      r.userId ? notice('info', 'Ta osoba ma konto – zmiana imienia lub nazwiska zmieni też dane logowania.') : null, err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Zapisz zmiany', kind: 'primary', onClick: async () => {
        try { await patch(`/api/admin/registry/${r.id}`, { firstName: first.value, lastName: last.value, grade: cls.grade(), section: cls.section() }); toast('Zapisano zmiany w rejestrze.'); reload(); }
        catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
}

function removeRegistry(r, reload) {
  if (r.userId) {
    return dialog({ iconName: 'info', title: 'Najpierw usuń konto', body: h('p', {}, `${fullName(r)} ma konto w EDUKRO. Aby usunąć osobę z rejestru, najpierw usuń jej konto w sekcji Konta.`), actions: [{ label: 'Rozumiem', kind: 'primary' }] });
  }
  dialog({
    iconName: 'warn', title: `Usunąć z rejestru: ${fullName(r)}?`,
    body: h('p', {}, 'Ta osoba nie będzie mogła założyć konta, dopóki nie dodasz jej ponownie.'),
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Usuń z rejestru', kind: 'danger', onClick: async () => {
        try { await del(`/api/admin/registry/${r.id}`); toast('Usunięto wpis z rejestru.'); reload(); } catch (e) { toast(e.message, 'error'); }
      },
    }],
  });
}

function resetAccess(a, reload) {
  const isStudent = a.role === 'student';
  confirmWithCode({
    title: `Reset dostępu: ${fullName(a)}`,
    text: isStudent
      ? 'Uczeń otrzyma jednorazowy kod resetu (ważny 72 godziny), którym ustawi nowy kod dostępu. Obecne sesje zostaną wylogowane. Dotychczasowego kodu nie da się odczytać.'
      : 'Nauczyciel otrzyma kod tymczasowy i przy logowaniu będzie musiał ustawić własny. Obecne sesje zostaną wylogowane.',
    label: 'Wydaj kod',
    run: async (code) => {
      const r = await post(`/api/admin/accounts/${a.id}/reset`, { confirmCode: code });
      setTimeout(() => showSecret(isStudent
        ? { title: 'Kod resetu dostępu', intro: `Przekaż ten kod osobiście: ${fullName(a)}. Uczeń wpisze go na ekranie logowania w opcji „Mam kod resetu od administratora”.`, secret: r.resetCode, outro: `Kod jest jednorazowy i wygasa ${formatDate(r.expiresAt)}. Jest pokazywany tylko teraz.` }
        : { title: 'Kod tymczasowy', intro: `Przekaż ten kod: ${fullName(a)}. Przy logowaniu EDUKRO wymusi ustawienie nowego kodu.`, secret: r.temporaryCode, outro: 'Kod jest pokazywany tylko teraz.' }), 120);
      reload();
    },
  });
}

function deleteAccount(a, reload) {
  confirmWithCode({
    title: `Usunąć konto: ${fullName(a)}?`,
    text: a.role === 'student'
      ? 'Usunięte zostaną: konto, sesje, wyniki i ustawienia udostępniania. Wpis w rejestrze uczniów pozostanie. Tej operacji nie można cofnąć.'
      : 'Usunięte zostaną: konto nauczyciela i jego przypisania do przedmiotów. Materiały pozostaną w przedmiotach. Tej operacji nie można cofnąć.',
    confirmName: fullName(a), danger: true, label: 'Usuń konto na stałe',
    run: async (code, name) => { await del(`/api/admin/accounts/${a.id}`, { confirmCode: code, confirmName: name }); toast(`Usunięto konto: ${fullName(a)}.`); reload(); },
  });
}

function editTeacher(t, subjects, reload) {
  const first = input({ value: t.firstName, maxlength: 60 });
  const last = input({ value: t.lastName, maxlength: 80 });
  const greet = input({ value: t.greetingName || '', maxlength: 60 });
  const ph = parseClass(t.homeroomClass) || {};
  const hr = classSelects('Wychowawca klasy', { grade: ph.grade || '', section: ph.section || '' });
  const mine = new Set(t.subjects.map((s) => s.id));
  const checks = subjects.map((s) => h('input', { type: 'checkbox', value: String(s.id), checked: mine.has(s.id) }));
  const err = errBox();
  dialog({
    title: `Edytuj: ${fullName(t)}`,
    body: [h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })),
      field({ label: 'Powitanie (wołacz)', input: greet, hint: 'Np. Joanno, Marku, Anno.' }),
      hr.el, h('p', { class: 'field__hint', style: { marginTop: '-8px' } }, 'Wychowawca dostaje prośby o pochwałę od uczniów swojej klasy.'),
      h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: 0 } }, h('legend', { class: 'field__label' }, 'Czego uczy (zaznacz przedmioty)'),
        h('div', { class: 'checks checks--subjects' }, ...subjects.map((s, i) => h('label', { class: 'check-row' }, checks[i], s.name)))), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Zapisz zmiany', kind: 'primary', onClick: async () => {
        try { await patch(`/api/admin/teachers/${t.id}`, { firstName: first.value, lastName: last.value, greetingName: greet.value, homeroomGrade: hr.grade(), homeroomSection: hr.section(), subjectIds: checks.filter((c) => c.checked).map((c) => +c.value) }); toast('Zapisano zmiany.'); reload(); }
        catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
}

function editSubject(s, teachers, accents, motifs, reload) {
  const name = input({ value: s.name, maxlength: 60 });
  const desc = input({ value: s.description, maxlength: 200 });
  const acc = h('select', { class: 'select' }, ...accents.map((a) => h('option', { value: a, selected: a === s.accent }, ACCENT_LABEL[a] || a)));
  const mot = h('select', { class: 'select' }, ...motifs.map((m) => h('option', { value: m, selected: m === s.motif }, MOTIF_LABEL[m] || m)));
  const mine = new Set(s.teachers.map((t) => t.id));
  const checks = teachers.map((t) => h('input', { type: 'checkbox', value: String(t.id), checked: mine.has(t.id) }));
  const err = errBox();
  dialog({
    title: `Edytuj przedmiot: ${s.name}`,
    body: [field({ label: 'Nazwa', input: name }), field({ label: 'Krótki opis', input: desc }),
      h('div', { class: 'row-2' }, field({ label: 'Kolor akcentu', input: acc }), field({ label: 'Motyw', input: mot })),
      h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: 0 } }, h('legend', { class: 'field__label' }, 'Nauczyciele przedmiotu'),
        teachers.length ? h('div', { class: 'checks' }, ...teachers.map((t, i) => h('label', { class: 'check-row' }, checks[i], fullName(t)))) : h('p', { class: 'muted small' }, 'Brak kont nauczycieli.')), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Zapisz zmiany', kind: 'primary', onClick: async () => {
        try { await patch(`/api/admin/subjects/${s.id}`, { name: name.value, description: desc.value, accent: acc.value, motif: mot.value, teacherIds: checks.filter((c) => c.checked).map((c) => +c.value) }); toast('Zapisano przedmiot.'); reload(); }
        catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
}

async function openClaim(id, onChange) {
  const d = await get(`/api/admin/claims/${id}`);
  const c = d.claim;
  const status = h('select', { class: 'select' }, ...Object.entries(CLAIM_STATUS).map(([k, [l]]) => h('option', { value: k, selected: k === c.status }, l)));
  const note = h('textarea', { class: 'textarea', maxlength: 1000 }, c.adminNote || '');
  const err = errBox();
    dialog({
    title: `Zgłoszenie: ${fullName(c)}`,
    body: [
      h('dl', { class: 'facts' },
        h('div', {}, h('dt', {}, 'Kontakt'), h('dd', {}, c.contactEmail)),
        h('div', {}, h('dt', {}, 'Wysłano'), h('dd', {}, formatDate(c.createdAt))),
        h('div', {}, h('dt', {}, 'Opis'), h('dd', {}, c.description || h('span', { class: 'muted' }, 'brak opisu'))),
        h('div', {}, h('dt', {}, 'W rejestrze'), h('dd', {}, d.registry ? [`tak${d.registry.classLabel ? `, klasa ${d.registry.classLabel}` : ''} `, badge(REG_STATUS[d.registry.status])] : badge(['brak takiej osoby', 'bad']))),
        d.account ? h('div', {}, h('dt', {}, 'Istniejące konto'), h('dd', {}, `założone ${formatDate(d.account.createdAt)}${d.account.lastLoginAt ? ` · ostatnie logowanie ${formatDate(d.account.lastLoginAt)}` : ''}`)) : null),
      notice('info', 'Jeśli konto założyła inna osoba: zablokuj je lub usuń w sekcji Konta i poproś ucznia (np. przez wychowawcę) o ponowną rejestrację.'),
      field({ label: 'Status', input: status }), field({ label: 'Notatka (widoczna tylko dla administratora)', input: note }), err],
    actions: [{ label: 'Zamknij', kind: 'quiet' }, {
      label: 'Zapisz', kind: 'primary', onClick: async () => {
        try { await patch(`/api/admin/claims/${c.id}`, { status: status.value, adminNote: note.value }); toast('Zapisano zgłoszenie.'); onChange(); }
        catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
}
