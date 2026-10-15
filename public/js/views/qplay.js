// Widżety odpowiedzi ucznia. Każdy zwraca { el, ready(), answer(), lock(), reveal(result) }.
// reveal() pokazuje, co było dobrze/źle, a w teście nauczającym – także poprawną odpowiedź.
import { h, icon } from '../ui.js';
import { draggable, flipMove } from '../dnd.js';
import { g } from '../g.js';
import { showSpeech } from '../shared/quiz-rules.js';
import * as sound from '../sound.js';

const LETTERS = 'ABCDEFGH';
const PALETTE = ['#F2A541', '#4DB8DB', '#8DCB6A', '#A894F2', '#EE8FA4', '#76A9F6'];
const words = (s) => (String(s).trim().match(/[\p{L}\p{N}]+/gu) || []).length;

function stagger(els) { els.forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('pop-in'); }); }

/* ---------- A–D ---------- */
function single(v, { onChange }) {
  let chosen = null;
  const btns = v.options.map((o, i) => {
    const b = h('button', { type: 'button', class: 'ans', 'aria-pressed': 'false', dataset: { id: o.id } }, h('span', { class: 'ans__key' }, LETTERS[i]), h('span', { class: 'ans__text' }, o.text));
    b.addEventListener('click', () => { chosen = o.id; btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onChange(); });
    return b;
  });
  stagger(btns);
  const el = h('div', { class: 'ans-grid', role: 'group', 'aria-label': 'Odpowiedzi' }, ...btns);
  return {
    el, ready: () => !!chosen, answer: () => ({ choice: chosen }),
    lock() { btns.forEach((b) => { b.disabled = true; }); },
    reveal(r) {
      for (const b of btns) {
        const id = b.dataset.id;
        if (id === chosen) b.classList.add(r.correct ? 'is-right' : 'is-wrong');
        if (r.solution && id === r.solution.correct && !r.correct) b.classList.add('is-solution');
      }
    },
    assist(a) { removeOptions(btns, a.remove, () => { if (a.remove.includes(chosen)) chosen = null; onChange(); }); },
  };
}
/** Koło ratunkowe w pytaniach z wyborem: błędne odpowiedzi znikają. */
function removeOptions(btns, ids, done) {
  for (const b of btns) if (ids.includes(b.dataset.id)) { b.classList.add('is-removed'); b.disabled = true; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-hidden', 'true'); }
  done();
}

function multi(v, { onChange }) {
  const chosen = new Set();
  const btns = v.options.map((o) => {
    const b = h('button', { type: 'button', class: 'ans ans--check', 'aria-pressed': 'false', dataset: { id: o.id } }, h('span', { class: 'ans__box' }, icon('check')), h('span', { class: 'ans__text' }, o.text));
    b.addEventListener('click', () => { if (chosen.has(o.id)) chosen.delete(o.id); else chosen.add(o.id); b.setAttribute('aria-pressed', String(chosen.has(o.id))); onChange(); });
    return b;
  });
  stagger(btns);
  const el = h('div', {}, h('p', { class: 'play-hint' }, 'Zaznacz wszystkie poprawne odpowiedzi.'), h('div', { class: 'ans-grid', role: 'group' }, ...btns));
  return {
    el, ready: () => chosen.size > 0, answer: () => ({ choices: [...chosen] }),
    lock() { btns.forEach((b) => { b.disabled = true; }); },
    reveal(r) {
      for (const b of btns) {
        const id = b.dataset.id;
        if (chosen.has(id)) b.classList.add(r.correct || r.parts?.[id] ? 'is-right' : 'is-wrong');
        if (r.solution && r.solution.correct.includes(id) && !chosen.has(id)) b.classList.add('is-solution');
      }
    },
    assist(a) { removeOptions(btns, a.remove, () => { a.remove.forEach((id) => chosen.delete(id)); onChange(); }); },
  };
}

function truefalse(v, { onChange }) {
  const vals = v.statements.map(() => null);
  const rows = v.statements.map((s, i) => {
    const mk = (val, label) => {
      const b = h('button', { type: 'button', class: ['tf-btn', val ? 'tf-btn--t' : 'tf-btn--f'], 'aria-pressed': 'false' }, icon(val ? 'check' : 'x'), label);
      b.addEventListener('click', () => { vals[i] = val; row.querySelectorAll('.tf-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); row.classList.add('is-set'); onChange(); });
      return b;
    };
    const row = h('div', { class: 'tf-row' }, h('span', { class: 'tf-num' }, String(i + 1)), h('p', { class: 'tf-text' }, s), h('div', { class: 'tf-btns', role: 'radiogroup', 'aria-label': `Zdanie ${i + 1}` }, mk(true, 'Prawda'), mk(false, 'Fałsz')));
    return row;
  });
  stagger(rows);
  return {
    el: h('div', { class: 'tf-list' }, ...rows),
    ready: () => vals.every((x) => x !== null), answer: () => ({ values: vals }),
    lock() { rows.forEach((r) => r.querySelectorAll('button').forEach((b) => { b.disabled = true; })); },
    reveal(r) {
      rows.forEach((row, i) => {
        const ok = Array.isArray(r.parts) ? r.parts[i] : r.correct;
        row.classList.add(ok ? 'is-right' : 'is-wrong');
        if (r.solution && !ok) row.append(h('span', { class: 'sol-tag' }, r.solution.answers[i] ? 'To prawda' : 'To fałsz'));
      });
    },
    assist(a) {
      for (const [i, val] of Object.entries(a.set)) {
        const row = rows[Number(i)];
        row.querySelector(val ? '.tf-btn--t' : '.tf-btn--f').click();
        row.classList.add('is-assist');
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      }
      onChange();
    },
  };
}

/* ---------- Pisemne ----------
 * Uczeń nigdy nie widzi słów kluczowych ani informacji, że odpowiedź jest sprawdzana po słowach –
 * tylko licznik słów (minimum / maksimum) i ewentualnie przykładową odpowiedź nauczyciela.
 */
function writeBox({ min, max }, onChange, placeholder = 'Napisz odpowiedź własnymi słowami…') {
  const ta = h('textarea', { class: 'textarea play-ta', rows: 4, maxlength: 5000, placeholder });
  const counter = h('span', { class: 'wc' });
  const n = () => words(ta.value);
  const upd = () => {
    const k = n();
    const unit = (x) => (x === 1 ? 'słowo' : x % 10 >= 2 && x % 10 <= 4 && (x % 100 < 12 || x % 100 > 14) ? 'słowa' : 'słów');
    counter.textContent = max ? `${k} / ${max} ${unit(max)}` : `${k} ${unit(k)}`;
    if (min && k < min) counter.textContent += ` · napisz co najmniej ${min}`;
    counter.classList.toggle('is-over', !!max && k > max);
    counter.classList.toggle('is-under', !!min && k > 0 && k < min);
  };
  ta.addEventListener('input', () => { upd(); onChange(); });
  upd();
  return {
    el: h('div', { class: 'write' }, ta, counter), ta, upd,
    ok: () => { const k = n(); return k > 0 && (!min || k >= min) && (!max || k <= max); },
  };
}
function sampleSolution(text) {
  return h('div', { class: 'sol-box' }, h('b', {}, 'Przykładowa dobra odpowiedź: '), text);
}
function open(v, { onChange }) {
  const w = writeBox({ min: v.minWords, max: v.maxWords }, onChange);
  return {
    el: h('div', {}, w.el), ready: () => !!w.ok(), answer: () => ({ text: w.ta.value }),
    lock() { w.ta.readOnly = true; },
    reveal(r) {
      w.el.classList.add(r.correct ? 'is-right' : 'is-wrong');
      if (r.parts?.tooLong) w.el.append(h('p', { class: 'sol-note' }, 'Odpowiedź była za długa.'));
      if (r.parts?.tooShort) w.el.append(h('p', { class: 'sol-note' }, 'Odpowiedź była za krótka.'));
      if (r.solution?.sample) w.el.after(sampleSolution(r.solution.sample));
    },
    assist(a) { w.ta.value = w.ta.value.trim() ? `${a.text} ${w.ta.value.trim()}` : a.text; w.ta.classList.add('is-assist'); w.upd(); onChange(); },
  };
}
function number(v, { onChange }) {
  const inp = h('input', { class: 'input num-in', inputmode: 'decimal', autocomplete: 'off', placeholder: '?', maxlength: 30, 'aria-label': 'Twoja odpowiedź (liczba)' });
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d,.\-−\s]/g, ''); onChange(); });
  const el = h('div', { class: 'num-wrap' }, inp, v.unit ? h('span', { class: 'num-unit' }, v.unit) : null);
  return {
    el, ready: () => /\d/.test(inp.value), answer: () => ({ value: inp.value }),
    lock() { inp.readOnly = true; },
    reveal(r) {
      el.classList.add(r.correct ? 'is-right' : 'is-wrong');
      if (r.solution) el.after(h('div', { class: 'sol-box' }, h('b', {}, 'Poprawny wynik: '), `${r.solution.value}${r.solution.unit ? ` ${r.solution.unit}` : ''}`, r.solution.tolerance ? ` (± ${r.solution.tolerance})` : ''));
    },
  };
}

/* ---------- Połącz w pary ---------- */
function match(v, { onChange }) {
  const links = {}; // leftId -> rightId
  let selected = null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'm-lines');
  svg.setAttribute('aria-hidden', 'true');
  const color = (lid) => PALETTE[v.left.findIndex((l) => l.id === lid) % PALETTE.length];
  const lefts = v.left.map((l) => h('button', { type: 'button', class: 'm-item m-left', dataset: { id: l.id } }, h('span', {}, l.text), h('i', { class: 'm-dot' })));
  const rights = v.right.map((r) => h('button', { type: 'button', class: 'm-item m-right', dataset: { id: r.id, drop: 'r' } }, h('i', { class: 'm-dot' }), h('span', {}, r.text)));
  const wrap = h('div', { class: 'match' }, svg, h('div', { class: 'm-col' }, ...lefts), h('div', { class: 'm-col' }, ...rights));
  let temp = null;
  const link = (lid, rid) => {
    if (rights.find((x) => x.dataset.id === rid)?.classList.contains('is-assist')) return;
    if (lefts.find((x) => x.dataset.id === lid)?.classList.contains('is-assist')) return;
    for (const k of Object.keys(links)) if (links[k] === rid) delete links[k];
    links[lid] = rid;
    selected = null;
    sync(); onChange();
  };
  function sync() {
    lefts.forEach((b) => { const on = !!links[b.dataset.id]; b.classList.toggle('is-linked', on); b.classList.toggle('is-selected', selected === b.dataset.id); b.style.setProperty('--c', on ? color(b.dataset.id) : ''); });
    rights.forEach((b) => { const lid = Object.keys(links).find((k) => links[k] === b.dataset.id); b.classList.toggle('is-linked', !!lid); b.style.setProperty('--c', lid ? color(lid) : ''); });
    draw();
  }
  function point(el, side) {
    const W = wrap.getBoundingClientRect();
    const d = el.querySelector('.m-dot').getBoundingClientRect();
    return [d.left + d.width / 2 - W.left, d.top + d.height / 2 - W.top, side];
  }
  const curve = ([x1, y1], [x2, y2]) => { const dx = Math.max(40, (x2 - x1) / 2); return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };
  function draw(extra = []) {
    const W = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${W.width} ${W.height}`);
    svg.replaceChildren();
    const path = (d, stroke, cls) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('stroke', stroke); if (cls) p.setAttribute('class', cls); svg.append(p); };
    for (const [lid, rid] of Object.entries(links)) {
      const L = lefts.find((b) => b.dataset.id === lid), R = rights.find((b) => b.dataset.id === rid);
      if (L && R) path(curve(point(L), point(R)), color(lid), L.dataset.state ? `is-${L.dataset.state}` : 'is-new');
    }
    for (const e of extra) path(e.d, e.stroke, e.cls);
  }
  new ResizeObserver(() => draw(temp ? [temp] : [])).observe(wrap);
  lefts.forEach((b) => {
    b.addEventListener('click', () => {
      if (b.classList.contains('is-assist')) return;
      if (links[b.dataset.id]) { delete links[b.dataset.id]; onChange(); }
      selected = selected === b.dataset.id ? null : b.dataset.id;
      sync();
    });
    draggable(b, {
      dropSelector: '.m-right',
      onMove(x, y) { const W = wrap.getBoundingClientRect(); temp = { d: curve(point(b), [x - W.left, y - W.top]), stroke: color(b.dataset.id), cls: 'is-temp' }; draw([temp]); },
      onDrop(target) { link(b.dataset.id, target.dataset.id); },
      onEnd() { temp = null; draw(); },
    });
  });
  rights.forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('is-assist')) return; if (selected) link(selected, b.dataset.id); else { const lid = Object.keys(links).find((k) => links[k] === b.dataset.id); if (lid) { delete links[lid]; sync(); onChange(); } } }));
  stagger([...lefts, ...rights]);
  return {
    el: h('div', {}, h('p', { class: 'play-hint' }, 'Przeciągnij od elementu z lewej do pasującego z prawej – albo stuknij jeden, a potem drugi.'), wrap),
    ready: () => v.left.every((l) => links[l.id]), answer: () => ({ links }),
    lock() { [...lefts, ...rights].forEach((b) => { b.disabled = true; b.classList.add('is-locked'); }); },
    reveal(r) {
      lefts.forEach((b) => { const ok = r.parts ? r.parts[b.dataset.id] : r.correct; b.dataset.state = ok ? 'right' : 'wrong'; b.classList.add(ok ? 'is-right' : 'is-wrong'); });
      draw();
      if (r.solution && !r.correct) {
        const extra = Object.entries(r.solution.links).filter(([lid]) => r.parts && !r.parts[lid]).map(([lid, rid]) => {
          const L = lefts.find((b) => b.dataset.id === lid), R = rights.find((b) => b.dataset.id === rid);
          return { d: curve(point(L), point(R)), stroke: 'var(--ok)', cls: 'is-solution' };
        });
        draw(extra);
        new ResizeObserver(() => draw(extra)).observe(wrap);
      }
    },
    assist(a) {
      for (const [lid, rid] of Object.entries(a.links)) {
        for (const k of Object.keys(links)) if (links[k] === rid || k === lid) delete links[k];
        links[lid] = rid;
        const L = lefts.find((b) => b.dataset.id === lid), R = rights.find((b) => b.dataset.id === rid);
        [L, R].forEach((b) => { if (b) { b.disabled = true; b.classList.add('is-locked', 'is-assist'); } });
      }
      selected = null; sync(); onChange();
    },
  };
}

/* ---------- Ułóż zdanie ---------- */
function orderWords(v, { onChange }) {
  const line = h('div', { class: 'ow-line', dataset: { drop: 'line' }, 'aria-label': 'Twoje zdanie' });
  const pool = h('div', { class: 'ow-pool', dataset: { drop: 'pool' }, 'aria-label': 'Rozsypane słowa' });
  const empty = h('span', { class: 'ow-empty' }, 'Stuknij słowa po kolei albo przeciągnij je tutaj');
  line.append(empty);
  const tiles = v.tiles.map((t) => h('button', { type: 'button', class: 'tile', dataset: { id: t.id } }, t.text));
  const syncEmpty = () => { empty.hidden = line.querySelectorAll('.tile').length > 0; };
  const insertAt = (tile, x, y) => {
    const others = [...line.querySelectorAll('.tile')].filter((t) => t !== tile && !t.classList.contains('is-assist'));
    let before = null;
    for (const o of others) { const r = o.getBoundingClientRect(); if (y < r.top - 4 || (y <= r.bottom + 4 && x < r.left + r.width / 2)) { before = o; break; } }
    flipMove(tile, () => (before ? before.before(tile) : line.append(tile)));
  };
  tiles.forEach((t) => {
    t.addEventListener('click', () => { flipMove(t, () => (t.parentElement === line ? pool.append(t) : line.append(t))); syncEmpty(); onChange(); });
    draggable(t, { dropSelector: '.ow-line, .ow-pool', onDrop(target, el, ev) { if (target === line) insertAt(el, ev.clientX, ev.clientY); else flipMove(el, () => pool.append(el)); syncEmpty(); onChange(); } });
  });
  pool.append(...tiles);
  stagger(tiles);
  return {
    el: h('div', { class: 'ow' }, line, pool),
    ready: () => line.querySelectorAll('.tile').length > 0,
    answer: () => ({ sequence: [...line.querySelectorAll('.tile')].map((t) => t.dataset.id) }),
    lock() { tiles.forEach((t) => { t.disabled = true; t.classList.add('is-locked'); }); },
    reveal(r) {
      line.classList.add(r.correct ? 'is-right' : 'is-wrong');
      if (r.solution) line.after(h('div', { class: 'sol-box' }, h('b', {}, 'Poprawne zdanie: '), r.solution.sentence));
    },
    assist(a) {
      // początek zdania układa koło ratunkowe – te słowa są zablokowane na początku linii
      const fixed = a.prefix.map((id) => tiles.find((t) => t.dataset.id === id)).filter(Boolean);
      [...line.querySelectorAll('.tile')].filter((t) => !fixed.includes(t)).forEach((t) => pool.append(t));
      fixed.reverse().forEach((t) => flipMove(t, () => line.prepend(t)));
      fixed.forEach((t) => { t.disabled = true; t.classList.add('is-locked', 'is-assist'); });
      syncEmpty(); onChange();
    },
  };
}

/* ---------- Kolejność (oś czasu) ----------
 * Elementy stoją w jednej linii jak na prawdziwej osi czasu, oddzielone odcinkami linii.
 * Przeciąganie działa tylko wzdłuż osi i nie wychodzi poza ramkę. Na wąskim ekranie oś jest pionowa.
 * Można też stuknąć dwa elementy, żeby zamieniły się miejscami, albo użyć strzałek na klawiaturze.
 */
function timeline(v, { onChange }) {
  const track = h('ol', { class: 'tlx-track', 'aria-label': 'Oś – od pierwszego do ostatniego' });
  const items = v.items.map((it) => h('li', { class: 'tlx-item', tabindex: '0', dataset: { id: it.id }, 'aria-label': it.text },
    h('span', { class: 'tlx-dot', 'aria-hidden': 'true' }), h('span', { class: 'tlx-text' }, it.text)));
  track.append(...items);
  const wrap = h('div', { class: 'tlx' }, h('span', { class: 'tlx-end tlx-end--start' }, 'początek'), track, h('span', { class: 'tlx-end tlx-end--stop' }, 'koniec'));
  track.style.setProperty('--n', String(items.length));
  let axis = 'x', selected = null, busy = false;
  const order = () => [...track.children];
  const isLocked = (el) => el.classList.contains('is-locked');

  function layout() {
    const w = wrap.getBoundingClientRect().width;
    const next = w / items.length >= 128 ? 'x' : 'y';
    if (next !== axis || !wrap.classList.contains(`is-${axis}`)) { axis = next; wrap.classList.toggle('is-x', axis === 'x'); wrap.classList.toggle('is-y', axis === 'y'); }
  }
  new ResizeObserver(layout).observe(wrap);
  requestAnimationFrame(layout);

  /** Zmiana kolejności z płynną animacją (FLIP). */
  function arrange(newOrder) {
    const before = new Map(items.map((el) => [el, el.getBoundingClientRect()]));
    items.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
    track.append(...newOrder);
    for (const el of items) {
      const a = before.get(el), b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
    }
    requestAnimationFrame(() => items.forEach((el) => { el.style.transition = ''; }));
    onChange();
  }
  function swap(a, b) {
    const o = order();
    const i = o.indexOf(a), j = o.indexOf(b);
    [o[i], o[j]] = [o[j], o[i]];
    arrange(o);
  }
  function select(el) {
    if (selected === el) { selected = null; el.classList.remove('is-selected'); return; }
    if (selected) { const a = selected; selected = null; a.classList.remove('is-selected'); swap(a, el); return; }
    selected = el; el.classList.add('is-selected');
  }

  items.forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (isLocked(el)) return;
      const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (dir) {
        e.preventDefault();
        const o = order();
        let j = o.indexOf(el) + dir;
        while (o[j] && isLocked(o[j])) j += dir;
        if (o[j]) { swap(el, o[j]); el.focus(); }
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el); }
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || isLocked(el) || busy) return;
      // pozycja liczona względem strony – przy pionowej osi strona może się przewijać w trakcie przeciągania
      const pos = (ev) => (axis === 'x' ? ev.clientX : ev.clientY + scrollY);
      const start = pos(e);
      const sx = e.clientX, sy = e.clientY;
      let active = false, slots = [], free = [], others = [], k = 0, target = 0, lo = 0, hi = 0, last = null, raf = 0;
      /* automatyczne przewijanie, gdy palec/kursor zbliża się do krawędzi ekranu (np. pod dolnym paskiem z przyciskami) */
      const tick = () => {
        raf = 0;
        if (!active || !last || axis !== 'y') return;
        const y = last.clientY, bottom = innerHeight - 110, top = 90;
        const v = y > bottom ? Math.min(18, 4 + (y - bottom) / 4) : y < top ? -Math.min(18, 4 + (top - y) / 4) : 0;
        if (!v) return;
        const before = scrollY;
        scrollBy(0, v);
        if (scrollY !== before) { move(last); raf = requestAnimationFrame(tick); }
      };
      const move = (ev) => {
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          active = true; busy = true;
          if (selected) { selected.classList.remove('is-selected'); selected = null; }
          const o = order();
          slots = o.map((x) => x.getBoundingClientRect());
          free = o.map((x, i) => (isLocked(x) ? -1 : i)).filter((i) => i >= 0);
          k = o.indexOf(el);
          others = free.filter((i) => i !== k).map((i) => ({ el: o[i], slot: i }));
          const T = track.getBoundingClientRect(), R = slots[k];
          lo = axis === 'x' ? T.left - R.left : T.top - R.top;
          hi = axis === 'x' ? T.right - R.right : T.bottom - R.bottom;
          el.classList.add('is-lifted');
          document.body.classList.add('is-dnd');
        }
        ev.preventDefault();
        last = ev;
        if (!raf && axis === 'y') raf = requestAnimationFrame(tick);
        const d = Math.max(lo, Math.min(hi, pos(ev) - start));
        el.style.transform = axis === 'x' ? `translateX(${d}px)` : `translateY(${d}px)`;
        const R = slots[k];
        const c = (axis === 'x' ? R.left + R.width / 2 : R.top + R.height / 2) + d;
        let best = free[0], bd = Infinity;
        for (const i of free) { const S = slots[i]; const sc = axis === 'x' ? S.left + S.width / 2 : S.top + S.height / 2; if (Math.abs(sc - c) < bd) { bd = Math.abs(sc - c); best = i; } }
        target = best;
        // pozostałe elementy rozsuwają się, robiąc miejsce
        const seq = others.map((x) => x.el);
        seq.splice(free.indexOf(target), 0, el);
        seq.forEach((x, n) => {
          if (x === el) return;
          const from = others.find((o) => o.el === x).slot, to = free[n];
          const off = axis === 'x' ? slots[to].left - slots[from].left : slots[to].top - slots[from].top;
          x.style.transform = off ? (axis === 'x' ? `translateX(${off}px)` : `translateY(${off}px)`) : '';
        });
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (!active) return;
        active = false;
        el.classList.remove('is-lifted');
        document.body.classList.remove('is-dnd');
        const o = order();
        const seq = others.map((x) => x.el);
        seq.splice(free.indexOf(target), 0, el);
        const next = o.slice();
        free.forEach((slot, n) => { next[slot] = seq[n]; });
        arrange(next);
        el.classList.add('is-dropped'); setTimeout(() => el.classList.remove('is-dropped'), 400);
        busy = false;
      };
      addEventListener('pointermove', move, { passive: false });
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
    el.addEventListener('click', () => { if (!isLocked(el) && !busy) select(el); });
  });
  stagger(items);
  return {
    el: h('div', {}, h('p', { class: 'play-hint' }, 'Przesuń elementy wzdłuż osi, żeby ustawić je w dobrej kolejności – albo stuknij dwa, żeby zamieniły się miejscami.'), wrap),
    ready: () => true, answer: () => ({ order: order().map((li) => li.dataset.id) }),
    lock() { items.forEach((li) => li.classList.add('is-locked')); },
    reveal(r) {
      order().forEach((li, i) => li.classList.add((Array.isArray(r.parts) ? r.parts[i] : r.correct) ? 'is-right' : 'is-wrong'));
      if (r.solution && !r.correct) {
        const byId = Object.fromEntries(v.items.map((x) => [x.id, x.text]));
        wrap.after(h('div', { class: 'sol-box' }, h('b', {}, 'Poprawna kolejność:'), h('ol', { class: 'sol-ol' }, ...r.solution.order.map((id) => h('li', {}, byId[id])))));
      }
    },
    assist(a) {
      const n = items.length;
      const next = new Array(n).fill(null);
      const fixedEls = new Set();
      for (const f of a.fixed) { const el = items.find((x) => x.dataset.id === f.id); if (el && f.index < n) { next[f.index] = el; fixedEls.add(el); } }
      const rest = order().filter((x) => !fixedEls.has(x));
      for (let i = 0; i < n; i++) if (!next[i]) next[i] = rest.shift();
      fixedEls.forEach((el) => el.classList.add('is-locked', 'is-assist'));
      if (selected) { selected.classList.remove('is-selected'); selected = null; }
      arrange(next);
    },
  };
}

/* ---------- Luki ---------- */
function cloze(v, { onChange }) {
  const inputs = [];
  const para = h('p', { class: 'cloze' }, ...v.segments.map((s) => {
    if (s.t === 'text') return s.v;
    const inp = h('input', { class: 'gap-in', autocomplete: 'off', spellcheck: false, maxlength: 120, 'aria-label': `Luka ${s.i + 1}` });
    const fit = () => { inp.style.width = `${Math.max(5, inp.value.length + 2)}ch`; };
    inp.addEventListener('input', () => { fit(); onChange(); });
    fit();
    inputs.push(inp);
    return inp;
  }));
  return {
    el: para, ready: () => inputs.some((i) => i.value.trim()), answer: () => ({ gaps: inputs.map((i) => i.value) }),
    lock() { inputs.forEach((i) => { i.readOnly = true; }); },
    reveal(r) {
      inputs.forEach((inp, i) => {
        const ok = Array.isArray(r.parts) ? r.parts[i] : r.correct;
        inp.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution) inp.after(h('span', { class: 'gap-sol' }, r.solution.gaps[i].join(' / ')));
      });
    },
    assist(a) {
      for (const [i, val] of Object.entries(a.gaps)) {
        const inp = inputs[Number(i)];
        if (!inp) continue;
        inp.value = val; inp.readOnly = true; inp.classList.add('is-assist');
        inp.style.width = `${Math.max(5, val.length + 2)}ch`;
      }
      onChange();
    },
  };
}

function clozeChoice(v, { onChange }) {
  const chosen = [];
  const btns = [];
  let openMenu = null;
  const close = () => { openMenu?.remove(); openMenu = null; };
  document.addEventListener('pointerdown', (e) => { if (openMenu && !e.target.closest('.gap-menu, .gap-pick')) close(); });
  const para = h('p', { class: 'cloze' }, ...v.segments.map((s) => {
    if (s.t === 'text') return s.v;
    const b = h('button', { type: 'button', class: 'gap-pick', 'aria-haspopup': 'listbox', 'aria-label': `Luka ${s.i + 1}: wybierz` }, h('span', {}, '…'), icon('down'));
    b.addEventListener('click', () => {
      if (openMenu) { const was = openMenu.dataset.for === String(s.i); close(); if (was) return; }
      const menu = h('div', { class: 'gap-menu', role: 'listbox', dataset: { for: String(s.i) } }, ...s.options.map((o) => {
        const it = h('button', { type: 'button', role: 'option', class: 'gap-opt', 'aria-selected': String(chosen[s.i] === o.id) }, o.text);
        it.addEventListener('click', () => { chosen[s.i] = o.id; b.firstChild.textContent = o.text; b.classList.add('is-set'); b.dataset.id = o.id; close(); onChange(); });
        return it;
      }));
      b.after(menu);
      openMenu = menu;
      menu.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      menu.querySelector('.gap-opt')?.focus({ preventScroll: true });
    });
    btns[s.i] = b;
    b.dataset.opts = JSON.stringify(s.options);
    return b;
  }));
  return {
    el: para, ready: () => btns.every((_, i) => chosen[i]), answer: () => ({ gaps: btns.map((_, i) => chosen[i] || null) }),
    lock() { close(); btns.forEach((b) => { b.disabled = true; }); },
    reveal(r) {
      btns.forEach((b, i) => {
        const ok = Array.isArray(r.parts) ? r.parts[i] : r.correct;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution) { const o = JSON.parse(b.dataset.opts).find((x) => x.id === r.solution.gaps[i]); if (o) b.after(h('span', { class: 'gap-sol' }, o.text)); }
      });
    },
    assist(a) {
      close();
      for (const [i, oid] of Object.entries(a.gaps)) {
        const b = btns[Number(i)];
        const o = b && JSON.parse(b.dataset.opts).find((x) => x.id === oid);
        if (!o) continue;
        chosen[Number(i)] = oid; b.firstChild.textContent = o.text; b.classList.add('is-set', 'is-assist'); b.disabled = true;
      }
      onChange();
    },
  };
}

/* ---------- Tabela ---------- */
function table(v, { onChange }) {
  const tb = v.table;
  const inputs = {};
  const t = h('table', { class: 'play-table' }, ...tb.cells.map((row, r) => h('tr', {}, ...row.map((c, cc) => {
    const head = (tb.headerRow && r === 0) || (tb.headerCol && cc === 0);
    if (c.s === 'gone') return h('td', { class: 'is-gone', 'aria-hidden': 'true' });
    if (c.s === 'blank') {
      const inp = h('input', { class: 'cell-in', autocomplete: 'off', spellcheck: false, maxlength: 120, 'aria-label': `Wiersz ${r + 1}, kolumna ${cc + 1}` });
      inp.addEventListener('input', onChange);
      inputs[`${r},${cc}`] = inp;
      return h(head ? 'th' : 'td', { class: 'is-blank' }, inp);
    }
    return h(head ? 'th' : 'td', {}, c.t);
  }))));
  return {
    el: h('div', { class: 'play-table-wrap' }, t),
    ready: () => Object.values(inputs).some((i) => i.value.trim()),
    answer: () => ({ cells: Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) }),
    lock() { Object.values(inputs).forEach((i) => { i.readOnly = true; }); },
    reveal(r) {
      for (const [k, inp] of Object.entries(inputs)) {
        const ok = r.parts ? r.parts[k] : r.correct;
        inp.parentElement.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution) inp.after(h('span', { class: 'cell-sol' }, r.solution.cells[k]));
      }
    },
    assist(a) {
      for (const [k, val] of Object.entries(a.cells)) {
        const inp = inputs[k];
        if (!inp) continue;
        inp.value = val; inp.readOnly = true; inp.parentElement.classList.add('is-assist');
      }
      onChange();
    },
  };
}

/* ---------- Kategorie ---------- */
function categorize(v, { onChange }) {
  const placement = {};
  let selected = null;
  const pool = h('div', { class: 'cz-pool', dataset: { drop: 'pool' } });
  const buckets = v.categories.map((c) => h('div', { class: 'cz-bucket', dataset: { drop: 'cat', cat: String(c.i) }, role: 'button', tabindex: '0', 'aria-label': `Kategoria ${c.name}` },
    h('h4', {}, c.name), h('div', { class: 'cz-items' })));
  const tiles = v.items.map((it) => h('button', { type: 'button', class: 'tile', dataset: { id: it.id } }, it.text));
  const place = (tile, bucket) => {
    if (bucket) { placement[tile.dataset.id] = Number(bucket.dataset.cat); flipMove(tile, () => bucket.querySelector('.cz-items').append(tile)); bucket.classList.remove('pulse'); void bucket.offsetWidth; bucket.classList.add('pulse'); }
    else { delete placement[tile.dataset.id]; flipMove(tile, () => pool.append(tile)); }
    selected = null; sync(); onChange();
  };
  function sync() { tiles.forEach((t) => t.classList.toggle('is-selected', selected === t)); pool.classList.toggle('is-empty', !pool.querySelector('.tile')); buckets.forEach((b) => b.classList.toggle('is-target', !!selected)); }
  tiles.forEach((t) => {
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      const inBucket = t.closest('.cz-bucket');
      if (inBucket && selected && selected !== t) return place(selected, inBucket); // stuknięcie w kategorię (także w leżące w niej słowo)
      if (inBucket) return place(t, null);
      selected = selected === t ? null : t; sync();
    });
    draggable(t, { dropSelector: '.cz-bucket, .cz-pool', onDrop(target) { place(t, target.classList.contains('cz-bucket') ? target : null); } });
  });
  buckets.forEach((b) => {
    const act = () => { if (selected) place(selected, b); };
    b.addEventListener('click', act);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
  pool.append(...tiles);
  stagger(tiles);
  sync();
  return {
    el: h('div', {}, h('p', { class: 'play-hint' }, 'Przeciągnij każde słowo do właściwej kategorii – albo stuknij słowo, a potem kategorię.'), pool,
      h('div', { class: 'cz-grid', style: { '--n': String(Math.min(3, v.categories.length)) } }, ...buckets)),
    ready: () => v.items.every((it) => placement[it.id] !== undefined), answer: () => ({ placement }),
    lock() { tiles.forEach((t) => { t.disabled = true; t.classList.add('is-locked'); }); },
    reveal(r) {
      tiles.forEach((t) => {
        const ok = r.parts ? r.parts[t.dataset.id] : r.correct;
        t.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution) { const ci = r.solution.placement[t.dataset.id]; t.append(h('small', { class: 'tile-sol' }, `→ ${v.categories.find((c) => c.i === ci)?.name}`)); }
      });
    },
    assist(a) {
      for (const [tid, ci] of Object.entries(a.placement)) {
        const t = tiles.find((x) => x.dataset.id === tid);
        const b = buckets.find((x) => Number(x.dataset.cat) === ci);
        if (!t || !b) continue;
        place(t, b);
        t.disabled = true; t.classList.add('is-locked', 'is-assist');
      }
    },
  };
}

/* ---------- Obrazek z punktami ---------- */
// Na obrazku są litery punktów; nazwy trafiają do listy „a) … b) …” pod obrazkiem.
// Upuścić (lub stuknąć) można zarówno punkt na obrazku, jak i wiersz listy.
function imageLabels(v, { onChange }) {
  const placement = {};
  let selected = null;
  const pool = h('div', { class: 'il-pool', dataset: { drop: 'pool' } });
  const chips = v.labels.map((l) => h('button', { type: 'button', class: 'tile tile--label', dataset: { id: l.id } }, l.text));
  const pins = v.points.map((p) => h('button', { type: 'button', class: 'il-mark', style: { left: `${p.x}%`, top: `${p.y}%` }, dataset: { drop: 'pin', pin: String(p.i) }, 'aria-label': `Punkt ${p.letter} na obrazku` }, p.letter));
  const slots = v.points.map((p) => h('div', { class: 'il-slot', dataset: { drop: 'pin', pin: String(p.i) } }, h('span', { class: 'il-ph' }, 'przeciągnij tu nazwę')));
  const rows = v.points.map((p, i) => h('div', { class: 'il-row', role: 'button', tabindex: '0', dataset: { pin: String(p.i) }, 'aria-label': `Punkt ${p.letter}` },
    h('span', { class: 'il-row__letter' }, `${p.letter})`), slots[i]));
  const stage = h('div', { class: 'il-play' }, h('img', { src: v.diagram, alt: 'Obrazek do podpisania', draggable: false }), ...pins);
  const place = (chip, pinIdx) => {
    if (pinIdx !== null && rows[pinIdx]?.classList.contains('is-assist')) return; // punkt podpisany kołem ratunkowym
    for (const [k, id] of Object.entries(placement)) if (id === chip.dataset.id) delete placement[k];
    if (pinIdx !== null) {
      const prev = placement[pinIdx];
      if (prev && prev !== chip.dataset.id) { const old = chips.find((c) => c.dataset.id === prev); flipMove(old, () => pool.append(old)); }
      placement[pinIdx] = chip.dataset.id;
      flipMove(chip, () => slots[pinIdx].append(chip));
      pins[pinIdx].classList.remove('pulse'); void pins[pinIdx].offsetWidth; pins[pinIdx].classList.add('pulse');
    } else flipMove(chip, () => pool.append(chip));
    selected = null; sync(); onChange();
  };
  function sync() {
    chips.forEach((c) => c.classList.toggle('is-selected', selected === c));
    v.points.forEach((p, i) => { pins[i].classList.toggle('is-filled', !!placement[i]); rows[i].classList.toggle('is-target', !!selected); pins[i].classList.toggle('is-target', !!selected); });
  }
  const target = (el) => Number(el.dataset.pin);
  chips.forEach((c) => {
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = c.closest('.il-slot');
      if (slot && selected && selected !== c) return place(selected, target(slot));
      if (slot) return place(c, null);
      selected = selected === c ? null : c; sync();
    });
    draggable(c, { dropSelector: '.il-mark, .il-slot, .il-pool', onDrop(t) { place(c, t.classList.contains('il-pool') ? null : target(t)); } });
  });
  const tapTarget = (el) => () => { if (selected) place(selected, target(el)); else if (el.classList.contains('il-mark')) rows[target(el)].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  pins.forEach((p) => p.addEventListener('click', tapTarget(p)));
  rows.forEach((r) => {
    r.addEventListener('click', tapTarget(r));
    r.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && selected) { e.preventDefault(); place(selected, target(r)); } });
  });
  pool.append(...chips);
  stagger(chips);
  return {
    el: h('div', {}, h('p', { class: 'play-hint' }, 'Przeciągnij nazwy do punktów (na obrazek albo do listy pod nim) – albo stuknij nazwę, a potem punkt.'),
      stage, h('div', { class: 'il-rows' }, ...rows), h('p', { class: 'il-pool-label' }, 'Nazwy do wyboru:'), pool),
    ready: () => v.points.every((p) => placement[p.i]), answer: () => ({ placement }),
    lock() { chips.forEach((c) => { c.disabled = true; c.classList.add('is-locked'); }); pins.forEach((p) => { p.disabled = true; }); },
    reveal(r) {
      rows.forEach((row, i) => {
        const ok = Array.isArray(r.parts) ? r.parts[i] : r.correct;
        row.classList.add(ok ? 'is-right' : 'is-wrong');
        pins[i].classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution) { const want = v.labels.find((l) => l.id === r.solution.placement[i]); if (want) row.append(h('span', { class: 'il-sol' }, `→ ${want.text}`)); }
      });
    },
    assist(a) {
      for (const [pi, lid] of Object.entries(a.placement)) {
        const c = chips.find((x) => x.dataset.id === lid);
        if (!c) continue;
        place(c, Number(pi));
        c.disabled = true; c.classList.add('is-locked', 'is-assist');
        rows[Number(pi)].classList.add('is-assist');
      }
    },
  };
}

/* ---------- Przeczytaj i odpowiedz ---------- */
function data(v, { onChange, serve }) {
  const key = `edukro-read-${serve}`;
  let stage = 1;
  try { if (sessionStorage.getItem(key)) stage = 2; } catch {}
  const boxes = v.questions.map((q) => writeBox({ min: q.minWords, max: q.maxWords }, onChange));
  const el = h('div', { class: 'data-q' });
  const showQuestions = () => {
    stage = 2;
    try { sessionStorage.setItem(key, '1'); } catch {}
    el.replaceChildren(...v.questions.map((q, i) => h('div', { class: 'data-sub pop-in', style: { '--i': i } }, h('p', { class: 'data-sub__q' }, h('span', { class: 'tf-num' }, String(i + 1)), q.prompt), boxes[i].el)));
    onChange();
    boxes[0]?.ta.focus();
  };
  if (stage === 1) {
    const next = h('button', { class: 'btn btn--primary', type: 'button' }, g('Przeczytałem – dalej', 'Przeczytałam – dalej'), icon('arrowRight'));
    next.addEventListener('click', () => { el.classList.add('is-leaving'); setTimeout(showQuestions, 260); });
    el.append(h('article', { class: 'passage' }, v.passageImage ? h('img', { src: v.passageImage, alt: '' }) : null, h('p', {}, v.passage)),
      h('p', { class: 'play-hint' }, 'Czytaj uważnie – po kliknięciu „Dalej” tekst zniknie.'), h('div', { class: 'actions' }, next));
  } else showQuestions();
  return {
    el, ready: () => stage === 2 && boxes.some((b) => b.ta.value.trim()) && boxes.every((b) => !b.ta.value.trim() || b.ok()),
    answer: () => ({ answers: boxes.map((b) => b.ta.value) }),
    hidesSubmit: () => stage === 1,
    lock() { boxes.forEach((b) => { b.ta.readOnly = true; }); },
    reveal(r) {
      boxes.forEach((b, i) => {
        const ok = Array.isArray(r.parts) ? r.parts[i] : r.correct;
        b.el.classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok && r.solution?.samples?.[i]) b.el.after(sampleSolution(r.solution.samples[i]));
      });
    },
  };
}

/* ---------- Zadanie na słuch: lektor czyta, uczeń zapisuje ---------- */
function listen(v, { onChange }) {
  const sp = v.speech || {};
  let plays = 0;
  const say = (rate) => {
    const text = showSpeech(sp.code, sp.seed);
    if (!sound.canSpeak()) { info.textContent = 'Ta przeglądarka nie potrafi czytać na głos – poproś nauczyciela o pomoc.'; return; }
    if (!sound.settings().on) info.textContent = 'Dźwięk w EDUKRO jest wyłączony – lektor i tak przeczyta (włączysz go w Ustawienia → Dźwięk).';
    plays++; playBtn.classList.add('is-played');
    playBtn.querySelector('small').textContent = `słuchano: ${plays}×`;
    sound.speak(text, { force: true, lang: sp.lang || 'en-GB', voice: sp.voice || null, rate });
  };
  const playBtn = h('button', { class: 'listen__play', type: 'button', 'aria-label': 'Posłuchaj lektora', onClick: () => say() }, icon('volume'), h('span', {}, h('b', {}, 'Posłuchaj'), h('small', {}, 'kliknij, ile razy chcesz')));
  const slow = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => say(0.6) }, icon('clock'), 'Wolniej');
  const info = h('p', { class: 'muted small listen__info', 'aria-live': 'polite' });
  const inp = h('input', { class: 'input listen__in', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 300, placeholder: 'Zapisz, co usłyszałeś…', 'aria-label': 'Co powiedział lektor' });
  inp.placeholder = g('Zapisz, co usłyszałeś…', 'Zapisz, co usłyszałaś…');
  inp.addEventListener('input', onChange);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  const langName = { 'pl-PL': 'po polsku', 'en-GB': 'po angielsku', 'en-US': 'po angielsku', 'de-DE': 'po niemiecku', 'fr-FR': 'po francusku', 'es-ES': 'po hiszpańsku', 'it-IT': 'po włosku', 'ru-RU': 'po rosyjsku' }[sp.lang] || '';
  const el = h('div', { class: 'listen' }, h('div', { class: 'listen__row' }, playBtn, slow, langName ? h('span', { class: 'chip' }, `Lektor mówi ${langName}`) : null), inp, info);
  return {
    el, ready: () => !!inp.value.trim(), answer: () => ({ text: inp.value }),
    lock() { inp.readOnly = true; },
    reveal(r) {
      inp.classList.add(r.correct ? 'is-right' : 'is-wrong');
      if (r.solution?.text) el.append(h('div', { class: 'sol-box' }, h('b', {}, 'Lektor powiedział: '), r.solution.text, ' ',
        h('button', { class: 'linkish', type: 'button', onClick: () => sound.speak(r.solution.text, { force: true, lang: r.solution.lang || sp.lang, voice: sp.voice || null }) }, icon('volume'), 'posłuchaj jeszcze raz')));
    },
    assist(a) { inp.value = `${a.text} `; inp.classList.add('is-assist'); onChange(); inp.focus(); },
  };
}

export const WIDGETS = {
  single, multi, truefalse, open, number, match, order_words: orderWords, timeline,
  cloze, cloze_choice: clozeChoice, table, categorize, image_labels: imageLabels, data, listen,
};
