// Profilowe ucznia: awatar (emoji albo inicjały), ramka (SVG – część animowana), tytuł przy imieniu.
import { h } from './ui.js';
import { AVATARS } from './shared/shop.js';

const AV = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
let uid = 0;
const SVGNS = 'http://www.w3.org/2000/svg';

/** Kolor tła inicjałów – stały dla danej osoby. */
function hueOf(s) {
  let x = 0;
  for (const ch of String(s)) x = (x * 31 + ch.codePointAt(0)) % 360;
  return x;
}

/* Ramki rysowane w układzie: awatar = koło 0..100, rysunek może wychodzić poza nie (viewBox -30..130). */
function frameSvg(id) {
  const n = ++uid;
  const g = (name) => `${name}-${n}`;
  const star = (cx, cy, r) => {
    const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`; });
    return `<polygon points="${pts.join(' ')}"/>`;
  };
  // wieniec: liście od dołu w górę po obu stronach, ułożone wzdłuż okręgu
  const leaves = (side) => Array.from({ length: 7 }, (_, i) => {
    const a = side < 0 ? 105 + i * 20 : 75 - i * 20; const rad = (a * Math.PI) / 180;
    const x = 50 + 58 * Math.cos(rad), y = 50 + 58 * Math.sin(rad);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="10" ry="4.6" transform="rotate(${a + 90 + side * 25} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
  const S = {
    pixel: `<g fill="#9BE7FF">${Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; const x = 50 + 55 * Math.cos(a) - 4, y = 50 + 55 * Math.sin(a) - 4; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="8" height="8" fill="${i % 2 ? '#9BE7FF' : '#5B8CFF'}"/>`; }).join('')}</g>`,
    'cat-ears': `<g stroke="#2A2233" stroke-width="3" stroke-linejoin="round"><path d="M8 30 L4 -18 L40 6 Z" fill="#F4A261"/><path d="M92 30 L96 -18 L60 6 Z" fill="#F4A261"/></g><path d="M12 22 L10 -6 L32 8 Z" fill="#FFB4C8"/><path d="M88 22 L90 -6 L68 8 Z" fill="#FFB4C8"/><circle cx="50" cy="50" r="52" fill="none" stroke="#F4A261" stroke-width="4"/>`,
    bunny: `<g stroke="#E8E2F0" stroke-width="2"><ellipse cx="30" cy="-14" rx="11" ry="30" fill="#FFFFFF" transform="rotate(-12 30 -14)"/><ellipse cx="70" cy="-14" rx="11" ry="30" fill="#FFFFFF" transform="rotate(12 70 -14)"/></g><ellipse cx="30" cy="-12" rx="5" ry="20" fill="#FFC6D9" transform="rotate(-12 30 -12)"/><ellipse cx="70" cy="-12" rx="5" ry="20" fill="#FFC6D9" transform="rotate(12 70 -12)"/><circle cx="50" cy="50" r="52" fill="none" stroke="#FFFFFF" stroke-width="4"/>`,
    stars: `<circle cx="50" cy="50" r="52" fill="none" stroke="#F7D774" stroke-width="3" stroke-dasharray="2 6"/><g fill="#F7D774">${star(50, -8, 10)}${star(104, 30, 8)}${star(96, 96, 7)}${star(-2, 88, 7)}${star(-4, 26, 8)}</g>`,
    'gold-crown': `<defs><linearGradient id="${g('gold')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".45" stop-color="#F3C752"/><stop offset="1" stop-color="#9A6F1B"/></linearGradient></defs><circle cx="50" cy="50" r="53" fill="none" stroke="url(#${g('gold')})" stroke-width="7"/><path d="M24 2 L30 -22 L42 -6 L50 -28 L58 -6 L70 -22 L76 2 Z" fill="url(#${g('gold')})" stroke="#7A5512" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="-28" r="4" fill="#F0566E"/><circle cx="30" cy="-22" r="3" fill="#5B8CFF"/><circle cx="70" cy="-22" r="3" fill="#34D399"/>`,
    laurel: `<g fill="#8DCB6A" stroke="#4E7A35" stroke-width="1">${leaves(1)}${leaves(-1)}</g>`,
    headphones: `<path d="M-6 52 A56 60 0 0 1 106 52" fill="none" stroke="#2B2F3A" stroke-width="9" stroke-linecap="round"/><path d="M-6 52 A56 60 0 0 1 106 52" fill="none" stroke="#5B6170" stroke-width="3" stroke-linecap="round"/><rect x="-16" y="40" width="20" height="36" rx="9" fill="#F0566E" stroke="#2B2F3A" stroke-width="3"/><rect x="96" y="40" width="20" height="36" rx="9" fill="#F0566E" stroke="#2B2F3A" stroke-width="3"/>`,
    neon: `<circle class="fr-neon" cx="50" cy="50" r="54" fill="none" stroke="#2BE8FF" stroke-width="5"/><circle class="fr-neon fr-neon--2" cx="50" cy="50" r="60" fill="none" stroke="#FF5BDB" stroke-width="2.5"/>`,
    orbit: `<g class="fr-orbit"><circle cx="50" cy="50" r="80" fill="none"/><ellipse cx="50" cy="50" rx="70" ry="24" fill="none" stroke="#9BE7FF" stroke-width="2" transform="rotate(-25 50 50)"/><circle cx="-14" cy="62" r="6" fill="#2BE8FF"/></g><g class="fr-orbit fr-orbit--2"><circle cx="50" cy="50" r="80" fill="none"/><ellipse cx="50" cy="50" rx="70" ry="24" fill="none" stroke="#B388FF" stroke-width="2" transform="rotate(35 50 50)"/><circle cx="114" cy="72" r="6" fill="#B388FF"/></g>`,
    fire: `<defs><linearGradient id="${g('fire')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF4D1A"/><stop offset=".6" stop-color="#FFB12B"/><stop offset="1" stop-color="#FFF3A3"/></linearGradient></defs><g fill="url(#${g('fire')})">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * 360; return `<g transform="rotate(${a} 50 50)"><path class="fr-flame" d="M50 -16 C41 -3 40 6 50 12 C60 6 59 -3 50 -16 Z" style="animation-delay:${(i % 4) * -0.17}s"/></g>`; }).join('')}</g><circle cx="50" cy="50" r="52" fill="none" stroke="#FF7A1A" stroke-width="4"/>`,
    vinyl: `<g class="fr-vinyl"><circle cx="50" cy="50" r="74" fill="#121218"/>${[70, 64, 58].map((r) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#2C2C38" stroke-width="1.4"/>`).join('')}<path d="M50 -24 A74 74 0 0 1 112 12 L50 50 Z" fill="#FFFFFF" opacity=".07"/><circle cx="50" cy="50" r="53" fill="#E0566E"/></g>`,
    can: `<defs><linearGradient id="${g('can')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7DDCF5"/><stop offset=".5" stop-color="#E9FBFF"/><stop offset="1" stop-color="#4DB8DB"/></linearGradient></defs><rect x="-6" y="-26" width="112" height="152" rx="18" fill="url(#${g('can')})" stroke="#2A6F86" stroke-width="3"/><rect x="2" y="-30" width="96" height="10" rx="5" fill="#C9D1DC" stroke="#6A7686" stroke-width="2"/><rect x="2" y="120" width="96" height="9" rx="4" fill="#C9D1DC" stroke="#6A7686" stroke-width="2"/><text x="50" y="-4" text-anchor="middle" font-family="Poppins, Inter, sans-serif" font-weight="700" font-size="17" fill="#0E3A4A">EDU</text><text x="50" y="117" text-anchor="middle" font-family="Poppins, Inter, sans-serif" font-weight="700" font-size="16" fill="#F0566E">FIZZ</text><g class="fr-bubbles" fill="#FFFFFF">${[[6, 96, 3], [94, 84, 2.5], [10, 40, 2], [90, 20, 3]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${i * -0.6}s"/>`).join('')}</g>`,
    scooter: `<g class="fr-speed" stroke="#9BE7FF" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M-30 70 H-12"/><path d="M-36 84 H-16"/><path d="M-28 98 H-10"/></g><path d="M112 -6 L118 -14" stroke="#2B2F3A" stroke-width="5" stroke-linecap="round"/><path d="M104 -12 H124" stroke="#2B2F3A" stroke-width="5" stroke-linecap="round"/><path d="M114 -10 L106 112" stroke="#5B6170" stroke-width="6" stroke-linecap="round"/><rect x="-8" y="104" width="118" height="10" rx="5" fill="#F0566E" stroke="#2B2F3A" stroke-width="2.5"/><rect x="20" y="106" width="40" height="5" rx="2" fill="#2BE8FF" opacity=".9"/><g class="fr-wheel"><circle cx="2" cy="122" r="11" fill="#2B2F3A"/><circle cx="2" cy="122" r="4" fill="#C9D1DC"/><path d="M2 112 V132 M-8 122 H12" stroke="#5B6170" stroke-width="2"/></g><g class="fr-wheel fr-wheel--2"><circle cx="104" cy="122" r="11" fill="#2B2F3A"/><circle cx="104" cy="122" r="4" fill="#C9D1DC"/><path d="M104 112 V132 M94 122 H114" stroke="#5B6170" stroke-width="2"/></g>`,
  };
  if (!S[id]) return null;
  const el = document.createElementNS(SVGNS, 'svg');
  el.setAttribute('viewBox', '-40 -40 180 180');
  el.setAttribute('class', `av__frame fr-${id}`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = S[id];
  return el;
}

/** Awatar z ramką. who = karta osoby ({ firstName, lastName, avatar, frame }). */
export function avatarEl(who, { size = 40, frame = true, label = null } = {}) {
  const a = AV[who?.avatar] || AV.letter;
  const initials = `${(who?.firstName || '?')[0] || ''}${(who?.lastName || '')[0] || ''}`.toUpperCase();
  const fr = frame && who?.frame && who.frame !== 'none' ? who.frame : null;
  const core = h('span', { class: ['av__core', a.anim && `anim-${a.anim}`, !a.emoji && 'is-letter'], style: !a.emoji ? { '--hue': hueOf(`${who?.firstName}${who?.lastName}`) } : null },
    a.emoji ? h('span', { class: 'av__emoji' }, a.emoji) : initials);
  const el = h('span', { class: ['av', fr && `frame-${fr}`], style: { '--s': `${size}px` }, role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true' });
  const svg = fr && fr !== 'rainbow' ? frameSvg(fr) : null;
  // płyta i puszka leżą pod awatarem, pozostałe ramki – na nim
  if (svg && (fr === 'vinyl' || fr === 'can')) el.append(svg, core);
  else el.append(core, svg);
  if (fr === 'rainbow') el.append(h('span', { class: 'av__ring' }));
  if (a.anim === 'orbit') el.append(h('span', { class: 'av__moon' }));
  if (a.anim === 'sparkle') el.append(h('span', { class: 'av__spark' }, '✦'), h('span', { class: 'av__spark av__spark--2' }, '✧'));
  if (a.anim === 'breathe') el.append(h('span', { class: 'av__breath' }, '🔥'));
  return el;
}

/** Tytuł przy imieniu: „〈Mistrz hulajnogi〉” + Gwiazda szkoły. */
export function titleTags(who) {
  const out = [];
  if (who?.title) out.push(h('span', { class: 'title-tag' }, `〈${who.title}〉`));
  if (who?.schoolStar) out.push(h('span', { class: 'title-tag title-tag--star', title: 'Gwiazda szkoły – ×1,2 punktów do piątku 16:00' }, '★ ', who.schoolStar.title));
  return out;
}

/** Imię i nazwisko z tytułami; kliknięcie otwiera profil (z muzyką tej osoby). */
export function nameLine(who, { open = null, cls = '' } = {}) {
  const name = h('span', { class: 'name-line__name' }, `${who.firstName} ${who.lastName}`);
  const inner = [name, ...titleTags(who)];
  if (!open) return h('span', { class: ['name-line', cls] }, ...inner);
  return h('button', { class: ['name-line name-line--btn', cls], type: 'button', 'data-help': 'Kliknij, aby zobaczyć profil tej osoby (zagra jej muzyka).', onClick: () => open(who.id) }, ...inner);
}
