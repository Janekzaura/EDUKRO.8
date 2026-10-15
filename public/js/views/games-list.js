// Zakładka „Gry” (nauczyciel i administrator) oraz ekran tworzenia nowej gry.
import { h, icon, notice, field, input, dialog, toast, withBusy, formatDate, plural } from '../ui.js';
import { get, post, del } from '../api.js';
import { navigate, setCrumbs } from '../app.js';
import { GAME_TYPES, GAME_TYPE } from '../shared/game-rules.js';

function statusBadge(t) {
  if (t.status === 'published') return h('span', { class: 'badge badge--ok' }, 'Opublikowana');
  if (t.errors) return h('span', { class: 'badge badge--wait' }, `Szkic · ${t.errors} ${plural(t.errors, ['rzecz', 'rzeczy', 'rzeczy'])} do uzupełnienia`);
  return h('span', { class: 'badge badge--info' }, 'Szkic – gotowa do publikacji');
}

export async function gamesSection({ base, admin = false }) {
  const { games } = await get('/api/editor/games');
  const create = h('a', { class: 'btn btn--primary', href: `${base}/gra/nowa`, 'data-link': '' }, icon('plus'), 'Stwórz grę');
  const head = h('header', { class: 'admin__head' },
    h('div', {}, admin ? h('h1', {}, 'Gry') : h('h2', { class: 'section-title' }, 'Gry'),
      h('p', { class: admin ? null : 'section-lead', style: { marginBottom: 0 } }, 'Saper – rozbrajanie bomby (jeden błąd = wybuch) i Hammer Game – młotkiem na spryt i szybkość. Pytania wpisujesz Ty, a uczniowie za pierwszą wygraną dostają punkty.')),
    h('div', { class: 'actions' }, create));
  if (!games.length) {
    return h('div', {}, head, h('div', { class: 'empty' }, icon('game', 'empty__icon'),
      h('div', {}, h('h3', {}, 'Nie ma jeszcze żadnych gier'), h('p', {}, 'Kliknij „Stwórz grę”, wybierz Sapera albo Hammer Game i wpisz pytania. Wszystko zapisuje się samo.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: `${base}/gra/nowa`, 'data-link': '' }, icon('plus'), 'Stwórz pierwszą grę')))));
  }
  const bySubject = new Map();
  for (const t of games) { if (!bySubject.has(t.subject)) bySubject.set(t.subject, []); bySubject.get(t.subject).push(t); }
  const row = (t) => {
    const open = () => navigate(`${base}/gra/${t.id}`);
    return h('tr', {},
      h('td', {}, h('button', { class: 'linkish test-title', type: 'button', onClick: open }, t.title),
        h('div', { class: 'small muted' }, h('span', { class: `gm-chip gm-chip--${t.type}` }, icon(t.type === 'saper' ? 'bomb' : 'hammer'), t.typeLabel), ` ${t.summaryLine}${!t.mine && t.author ? ` · autor: ${t.author}` : ''}`)),
      h('td', { 'data-label': 'Stan' }, statusBadge(t)),
      h('td', { 'data-label': 'Rozgrywki', class: 'num' }, t.plays ? `${t.plays} (wygrane: ${t.wins})` : '0'),
      h('td', { 'data-label': 'Zmiana' }, formatDate(t.updatedAt)),
      h('td', {}, h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: open }, icon('edit'), 'Edytuj'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'Zagraj w podglądzie (bez punktów)', onClick: () => navigate(`${base}/gra/${t.id}/podglad`) }, icon('play'), 'Zagraj'),
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', 'aria-label': `Kopia gry ${t.title}`, 'data-help': 'Tworzy kopię gry, którą możesz zmieniać niezależnie od oryginału.', onClick: (e) => withBusy(e.currentTarget, async () => { const r = await post(`/api/editor/games/${t.id}/duplicate`); toast('Utworzono kopię gry.'); navigate(`${base}/gra/${r.id}`); }) }, icon('copy'), 'Kopiuj'),
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', disabled: !t.canDelete, title: t.canDelete ? 'Usuń grę' : `Usunąć może tylko autor (${t.author || 'administrator'}) albo administrator`, 'aria-label': `Usuń grę ${t.title}`,
          onClick: () => dialog({ iconName: 'trash', title: `Usunąć grę „${t.title}”?`, body: h('p', {}, t.plays ? 'Uczniowie już grali – gra zniknie z listy, ale ich punkty zostaną.' : 'Gra zostanie usunięta na stałe.'),
            actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń grę', kind: 'danger', onClick: async () => { await del(`/api/editor/games/${t.id}`); toast('Gra usunięta.'); navigate(location.pathname, { replace: true }); } }] }) }, icon('trash'), 'Usuń'))));
  };
  return h('div', {}, head,
    ...[...bySubject].map(([subject, list]) => h('section', { class: `block acc-${list[0].accent}` },
      h('h2', { class: 'subject-dot' }, subject),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards tests-table games-table' },
        h('thead', {}, h('tr', {}, ...['Gra', 'Stan', 'Rozgrywki', 'Ostatnia zmiana', ''].map((x) => h('th', { class: x === 'Rozgrywki' ? 'num' : null }, x)))),
        h('tbody', {}, ...list.map(row)))))));
}

export async function newGameView({ base }) {
  const area = base === '/administracja' ? 'Administracja' : 'Panel nauczyciela';
  const listHref = base === '/administracja' ? '/administracja/gry' : '/nauczyciel/panel/gry';
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: area, href: listHref }, { label: 'Nowa gra' }]);
  const { subjects } = await get('/api/editor/subjects');
  if (!subjects.length) return h('div', { class: 'wrap wrap--mid' }, notice('info', 'Nie masz przypisanych przedmiotów. Administrator EDUKRO może je przypisać w swoim panelu.'));
  const title = input({ maxlength: 120, placeholder: 'np. Bomba w laboratorium' });
  const subject = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id) }, s.name)));
  let type = 'saper';
  const types = h('div', { class: 'gm-types', role: 'radiogroup', 'aria-label': 'Rodzaj gry' }, ...GAME_TYPES.map((t) => {
    const b = h('button', { type: 'button', class: ['gm-type', `gm-type--${t.key}`], role: 'radio', 'aria-checked': String(t.key === type), dataset: { key: t.key } },
      h('span', { class: 'gm-type__ic' }, icon(t.icon)), h('b', {}, t.label), h('small', {}, t.desc));
    b.addEventListener('click', () => { type = t.key; types.querySelectorAll('.gm-type').forEach((x) => x.setAttribute('aria-checked', String(x === b))); if (!title.value) title.placeholder = t.key === 'saper' ? 'np. Bomba w laboratorium' : 'np. Młotkiem po układzie okresowym'; });
    return b;
  }));
  const err = h('div', { 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Utwórz grę i wpisz pytania', icon('arrowRight'));
  const form = h('form', { class: 'sheet__body', novalidate: true },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, '1. Rodzaj gry'), types),
    field({ label: '2. Nazwa gry', input: title }),
    field({ label: '3. Przedmiot', input: subject }),
    notice('info', 'Gra startuje z przykładowym układem (np. 3 zdarzenia sapera) – w edytorze dodasz, usuniesz i zmienisz kolejność.'),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) { err.replaceChildren(notice('error', 'Wpisz nazwę gry.')); title.focus(); return; }
    withBusy(submit, async () => {
      try {
        const r = await post('/api/editor/games', { title: title.value, subjectId: Number(subject.value), type });
        toast(`Utworzono grę: ${GAME_TYPE[type].label}.`);
        navigate(`${base}/gra/${r.game.id}`, { replace: true });
      } catch (ex) { err.replaceChildren(notice('error', ex.message)); }
    });
  });
  setTimeout(() => title.focus(), 60);
  return h('div', { class: 'wrap wrap--mid' },
    h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie gry'),
    h('div', { class: 'sheet' }, h('h1', {}, 'Nowa gra'),
      h('p', { class: 'sheet__lead' }, 'Wybierz rodzaj gry. Pytania wpiszesz w edytorze – uczniowie zagrają po opublikowaniu.'), form));
}
