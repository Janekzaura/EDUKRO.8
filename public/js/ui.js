// Narzędzia interfejsu: tworzenie elementów (bez innerHTML dla danych), ikony, powiadomienia, okna.

// Bezpiecznik: append/replaceChildren itp. pomijają null/undefined/false (zamiast wstawiać tekst „null”).
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['replaceChildren', 'append', 'prepend', 'after', 'before']) {
    const orig = proto[m];
    if (typeof orig === 'function') proto[m] = function (...a) { return orig.apply(this, a.filter((x) => x !== null && x !== undefined && x !== false)); };
  }
}

export function h(tag, attrs = {}, ...children) {
  const el = tag === 'svg' || attrs.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false || k === 'svg') continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (val === undefined || val === null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const frag = (...c) => { const f = document.createDocumentFragment(); append(f, c); return f; };

/* ---------- Ikony (statyczne, zaufane źródło) ---------- */
const P = {
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  warn: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  lesson: '<path d="M3.5 5.5c3-1 6-.8 8.5 1 2.5-1.8 5.5-2 8.5-1v13c-3-1-6-.8-8.5 1-2.5-1.8-5.5-2-8.5-1z"/><path d="M12 6.5v13"/>',
  teaching: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  exam: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5V2.5h6v1M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  quiz: '<path d="M4 6.5l1.8 1.8L9 5M4 12.5l1.8 1.8L9 11M4 18.5l1.8 1.8L9 17"/><path d="M12.5 7h7.5M12.5 13h7.5M12.5 19h7.5"/>',
  game: '<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.4l-.9 4.6a2.2 2.2 0 0 1-3.8 1l-2.3-2.5H10l-2.3 2.5a2.2 2.2 0 0 1-3.8-1l-.9-4.6A4.5 4.5 0 0 1 7.5 7.5z"/><path d="M8 11v3M6.5 12.5h3M15.5 11.5v.1M17.5 13.5v.1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c1.1-3 3.6-4.6 6.5-4.6s5.4 1.6 6.5 4.6"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 15.1c1.8.5 3.2 2 4 4.4"/>',
  registry: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  teacher: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M7 20l2.5-4M17 20l-2.5-4M7 8.5h6M7 11.5h4"/>',
  subjects: '<path d="M12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  materials: '<path d="M4 6.5h6l2 2h8v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5"/><rect x="13.5" y="11" width="7" height="9.5" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/>',
  logout: '<path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M10 16.5 5.5 12 10 7.5M5.5 12H16"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/>',
  results: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  // testy i edytor
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  chevron: '<path d="m6 9.5 6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l3 3"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 3-5.6 3.6-9.2 2.2 1.4 3.6 3.6 3.9 5.6.9-.8 1.4-2 1.5-3.2 2 1.8 3 4.3 3 6.8 0 3.3-2.4 5.8-6 5.8z"/>',
  repeat: '<path d="M4 11a7 7 0 0 1 12-5l2.5 2.5M18.5 4v4.5H14M20 13a7 7 0 0 1-12 5l-2.5-2.5M5.5 20v-4.5H10"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  flag: '<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  cut: '<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M7.8 15.7 17 4.5M16.2 15.7 7 4.5"/>',
  square: '<rect x="4.5" y="4.5" width="15" height="15" rx="2" stroke-dasharray="3 2.5"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  // lekcje, sklep, gry
  lifebuoy: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M6 6l3.3 3.3M18 6l-3.3 3.3M6 18l3.3-3.3M18 18l-3.3-3.3"/>',
  bag: '<path d="M5 8h14l-1.2 12.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.1a3.8 3.8 0 0 0 3.8-3.8c0-4-3.8-7-8.5-7z"/><circle cx="7.6" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/><circle cx="14.6" cy="7.3" r="1.2"/>',
  font: '<path d="M4 19 9.5 5h1L16 19M6.2 14h8.6"/><path d="M17 11.5c.5-.8 1.3-1.2 2.2-1.2 1.4 0 2.3.9 2.3 2.3V19M21.5 15.4c-.6-.3-1.4-.4-2.1-.4-1.5 0-2.6.7-2.6 2 0 1.2.9 2 2.2 2 1.2 0 2-.6 2.5-1.5"/>',
  medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5 6 3.5h4l2 4.5 2-4.5h4l-2.5 7"/><path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
  slides: '<rect x="3" y="4.5" width="18" height="12" rx="1.6"/><path d="M8 20.5h8M12 16.5v4"/><path d="M7 9h6M7 12h9"/>',
  present: '<rect x="3" y="4" width="18" height="12.5" rx="1.6"/><path d="M10 8.2v5l4-2.5z"/><path d="M8 20.5h8M12 16.5v4"/>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.4"/><path d="M12 3.5v7.1M12 13.4v7.1M3.5 12h7.1M13.4 12h7.1M6 6l5 5M13 13l5 5M18 6l-5 5M11 13l-5 5"/>',
  cards: '<rect x="3.5" y="6" width="12" height="14" rx="1.8"/><path d="M8.5 6V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 20.5 5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5"/>',
  sticky: '<path d="M4.5 4.5h15v10l-5 5h-10z"/><path d="M14.5 19.5v-5h5"/>',
  title: '<path d="M4 6V4.5h16V6M12 4.5v12"/><path d="M8 20h8"/>',
  copyText: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 11.5h8M8 15h5"/><path d="M4 7h16" opacity=".5"/>',
  trophy: '<path d="M8 4.5h8v4a4 4 0 0 1-8 0z"/><path d="M8 6.5H4.5a3 3 0 0 0 3.5 3.8M16 6.5h3.5a3 3 0 0 1-3.5 3.8M12 12.5V16M8.5 20h7M9.5 16h5v4h-5z"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5M10.5 7.5v6M7.5 10.5h6"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5M7.5 10.5h6"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  shuffle: '<path d="M3.5 7h3.2c2 0 3.2 1 4.3 2.6l2 3c1.1 1.6 2.3 2.4 4.3 2.4h3.2M17.5 12.5 20.5 15l-3 2.5M3.5 17h3.2c1.3 0 2.2-.4 3-1.1M20.5 7h-3.2c-1.3 0-2.2.4-3 1.1M17.5 4.5 20.5 7l-3 2.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/>',
  extract: '<rect x="3.5" y="3.5" width="8" height="10" rx="1.5"/><path d="M14 8.5h5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 10.5 18.5V16"/><path d="M7.5 13.5v3.5h6M11.5 15l2 2-2 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5c-1.6-3.6-6-4.2-6-1.5 0 1.8 3.4 1.5 6 1.5zM12 8.5c1.6-3.6 6-4.2 6-1.5 0 1.8-3.4 1.5-6 1.5z"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.8 8.8a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/>',
  // skrzynka, dźwięk, pomoc
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  music: '<path d="M9 18.5V6l11-2.5v12.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 4"/><path d="M12 17.4v.1"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M7.5 3.5c0 5 4.5 6 4.5 8.5s-4.5 3.5-4.5 8.5M16.5 3.5c0 5-4.5 6-4.5 8.5s4.5 3.5 4.5 8.5"/>',
  // rodzaje pytań
  qSingle: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
  qMulti: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6"/><path d="M5.3 7.3l1.6 1.6 2.6-3"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6"/><path d="M5.3 16.8l1.6 1.6 2.6-3"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.6"/><path d="M14.8 16.8l1.6 1.6 2.6-3"/>',
  qTrueFalse: '<path d="M3.5 8l2.5 2.5L10.5 5"/><path d="M14 4.5l6 6M20 4.5l-6 6"/><path d="M3.5 15.5h17M3.5 19.5h11"/>',
  qOpen: '<path d="M4 6.5h16M4 11h16M4 15.5h10"/><path d="M15.5 19.5l4.5-4.5 1.5 1.5-4.5 4.5h-1.5z"/>',
  qNumber: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
  qMatch: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6c6 0 4 12 10 12M7 18c6 0 4-12 10-12"/>',
  qOrder: '<rect x="3" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="4" width="8" height="5" rx="1.5"/><rect x="6" y="15" width="12" height="5" rx="1.5"/><path d="M12 10.5v3M10.5 12l1.5 1.5 1.5-1.5"/>',
  qTimeline: '<path d="M4 12h16"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 9.5V6M12 14.5V18M18 9.5V6"/>',
  qCloze: '<path d="M3 12h4M17 12h4"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.4" stroke-dasharray="2 2"/><path d="M3 18h18M3 6h10"/>',
  qClozeChoice: '<path d="M3 6h18M3 18h8"/><rect x="5" y="9.5" width="14" height="5.5" rx="1.4"/><path d="M14.5 11.5l1.3 1.3 1.3-1.3"/>',
  qTable: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/><rect x="10.5" y="10.5" width="3.5" height="3" fill="currentColor" stroke="none" opacity=".55"/>',
  qCategorize: '<path d="M3.5 13.5h7v6h-7zM13.5 13.5h7v6h-7z"/><rect x="8" y="3.5" width="8" height="5" rx="1.4"/><path d="M10 9l-3 3.5M14 9l3 3.5"/>',
  qImage: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><circle cx="15.5" cy="14" r="1.6"/><path d="M9 11.6v3M15.5 12.4V9"/>',
  qData: '<path d="M6 3.5h8.5l4 4v13h-12.5z"/><path d="M14.5 3.5v4h4M9 11h7M9 14h7M9 17h4.5"/>',
  // rankingi
  crown: '<path d="M3.5 8l4.2 3.6L12 5l4.3 6.6L20.5 8l-1.7 10.5H5.2z"/><path d="M5.5 21h13"/>',
  rocket: '<path d="M14.5 4.5c2.5-1 4.5-1 6-1 0 1.5 0 3.5-1 6l-6 6-5-5z"/><path d="M8.5 10.5H5l-2 3 4 1M13.5 15.5V19l-3 2-1-4"/><path d="M6 18c-1.5.5-2.5 1.5-2.5 2.5 1 0 2-1 2.5-2.5z"/><circle cx="15.5" cy="8.5" r="1.4"/>',
  // ikony ról
  nib: '<path d="M12 21.5v-6"/><path d="M12 15.5c-2.7 0-4.2-2-4.2-4.3 0-3.1 2.6-6.4 4.2-8.7 1.6 2.3 4.2 5.6 4.2 8.7 0 2.3-1.5 4.3-4.2 4.3z"/><circle cx="12" cy="10.8" r="1.4"/><path d="M5 21.5h14"/>',
  bomb: '<circle cx="10.5" cy="14" r="6.5"/><path d="M15 9.5l2-2M16.5 6l1 1"/><path d="M18 4.5c.6-.9 1.6-1 2.5-.5M19.5 7.5l1.2.4M17.5 2.8l.3 1.2"/><path d="M7.5 12a3.4 3.4 0 0 1 2.3-1.9"/>',
  hammer: '<path d="M13.5 6.5 6 14l3.9 3.9 7.5-7.5"/><path d="M11.6 4.4 15 1l8 8-3.4 3.4-2.1-2.1-1.4 1.4-3.6-3.6 1.4-1.4z"/><path d="M8 16 2.8 21.2"/>',
  code: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  scissors: '<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M7.8 15.7 17 4.5M16.2 15.7 7 4.5"/>',
  board: '<path d="M3 4.5h18M4.5 4.5v10.5h15V4.5M12 15v3M8 21l4-3 4 3"/><path d="M7.5 8.5c1.2 0 1.2 2.8 2.4 2.8s1.2-4.2 2.4-4.2 1.2 2.6 2.4 2.6 1 -1 1.8-1"/>',
};
export function icon(name, cls) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.6');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  if (cls) el.setAttribute('class', cls);
  el.innerHTML = P[name] || '';
  return el;
}

/* Motywy graficzne przedmiotów (linie, kolor dziedziczony z akcentu). */
const MOTIF = {
  hex: () => {
    // fragment sieci pierścieni benzenowych z wiązaniami podwójnymi
    const s = 34, out = [];
    const hex = (cx, cy) => Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3; return [cx + s * Math.cos(a), cy + s * Math.sin(a)];
    });
    const centers = [[150, 150], [150 + s * Math.sqrt(3), 150], [150 + s * Math.sqrt(3) / 2, 150 + s * 1.5], [150 - s * Math.sqrt(3) / 2, 150 + s * 1.5], [150 + s * Math.sqrt(3) / 2, 150 - s * 1.5], [150 - s * Math.sqrt(3), 150]];
    centers.forEach(([cx, cy], k) => {
      const p = hex(cx, cy);
      out.push(`<path d="M${p.map((q) => q.map((v) => v.toFixed(1)).join(' ')).join('L')}Z"/>`);
      if (k % 2 === 0) out.push(`<circle cx="${cx}" cy="${cy}" r="${s * 0.52}"/>`);
    });
    out.push('<path d="M209 98l26-15M235 83v-22M91 202l-26 15" />');
    out.push('<circle cx="235" cy="57" r="4"/><circle cx="61" cy="219" r="4"/>');
    return out.join('');
  },
  leaf: () => '<path d="M60 250C60 140 140 60 250 52c-4 110-84 192-190 198z"/><path d="M60 250 230 70"/>' +
    [0.25, 0.4, 0.55, 0.7, 0.82].map((t) => {
      const x = 60 + 170 * t, y = 250 - 180 * t;
      return `<path d="M${x} ${y}c-6-30-2-56 10-78"/><path d="M${x} ${y}c30 4 56 0 78-12"/>`;
    }).join('') + '<circle cx="120" cy="120" r="3"/><circle cx="190" cy="190" r="3"/>',
  orbit: () => '<ellipse cx="150" cy="150" rx="110" ry="40"/><ellipse cx="150" cy="150" rx="110" ry="40" transform="rotate(60 150 150)"/><ellipse cx="150" cy="150" rx="110" ry="40" transform="rotate(120 150 150)"/><circle cx="150" cy="150" r="9"/>',
  grid: () => Array.from({ length: 7 }, (_, i) => `<path d="M${40 + i * 36} 40v220M40 ${40 + i * 36}h220"/>`).join(''),
  book: () => '<path d="M150 90c-30-18-70-22-110-16v150c40-6 80-2 110 16 30-18 70-22 110-16V74c-40-6-80-2-110 16z"/><path d="M150 90v150"/>' +
    [0, 1, 2, 3, 4].map((i) => `<path d="M62 ${108 + i * 22}c26-3 50-1 72 8"/><path d="M238 ${108 + i * 22}c-26-3-50-1-72 8"/>`).join(''),
  speech: () => '<rect x="40" y="56" width="150" height="100" rx="24"/><path d="M80 156l-10 34 40-34"/><rect x="118" y="140" width="142" height="92" rx="24"/><path d="M222 232l14 30-44-30"/><path d="M70 92h90M70 120h58M150 176h80M150 200h50"/>',
  column: () => '<path d="M50 110 150 50l100 60z"/><path d="M50 110h200M60 250h180M50 266h200"/>' + [75, 125, 175, 225].map((x) => `<path d="M${x - 10} 122v124M${x + 10} 122v124"/>`).join(''),
  globe: () => '<circle cx="150" cy="150" r="105"/><ellipse cx="150" cy="150" rx="45" ry="105"/><path d="M45 150h210M62 98h176M62 202h176"/>',
  code: () => '<path d="M110 90 50 150l60 60M190 90l60 60-60 60M172 66l-44 168"/>',
  gear: () => {
    const pts = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, r = i % 4 < 2 ? 100 : 78; pts.push(`${(150 + r * Math.cos(a)).toFixed(1)} ${(150 + r * Math.sin(a)).toFixed(1)}`); }
    return `<path d="M${pts.join('L')}Z"/><circle cx="150" cy="150" r="34"/>`;
  },
  notes: () => '<path d="M112 222V82l118-32v140"/><path d="M112 116l118-32"/><ellipse cx="90" cy="222" rx="24" ry="18"/><ellipse cx="208" cy="190" rx="24" ry="18"/>',
  palette: () => '<path d="M150 50c-60 0-110 45-110 100s45 100 100 100c20 0 25-15 18-28-8-15 2-30 20-30h30c30 0 52-20 52-50 0-55-50-92-110-92z"/><circle cx="100" cy="112" r="14"/><circle cx="150" cy="88" r="14"/><circle cx="205" cy="106" r="14"/><circle cx="90" cy="170" r="14"/>',
  shield: () => '<path d="M150 45 245 80v70c0 60-40 95-95 115-55-20-95-55-95-115V80z"/><path d="M150 105v90M105 150h90"/>',
  heart: () => '<path d="M150 245C60 185 40 140 40 110c0-35 28-60 60-60 25 0 40 14 50 32 10-18 25-32 50-32 32 0 60 25 60 60 0 30-20 75-110 135z"/><path d="M70 150h40l15-30 25 60 18-40 15 10h47"/>',
  compass: () => '<circle cx="150" cy="150" r="105"/><circle cx="150" cy="150" r="8"/><path d="M150 62l24 88-24 88-24-88z"/><path d="M150 42v16M150 242v16M42 150h16M242 150h16"/>',
  none: () => '',
};
export function motif(name) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 300 300');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.3');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = (MOTIF[name] || MOTIF.none)();
  return el;
}

/* ---------- Powiadomienia ---------- */
export function toast(message, kind = 'ok') {
  const box = document.querySelector('.toasts');
  const t = h('div', { class: `toast toast--${kind}` }, icon(kind === 'ok' ? 'check' : kind === 'error' ? 'warn' : 'info'), h('span', {}, message));
  box.append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 3800);
}

export function notice(kind, ...content) {
  const ic = { error: 'warn', warn: 'warn', info: 'info', ok: 'check' }[kind];
  return h('div', { class: `notice notice--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, icon(ic), h('div', {}, ...content));
}

/* ---------- Okna dialogowe ---------- */
export function dialog({ title, body = [], actions = [], iconName, onClose, dismissible = true }) {
  const d = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
  const close = (v) => { if (d.open) d.close(v); };
  const helpBtn = h('button', { class: 'tool-btn tool-btn--help dialog__help', type: 'button', 'aria-label': 'Pomoc – co robi ten przycisk?', title: 'Pomoc', onClick: () => document.dispatchEvent(new CustomEvent('edukro:help-toggle')) }, icon('help'));
  const panel = h('div', { class: 'dialog__panel' }, helpBtn,
    iconName ? icon(iconName, 'dialog__icon') : null,
    h('h2', { id: 'dlg-title' }, title),
    h('div', { class: 'dialog__body' }, ...[].concat(body)),
    actions.length ? h('div', { class: 'dialog__actions' }, ...actions.map((a) => {
      const b = h('button', { class: `btn ${a.kind ? 'btn--' + a.kind : 'btn--ghost'}`, type: 'button' }, a.label);
      b.addEventListener('click', async () => {
        if (!a.onClick) return close(a.value);
        b.classList.add('is-busy');
        try { const r = await a.onClick(close, b); if (r !== false) close(a.value); }
        finally { b.classList.remove('is-busy'); }
      });
      return b;
    })) : null);
  d.append(panel);
  d.addEventListener('cancel', (e) => { if (!dismissible) e.preventDefault(); });
  d.addEventListener('click', (e) => { if (e.target === d && dismissible) close(); });
  d.addEventListener('close', () => {
    // samouczek i pomoc „pożyczone” przez to okno wracają na stronę, zanim okno zniknie
    for (const el of d.querySelectorAll(':scope > .tour, :scope > .help-banner, :scope > .help-bubble')) { document.body.append(el); try { el.showPopover?.(); } catch { /* nic */ } }
    document.dispatchEvent(new CustomEvent('edukro:dialog-close', { detail: d })); onClose && onClose(d.returnValue); setTimeout(() => d.remove(), 50); });
  document.body.append(d);
  d.showModal();
  document.dispatchEvent(new CustomEvent('edukro:dialog-open', { detail: d }));
  const first = d.querySelector('input, select, textarea') || d.querySelector('.dialog__actions .btn:last-child');
  first && first.focus();
  return { el: d, close };
}

/** Wynosi element (samouczek, dymek pomocy) ponad otwarte okna dialogowe – warstwa „top layer” przeglądarki.
 *  Gdy otwarte jest okno modalne, element trafia do jego wnętrza (inaczej przeglądarka zablokowałaby kliknięcia). */
export function raise(el) {
  if (!el) return;
  const open = [...document.querySelectorAll('dialog[open]')];
  const host = open[open.length - 1] || document.body;
  const wasOpen = typeof el.matches === 'function' && el.hasAttribute('popover') && el.matches(':popover-open');
  if (el.parentElement !== host) { try { if (wasOpen) el.hidePopover(); } catch { /* nic */ } host.append(el); }
  if (typeof el.showPopover !== 'function') return;
  if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
  try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { /* starsza przeglądarka */ }
}

/* ---------- Formularze ---------- */
let uid = 0;
export function field({ label, hint, input }) {
  const id = input.id || `f${++uid}`;
  input.id = id;
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) input.setAttribute('aria-describedby', hintId);
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input, hint ? h('p', { class: 'field__hint', id: hintId }, hint) : null);
}
export const input = (attrs = {}) => h('input', { class: 'input', ...attrs });

export function switchEl({ label, sub, checked = false, onChange }) {
  const inp = h('input', { type: 'checkbox', role: 'switch', checked });
  if (onChange) inp.addEventListener('change', () => onChange(inp.checked, inp));
  return { el: h('label', { class: 'switch' }, inp, h('span', { class: 'switch__track' }), h('span', { class: 'switch__text' }, label, sub ? h('small', {}, sub) : null)), input: inp };
}

/** Pole kodu cyfrowego: osobne, maskowane komórki; bez przycisku „pokaż kod”. */
export function pinInput({ length = 4, label = 'Kod', masked = true, onComplete }) {
  const wrap = h('div', { class: 'pin', role: 'group', 'aria-label': label });
  const cells = Array.from({ length }, (_, i) => h('input', {
    type: masked ? 'password' : 'text', inputmode: 'numeric', autocomplete: i === 0 ? 'one-time-code' : 'off',
    maxlength: 1, 'aria-label': `${label}, cyfra ${i + 1} z ${length}`, pattern: '[0-9]*', spellcheck: false,
  }));
  const value = () => cells.map((c) => c.value).join('');
  const sync = () => cells.forEach((c) => c.classList.toggle('is-filled', !!c.value));
  cells.forEach((c, i) => {
    c.addEventListener('input', () => {
      const digits = c.value.replace(/\D/g, '');
      if (digits.length > 1) { // wklejenie lub autouzupełnienie
        digits.slice(0, length - i).split('').forEach((d, k) => { cells[i + k].value = d; });
        cells[Math.min(length - 1, i + digits.length)].focus();
      } else {
        c.value = digits;
        if (digits && i < length - 1) cells[i + 1].focus();
      }
      wrap.classList.remove('is-error'); sync();
      if (value().length === length && onComplete) onComplete(value());
    });
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !c.value && i > 0) { cells[i - 1].focus(); cells[i - 1].value = ''; sync(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && i > 0) cells[i - 1].focus();
      if (e.key === 'ArrowRight' && i < length - 1) cells[i + 1].focus();
    });
    c.addEventListener('focus', () => c.select());
  });
  wrap.append(...cells);
  return {
    el: wrap, value,
    clear() { cells.forEach((c) => { c.value = ''; }); sync(); cells[0].focus(); },
    error() { wrap.classList.remove('is-error'); void wrap.offsetWidth; wrap.classList.add('is-error'); },
    focus() { cells[0].focus(); },
  };
}

export async function withBusy(btn, fn) {
  btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); }
}

export function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Odmiana liczebników po polsku: plural(5, ['lekcja','lekcje','lekcji']) */
export function plural(n, [one, few, many]) {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
