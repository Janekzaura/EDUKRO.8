// Koło fortuny 100–750 pkt (nagroda za ponad 3 dni na 1. miejscu w rankingu ogólnym).
// Wynik losuje serwer przy odebraniu – koło tylko zatrzymuje się na wylosowanym polu.
import { h, icon, dialog, toast } from '../ui.js';
import { post } from '../api.js';
import * as sound from '../sound.js';
import { celebrate } from '../celebrate.js';
import { state } from '../app.js';

const SEGMENTS = [100, 150, 200, 250, 300, 400, 500, 750];
const COLORS = ['#F2A541', '#4DB8DB', '#8DCB6A', '#A894F2', '#EE8FA4', '#76A9F6', '#F7D774', '#FF8A65'];
const NS = 'http://www.w3.org/2000/svg';

function wheelSvg(segments) {
  const n = segments.length, R = 100;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('class', 'fw__wheel');
  let html = '';
  segments.forEach((v, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n, a1 = a0 + (Math.PI * 2) / n;
    const p = (a) => `${(R * Math.cos(a)).toFixed(2)} ${(R * Math.sin(a)).toFixed(2)}`;
    html += `<path d="M0 0 L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z" fill="${COLORS[i % COLORS.length]}" stroke="#0E1529" stroke-width="1.5"/>`;
    const am = (a0 + a1) / 2;
    html += `<text x="${(R * 0.66 * Math.cos(am)).toFixed(1)}" y="${(R * 0.66 * Math.sin(am)).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${((am * 180) / Math.PI + 90).toFixed(1)} ${(R * 0.66 * Math.cos(am)).toFixed(1)} ${(R * 0.66 * Math.sin(am)).toFixed(1)})">${v}</text>`;
  });
  svg.innerHTML = html;
  return svg;
}

/** Okno z kołem; po zakręceniu odbiera nagrodę (id powiadomienia). onDone(wynik) – np. odświeżenie skrzynki. */
export function spinWheelDialog(item, onDone) {
  const wheel = wheelSvg(SEGMENTS);
  const result = h('div', { class: 'fw__result', 'aria-live': 'polite' });
  let spun = false;
  const body = h('div', { class: 'fw' },
    h('p', {}, item.body || 'Zakręć kołem – wygrasz od 100 do 750 punktów!'),
    h('div', { class: 'fw__wrap' }, wheel, h('span', { class: 'fw__hub' }), h('span', { class: 'fw__pin' })),
    result);
  const d = dialog({
    iconName: 'wheel', title: item.title, body, dismissible: true,
    actions: [{ label: 'Później', kind: 'quiet', value: 'later' }, { label: 'Zakręć!', kind: 'primary', onClick: async (close, btn) => {
      if (spun) return true;
      let r;
      try { r = await post('/api/inbox/claim', { id: item.id }); } catch (e) { toast(e.message, 'error'); return false; }
      spun = true;
      btn.disabled = true;
      btn.parentElement?.querySelectorAll('.btn--quiet').forEach((x) => { x.hidden = true; });
      const segs = r.wheel?.segments || SEGMENTS;
      const idx = r.wheel?.index ?? 0;
      const per = 360 / segs.length;
      const turn = 360 * 6 + (360 - idx * per) + (Math.random() - 0.5) * per * 0.6;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) wheel.style.transition = 'none';
      wheel.style.transform = `rotate(${turn}deg)`;
      let ticks = 0;
      const ti = setInterval(() => { if (++ticks > 30) clearInterval(ti); else sound.play('tick'); }, 150);
      await new Promise((res) => setTimeout(res, reduced ? 50 : 5200));
      clearInterval(ti);
      result.textContent = `+${r.wheel?.got ?? r.points} pkt!`;
      sound.play('claim');
      const rect = result.getBoundingClientRect();
      celebrate({ count: 120, style: state.user.card?.cele || 'confetti', origin: [rect.left + rect.width / 2, rect.top] });
      btn.textContent = 'Super!';
      btn.disabled = false;
      btn.onclick = () => close('done');
      onDone?.(r);
      return false;
    } }],
  });
  return d;
}
