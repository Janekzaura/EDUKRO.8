// Logo EDUKRO: wczytanie SVG i animacja „pisania piórem”.
// Każda litera ma w masce pociągnięcia biegnące po linii środkowej kreski;
// odsłaniamy je kolejno (stroke-dashoffset), a mała stalówka podąża za końcem linii.
import { LOGO_TIMING } from './config.js';

let svgText = null;
let uidCounter = 0;

export async function loadLogo() {
  if (!svgText) svgText = await fetch('/assets/logo.svg').then((r) => r.text());
  // unikalne identyfikatory masek dla każdej kopii logo
  const n = ++uidCounter;
  const tpl = document.createElement('template');
  tpl.innerHTML = svgText.replace(/id="(lm\w+|edukro-logo-title)"/g, `id="$1-${n}"`)
    .replace(/url\(#(lm\w+)\)/g, `url(#$1-${n})`).replace(/aria-labelledby="edukro-logo-title"/, `aria-labelledby="edukro-logo-title-${n}"`);
  return tpl.content.firstElementChild;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * 0.85 + t * 0.15; // ruch ręki: przyspieszenie i hamowanie

/** Przygotowuje logo do animacji (wszystko ukryte). Zwraca kontroler.
 *  onPen(down, speed) – wywoływane w każdej klatce: czy stalówka pisze i jak szybko (do dźwięku kredy). */
export function prepareWriting(svg, { onPen } = {}) {
  const masks = [...svg.querySelectorAll('mask')];
  const plan = [];
  masks.forEach((m, mi) => {
    const isSwash = m.id.startsWith('lms');
    m.querySelectorAll('.pen').forEach((p, pi) => {
      // przybliżona długość (logo może jeszcze nie być w dokumencie); dokładna liczona w play()
      const len = parseFloat(p.dataset.len) * 1.2 + 20;
      p.style.strokeDasharray = `${len + 4} ${len + 4}`;
      p.style.strokeDashoffset = `${len + 4}`;
      plan.push({ p, len, mi, pi, isSwash });
    });
  });
  // nadanie czasów: litery proporcjonalnie do długości, zawijas osobno
  const letterLen = plan.filter((s) => !s.isSwash).reduce((a, s) => a + s.len, 0);
  let t = 0;
  for (const s of plan) {
    if (s.isSwash) { t += 160; s.start = t; s.dur = LOGO_TIMING.swash; t += s.dur; continue; }
    if (s.pi === 0 && s.mi > 0) t += LOGO_TIMING.letterPause; else if (s.pi > 0) t += LOGO_TIMING.liftPause;
    s.start = t;
    s.dur = Math.max(90, (s.len / letterLen) * LOGO_TIMING.letters);
    t += s.dur;
  }
  const total = t;

  // stalówka – mały punkt światła na końcu pisanej linii
  const nib = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  nib.setAttribute('r', '13');
  nib.setAttribute('class', 'nib');
  svg.append(nib);

  let raf = 0, finished = false, resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  let last = null;
  function render(elapsed) {
    let tip = null;
    for (const s of plan) {
      const k = Math.min(1, Math.max(0, (elapsed - s.start) / s.dur));
      const e = s.isSwash ? 1 - Math.pow(1 - k, 2.2) : ease(k);
      s.p.style.strokeDashoffset = `${(s.len + 4) * (1 - e)}`;
      if (k > 0 && k < 1) tip = s.p.getPointAtLength(s.len * e);
    }
    if (tip) { nib.setAttribute('cx', tip.x); nib.setAttribute('cy', tip.y); }
    svg.classList.toggle('is-writing', !!tip);
    if (onPen) {
      const v = tip && last ? Math.hypot(tip.x - last.x, tip.y - last.y) / 14 : 0;
      onPen(!!tip, v);
      last = tip ? { x: tip.x, y: tip.y } : null;
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const s of plan) s.p.style.strokeDashoffset = '0';
    svg.classList.remove('is-writing');
    nib.remove();
    onPen?.(false, 0);
    resolveDone();
  }

  return {
    total,
    done,
    play() {
      for (const s of plan) {
        try { s.len = s.p.getTotalLength(); } catch { /* zostaje przybliżenie */ }
        s.p.style.strokeDasharray = `${s.len + 4} ${s.len + 4}`;
      }
      const t0 = performance.now();
      const step = (now) => {
        const el = now - t0;
        render(el);
        if (el >= total) finish(); else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return done;
    },
    finish,
  };
}
