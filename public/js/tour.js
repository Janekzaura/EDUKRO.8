// Silnik samouczka: przyciemnienie ekranu z „oknem” na wskazany przycisk, skacząca strzałka,
// dymek z opisem (tekst + lektor), kroki „kliknij tutaj” / „wpisz” / „dalej”; „Pomiń samouczek” pojawia się na 3 s po naciśnięciu Esc.
import { h, icon, raise } from './ui.js';
import { navigate } from './app.js';
import * as sound from './sound.js';

let current = null;
export const tourActive = () => !!current;
export const tourId = () => current?.id || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spoken = (s) => `${s.title ? `${s.title}. ` : ''}${s.text}${s.tips?.length ? ` ${s.tips.join(' ')}` : ''}`;
function resolveTarget(t) {
  if (!t) return null;
  if (typeof t === 'function') return t();
  if (typeof t === 'string') {
    // „selektor::tekst” – element pasujący do selektora i zawierający tekst
    const [sel, txt] = t.split('::');
    const list = [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null || el.getClientRects().length);
    return txt ? list.find((el) => el.textContent.toLocaleLowerCase('pl-PL').includes(txt.toLocaleLowerCase('pl-PL'))) || null : list[0] || null;
  }
  return t;
}
async function waitFor(target, ms = 9000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const el = resolveTarget(target);
    if (el) return el;
    if (!current) return null;
    await sleep(120);
  }
  return null;
}

/**
 * Uruchamia samouczek.
 * step = { title, text, target?, route?, action?: 'next'|'click'|'input'|'custom', fill?, doLabel?, do?(), before?(), wait?, final?, dock? }
 * dock: dymek w rogu ekranu, a cała strona zostaje dostępna – do kroków „zrób to sam albo kliknij Wpisz za mnie”.
 */
export function runTour(steps, { id = 'tour', title = 'Samouczek', onEnd } = {}) {
  if (current) current.stop('replaced');
  const root = h('div', { class: 'tour', 'aria-live': 'polite' });
  const spot = h('div', { class: 'tour__spot', hidden: true });
  const ring = h('div', { class: 'tour__ring', hidden: true });
  const arrow = h('div', { class: 'tour__arrow', hidden: true }, icon('arrowRight'));
  const blockers = [0, 1, 2, 3].map(() => h('div', { class: 'tour__block' }));
  const full = h('div', { class: 'tour__block tour__block--full' });
  const card = h('div', { class: 'tour__card', role: 'dialog', 'aria-label': title });
  const skipBar = h('div', { class: 'tour__top', hidden: true },
    h('span', { class: 'tour__badge' }, icon('play'), `${title} – aby wyjść, kliknij:`),
    h('button', { class: 'btn btn--ghost btn--sm tour__skip', type: 'button', 'data-help-ui': '', onClick: () => stop('skip') }, icon('x'), 'Pomiń samouczek'));
  root.append(full, ...blockers, spot, ring, arrow, card, skipBar);
  document.body.append(root);
  raise(root);
  const onDialog = () => setTimeout(() => raise(root), 30);
  document.addEventListener('edukro:dialog-open', onDialog);
  document.addEventListener('edukro:dialog-close', onDialog);
  document.body.classList.add('is-touring');

  let i = 0, el = null, raf = 0, token = 0, cleanupStep = null;
  const state = { id, stop, next: () => go(i + 1), back: () => go(i - 1) };
  current = state;

  function place() {
    raf = requestAnimationFrame(place);
    const s = steps[i];
    if (s?.dock) {
      spot.hidden = ring.hidden = arrow.hidden = full.hidden = true;
      blockers.forEach((b) => { b.hidden = true; });
      card.classList.remove('is-center');
      card.classList.add('is-dock');
      card.style.left = card.style.top = '';
      return;
    }
    card.classList.remove('is-dock', 'is-min');
    if (el && !el.isConnected) el = resolveTarget(s?.target);
    if (!el) {
      spot.hidden = ring.hidden = arrow.hidden = true;
      blockers.forEach((b) => { b.hidden = true; });
      full.hidden = false;
      full.classList.remove('is-clear');
      card.classList.add('is-center');
      card.style.left = card.style.top = '';
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, hgt = r.height + pad * 2;
    spot.hidden = ring.hidden = false;
    Object.assign(spot.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` });
    Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` });
    const interactive = s.action === 'click' || s.action === 'input' || s.action === 'custom';
    full.hidden = interactive;
    full.classList.add('is-clear');
    blockers.forEach((b) => { b.hidden = !interactive; });
    if (interactive) {
      Object.assign(blockers[0].style, { left: '0', top: '0', width: '100vw', height: `${Math.max(0, y)}px` });
      Object.assign(blockers[1].style, { left: '0', top: `${y + hgt}px`, width: '100vw', height: `${Math.max(0, innerHeight - y - hgt)}px` });
      Object.assign(blockers[2].style, { left: '0', top: `${y}px`, width: `${Math.max(0, x)}px`, height: `${hgt}px` });
      Object.assign(blockers[3].style, { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, innerWidth - x - w)}px`, height: `${hgt}px` });
    }
    // dymek: pod, nad albo obok elementu; strzałka między dymkiem a elementem, wskazuje element
    card.classList.remove('is-center');
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const gap = 56, A = 36;
    let cx, cy, side;
    if (y + hgt + gap + ch < innerHeight - 10) { side = 'below'; cy = y + hgt + gap; }
    else if (y - gap - ch > 64) { side = 'above'; cy = y - gap - ch; }
    else if (x + w + gap + cw < innerWidth - 10) { side = 'right'; cy = Math.min(Math.max(70, y + hgt / 2 - ch / 2), innerHeight - ch - 10); }
    else if (x - gap - cw > 10) { side = 'left'; cy = Math.min(Math.max(70, y + hgt / 2 - ch / 2), innerHeight - ch - 10); }
    else { side = 'over'; cy = innerHeight - ch - 16; }
    if (side === 'right') cx = x + w + gap;
    else if (side === 'left') cx = x - gap - cw;
    else cx = Math.min(Math.max(10, x + w / 2 - cw / 2), innerWidth - cw - 10);
    card.style.left = `${cx}px`; card.style.top = `${cy}px`;
    arrow.hidden = side === 'over';
    let ax, ay, rot;
    if (side === 'below') { ax = x + w / 2 - A / 2; ay = y + hgt + 10; rot = -90; }
    else if (side === 'above') { ax = x + w / 2 - A / 2; ay = y - A - 10; rot = 90; }
    else if (side === 'right') { ax = x + w + 10; ay = y + hgt / 2 - A / 2; rot = 180; }
    else { ax = x - A - 10; ay = y + hgt / 2 - A / 2; rot = 0; }
    arrow.style.left = `${Math.max(4, Math.min(innerWidth - A - 4, ax))}px`;
    arrow.style.top = `${Math.max(4, Math.min(innerHeight - A - 4, ay))}px`;
    arrow.style.setProperty('--rot', `${rot}deg`);
  }

  async function go(n) {
    cleanupStep?.(); cleanupStep = null;
    if (n < 0) n = 0;
    if (n >= steps.length) return stop('done');
    i = n;
    const my = ++token;
    const s = steps[i];
    sound.stopSpeaking();
    card.classList.add('is-loading');
    card.replaceChildren(h('p', { class: 'tour__wait' }, icon('clock'), 'Chwileczkę…'));
    el = null;
    if (s.route && location.pathname + location.search !== s.route) { navigate(s.route); await sleep(400); }
    if (s.before) { try { await s.before(); } catch (e) { console.warn('[samouczek]', e); } }
    if (my !== token) return;
    if (s.target) el = await waitFor(s.target, s.wait || 9000);
    if (my !== token) return;
    if (el && s.scroll !== false && !s.dock) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 40) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(380); }
    }
    if (my !== token) return;
    renderCard(s);
    card.classList.remove('is-loading');
    sound.play('step');
    sound.speak(spoken(s));
    if (s.action === 'click' && el) {
      const onClick = () => { if (my === token) setTimeout(() => go(i + 1), s.delay ?? 450); };
      el.addEventListener('click', onClick, { once: true });
      cleanupStep = () => el?.removeEventListener('click', onClick);
    }
    if (s.action === 'input' && el) {
      const inp = el.matches('input, textarea, select') ? el : el.querySelector('input, textarea, select');
      const check = () => { const ok = !!inp?.value?.trim(); card.querySelector('.tour__next')?.toggleAttribute('disabled', !ok); };
      inp?.addEventListener('input', check);
      check();
      cleanupStep = () => inp?.removeEventListener('input', check);
      setTimeout(() => inp?.focus({ preventScroll: true }), 300);
    }
    if (s.action === 'custom' && s.watch) {
      const iv = setInterval(() => { if (my === token && s.watch()) { clearInterval(iv); setTimeout(() => go(i + 1), s.delay ?? 300); } }, 200);
      cleanupStep = () => clearInterval(iv);
    }
  }

  function renderCard(s) {
    const missing = s.target && !el;
    const isLast = i === steps.length - 1 || s.final;
    const nextBtn = h('button', { class: 'btn btn--primary btn--sm tour__next', type: 'button', 'data-help-ui': '' }, isLast ? (s.finalLabel || 'Zakończ') : 'Dalej', isLast ? null : icon('arrowRight'));
    nextBtn.addEventListener('click', () => go(i + 1));
    const doBtn = s.do || s.fill ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-help-ui': '' }, icon('sparkle'), s.doLabel || (s.fill ? 'Wpisz za mnie' : 'Zrób to za mnie')) : null;
    doBtn?.addEventListener('click', async () => {
      if (s.fill && el) {
        const inp = el.matches('input, textarea') ? el : el.querySelector('input, textarea');
        if (inp) { inp.value = s.fill; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
        if (s.action !== 'input') go(i + 1);
        else card.querySelector('.tour__next')?.removeAttribute('disabled');
        return;
      }
      doBtn.classList.add('is-busy');
      try { await s.do(); } finally { doBtn.classList.remove('is-busy'); }
      if (s.action !== 'click') go(i + 1);
    });
    const voiceOn = sound.settings().voice && sound.settings().on;
    const voiceBtn = sound.canSpeak() ? h('button', { class: ['icon-btn tour__voice', !voiceOn && 'is-off'], type: 'button', 'data-help-ui': '', 'aria-label': voiceOn ? 'Wycisz lektora' : 'Włącz lektora', title: voiceOn ? 'Wycisz lektora' : 'Włącz lektora' }, icon(voiceOn ? 'volume' : 'volumeOff')) : null;
    voiceBtn?.addEventListener('click', () => {
      const on = !(sound.settings().voice && sound.settings().on);
      sound.update({ voice: on, on: on ? true : sound.settings().on });
      if (on) sound.speak(spoken(s)); else sound.stopSpeaking();
      renderCard(s);
    });
    const hint = s.action === 'click' && el ? h('p', { class: 'tour__do' }, icon('target'), s.hint || 'Kliknij podświetlony przycisk.')
      : s.action === 'input' && el ? h('p', { class: 'tour__do' }, icon('edit'), s.hint || 'Wpisz tekst w podświetlone pole.') : s.hint ? h('p', { class: 'tour__do' }, icon('info'), s.hint) : null;
    const minBtn = s.dock ? h('button', { class: 'icon-btn tour__min', type: 'button', 'data-help-ui': '', 'aria-label': 'Zwiń / rozwiń dymek', title: 'Zwiń / rozwiń dymek' }, icon('down')) : null;
    minBtn?.addEventListener('click', () => card.classList.toggle('is-min'));
    card.replaceChildren(
      h('div', { class: 'tour__head' }, h('span', { class: 'tour__count' }, `${i + 1} / ${steps.length}`), h('span', { class: 'tour__head-r' }, voiceBtn, minBtn)),
      s.title ? h('h3', {}, s.title) : null,
      h('p', { class: 'tour__text' }, s.text),
      s.tips?.length ? h('ul', { class: 'tour__tips' }, ...s.tips.map((t) => h('li', {}, t))) : null,
      missing && !s.dock ? h('p', { class: 'tour__do tour__do--warn' }, icon('info'), 'Nie widzę tego miejsca na ekranie – możesz przejść dalej.') : hint,
      h('p', { class: 'tour__esc' }, 'Wyjście: naciśnij Esc i kliknij „Pomiń samouczek”.'),
      h('div', { class: 'tour__acts' },
        i > 0 && !s.noBack ? h('button', { class: 'btn btn--quiet btn--sm', type: 'button', 'data-help-ui': '', onClick: () => go(i - 1) }, icon('arrowLeft'), 'Wstecz') : h('span'),
        h('div', { class: 'tour__acts-r' }, isLast && s.finalLabel ? h('button', { class: 'btn btn--quiet btn--sm', type: 'button', 'data-help-ui': '', onClick: () => stop('done-only') }, 'Zakończ') : null, doBtn, (s.action === 'click' && el) ? null : nextBtn)));
  }

  let skipTimer = null;
  function revealSkip() {
    skipBar.hidden = false;
    skipBar.classList.remove('is-pop'); void skipBar.offsetWidth; skipBar.classList.add('is-pop');
    clearTimeout(skipTimer);
    skipTimer = setTimeout(() => { skipBar.hidden = true; skipBar.classList.remove('is-pop'); }, 3000);
  }
  function onKey(e) {
    // Esc nie kończy samouczka (łatwo go wcisnąć przez przypadek) – na 3 s pokazuje przycisk „Pomiń samouczek”
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); revealSkip(); return; }
    if ((e.key === 'ArrowRight' || e.key === 'Enter') && !e.target.closest('input, textarea, select, [contenteditable]') && !steps[i]?.dock && !['click', 'input'].includes(steps[i]?.action)) { e.preventDefault(); go(i + 1); }
  }
  addEventListener('keydown', onKey, true);

  function stop(reason = 'skip') {
    if (current !== state) return;
    current = null;
    token++;
    cleanupStep?.();
    clearTimeout(skipTimer);
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true);
    document.removeEventListener('edukro:dialog-open', onDialog);
    document.removeEventListener('edukro:dialog-close', onDialog);
    sound.stopSpeaking();
    root.classList.add('is-out');
    document.body.classList.remove('is-touring');
    setTimeout(() => root.remove(), 220);
    onEnd?.(reason, id);
  }

  place();
  go(0);
  return state;
}
export function stopTour() { current?.stop('skip'); }
