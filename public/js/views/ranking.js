// Rankingi: zakładki z boku (Ogólny – domyślnie, 4 kategorie, Gwiazdy lekcji); wybrany ranking zajmuje całą stronę.
import { h, icon, plural, notice } from '../ui.js';
import { get } from '../api.js';
import { navigate, state, setCrumbs, exitButton } from '../app.js';
import { avatarEl, nameLine } from '../avatar.js';
import { openProfile } from './profile-card.js';

const fmtVal = (cat, v) => (cat === 'oceny' ? v.toFixed(2).replace('.', ',') : String(v));
const UNIT = { aktywnosc: ['test', 'testy', 'testów'], punkty: ['pkt', 'pkt', 'pkt'], oceny: null, wygrane: ['wygrana', 'wygrane', 'wygranych'] };
const unitOf = (cat, v) => (UNIT[cat] ? plural(Math.round(v), UNIT[cat]) : 'średnia');

/** Wiersz rankingu: miejsce, profilowe, imię z tytułami, wynik. Kliknięcie → profil (z muzyką tej osoby). */
export function rankRow({ rank, value, card, name, unit, me = false, valueText }) {
  const who = card || { firstName: name?.firstName || '', lastName: name?.lastName || '', avatar: 'letter', frame: 'none' };
  const medal = rank <= 3 ? h('span', { class: `rk-medal rk-medal--${rank}` }, String(rank)) : h('span', { class: 'rk-pos' }, String(rank));
  return h('li', { class: ['rk-row', me && 'is-me', rank === 1 && 'is-first'] },
    medal,
    card ? h('button', { class: 'rk-av', type: 'button', 'aria-label': `Profil: ${who.firstName} ${who.lastName}`, onClick: () => openProfile(card.id) }, avatarEl(card, { size: 36 })) : h('span', { class: 'rk-av' }, avatarEl(who, { size: 36, frame: false })),
    h('span', { class: 'rk-name' }, card ? nameLine(card, { open: openProfile }) : h('span', { class: 'name-line' }, h('span', { class: 'name-line__name' }, `${who.firstName} ${who.lastName}`), h('small', { class: 'muted' }, ' (bez konta)')),
      (card?.classLabel || name?.classLabel) ? h('small', { class: 'rk-class' }, `klasa ${card?.classLabel || name?.classLabel}`) : null),
    h('span', { class: 'rk-val' }, h('b', {}, valueText ?? String(value)), unit ? h('small', {}, unit) : null));
}

function countdownTo(t) {
  const el = h('span', { class: 'countdown' });
  const tick = () => {
    const ms = t - Date.now();
    if (ms <= 0) { el.textContent = 'teraz'; return false; }
    const d = Math.floor(ms / 86400e3), hh = Math.floor((ms % 86400e3) / 3600e3), mm = Math.floor((ms % 3600e3) / 60e3);
    el.textContent = d ? `${d} d ${hh} godz.` : hh ? `${hh} godz. ${mm} min` : `${mm} min`;
    return true;
  };
  tick();
  const iv = setInterval(() => { if (!el.isConnected || !tick()) clearInterval(iv); }, 30000);
  return el;
}


export async function rankingView() {
  if (state.user.role === 'guest') { navigate('/uczen/logowanie', { replace: true }); return null; }
  const home = state.user.role === 'student' ? { label: 'Przedmioty', href: '/uczen/przedmioty' } : state.user.role === 'teacher' ? { label: 'Panel nauczyciela', href: '/nauczyciel/panel' } : { label: 'Administracja', href: '/administracja/przeglad' };
  setCrumbs([{ label: 'Ekran główny', href: '/' }, home, { label: 'Ranking' }]);
  const R = await get('/api/rankings');
  const student = state.user.role === 'student';
  const tabs = [...R.categories.map((c) => ({ id: c.id, label: c.label, icon: c.icon })), { id: 'gwiazdy', label: 'Gwiazdy lekcji', icon: 'sparkle' }];
  let cur = new URLSearchParams(location.search).get('k');
  if (!tabs.some((t) => t.id === cur)) cur = 'ogolny';

  const main = h('section', { class: 'rk-main', 'aria-live': 'polite' });
  const nav = h('nav', { class: 'rk-tabs', role: 'tablist', 'aria-label': 'Rankingi', 'data-help': 'Wybierz ranking – pokaże się obok na całej stronie. Domyślnie widzisz ranking ogólny.' });

  function categoryView(c) {
    const L = c.leader;
    const leaderCard = L ? c.rows.find((r) => r.card.id === L.userId)?.card : null;
    return [
      h('header', { class: 'rk-card__head' }, icon(c.icon), h('div', {}, h('h2', {}, c.label), h('p', {}, c.desc))),
      c.titleName ? h('p', { class: 'rk-prize' }, icon('medal'), `Ponad ${R.reignDays} dni na 1. miejscu: tytuł „${c.titleName.m === c.titleName.f ? c.titleName.m : `${c.titleName.m} / ${c.titleName.f}`}” (tylko stąd) + koło fortuny 100–750 pkt`) : null,
      L && leaderCard ? h('p', { class: 'rk-leader' }, icon('crown'),
        L.rewarded ? `${leaderCard.firstName} ${leaderCard.gender === 'f' ? 'zdobyła' : 'zdobył'} już tytuł za prowadzenie.` : [`Prowadzi ${leaderCard.firstName} – od ${L.days} ${plural(L.days, ['dnia', 'dni', 'dni'])}. Tytuł i koło fortuny za `, countdownTo(L.rewardAt)]) : null,
      student && R.participating !== false ? h('p', { class: 'rk-me' }, c.me ? [`Twoje miejsce: `, h('b', {}, `${c.me.rank}.`), ` (${fmtVal(c.id, c.me.value)} ${c.id === 'ogolny' ? 'pkt rankingu' : unitOf(c.id, c.me.value)})`] : 'Nie ma Cię jeszcze w tym rankingu.') : null,
      c.rows.length ? h('ol', { class: 'rk-list' }, ...c.rows.map((r) => rankRow({ ...r, unit: c.id === 'ogolny' ? 'pkt rankingu' : unitOf(c.id, r.value), me: student && r.card.id === state.user.id, valueText: fmtVal(c.id, r.value) })))
        : h('p', { class: 'muted rk-empty' }, 'Jeszcze nikt – możesz być pierwszy!'),
    ];
  }
  function starsView() {
    const S = R.stars;
    return [
      h('header', { class: 'rk-card__head' }, icon('star'), h('div', {}, h('h2', {}, 'Gwiazdy lekcji – ten tydzień'),
        h('p', {}, 'Na koniec lekcji nauczyciel wybiera najaktywniejszą osobę: +100 pkt i gwiazdka. W piątek o 16:00 zwycięzca zostaje Gwiazdą szkoły (tytuł i ×1,2 punktów przez tydzień), a ranking zaczyna się od nowa.'))),
      R.schoolStars.length ? h('div', { class: 'rk-stars', 'data-help': 'Gwiazda szkoły: najwięcej gwiazdek lekcji w tygodniu. Tytuł i ×1,2 za wszystkie punkty – do następnego piątku, 16:00.' },
        h('h3', {}, icon('sparkle'), R.schoolStars.length > 1 ? 'Gwiazdy szkoły' : 'Gwiazda szkoły'),
        h('div', { class: 'rk-stars__list' }, ...R.schoolStars.map((s) => {
          const who = s.card || { firstName: s.name.firstName, lastName: s.name.lastName, avatar: 'letter' };
          return h('button', { class: 'rk-star', type: 'button', disabled: !s.card, onClick: () => s.card && openProfile(s.card.id) },
            avatarEl(who, { size: 60 }), h('b', {}, `${who.firstName} ${who.lastName}`),
            h('small', {}, `${s.stars} ${plural(s.stars, ['gwiazdka', 'gwiazdki', 'gwiazdek'])} · do piątku 16:00`));
        }))) : null,
      h('p', { class: 'rk-prize' }, icon('clock'), 'Do końca tygodnia: ', countdownTo(S.endsAt)),
      student && R.participating !== false ? h('p', { class: 'rk-me' }, S.me ? [`Twoje gwiazdki: `, h('b', {}, String(S.me.value)), ` (${S.me.rank}. miejsce)`] : 'Bądź aktywny na lekcji, a nauczyciel może wybrać właśnie Ciebie!') : null,
      S.rows.length ? h('ol', { class: 'rk-list' }, ...S.rows.map((r) => rankRow({ ...r, unit: plural(r.value, ['gwiazdka', 'gwiazdki', 'gwiazdek']), me: student && r.card?.id === state.user.id })))
        : h('p', { class: 'muted rk-empty' }, 'W tym tygodniu nikt jeszcze nie został gwiazdą lekcji.'),
    ];
  }
  function show(id, { focus = false } = {}) {
    cur = id;
    history.replaceState({}, '', `/ranking${id === 'ogolny' ? '' : `?k=${id}`}`);
    nav.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === id)));
    const c = R.categories.find((x) => x.id === id);
    main.replaceChildren(...(id === 'gwiazdy' ? starsView() : categoryView(c)));
    main.classList.remove('rk-main--in'); void main.offsetWidth; main.classList.add('rk-main--in');
    if (focus && matchMedia('(max-width: 760px)').matches) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  nav.append(...tabs.map((t) => h('button', { class: 'rk-tab', type: 'button', role: 'tab', dataset: { k: t.id }, 'aria-selected': String(t.id === cur), onClick: () => show(t.id, { focus: true }) },
    icon(t.icon), h('span', {}, t.label))));
  show(cur);

  return h('div', { class: 'wrap rk' },
    h('div', { class: 'page-top' }, exitButton()),
    h('header', { class: 'page-head' }, h('h1', {}, icon('trophy'), ' Ranking'),
      h('p', {}, `Ostatnie ${R.windowDays} dni. Kliknij osobę, żeby zobaczyć jej profil i posłuchać jej muzyki. Ranking każdego testu jest na ekranie startowym testu.`)),
    student && R.participating === false ? notice('info', h('strong', {}, 'Nie bierzesz udziału w rankingach. '), 'Inni nie widzą Cię w rankingach. Zmienisz to w Ustawienia → Ustawienia ogólne.') : null,
    h('div', { class: 'rk-layout' }, nav, main));
}
