// EDUKRO – aplikacja jednostronicowa: routing, powłoka (pasek górny, tło), stan sesji.
import { h, icon, toast } from './ui.js';
import { get, post } from './api.js';
import { loadLogo } from './logo.js';
import { welcomeView } from './views/welcome.js';
import * as student from './views/student.js';
import { registerView } from './views/register.js';
import * as teacher from './views/teacher.js';
import * as admin from './views/admin.js';
import { newTestView } from './views/tests-list.js';
import { editorView } from './views/test-editor.js';
import { playView, previewView } from './views/test-player.js';
import { newLessonView } from './views/lessons-list.js';
import { lessonEditorView } from './views/lesson-editor.js';
import { presentView, studentLessonView } from './views/lesson-present.js';
import { shopView } from './views/shop.js';
import { inboxView } from './views/inbox.js';
import { dailyEditorView } from './views/daily.js';
import { newGameView } from './views/games-list.js';
import { gameEditorView } from './views/game-editor.js';
import { studentGameView, previewGameView } from './views/game-play.js';
import { applyTheme } from './theme.js';
import * as sound from './sound.js';
import { openSoundSettings } from './views/sound-settings.js';
import { toggleHelp, helpActive } from './help.js';
import { maybeOfferTutorial, tourActive } from './tutorials.js';
import { applyPointRules } from './point-rules-apply.js';
import { startPulse, stopPulse } from './fun.js';
import { avatarEl } from './avatar.js';
import { rankingView } from './views/ranking.js';
import { openProfile } from './views/profile-card.js';
import { settingsButton, openSettings } from './views/settings-menu.js';

export const state = { status: null, user: { role: 'guest' }, adminGate: false };
/** Funkcje wywoływane przed opuszczeniem ekranu (np. zapis edytora testu). */
export const leaveGuards = new Set();
/** Wykonuje zapis edytora teraz (np. zanim samouczek zmieni lekcję na serwerze). */
export async function flushLeaveGuards() {
  for (const g of [...leaveGuards]) { try { await g(); } catch { /* zapis spróbuje ponownie */ } }
  leaveGuards.clear();
}

/** Ekrany edytora: wymagają roli nauczyciela (lub administratora w /administracja). */
function editorRoute(base, view) {
  return async ({ params }) => {
    const role = base === '/administracja' ? 'admin' : 'teacher';
    const u = state.user.role === role ? await refreshSession() : state.user;
    if (u.role !== role) { navigate(base === '/administracja' ? '/' : '/nauczyciel', { replace: true }); return null; }
    if (u.mustChangeCode) { navigate(base === '/administracja' ? '/administracja' : '/nauczyciel/panel', { replace: true }); return null; }
    return view({ base, id: params[0] });
  };
}

export async function refreshSession() {
  const { user } = await get('/api/session');
  state.user = user;
  syncTheme();
  return user;
}
/** Uczeń: puls (skrzynka, punkty, profil) i jego muzyka z profilu. */
function syncPulse() {
  if (state.user.role === 'student') {
    sound.setTrack(state.user.card?.music || 'calm');
    startPulse({ state, applyInboxSummary, setPointsChip, syncTheme, refreshAvatar });
  } else { stopPulse(); sound.setTrack('calm'); }
}
/** Odświeża profilowe na pasku górnym (np. po zmianie w sklepie). */
export function refreshAvatar() {
  const u = state.user;
  if (u.role !== 'student') return;
  document.querySelectorAll('.topbar .me-chip .av').forEach((el) => el.replaceWith(avatarEl({ ...u.card, firstName: u.firstName, lastName: u.lastName }, { size: 30 })));
}
/** Wygląd kupiony w sklepie widzi tylko zalogowany uczeń (na swoim urządzeniu). */
let themeKey = '';
export function syncTheme() {
  const t = state.user.role === 'student' ? state.user.theme : null;
  const k = JSON.stringify(t || null);
  if (k === themeKey) return;
  themeKey = k;
  applyTheme(t);
}

/* ---------- Routing ---------- */
const routes = [
  { re: /^\/$/, view: welcomeView, inner: false },
  { re: /^\/uczen$/, view: student.hubView },
  { re: /^\/uczen\/logowanie$/, view: student.loginView },
  { re: /^\/uczen\/rejestracja$/, view: registerView },
  { re: /^\/uczen\/zgloszenie$/, view: student.claimView },
  { re: /^\/uczen\/nowy-kod$/, view: student.resetView },
  { re: /^\/uczen\/przedmioty$/, view: student.subjectsView },
  { re: /^\/uczen\/przedmiot\/([a-z0-9-]+)(?:\/([a-z-]+))?$/, view: student.subjectView },
  { re: /^\/uczen\/profil$/, view: student.profileView },
  { re: /^\/uczen\/test\/(\d+)$/, view: playView, play: true },
  { re: /^\/uczen\/lekcja\/(\d+)$/, view: studentLessonView, play: true },
  { re: /^\/uczen\/sklep$/, view: shopView },
  { re: /^\/ranking$/, view: rankingView },
  { re: /^\/skrzynka$/, view: inboxView },
  { re: /^\/nauczyciel\/test\/nowy$/, view: editorRoute('/nauczyciel', newTestView) },
  { re: /^\/nauczyciel\/test\/(\d+)$/, view: editorRoute('/nauczyciel', editorView), wide: true },
  { re: /^\/nauczyciel\/test\/(\d+)\/podglad$/, view: editorRoute('/nauczyciel', previewView), play: true },
  { re: /^\/nauczyciel\/lekcja\/nowa$/, view: editorRoute('/nauczyciel', newLessonView) },
  { re: /^\/nauczyciel\/lekcja\/(\d+)$/, view: editorRoute('/nauczyciel', lessonEditorView), wide: true },
  { re: /^\/nauczyciel\/lekcja\/(\d+)\/prowadz$/, view: editorRoute('/nauczyciel', (o) => presentView(o)), play: true },
  { re: /^\/nauczyciel\/lekcja\/(\d+)\/podglad$/, view: editorRoute('/nauczyciel', (o) => presentView({ ...o, preview: true })), play: true },
  { re: /^\/administracja\/lekcja\/nowa$/, view: editorRoute('/administracja', newLessonView) },
  { re: /^\/administracja\/lekcja\/(\d+)$/, view: editorRoute('/administracja', lessonEditorView), wide: true },
  { re: /^\/administracja\/lekcja\/(\d+)\/prowadz$/, view: editorRoute('/administracja', (o) => presentView(o)), play: true },
  { re: /^\/administracja\/lekcja\/(\d+)\/podglad$/, view: editorRoute('/administracja', (o) => presentView({ ...o, preview: true })), play: true },
  { re: /^\/administracja\/test\/nowy$/, view: editorRoute('/administracja', newTestView) },
  { re: /^\/administracja\/test\/(\d+)$/, view: editorRoute('/administracja', editorView), wide: true },
  { re: /^\/administracja\/test\/(\d+)\/podglad$/, view: editorRoute('/administracja', previewView), play: true },
  { re: /^\/uczen\/gra\/(\d+)$/, view: studentGameView },
  { re: /^\/nauczyciel\/gra\/nowa$/, view: editorRoute('/nauczyciel', newGameView) },
  { re: /^\/nauczyciel\/gra\/(\d+)$/, view: editorRoute('/nauczyciel', gameEditorView), wide: true },
  { re: /^\/nauczyciel\/gra\/(\d+)\/podglad$/, view: editorRoute('/nauczyciel', previewGameView), play: true },
  { re: /^\/administracja\/gra\/nowa$/, view: editorRoute('/administracja', newGameView) },
  { re: /^\/administracja\/gra\/(\d+)$/, view: editorRoute('/administracja', gameEditorView), wide: true },
  { re: /^\/administracja\/gra\/(\d+)\/podglad$/, view: editorRoute('/administracja', previewGameView), play: true },
  { re: /^\/nauczyciel\/dzienne\/(\d+|nowe)$/, view: editorRoute('/nauczyciel', dailyEditorView) },
  { re: /^\/administracja\/dzienne\/(\d+|nowe)$/, view: editorRoute('/administracja', dailyEditorView) },
  { re: /^\/nauczyciel$/, view: teacher.loginView },
  { re: /^\/nauczyciel\/panel(?:\/([a-z-]+))?$/, view: teacher.dashboardView },
  { re: /^\/administracja(?:\/([a-z-]+))?$/, view: admin.adminView },
];

let current = null;
let navToken = 0;
let shownPath = null;

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname && !replace) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
addEventListener('popstate', () => render());

async function render() {
  const token = ++navToken;
  let path = location.pathname.replace(/\/+$/, '') || '/';
  let route = routes.find((r) => r.re.test(path));
  if (!route) { history.replaceState({}, '', '/'); path = '/'; route = routes[0]; } // nieznany adres → ekran główny
  const params = path.match(route.re).slice(1);
  const inner = route.inner !== false;
  document.body.classList.toggle('is-inner', inner);
  document.body.classList.toggle('is-welcome', !inner);

  for (const g of [...leaveGuards]) { try { await g(); } catch { /* zapis spróbuje ponownie */ } }
  leaveGuards.clear();
  document.body.classList.remove('is-playing');
  document.body.classList.toggle('is-play-route', !!route.play);
  const stage = document.getElementById('main');
  const old = stage.querySelector('.view');
  const topbar = document.querySelector('.topbar');
  if (!inner) topbar.hidden = true;

  let el;
  try {
    el = await route.view({ params, state });
  } catch (err) {
    console.error(err);
    el = h('div', { class: 'wrap wrap--narrow' }, h('div', { class: 'sheet' }, h('h1', {}, 'Coś poszło nie tak'),
      h('p', { class: 'sheet__lead' }, err.message || 'Nie udało się wczytać tego ekranu.'),
      h('div', { class: 'sheet__body' }, h('a', { class: 'btn btn--ghost', href: '/', 'data-link': '' }, 'Wróć na ekran główny'))));
  }
  if (token !== navToken || !el) return;
  syncTheme();
  syncPulse();
  if (inner) await renderTopbar();
  if (old) {
    old.classList.add('is-leaving');
    await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 170));
    if (token !== navToken) return;
  }
  el.classList.add('view');
  stage.replaceChildren(el);
  if (old) { stage.focus({ preventScroll: true }); scrollTo({ top: 0, behavior: 'instant' }); }
  current = route;
  try {
    if (shownPath && shownPath !== path) sessionStorage.setItem('edukro-prev-path', shownPath);
    else if (shownPath === null) {
      // po przeładowaniu strony poprzedni ekran znamy tylko z adresu, z którego przyszliśmy
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && ref.pathname !== path) sessionStorage.setItem('edukro-prev-path', ref.pathname);
      else sessionStorage.removeItem('edukro-prev-path');
    }
  } catch { /* prywatne okno */ }
  if (/^\/uczen\/przedmioty$|^\/nauczyciel\/panel(\/przeglad)?$/.test(path)) clearOrigin();
  shownPath = path + (location.search || '');
  document.dispatchEvent(new CustomEvent('edukro:view', { detail: { path } }));
  if (inner && !route.play) setTimeout(() => { if (token === navToken) maybeOfferTutorial(state.user, path); }, 600);
}

/* ---------- Pasek górny ---------- */
let crumbs = [];
export function setCrumbs(list) {
  crumbs = list;
  const nav = document.querySelector('.topbar .crumbs');
  if (nav) fillCrumbs(nav);
}
function fillCrumbs(nav) {
  nav.replaceChildren(...crumbs.map((c, i) => h('li', {},
    i === crumbs.length - 1 || !c.href ? h('span', { 'aria-current': i === crumbs.length - 1 ? 'page' : null }, c.label)
      : h('a', { href: c.href, 'data-link': '' }, c.label))));
}

let topLogo = null;
/** Przycisk „?” (tryb pomocy, w nim samouczki) – zawsze dostępny. */
export function helpButton() {
  return h('button', { class: ['tool-btn tool-btn--help', helpActive() && 'is-on'], type: 'button', 'aria-label': 'Pomoc – co robi ten przycisk?', title: 'Pomoc i samouczki', 'data-help-self': '', onClick: () => toggleHelp() }, icon('help'));
}

/* ---------- Przycisk „Wyjdź” ----------
   Prowadzi do przedmiotów (nauczyciel: do panelu). Jeśli ktoś wszedł tu z menu „Ustawienia”,
   wraca też to menu (rozwinięte). Znacznik przechodzi przez kolejne ekrany (np. profil → sklep). */
const ORIGIN = 'edukro-origin';
export function markFromSettings() { try { sessionStorage.setItem(ORIGIN, 'settings'); } catch { /* prywatne okno */ } }
const fromSettings = () => { try { return sessionStorage.getItem(ORIGIN) === 'settings'; } catch { return false; } };
const clearOrigin = () => { try { sessionStorage.removeItem(ORIGIN); } catch { /* nic */ } };
export function homePath() {
  return state.user.role === 'teacher' ? '/nauczyciel/panel' : state.user.role === 'admin' ? '/administracja/przeglad' : '/uczen/przedmioty';
}
export function exitNow() {
  const back = fromSettings();
  clearOrigin();
  navigate(homePath());
  if (back && state.user.role !== 'admin') setTimeout(() => openSettings(), 450);
}
export function exitButton(label = 'Wyjdź') {
  return h('button', { class: 'back exit-btn', type: 'button', onClick: exitNow, 'data-help': fromSettings() ? 'Wyjdź – wracasz do przedmiotów i do menu Ustawienia.' : 'Wyjdź – wracasz do przedmiotów.' }, icon('arrowLeft'), label);
}

/** Przyciski dźwięku i pomocy – na pasku górnym (administrator, gość) i w rogu ekranu powitalnego. */
export function toolButtons() {
  const s = sound.settings();
  const snd = h('button', { class: ['tool-btn', !s.on && 'is-off'], type: 'button', 'aria-label': 'Dźwięk', title: 'Dźwięk', 'data-help': 'Ustawienia dźwięku: głośność, kliknięcia, efekty, kreda przy logo, muzyka w tle i lektor samouczka.', onClick: openSoundSettings }, icon(s.on ? 'volume' : 'volumeOff'));
  const help = h('button', { class: ['tool-btn tool-btn--help', helpActive() && 'is-on'], type: 'button', 'aria-label': 'Pomoc – co robi ten przycisk?', title: 'Pomoc', 'data-help-self': '', onClick: () => toggleHelp() }, icon('help'));
  return [snd, help];
}
sound.onChange((s) => document.querySelectorAll('.tool-btn:not(.tool-btn--help)').forEach((b) => { b.classList.toggle('is-off', !s.on); b.replaceChildren(icon(s.on ? 'volume' : 'volumeOff')); }));

export async function renderTopbar() {
  const bar = document.querySelector('.topbar');
  if (!topLogo) topLogo = await loadLogo();
  const u = state.user;
  const isStudentArea = location.pathname.startsWith('/uczen');
  const right = h('div', { class: 'topbar__right' });
  if (u.role === 'guest' && isStudentArea) {
    right.append(...toolButtons(), h('span', { class: 'who' }, h('span', { class: 'who__mark who__mark--guest' }, icon('user')), h('span', { class: 'who__name' }, 'Tryb gościa')),
      h('a', { class: 'btn btn--ghost btn--sm', href: '/uczen/logowanie', 'data-link': '' }, 'Zaloguj się'));
  } else if (u.role !== 'guest') {
    const initials = (u.firstName?.[0] || '') + (u.role === 'admin' ? '' : (u.lastName?.[0] || ''));
    const mark = u.role === 'student' ? avatarEl({ ...u.card, firstName: u.firstName, lastName: u.lastName }, { size: 32 }) : h('span', { class: 'who__mark' }, initials.toUpperCase() || 'A');
    const who = h('span', { class: 'who' }, mark,
      h('span', { class: 'who__name' }, u.role === 'admin' ? 'Administrator' : `${u.firstName} ${u.lastName}`));
    const rank = h('a', { class: 'rank-chip', href: '/ranking', 'data-link': '', 'aria-label': 'Ranking', title: 'Ranking', 'data-help': 'Rankingi: najaktywniejsi, najwięcej punktów, najlepsze oceny, wygrane testy i gwiazdy lekcji tygodnia.' }, icon('trophy'), h('span', { class: 'who__name' }, 'Ranking'));
    const bell = h('a', { class: 'bell', href: '/skrzynka', 'data-link': '', 'aria-label': 'Skrzynka', title: 'Skrzynka', 'data-help': 'Skrzynka: nowe konta do zatwierdzenia, prośby o pochwałę i zgłoszenia uczniów.' },
      icon('bell'), h('span', { class: 'bell__count', hidden: true }));
    if (u.role === 'student') {
      // jeden przycisk: profilowe + imię + punkty → Mój profil (personalizacja; sklep na dole strony)
      const me = h('a', { class: 'me-chip', href: '/uczen/profil', 'data-link': '', 'aria-label': `Mój profil – masz ${u.points || 0} punktów`, 'data-help': 'Twój profil i punkty: tu ustawisz profilowe, ramkę, tytuł, muzykę i wygląd aplikacji. Na dole tej strony jest wejście do sklepu.' },
        avatarEl({ ...u.card, firstName: u.firstName, lastName: u.lastName }, { size: 30 }),
        h('span', { class: 'me-chip__name who__name' }, u.firstName),
        h('span', { class: 'me-chip__pts' }, icon('star'), h('span', { class: 'pts-chip__n' }, String(u.points || 0))));
      right.append(rank, settingsButton(), me, helpButton());
    } else if (u.role === 'teacher') {
      right.append(rank, settingsButton(), who, helpButton());
    } else {
      right.append(rank, bell, ...toolButtons(), who);
      right.append(h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: logout, 'aria-label': 'Wyloguj się', 'data-help': 'Wylogowanie z EDUKRO na tym urządzeniu.' }, icon('logout'), h('span', { class: 'who__name' }, 'Wyloguj')));
    }
    queueMicrotask(refreshInboxBadge);
  } else right.append(...toolButtons());
  const home = h('a', { class: 'topbar__logo', href: '/', 'data-link': '', 'aria-label': 'EDUKRO – ekran główny' }, topLogo);
  const nav = h('ol', { class: 'crumbs', 'aria-label': 'Jesteś tutaj' });
  fillCrumbs(nav);
  bar.replaceChildren(home, h('nav', { 'aria-label': 'Ścieżka', style: { minWidth: 0, display: 'contents' } }, nav), right);
  bar.hidden = false;
}

/* ---------- Licznik skrzynki i punkty na pasku ---------- */
let lastUnread = null;
export async function refreshInboxBadge() {
  if (state.user.role === 'guest') return;
  let r;
  try { r = await get('/api/inbox/summary'); } catch { return; }
  applyInboxSummary(r);
}
export function applyInboxSummary(r) {
  if (!r) return;
  const n = r.unread;
  state.inbox = r;
  document.querySelectorAll('.settings-btn').forEach((b) => b.classList.toggle('has-claim', r.toClaim > 0));
  document.querySelectorAll('.sm-count').forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); });
  document.querySelectorAll('.bell__count').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); });
  document.querySelectorAll('.bell').forEach((b) => { b.classList.toggle('has-claim', r.toClaim > 0); b.setAttribute('aria-label', n ? `Skrzynka – nowe: ${n}` : 'Skrzynka'); });
  if (lastUnread !== null && n > lastUnread) {
    sound.play('notify');
    document.querySelectorAll('.bell, .settings-btn').forEach((b) => { b.classList.remove('is-ring'); void b.offsetWidth; b.classList.add('is-ring'); });
  }
  lastUnread = n;
}
export function setPointsChip(balance) {
  state.user.points = balance;
  document.querySelectorAll('.pts-chip__n').forEach((x) => { x.textContent = String(balance); });
  document.querySelectorAll('.pts-chip, .me-chip').forEach((x) => { x.setAttribute('aria-label', x.classList.contains('me-chip') ? `Mój profil – masz ${balance} punktów` : `Masz ${balance} punktów`); x.classList.remove('is-bump'); void x.offsetWidth; x.classList.add('is-bump'); });
}
// nauczyciel i administrator: licznik skrzynki co 45 s (uczeń dostaje go w „pulsie” co 12 s)
setInterval(() => { if (document.visibilityState === 'visible' && !tourActive() && state.user.role !== 'student') refreshInboxBadge(); }, 45000);

/* Ciche „klik” przy przyciskach (wyłączane w ustawieniach dźwięku). */
document.addEventListener('click', (e) => {
  if (helpActive()) return;
  const b = e.target.closest('button, a.btn, a.path, a.subject, .role, [role="tab"], .cat');
  if (!b || b.disabled || b.closest('.no-click-sound')) return;
  sound.play(b.matches('[role="tab"], .tab, .cat') ? 'tab' : 'click');
}, true);

export { openProfile };
export async function logout() {
  try { await post('/api/auth/logout'); } catch { /* sesja i tak wygaśnie */ }
  state.user = { role: 'guest' };
  lastUnread = null;
  stopPulse();
  sound.setTrack('calm');
  syncTheme();
  state.adminGate = false;
  try { sessionStorage.removeItem('edukro-admin-gate'); } catch {}
  toast('Wylogowano.');
  navigate('/');
}

/* ---------- Tło: zdjęcie szkoły (podmiana pliku nie wymaga zmian w kodzie) ---------- */
// Zdjęcie ładuje się od razu, ale wchodzi (fade) dopiero gdy ekran powitalny skończy
// pisanie logo i pokaże przyciski – wtedy wywołuje revealBackdrop().
const backdropState = { loaded: false, allowed: false };
function applyBackdrop() {
  if (backdropState.loaded && backdropState.allowed) {
    requestAnimationFrame(() => document.body.classList.add('has-photo'));
  }
}
export function revealBackdrop(delay = 0) {
  setTimeout(() => { backdropState.allowed = true; applyBackdrop(); }, delay);
}
function introPending() {
  let seen = false;
  try { seen = sessionStorage.getItem('edukro-intro') === '1'; } catch {}
  return location.pathname === '/' && !seen && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function setupBackdrop(status) {
  const photo = document.querySelector('.backdrop__photo');
  photo.style.setProperty('--photo-focus', status.schoolPhoto.focus);
  const img = new Image();
  img.onload = () => {
    photo.style.backgroundImage = `url("${status.schoolPhoto.url}")`;
    backdropState.loaded = true;
    applyBackdrop();
  };
  img.onerror = () => document.body.classList.add('no-photo');
  img.src = status.schoolPhoto.url;
  if (introPending()) setTimeout(() => revealBackdrop(), 20000); // zabezpieczenie, gdyby animacja nie wystartowała
  else revealBackdrop();
}

/* ---------- Start ---------- */
(async function boot() {
  try {
    const [status] = await Promise.all([get('/api/status'), refreshSession()]);
    state.status = status;
    applyPointRules(status.pointRules);
    if (status.version) { const v = document.createElement('div'); v.className = 'app-version'; v.textContent = `EDUKRO ${status.version}`; document.body.append(v); }
    setupBackdrop(status);
  } catch (e) {
    state.status = { mail: { mode: 'none' }, emailCodeLength: 3, studentCodeMinLength: 6, schoolName: '', schoolPhoto: { url: '/assets/szkola.jpg', focus: '50% 45%' } };
    toast(e.message, 'error');
  }
  try { state.adminGate = sessionStorage.getItem('edukro-admin-gate') === '1'; } catch {}
  render();
})();
