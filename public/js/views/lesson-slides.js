// Slajdy lekcji: rysowanie na tablicy (nauczyciel) i w samodzielnej nauce (uczeń).
// Każdy slajd zwraca { el, next() → true jeśli coś odsłonił, enter(), leave() }.
import { h, icon, dialog, toast } from '../ui.js';
import * as sound from '../sound.js';
import { post } from '../api.js';
import { mediaUrl } from '../media.js';
import { parseHidden, parseSay, LOOK_FONTS, LOOK_COLORS, SLIDE_BGS } from '../shared/lesson-rules.js';
import { parseTime } from '../shared/quiz-rules.js';
import { WIDGETS } from './qplay.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Tekst z zasłoniętymi słowami {…} i słowami „Do wymowy” [[…]] ---------- */
function hideBtn(v, onOpen) {
  const b = h('button', { type: 'button', class: 'hide-word', 'aria-label': 'Zasłonięte słowo – kliknij, aby odsłonić' }, h('span', { class: 'hide-word__txt' }, v));
  b.addEventListener('click', (e) => { e.stopPropagation(); b.classList.add('is-open'); b.setAttribute('aria-label', v); b.disabled = true; onOpen?.(v); });
  return b;
}
const hiddenParts = (raw, onOpen) => parseHidden(raw).segments.map((x) => (x.t === 'text' ? x.v : hideBtn(x.v, onOpen)));
/**
 * Słowo albo zdanie do wymowy: podkreślone, kliknięcie = lektor czyta (za każdym razem od nowa).
 * Zasłonięte słowa w środku są pomijane, dopóki ich nie odsłonisz – odsłonięte lektor czyta od razu.
 */
function sayEl(seg) {
  const opts = { force: true, lang: seg.lang, voice: seg.voice || null };
  const span = h('span', { class: 'say', role: 'button', tabindex: '0', lang: seg.lang.slice(0, 2), 'data-help': 'Do wymowy – kliknij, a lektor przeczyta' });
  const parts = hiddenParts(seg.v, (word) => { span.classList.add('is-speaking'); sound.speak(word, opts).then(() => span.classList.remove('is-speaking')); });
  span.append(...parts, h('span', { class: 'say__ic', 'aria-hidden': 'true' }, icon('volume')));
  const text = () => [...span.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : n.classList?.contains('hide-word') ? (n.classList.contains('is-open') ? n.textContent : ' … ') : '')).join('').replace(/\s+/g, ' ').trim();
  const say = (e) => {
    if (e.target.closest?.('.hide-word:not(.is-open)')) return;
    e.stopPropagation(); e.preventDefault();
    span.classList.add('is-speaking');
    sound.speak(text().replace(/(\s*…\s*)+/g, ', '), opts).then(() => span.classList.remove('is-speaking'));
  };
  span.addEventListener('click', say);
  span.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') say(e); });
  return span;
}
export function richText(raw, tag = 'span') {
  const { segments } = parseSay(raw);
  return h(tag, { class: 'rich' }, ...segments.flatMap((x) => (x.t === 'say' ? [sayEl(x)] : hiddenParts(x.v))));
}

/* ---------- Wygląd ustawiony w podglądzie (rozmiar, czcionka, kolor, położenie, kadr, tło slajdu) ---------- */
const FONT_CSS = Object.fromEntries(LOOK_FONTS.map(([id, , css]) => [id, css]));
const COLOR_HEX = Object.fromEntries(LOOK_COLORS.map(([id, , hex]) => [id, hex]));
/** Nakłada wygląd na element slajdu; key = 'title' | 'sub' | 'img' | 'b:<id bloku>' (do edycji w podglądzie). */
export function applyLook(el, look, key, kind = 'text') {
  if (!el) return el;
  const l = look || {};
  el.dataset.lk = key; el.dataset.lkKind = kind;
  el.classList.add('lk');
  el.style.setProperty('--lk-size', String(l.size || 1));
  el.style.setProperty('--lk-dx', String(l.dx || 0));
  el.style.setProperty('--lk-dy', String(l.dy || 0));
  el.style.fontFamily = l.font ? FONT_CSS[l.font] : '';
  el.style.color = l.color ? COLOR_HEX[l.color] : '';
  el.classList.toggle('lk--moved', !!(l.dx || l.dy));
  if (kind === 'img') {
    const img = el.querySelector('img');
    if (img) {
      const c = l.crop;
      img.style.transform = c ? `scale(${c.z})` : '';
      img.style.transformOrigin = c ? `${c.x}% ${c.y}%` : '';
      img.parentElement.classList.toggle('lk-cropped', !!c);
    }
  }
  return el;
}
/** Tło slajdu (cała tablica); jasne tła przełączają tekst na ciemny. */
export function paintBg(el, bg) {
  const b = SLIDE_BGS.find(([id]) => id && id === bg);
  el.classList.toggle('has-bg', !!b);
  el.classList.toggle('is-light', !!b?.[3]);
  if (b) el.style.setProperty('--slide-bg', b[2]); else el.style.removeProperty('--slide-bg');
}

/* ---------- Powiększanie i obracanie obrazka ---------- */
export function imageViewer(src, caption = '') {
  let scale = 1, rot = 0, x = 0, y = 0;
  const img = h('img', { src, alt: caption || 'Obrazek', draggable: false });
  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`; };
  const btn = (ic, label, fn) => h('button', { class: 'iv-btn', type: 'button', 'aria-label': label, title: label, onClick: () => { fn(); apply(); } }, icon(ic));
  const stage = h('div', { class: 'iv-stage' }, img);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.min(6, Math.max(0.4, scale * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    const sx = e.clientX - x, sy = e.clientY - y;
    stage.setPointerCapture(e.pointerId);
    const mv = (ev) => { x = ev.clientX - sx; y = ev.clientY - sy; apply(); };
    const up = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); };
    stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up);
  });
  const ov = h('div', { class: 'iv', role: 'dialog', 'aria-label': 'Podgląd obrazka' },
    stage,
    h('div', { class: 'iv-bar' },
      btn('zoomOut', 'Pomniejsz', () => { scale = Math.max(0.4, scale / 1.25); }),
      btn('zoomIn', 'Powiększ', () => { scale = Math.min(6, scale * 1.25); }),
      btn('rotate', 'Obróć', () => { rot = (rot + 90) % 360; }),
      btn('repeat', 'Przywróć', () => { scale = 1; rot = 0; x = 0; y = 0; }),
      h('button', { class: 'iv-btn iv-btn--close', type: 'button', 'aria-label': 'Zamknij', onClick: () => close() }, icon('x'))),
    caption ? h('p', { class: 'iv-cap' }, caption) : null);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === '+' || e.key === '=') { scale = Math.min(6, scale * 1.25); apply(); }
    else if (e.key === '-') { scale = Math.max(0.4, scale / 1.25); apply(); }
    else if (e.key.toLowerCase() === 'r') { rot = (rot + 90) % 360; apply(); }
  };
  function close() { ov.classList.add('is-out'); removeEventListener('keydown', onKey, true); setTimeout(() => ov.remove(), 200); }
  addEventListener('keydown', onKey, true);
  (document.querySelector('.present') || document.body).append(ov);
  apply();
}

/* ---------- Elementy slajdu informacyjnego ---------- */
function blockEl(b) {
  const cls = ['blk', `blk--${b.kind}`, b.style !== 'normal' && `blk-style--${b.style}`];
  const label = { important: 'Ważne!', definition: 'Definicja', example: 'Przykład' }[b.style];
  let body;
  if (b.kind === 'text') body = h('div', { class: 'blk__text' }, ...String(b.text || '').split(/\n{2,}/).map((p) => richText(p, 'p')));
  else if (b.kind === 'list') body = h('ul', { class: 'blk__list' }, ...(b.items || []).filter((x) => x.trim()).map((x) => h('li', {}, richText(x))));
  else if (b.kind === 'table') {
    const t = b.table || {};
    body = h('div', { class: 'blk__table-wrap' }, h('table', { class: 'blk__table' }, ...(t.cells || []).map((row, r) => h('tr', {}, ...row.map((c) => h(t.header && r === 0 ? 'th' : 'td', {}, richText(c)))))));
  } else if (b.kind === 'image' && b.image) {
    const src = mediaUrl(b.image);
    const pic = h('button', { type: 'button', class: 'blk__img', 'aria-label': 'Powiększ obrazek' }, h('img', { src, alt: b.caption || 'Obrazek', loading: 'lazy' }), h('span', { class: 'blk__zoom' }, icon('zoomIn')));
    pic.addEventListener('click', () => imageViewer(src, b.caption));
    const parts = [pic];
    if (b.covered) {
      const cover = h('button', { type: 'button', class: 'blk__cover' }, icon('eye'), h('span', {}, 'Kliknij, aby odsłonić'));
      cover.addEventListener('click', (e) => { e.stopPropagation(); cover.classList.add('is-open'); setTimeout(() => cover.remove(), 500); });
      parts.push(cover);
    }
    body = h('figure', { class: 'blk__fig' }, h('div', { class: 'blk__img-wrap' }, ...parts), b.caption ? h('figcaption', {}, b.caption) : null);
  } else body = h('p', { class: 'muted' }, 'Brak obrazka.');
  return applyLook(h('section', { class: cls }, label ? h('span', { class: 'blk__label' }, label) : null, body), b.look, `b:${b.id}`, b.kind === 'image' ? 'img' : 'text');
}

/* ---------- Pasek czasu (slajd do przepisania) ---------- */
function beep(freq = 880, dur = 0.18, times = 3) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.3);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.3 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.3 + dur);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.3); o.stop(ac.currentTime + i * 0.3 + dur + 0.05);
    }
    setTimeout(() => ac.close(), 1500);
  } catch { /* bez dźwięku */ }
}
export function timerBar(seconds) {
  let left = seconds * 1000, running = false, last = 0, raf = null, done = false;
  const fill = h('span', { class: 'tbar__fill' });
  const txt = h('span', { class: 'tbar__txt' });
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const startBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('play'), 'Start');
  const resetBtn = h('button', { class: 'btn btn--quiet btn--sm', type: 'button', 'aria-label': 'Od nowa', title: 'Od nowa' }, icon('repeat'));
  const el = h('div', { class: 'tbar' }, h('div', { class: 'tbar__track' }, fill), h('div', { class: 'tbar__row' }, txt, h('div', { class: 'tbar__btns' }, startBtn, resetBtn)));
  const render = () => {
    fill.style.width = `${(left / (seconds * 1000)) * 100}%`;
    el.classList.toggle('is-low', left <= Math.min(60e3, seconds * 200) && left > 0);
    el.classList.toggle('is-done', done);
    txt.textContent = done ? 'Czas minął!' : running ? `Pozostały czas: ${fmt(left)}` : left === seconds * 1000 ? `Czas na przepisanie: ${fmt(left)} – kliknij Start, gdy wszyscy zaczną` : `Pauza – pozostało ${fmt(left)}`;
    startBtn.replaceChildren(icon(running ? 'pause' : 'play'), running ? 'Pauza' : left < seconds * 1000 && !done ? 'Wznów' : 'Start');
    startBtn.hidden = done;
  };
  const frame = (t) => {
    if (!running) return;
    left = Math.max(0, left - (t - last)); last = t;
    if (left <= 0) { running = false; done = true; beep(); render(); return; }
    render();
    raf = requestAnimationFrame(frame);
  };
  startBtn.addEventListener('click', (e) => { e.stopPropagation(); running = !running; if (running) { last = performance.now(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf); render(); });
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); running = false; done = false; cancelAnimationFrame(raf); left = seconds * 1000; render(); });
  render();
  return { el, stop() { running = false; cancelAnimationFrame(raf); } };
}

/* ---------- Slajdy ---------- */
function titleSlide(s) {
  const L = s.look || {};
  return { el: h('div', { class: 'slide slide--title' },
    s.image ? applyLook(h('div', { class: 'slide-title__img' }, h('span', { class: 'slide-title__frame' }, h('img', { src: mediaUrl(s.image), alt: '' }))), L.img, 'img', 'img') : null,
    applyLook(h('h1', { class: 'slide-title slide-title--big' }, s.title || ''), L.title, 'title'),
    s.subtitle ? applyLook(h('p', { class: 'slide-sub' }, s.subtitle), L.sub, 'sub') : null) };
}

function infoSlide(s, ctx) {
  const blocks = (s.blocks || []).map((b) => ({ b, el: blockEl(b) }));
  const timers = [];
  const pending = blocks.filter((x) => x.b.appear === 'click');
  const delayed = blocks.filter((x) => x.b.appear === 'delay');
  [...pending, ...delayed].forEach((x) => x.el.classList.add('is-hidden'));
  const moreBtn = h('button', { class: 'btn btn--ghost btn--sm slide-more', type: 'button' }, icon('arrowRight'), 'Pokaż dalej');
  const syncMore = () => { moreBtn.hidden = !pending.some((x) => x.el.classList.contains('is-hidden')); };
  const show = (x) => { x.el.classList.remove('is-hidden'); x.el.classList.add('is-appearing'); };
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });
  function next() {
    const x = pending.find((p) => p.el.classList.contains('is-hidden'));
    if (!x) return false;
    show(x); syncMore();
    x.el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    return true;
  }
  const bar = s.type === 'copy' ? timerBar(parseTime(s.time).seconds || 300) : null;
  const el = h('div', { class: ['slide', `slide--${s.type}`] },
    bar ? bar.el : null,
    s.title ? applyLook(h('h2', { class: 'slide-title' }, s.title), s.look?.title, 'title') : null,
    s.type === 'copy' ? h('p', { class: 'slide-kicker' }, icon('copyText'), 'Przepisz do zeszytu') : null,
    h('div', { class: 'slide-blocks' }, ...blocks.map((x) => x.el)),
    moreBtn);
  syncMore();
  return {
    el, next,
    enter() {
      for (const x of delayed) {
        const t = parseTime(x.b.delay);
        timers.push(setTimeout(() => show(x), (t.seconds || 0) * 1000));
      }
    },
    leave() { timers.forEach(clearTimeout); bar?.stop(); },
  };
}

function questionSlide(s, ctx) {
  const box = h('div', { class: 'slide slide--question' });
  const render = () => {
    const q = s.question;
    let widget;
    const check = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true }, 'Sprawdź');
    const again = h('button', { class: 'btn btn--ghost btn--lg', type: 'button', hidden: true }, icon('repeat'), 'Jeszcze raz');
    const onChange = () => { check.disabled = !widget.ready(); check.hidden = !!widget.hidesSubmit?.(); };
    widget = WIDGETS[q.type](q, { onChange, serve: q.serve });
    const hintBox = q.hint ? h('div', { class: 'hint-box', hidden: true }, icon('bulb'), h('span', {}, q.hint)) : null;
    const hint = q.hint ? h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => { hintBox.hidden = false; hint.remove(); } }, icon('bulb'), 'Podpowiedź') : null;
    const img = q.image ? h('button', { class: 'q-img', type: 'button', 'aria-label': 'Powiększ obrazek', onClick: () => imageViewer(q.image) }, h('img', { src: q.image, alt: 'Obrazek do pytania' })) : null;
    const card = h('article', { class: ['q-card-play', 'slide-card', `q-type-${q.type}`] },
      h('p', { class: 'q-num' }, s.title || 'Pytanie'), h('h2', { class: 'q-prompt' }, q.prompt), img, hintBox,
      h('div', { class: 'q-answer' }, widget.el),
      h('div', { class: 'slide-q-actions' }, hint, again, check));
    check.addEventListener('click', async () => {
      check.classList.add('is-busy');
      widget.lock();
      try {
        const r = await post(ctx.checkUrl, { slideId: s.id, v: q.v, answer: widget.answer() });
        widget.reveal(r);
        card.classList.add(r.correct ? 'is-correct' : 'is-incorrect');
        check.hidden = true; again.hidden = false;
        card.querySelector('.q-answer').after(h('div', { class: ['slide-fb', r.correct ? 'is-ok' : 'is-bad', 'pop-in'] }, icon(r.correct ? 'check' : 'x'), h('b', {}, r.correct ? 'Dobrze!' : 'Nie tym razem'),
          r.explanation ? h('span', {}, r.explanation) : null));
        sound.play(r.correct ? 'success' : 'error');
        if (r.correct) ctx.celebrate?.(card);
      } catch (e) { toast(e.message, 'error'); check.classList.remove('is-busy'); }
    });
    again.addEventListener('click', render);
    box.replaceChildren(card);
    onChange();
  };
  render();
  return { el: box };
}

function flashcardsSlide(s) {
  const cards = (s.cards || []).map((c, i) => {
    const b = h('button', { type: 'button', class: 'fcard', style: { '--i': i }, 'aria-pressed': 'false' },
      h('span', { class: 'fcard__in' }, h('span', { class: 'fcard__face fcard__front' }, richText(c.front)), h('span', { class: 'fcard__face fcard__back' }, richText(c.back))));
    b.addEventListener('click', () => { const on = b.classList.toggle('is-flipped'); b.setAttribute('aria-pressed', String(on)); });
    return b;
  });
  const flipAll = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { const any = cards.some((c) => !c.classList.contains('is-flipped')); cards.forEach((c) => c.classList.toggle('is-flipped', any)); } }, icon('repeat'), 'Odwróć wszystkie');
  return { el: h('div', { class: 'slide slide--cards' }, applyLook(h('h2', { class: 'slide-title' }, s.title), s.look?.title, 'title'), h('p', { class: 'slide-kicker' }, icon('cards'), 'Kliknij kartę, żeby ją odwrócić'), h('div', { class: 'fcards', style: { '--n': String(Math.min(4, cards.length)) } }, ...cards), h('div', { class: 'actions' }, flipAll)) };
}

const NOTE_COLORS = ['#F7D774', '#9EE6B8', '#9CD3F7', '#F7A8C8', '#C9B5FA', '#FFC48A'];
function brainstormSlide(s) {
  const board = h('div', { class: 'notes' });
  const inp = h('input', { class: 'input', maxlength: 120, placeholder: 'Wpisz pomysł ucznia i naciśnij Enter', 'aria-label': 'Nowy pomysł' });
  let n = 0;
  const add = () => {
    const v = inp.value.trim();
    if (!v) return;
    const note = h('button', { type: 'button', class: 'note', title: 'Kliknij, aby usunąć', style: { '--c': NOTE_COLORS[n % NOTE_COLORS.length], '--r': `${((n * 37) % 9) - 4}deg` } }, v);
    note.addEventListener('click', () => { note.classList.add('is-out'); setTimeout(() => note.remove(), 250); });
    board.append(note); n++; inp.value = '';
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } });
  inp.addEventListener('keyup', (e) => e.stopPropagation());
  return {
    el: h('div', { class: 'slide slide--brainstorm' }, s.title ? h('p', { class: 'slide-kicker' }, icon('sticky'), s.title) : h('p', { class: 'slide-kicker' }, icon('sticky'), 'Burza mózgów'),
      h('h2', { class: 'slide-title slide-title--prompt' }, s.prompt), board,
      h('div', { class: 'notes-add' }, inp, h('button', { class: 'btn btn--primary', type: 'button', onClick: add }, icon('plus'), 'Dodaj'))),
  };
}

function classOnlySlide(s) {
  return { el: h('div', { class: 'slide slide--classonly' }, icon(s.type === 'wheel' ? 'wheel' : 'game', 'slide-big-icon'),
    h('h2', { class: 'slide-title' }, s.title || (s.type === 'wheel' ? 'Koło fortuny' : 'Gra klasowa')),
    h('p', { class: 'slide-sub' }, s.type === 'wheel' ? 'Tu na lekcji nauczyciel losuje osoby do odpowiedzi – za dobrą odpowiedź jest +10 pkt.' : 'Tu na lekcji gracie w drużynach – zwycięska drużyna dostaje punkty.'),
    h('p', { class: 'muted' }, 'Ta część lekcji odbywa się w klasie z nauczycielem. Przejdź dalej.')) };
}

/** ctx: { checkUrl, celebrate, games: { wheel(s), game(s) } (tylko tablica nauczyciela) } */
export function renderSlide(s, ctx) {
  switch (s.type) {
    case 'title': return titleSlide(s, ctx);
    case 'info': case 'copy': return infoSlide(s, ctx);
    case 'question': return questionSlide(s, ctx);
    case 'flashcards': return flashcardsSlide(s, ctx);
    case 'brainstorm': return brainstormSlide(s, ctx);
    case 'wheel': case 'game':
      if (s.classOnly || !ctx.games) return classOnlySlide(s);
      return ctx.games[s.type](s);
    default: return { el: h('div', { class: 'slide' }, 'Nieznany slajd') };
  }
}

export function confirmDialog(opts) { return dialog(opts); }
