// Skrzynka: powiadomienia, punkty i nagrody do odebrania (uczeń), sprawy do załatwienia (nauczyciel, administrator).
import { h, icon, toast, withBusy, plural } from '../ui.js';
import { get, post } from '../api.js';
import { navigate, state, setCrumbs, refreshInboxBadge, setPointsChip, exitButton } from '../app.js';
import { confetti } from './test-player.js';
import * as sound from '../sound.js';
import { spinWheelDialog } from './wheel.js';

const KIND_ICON = {
  welcome: 'sparkle', account: 'check', test_new: 'exam', quiz_new: 'quiz', game_new: 'game', lesson_new: 'lesson', gift: 'gift', lesson_points: 'star',
  reward: 'medal', expiring: 'hourglass', praise: 'medal', promo: 'tag', admin_account: 'users', praise_request: 'medal', admin_claim: 'inbox', deduct: 'minus',
  winner: 'trophy', leader: 'crown', lesson_star: 'star', school_star: 'sparkle',
};
const KIND_TONE = { deduct: 'warn', gift: 'gold', lesson_points: 'gold', reward: 'gold', expiring: 'warn', promo: 'flame', praise: 'gold', account: 'ok', winner: 'gold', leader: 'gold', lesson_star: 'gold', school_star: 'gold' };

export function ago(ms) {
  const d = Date.now() - ms;
  const m = Math.round(d / 60000);
  if (m < 1) return 'przed chwilą';
  if (m < 60) return `${m} min temu`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh} godz. temu`;
  const days = Math.round(hh / 24);
  if (days === 1) return 'wczoraj';
  if (days < 7) return `${days} dni temu`;
  return new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
}

export async function inboxView() {
  const u = state.user;
  if (u.role === 'guest') { navigate('/', { replace: true }); return null; }
  const home = u.role === 'student' ? { label: 'Przedmioty', href: '/uczen/przedmioty' } : u.role === 'teacher' ? { label: 'Panel nauczyciela', href: '/nauczyciel/panel' } : { label: 'Administracja', href: '/administracja/przeglad' };
  setCrumbs([{ label: 'Ekran główny', href: '/' }, home, { label: 'Skrzynka' }]);
  let data = await get('/api/inbox');
  let filter = 'all'; // wszystko – punkty i nagrody do odebrania są zawsze na górze listy
  const root = h('div', { class: 'wrap wrap--mid inbox' });

  async function reload() { data = await get('/api/inbox'); render(); refreshInboxBadge(); }

  async function claimOne(item, card, btn) {
    if (item.reward?.type === 'wheel') {
      spinWheelDialog(item, (r) => { item.claimed = true; if (typeof r.balance === 'number') setPointsChip(r.balance); });
      document.addEventListener('edukro:dialog-close', () => reload(), { once: true });
      return;
    }
    await withBusy(btn, async () => {
      try {
        const r = await post('/api/inbox/claim', { id: item.id });
        item.claimed = true; item.read = true;
        sound.play(r.item || r.promo ? 'claim' : 'coin');
        const rect = btn.getBoundingClientRect();
        confetti({ count: r.item || r.promo ? 90 : 50, origin: [rect.left + rect.width / 2, rect.top] });
        toast(r.message || 'Odebrano!');
        if (typeof r.balance === 'number') setPointsChip(r.balance);
        card.classList.add('is-claimed-now');
        setTimeout(reload, 650);
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  async function claimAll(btn) {
    await withBusy(btn, async () => {
      try {
        const r = await post('/api/inbox/claim-all');
        sound.play('claim');
        confetti({ count: 120 });
        toast(r.points ? `Odebrano: +${r.points} pkt${r.messages.length ? ` i ${r.messages.length} ${plural(r.messages.length, ['nagrodę', 'nagrody', 'nagród'])}` : ''}!` : `Odebrano ${r.messages.length} ${plural(r.messages.length, ['nagrodę', 'nagrody', 'nagród'])}!`);
        setPointsChip(r.balance);
        filter = 'all';
        reload();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function card(item) {
    const waiting = item.claimable && !item.claimed;
    const tone = KIND_TONE[item.kind] || 'plain';
    const c = h('article', { class: ['msg', `msg--${tone}`, !item.read && 'is-unread', waiting && 'is-waiting'], 'data-id': item.id });
    const claimBtn = waiting ? h('button', { class: 'btn btn--primary btn--sm msg__claim', type: 'button', 'data-help': 'Odbierz punkty albo nagrodę – trafią od razu na Twoje konto.' },
      icon(item.reward?.type === 'wheel' ? 'wheel' : item.reward ? 'gift' : 'star'), item.reward?.type === 'wheel' ? 'Zakręć kołem' : item.points ? `Odbierz +${item.points} pkt` : 'Odbierz nagrodę') : null;
    claimBtn?.addEventListener('click', (e) => { e.stopPropagation(); claimOne(item, c, claimBtn); });
    const open = item.link ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => navigate(item.link) }, item.kind === 'expiring' || /test|quiz/.test(item.kind) ? 'Rozwiąż' : 'Otwórz', icon('arrowRight')) : null;
    c.append(
      h('span', { class: 'msg__icon' }, icon(KIND_ICON[item.kind] || 'bell')),
      h('div', { class: 'msg__body' },
        h('div', { class: 'msg__head' }, !item.read ? h('span', { class: 'msg__dot', 'aria-label': 'nowe' }) : null, h('b', {}, item.title)),
        item.body ? h('p', {}, item.body) : null,
        item.reward ? h('p', { class: 'msg__reward' }, icon('gift'), item.reward.label) : null,
        h('small', { class: 'msg__time' }, ago(item.createdAt))),
      h('div', { class: 'msg__acts' }, claimBtn, item.claimable && item.claimed ? h('span', { class: 'owned' }, icon('check'), 'Odebrano') : null, open));
    return c;
  }

  function render() {
    const items = data.items.filter((x) => (filter === 'claim' ? x.claimable && !x.claimed : filter === 'unread' ? !x.read : true));
    const claimN = data.items.filter((x) => x.claimable && !x.claimed).length;
    const chip = (key, label, n) => h('button', { class: ['chip-filter', filter === key && 'is-on'], type: 'button', 'aria-pressed': String(filter === key), onClick: () => { filter = key; render(); } }, label, n ? h('span', {}, String(n)) : null);
    root.replaceChildren(
      u.role !== 'admin' ? h('div', { class: 'page-top' }, exitButton()) : null,
      h('header', { class: 'inbox__head' },
        h('div', {}, h('h1', {}, icon('bell'), 'Skrzynka'),
          h('p', {}, u.role === 'student' ? 'Wiadomości z EDUKRO: nowe testy i lekcje, punkty i nagrody do odebrania, przypomnienia.' : 'Sprawy do załatwienia: nowe konta, prośby o pochwałę, zgłoszenia.')),
        h('div', { class: 'actions' },
          claimN ? h('button', { class: 'btn btn--primary', type: 'button', onClick: (e) => claimAll(e.currentTarget), 'data-help': 'Odbiera naraz wszystkie punkty i nagrody czekające w skrzynce.' }, icon('gift'), `Odbierz wszystko${data.pointsToClaim ? ` (+${data.pointsToClaim} pkt)` : ''}`) : null,
          data.unread ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: async () => { await post('/api/inbox/read', {}); reload(); }, 'data-help': 'Oznacza wszystkie wiadomości jako przeczytane (punkty nadal możesz odebrać).' }, icon('check'), 'Oznacz jako przeczytane') : null)),
      h('div', { class: 'chips inbox__filters', role: 'group', 'aria-label': 'Pokaż' },
        chip('all', 'Wszystkie', 0), u.role === 'student' ? chip('claim', 'Do odebrania', claimN) : null, chip('unread', 'Nieprzeczytane', data.unread)),
      items.length ? h('div', { class: 'inbox-list' }, ...items.map(card))
        : h('div', { class: 'empty' }, icon('bell', 'empty__icon'), h('div', {}, h('h3', {}, filter === 'claim' ? 'Wszystko odebrane!' : 'Pusto'),
          h('p', {}, filter === 'claim' ? 'Nowe punkty z lekcji, od nauczycieli i nagrody za testy pojawią się tutaj.' : 'Gdy coś się wydarzy – nowy test, lekcja, punkty – zobaczysz to tutaj.'))));
    // zwykłe wiadomości oznaczamy jako przeczytane po chwili (punktów i nagród nie – czekają na odebranie)
    const toRead = data.items.filter((x) => !x.read && !(x.claimable && !x.claimed) && x.id.startsWith('n')).map((x) => x.id);
    if (toRead.length) setTimeout(async () => { if (!root.isConnected) return; await post('/api/inbox/read', { ids: toRead }).catch(() => {}); refreshInboxBadge(); }, 1800);
  }
  render();
  return root;
}
