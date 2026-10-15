// Podgląd na żywo w edytorze lekcji: małe okienko z aktualnym slajdem (jak na tablicy), które można
// przeciągnąć w dowolne miejsce ekranu; kliknięcie otwiera zwykły podgląd tego slajdu. Odświeża się przy każdej zmianie.
import { h, icon } from '../ui.js';
import { renderSlide, paintBg } from './lesson-slides.js';
import { mediaUrl } from '../media.js';
import { TYPE } from '../shared/quiz-rules.js';
import { SLIDE } from '../shared/lesson-rules.js';

const KEY = 'edukro-live-preview';
const W = 1280, H = 720;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const store = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...v })); } catch { /* prywatne okno */ } };

/** Pytanie na slajdzie – w podglądzie bez sprawdzania (to robi serwer na lekcji). */
function questionPreview(s) {
  const q = s.question || {};
  const opts = Array.isArray(q.options) ? q.options.filter((o) => typeof o === 'string' && o.trim()) : [];
  return {
    el: h('div', { class: 'slide slide--question' }, h('article', { class: ['q-card-play', 'slide-card'] },
      h('p', { class: 'q-num' }, s.title || 'Pytanie'),
      h('h2', { class: 'q-prompt' }, q.prompt || 'Treść pytania…'),
      q.image ? h('div', { class: 'q-img' }, h('img', { src: mediaUrl(q.image), alt: '' })) : null,
      opts.length ? h('div', { class: 'lp-opts' }, ...opts.map((o, i) => h('span', {}, h('b', {}, String.fromCharCode(65 + i)), ` ${o}`)))
        : h('p', { class: 'muted' }, `${TYPE[q.type]?.label || 'Pytanie'} – na lekcji uczniowie odpowiadają tutaj.`))),
  };
}
function slideEl(s, accent) {
  if (!s) return h('div', { class: 'slide' }, h('p', { class: 'muted' }, 'Wybierz slajd, aby zobaczyć podgląd.'));
  let o;
  try {
    o = s.type === 'question' ? questionPreview(s)
      : renderSlide(s, { checkUrl: null, roster: [], preview: true, className: null, award: () => Promise.resolve({ preview: true }), celebrate: () => {}, games: null });
    o.enter?.();
  } catch { o = { el: h('div', { class: 'slide' }, h('p', { class: 'muted' }, 'Ten slajd nie jest jeszcze gotowy do podglądu.')) }; }
  // w podglądzie wszystko od razu widoczne (bez „pojawia się po kliknięciu”)
  o.el.querySelectorAll('.is-hidden').forEach((x) => x.classList.remove('is-hidden'));
  o.el.querySelectorAll('.slide-more, .more-btn').forEach((x) => { x.hidden = true; });
  // te same klasy co na zwykłym podglądzie (.present__stage > .present__slide.type-…), tylko w ramce 1280×720
  const stageEl = h('div', { class: 'present__stage lp-stage' }, h('div', { class: `present__slide type-${s.type}` }, o.el));
  paintBg(stageEl, s.look?.bg);
  return h('div', { class: `lp-present acc-${accent || 'amber'}` }, stageEl);
}

export function livePreview({ getSlide, accent, onOpen }) {
  const saved = load();
  const stage = h('div', { class: 'lp__stage', inert: true });
  const scaler = h('div', { class: 'lp__scaler' }, stage);
  const label = h('span', { class: 'lp__label' });
  const minBtn = h('button', { class: 'lp__btn', type: 'button', 'aria-label': 'Zwiń podgląd', title: 'Zwiń / rozwiń' }, icon('minus'));
  const fsBtn = h('button', { class: 'lp__btn', type: 'button', 'aria-label': 'Otwórz podgląd', title: 'Otwórz podgląd' }, icon('expand'));
  const head = h('div', { class: 'lp__head', title: 'Przeciągnij, aby przesunąć' }, icon('grip'), h('b', {}, 'Podgląd na żywo'), label, minBtn, fsBtn);
  const box = h('div', { class: ['lp', saved.min && 'is-min'], role: 'complementary', 'aria-label': 'Podgląd slajdu na żywo', 'data-help': 'Podgląd na żywo: tak wygląda bieżący slajd na tablicy. Przeciągnij okienko za pasek w dowolne miejsce, kliknij je, żeby przejść do zwykłego podglądu tego slajdu.' },
    head, h('button', { class: 'lp__view', type: 'button', 'aria-label': 'Otwórz podgląd tego slajdu', onClick: () => onOpen?.() }, scaler));
  document.body.append(box);
  // pozycja zapamiętana na tym urządzeniu
  const place = (x, y) => {
    const r = box.getBoundingClientRect();
    const nx = Math.max(4, Math.min(innerWidth - r.width - 4, x));
    const ny = Math.max(4, Math.min(innerHeight - r.height - 4, y));
    box.style.left = `${nx}px`; box.style.top = `${ny}px`; box.style.right = 'auto'; box.style.bottom = 'auto';
    return [nx, ny];
  };
  if (Number.isFinite(saved.x)) requestAnimationFrame(() => place(saved.x, saved.y));
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.lp__btn')) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    box.classList.add('is-drag');
    head.setPointerCapture(e.pointerId);
    let last = [r.left, r.top];
    const move = (ev) => { last = place(ev.clientX - dx, ev.clientY - dy); };
    const up = () => { box.classList.remove('is-drag'); head.removeEventListener('pointermove', move); store({ x: last[0], y: last[1] }); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up, { once: true });
    head.addEventListener('pointercancel', up, { once: true });
  });
  minBtn.addEventListener('click', () => { const m = box.classList.toggle('is-min'); store({ min: m }); minBtn.replaceChildren(icon(m ? 'plus' : 'minus')); });
  if (saved.min) minBtn.replaceChildren(icon('plus'));
  fsBtn.addEventListener('click', () => onOpen?.());
  const onResize = () => { const r = box.getBoundingClientRect(); if (box.style.left) place(r.left, r.top); };
  addEventListener('resize', onResize);

  let t = null;
  function draw() {
    const { slide, index, total } = getSlide();
    const txt = slide ? `Slajd ${index + 1}/${total} · ${SLIDE[slide.type]?.label || ''}` : '';
    label.textContent = txt;
    stage.replaceChildren(slideEl(slide, accent()));
    // cały slajd mieści się w okienku (dłuższe slajdy są pomniejszone)
    requestAnimationFrame(() => {
      const bw = scaler.clientWidth || 340, bh = scaler.clientHeight || 191;
      const hgt = Math.max(720, stage.scrollHeight);
      const k = Math.min(bw / 1280, bh / hgt);
      stage.style.setProperty('--k', k.toFixed(4));
      stage.style.setProperty('--x', `${Math.max(0, (bw - 1280 * k) / 2).toFixed(1)}px`);
    });
  }
  draw();
  return {
    update() { clearTimeout(t); t = setTimeout(draw, 250); },
    now: draw,
    destroy() { clearTimeout(t); box.remove(); removeEventListener('resize', onResize); },
  };
}
export { W as PREVIEW_W, H as PREVIEW_H };
