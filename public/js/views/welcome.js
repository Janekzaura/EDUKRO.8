// Ekran powitalny: tło szkoły → pisanie logo → opcje wyboru zjeżdżają z góry.
import { h, icon } from '../ui.js';
import { loadLogo, prepareWriting } from '../logo.js';
import { navigate, state, revealBackdrop, toolButtons } from '../app.js';
import * as sound from '../sound.js';
import { ADMIN_GESTURE, LOGO_TIMING } from '../config.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function role({ title, desc, iconName, path }) {
  const b = h('button', { class: 'role', type: 'button' },
    h('span', { class: 'role__icon' }, icon(iconName)),
    h('span', { class: 'role__title' }, title),
    h('span', { class: 'role__desc' }, desc));
  b.addEventListener('pointerdown', () => b.classList.add('is-pressed'));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('is-pressed')));
  b.addEventListener('click', () => {
    b.classList.add('is-chosen');
    setTimeout(() => navigate(path), reduced() ? 0 : 160);
  });
  return b;
}

/** Ukryte wejście administratora: tylko otwiera ekran autoryzacji (uprawnienia nadaje serwer). */
function armAdminGesture(target, view) {
  let taps = [];
  target.addEventListener('pointerup', () => {
    const t = performance.now();
    taps = taps.filter((x) => t - x < ADMIN_GESTURE.windowMs);
    taps.push(t);
    if (taps.length >= ADMIN_GESTURE.taps) { taps = []; openAdmin(); }
  });
  let keys = [];
  const onKey = (e) => {
    if (!view.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.target.closest('input, textarea')) return;
    const t = performance.now();
    keys = keys.filter((k) => t - k.t < ADMIN_GESTURE.windowMs);
    keys.push({ k: e.key.toLowerCase(), t });
    const seq = keys.map((k) => k.k).slice(-ADMIN_GESTURE.keys.length).join('|');
    if (seq === ADMIN_GESTURE.keys.join('|')) { keys = []; openAdmin(); }
  };
  document.addEventListener('keydown', onKey);
}
function openAdmin() {
  state.adminGate = true;
  try { sessionStorage.setItem('edukro-admin-gate', '1'); } catch {}
  navigate('/administracja');
}

export async function welcomeView() {
  const svg = await loadLogo();
  const logo = h('div', { class: 'welcome__logo' }, svg);
  const tag = h('p', { class: 'welcome__tag' }, 'Nauka, która zostaje w pamięci');
  const roles = h('div', { class: 'roles', role: 'group', 'aria-label': 'Wybierz, kim jesteś' },
    role({ title: 'JESTEM UCZNIEM', desc: 'Lekcje, testy, sprawdziany i gry z chemii i biologii.', iconName: 'nib', path: '/uczen' }),
    role({ title: 'JESTEM NAUCZYCIELEM', desc: 'Wyniki uczniów i materiały z Twoich przedmiotów.', iconName: 'board', path: '/nauczyciel' }));
  const foot = h('p', { class: 'welcome__foot' }, state.status?.schoolName || '');
  const corner = h('div', { class: 'corner-tools' }, ...toolButtons());
  const view = h('section', { class: 'welcome', 'aria-label': 'EDUKRO – ekran powitalny' }, logo, tag, roles, foot, corner);

  armAdminGesture(logo, view);
  const chalk = sound.chalkVoice();
  const leave = () => chalk.stop();
  addEventListener('popstate', leave, { once: true });
  document.addEventListener('edukro:view', function onV(e) { if (e.detail.path !== '/') { leave(); document.removeEventListener('edukro:view', onV); } });

  /** Napisz logo jeszcze raz – z dźwiękiem kredy (np. po włączeniu dźwięku na ekranie głównym). */
  const rewrite = async () => {
    if (view.classList.contains('is-rewriting') || reduced()) return;
    view.classList.add('is-rewriting');
    const fresh = await loadLogo();
    logo.replaceChildren(fresh);
    const w = prepareWriting(fresh, { onPen: (down, v) => chalk.set(down, v) });
    requestAnimationFrame(() => w.play().then(() => { chalk.stop(); view.classList.remove('is-rewriting'); }));
  };
  // dźwięk w przeglądarce rusza dopiero po pierwszym kliknięciu – wtedy możemy dopisać logo kredą
  const chalkHint = h('button', { class: 'chalk-hint', type: 'button', hidden: true, 'data-help': 'Napisze logo EDUKRO jeszcze raz – tym razem z dźwiękiem kredy na tablicy.' }, icon('volume'), 'Posłuchaj, jak piszę kredą');
  chalkHint.addEventListener('click', (e) => { e.stopPropagation(); chalkHint.hidden = true; sound.update({ on: true, chalk: true }); setTimeout(rewrite, 60); });
  view.append(chalkHint);
  const offerChalk = () => { if (!sound.isUnlocked() && sound.settings().on && sound.settings().chalk && !reduced()) chalkHint.hidden = false; };

  // Animacja tylko przy pierwszym wejściu w tej karcie; powrót na ekran główny pokazuje gotowe logo.
  let seen = false;
  try { seen = sessionStorage.getItem('edukro-intro') === '1'; } catch {}
  const showStatic = () => { view.classList.add('is-written'); roles.classList.add('is-static'); };

  if (seen || reduced()) {
    showStatic();
    return view;
  }

  const writer = prepareWriting(svg, { onPen: (down, v) => chalk.set(down, v) });
  const skip = h('button', { class: 'skip-intro', type: 'button' }, 'Pomiń animację');
  view.append(skip);
  const reveal = () => {
    try { sessionStorage.setItem('edukro-intro', '1'); } catch {}
    chalk.stop();
    setTimeout(offerChalk, 900);
    skip.remove();
    view.classList.add('is-written');
    roles.classList.add('is-in');
    revealBackdrop(450); // zdjęcie wchodzi dopiero, gdy przyciski już się pojawiły
  };
  skip.addEventListener('click', () => writer.finish());
  writer.done.then(reveal);
  // start po wejściu tła
  requestAnimationFrame(() => setTimeout(() => { if (view.isConnected) writer.play(); else writer.finish(); }, LOGO_TIMING.start));
  return view;
}
