// Gry (0.7): ekran startowy gry ucznia, podgląd nauczyciela i uruchomienie silnika (Saper / Hammer Game).
import { h, icon, notice, toast, withBusy, plural } from '../ui.js';
import { get, post } from '../api.js';
import { navigate, setCrumbs, state, setPointsChip, leaveGuards } from '../app.js';
import * as sound from '../sound.js';
import { GAME_TYPE } from '../shared/game-rules.js';

const RULES = {
  saper: [
    ['bomb', 'Bomba tyka – masz tyle czasu, ile ustawił nauczyciel. Zegar widzisz na bombie.'],
    ['warn', 'Jeden błąd = wybuch. Myśl, zanim przetniesz kabel albo usuniesz plik!'],
    ['scissors', 'Zdarzenia: przecinanie kabli, palnik, trojan, krzyżówka z kodem dostępu i usuwanie plików.'],
    ['flame', 'Na koniec zniszczysz bombę kataną: tnij po liniach i odpowiadaj na pytania w 6 sekund.'],
  ],
  hammer: [
    ['hammer', 'Klikasz (albo dotykasz) – młotek uderza. Tu nic nie jest przyciskiem: uderzasz w kartki, żuki i litery.'],
    ['flame', 'Seria 5 dobrych odpowiedzi zwalnia czas: 5 kartek naraz w 20 sekund – i powtórka jak w telewizji!'],
    ['star', 'Liczy się pierwsze uderzenie. Od 55% – APPROVED, poniżej – DECLINED.'],
    ['check', 'W ostatnim etapie lewy przycisk myszy to APPROVED, prawy – DECLINED (na telefonie przełącznik na dole).'],
  ],
};

async function loadEngine(type) {
  return type === 'saper' ? (await import('../games/saper.js')).runSaper : (await import('../games/hammer.js')).runHammer;
}

/** Uruchamia silnik gry na pełnym ekranie. */
async function mount(runId, { onExit, onAgain }) {
  const data = await get(`/api/game-runs/${runId}`);
  const run = await loadEngine(data.play.type);
  const host = h('div', { class: 'gm-host' });
  document.body.classList.add('is-gaming');
  let finished = false;
  const api = {
    play: data.play, title: data.game.title, subject: data.game.subject, preview: data.run.preview, user: state.user,
    act: (body) => post(`/api/game-runs/${runId}/act`, body),
    finish: async () => {
      if (finished) return finished;
      finished = await post(`/api/game-runs/${runId}/finish`);
      if (finished.balance !== null && finished.balance !== undefined) setPointsChip(finished.balance);
      return finished;
    },
    exit: () => { cleanup(); onExit(); },
    again: () => { cleanup(); onAgain(); },
  };
  let destroy = null;
  function cleanup() { try { destroy?.(); } catch { /* nic */ } host.remove(); document.body.classList.remove('is-gaming'); sound.stopSpeaking(); }
  leaveGuards.add(() => cleanup());
  // gra na pełnym ekranie – poza animowanym widokiem (transform psuje position: fixed)
  document.body.append(host);
  destroy = run(host, api);
  return h('div', { class: 'gm-placeholder' });
}

/* ---------- Uczeń ---------- */
export async function studentGameView({ params }) {
  const gid = Number(params[0]);
  const { game: G, status } = await get(`/api/games/${gid}`);
  const back = `/uczen/przedmiot/${G.subject.slug}/gry`;
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: G.subject.name, href: back }, { label: G.title }]);
  const root = h('div', { class: `wrap wrap--mid gm-intro gm-intro--${G.type} acc-${G.subject.accent}` });
  const start = h('button', { class: 'btn btn--primary btn--lg gm-intro__go', type: 'button' }, icon('play'), status.played ? 'Zagraj jeszcze raz' : 'Zagraj');
  start.addEventListener('click', () => withBusy(start, async () => {
    try {
      const { runId } = await post(`/api/games/${gid}/runs`);
      sound.play('whoosh');
      const host = await mount(runId, { onExit: () => navigate(back), onAgain: () => navigate(`${location.pathname}?od-nowa=1`, { replace: true }) });
      root.replaceChildren(host);
    } catch (e) { toast(e.message, 'error'); }
  }));
  const st = status.played
    ? notice(status.wins ? 'ok' : 'info', h('strong', {}, status.wins ? (G.type === 'saper' ? `Bomba rozbrojona ${status.wins} ${plural(status.wins, ['raz', 'razy', 'razy'])}. ` : `APPROVED – najlepiej ${status.best}%. `) : (G.type === 'saper' ? 'Bomba jeszcze nie rozbrojona. ' : `Najlepiej: ${status.best ?? 0}%. `)),
      status.points ? `Zdobyte punkty: ${status.points}. Kolejne wygrane są dla treningu.` : `Pierwsza wygrana: +${G.type === 'hammer' ? `do ${G.points}` : G.points} pkt.`)
    : G.points ? notice('info', h('strong', {}, `Pierwsza wygrana: ${G.type === 'hammer' ? 'do ' : ''}+${G.points} pkt. `), G.type === 'hammer' ? 'Im wyższy procent, tym więcej punktów.' : 'Rozbrój bombę i zniszcz ją kataną.') : null;
  root.append(
    h('button', { class: 'back', type: 'button', onClick: () => navigate(back) }, icon('arrowLeft'), `Gry: ${G.subject.name}`),
    h('div', { class: 'sheet gm-intro__sheet' },
      h('div', { class: 'gm-intro__badge' }, icon(G.type === 'saper' ? 'bomb' : 'hammer'), GAME_TYPE[G.type].label),
      h('h1', {}, G.title),
      G.summary ? h('p', { class: 'sheet__lead' }, G.summary) : null,
      h('ul', { class: 'gm-intro__rules' }, ...RULES[G.type].map(([ic, t]) => h('li', {}, icon(ic), h('span', {}, t)))),
      st, h('div', { class: 'actions', style: { marginTop: '18px' } }, start)));
  // „Zagraj jeszcze raz” – od razu nowa rozgrywka
  if (new URLSearchParams(location.search).get('od-nowa') === '1') { history.replaceState({}, '', location.pathname); setTimeout(() => start.click(), 250); }
  return root;
}

/* ---------- Podgląd nauczyciela / administratora ---------- */
export async function previewGameView({ base, id }) {
  const back = `${base}/gra/${id}`;
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Gra – podgląd' }]);
  const { runId } = await post(`/api/editor/games/${id}/preview`);
  const host = await mount(runId, { onExit: () => navigate(back), onAgain: () => navigate(location.pathname, { replace: true }) });
  return h('div', { class: 'gm-page' }, host);
}
