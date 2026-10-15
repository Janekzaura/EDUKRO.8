// Efekty świętowania (po teście, przy odebraniu nagrody): konfetti, gwiazdki, serduszka, emoji, fajerwerki, złoty deszcz.
// Uczeń wybiera efekt w sklepie (Mój profil → Efekt po teście).
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#F2A541', '#4DB8DB', '#8DCB6A', '#A894F2', '#EE8FA4', '#EDE6D6', '#F7D774'];
const EMOJI = ['🎉', '⭐', '🏆', '🚀', '🎈', '✨', '💯', '🥳', '🔥', '🧠'];

function starPath(g, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
  g.closePath();
}
function heartPath(g, r) {
  g.beginPath();
  g.moveTo(0, r * 0.35);
  g.bezierCurveTo(-r * 1.2, -r * 0.5, -r * 0.45, -r * 1.25, 0, -r * 0.45);
  g.bezierCurveTo(r * 0.45, -r * 1.25, r * 1.2, -r * 0.5, 0, r * 0.35);
  g.closePath();
}

export function celebrate({ count = 140, origin, style = 'confetti' } = {}) {
  if (reduced()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const ox = origin ? origin[0] : innerWidth / 2, oy = origin ? origin[1] : innerHeight * 0.35;
  let P = [];
  const burst = (x, y, n, speed = 9) => {
    for (let i = 0; i < n; i++) {
      const a = style === 'fireworks' ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = style === 'fireworks' ? 2 + Math.random() * speed * 0.6 : 6 + Math.random() * speed;
      P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, hh: 4 + Math.random() * 6, c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 0,
        e: EMOJI[Math.floor(Math.random() * EMOJI.length)], size: 14 + Math.random() * 14 });
    }
  };
  if (style === 'gold') {
    // monety spadają z góry całego ekranu
    for (let i = 0; i < Math.min(count, 120); i++) P.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6, vx: (Math.random() - 0.5) * 1.2, vy: 2 + Math.random() * 3, r: Math.random() * Math.PI, vr: 0.08 + Math.random() * 0.12, life: 0, size: 9 + Math.random() * 7 });
  } else if (style === 'fireworks') {
    const shots = 4;
    for (let k = 0; k < shots; k++) setTimeout(() => burst(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.15 + Math.random() * 0.3), Math.round(count / shots)), k * 380);
  } else burst(ox, oy, style === 'emoji' ? Math.round(count / 3) : count);
  let raf;
  const t0 = performance.now();
  const step = () => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) {
      p.life++;
      if (style === 'gold') { p.vy += 0.05; p.x += p.vx; p.y += p.vy; p.r += p.vr; }
      else if (style === 'fireworks') { p.vy += 0.06; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; }
      else { p.vy += style === 'hearts' ? 0.12 : 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; }
      const alpha = Math.max(0, 1 - p.life / (style === 'gold' ? 260 : style === 'fireworks' ? 110 : 190));
      if (alpha <= 0) continue;
      g.save(); g.translate(p.x, p.y); g.globalAlpha = alpha;
      if (style === 'stars') { g.rotate(p.r); g.fillStyle = p.c; starPath(g, p.w * 0.9); g.fill(); }
      else if (style === 'hearts') { g.rotate(Math.sin(p.r) * 0.4); g.fillStyle = ['#F0566E', '#FF8FB8', '#FF5BDB', '#EE8FA4'][Math.floor(p.w) % 4]; heartPath(g, p.w); g.fill(); }
      else if (style === 'emoji') { g.rotate(p.r * 0.5); g.font = `${p.size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.e, 0, 0); }
      else if (style === 'fireworks') { g.fillStyle = p.c; g.beginPath(); g.arc(0, 0, 2.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = alpha * 0.35; g.beginPath(); g.arc(-p.vx * 2, -p.vy * 2, 1.6, 0, Math.PI * 2); g.fill(); }
      else if (style === 'gold') {
        const w = Math.abs(Math.cos(p.r)) * p.size;
        const grd = g.createLinearGradient(-w, -p.size, w, p.size); grd.addColorStop(0, '#FFF1B8'); grd.addColorStop(0.5, '#F3C752'); grd.addColorStop(1, '#9A6F1B');
        g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, Math.max(1.5, w), p.size, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7A5512'; g.lineWidth = 1; g.stroke();
      } else { g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); }
      g.restore();
    }
    if (performance.now() - t0 < 4200) raf = requestAnimationFrame(step); else cv.remove();
  };
  raf = requestAnimationFrame(step);
  setTimeout(() => { cancelAnimationFrame(raf); cv.remove(); }, 4500);
}
