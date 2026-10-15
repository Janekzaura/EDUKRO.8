// Przeciąganie wskaźnikiem (mysz, palec, rysik). Krótkie dotknięcie bez ruchu = zwykłe kliknięcie,
// dzięki czemu każdy element da się też obsłużyć stuknięciami (wybierz → stuknij cel).

const THRESHOLD = 6;

/** Przewijanie strony, gdy przeciągany element zbliża się do górnej lub dolnej krawędzi ekranu. */
function autoScroller() {
  let y = null, raf = null;
  const loop = () => {
    if (y !== null) {
      const top = 130, bottom = innerHeight - 130;
      const v = y < top ? -Math.ceil((top - y) / 6) : y > bottom ? Math.ceil((y - bottom) / 6) : 0;
      if (v) scrollBy(0, Math.max(-24, Math.min(24, v)));
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { set(v) { y = v; }, stop() { cancelAnimationFrame(raf); } };
}
let suppressClick = false;
document.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);

/**
 * draggable(el, { onDrop(target, el), onMove(x, y, target), onStart(), onEnd(), dropSelector })
 * Cele upuszczenia: elementy z atrybutem data-drop (lub pasujące do dropSelector).
 */
export function draggable(el, opts = {}) {
  const sel = opts.dropSelector || '[data-drop]';
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || el.classList.contains('is-locked')) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, over = null, offX = 0, offY = 0, scroller = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
        const r = el.getBoundingClientRect();
        offX = sx - r.left; offY = sy - r.top;
        ghost = el.cloneNode(true);
        ghost.classList.add('dnd-ghost');
        Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: '0px', top: '0px' });
        document.body.append(ghost);
        el.classList.add('is-dragging');
        document.body.classList.add('is-dnd');
        scroller = autoScroller();
        opts.onStart && opts.onStart(el);
      }
      scroller.set(ev.clientY);
      ev.preventDefault();
      ghost.style.transform = `translate(${ev.clientX - offX}px, ${ev.clientY - offY}px) rotate(-2deg) scale(1.04)`;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(sel) || null;
      if (hit !== over) { over?.classList.remove('is-over'); over = hit; over?.classList.add('is-over'); }
      opts.onMove && opts.onMove(ev.clientX, ev.clientY, over);
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (!ghost) return;
      scroller?.stop();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 50);
      over?.classList.remove('is-over');
      ghost.remove();
      el.classList.remove('is-dragging');
      document.body.classList.remove('is-dnd');
      if (ev.type === 'pointerup' && over && opts.onDrop) opts.onDrop(over, el, ev);
      opts.onEnd && opts.onEnd(el);
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
}

/**
 * Lista do układania w kolejności (pionowa). Przeciągnij element albo użyj strzałek.
 * sortable(list, { item: '.x', onChange(order) })
 */
export function sortable(list, { item, onChange }) {
  const items = () => [...list.querySelectorAll(item)];
  for (const el of items()) attach(el);
  function attach(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || el.classList.contains('is-locked') || e.target.closest('button')) return;
      const sy = e.clientY, sx = e.clientX;
      let active = false, ph = null, offY = 0, startRect = null, scroller = null;
      const move = (ev) => {
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
          active = true;
          startRect = el.getBoundingClientRect();
          offY = sy - startRect.top;
          ph = document.createElement('div');
          ph.className = 'sort-ph';
          ph.style.height = `${startRect.height}px`;
          el.after(ph);
          Object.assign(el.style, { position: 'fixed', left: `${startRect.left}px`, top: `${startRect.top}px`, width: `${startRect.width}px`, zIndex: 1000 });
          el.classList.add('is-lifted');
          document.body.classList.add('is-dnd');
          scroller = autoScroller();
        }
        scroller.set(ev.clientY);
        ev.preventDefault();
        el.style.top = `${ev.clientY - offY}px`;
        const others = items().filter((x) => x !== el);
        let before = null;
        for (const o of others) { const r = o.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { before = o; break; } }
        if (before) before.before(ph); else list.append(ph);
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        if (!active) return;
        scroller?.stop();
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 50);
        ph.replaceWith(el);
        el.removeAttribute('style');
        el.classList.remove('is-lifted');
        el.classList.add('is-dropped');
        setTimeout(() => el.classList.remove('is-dropped'), 400);
        document.body.classList.remove('is-dnd');
        onChange && onChange(items());
      };
      addEventListener('pointermove', move, { passive: false });
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
  }
  return { attach };
}

/** Płynne przeniesienie elementu w nowe miejsce DOM (technika FLIP). */
export function flipMove(el, doMove) {
  const a = el.getBoundingClientRect();
  doMove();
  const b = el.getBoundingClientRect();
  const dx = a.left - b.left, dy = a.top - b.top;
  if (!dx && !dy) return;
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.25,1.15)' });
}
