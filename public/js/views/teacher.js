// Tryb nauczyciela: logowanie kodem (weryfikacja na serwerze) i panel.
import { h, icon, notice, pinInput, withBusy, formatDate, plural } from '../ui.js';
import { get, post } from '../api.js';
import { navigate, state, setCrumbs, refreshSession } from '../app.js';
import { CATEGORIES } from './student.js';
import { changePinForm, teacherCodeDialog } from './pin.js';
import { testsSection } from './tests-list.js';
import { lessonsSection } from './lessons-list.js';
import { gamesSection } from './games-list.js';
import { praiseSection } from './praise.js';
import { grantsSection } from './grants.js';
import { dailySection } from './daily.js';

/* ---------- Logowanie ---------- */
export async function loginView() {
  if (state.user.role === 'teacher') { navigate('/nauczyciel/panel', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Logowanie nauczyciela' }]);
  const { teachers } = await get('/api/teachers');
  const len = state.status?.pinLength || 4;
  let chosen = teachers.length === 1 ? teachers[0].id : null;
  const err = h('div', { 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Zaloguj się');
  const pin = pinInput({ length: len, label: 'Kod dostępu', onComplete: () => chosen && form.requestSubmit() });

  const list = h('div', { class: 'paths', role: 'radiogroup', 'aria-label': 'Wybierz swoje konto', style: { marginTop: 0 } },
    ...teachers.map((t) => {
      const b = h('button', { type: 'button', class: ['path', t.id === chosen && 'path--primary'], role: 'radio', 'aria-checked': String(t.id === chosen) },
        h('span', { class: 'path__title' }, `${t.firstName} ${t.lastName}`), h('span', { class: 'path__desc' }, 'Konto nauczyciela'),
        icon(t.id === chosen ? 'check' : 'user', 'path__arrow'));
      b.addEventListener('click', () => {
        chosen = t.id;
        list.querySelectorAll('.path').forEach((p) => { const on = p === b; p.classList.toggle('path--primary', on); p.setAttribute('aria-checked', String(on)); p.querySelector('.path__arrow').replaceWith(icon(on ? 'check' : 'user', 'path__arrow')); });
        pin.focus();
      });
      return b;
    }));

  const form = h('form', { class: 'sheet__body', novalidate: true },
    teachers.length ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Konto'), list) : notice('warn', 'Nie ma jeszcze kont nauczycieli. Skontaktuj się z administratorem EDUKRO.'),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, `Kod dostępu (${len} cyfry)`), pin.el),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!chosen) return err.replaceChildren(notice('error', 'Wybierz swoje konto.'));
    if (pin.value().length !== len) return err.replaceChildren(notice('error', `Wpisz ${len} cyfry kodu.`));
    withBusy(submit, async () => {
      try {
        const r = await post('/api/auth/teacher/login', { teacherId: chosen, code: pin.value() });
        state.user = r.user;
        navigate('/nauczyciel/panel');
      } catch (ex) { pin.error(); pin.clear(); err.replaceChildren(notice('error', ex.message)); }
    });
  });
  setTimeout(() => (chosen ? pin.focus() : list.querySelector('.path')?.focus()), 60);
  return h('div', { class: 'wrap wrap--narrow' },
    h('button', { class: 'back', type: 'button', onClick: () => navigate('/') }, icon('arrowLeft'), 'Ekran główny'),
    h('div', { class: 'sheet' }, h('h1', {}, 'Logowanie nauczyciela'),
      h('p', { class: 'sheet__lead' }, 'Wybierz swoje konto i wpisz kod dostępu.'), form));
}

/* ---------- Panel ---------- */
// Zakładki: Przegląd (tu są przyciski „Stwórz…”), Lekcje, testy i gry (w środku przełącznik), Dzienne pytania,
// Wyniki uczniów, Pochwały, Punkty. Ustawienia konta są w menu „Ustawienia”, samouczki pod „?”.
const TABS = [
  { slug: 'przeglad', label: 'Przegląd' },
  { slug: 'materialy', label: 'Lekcje, testy i gry', subs: ['lekcje', 'testy', 'gry'] },
  { slug: 'dzienne', label: 'Dzienne pytania' },
  { slug: 'wyniki', label: 'Wyniki uczniów' },
  { slug: 'pochwaly', label: 'Pochwały' },
  { slug: 'punkty', label: 'Punkty' },
];
const SUBS = [
  { slug: 'lekcje', label: 'Lekcje', icon: 'lesson' },
  { slug: 'testy', label: 'Testy i sprawdziany', icon: 'exam' },
  { slug: 'gry', label: 'Gry', icon: 'game' },
];

export async function dashboardView({ params }) {
  const u = await refreshSession();
  if (u.role !== 'teacher') { navigate('/nauczyciel', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Panel nauczyciela' }]);

  if (u.mustChangeCode) {
    return h('div', { class: 'wrap wrap--narrow' }, h('div', { class: 'sheet' },
      h('h1', {}, 'Ustaw własny kod'),
      h('p', { class: 'sheet__lead' }, 'Logujesz się kodem tymczasowym. Zanim przejdziesz dalej, ustaw własny kod dostępu znany tylko Tobie.'),
      h('div', { style: { marginTop: '24px' } }, changePinForm({ submitLabel: 'Ustaw kod i przejdź dalej', onDone: () => navigate('/nauczyciel/panel', { replace: true }) }))));
  }

  const data = await get('/api/teacher/overview');
  const want = params[0] || 'przeglad';
  // stare adresy: /konto → okno zmiany kodu, /materialy → lekcje
  if (want === 'konto') queueMicrotask(() => teacherCodeDialog());
  let tab = TABS.find((t) => t.slug === want || t.subs?.includes(want)) || TABS[0];
  let sub = SUBS.find((x) => x.slug === want) || SUBS[0];
  const panel = h('div', { class: 'tabpanel', role: 'tabpanel', id: 'tp' });
  const tabBtns = TABS.map((t) => {
    const b = h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(t === tab), 'aria-controls': 'tp', dataset: { slug: t.slug } }, t.label,
      t.slug === 'pochwaly' && data.praisePending ? h('span', { class: 'tab__count' }, String(data.praisePending)) : null);
    b.addEventListener('click', () => select(t));
    return b;
  });

  async function select(t, s = null) {
    tab = t;
    if (s) sub = s;
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i] === t)));
    history.replaceState({}, '', `/nauczyciel/panel/${t.subs ? sub.slug : t.slug}`);
    const content = await ({
      przeglad: overview, materialy, dzienne: () => dailySection({ base: '/nauczyciel' }),
      wyniki: results, pochwaly: () => praiseSection({ reload: () => select(tab) }), punkty: () => grantsSection({ reload: () => select(tab) }),
    })[t.slug]();
    const fresh = h('div', { class: 'tabpanel', role: 'tabpanel', id: 'tp' }, content);
    current.replaceWith(fresh); current = fresh;
  }
  let current = panel;

  /** Lekcje, testy i sprawdziany, gry – jeden przycisk w zakładkach, w środku przełącznik. */
  async function materialy() {
    const seg = h('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Rodzaj materiałów' }, ...SUBS.map((x) => {
      const b = h('button', { class: 'subtab', role: 'tab', type: 'button', 'aria-selected': String(x === sub), dataset: { slug: x.slug } }, icon(x.icon), x.label);
      b.addEventListener('click', () => select(tab, x));
      return b;
    }));
    const body = await ({ lekcje: () => lessonsSection({ base: '/nauczyciel' }), testy: () => testsSection({ base: '/nauczyciel' }), gry: () => gamesSection({ base: '/nauczyciel' }) })[sub.slug]();
    return h('div', {}, seg, body);
  }

  function overview() {
    const create = h('div', { class: 'actions overview-create' },
      h('a', { class: 'btn btn--primary', href: '/nauczyciel/lekcja/nowa', 'data-link': '' }, icon('plus'), 'Stwórz lekcję'),
      h('a', { class: 'btn btn--ghost', href: '/nauczyciel/test/nowy', 'data-link': '' }, icon('plus'), 'Stwórz test lub sprawdzian'),
      h('a', { class: 'btn btn--ghost', href: '/nauczyciel/gra/nowa', 'data-link': '' }, icon('game'), 'Stwórz grę'));
    if (!data.subjects.length) return h('div', {}, create, notice('info', 'Nie masz jeszcze przypisanych przedmiotów. Administrator EDUKRO może je przypisać w swoim panelu.'));
    return h('div', {}, create, h('div', { class: 'ledger' }, ...data.subjects.map((s) => {
      const pub = (k) => s.counts[k].published;
      return h('div', { class: `ledger__row acc-${s.accent}` },
        h('div', {}, h('h3', {}, s.name), h('p', { class: 'muted small', style: { marginTop: '6px' } }, s.isAvailable ? 'Widoczny dla uczniów' : 'Ukryty przed uczniami')),
        h('div', { class: 'ledger__stats' },
          ...CATEGORIES.map((c) => h('button', { class: 'stat stat--link', type: 'button', title: `Przejdź: ${c.label}`, onClick: () => select(TABS[1], SUBS.find((x) => x.slug === (c.kind === 'lesson' ? 'lekcje' : c.kind === 'game' ? 'gry' : 'testy'))) }, h('b', {}, String(pub(c.kind))), h('span', {}, c.label))),
          h('div', { class: 'stat' }, h('b', {}, String(s.studentsSharing)), h('span', {}, 'Uczniowie udostępniający wyniki')),
          h('div', { class: 'stat' }, h('b', {}, String(s.resultsCount)), h('span', {}, 'Udostępnione wyniki'))));
    })));
  }

  async function results() {
    const select = h('select', { class: 'select', 'aria-label': 'Przedmiot' }, h('option', { value: '' }, 'Wszystkie moje przedmioty'),
      ...data.subjects.map((s) => h('option', { value: String(s.id) }, s.name)));
    const box = h('div', {});
    const load = async () => {
      box.replaceChildren(h('div', { class: 'loading' }, 'Wczytywanie wyników'));
      const { results: rows } = await get(`/api/teacher/results${select.value ? `?subjectId=${select.value}` : ''}`);
      const kind = Object.fromEntries(CATEGORIES.map((c) => [c.kind, c.label]));
      box.replaceChildren(rows.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
          h('thead', {}, h('tr', {}, ...['Uczeń', 'Przedmiot', 'Aktywność', 'Wynik', 'Błędy / ocena', 'Data'].map((x) => h('th', {}, x)))),
          h('tbody', {}, ...rows.map((r) => h('tr', {},
            h('td', {}, `${r.firstName} ${r.lastName}`),
            h('td', { 'data-label': 'Przedmiot' }, r.subject),
            h('td', { 'data-label': 'Aktywność' }, r.title, h('div', { class: 'small muted' }, kind[r.kind]),
              r.direct ? h('span', { class: 'badge badge--ok', style: { marginTop: '6px' } }, 'Pierwsze zaliczenie egzaminu') : null),
            h('td', { 'data-label': 'Wynik', class: 'num', title: 'Poprawne za pierwszym razem / wszystkie pytania' }, r.maxScore ? `${r.score} / ${r.maxScore}` : '—'),
            h('td', { 'data-label': 'Błędy / ocena', class: 'num' }, r.grade ? `ocena ${r.grade}` : (r.mistakes ?? '—')),
            h('td', { 'data-label': 'Data' }, formatDate(r.completedAt)))))))
        : h('div', { class: 'empty' }, icon('results', 'empty__icon'), h('div', {}, h('h3', {}, 'Brak udostępnionych wyników'),
          h('p', {}, 'Wyniki pojawią się tutaj, gdy uczniowie zaliczą Twoje testy egzaminacyjne albo udostępnią wyniki z innych aktywności.'))));
    };
    select.addEventListener('change', load);
    await load();
    return h('div', {},
      h('h2', { class: 'section-title' }, 'Wyniki uczniów'),
      h('p', { class: 'section-lead' }, 'Widzisz wyniki z przedmiotów przypisanych do Ciebie: pierwsze zaliczenie każdego egzaminu trafia tu zawsze, a pozostałe wyniki – gdy uczeń zgodził się je udostępnić.'),
      h('div', { class: 'toolbar' }, select), box);
  }

  const root = h('div', { class: 'wrap' },
    h('h1', { class: 'greet' }, `Witaj, ${u.greetingName}!`),
    h('p', { class: 'greet-sub' }, data.subjects.length ? `Twoje przedmioty: ${data.subjects.map((s) => s.name.toLocaleLowerCase('pl-PL')).join(' i ')}.` : 'Panel nauczyciela EDUKRO.'),
    u.initialCode ? h('div', { style: { marginTop: '22px' } }, notice('warn', h('strong', {}, 'Używasz kodu początkowego. '), 'Zmień go, zanim EDUKRO zacznie być używane w szkole (Ustawienia → Ustawienia ogólne). ',
      h('button', { class: 'linkish', type: 'button', onClick: () => teacherCodeDialog() }, 'Zmień kod teraz'))) : null,
    data.praisePending ? h('div', { style: { marginTop: '18px' } }, notice('info', h('strong', {}, `Prośby o pochwałę: ${data.praisePending}. `), 'Uczniowie Twojej klasy czekają na decyzję – zakładka „Pochwały”.')) : null,
    h('div', { class: 'tabs', role: 'tablist', style: { marginTop: '22px' } }, ...tabBtns),
    panel);
  queueMicrotask(() => select(tab));
  return root;
}
