// Wspólne drobiazgi gier: czekanie, losowanie, SVG, wstrząs ekranu, cząsteczki, okno „Wyjść z gry?”.
import { h, icon, dialog } from '../ui.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}
/** Wstrząs elementu (np. przy uderzeniu młotkiem albo wybuchu). */
export function shake(el, power = 8, ms = 400) {
  if (reduced() || !el) return;
  el.animate(Array.from({ length: 8 }, (_, i) => ({ transform: i === 7 ? 'translate(0,0)' : `translate(${rand(-power, power)}px, ${rand(-power, power)}px) rotate(${rand(-power / 8, power / 8)}deg)` })),
    { duration: ms, easing: 'ease-out' });
}
/** Cząsteczki (iskry, kurz, konfetti) w punkcie x,y wewnątrz elementu host. */
export function burst(host, x, y, { n = 16, colors = ['#ffd23f', '#ff7b00', '#fff'], size = [3, 7], dist = [30, 110], ms = [450, 900], gravity = 60, shape = 'dot' } = {}) {
  if (!host) return;
  for (let i = 0; i < n; i++) {
    const s = rand(size[0], size[1]);
    const p = h('i', { class: `gx-p gx-p--${shape}`, style: { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${shape === 'shard' ? s * 2.2 : s}px`, background: pick(colors) } });
    host.append(p);
    const a = rand(0, Math.PI * 2), d = rand(dist[0], dist[1]);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
    const dur = rand(ms[0], ms[1]);
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + gravity}px)) rotate(${rand(-200, 200)}deg) scale(.4)`, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' })
      .onfinish = () => p.remove();
  }
}
/** Pytanie „Wyjść z gry?” – postęp przepada. */
export function confirmExit(onYes) {
  dialog({ iconName: 'logout', title: 'Wyjść z gry?', body: h('p', {}, 'Postęp tej rozgrywki przepadnie. Możesz zagrać jeszcze raz od początku.'),
    actions: [{ label: 'Gram dalej', kind: 'quiet' }, { label: 'Wyjdź', kind: 'danger', onClick: () => onYes() }] });
}
export const exitIcon = () => icon('x');
/** Punkt w układzie elementu (z uwzględnieniem skalowania). */
export function localPoint(el, e) {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
}
/** Odległość punktu od odcinka. */
export function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
