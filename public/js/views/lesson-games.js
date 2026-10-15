// Koło fortuny i gry klasowe na tablicy. Punkty przyznaje serwer (ctx.award).
import { h, icon, toast, dialog } from '../ui.js';
import { AWARD, GAME } from '../shared/lesson-rules.js';
import { richText } from './lesson-slides.js';
import * as sound from '../sound.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const short = (p) => `${p.firstName} ${p.lastName ? `${p.lastName[0]}.` : ''}`.trim();
const full = (p) => `${p.firstName} ${p.lastName}`.trim();
const DEMO = ['Ania Nowak', 'Bartek Wiśniewski', 'Celina Wójcik', 'Damian Kamiński', 'Ela Lewandowska', 'Filip Zieliński', 'Gosia Szymańska', 'Hubert Woźniak', 'Iga Dąbrowska', 'Jan Kozłowski', 'Kasia Jankowska', 'Leon Mazur']
  .map((n, i) => { const [f, l] = n.split(' '); return { id: -(i + 1), firstName: f, lastName: l, demo: true }; });
const WHEEL_COLORS = ['#F2A541', '#4DB8DB', '#8DCB6A', '#A894F2', '#EE8FA4', '#76A9F6', '#E9C46A', '#5FD3B3', '#F07A6E', '#C6A6F7'];

/* ---------- Dźwięk (cichy klik koła, fanfara) – przez wspólne ustawienia dźwięku EDUKRO ---------- */
const tick = () => sound.play('tick');
const fanfare = () => sound.play('fanfare');

function emptyRoster(ctx, onDemo) {
  return h('div', { class: 'roster-empty' }, icon('users', 'slide-big-icon'),
    h('h3', {}, `Brak uczniów klasy ${ctx.className || ''} w rejestrze`),
    h('p', { class: 'muted' }, 'Uczniów z klasami dodaje administrator w „Rejestrze uczniów”. Imiona pojawią się tu same – także osób, które nie mają jeszcze konta.'),
    ctx.preview ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: onDemo }, icon('users'), 'Pokaż z przykładowymi imionami') : null);
}

/** Okienko z pytaniem na tablicy (koło i gry). */
function qPanel({ kicker, who, question, answer, actions, tone }) {
  const ans = answer ? h('div', { class: 'qp-ans', hidden: true }, h('b', {}, 'Odpowiedź: '), answer) : null;
  const showAns = answer ? h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => { ans.hidden = false; showAns.remove(); } }, icon('eye'), 'Pokaż odpowiedź') : null;
  return h('div', { class: ['qpanel', tone && `qpanel--${tone}`, 'pop-in'] },
    kicker ? h('p', { class: 'qpanel__kicker' }, kicker) : null,
    who ? h('p', { class: 'qpanel__who' }, who) : null,
    question ? h('div', { class: 'qpanel__q' }, richText(question, 'p')) : h('p', { class: 'qpanel__q qpanel__q--free' }, 'Zadaj pytanie ustnie.'),
    ans, h('div', { class: 'qpanel__actions' }, showAns, ...actions));
}

/* ========================================================================== */
/* Koło fortuny                                                                */
/* ========================================================================== */
export function wheelSlide(s, ctx) {
  let people = ctx.roster.map((p) => ({ ...p, absent: false, picked: false }));
  const root = h('div', { class: 'slide slide--wheel' });
  let rot = 0, spinning = false, qIndex = 0, raf = null;
  const canvas = h('canvas', { class: 'wheel__canvas', width: 760, height: 760, 'aria-hidden': 'true' });
  const g = canvas.getContext('2d');
  const spinBtn = h('button', { class: 'btn btn--primary btn--xl wheel__spin', type: 'button' }, icon('wheel'), 'Zakręć kołem');
  const chips = h('div', { class: 'wheel__chips', 'aria-label': 'Obecność – kliknij nieobecnych' });
  const info = h('p', { class: 'wheel__info' });
  const panel = h('div', { class: 'wheel__panel' });
  const restore = h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => { people.forEach((p) => { p.picked = false; }); render(); } }, icon('repeat'), 'Przywróć wylosowanych');

  const pool = () => people.filter((p) => !p.absent && !(s.removePicked && p.picked));
  function draw() {
    const list = pool();
    const W = canvas.width, c = W / 2, r = c - 14;
    g.clearRect(0, 0, W, W);
    if (!list.length) {
      g.fillStyle = 'rgba(237,230,214,.08)'; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
      return;
    }
    const seg = (Math.PI * 2) / list.length;
    list.forEach((p, i) => {
      const a0 = rot + i * seg - Math.PI / 2, a1 = a0 + seg;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, a0, a1); g.closePath();
      g.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      if (list.length > 1 && i === list.length - 1 && list.length % WHEEL_COLORS.length === 1) g.fillStyle = WHEEL_COLORS[3];
      g.fill();
      g.strokeStyle = 'rgba(10,16,34,.55)'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(c, c); g.rotate(a0 + seg / 2);
      g.fillStyle = '#16100A';
      const fs = Math.max(15, Math.min(34, 520 / list.length));
      g.font = `600 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'middle';
      const name = list.length > 18 ? p.firstName : short(p);
      g.fillText(name.length > 16 ? `${name.slice(0, 15)}…` : name, r - 22, 0);
      g.restore();
    });
    g.beginPath(); g.arc(c, c, 46, 0, Math.PI * 2); g.fillStyle = '#0E1529'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#EDE6D6'; g.stroke();
  }
  function render() {
    draw();
    const present = people.filter((p) => !p.absent).length;
    info.textContent = `Na kole: ${pool().length} · obecnych ${present} z ${people.length}${s.removePicked ? ' · wylosowane osoby znikają z koła' : ''}`;
    chips.replaceChildren(...people.map((p) => {
      const b = h('button', { type: 'button', class: ['wchip', p.absent && 'is-absent', p.picked && 'is-picked'], 'aria-pressed': String(p.absent), title: p.absent ? 'Nieobecny – kliknij, gdy przyjdzie' : 'Kliknij, jeśli nieobecny' }, short(p));
      b.addEventListener('click', () => { if (spinning) return; p.absent = !p.absent; render(); });
      return b;
    }));
    spinBtn.disabled = spinning || !pool().length;
    restore.hidden = !s.removePicked || !people.some((p) => p.picked);
  }
  function spin() {
    const list = pool();
    if (!list.length || spinning) return;
    panel.replaceChildren();
    spinning = true; render();
    const seg = (Math.PI * 2) / list.length;
    const t = Math.floor(Math.random() * list.length);
    const jitter = (Math.random() - 0.5) * seg * 0.7;
    const want = ((-(t + 0.5) * seg + jitter) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
    const cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const start = rot, end = rot + Math.PI * 2 * (reduced() ? 1 : 6) + ((want - cur + Math.PI * 2) % (Math.PI * 2));
    const dur = reduced() ? 600 : 5600, t0 = performance.now();
    let lastSeg = Math.floor(((-rot % (Math.PI * 2)) + Math.PI * 4) / seg);
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      rot = start + (end - start) * (1 - (1 - k) ** 4);
      const sIdx = Math.floor(((-rot % (Math.PI * 2)) + Math.PI * 4) / seg);
      if (sIdx !== lastSeg) { lastSeg = sIdx; if (!reduced()) tick(); }
      draw();
      if (k < 1) { raf = requestAnimationFrame(frame); return; }
      spinning = false;
      picked(list[t]);
    };
    raf = requestAnimationFrame(frame);
  }
  function picked(p) {
    render();
    canvas.classList.remove('is-hit'); void canvas.offsetWidth; canvas.classList.add('is-hit');
    const qs = s.questions || [];
    const q = qs.length ? qs[qIndex % qs.length] : null;
    if (qs.length) qIndex++;
    const done = (ok) => {
      p.picked = true;
      panel.replaceChildren();
      render();
      if (ok) {
        ctx.award(s, 'correct', [p.id]).then((r) => {
          toast(r.preview ? `Podgląd: ${short(p)} dostałby +${AWARD.wheel} pkt.` : `+${AWARD.wheel} pkt dla: ${full(p)}${p.demo ? ' (przykład)' : ''}.`);
        }).catch((e) => toast(e.message, 'error'));
        ctx.celebrate?.(canvas);
        fanfare();
      }
    };
    panel.replaceChildren(qPanel({
      kicker: 'Odpowiada:', who: full(p), question: q?.q, answer: q?.a,
      actions: [
        h('button', { class: 'btn btn--danger', type: 'button', onClick: () => done(false) }, icon('x'), 'Źle'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => done(true) }, icon('check'), `Dobrze (+${AWARD.wheel} pkt)`),
      ],
    }));
  }
  spinBtn.addEventListener('click', spin);
  function build() {
    if (!people.length) {
      root.replaceChildren(h('h2', { class: 'slide-title' }, s.title || 'Koło fortuny'), emptyRoster(ctx, () => { people = DEMO.map((p) => ({ ...p, absent: false, picked: false })); build(); }));
      return;
    }
    root.replaceChildren(
      h('h2', { class: 'slide-title' }, s.title || 'Koło fortuny'),
      h('div', { class: 'wheel' },
        h('div', { class: 'wheel__stage' }, h('span', { class: 'wheel__pointer', 'aria-hidden': 'true' }), canvas, spinBtn),
        h('div', { class: 'wheel__side' }, panel, h('div', { class: 'wheel__people' }, h('p', { class: 'wheel__label' }, 'Obecność (kliknij nieobecnych):'), chips, h('div', { class: 'actions' }, info, restore)))));
    render();
  }
  build();
  return { el: root, leave() { cancelAnimationFrame(raf); } };
}

/* ========================================================================== */
/* Drużyny                                                                     */
/* ========================================================================== */
const TEAM = { red: 'Czerwoni', blue: 'Niebiescy' };
function teamSetup(roster, ctx, onStart) {
  let people = roster.map((p) => ({ ...p, absent: false }));
  let red = [], blue = [], out = [];
  const el = h('div', { class: 'teams-setup' });
  const split = (list) => { const x = shuffle(list); red = x.filter((_, i) => i % 2 === 0); blue = x.filter((_, i) => i % 2 === 1); };
  const reshuffle = () => { out = people.filter((p) => p.absent); split(people.filter((p) => !p.absent)); render(); };
  const presentCount = (t) => t.filter((p) => !p.absent).length;
  function toggle(p) {
    p.absent = !p.absent;
    if (!p.absent && out.includes(p)) { out = out.filter((x) => x !== p); (presentCount(red) <= presentCount(blue) ? red : blue).push(p); }
    const diff = Math.abs(presentCount(red) - presentCount(blue));
    if (diff > 2) {
      toast('Przez nieobecności różnica w drużynach przekroczyła 2 osoby – losuję drużyny od nowa, już bez nieobecnych.', 'info');
      reshuffle();
      el.querySelector('.teams')?.classList.add('is-reshuffled');
      return;
    }
    render();
  }
  function col(team, list) {
    return h('div', { class: `team team--${team}` },
      h('h3', {}, TEAM[team], h('span', {}, `${presentCount(list)} os.`)),
      h('div', { class: 'team__list' }, ...list.map((p, i) => {
        const b = h('button', { type: 'button', class: ['pchip', p.absent && 'is-absent'], style: { '--i': i }, title: p.absent ? 'Nieobecny – kliknij, gdy przyjdzie' : 'Kliknij, jeśli nieobecny' }, full(p));
        b.addEventListener('click', () => toggle(p));
        return b;
      })));
  }
  function render() {
    const start = h('button', { class: 'btn btn--primary btn--xl', type: 'button', disabled: !presentCount(red) || !presentCount(blue) }, icon('play'), 'Zaczynamy grę!');
    start.addEventListener('click', () => onStart({ red: red.filter((p) => !p.absent), blue: blue.filter((p) => !p.absent) }));
    el.replaceChildren(
      h('p', { class: 'slide-kicker' }, icon('users'), 'Drużyny wylosowane – kliknij osoby nieobecne'),
      h('div', { class: 'teams' }, col('red', red), h('span', { class: 'teams__vs' }, 'vs'), col('blue', blue)),
      out.length ? h('div', { class: 'teams__out' }, h('span', { class: 'muted' }, 'Nieobecni:'), ...out.map((p) => h('button', { type: 'button', class: 'pchip is-absent', onClick: () => toggle(p) }, full(p)))) : null,
      h('div', { class: 'actions teams__actions' }, h('button', { class: 'btn btn--ghost', type: 'button', onClick: reshuffle }, icon('shuffle'), 'Losuj od nowa'), start));
  }
  reshuffle();
  return el;
}

function scoreboard(score, turn) {
  return h('div', { class: 'score' },
    h('div', { class: ['score__team', 'score__team--red', turn === 'red' && 'is-turn'] }, h('span', {}, TEAM.red), h('b', {}, String(score.red))),
    h('span', { class: 'score__vs' }, ':'),
    h('div', { class: ['score__team', 'score__team--blue', turn === 'blue' && 'is-turn'] }, h('b', {}, String(score.blue)), h('span', {}, TEAM.blue)));
}

/** Losowanie graczy drużyny „po kolei” – nikt nie odpowiada drugi raz, zanim wszyscy nie odpowiedzą. */
function drawer(list) {
  let bag = [];
  return () => { if (!bag.length) bag = shuffle(list); return bag.pop(); };
}

function finish(root, s, ctx, teams, score, extra, forced = null) {
  const win = forced || (score.red === score.blue ? null : score.red > score.blue ? 'red' : 'blue');
  const ids = win ? teams[win].map((p) => p.id) : [...teams.red, ...teams.blue].map((p) => p.id);
  const pts = win ? AWARD.gameWin : AWARD.gameDraw;
  const msg = h('p', { class: 'muted' }, 'Zapisywanie punktów…');
  root.replaceChildren(h('div', { class: ['game-end', win && `game-end--${win}`, 'pop-in'] },
    icon('trophy', 'game-end__icon'),
    h('h2', { class: 'slide-title' }, win ? `Wygrywają ${TEAM[win]}!` : 'Remis!'),
    scoreboard(score), extra || null,
    h('p', { class: 'slide-sub' }, win ? `Każda osoba z drużyny dostaje +${pts} pkt.` : `Każdy uczestnik dostaje +${pts} pkt.`),
    h('div', { class: 'game-end__names' }, ...(win ? teams[win] : [...teams.red, ...teams.blue]).map((p) => h('span', { class: 'pchip' }, full(p)))),
    msg));
  ctx.celebrate?.(root);
  fanfare();
  ctx.award(s, win ? 'win' : 'draw', ids.filter((x) => x > 0))
    .then((r) => { msg.textContent = r.preview ? 'Podgląd – punkty nie zostały zapisane.' : `Zapisano: +${r.amount} pkt dla ${r.count} ${r.count === 1 ? 'osoby' : 'osób'}.`; })
    .catch((e) => { msg.textContent = e.message; });
}

function teamGame(s, ctx, play) {
  const root = h('div', { class: ['slide', 'slide--game', `game--${s.game}`] });
  const head = () => h('div', { class: 'game-head' }, h('p', { class: 'slide-kicker' }, icon('game'), GAME[s.game].label), h('h2', { class: 'slide-title' }, s.title || GAME[s.game].label));
  const start = (roster) => {
    root.replaceChildren(head(), teamSetup(roster, ctx, (teams) => {
      const area = h('div', { class: 'game-area' });
      root.replaceChildren(head(), area);
      play(area, teams, (score, extra, forced) => finish(area, s, ctx, teams, score, extra, forced));
    }));
  };
  if (!ctx.roster.length) root.replaceChildren(head(), emptyRoster(ctx, () => start(DEMO)));
  else start(ctx.roster);
  return { el: root };
}

/* ---------- Czerwoni vs Niebiescy: pojedynek na szybkość ---------- */
function duel(s, ctx) {
  return teamGame(s, ctx, (area, teams, end) => {
    const qs = s.questions || [];
    const score = { red: 0, blue: 0 };
    const nextRed = drawer(teams.red), nextBlue = drawer(teams.blue);
    let qi = 0;
    const round = () => {
      if (qi >= qs.length) return end(score);
      const R = nextRed(), B = nextBlue();
      const q = qs[qi];
      const pr = h('div', { class: 'duelist duelist--red' }, h('span', {}, TEAM.red), h('b', { class: 'name-roll' }, full(R)));
      const pb = h('div', { class: 'duelist duelist--blue' }, h('span', {}, TEAM.blue), h('b', { class: 'name-roll' }, full(B)));
      const stage = h('div', { class: 'duel-stage' }, h('div', { class: 'count' }, '3'));
      area.replaceChildren(scoreboard(score), h('p', { class: 'duel-n' }, `Pytanie ${qi + 1} z ${qs.length}`), h('div', { class: 'duel' }, pr, h('span', { class: 'duel__vs' }, 'vs'), pb), stage);
      // animacja losowania imion, potem odliczanie 3…2…1
      const roll = (el, list, final) => { let n = 0; const t = setInterval(() => { el.textContent = full(list[Math.floor(Math.random() * list.length)]); if (++n > 9) { clearInterval(t); el.textContent = full(final); el.classList.add('is-set'); } }, 70); };
      if (!reduced()) { roll(pr.querySelector('b'), teams.red, R); roll(pb.querySelector('b'), teams.blue, B); }
      let c = 3;
      const cnt = stage.querySelector('.count');
      const t = setInterval(() => {
        c--;
        if (c > 0) { cnt.textContent = String(c); cnt.classList.remove('is-tick'); void cnt.offsetWidth; cnt.classList.add('is-tick'); return; }
        clearInterval(t);
        const point = (team) => {
          score[team]++;
          const who = team === 'red' ? R : B;
          stage.replaceChildren(h('div', { class: `point point--${team} pop-in` }, icon('check'), h('b', {}, `Punkt dla: ${TEAM[team]}`), h('span', {}, full(who))),
            q.a ? h('p', { class: 'qp-ans' }, h('b', {}, 'Odpowiedź: '), q.a) : null,
            h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: () => { qi++; round(); } }, qi + 1 >= qs.length ? 'Zobacz wynik' : 'Następne pytanie', icon('arrowRight'))));
          area.querySelector('.score')?.replaceWith(scoreboard(score));
          if (!reduced()) fanfare();
        };
        stage.replaceChildren(h('div', { class: 'duel-q pop-in' }, richText(q.q, 'p')),
          h('p', { class: 'muted small' }, 'Kliknij osobę, która pierwsza odpowiedziała poprawnie:'),
          h('div', { class: 'duel-pick' },
            h('button', { class: 'btn btn--xl pick--red', type: 'button', onClick: () => point('red') }, full(R)),
            h('button', { class: 'btn btn--xl pick--blue', type: 'button', onClick: () => point('blue') }, full(B))),
          h('div', { class: 'actions', style: { justifyContent: 'center' } },
            h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => round() }, icon('shuffle'), 'Nikt nie odpowiedział dobrze – losuj inne osoby')));
      }, reduced() ? 250 : 1000);
    };
    round();
  });
}

/* ---------- Kółko i krzyżyk ---------- */
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function tictactoe(s, ctx) {
  return teamGame(s, ctx, (area, teams, end) => {
    const qs = s.questions || [];
    const cells = Array(9).fill(null);
    const score = { red: 0, blue: 0 };
    const next = { red: drawer(teams.red), blue: drawer(teams.blue) };
    let turn = Math.random() < 0.5 ? 'red' : 'blue', qi = 0, winLine = null;
    const count = () => { score.red = cells.filter((c) => c === 'red').length; score.blue = cells.filter((c) => c === 'blue').length; };
    let lineWinner = null;
    const done = () => {
      const w = LINES.find((l) => cells[l[0]] && l.every((i) => cells[i] === cells[l[0]]));
      count();
      if (w) { winLine = w; lineWinner = cells[w[0]]; return { ...score }; }
      if (cells.every(Boolean) || qi >= qs.length) return { ...score };
      return null;
    };
    const board = (onPick) => h('div', { class: 'ttt' }, ...cells.map((c, i) => {
      const b = h('button', { type: 'button', class: ['ttt__cell', c && `is-${c}`, winLine?.includes(i) && 'is-win'], disabled: !!c || !onPick, 'aria-label': c ? `Pole ${i + 1}: ${TEAM[c]}` : `Pole ${i + 1}` }, c === 'red' ? '✕' : c === 'blue' ? '◯' : '');
      if (onPick && !c) b.addEventListener('click', () => onPick(i));
      return b;
    }));
    const render = () => {
      count();
      const result = done();
      if (result) {
        area.replaceChildren(board(null));
        return setTimeout(() => end(result, h('div', { class: 'ttt-end' },
          h('div', { class: 'ttt ttt--mini' }, ...cells.map((c, i) => h('span', { class: ['ttt__cell', c && `is-${c}`, winLine?.includes(i) && 'is-win'] }, c === 'red' ? '✕' : c === 'blue' ? '◯' : ''))),
          h('p', { class: 'muted' }, lineWinner ? 'Trzy znaki w linii!' : 'Plansza pełna – wygrywa drużyna z większą liczbą pól.')), lineWinner), reduced() ? 0 : 900);
      }
      area.replaceChildren(scoreboard(score, turn), h('p', { class: `turn turn--${turn}` }, `Kolej: ${TEAM[turn]} – wybierzcie pole`), board(ask), h('p', { class: 'muted small' }, `Pytania: ${qi} z ${qs.length}`));
    };
    function ask(i) {
      const q = qs[qi++];
      const who = next[turn]();
      const overlay = h('div', { class: 'game-overlay' }, qPanel({
        kicker: `${TEAM[turn]} · pole ${i + 1}`, who: `Odpowiada: ${full(who)}`, question: q.q, answer: q.a, tone: turn,
        actions: [
          h('button', { class: 'btn btn--danger', type: 'button', onClick: () => { turn = turn === 'red' ? 'blue' : 'red'; render(); } }, icon('x'), 'Źle – pole zostaje wolne'),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => { cells[i] = turn; turn = turn === 'red' ? 'blue' : 'red'; if (!reduced()) tick(); render(); } }, icon('check'), 'Dobrze – stawiamy znak'),
        ],
      }));
      area.append(overlay);
    }
    render();
  });
}

/* ---------- Va banque ---------- */
function vabanque(s, ctx) {
  return teamGame(s, ctx, (area, teams, end) => {
    const board = (s.board || []).map((c) => ({ name: c.name, qs: (c.questions || []).map((q, j) => ({ ...q, value: (j + 1) * 100, used: false })) }));
    const score = { red: 0, blue: 0 };
    const next = { red: drawer(teams.red), blue: drawer(teams.blue) };
    let turn = Math.random() < 0.5 ? 'red' : 'blue';
    const rows = Math.max(...board.map((c) => c.qs.length));
    const render = () => {
      if (board.every((c) => c.qs.every((q) => q.used))) return end({ ...score });
      const grid = h('div', { class: 'vb', style: { '--cols': String(board.length) } },
        ...board.map((c) => h('div', { class: 'vb__cat' }, c.name)),
        ...Array.from({ length: rows }, (_, r) => board.map((c) => {
          const q = c.qs[r];
          if (!q) return h('span', { class: 'vb__tile is-none' });
          const b = h('button', { type: 'button', class: ['vb__tile', q.used && 'is-used'], disabled: q.used }, q.used ? '' : String(q.value));
          if (!q.used) b.addEventListener('click', () => ask(c, q));
          return b;
        })).flat());
      area.replaceChildren(scoreboard(score, turn), h('p', { class: `turn turn--${turn}` }, `Wybierają: ${TEAM[turn]}`), grid,
        h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => dialog({ iconName: 'flag', title: 'Zakończyć grę teraz?', body: h('p', {}, 'Wygra drużyna, która ma teraz więcej punktów.'), actions: [{ label: 'Gramy dalej', kind: 'quiet' }, { label: 'Zakończ grę', kind: 'primary', onClick: () => end({ ...score }) }] }) }, icon('flag'), 'Zakończ grę wcześniej')));
    };
    function ask(c, q) {
      const who = next[turn]();
      const resolve = (team) => {
        q.used = true;
        if (team) score[team] += q.value;
        turn = turn === 'red' ? 'blue' : 'red';
        if (team && !reduced()) tick();
        render();
      };
      area.append(h('div', { class: 'game-overlay' }, qPanel({
        kicker: `${c.name} · za ${q.value}`, who: `${TEAM[turn]} – odpowiada: ${full(who)}`, question: q.q, answer: q.a, tone: turn,
        actions: [
          h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => resolve(null) }, 'Nikt'),
          h('button', { class: 'btn pick--red', type: 'button', onClick: () => resolve('red') }, `${TEAM.red} +${q.value}`),
          h('button', { class: 'btn pick--blue', type: 'button', onClick: () => resolve('blue') }, `${TEAM.blue} +${q.value}`),
        ],
      })));
    }
    render();
  });
}

export function gameSlide(s, ctx) {
  if (s.game === 'tictactoe') return tictactoe(s, ctx);
  if (s.game === 'vabanque') return vabanque(s, ctx);
  return duel(s, ctx);
}
