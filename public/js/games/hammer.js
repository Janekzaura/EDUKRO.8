// HAMMER GAME – gra na spryt i szybkość. Młotek 3D (CSS) uderza tam, gdzie klikniesz / dotkniesz.
// Nic tu nie jest przyciskiem: trafienie wyznacza punkt uderzenia (document.elementsFromPoint → [data-hit]).
// Etapy: kartki TAK/NIE (seria 5 → zwolnienie czasu + INSTANT REPLAY), żuki, pary (zdrapka), test młotkiem,
// APPROVED / DECLINED z podpisem i „chwila prawdy”. Odpowiedzi sprawdza serwer (api.act), procent liczy serwer.
import { h, icon, toast } from '../ui.js';
import * as sound from '../sound.js';
import { celebrate } from '../celebrate.js';
import { avatarEl } from '../avatar.js';
import { gradeFor, GRADE_NAMES } from '../shared/quiz-rules.js';
import { sleep, rand, pick, svg, shake, burst, confirmExit, reduced, clamp } from './common.js';

const STAGE = { cards: 'Kartki', bugs: 'Żuki', pairs: 'Pary', test: 'Test', approve: 'Approve' };
const LETTERS = 'ABCDEFGH';

export function runHammer(host, api) {
  const P = api.play;
  let alive = true;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  let good = 0, done = 0;

  /* ---------- Szkielet ---------- */
  const pills = h('div', { class: 'hm-pills' }, ...P.stages.map((s) => h('span', { class: 'hm-pill', dataset: { s } }, STAGE[s])));
  const tip = h('div', { class: 'hm-tip', 'aria-live': 'polite' });
  const scoreEl = h('b', {}, '0');
  const streakEl = h('span', { class: 'hm-streak', hidden: true });
  const exitBtn = h('button', { class: 'hm-x', type: 'button', 'aria-label': 'Wyjdź z gry', title: 'Wyjdź z gry' }, icon('x'));
  const hud = h('header', { class: 'hm-hud' },
    h('div', { class: 'hm-brand' }, h('b', {}, 'HAMMER', h('i', {}, 'GAME'), h('sup', {}, '™')), api.preview ? h('span', { class: 'hm-pv' }, 'PODGLĄD') : null),
    pills, h('div', { class: 'hm-score' }, streakEl, h('span', {}, 'Trafione: ', scoreEl, ` / ${P.total}`)), exitBtn);
  const arena = h('div', { class: 'hm-arena' });
  const pages = h('div', { class: 'hm-pages' }, arena);
  const root = h('div', { class: 'hm', tabindex: '-1' }, hud, h('div', { class: 'hm-stage' }, tip, pages));
  host.append(root);
  exitBtn.addEventListener('click', () => (finished ? api.exit() : confirmExit(() => { stop(); api.exit(); })));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (finished) api.exit(); else confirmExit(() => { stop(); api.exit(); }); } });
  let tipT = null;
  /** Podpowiedź u góry; znika sama po kilku sekundach (keep = zostaje, np. „Uderz w swój procent”). */
  const setTip = (t, strong = false, keep = false) => {
    clearTimeout(tipT);
    tip.textContent = t || ''; tip.hidden = !t; tip.classList.remove('is-fade'); tip.classList.toggle('is-strong', strong);
    if (strong) { tip.classList.remove('is-pop'); void tip.offsetWidth; tip.classList.add('is-pop'); }
    if (t && !keep) tipT = setTimeout(() => tip.classList.add('is-fade'), 5500);
  };
  const setStage = (s) => pills.querySelectorAll('.hm-pill').forEach((p) => { const i = P.stages.indexOf(p.dataset.s), j = P.stages.indexOf(s); p.className = `hm-pill${i < j ? ' is-done' : i === j ? ' is-cur' : ''}`; });
  const addScore = (ok) => { done++; if (ok) good++; scoreEl.textContent = String(good); scoreEl.parentElement.classList.remove('is-bump'); void scoreEl.offsetWidth; scoreEl.parentElement.classList.add('is-bump'); };

  /* ---------- Młotek 3D ---------- */
  const face = (cls, extra = '') => h('i', { class: `hm-f ${cls}` }, extra);
  const head = h('div', { class: 'hm-head' }, face('hm-f--front', h('span', { class: 'hm-f__lbl' })), face('hm-f--back'), face('hm-f--top'), face('hm-f--bottom'), face('hm-f--left'), face('hm-f--right'));
  const handle = h('div', { class: 'hm-handle' }, face('hm-h--front'), face('hm-h--back'), face('hm-h--top'), face('hm-h--bottom'));
  const rig = h('div', { class: 'hm-rig' }, handle, head);
  const hammer = h('div', { class: 'hm-hammer', 'aria-hidden': 'true' }, rig);
  root.append(hammer);
  // czerwona kropka: dokładnie tu uderzy młotek
  const aim = h('i', { class: 'hm-aim is-off', 'aria-hidden': 'true' });
  root.append(aim);
  let side = 'approve'; // strona młotka w etapie APPROVED / DECLINED
  const faceLbl = head.querySelector('.hm-f__lbl');
  function setSide(s, anim = true) {
    if (s === side && anim) return;
    side = s;
    hammer.classList.toggle('is-decline', s === 'decline');
    faceLbl.textContent = s === 'decline' ? 'D' : 'A';
    if (anim) { head.classList.remove('is-flip'); void head.offsetWidth; head.classList.add('is-flip'); sound.play('whoosh'); }
    root.querySelectorAll('.hm-side__opt').forEach((o) => o.classList.toggle('is-on', o.dataset.side === s));
  }
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const placeHammer = (x, y) => { pos.x = x; pos.y = y; hammer.style.transform = `translate(${x}px, ${y}px)`; aim.style.transform = `translate(${x}px, ${y}px)`; };
  placeHammer(pos.x, pos.y);
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') { placeHammer(e.clientX, e.clientY); aim.classList.toggle('is-off', !!e.target.closest('.hm-hud, .hm-ui, button, a, input, textarea')); }
    hammer.classList.remove('is-away'); eyesTo(e.clientX, e.clientY);
  });
  root.addEventListener('pointerleave', () => { hammer.classList.add('is-away'); aim.classList.add('is-off'); });
  let swingN = 0;
  function swing(x, y, { power = 1, silent = false } = {}) {
    placeHammer(x, y);
    hammer.classList.remove('is-away');
    rig.classList.remove('is-swing'); void rig.offsetWidth; rig.classList.add('is-swing');
    swingN++;
    return new Promise((res) => setTimeout(() => { impact(x, y, power, silent); res(); }, reduced() ? 0 : 95));
  }
  function impact(x, y, power, silent) {
    if (!silent) sound.play('thud');
    const r = root.getBoundingClientRect();
    const ring = h('i', { class: 'hm-ring', style: { left: `${x - r.left}px`, top: `${y - r.top}px` } });
    root.append(ring); setTimeout(() => ring.remove(), 500);
    burst(root, x - r.left, y - r.top, { n: 8, colors: ['#fff', '#d9d2c3', '#ffd28a'], size: [3, 6], dist: [16, 54], ms: [300, 600], gravity: 20 });
    if (power > 1) shake(pages, 5 * power, 260);
  }
  /** Uderzenie: co jest pod młotkiem (najwyżej położony element z data-hit wewnątrz kontenera). */
  const targetAt = (x, y, within = root) => document.elementsFromPoint(x, y).find((el) => el.closest('[data-hit]') && within.contains(el))?.closest('[data-hit]') || null;
  let onHit = null; // (x, y, target, e) – obsługa bieżącego etapu
  let hitLock = false;
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('pointerdown', async (e) => {
    if (!alive || e.target.closest('.hm-hud, .hm-ui, button, a, input, textarea')) return;
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    root.focus({ preventScroll: true });
    if (onHit?.custom) return onHit.custom(e);
    if (hitLock) return;
    onHit?.before?.(e);
    const x = e.clientX, y = e.clientY;
    const tgt = targetAt(x, y);
    await swing(x, y);
    onHit?.(x, y, tgt, e);
  });

  /* ---------- Oczy żuków patrzą na młotek ---------- */
  let eyesTo = () => {};

  /* ---------- Wspólne ---------- */
  async function send(body) {
    try { return await api.act(body); } catch (e) { toast(e.message, 'error'); return null; }
  }
  const arenaBox = () => arena.getBoundingClientRect();
  const local = (x, y) => { const r = arenaBox(); return { x: x - r.left, y: y - r.top }; };
  function floatText(x, y, text, cls = '') {
    const p = local(x, y);
    const el = h('span', { class: `hm-float ${cls}`, style: { left: `${p.x}px`, top: `${p.y}px` } }, text);
    arena.append(el); setTimeout(() => el.remove(), 900);
  }
  function stamp(parent, x, y, text, cls) {
    const r = parent.getBoundingClientRect();
    const el = h('span', { class: `hm-stamp ${cls}`, style: { left: `${x - r.left}px`, top: `${y - r.top}px`, '--rot': `${rand(-18, 12)}deg` } }, text);
    parent.append(el);
    sound.play('stamp');
    return el;
  }

  /* ====================================================================== */
  /* 1. Kartki                                                                */
  /* ====================================================================== */
  function cardEl(c, { frenzy = false } = {}) {
    const zones = c.kind === 'tf'
      ? [{ v: true, label: 'TAK', cls: 'is-yes' }, { v: false, label: 'NIE', cls: 'is-no' }]
      : c.options.map((o, i) => ({ v: o.id, label: `${LETTERS[i]}`, text: o.text, cls: 'is-opt' }));
    const el = h('div', { class: ['hm-card', c.kind === 'choice' && 'hm-card--choice', frenzy && 'is-frenzy'], dataset: { hit: 'card', id: c.id } },
      h('p', { class: 'hm-card__q' }, c.kind === 'tf' ? c.text : c.prompt),
      h('div', { class: ['hm-card__zones', c.kind === 'tf' ? 'is-tf' : 'is-abcd'] }, ...zones.map((z, i) => h('div', { class: ['hm-zone', z.cls], dataset: { hit: 'zone', zi: String(i) } },
        h('b', {}, z.label), z.text ? h('span', {}, z.text) : null))),
      frenzy ? null : h('i', { class: 'hm-card__timer' }));
    el._zones = zones;
    return el;
  }
  function placeCard(el, { spread = 1 } = {}) {
    const r = arenaBox();
    arena.append(el);
    const w = el.offsetWidth, hh = el.offsetHeight;
    const x = rand(14, Math.max(16, r.width - w - 14)), y = rand(10, Math.max(12, r.height - hh - 10));
    const rot = rand(-22, 22) * spread;
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, '--rot': `${rot}deg` });
    el._pos = { x, y, rot };
    return el;
  }
  function flyOff(el, ok) {
    el.classList.add('is-gone');
    el.animate(ok
      ? [{ transform: `rotate(var(--rot))` }, { transform: `translate(${rand(-200, 200)}px, -${innerHeight}px) rotate(${rand(-200, 200)}deg) scale(.7)`, opacity: 0.2 }]
      : [{ transform: `rotate(var(--rot))` }, { transform: `translateY(40px) rotate(20deg) scale(.35)`, filter: 'grayscale(1)', opacity: 0 }],
    { duration: ok ? 650 : 520, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' }).onfinish = () => el.remove();
  }

  function cardsStage() {
    return new Promise((resolve) => {
      setStage('cards');
      const queue = P.cards.slice();
      let streak = 0, current = null, cardTimer = null, frenzy = null;
      const CARD_MS = 12000;
      const showStreak = () => { streakEl.hidden = !streak; streakEl.textContent = `🔥 seria ${Math.min(streak, 5)}/5`; };
      setTip('Uderz młotkiem w TAK albo NIE (albo w dobrą literę). Seria 5 = zwolnienie czasu!', true);
      function next() {
        if (!alive) return;
        if (!queue.length && !frenzy) { onHit = null; streakEl.hidden = true; setTip('Kartki zrobione!', true); later(resolve, 900); return; }
        if (streak >= 5 && queue.length >= 2) return startFrenzy();
        const c = queue.shift();
        current = { c, el: placeCard(cardEl(c)) };
        current.el.querySelector('.hm-card__timer').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: CARD_MS, easing: 'linear', fill: 'forwards' });
        sound.play('whoosh');
        clearTimeout(cardTimer);
        const cur = current;
        cardTimer = later(() => { if (current === cur) answer(cur, null, null, null, true); }, CARD_MS);
      }
      async function answer(cur, zi, x, y, timeout = false) {
        if (cur.answered) return;
        cur.answered = true;
        const z = zi === null ? null : cur.el._zones[zi];
        const body = timeout ? { kind: 'card', id: cur.c.id, timeout: true } : { kind: 'card', id: cur.c.id, ...(cur.c.kind === 'tf' ? { value: z.v } : { choice: z.v }) };
        if (z) { stamp(cur.el, x, y, cur.c.kind === 'tf' ? z.label : '✔', z.v === false ? 'is-red' : 'is-ink'); }
        const r = await send(body);
        if (!r) { cur.answered = false; return; }
        addScore(r.ok);
        if (frenzy) frenzy.log.push({ id: cur.c.id, zi, x: x !== null ? local(x, y) : null, ok: r.ok, t: performance.now() - frenzy.t0 });
        if (r.ok) { streak++; sound.play('success'); if (x !== null) floatText(x, y, '+1', 'is-ok'); }
        else { streak = 0; sound.play('error'); if (x !== null) floatText(x, y, timeout ? 'czas!' : '✗', 'is-bad'); }
        if (!frenzy) showStreak();
        later(() => flyOff(cur.el, r.ok), 240);
        if (frenzy) { frenzy.left--; if (frenzy.left === 0) endFrenzy(true); }
        else if (cur === current) { current = null; later(next, 520); }
      }
      onHit = (x, y, tgt) => {
        if (!tgt) return;
        const card = tgt.closest('.hm-card'); if (!card || card.classList.contains('is-gone')) return;
        const cur = frenzy ? frenzy.cards.find((c) => c.el === card) : current?.el === card ? current : null;
        if (!cur) return;
        if (tgt.dataset.hit === 'zone') answer(cur, Number(tgt.dataset.zi), x, y);
        else { card.animate([{ translate: '0 0' }, { translate: '0 -6px' }, { translate: '0 0' }], { duration: 200 }); floatText(x, y, cur.c.kind === 'tf' ? 'Uderz w TAK albo NIE!' : 'Uderz w literę!', 'is-hint'); }
      };
      /* --- seria 5: zwolnienie czasu --- */
      function startFrenzy() {
        streak = 0; showStreak();
        const take = queue.splice(0, 5);
        frenzy = { cards: [], left: take.length, log: [], t0: 0, items: take };
        root.classList.add('is-slowmo');
        sound.play('slowmo');
        setTip(`⏱ CZAS ZWALNIA! ${take.length} kartek – masz 20 sekund!`, true);
        const clock = h('div', { class: 'hm-frenzy-clock hm-ui' }, '20');
        arena.append(clock);
        frenzy.clock = clock;
        later(() => {
          frenzy.t0 = performance.now();
          take.forEach((c, i) => later(() => {
            const el = placeCard(cardEl(c, { frenzy: true }), { spread: 1.2 });
            el.style.zIndex = String(10 + i);
            frenzy.cards.push({ c, el });
          }, i * 120));
          const end = performance.now() + 20000;
          frenzy.iv = setInterval(() => {
            const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
            clock.textContent = String(left);
            clock.classList.toggle('is-low', left <= 5);
            if (left <= 0) endFrenzy(false);
          }, 200);
        }, 900);
      }
      async function endFrenzy(okAll) {
        const f = frenzy; if (!f || f.over) return; f.over = true;
        clearInterval(f.iv);
        root.classList.remove('is-slowmo');
        f.clock.remove();
        if (!okAll) {
          setTip('Czas minął! Nie wszystkie kartki zdążyłeś(-aś) uderzyć.', true);
          for (const c of f.cards) if (!c.answered) { c.answered = true; const r = await send({ kind: 'card', id: c.c.id, timeout: true }); if (r) addScore(false); flyOff(c.el, false); }
          // kartki, które nie zdążyły się pojawić
          for (const c of f.items.filter((x) => !f.cards.some((y) => y.c.id === x.id))) { const r = await send({ kind: 'card', id: c.id, timeout: true }); if (r) addScore(false); }
          frenzy = null; later(next, 900); return;
        }
        setTip('WSZYSTKIE! Zobacz powtórkę…', true);
        await sleep(700);
        await replay(f);
        frenzy = null; later(next, 400);
      }
      next();
    });
  }

  /* --- INSTANT REPLAY: ten sam układ kartek, młotek uderza jedna po drugiej, bez zastanawiania --- */
  async function replay(f) {
    const page = h('div', { class: 'hm-replay' },
      h('div', { class: 'hm-replay__bar' }, h('i', { class: 'hm-rec' }), 'INSTANT REPLAY', h('span', {}, 'REAL TIME')),
      h('div', { class: 'hm-replay__grain' }), h('div', { class: 'hm-replay__box' }));
    pages.append(page);
    const box = page.querySelector('.hm-replay__box');
    pages.classList.add('is-replay');
    sound.play('whoosh');
    await sleep(reduced() ? 50 : 750);
    const order = f.log.filter((x) => x.x);
    const cards = new Map();
    f.cards.forEach(({ c, el }, i) => {
      const k = cardEl(c, { frenzy: true });
      Object.assign(k.style, { left: el.style.left, top: el.style.top, zIndex: String(10 + i), '--rot': el.style.getPropertyValue('--rot') });
      box.append(k); cards.set(c.id, k);
    });
    page.classList.add('is-rolling');
    await sleep(500);
    for (const step of order) {
      const k = cards.get(step.id); if (!k) continue;
      const br = box.getBoundingClientRect();
      const x = br.left + step.x.x, y = br.top + step.x.y;
      await swing(x, y, { power: 2 });
      const z = k._zones[step.zi];
      stamp(k, x, y, z?.label === 'TAK' || z?.label === 'NIE' ? z.label : '✔', z?.v === false ? 'is-red' : 'is-ink');
      const flash = h('i', { class: 'hm-speed', style: { left: `${step.x.x}px`, top: `${step.x.y}px` } });
      box.append(flash); setTimeout(() => flash.remove(), 400);
      setTimeout(() => flyOff(k, step.ok), 140);
      await sleep(reduced() ? 60 : 260);
    }
    await sleep(500);
    const big = h('div', { class: 'hm-replay__wow' }, 'NIEPRAWDOPODOBNE!');
    page.append(big); sound.play('fanfare');
    await sleep(reduced() ? 300 : 1500);
    pages.classList.remove('is-replay');
    await sleep(reduced() ? 50 : 700);
    page.remove();
  }

  /* ====================================================================== */
  /* 2. Żuki                                                                  */
  /* ====================================================================== */
  function bugSvg(color, letter) {
    const legs = [0, 1, 2].map((i) => `<g class="bg-leg bg-leg--l${i}"><path d="M-10 ${-8 + i * 9} L-26 ${-16 + i * 12} L-32 ${-6 + i * 10}"/></g><g class="bg-leg bg-leg--r${i}"><path d="M10 ${-8 + i * 9} L26 ${-16 + i * 12} L32 ${-6 + i * 10}"/></g>`).join('');
    return `<svg viewBox="-40 -48 80 90" aria-hidden="true">
      <g class="bg-legs" stroke="#2b1d12" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">${legs}</g>
      <path class="bg-ant" d="M-5 -30 Q-12 -44 -20 -46 M5 -30 Q12 -44 20 -46" stroke="#2b1d12" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <g class="bg-wings"><ellipse cx="-14" cy="6" rx="12" ry="24" fill="#d6f1ff" opacity=".7" stroke="#7fb8d6"/><ellipse cx="14" cy="6" rx="12" ry="24" fill="#d6f1ff" opacity=".7" stroke="#7fb8d6"/></g>
      <g class="bg-shell bg-shell--l"><path d="M0 -16 C-22 -16 -22 34 0 34 Z" fill="${color}" stroke="#2b1d12" stroke-width="3"/></g>
      <g class="bg-shell bg-shell--r"><path d="M0 -16 C22 -16 22 34 0 34 Z" fill="${color}" stroke="#2b1d12" stroke-width="3"/></g>
      <path d="M0 -15 V33" stroke="#2b1d12" stroke-width="2"/>
      <circle cx="-8" cy="20" r="3" fill="#2b1d12" opacity=".5"/><circle cx="9" cy="2" r="2.5" fill="#2b1d12" opacity=".5"/>
      <text class="bg-letter" x="0" y="15" text-anchor="middle">${letter}</text>
      <circle cx="0" cy="-22" r="11" fill="#2b1d12"/>
      <g class="bg-eye"><circle cx="-5" cy="-26" r="5" fill="#fff"/><circle class="bg-pupil" cx="-5" cy="-26" r="2.4" fill="#111"/></g>
      <g class="bg-eye"><circle cx="5" cy="-26" r="5" fill="#fff"/><circle class="bg-pupil" cx="5" cy="-26" r="2.4" fill="#111"/></g>
    </svg>`;
  }
  function bugsStage() {
    return new Promise((resolve) => {
      setStage('bugs');
      const B = P.bugs;
      const COLORS = ['#e8423a', '#2fa84f', '#f2b705', '#3a7bd5', '#a24bd0', '#ff7f27', '#18a7a7', '#d94f8c'];
      const legend = h('div', { class: 'hm-legend hm-ui' }, h('b', {}, 'Żuki'), ...B.answers.map((a) => h('span', { dataset: { id: a.id } }, h('i', {}, a.letter), ` = ${a.text}`)));
      const qBox = h('div', { class: 'hm-bugq hm-ui' });
      arena.append(legend, qBox);
      const r0 = arenaBox();
      const bugs = B.answers.map((a, i) => {
        const el = h('div', { class: 'hm-bug', dataset: { hit: 'bug', id: a.id } });
        el.innerHTML = bugSvg(COLORS[i % COLORS.length], a.letter);
        arena.append(el);
        return { a, el, x: rand(60, r0.width - 60), y: rand(110, r0.height - 70), ang: rand(0, Math.PI * 2), sp: rand(40, 70), turn: 0, gone: false, dizzy: 0 };
      });
      let qi = 0, raf = 0, last = performance.now();
      let look = { x: 0, y: 0 };
      eyesTo = (x, y) => { look = { x, y }; };
      function loop(t) {
        const dt = Math.min(0.05, (t - last) / 1000); last = t;
        const r = arenaBox();
        for (const b of bugs) {
          if (b.gone) continue;
          b.turn += rand(-2.2, 2.2) * dt; b.turn = clamp(b.turn, -1.6, 1.6);
          b.ang += b.turn * dt;
          const sp = b.sp * (b.dizzy > 0 ? 2.4 : 1) * (root.classList.contains('is-slowmo') ? 0.3 : 1);
          b.x += Math.cos(b.ang) * sp * dt; b.y += Math.sin(b.ang) * sp * dt;
          const m = 46;
          if (b.x < m) { b.x = m; b.ang = Math.PI - b.ang; } if (b.x > r.width - m) { b.x = r.width - m; b.ang = Math.PI - b.ang; }
          if (b.y < 96) { b.y = 96; b.ang = -b.ang; } if (b.y > r.height - m) { b.y = r.height - m; b.ang = -b.ang; }
          b.dizzy -= dt;
          b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${(b.ang * 180) / Math.PI + 90}deg)`;
          // źrenice: w stronę młotka (w układzie żuka)
          const dx = look.x - (r.left + b.x), dy = look.y - (r.top + b.y);
          const a2 = Math.atan2(dy, dx) - (b.ang + Math.PI / 2);
          const ox = Math.cos(a2) * 1.8, oy = Math.sin(a2) * 1.8;
          b.el.querySelectorAll('.bg-pupil').forEach((p, k) => { p.setAttribute('cx', String((k ? 5 : -5) + ox)); p.setAttribute('cy', String(-26 + oy)); });
        }
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
      const showQ = () => {
        const q = B.questions[qi];
        qBox.replaceChildren(h('small', {}, `Pytanie ${qi + 1} z ${B.questions.length}`), h('b', {}, q.prompt));
        qBox.classList.remove('is-pop'); void qBox.offsetWidth; qBox.classList.add('is-pop');
      };
      setTip('Uderz żuka z dobrą odpowiedzią – litery są w ściądze na dole. Żuki nie stoją w miejscu!', true);
      showQ();
      function flyAway(b, delay = 0) {
        b.gone = true;
        legend.querySelector(`[data-id="${b.a.id}"]`)?.classList.add('is-gone');
        setTimeout(() => {
          b.el.classList.add('is-fly'); sound.play('buzz');
          const ang = rand(0, Math.PI * 2), d = Math.max(innerWidth, innerHeight);
          b.el.animate([{ transform: b.el.style.transform }, { transform: `translate(${b.x + Math.cos(ang) * 60}px, ${b.y - 80}px) rotate(${rand(-60, 60)}deg) scale(1.5)`, offset: 0.35 },
            { transform: `translate(${b.x + Math.cos(ang) * d}px, ${b.y + Math.sin(ang) * d - 200}px) rotate(${rand(-300, 300)}deg) scale(1.2)` }],
          { duration: 1500, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'forwards' }).onfinish = () => b.el.remove();
        }, delay);
      }
      let busy = false;
      onHit = async (x, y, tgt) => {
        if (busy || !tgt || tgt.dataset.hit !== 'bug') return;
        const b = bugs.find((z) => z.el === tgt); if (!b || b.gone) return;
        busy = true;
        const q = B.questions[qi];
        const r = await send({ kind: 'bug', q: q.id, answer: b.a.id });
        busy = false;
        if (!r) return;
        if (r.ok) {
          if (r.first) addScore(true);
          sound.play('success'); floatText(x, y, r.first ? '+1' : 'OK', 'is-ok');
          flyAway(b);
          qi++;
          if (qi >= B.questions.length) {
            qBox.replaceChildren(h('b', {}, 'Wszystkie pytania! Reszta żuków ucieka…'));
            bugs.filter((z) => !z.gone).forEach((z, i) => flyAway(z, 300 + i * 200));
            later(() => { cancelAnimationFrame(raf); eyesTo = () => {}; legend.remove(); qBox.remove(); onHit = null; resolve(); }, 2200);
          } else later(showQ, 400);
        } else {
          if (!q.missed) { q.missed = true; addScore(false); }
          sound.play('error'); floatText(x, y, '✗', 'is-bad');
          b.dizzy = 1.2; b.el.classList.remove('is-dizzy'); void b.el.offsetWidth; b.el.classList.add('is-dizzy');
        }
      };
    });
  }

  /* ====================================================================== */
  /* 3. Pary – zdrapka                                                        */
  /* ====================================================================== */
  function pairsStage() {
    return new Promise((resolve) => {
      setStage('pairs');
      const r = arenaBox();
      const behind = h('div', { class: 'hm-behind' }, h('div', {}, h('b', {}, 'ROZBITE!'), h('span', {}, P.stages.includes('test') ? 'Następny etap: TEST' : 'Następny etap')));
      const cv = h('canvas', { class: 'hm-cover' });
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      // „szyba / zdrapka”: srebrna folia z połyskiem
      const g = ctx.createLinearGradient(0, 0, r.width, r.height);
      g.addColorStop(0, '#9aa3ad'); g.addColorStop(0.45, '#e9edf1'); g.addColorStop(0.55, '#c3cad1'); g.addColorStop(1, '#8a939c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, r.width, r.height);
      ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
      for (let i = 0; i < 1400; i++) ctx.fillRect(Math.random() * r.width, Math.random() * r.height, 2, 2);
      ctx.globalAlpha = 0.12; ctx.font = '700 22px system-ui'; ctx.fillStyle = '#5b636b';
      for (let y = 40; y < r.height; y += 70) for (let x = (y / 70) % 2 ? 0 : 60; x < r.width; x += 170) ctx.fillText('HAMMER', x, y);
      ctx.globalAlpha = 1;
      arena.append(behind, cv);
      // kafelki w losowych miejscach (siatka z odchyleniem – bez nachodzenia)
      const items = P.pairs;
      const cols = Math.max(2, Math.min(4, Math.floor(r.width / 190))), rows = Math.ceil(items.length / cols);
      const cells = shuffle(Array.from({ length: cols * Math.max(rows, Math.ceil(items.length / cols) + 1) }, (_, i) => i)).slice(0, items.length);
      const cw = r.width / cols, ch = (r.height - 40) / Math.max(rows + 1, 2);
      const tiles = items.map((it, i) => {
        const c = cells[i] % cols, rr = Math.floor(cells[i] / cols);
        const el = h('div', { class: ['hm-tile', it.side === 'L' ? 'is-l' : 'is-r'], dataset: { hit: 'tile', id: it.id } }, it.text);
        el.style.left = `${c * cw + cw / 2 + rand(-cw * 0.18, cw * 0.18)}px`;
        el.style.top = `${30 + rr * ch + ch / 2 + rand(-ch * 0.15, ch * 0.15)}px`;
        el.style.setProperty('--rot', `${rand(-10, 10)}deg`);
        arena.append(el);
        return el;
      });
      const zap = svg('svg', { class: 'hm-zap', viewBox: `0 0 ${r.width} ${r.height}` });
      arena.append(zap);
      setTip('Uderz jedną rzecz, potem drugą, która do niej pasuje. Para wybucha i zdrapuje ekran!', true);
      let first = null, left = items.length / 2, busy = false, smashing = false, hits = 0;
      function hole(x, y, rad) {
        ctx.save(); ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        const n = 14;
        for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = rad * rand(0.65, 1.15); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        ctx.fill(); ctx.restore();
      }
      function cracks(x, y, rad) {
        ctx.save(); ctx.strokeStyle = 'rgba(40,46,52,.75)'; ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          let a = rand(0, Math.PI * 2), px = x, py = y; ctx.beginPath(); ctx.moveTo(px, py);
          for (let k = 0; k < 5; k++) { a += rand(-0.5, 0.5); px += Math.cos(a) * rad * 0.35; py += Math.sin(a) * rad * 0.35; ctx.lineTo(px, py); }
          ctx.stroke();
        }
        ctx.restore();
      }
      const center = (el) => { const b = el.getBoundingClientRect(), a = arenaBox(); return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 }; };
      onHit = async (x, y, tgt) => {
        const p = local(x, y);
        if (smashing) {
          hits++; hole(p.x, p.y, rand(60, 95)); cracks(p.x, p.y, 120); sound.play('crack'); shake(pages, 7, 220);
          if (hits >= 9) {
            smashing = false; onHit = null;
            sound.play('shatter');
            cv.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.15) rotate(2deg)' }], { duration: 650, fill: 'forwards' });
            burst(arena, r.width / 2, r.height / 2, { n: 50, colors: ['#e9edf1', '#c3cad1', '#9aa3ad'], size: [6, 16], dist: [100, 400], shape: 'shard', ms: [600, 1100], gravity: 200 });
            setTip('Ekran rozbity!', true);
            later(() => { cv.remove(); behind.remove(); zap.remove(); resolve(); }, 1300);
          }
          return;
        }
        if (busy || !tgt || tgt.dataset.hit !== 'tile' || tgt.classList.contains('is-gone')) return;
        if (!first) { first = tgt; tgt.classList.add('is-sel'); sound.play('pop'); return; }
        if (first === tgt) { tgt.classList.remove('is-sel'); first = null; return; }
        const a = first, b = tgt; first = null; busy = true;
        b.classList.add('is-sel');
        const res = await send({ kind: 'pair', a: a.dataset.id, b: b.dataset.id });
        busy = false;
        if (!res) { a.classList.remove('is-sel'); b.classList.remove('is-sel'); return; }
        if (res.ok) {
          addScore(true);
          const pa = center(a), pb = center(b);
          const line = svg('path', { d: `M${pa.x} ${pa.y} L${(pa.x + pb.x) / 2 + rand(-30, 30)} ${(pa.y + pb.y) / 2 + rand(-30, 30)} L${pb.x} ${pb.y}`, class: 'hm-zap__l' });
          zap.append(line); setTimeout(() => line.remove(), 420);
          sound.play('boom');
          for (const [el, pt] of [[a, pa], [b, pb]]) {
            el.classList.add('is-gone');
            burst(arena, pt.x, pt.y, { n: 26, colors: ['#ffd23f', '#ff7b00', '#fff', '#ff3d6e'], size: [4, 9], dist: [40, 160] });
            hole(pt.x, pt.y, 95); cracks(pt.x, pt.y, 110);
            setTimeout(() => el.remove(), 300);
          }
          shake(pages, 9, 320);
          left--;
          if (left === 0) {
            later(() => { smashing = true; setTip('Uderz w ekran (kilka razy), żeby go rozbić!', true, true); }, 600);
          }
        } else {
          addScore(false);
          sound.play('error');
          for (const el of [a, b]) { el.classList.add('is-bad'); setTimeout(() => el.classList.remove('is-bad', 'is-sel'), 500); }
          floatText(x, y, '✗ to nie para', 'is-bad');
        }
      };
    });
  }

  /* ====================================================================== */
  /* 4. Test młotkiem                                                         */
  /* ====================================================================== */
  function testStage() {
    return new Promise((resolve) => {
      setStage('test');
      const marks = {};
      const paper = h('div', { class: 'hm-paper' },
        h('header', {}, h('h2', {}, 'SPRAWDZIAN'), h('p', {}, `Imię i nazwisko: `, h('i', {}, `${api.user?.firstName || 'Uczeń'} ${api.user?.lastName || ''}`.trim()), h('span', {}, new Date().toLocaleDateString('pl-PL')))),
        h('ol', { class: 'hm-paper__qs' }, ...P.test.map((q) => h('li', { dataset: { q: q.id } }, h('p', {}, q.prompt),
          h('div', { class: 'hm-paper__opts' }, ...q.options.map((o, i) => h('div', { class: 'hm-opt', dataset: { hit: 'opt', q: q.id, o: o.id } }, h('b', {}, LETTERS[i]), h('span', {}, o.text))))))));
      const wrap = h('div', { class: 'hm-paperwrap' }, paper);
      arena.append(wrap);
      setTip('Uderz młotkiem w literę odpowiedzi. To nie przyciski – to kartka!', true);
      let grading = false;
      onHit = (x, y, tgt) => {
        if (grading || !tgt || tgt.dataset.hit !== 'opt') return;
        const q = tgt.dataset.q;
        paper.querySelectorAll(`.hm-opt[data-q="${q}"]`).forEach((o) => { o.classList.remove('is-mark'); o.querySelector('.hm-ink')?.remove(); });
        tgt.classList.add('is-mark');
        const ink = svg('svg', { class: 'hm-ink', viewBox: '0 0 60 40', preserveAspectRatio: 'none' });
        ink.append(svg('path', { d: `M8 22 C 6 6, 52 2, 54 18 S 20 40, 6 26 L ${rand(14, 22)} ${rand(10, 14)}` }));
        tgt.querySelector('b').append(ink);
        marks[q] = tgt.dataset.o;
        sound.play('pop');
        if (Object.keys(marks).length === P.test.length) gradeIt();
      };
      async function gradeIt() {
        grading = true; onHit = null;
        setTip('Sprawdzam…', true);
        await sleep(700);
        const r = await send({ kind: 'test', answers: marks });
        if (!r) { grading = false; return; }
        for (const q of P.test) {
          const li = paper.querySelector(`li[data-q="${q.id}"]`);
          const res = r.results[q.id];
          addScore(res.ok);
          li.append(h('span', { class: ['hm-mark', res.ok ? 'is-ok' : 'is-bad'] }, res.ok ? '✓' : '✗'));
          if (!res.ok) li.querySelector(`.hm-opt[data-o="${res.correct}"]`)?.classList.add('is-correct');
          sound.play(res.ok ? 'pop' : 'error');
          await sleep(320);
        }
        const g = gradeFor(r.pct);
        const circle = h('div', { class: ['hm-pct', r.pct >= 55 ? 'is-good' : 'is-bad'], dataset: { hit: 'pct' } }, h('b', {}, `${r.pct}%`), h('span', {}, `${r.good}/${r.total} · ocena ${g}`), h('small', {}, GRADE_NAMES[g - 1]));
        wrap.append(circle);
        sound.play('stamp');
        setTip('Uderz w swój procent, żeby iść dalej!', true, true);
        onHit = (x2, y2, tgt2) => {
          if (!tgt2 || tgt2.dataset.hit !== 'pct') { floatText(x2, y2, 'Uderz w procent!', 'is-hint'); return; }
          onHit = null;
          circle.classList.add('is-smash'); sound.play('crack'); shake(pages, 10, 300);
          const a = local(x2, y2); burst(arena, a.x, a.y, { n: 30, colors: ['#fff', '#ffd23f', '#ff7b00'], dist: [40, 160] });
          later(() => { wrap.animate([{ transform: 'none' }, { transform: 'translateY(110%) rotate(8deg)' }], { duration: 600, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' }); }, 300);
          later(() => { wrap.remove(); resolve(); }, 950);
        };
      }
    });
  }

  /* ====================================================================== */
  /* 5. APPROVED / DECLINED + podpis                                          */
  /* ====================================================================== */
  function approveStage() {
    return new Promise((resolve) => {
      setStage('approve');
      hammer.classList.add('is-stamper');
      setSide('approve', false);
      const sideUi = h('div', { class: 'hm-side hm-ui' },
        h('button', { class: 'hm-side__opt is-on', type: 'button', dataset: { side: 'approve' }, onClick: () => setSide('approve') }, h('i', {}, 'L'), 'APPROVED'),
        h('button', { class: 'hm-side__opt', type: 'button', dataset: { side: 'decline' }, onClick: () => setSide('decline') }, h('i', {}, 'P'), 'DECLINED'));
      arena.append(sideUi);
      const piles = h('div', { class: 'hm-piles hm-ui' }, h('span', { class: 'is-a' }, 'APPROVED: ', h('b', {}, '0')), h('span', { class: 'is-d' }, 'DECLINED: ', h('b', {}, '0')));
      arena.append(piles);
      setTip('Prawdziwe – lewym przyciskiem (APPROVED). Fałszywe – prawym (DECLINED). Na telefonie przełącz stronę młotka na dole.', true);
      const list = P.approve.slice();
      let cur = null, n = 0, cntA = 0, cntD = 0;
      function next() {
        if (!list.length) return sign();
        const s = list.shift(); n++;
        const el = h('div', { class: 'hm-doc', dataset: { hit: 'doc' } },
          h('header', {}, h('b', {}, 'WNIOSEK'), h('span', {}, `nr ${n}/${P.approve.length}`)),
          h('p', {}, s.text), h('footer', {}, 'Zatwierdzić?'));
        arena.append(el);
        el.animate([{ transform: 'translate(-50%, -160%) rotate(-12deg)' }, { transform: 'translate(-50%, -50%) rotate(-2deg)' }], { duration: 420, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'forwards' });
        sound.play('whoosh');
        cur = { s, el };
      }
      const showFace = (s) => { hammer.classList.toggle('is-decline', s === 'decline'); faceLbl.textContent = s === 'decline' ? 'D' : 'A'; };
      onHit = async (x, y, tgt, e) => {
        if (!cur || !tgt || tgt.dataset.hit !== 'doc') { showFace(side); return; }
        // prawy przycisk = zawsze DECLINED; lewy / dotyk = strona wybrana na młotku (domyślnie APPROVED)
        const use = e?.button === 2 ? 'decline' : side;
        showFace(side);
        const c = cur; cur = null;
        stamp(c.el, x, y, use === 'approve' ? 'APPROVED' : 'DECLINED', use === 'approve' ? 'is-approved' : 'is-declined');
        shake(pages, 4, 200);
        const r = await send({ kind: 'approve', id: c.s.id, value: use === 'approve' });
        if (r) addScore(r.ok);
        if (use === 'approve') cntA++; else cntD++;
        piles.querySelector('.is-a b').textContent = String(cntA); piles.querySelector('.is-d b').textContent = String(cntD);
        later(() => {
          c.el.animate([{ transform: 'translate(-50%, -50%) rotate(-2deg)' }, { transform: `translate(${use === 'approve' ? '120%' : '-220%'}, -40%) rotate(${use === 'approve' ? 25 : -25}deg)`, opacity: 0.3 }],
            { duration: 520, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' }).onfinish = () => c.el.remove();
          later(next, 360);
        }, 450);
      };
      onHit.before = (e) => showFace(e.button === 2 ? 'decline' : side);
      function sign() {
        onHit = null;
        hammer.classList.add('is-hidden');
        sideUi.remove(); piles.remove();
        setTip('Na koniec podpisz się – narysuj szlaczek palcem albo myszką.', true, true);
        const cv = h('canvas', { class: 'hm-sig__cv' });
        const doc = h('div', { class: 'hm-doc hm-doc--sig' }, h('header', {}, h('b', {}, 'PROTOKÓŁ KOŃCOWY'), h('span', {}, new Date().toLocaleDateString('pl-PL'))),
          h('p', {}, 'Oświadczam, że wszystkie wnioski zostały rozpatrzone młotkiem.'), h('div', { class: 'hm-sig' }, cv, h('span', {}, 'podpis')));
        arena.append(doc);
        doc.animate([{ transform: 'translate(-50%, -160%)' }, { transform: 'translate(-50%, -50%)' }], { duration: 420, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'forwards' });
        requestAnimationFrame(() => {
          const b = cv.getBoundingClientRect();
          const dpr = Math.min(2, devicePixelRatio || 1);
          cv.width = b.width * dpr; cv.height = b.height * dpr;
          const c2 = cv.getContext('2d'); c2.scale(dpr, dpr); c2.lineCap = 'round'; c2.lineJoin = 'round'; c2.strokeStyle = '#1b2a8a'; c2.lineWidth = 3.2;
          let drawing = false, len = 0, lastP = null, finishedSig = false;
          onHit = { custom: (e) => {
            if (finishedSig || !e.target.closest('.hm-sig')) return;
            drawing = true; root.setPointerCapture?.(e.pointerId);
            const bb = cv.getBoundingClientRect(); lastP = { x: e.clientX - bb.left, y: e.clientY - bb.top };
          } };
          const move = (e) => {
            if (!drawing) return;
            const bb = cv.getBoundingClientRect(); const p = { x: e.clientX - bb.left, y: e.clientY - bb.top };
            c2.beginPath(); c2.moveTo(lastP.x, lastP.y); c2.lineTo(p.x, p.y); c2.stroke();
            len += Math.hypot(p.x - lastP.x, p.y - lastP.y); lastP = p;
            if (Math.random() < 0.15) sound.play('type');
          };
          const up = () => {
            if (!drawing) return; drawing = false;
            if (len > 120 && !finishedSig) {
              finishedSig = true; onHit = null; root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up);
              setTip('Podpisano. Chwila prawdy…', true); sound.play('success');
              later(() => { doc.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -60%) scale(.9)' }], { duration: 500, fill: 'forwards' }).onfinish = () => doc.remove(); hammer.classList.remove('is-hidden', 'is-stamper', 'is-decline'); resolve(); }, 900);
            } else if (!finishedSig) setTip('Podpis jest za krótki – narysuj dłuższy szlaczek.', true);
          };
          root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
        });
      }
      next();
    });
  }

  /* ====================================================================== */
  /* Chwila prawdy                                                            */
  /* ====================================================================== */
  let finished = false;
  async function truth() {
    setStage('__end');
    onHit = null;
    setTip('');
    const res = await api.finish().catch((e) => { toast(e.message, 'error'); return null; });
    finished = true;
    const u = api.user || {};
    const me = h('div', { class: 'hm-me' },
      avatarEl({ ...(u.card || {}), firstName: u.firstName || 'Ty', lastName: u.lastName || '' }, { size: 120 }),
      h('b', {}, u.role === 'student' ? `${u.firstName} ${u.lastName}` : 'Ty (podgląd)'),
      h('span', { class: 'hm-me__logo' }, 'HAMMER', h('i', {}, 'GAME')));
    const stageEl = h('div', { class: 'hm-truth' }, h('p', { class: 'hm-truth__t' }, 'CHWILA PRAWDY'), me);
    arena.replaceChildren(stageEl);
    root.classList.add('is-truth');
    hammer.classList.add('is-hidden');
    // werble
    for (let i = 0; i < 14; i++) setTimeout(() => sound.play('tick'), i * (110 - i * 4));
    await sleep(reduced() ? 200 : 1500);
    const big = h('div', { class: 'hm-bighammer' });
    big.append(rig.cloneNode(true));
    stageEl.append(big);
    await sleep(reduced() ? 50 : 520);
    sound.play('thud'); sound.play('boom');
    shake(root, 18, 600);
    const win = !!res?.win;
    root.classList.add(win ? 'is-approved' : 'is-declined');
    const st = h('div', { class: ['hm-verdict', win ? 'is-approved' : 'is-declined'] }, win ? 'APPROVED' : 'DECLINED');
    me.append(st);
    const pct = res?.pct ?? 0;
    await sleep(500);
    if (win) { sound.play('happy'); celebrate({ count: 200 }); } else sound.play('sad');
    stageEl.append(h('div', { class: 'hm-result' },
      h('p', { class: 'hm-result__pct' }, `${pct}%`),
      h('p', {}, win ? 'Zaliczone! Młotek nie miał litości – dla pytań.' : 'Poniżej 55%. Młotek mówi: jeszcze raz!'),
      api.preview ? h('p', { class: 'hm-result__pv' }, 'Podgląd nauczyciela – punkty nie są przyznawane.')
        : win ? h('p', { class: 'hm-result__pts' }, res?.points ? `+${res.points} pkt!` : 'Punkty za tę grę już masz – to była runda dla treningu.') : null,
      h('div', { class: 'hm-result__acts' },
        h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: () => api.again() }, icon('repeat'), 'Zagraj jeszcze raz'),
        h('button', { class: 'btn btn--ghost btn--lg', type: 'button', onClick: () => api.exit() }, api.preview ? 'Wróć do edytora' : 'Wyjdź'))));
  }

  /* ---------- Przebieg ---------- */
  const RUN = { cards: cardsStage, bugs: bugsStage, pairs: pairsStage, test: testStage, approve: approveStage };
  async function main() {
    await sleep(300);
    setTip('Chwyć młotek! Kliknij (albo dotknij), żeby uderzyć.', true);
    await sleep(1400);
    for (const s of P.stages) {
      if (!alive) return;
      arena.replaceChildren();
      await RUN[s]();
      await sleep(400);
    }
    if (alive) await truth();
  }
  main().catch((e) => { console.error(e); toast('Coś poszło nie tak w grze.', 'error'); });
  requestAnimationFrame(() => root.focus({ preventScroll: true }));

  function stop() { alive = false; timers.forEach(clearTimeout); timers.clear(); }
  return () => { stop(); root.remove(); };
}

function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
void pick;
