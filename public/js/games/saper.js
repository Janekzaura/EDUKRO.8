// SAPER – rozbrajanie bomby w stylu „Painta”: niechlujne kreski, stickman z kilkoma klatkami animacji.
// Zdarzenia (kolejność ustala nauczyciel, mogą się powtarzać): kabel, palnik, trojan, krzyżówka + oprogramowanie, pliki.
// Na koniec zawsze katana. Jeden błąd = wybuch. Odpowiedzi sprawdza serwer (api.act).
import { h, icon, toast } from '../ui.js';
import * as sound from '../sound.js';
import { WIDGETS } from '../views/qplay.js';
import { celebrate } from '../celebrate.js';
import { sleep, rand, pick, svg, shake, burst, confirmExit, localPoint, distToSeg, reduced, clamp } from './common.js';
import { SAPER_EVENT } from '../shared/game-rules.js';

/* ====================================================================== */
/* Rysunki „z Painta”                                                      */
/* ====================================================================== */
const INK = '#111';
const head = (face = 'smile', burnt = false) => `
  <circle cx="70" cy="48" r="22" fill="${burnt ? '#222' : '#fff'}" stroke="${INK}" stroke-width="5"/>
  ${burnt ? '<path d="M56 26 l-6 -14 M66 24 l-2 -16 M76 24 l3 -15 M86 28 l8 -12" stroke="#111" stroke-width="4" stroke-linecap="round"/>'
    : '<path d="M45 44 Q70 10 95 44 Z" fill="#3cb043" stroke="#111" stroke-width="5" stroke-linejoin="round"/><path d="M40 45 H100" stroke="#111" stroke-width="5" stroke-linecap="round"/><circle cx="70" cy="27" r="5" fill="#ffe14d" stroke="#111" stroke-width="3"/>'}
  ${burnt ? '<path d="M58 46 l8 8 M66 46 l-8 8 M74 46 l8 8 M82 46 l-8 8" stroke="#fff" stroke-width="3"/>'
    : face === 'blink' ? '<path d="M59 51 h7 M75 51 h7" stroke="#111" stroke-width="4" stroke-linecap="round"/>'
      : '<circle cx="62" cy="51" r="3.5" fill="#111"/><circle cx="79" cy="51" r="3.5" fill="#111"/>'}
  ${burnt ? '<path d="M60 62 q10 -4 20 0" stroke="#fff" stroke-width="3" fill="none"/>'
    : face === 'open' ? '<ellipse cx="70" cy="62" rx="7" ry="6" fill="#111"/>'
      : face === 'focus' ? '<path d="M62 61 h14" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M74 61 q4 5 7 1" fill="#ff7aa2" stroke="#111" stroke-width="2"/>'
        : face === 'big' ? '<path d="M58 58 Q70 74 82 58 Z" fill="#111"/>' : '<path d="M60 59 Q70 67 80 59" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>'}`;
const limb = (pts) => `<polyline points="${pts}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
const body = (dx = 0) => `<path d="M70 70 L${70 + dx} 150" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
const katanaAt = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#d9dde3" stroke-width="7" stroke-linecap="round"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="#111" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <path d="M${x1 - (x2 - x1) * 0.18} ${y1 - (y2 - y1) * 0.18} L${x1} ${y1}" stroke="#7a2e12" stroke-width="9" stroke-linecap="round"/>`;
const sweat = (o = 0) => `<path d="M${100 + o} ${30 - o} q5 9 0 12 q-5 -3 0 -12z" fill="#57b7ff" stroke="#111" stroke-width="2"/><path d="M${36 - o} ${38 + o} q5 9 0 12 q-5 -3 0 -12z" fill="#57b7ff" stroke="#111" stroke-width="2"/>`;
const POSES = {
  idle1: () => head() + body() + limb('70,90 52,128') + limb('70,90 88,128') + limb('70,150 54,215') + limb('70,150 86,215'),
  idle2: () => head('blink') + body() + limb('70,90 50,126') + limb('70,90 90,127') + limb('70,150 55,215') + limb('70,150 85,215'),
  work1: () => head('focus') + body(2) + limb('70,90 100,104 128,96') + limb('70,90 92,118 124,112') + limb('72,150 56,215') + limb('72,150 90,215'),
  work2: () => head('focus') + body(3) + limb('70,90 102,100 132,104') + limb('70,90 95,114 126,120') + limb('73,150 57,215') + limb('73,150 90,215'),
  panic1: () => head('open') + body() + limb('70,90 46,58 40,30') + limb('70,90 96,58 102,30') + limb('70,150 44,213') + limb('70,150 96,213') + sweat(0),
  panic2: () => `<g transform="translate(4 -3)">${head('open') + body(-2) + limb('70,90 44,60 34,36') + limb('70,90 98,56 108,34') + limb('68,150 40,213') + limb('68,150 98,213') + sweat(4)}</g>`,
  cheer1: () => head('big') + body() + limb('70,90 44,50 36,24') + limb('70,90 96,50 104,24') + limb('70,150 54,215') + limb('70,150 86,215'),
  cheer2: () => `<g transform="translate(0 -12)">${head('big') + body() + limb('70,90 42,52 30,30') + limb('70,90 98,52 110,30') + limb('70,150 50,205') + limb('70,150 90,205')}</g>`,
  katana1: () => head('focus') + body() + limb('70,90 88,62 98,40') + limb('70,90 92,70 100,44') + limb('70,150 52,215') + limb('70,150 90,215') + katanaAt(100, 40, 168, -26),
  katana2: () => head('big') + body(6) + limb('70,90 104,110 124,118') + limb('70,90 100,118 122,122') + limb('74,150 50,215') + limb('74,150 100,214') + katanaAt(124, 118, 210, 150),
  burnt: () => head('smile', true) + body() + limb('70,90 50,128') + limb('70,90 90,128') + limb('70,150 54,215') + limb('70,150 86,215')
    + '<path d="M60 18 q-8 -12 2 -20 q10 -8 2 -18" stroke="#888" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>',
};
const ANIM = { idle: ['idle1', 'idle1', 'idle1', 'idle2'], work: ['work1', 'work2'], panic: ['panic1', 'panic2'], cheer: ['cheer1', 'cheer2'], katana: ['katana1'], strike: ['katana2'], burnt: ['burnt'] };

function bombSvg() {
  return `<svg class="sp-bomb__svg sp-boil" viewBox="0 0 300 270" aria-hidden="true">
    <path d="M150 52 Q158 18 190 14" stroke="#8b4a1c" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g class="sp-spark"><circle cx="192" cy="13" r="9" fill="#ffb000"/><path d="M192 -2 v-10 M207 13 h10 M203 2 l8 -8 M181 2 l-7 -8 M203 24 l7 7" stroke="#ff5a00" stroke-width="4" stroke-linecap="round"/></g>
    <rect x="128" y="44" width="44" height="22" rx="4" fill="#777" stroke="#111" stroke-width="5"/>
    <circle cx="150" cy="160" r="98" fill="#2a2a2a" stroke="#111" stroke-width="6"/>
    <path d="M92 118 Q104 88 136 76" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M88 168 Q52 140 74 112" stroke="#e8262b" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M212 168 Q250 148 230 116" stroke="#2457ff" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M150 196 Q150 236 120 246" stroke="#ffd400" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="80" y="138" width="140" height="60" rx="6" fill="#3d3d3d" stroke="#111" stroke-width="5"/>
    <rect x="90" y="146" width="120" height="44" fill="#140202" stroke="#111" stroke-width="3"/>
    <clipPath id="sp-bomb-clip"><circle cx="150" cy="160" r="95"/></clipPath><g class="sp-cuts" clip-path="url(#sp-bomb-clip)"></g>
  </svg>
  <span class="sp-led" aria-live="off">00:00</span>`;
}

const FILTERS = `<svg class="sp-defs" width="0" height="0" aria-hidden="true"><defs>
  ${[1, 2, 3].map((s, i) => `<filter id="spb${i}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${s * 7}"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter>`).join('')}
</defs></svg>`;

const TOOLS = ['select', 'lasso', 'eraser', 'fill', 'picker', 'zoom', 'pencil', 'brush', 'spray', 'text', 'line', 'curve', 'rect', 'poly', 'ellipse', 'rrect'];
const TOOL_ICON = {
  select: '<rect x="4" y="4" width="14" height="14" stroke-dasharray="3 2"/>', lasso: '<path d="M5 13c-3-6 9-11 13-5 2 4-4 7-8 5"/><path d="M8 13l-1 6"/>', eraser: '<path d="M4 15l7-9 7 6-5 6H8z" fill="#f7c8d0"/>',
  fill: '<path d="M6 9l6-5 6 7-6 6z" fill="#ddd"/><path d="M18 13c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z" fill="#2457ff"/>', picker: '<path d="M17 4l3 3-9 9-4 1 1-4z"/>', zoom: '<circle cx="10" cy="10" r="5"/><path d="M14 14l5 5"/>',
  pencil: '<path d="M5 19l2-6 9-9 4 4-9 9z" fill="#ffd400"/>', brush: '<path d="M14 4l6 6-6 4-4-4z" fill="#8b4a1c"/><path d="M10 10c-4 0-6 3-6 9 5 0 9-2 9-6"/>', spray: '<rect x="8" y="9" width="8" height="11" fill="#bbb"/><path d="M11 5h2v4h-2zM17 5h1M19 7h1M18 3h1"/>',
  text: '<path d="M6 6h12M12 6v13"/>', line: '<path d="M5 19L19 5"/>', curve: '<path d="M4 18C8 2 14 22 20 6"/>', rect: '<rect x="5" y="7" width="14" height="10"/>',
  poly: '<path d="M5 18l3-11 9 2-3 8z"/>', ellipse: '<ellipse cx="12" cy="12" rx="8" ry="5"/>', rrect: '<rect x="5" y="7" width="14" height="10" rx="4"/>',
};
const PALETTE = ['#000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#fff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];

/* ====================================================================== */
export function runSaper(host, api) {
  const P = api.play;
  let dead = false, ended = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const halt = new Promise(() => {}); // „zamrożenie” przebiegu po wybuchu
  const guard = (p) => Promise.resolve(p).then((v) => (dead ? halt : v));

  /* ---------- Okno „Painta” ---------- */
  const titleTxt = h('span', { class: 'sp-title__txt' }, `${slugName(api.title)}.bmp – Paint`);
  const exitBtn = h('button', { class: 'sp-title__x', type: 'button', 'aria-label': 'Wyjdź z gry', title: 'Wyjdź z gry' }, '✕');
  const status = h('span', { class: 'sp-status__txt' }, 'Gotowy');
  const progress = h('span', { class: 'sp-status__prog' });
  const clockEl = h('span', { class: 'sp-status__clock' }, icon('clock'), h('b', {}, '--:--'));
  const toolsEl = h('div', { class: 'sp-tools', 'aria-hidden': 'true' }, ...TOOLS.map((t) => h('span', { class: 'sp-tool', dataset: { t } })));
  toolsEl.querySelectorAll('.sp-tool').forEach((el) => { el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${TOOL_ICON[el.dataset.t]}</svg>`; });
  const canvas = h('div', { class: 'sp-canvas' });
  const fx = h('div', { class: 'sp-fx' });
  const win = h('div', { class: 'sp-win' },
    h('div', { class: 'sp-title' }, h('span', { class: 'sp-title__ic' }, '🖌'), titleTxt, api.preview ? h('span', { class: 'sp-title__pv' }, 'PODGLĄD') : null,
      h('span', { class: 'sp-title__btns', 'aria-hidden': 'true' }, h('i', {}, '_'), h('i', {}, '□')), exitBtn),
    h('div', { class: 'sp-menu', 'aria-hidden': 'true' }, ...['Plik', 'Edycja', 'Widok', 'Obraz', 'Kolory', 'Pomoc'].map((m) => h('span', {}, m))),
    h('div', { class: 'sp-body' }, toolsEl, h('div', { class: 'sp-canvas-wrap' }, canvas, fx)),
    h('div', { class: 'sp-palette', 'aria-hidden': 'true' }, h('span', { class: 'sp-palette__cur' }, h('i', {}), h('i', {})), ...PALETTE.map((c) => h('i', { style: { background: c } }))),
    h('div', { class: 'sp-status' }, status, progress, clockEl));
  const root = h('div', { class: 'sp' }, win);
  root.insertAdjacentHTML('afterbegin', FILTERS);
  host.append(root);
  exitBtn.addEventListener('click', () => (ended ? api.exit() : confirmExit(() => { stopAll(); api.exit(); })));
  const setTool = (t) => toolsEl.querySelectorAll('.sp-tool').forEach((el) => el.classList.toggle('is-on', el.dataset.t === t));
  const setStatus = (t) => { status.textContent = t; };

  /* ---------- Scena: stickman i bomba ---------- */
  const man = h('div', { class: 'sp-man' });
  man.innerHTML = '<svg class="sp-boil" viewBox="-10 -40 230 280" aria-hidden="true"><g class="sp-man__g"></g></svg>';
  const manG = man.querySelector('.sp-man__g');
  const bubble = h('div', { class: 'sp-bubble', hidden: true });
  const bomb = h('div', { class: 'sp-bomb' });
  bomb.innerHTML = bombSvg();
  const led = bomb.querySelector('.sp-led');
  const scene = h('div', { class: 'sp-scene' }, h('div', { class: 'sp-floor' }), h('div', { class: 'sp-actor' }, bubble, man), bomb);
  const panel = h('div', { class: 'sp-panel', hidden: true });
  canvas.append(scene, panel);

  let anim = 'idle', frame = 0;
  function setPose(name) { anim = name; frame = 0; drawMan(); }
  function drawMan() { const list = ANIM[anim]; manG.innerHTML = POSES[list[frame % list.length]](); }
  const poseTimer = setInterval(() => { frame++; drawMan(); }, 260);
  setPose('idle');
  let bubbleT = null;
  function say(text, ms = 0) {
    bubble.hidden = false; bubble.textContent = text;
    bubble.classList.remove('is-pop'); void bubble.offsetWidth; bubble.classList.add('is-pop');
    clearTimeout(bubbleT);
    if (ms) bubbleT = later(() => { bubble.hidden = true; }, ms);
  }

  /* ---------- Zegar bomby ---------- */
  let deadline = 0, lastSec = null, clockOn = false;
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  function showClock(ms) {
    const t = fmt(ms);
    led.textContent = t; clockEl.querySelector('b').textContent = t;
    const low = ms < 30000;
    led.classList.toggle('is-low', low); clockEl.classList.toggle('is-low', low);
    document.querySelectorAll('.sp-pov__led').forEach((x) => { x.textContent = t; x.classList.toggle('is-low', low); });
  }
  function startClock(sec) { deadline = Date.now() + sec * 1000; clockOn = true; lastSec = null; }
  const clockTimer = setInterval(() => {
    if (!clockOn || dead || ended) return;
    const left = deadline - Date.now();
    showClock(left);
    const s = Math.ceil(left / 1000);
    if (s !== lastSec) { lastSec = s; if (s <= 10 && s > 0) sound.play('beep'); else if (s % 2 === 0) sound.play('tick'); }
    if (left <= 0) { clockOn = false; api.act({ kind: 'timeout' }).catch(() => {}); explode('time'); }
  }, 200);
  showClock(P.time * 1000);

  /* ---------- Postęp ---------- */
  const steps = [...P.events.map((e) => SAPER_EVENT[e.kind].label), 'Katana'];
  progress.replaceChildren(...steps.map((s, i) => h('i', { title: s, dataset: { i } })));
  const markStep = (i, st) => { const el = progress.children[i]; if (el) el.className = st; };

  /* ---------- Wspólne: odpowiedź serwera ---------- */
  async function send(body) {
    try {
      const r = await api.act(body);
      if (r.exploded) { explode('mistake'); return halt; }
      return r;
    } catch (e) { toast(e.message, 'error'); return null; }
  }
  function openPanel(cls, ...kids) {
    panel.hidden = false; panel.className = `sp-panel ${cls}`; panel.replaceChildren(...kids);
    scene.classList.add('is-small');
    return panel;
  }
  function closePanel() { panel.hidden = true; panel.replaceChildren(); scene.classList.remove('is-small'); }
  const headline = (n, title, lead) => h('div', { class: 'sp-head' }, h('b', { class: 'sp-head__n' }, n), h('div', {}, h('h2', {}, title), lead ? h('p', {}, lead) : null));
  const paintBtn = (label, onClick, cls = '') => h('button', { class: `sp-btn ${cls}`, type: 'button', onClick }, label);

  /* ====================================================================== */
  /* 1. Przetnij kabel                                                       */
  /* ====================================================================== */
  function wireEvent(ev, n) {
    return new Promise((resolve) => {
      setTool('select');
      const COLORS = ['#ed1c24', '#2457ff', '#ffd400', '#22b14c', '#a349a4'];
      const narrow = canvas.clientWidth < 620;
      const W = narrow ? 420 : 800, H = narrow ? 560 : 430, k = ev.options.length, TW = narrow ? 46 : 70, CP = W * 0.32;
      const box = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sp-wires__svg', 'aria-hidden': 'true' });
      box.append(svg('rect', { x: 20, y: 40, width: TW, height: H - 80, rx: 8, fill: '#c3c3c3', stroke: INK, 'stroke-width': 5, class: 'sp-paint' }),
        svg('rect', { x: W - 20 - TW, y: 40, width: TW, height: H - 80, rx: 8, fill: '#2a2a2a', stroke: INK, 'stroke-width': 5, class: 'sp-paint' }),
        svg('text', { x: W - 20 - TW / 2, y: 30, 'text-anchor': 'middle', class: 'sp-svgtxt' }, 'BOMBA'), svg('text', { x: 20 + TW / 2, y: 30, 'text-anchor': 'middle', class: 'sp-svgtxt' }, 'ZASILANIE'));
      const ys = Array.from({ length: k }, (_, i) => 80 + (i * (H - 160)) / Math.max(1, k - 1));
      const right = [...ys].sort(() => Math.random() - 0.5);
      const tags = h('div', { class: 'sp-wires__tags' });
      const wires = ev.options.map((o, i) => {
        const p0 = { x: 20 + TW, y: ys[i] }, p3 = { x: W - 20 - TW, y: right[i] };
        const p1 = { x: p0.x + CP, y: p0.y + rand(-30, 30) }, p2 = { x: p3.x - CP, y: p3.y + rand(-30, 30) };
        const d = `M${p0.x} ${p0.y} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
        const g = svg('g', { class: 'sp-wire' });
        const line = svg('path', { d, stroke: COLORS[i], 'stroke-width': 11, fill: 'none', 'stroke-linecap': 'round', class: 'sp-paint' });
        const edge = svg('path', { d, stroke: INK, 'stroke-width': 15, fill: 'none', 'stroke-linecap': 'round', class: 'sp-paint' });
        const hit = svg('path', { d, stroke: 'transparent', 'stroke-width': 34, fill: 'none', class: 'sp-wire__hit' });
        g.append(edge, line, hit); box.append(g);
        const mid = { x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8, y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8 };
        // karteczki w różnych miejscach kabli, żeby się nie zasłaniały
        const tt = k > 1 ? 0.22 + (i * 0.56) / (k - 1) : 0.5, u = 1 - tt;
        const at = { x: u ** 3 * p0.x + 3 * u * u * tt * p1.x + 3 * u * tt * tt * p2.x + tt ** 3 * p3.x, y: u ** 3 * p0.y + 3 * u * u * tt * p1.y + 3 * u * tt * tt * p2.y + tt ** 3 * p3.y };
        const tag = h('button', { class: 'sp-tag', type: 'button', style: { left: `${(at.x / W) * 100}%`, top: `${(at.y / H) * 100}%`, '--c': COLORS[i] } }, h('i', {}), o.text);
        tags.append(tag);
        const w = { o, g, p0, p1, p2, p3, mid: at, t: tt, tag, color: COLORS[i] };
        const cut = () => choose(w);
        hit.addEventListener('click', cut); tag.addEventListener('click', cut);
        return w;
      });
      let busy = false;
      async function choose(w) {
        if (busy || dead) return;
        busy = true;
        snip(w);
        const r = await send({ ev: ev.id, choice: w.o.id });
        if (!r || r === halt) { busy = false; return; }
        if (r.ok) { setPose('cheer'); say('Uff! Dobry kabel!', 1600); sound.play('success'); later(() => resolve(), 900); }
      }
      function snip(w) {
        sound.play('snip');
        const { p0, p1, p2, p3, t } = w;
        const L = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), m = L(r0, r1);
        const a1 = q0, a2 = r0, b1 = r1, b2 = q2;
        w.g.replaceChildren();
        const half = (d, ox, oy, rot) => {
          const g = svg('g', { style: `transform-box: view-box; transform-origin: ${ox}px ${oy}px; transition: transform .7s cubic-bezier(.3,1.6,.5,1)` });
          g.append(svg('path', { d, stroke: INK, 'stroke-width': 15, fill: 'none', 'stroke-linecap': 'round', class: 'sp-paint' }), svg('path', { d, stroke: w.color, 'stroke-width': 11, fill: 'none', 'stroke-linecap': 'round', class: 'sp-paint' }));
          w.g.append(g); requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `rotate(${rot}deg)`; }));
        };
        half(`M${p0.x} ${p0.y} C${a1.x} ${a1.y} ${a2.x} ${a2.y} ${m.x - 8} ${m.y}`, p0.x, p0.y, 9);
        half(`M${m.x + 8} ${m.y} C${b1.x} ${b1.y} ${b2.x} ${b2.y} ${p3.x} ${p3.y}`, p3.x, p3.y, -9);
        w.tag.classList.add('is-cut');
        const r = box.getBoundingClientRect(), fr = fx.getBoundingClientRect();
        burst(fx, r.left - fr.left + (m.x / W) * r.width, r.top - fr.top + (m.y / H) * r.height, { n: 14, colors: ['#ffe14d', '#fff', '#ff7f27'], dist: [20, 70] });
      }
      openPanel('sp-panel--wires', headline(n, 'Przetnij właściwy kabel', ev.prompt),
        h('div', { class: 'sp-wires' }, box, tags), h('p', { class: 'sp-hint' }, '✂ Kliknij kabel (albo jego karteczkę), żeby go przeciąć. Zły kabel = BUM!'));
      setPose('work'); say('Który kabel…? Hmm…', 2200);
    });
  }

  /* ====================================================================== */
  /* 2. Palnik                                                               */
  /* ====================================================================== */
  function torchEvent(ev, n) {
    return new Promise((resolve) => {
      setTool('rect');
      const plate = h('div', { class: 'sp-plate' }, ...[0, 1, 2, 3].map((i) => h('i', { class: `sp-rivet sp-rivet--${i}` })), h('span', { class: 'sp-plate__lbl' }, 'OBUDOWA BOMBY · NIE OTWIERAĆ'));
      const draw = svg('svg', { class: 'sp-plate__draw', 'aria-hidden': 'true' });
      const rect = svg('rect', { class: 'sp-cutline', fill: 'none' });
      const spark = svg('circle', { r: 7, class: 'sp-torch-spark', fill: '#fff6a0' });
      draw.append(rect, spark);
      const flame = h('div', { class: 'sp-flame', hidden: true });
      plate.append(draw, flame);
      const hint = h('p', { class: 'sp-hint' }, '🔥 Przeciągnij po blasze, żeby narysować kwadrat – palnik wytnie otwór. Musi być duży!');
      openPanel('sp-panel--torch', headline(n, 'Wytnij otwór palnikiem', 'Pod blachą jest pytanie. Jeden błąd = wybuch.'), plate, hint);
      setPose('work'); say('Daj palnik! Tniemy!', 2000);
      let start = null, cur = null, cutting = false;
      const setRect = (a, b) => {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), hh = Math.abs(a.y - b.y);
        Object.entries({ x, y, width: w, height: hh }).forEach(([k2, v]) => rect.setAttribute(k2, v));
        return { x, y, w, h: hh };
      };
      let hissT = 0;
      plate.addEventListener('pointerdown', (e) => {
        if (cutting || dead) return;
        e.preventDefault(); plate.setPointerCapture(e.pointerId);
        start = localPoint(plate, e); cur = start; setRect(start, cur);
        flame.hidden = false; moveFlame(start);
      });
      plate.addEventListener('pointermove', (e) => {
        const p = localPoint(plate, e);
        if (!start) { if (!cutting) { flame.hidden = false; moveFlame(p); } return; }
        cur = p; setRect(start, cur); moveFlame(p);
        if (Date.now() - hissT > 160) { hissT = Date.now(); sound.play('torch'); const pr = plate.getBoundingClientRect(), fr = fx.getBoundingClientRect(); burst(fx, pr.left - fr.left + p.x, pr.top - fr.top + p.y, { n: 5, dist: [10, 40], ms: [250, 500], gravity: 40 }); }
      });
      plate.addEventListener('pointerleave', () => { if (!start && !cutting) flame.hidden = true; });
      const moveFlame = (p) => { flame.style.left = `${p.x}px`; flame.style.top = `${p.y}px`; };
      plate.addEventListener('pointerup', async () => {
        if (!start || cutting) return;
        const r = setRect(start, cur); start = null;
        const pr = plate.getBoundingClientRect();
        if (r.w < pr.width * 0.42 || r.h < pr.height * 0.38) {
          rect.removeAttribute('width'); say('Za mały otwór! Narysuj większy kwadrat.', 2000); sound.play('error'); return;
        }
        cutting = true; flame.hidden = true; hint.textContent = 'Palnik tnie…';
        await burn(r);
        // wycięty kawałek blachy spada
        const piece = h('div', { class: 'sp-piece', style: { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` } });
        const hole = h('div', { class: 'sp-hole', style: { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` } });
        plate.append(hole, piece); rect.removeAttribute('width');
        sound.play('clang');
        piece.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${rand(-40, 40)}px, ${pr.height + 200}px) rotate(${rand(-40, 40)}deg)` }], { duration: 900, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' }).onfinish = () => piece.remove();
        await sleep(500);
        askPlate();
      });
      function burn(r) {
        return new Promise((res) => {
          const per = 2 * (r.w + r.h);
          const t0 = performance.now(), dur = 1500;
          const tick = (t) => {
            const f = Math.min(1, (t - t0) / dur);
            let d = f * per; let x = r.x, y = r.y;
            if (d < r.w) x += d; else if ((d -= r.w) < r.h) { x += r.w; y += d; } else if ((d -= r.h) < r.w) { x += r.w - d; y += r.h; } else { d -= r.w; y += r.h - d; }
            spark.setAttribute('cx', x); spark.setAttribute('cy', y);
            rect.style.strokeDashoffset = String(per * (1 - f));
            rect.style.strokeDasharray = `${per}`;
            if (Math.random() < 0.35) { const pr = plate.getBoundingClientRect(), fr = fx.getBoundingClientRect(); burst(fx, pr.left - fr.left + x, pr.top - fr.top + y, { n: 3, dist: [10, 50], ms: [200, 500] }); }
            if (Math.random() < 0.12) sound.play('torch');
            if (f < 1 && !dead) requestAnimationFrame(tick); else { spark.removeAttribute('cx'); res(); }
          };
          requestAnimationFrame(tick);
        });
      }
      function askPlate() {
        const v = ev.question;
        let widget;
        const go = h('button', { class: 'sp-btn sp-btn--go', type: 'button', disabled: true }, 'Sprawdź ✓');
        widget = WIDGETS.open(v, { onChange: () => { go.disabled = !widget.ready(); }, serve: null });
        const tag = h('div', { class: 'sp-tagplate' }, h('span', { class: 'sp-tagplate__screw' }), h('span', { class: 'sp-tagplate__screw sp-tagplate__screw--r' }),
          h('h3', {}, v.prompt), widget.el, h('div', { class: 'sp-row' }, go));
        plate.append(tag);
        tag.animate([{ transform: 'scale(.2) rotate(-8deg)', opacity: 0 }, { transform: 'scale(1) rotate(-1deg)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'forwards' });
        hint.textContent = 'Odpowiedz na pytanie z blaszki, żeby ją odczepić.';
        say('Na blaszce jest pytanie!', 1800); setPose('idle');
        setTimeout(() => tag.querySelector('textarea')?.focus(), 450);
        go.addEventListener('click', async () => {
          if (go.disabled) return;
          go.disabled = true; widget.lock();
          const r = await send({ ev: ev.id, answer: widget.answer() });
          if (!r || r === halt) return;
          if (r.ok) {
            sound.play('success'); setPose('cheer'); say('Odczepiona!', 1400);
            tag.animate([{ transform: 'rotate(-1deg)' }, { transform: 'translate(30px, 500px) rotate(35deg)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
            later(resolve, 1000);
          }
        });
      }
    });
  }

  /* ====================================================================== */
  /* 3. Trojan (pionowa oś = kabel)                                          */
  /* ====================================================================== */
  function trojanEvent(ev, n) {
    return new Promise((resolve) => {
      setTool('line');
      const v = ev.question;
      const list = h('ol', { class: 'sp-cable', 'aria-label': 'Kabel – od góry (początek) do dołu (koniec)' });
      const segs = v.items.map((it) => {
        const up = h('button', { class: 'sp-seg__mv', type: 'button', 'aria-label': `W górę: ${it.text}` }, '▲');
        const dn = h('button', { class: 'sp-seg__mv', type: 'button', 'aria-label': `W dół: ${it.text}` }, '▼');
        const li = h('li', { class: 'sp-seg', dataset: { id: it.id } }, h('span', { class: 'sp-seg__plug' }), h('span', { class: 'sp-seg__txt' }, it.text), h('span', { class: 'sp-seg__btns' }, up, dn));
        up.addEventListener('click', () => { if (li.previousElementSibling) { li.previousElementSibling.before(li); sound.play('pop'); } });
        dn.addEventListener('click', () => { if (li.nextElementSibling) { li.nextElementSibling.after(li); sound.play('pop'); } });
        // przeciąganie w pionie
        li.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button')) return;
          e.preventDefault(); li.setPointerCapture(e.pointerId); li.classList.add('is-drag');
          const move = (m) => {
            const others = [...list.children].filter((x) => x !== li);
            const after = others.find((x) => { const r = x.getBoundingClientRect(); return m.clientY < r.top + r.height / 2; });
            if (after) { if (after !== li.nextElementSibling) { after.before(li); sound.play('tick'); } } else if (list.lastElementChild !== li) { list.append(li); sound.play('tick'); }
          };
          const up2 = () => { li.classList.remove('is-drag'); li.removeEventListener('pointermove', move); };
          li.addEventListener('pointermove', move);
          li.addEventListener('pointerup', up2, { once: true }); li.addEventListener('pointercancel', up2, { once: true });
        });
        return li;
      });
      list.append(...segs);
      const go = h('button', { class: 'sp-btn sp-btn--go', type: 'button' }, '🔌 Podłącz kabel i puść wirusa');
      const laptop = h('div', { class: 'sp-laptop' },
        h('div', { class: 'sp-laptop__screen' }, h('p', { class: 'sp-term' }, '> trojan.exe --cel BOMBA', h('br'), '> Ustaw segmenty kabla we właściwej kolejności:'),
          h('span', { class: 'sp-cable__end' }, '▲ początek (komputer)'), list, h('span', { class: 'sp-cable__end' }, '▼ koniec (do bomby)')),
        h('div', { class: 'sp-laptop__base' }));
      const plug = h('div', { class: 'sp-plug' }, h('span', { class: 'sp-plug__wire' }), h('span', { class: 'sp-plug__bomb' }, '💣'));
      openPanel('sp-panel--trojan', headline(n, 'Programowanie: trojan', v.prompt), h('div', { class: 'sp-trojan' }, laptop, plug), h('p', { class: 'sp-hint' }, 'Przeciągnij segmenty (albo użyj strzałek ▲▼). Zła kolejność = BUM!'), h('div', { class: 'sp-row' }, go));
      setPose('work'); say('Podłączam komputer…', 1800);
      go.addEventListener('click', async () => {
        go.disabled = true;
        const order = [...list.children].map((x) => x.dataset.id);
        list.classList.add('is-locked');
        const r = await send({ ev: ev.id, answer: { order } });
        if (!r || r === halt) { go.disabled = false; return; }
        if (r.ok) {
          sound.play('virus');
          plug.classList.add('is-on');
          for (const s of [...list.children]) { s.classList.add('is-virus'); await sleep(160); }
          bomb.classList.add('is-glitch'); later(() => bomb.classList.remove('is-glitch'), 1300);
          say('Wirus w bombie! Hehe.', 1500); setPose('cheer');
          later(resolve, 1300);
        }
      });
    });
  }

  /* ====================================================================== */
  /* 4. Krzyżówka → kod dostępu → oprogramowanie bomby                       */
  /* ====================================================================== */
  function crosswordEvent(ev, n) {
    return new Promise((resolve) => {
      setTool('text');
      const key = (r, c) => `${r},${c}`;
      const cells = new Map(); // key → { el, words:[wid], solved:'' }
      const grid = h('div', { class: 'cw-grid', style: { '--rows': ev.rows, '--cols': ev.cols } });
      const overlay = svg('svg', { class: 'cw-path', viewBox: `0 0 ${ev.cols * 10} ${ev.rows * 10}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      for (const w of ev.words) w.cells.forEach(([r, c], i) => {
        const k = key(r, c);
        if (!cells.has(k)) {
          const el = h('div', { class: 'cw-cell', style: { gridRow: r + 1, gridColumn: c + 1 } }, h('span', { class: 'cw-l' }));
          cells.set(k, { el, words: [], solved: '' }); grid.append(el);
          el.addEventListener('click', () => { const cl = cells.get(k); const i2 = cl.words.indexOf(sel?.id); selectWord(ev.words.find((x) => x.id === cl.words[(i2 + 1) % cl.words.length])); });
        }
        cells.get(k).words.push(w.id);
        if (i === 0) cells.get(k).el.append(h('span', { class: 'cw-n' }, String(w.n)));
      });
      ev.code.forEach(([r, c], i) => { const cl = cells.get(key(r, c)); cl?.el.classList.add('is-code'); cl?.el.append(h('span', { class: 'cw-code' }, String(i + 1))); });
      grid.append(overlay);
      const solved = new Set();
      const clueEls = new Map();
      const clues = h('ol', { class: 'cw-clues' }, ...ev.words.map((w) => {
        const li = h('li', { tabindex: '0', role: 'button' }, h('b', {}, `${w.n}.`), ` ${w.clue} `, h('small', {}, `(${w.cells.length} liter)`));
        li.addEventListener('click', () => selectWord(w));
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWord(w); } });
        clueEls.set(w.id, li); return li;
      }));
      const input = h('input', { class: 'cw-input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, 'aria-label': 'Wpisz litery hasła' });
      const info = h('p', { class: 'sp-hint' }, 'Kliknij pytanie albo pole i pisz z klawiatury. Pola nie muszą leżeć w linii – numerki pokazują kolejność liter.');
      // typed[i] – litera wpisana w i-tym polu hasła (pola już odgadnięte zostają); pos – kursor
      let sel = null, typed = [], pos = 0;
      const solvedAt = (w, i) => cells.get(key(...w.cells[i])).solved;
      const foldCh = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('Ł', 'L');
      function render() {
        for (const [, cl] of cells) { cl.el.classList.remove('is-sel', 'is-cur'); cl.el.querySelector('.cw-l').textContent = cl.solved; cl.el.querySelector('.cw-o')?.remove(); }
        overlay.replaceChildren();
        clueEls.forEach((li, id) => { li.classList.toggle('is-sel', sel?.id === id); li.classList.toggle('is-done', solved.has(id)); });
        if (!sel) return;
        let cur = pos; while (cur < sel.cells.length && solvedAt(sel, cur)) cur++;
        sel.cells.forEach(([r, c], i) => {
          const cl = cells.get(key(r, c));
          cl.el.classList.add('is-sel');
          if (i === cur) cl.el.classList.add('is-cur');
          cl.el.append(h('span', { class: 'cw-o' }, String(i + 1)));
          if (!cl.solved) cl.el.querySelector('.cw-l').textContent = typed[i] || '';
        });
        overlay.append(svg('polyline', { points: sel.cells.map(([r, c]) => `${c * 10 + 5},${r * 10 + 5}`).join(' '), fill: 'none', stroke: '#ed1c24', 'stroke-width': 0.8, 'stroke-dasharray': '1.5 1', 'stroke-linecap': 'round' }));
      }
      function selectWord(w) {
        if (!w || solved.has(w.id)) { const next = ev.words.find((x) => !solved.has(x.id)); if (!next) return; w = next; }
        sel = w; typed = []; pos = 0; render(); input.value = ''; input.focus({ preventScroll: true });
      }
      const complete = () => sel.cells.every((_, i) => solvedAt(sel, i) || typed[i]);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && sel) {
          e.preventDefault();
          let i = Math.min(pos, sel.cells.length) - 1;
          while (i >= 0 && (solvedAt(sel, i) || !typed[i])) i--;
          if (i >= 0) { typed[i] = ''; pos = i; } else pos = 0;
          render();
        }
        if (e.key === 'Enter') e.preventDefault();
      });
      input.addEventListener('input', () => {
        if (!sel) { input.value = ''; return; }
        const ch = [...input.value.toLocaleUpperCase('pl-PL').replace(/[^A-ZĄĆĘŁŃÓŚŹŻ]/g, '')];
        input.value = '';
        for (const x of ch) {
          if (pos >= sel.cells.length) break;
          // pole już odgadnięte: ta sama litera = przejdź dalej; inna = wpisz w następne wolne pole
          if (solvedAt(sel, pos) && foldCh(solvedAt(sel, pos)) === foldCh(x)) { pos++; continue; }
          while (pos < sel.cells.length && solvedAt(sel, pos)) pos++;
          if (pos >= sel.cells.length) break;
          typed[pos++] = x; sound.play('type');
        }
        render();
        if (complete()) check();
      });
      let checking = false;
      async function check() {
        if (checking) return;
        checking = true;
        const w = sel;
        const word = w.cells.map((_, i) => solvedAt(w, i) || typed[i] || '').join('');
        const r = await send({ ev: ev.id, part: 'word', word: w.id, text: word });
        checking = false;
        if (!r || r === halt) return;
        if (r.ok) {
          solved.add(w.id); sound.play('success');
          w.cells.forEach(([rr, c], i) => { const cl = cells.get(key(rr, c)); cl.solved = r.letters[i]; cl.el.classList.add('is-ok'); });
          sel = null; typed = []; render();
          if (solved.size === ev.words.length) return codeStep();
          selectWord(ev.words.find((x) => !solved.has(x.id)));
        } else {
          sound.play('error'); grid.classList.remove('is-bad'); void grid.offsetWidth; grid.classList.add('is-bad');
          info.textContent = `„${word}” nie pasuje. Spróbuj jeszcze raz – w krzyżówce pomyłka nie wysadza bomby.`;
          typed = []; pos = 0; render();
        }
      }
      function codeStep() {
        input.blur();
        grid.classList.add('is-solved');
        const boxes = h('div', { class: 'cw-codebox' }, ...ev.code.map((_, i) => h('span', {}, String(i + 1))));
        const codeIn = h('input', { class: 'sp-codein', maxlength: ev.code.length + 4, autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, 'aria-label': 'Kod dostępu' });
        const ok = h('button', { class: 'sp-btn sp-btn--go', type: 'button' }, 'Zatwierdź kod');
        const term = h('div', { class: 'sp-codeterm' }, h('p', {}, '> KRZYŻÓWKA ROZWIĄZANA.'), h('p', {}, `> Litery z pól oznaczonych numerkami (1–${ev.code.length}) to KOD DOSTĘPU.`), boxes,
          h('label', {}, '> WPISZ KOD: ', codeIn), ok, h('p', { class: 'sp-codeterm__msg', 'aria-live': 'polite' }));
        info.replaceWith(term);
        say('Mam kod! Teraz go wpiszę.', 1800);
        setTimeout(() => codeIn.focus(), 200);
        const submit = async () => {
          ok.disabled = true;
          const r = await send({ ev: ev.id, part: 'code', text: codeIn.value });
          ok.disabled = false;
          if (!r || r === halt) return;
          if (r.ok) { sound.play('success'); term.querySelector('.sp-codeterm__msg').textContent = '> DOSTĘP PRZYZNANY ✓'; later(software, 900); }
          else { sound.play('error'); term.querySelector('.sp-codeterm__msg').textContent = '> ODMOWA DOSTĘPU. Sprawdź litery w oznaczonych polach.'; codeIn.select(); }
        };
        ok.addEventListener('click', submit);
        codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      }
      const NAMES = ['Odpowiedź pisemna', 'Tabela', 'Prawda czy fałsz'];
      function software() {
        setTool('select');
        const done = [false, false, false];
        const stepsEl = h('div', { class: 'neo-steps' });
        const neo = h('div', { class: 'neo' }, h('div', { class: 'neo-top' }, h('b', {}, 'BOMB-OS 3.1'), h('span', {}, '// MODUŁ ZAPALNIKA'), h('span', { class: 'neo-top__st' }, 'POŁĄCZONO')),
          h('p', { class: 'neo-lead' }, 'Wyłącz zapalnik: wykonaj 3 kroki po kolei. Kliknij krok, żeby go włączyć. Błąd = detonacja.'), stepsEl);
        openPanel('sp-panel--neo', neo);
        say('Jestem w oprogramowaniu bomby!', 1800); setPose('work');
        const renderSteps = () => {
          stepsEl.replaceChildren(...ev.tasks.map((t, i) => {
            const ready = !done[i] && done.slice(0, i).every(Boolean);
            const st = done[i] ? 'DONE' : ready ? 'GOTOWY' : 'ZABLOKOWANY';
            const el = h('section', { class: ['neo-step', done[i] && 'is-done', ready && 'is-ready'] },
              h('button', { class: 'neo-step__head', type: 'button', disabled: !ready }, h('span', { class: 'neo-step__n' }, `0${i + 1}`), h('b', {}, NAMES[i]), h('span', { class: 'neo-step__st' }, st)));
            el.querySelector('.neo-step__head').addEventListener('click', () => openStep(i, el));
            return el;
          }));
        };
        function openStep(i, el) {
          if (el.classList.contains('is-open')) return;
          sound.play('virus');
          el.classList.add('is-open');
          const t = ev.tasks[i];
          let widget;
          const exec = h('button', { class: 'neo-exec', type: 'button', disabled: true }, 'WYKONAJ ▶');
          widget = WIDGETS[t.type](t, { onChange: () => { exec.disabled = !widget.ready(); }, serve: null });
          el.append(h('div', { class: 'neo-step__body' }, h('p', { class: 'neo-q' }, t.prompt), widget.el, exec));
          exec.addEventListener('click', async () => {
            exec.disabled = true; widget.lock();
            const r = await send({ ev: ev.id, part: 'task', i, answer: widget.answer() });
            if (!r || r === halt) return;
            if (r.ok) { sound.play('success'); done[i] = true; renderSteps(); if (done.every(Boolean)) { neo.append(h('p', { class: 'neo-ok' }, '>> ZAPALNIK ODŁĄCZONY ✓')); setPose('cheer'); later(resolve, 1300); } }
          });
        }
        renderSteps();
      }
      openPanel('sp-panel--cw', headline(n, 'Krzyżówka: zdobądź kod dostępu', 'Rozwiąż krzyżówkę – litery z pól z numerkami tworzą kod do oprogramowania bomby.'),
        h('div', { class: 'cw' }, h('div', { class: 'cw-paper' }, grid), clues), input, info);
      setPose('idle'); say('Krzyżówka? Serio? No dobra…', 2200);
      selectWord(ev.words[0]);
    });
  }

  /* ====================================================================== */
  /* 5. Usuwanie plików                                                      */
  /* ====================================================================== */
  function filesEvent(ev, n) {
    return new Promise((resolve) => {
      setTool('eraser');
      const EXT = ['.exe', '.sys', '.dll', '.bin', '.dat', '.cfg'];
      const extOf = (id) => EXT[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % EXT.length];
      let left = 12;
      const counter = h('b', {}, String(left));
      const bin = h('div', { class: 'sp-bin' }, '🗑', h('small', {}, 'Kosz'));
      const filesEl = h('div', { class: 'sp-files__grid' }, ...ev.files.map((f) => {
        const el = h('button', { class: 'sp-file', type: 'button', title: `Usuń ${f.name}` }, h('span', { class: 'sp-file__ic' }), h('span', { class: 'sp-file__name' }, f.name, h('small', {}, extOf(f.id))));
        el.addEventListener('click', () => del(f, el));
        return el;
      }));
      let busy = false;
      async function del(f, el) {
        if (busy || dead || el.classList.contains('is-gone')) return;
        busy = true; el.classList.add('is-going');
        const r = await send({ ev: ev.id, file: f.id });
        busy = false;
        if (!r || r === halt) return;
        if (r.ok) {
          sound.play('pop');
          const a = el.getBoundingClientRect(), b = bin.getBoundingClientRect();
          el.animate([{ transform: 'translate(0,0) scale(1) rotate(0)' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(.15) rotate(220deg)`, opacity: 0.2 }], { duration: 520, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
          later(() => { el.classList.add('is-gone'); bin.classList.remove('is-eat'); void bin.offsetWidth; bin.classList.add('is-eat'); }, 520);
          left = r.left; counter.textContent = String(left);
          if (r.done) { say('Zostały tylko dobre pliki!', 1600); setPose('cheer'); sound.play('success'); later(resolve, 1300); }
        }
      }
      openPanel('sp-panel--files', headline(n, 'Usuń pliki wybuchu', 'Zajrzyj do środka bomby. Usuń WSZYSTKIE pliki, które NIE są odpowiedzią. Usunięcie odpowiedzi = BUM!'),
        h('div', { class: 'sp-files' },
          h('aside', { class: 'sp-files__q' }, h('h3', {}, 'Te pliki MUSZĄ zostać:'), h('ol', {}, ...ev.questions.map((q) => h('li', {}, q))), h('p', {}, 'Do usunięcia: ', counter)),
          h('div', { class: 'sp-explorer' }, h('div', { class: 'sp-explorer__bar' }, h('span', {}, '📁 C:\\BOMBA\\WYBUCH\\'), bin), filesEl)));
      setPose('work'); say('Tyle plików… Ostrożnie!', 2000);
    });
  }

  /* ====================================================================== */
  /* Katana                                                                  */
  /* ====================================================================== */
  async function katana() {
    const ki = steps.length - 1;
    markStep(ki, 'is-cur');
    setStatus(`Bomba zdezaktywowana – teraz trzeba ją zniszczyć`);
    closePanel(); clockOn = false;
    led.classList.add('is-safe'); led.textContent = 'SAFE';
    setPose('cheer'); say('Zdezaktywowana! Teraz ją zniszczę kataną!', 2400);
    await guard(sleep(2400));
    setPose('katana'); scene.classList.add('is-run'); sound.play('whoosh');
    await guard(sleep(700));
    setPose('strike'); sound.play('clang'); shake(scene, 10, 400);
    const br = bomb.getBoundingClientRect(), fr = fx.getBoundingClientRect();
    burst(fx, br.left - fr.left + br.width * 0.4, br.top - fr.top + br.height * 0.55, { n: 22, colors: ['#fff', '#ffe14d', '#cfd8dc'], dist: [30, 120] });
    await guard(sleep(700));
    say('…nic się nie stało?!', 1200);
    await guard(sleep(1100));
    // zegar od nowa – panika
    led.classList.remove('is-safe');
    const s = await send({ kind: 'katana-start' }); if (s === halt) return halt;
    startClock(P.time); sound.play('error');
    setPose('panic'); scene.classList.remove('is-run'); say('AAAA! ZEGAR RUSZYŁ OD NOWA!', 2200);
    bomb.classList.add('is-angry');
    await guard(sleep(2300));
    // widok oczami sapera
    win.classList.add('is-pov-in');
    await guard(sleep(reduced() ? 0 : 650));
    const ok = await guard(pov());
    if (ok !== true) return halt;
    // powrót do widoku z boku (zoom out) – dopiero potem rozpad bomby
    scene.classList.add('is-slowmo');
    win.classList.remove('is-pov-in');
    await guard(sleep(reduced() ? 50 : 900));
    return finale();
  }

  function pov() {
    return new Promise((resolve) => {
      const qs = P.katana.slice();
      const totalSlashes = Math.max(6, qs.length * 2 + 2);
      let done = 0, qi = 0;
      const stage = h('div', { class: 'sp-pov' });
      const bombBox = h('div', { class: 'sp-pov__bomb' });
      bombBox.innerHTML = bombSvg();
      bombBox.querySelector('.sp-led').classList.add('sp-pov__led');
      const cuts = bombBox.querySelector('.sp-cuts');
      const lineSvg = svg('svg', { class: 'sp-pov__lines', 'aria-hidden': 'true' });
      const trail = svg('polyline', { class: 'sp-trail', fill: 'none' });
      lineSvg.append(trail);
      const blade = h('div', { class: 'sp-pov__katana' });
      blade.innerHTML = '<svg viewBox="0 0 200 300" aria-hidden="true"><path d="M110 300 L120 190" stroke="#5b2410" stroke-width="22" stroke-linecap="round"/><path d="M114 250 l12 -4 M112 230 l12 -4 M116 210 l12 -4" stroke="#e7c27a" stroke-width="4"/><ellipse cx="121" cy="186" rx="26" ry="8" fill="#c9a227" stroke="#111" stroke-width="4"/><path d="M121 180 L160 10" stroke="#e8edf2" stroke-width="16" stroke-linecap="round"/><path d="M121 180 L160 10" stroke="#111" stroke-width="3" opacity=".5"/></svg>';
      const counter = h('div', { class: 'sp-pov__count' }, `Cięcia: 0/${totalSlashes}`);
      const tip = h('div', { class: 'sp-pov__tip' }, 'Przytrzymaj przycisk myszy (lewy lub prawy) i tnij od kółka do strzałki!');
      stage.append(bombBox, lineSvg, blade, counter, tip);
      canvas.append(stage);
      let target = null;
      // Układ ekranu cięcia: ekran ma animację (powiększenie/drżenie), więc zawsze przeliczamy
      // piksele ekranu na piksele układu (offsetWidth/Height) – dzięki temu cięcie jest dokładnie pod myszką.
      const geo = () => { const r = stage.getBoundingClientRect(); return { r, kx: stage.offsetWidth / (r.width || 1), ky: stage.offsetHeight / (r.height || 1) }; };
      const pt = (e) => { const { r, kx, ky } = geo(); return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky }; };
      function newLine() {
        const { r, kx, ky } = geo(), b0 = bombBox.getBoundingClientRect();
        const b = { left: b0.left, top: b0.top, width: b0.width * kx, height: b0.height * ky };
        lineSvg.setAttribute('viewBox', `0 0 ${stage.offsetWidth} ${stage.offsetHeight}`);
        const cx = (b.left - r.left) * kx + b.width / 2 + rand(-b.width * 0.12, b.width * 0.12), cy = (b.top - r.top) * ky + b.height * 0.58 + rand(-b.height * 0.1, b.height * 0.1);
        const ang = rand(0, Math.PI), len = Math.min(b.width, b.height) * rand(0.55, 0.75);
        const a = { x: cx - Math.cos(ang) * len / 2, y: cy - Math.sin(ang) * len / 2 }, z = { x: cx + Math.cos(ang) * len / 2, y: cy + Math.sin(ang) * len / 2 };
        const [s0, s1] = Math.random() < 0.5 ? [a, z] : [z, a];
        lineSvg.querySelector('.sp-guide')?.remove();
        const g = svg('g', { class: 'sp-guide' }, svg('line', { x1: s0.x, y1: s0.y, x2: s1.x, y2: s1.y, class: 'sp-guide__l' }),
          svg('circle', { cx: s0.x, cy: s0.y, r: 14, class: 'sp-guide__s' }),
          svg('path', { d: arrowHead(s0, s1), class: 'sp-guide__a' }));
        lineSvg.prepend(g);
        target = { a: s0, b: s1 };
      }
      function arrowHead(a, b) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 22;
        const p1 = { x: b.x - Math.cos(ang - 0.45) * L, y: b.y - Math.sin(ang - 0.45) * L }, p2 = { x: b.x - Math.cos(ang + 0.45) * L, y: b.y - Math.sin(ang + 0.45) * L };
        return `M${p1.x} ${p1.y} L${b.x} ${b.y} L${p2.x} ${p2.y}`;
      }
      let path = null, blocked = false;
      // Katana podąża za myszką: czubek ostrza jest dokładnie w punkcie kursora, ostrze odchylone za ruchem
      const BW = 130, TIP = { x: BW * 0.8, y: BW * 0.05 }, BASE = Math.atan2(170, -39);
      let dir = { x: 1, y: 0 };
      function followBlade(p) {
        if (path.length > 1) {
          const q = path[Math.max(0, path.length - 6)];
          const dx = p.x - q.x, dy = p.y - q.y;
          if (Math.hypot(dx, dy) > 3) dir = { x: dx, y: dy };
        }
        const th = Math.atan2(-dir.y, -dir.x) - BASE;
        blade.style.transform = `translate(${p.x - TIP.x}px, ${p.y - TIP.y}px) rotate(${th}rad)`;
      }
      stage.addEventListener('contextmenu', (e) => e.preventDefault());
      stage.addEventListener('pointerdown', (e) => {
        if (blocked || dead || !target) return;
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault(); stage.setPointerCapture(e.pointerId);
        path = [pt(e)]; trail.setAttribute('points', '');
        dir = { x: 1, y: 0.3 };
        blade.classList.remove('is-swing'); blade.classList.add('is-follow'); blade.style.width = `${BW}px`;
        followBlade(path[0]);
      });
      stage.addEventListener('pointermove', (e) => {
        if (!path) return;
        const p = pt(e);
        path.push(p);
        trail.setAttribute('points', path.slice(-14).map((q) => `${q.x},${q.y}`).join(' '));
        followBlade(p);
      });
      const unfollow = () => { blade.classList.remove('is-follow'); blade.style.transform = ''; blade.style.width = ''; };
      const end = () => {
        if (!path) return;
        const pts = path; path = null;
        unfollow();
        trail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => { trail.setAttribute('points', ''); trail.style.opacity = ''; };
        if (pts.length < 2 || !target) return;
        const { a, b } = target;
        const near = (p, q, d) => Math.hypot(p.x - q.x, p.y - q.y) <= d;
        const fwd = near(pts[0], a, 60) && near(pts[pts.length - 1], b, 70);
        const back = near(pts[0], b, 60) && near(pts[pts.length - 1], a, 70);
        const onLine = pts.every((p) => distToSeg(p, a, b) < 48);
        if ((fwd || back) && onLine) slashOk(pts); else { tip.textContent = 'Nie trafiłeś w linię – przytrzymaj przycisk i tnij dokładnie od kółka do strzałki!'; sound.play('error'); }
      };
      stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
      function slashOk(pts) {
        target = null;
        // ślad cięcia = prawdziwa droga myszki (rzadziej próbkowana)
        const stride = Math.max(1, Math.ceil(pts.length / 40));
        const seg = pts.filter((_, i) => i % stride === 0 || i === pts.length - 1);
        sound.play('slash'); shake(stage, 6, 250);
        const flash = svg('polyline', { points: seg.map((p) => `${p.x},${p.y}`).join(' '), class: 'sp-flash', fill: 'none' });
        lineSvg.append(flash); setTimeout(() => flash.remove(), 380);
        lineSvg.querySelector('.sp-guide')?.remove();
        // ślad cięcia na bombie (w układzie SVG bomby)
        const bsv = bombBox.querySelector('svg').getBoundingClientRect(), { r: st, kx, ky } = geo();
        const toB = (p) => ({ x: ((p.x / kx + st.left - bsv.left) / bsv.width) * 300, y: ((p.y / ky + st.top - bsv.top) / bsv.height) * 270 });
        const d = seg.map((p, i) => { const q = toB(p); return `${i ? 'L' : 'M'}${q.x} ${q.y}`; }).join(' ');
        for (const g of [cuts, bomb.querySelector('.sp-cuts')]) g?.append(svg('path', { d, fill: 'none', stroke: '#ff5a00', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 }));
        const mid = seg[Math.floor(seg.length / 2)];
        burst(stage, mid.x, mid.y, { n: 18, colors: ['#fff', '#ffe14d', '#ff7f27'], dist: [30, 120] });
        done++;
        counter.textContent = `Cięcia: ${done}/${totalSlashes}`;
        tip.textContent = 'Świetnie! Dalej!';
        if (done >= totalSlashes) { resolve(true); stage.remove(); return; }
        if (qi < qs.length && done % 2 === 0) block(qs[qi++]); else setTimeout(newLine, 260);
      }
      function block(q) {
        blocked = true;
        lineSvg.querySelector('.sp-guide')?.remove();
        const LIMIT = 6000;
        const bar = h('i', {});
        const opts = q.kind === 'tf' ? [{ id: true, text: 'PRAWDA' }, { id: false, text: 'FAŁSZ' }] : q.options;
        const card = h('div', { class: 'sp-block', role: 'dialog', 'aria-label': 'Pytanie blokujące' },
          h('p', { class: 'sp-block__top' }, '⛔ BLOK! Odpowiedz w 6 sekund, żeby ciąć dalej'),
          h('div', { class: 'sp-block__bar' }, bar),
          h('h3', {}, q.kind === 'tf' ? q.text : q.prompt),
          h('div', { class: ['sp-block__opts', q.kind === 'tf' && 'is-tf'] }, ...opts.map((o, i) => {
            const b = h('button', { class: 'sp-block__opt', type: 'button' }, h('b', {}, 'ABCD'[i]), o.text);
            b.addEventListener('click', () => answer(o.id, b));
            return b;
          })));
        stage.append(card);
        sound.play('slowmo');
        bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: LIMIT, easing: 'linear', fill: 'forwards' });
        let over = false;
        const tm = later(() => answer(null, null, true), LIMIT);
        async function answer(val, btn, timeout = false) {
          if (over) return; over = true; clearTimeout(tm); timers.delete(tm);
          btn?.classList.add('is-picked');
          card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          const r = await send(timeout ? { kind: 'katana', id: q.id, timeout: true } : { kind: 'katana', id: q.id, ...(q.kind === 'tf' ? { value: val } : { choice: val }) });
          if (!r || r === halt) return;
          if (r.ok) { sound.play('success'); card.classList.add('is-ok'); setTimeout(() => { card.remove(); blocked = false; newLine(); }, 450); }
        }
      }
      setTimeout(newLine, reduced() ? 0 : 560); // dopiero po animacji wejścia ekranu
    });
  }

  async function finale() {
    clockOn = false;
    const ki = steps.length - 1;
    markStep(ki, 'is-done');
    setStatus('Bomba zniszczona!');
    setPose('strike');
    sound.play('slowmo');
    const svgEl = bomb.querySelector('svg');
    const b = bomb.getBoundingClientRect(), f = fx.getBoundingClientRect();
    // kawałki bomby rozjeżdżają się w zwolnionym tempie i rozsypują w pył
    const N = 9;
    const pieces = [];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2 + rand(-0.15, 0.15), a1 = ((i + 1) / N) * Math.PI * 2 + rand(-0.1, 0.1);
      const pt = (a, r2) => `${50 + Math.cos(a) * r2}% ${58 + Math.sin(a) * r2}%`;
      const clip = `polygon(50% 58%, ${pt(a0, 80)}, ${pt((a0 + a1) / 2, 85)}, ${pt(a1, 80)})`;
      const p = h('div', { class: 'sp-shard', style: { left: `${b.left - f.left}px`, top: `${b.top - f.top}px`, width: `${b.width}px`, height: `${b.height}px`, clipPath: clip } });
      p.append(svgEl.cloneNode(true));
      fx.append(p); pieces.push({ p, a: (a0 + a1) / 2 });
    }
    bomb.style.visibility = 'hidden';
    pieces.forEach(({ p, a }) => p.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${Math.cos(a) * 40}px, ${Math.sin(a) * 40 + 10}px) rotate(${rand(-12, 12)}deg)` }],
      { duration: reduced() ? 10 : 2600, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' }));
    await guard(sleep(reduced() ? 100 : 2200));
    const cx = b.left - f.left + b.width / 2, cy = b.top - f.top + b.height * 0.58;
    for (let k = 0; k < 4; k++) { burst(fx, cx + rand(-60, 60), cy + rand(-60, 60), { n: 40, colors: ['#2a2a2a', '#555', '#888', '#3d3d3d'], size: [2, 6], dist: [40, 200], ms: [1600, 3200], gravity: 120 }); await sleep(180); }
    pieces.forEach(({ p }) => p.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 1500, fill: 'forwards' }));
    sound.play('shatter');
    await guard(sleep(1600));
    pieces.forEach(({ p }) => p.remove());
    scene.classList.remove('is-slowmo');
    setPose('cheer'); say('Bomba w pył! Jestem sapierem!', 3000);
    win.classList.add('is-win');
    const res = await api.finish().catch(() => null);
    ended = true; stopTimers();
    celebrate({ count: 160 });
    sound.play('happy');
    endCard(true, res);
  }

  /* ---------- Wybuch ---------- */
  function explode(reason = 'mistake') {
    if (dead || ended) return;
    dead = true; clockOn = false;
    sound.play('boom');
    const r = canvas.getBoundingClientRect();
    const blast = h('div', { class: 'sp-blast' });
    blast.innerHTML = `<svg viewBox="-200 -200 400 400" aria-hidden="true">
      <path d="${star(16, 190, 120)}" fill="#ed1c24" stroke="#111" stroke-width="6"/>
      <path d="${star(14, 140, 85)}" fill="#ff7f27" stroke="#111" stroke-width="6"/>
      <path d="${star(12, 90, 55)}" fill="#fff200" stroke="#111" stroke-width="5"/>
      <text x="0" y="22" text-anchor="middle" class="sp-blast__t">BUM!</text></svg>`;
    fx.append(blast);
    shake(root, 22, 900);
    burst(fx, r.width / 2, r.height / 2, { n: 60, colors: ['#ed1c24', '#ff7f27', '#fff200', '#111'], size: [4, 12], dist: [80, 420], ms: [700, 1500], shape: 'shard' });
    setPose('burnt'); bubble.hidden = true;
    win.classList.add('is-boom'); panel.hidden = true;
    canvas.querySelector('.sp-pov')?.remove();
    setStatus(reason === 'time' ? 'Czas minął – bomba wybuchła' : 'Błąd – bomba wybuchła');
    later(async () => {
      blast.classList.add('is-smoke');
      const res = await api.finish().catch(() => null);
      ended = true; stopTimers();
      sound.play('sad');
      endCard(false, res, reason);
    }, 1500);
  }
  function star(n, R, r2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const rr = (i % 2 ? r2 : R) * rand(0.85, 1.1); pts.push(`${Math.cos(a) * rr},${Math.sin(a) * rr}`); }
    return `M${pts.join(' L')} Z`;
  }
  function endCard(winOk, res, reason) {
    const pts = res?.points;
    const card = h('div', { class: ['sp-end', winOk ? 'is-win' : 'is-lose'] },
      h('h2', {}, winOk ? 'BOMBA ROZBROJONA!' : 'BUM! Bomba wybuchła'),
      h('p', {}, winOk ? 'Kable, palnik, wirusy i katana – sapier jak się patrzy!' : reason === 'time' ? 'Zabrakło czasu. Następnym razem szybciej!' : 'Jeden błąd i po bombie. Spróbuj jeszcze raz – pytania już znasz!'),
      api.preview ? h('p', { class: 'sp-end__pv' }, 'Podgląd nauczyciela – punkty nie są przyznawane.')
        : winOk ? h('p', { class: 'sp-end__pts' }, pts ? `+${pts} pkt!` : 'Punkty za tę grę już masz – to była runda dla treningu.') : null,
      h('div', { class: 'sp-row' },
        h('button', { class: 'sp-btn sp-btn--go', type: 'button', onClick: () => api.again() }, '↻ Zagraj jeszcze raz'),
        h('button', { class: 'sp-btn', type: 'button', onClick: () => api.exit() }, api.preview ? 'Wróć do edytora' : 'Wyjdź')));
    canvas.append(card);
    card.animate([{ transform: 'scale(.3) rotate(-10deg)', opacity: 0 }, { transform: 'scale(1) rotate(-2deg)', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,1.5,.4,1)', fill: 'forwards' });
  }

  /* ---------- Przebieg gry ---------- */
  const HANDLERS = { wire: wireEvent, torch: torchEvent, trojan: trojanEvent, crossword: crosswordEvent, files: filesEvent };
  async function main() {
    setStatus('Bomba tyka!');
    say(`Bomba! Mamy ${Math.round(P.time / 60)} min. Jeden błąd i BUM!`, 2600);
    setPose('panic');
    await guard(sleep(1400));
    startClock(P.time);
    await guard(sleep(1300));
    for (let i = 0; i < P.events.length; i++) {
      const ev = P.events[i];
      markStep(i, 'is-cur');
      setStatus(`Zdarzenie ${i + 1} z ${P.events.length}: ${SAPER_EVENT[ev.kind].label}`);
      await guard(HANDLERS[ev.kind](ev, i + 1));
      markStep(i, 'is-done');
      closePanel(); setPose('idle');
      await guard(sleep(500));
    }
    await katana();
  }
  main().catch((e) => { console.error(e); toast('Coś poszło nie tak w grze.', 'error'); });

  function stopTimers() { clockOn = false; clearInterval(clockTimer); clearInterval(poseTimer); timers.forEach(clearTimeout); timers.clear(); }
  function stopAll() { dead = true; ended = true; stopTimers(); }
  return () => { stopAll(); root.remove(); };
}

function slugName(t) { return String(t || 'saper').toLocaleLowerCase('pl-PL').replace(/[^a-z0-9ąćęłńóśźż]+/g, '_').slice(0, 24) || 'saper'; }
void pick; void clamp;
