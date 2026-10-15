// Przycisk „Ustawienia” na pasku górnym (uczeń i nauczyciel). Kliknięcie ROZWIJA menu (bez przechodzenia na inną stronę):
// Mój profil, Skrzynka, Dźwięk, Ustawienia ogólne (forma, rankingi, udostępnianie wyników, kod PIN), Wyloguj.
// Rzeczy otwarte z tego menu mają przycisk „Wyjdź”, który wraca do przedmiotów i z powrotem rozwija to menu.
import { h, icon, toast, switchEl } from '../ui.js';
import { get, put } from '../api.js';
import { state, navigate, logout, markFromSettings } from '../app.js';
import { soundControls } from './sound-settings.js';
import { myGenderPicker } from './gender-pick.js';
import { avatarEl } from '../avatar.js';

let pop = null, btnRef = null;
const isOpen = () => !!pop;

export function settingsButton() {
  const b = h('button', { class: 'settings-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Ustawienia',
    'data-help': state.user.role === 'student' ? 'Ustawienia: Twój profil, skrzynka, dźwięk i ustawienia ogólne (forma zwracania się, rankingi, udostępnianie wyników). Liczba to nowe wiadomości w skrzynce.' : 'Ustawienia: skrzynka, dźwięk, ustawienia ogólne (forma zwracania się, zmiana kodu dostępu) i wylogowanie. Liczba to nowe wiadomości w skrzynce.' },
  icon('settings'), h('span', { class: 'who__name' }, 'Ustawienia'), icon('chevron', 'settings-btn__caret'), h('span', { class: 'bell__count', hidden: true }));
  b.addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); });
  btnRef = b;
  return b;
}

export function toggleSettings(force) {
  const want = force ?? !isOpen();
  if (!want) return closeSettings();
  openSettings();
}
export function closeSettings() {
  if (!pop) return;
  pop.remove(); pop = null;
  document.querySelectorAll('.settings-btn').forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.classList.remove('is-open'); });
  removeEventListener('pointerdown', outside, true);
  removeEventListener('keydown', onKey, true);
}
function outside(e) {
  if (!pop) return;
  if (pop.contains(e.target) || e.target.closest('.settings-btn, .tour, .help-banner, .help-bubble, dialog[open]')) return;
  closeSettings();
}
function onKey(e) { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeSettings(); }
document.addEventListener('edukro:view', () => closeSettings());

/** Rozwijana sekcja wewnątrz menu (rozwija się na miejscu). */
function fold(iconName, title, sub, build, { open = false, key } = {}) {
  const body = h('div', { class: 'sm-fold__body', hidden: !open });
  let built = false;
  const head = h('button', { class: 'sm-item sm-item--fold', type: 'button', 'aria-expanded': String(open), dataset: { key } },
    icon(iconName), h('span', { class: 'sm-item__txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null), icon('chevron', 'sm-item__caret'));
  const toggle = async () => {
    const on = body.hidden;
    body.hidden = !on;
    head.setAttribute('aria-expanded', String(on));
    if (on && !built) { built = true; body.replaceChildren(h('p', { class: 'muted small' }, 'Wczytuję…')); try { body.replaceChildren(await build()); } catch (e) { body.replaceChildren(h('p', { class: 'muted small' }, e.message)); } }
  };
  head.addEventListener('click', toggle);
  if (open) { built = true; Promise.resolve(build()).then((x) => body.replaceChildren(x)); }
  return h('div', { class: 'sm-fold' }, head, body);
}
const link = (iconName, title, sub, href, extra) => h('a', { class: 'sm-item', href, 'data-link': '', onClick: () => { markFromSettings(); closeSettings(); } },
  icon(iconName), h('span', { class: 'sm-item__txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null), extra || icon('arrowRight', 'sm-item__go'));

/** Ustawienia ogólne ucznia: forma, rankingi, udostępnianie wyników, kod PIN. */
async function generalStudent() {
  const p = await get('/api/me/profile');
  const u = p.user;
  const pref = (key, label, sub, checked, msgOn, msgOff) => switchEl({
    label, sub, checked,
    onChange: async (v, el) => {
      try { const r = await put('/api/me/preferences', { [key]: v }); Object.assign(state.user, r.user || {}); toast(v ? msgOn : msgOff); }
      catch (e) { el.checked = !v; toast(e.message, 'error'); }
    },
  }).el;
  const sharing = p.subjects.map((s) => switchEl({
    label: s.name, sub: s.teachers.length ? `Wyniki zobaczy: ${s.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(', ')}` : 'Brak przypisanego nauczyciela', checked: s.sharing,
    onChange: async (v, el) => {
      try { await put('/api/me/sharing', { subjectId: s.id, share: v }); toast(v ? `Udostępniasz wyniki: ${s.name}.` : `Nie udostępniasz już wyników: ${s.name}.`); }
      catch (e) { el.checked = !v; toast(e.message, 'error'); }
    },
  }).el);
  const { changeCodeDialog } = await import('./student.js');
  return h('div', { class: 'sm-general' },
    myGenderPicker(),
    h('div', { class: 'sm-sub' }, h('b', {}, 'Rankingi'),
      pref('rankingsOn', 'Biorę udział w rankingach', 'Twoje imię, profilowe i wyniki są widoczne w rankingach. Wyłącz, jeśli wolisz się w nich nie pokazywać.', u.rankingsOn !== false, 'Bierzesz udział w rankingach.', 'Nie pokazujesz się już w rankingach.')),
    h('div', { class: 'sm-sub' }, h('b', {}, 'Udostępnianie wyników'),
      h('p', { class: 'muted small' }, 'Nauczyciel przedmiotu widzi Twoje wyniki. Pierwsze zaliczenie egzaminu trafia do nauczyciela zawsze.'), ...sharing),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => changeCodeDialog() }, icon('key'), 'Zmień kod PIN')));
}
function generalTeacher() {
  // zmiana kodu w okienku – bez przechodzenia na osobną stronę (tak jak u ucznia)
  return h('div', { class: 'sm-general' }, myGenderPicker(),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: async () => { const { teacherCodeDialog } = await import('./pin.js'); teacherCodeDialog(); } }, icon('key'), 'Zmień kod dostępu')));
}

function openSettings() {
  closeSettings();
  const u = state.user;
  const student = u.role === 'student';
  const n = state.inbox?.unread || 0;
  const count = n ? h('span', { class: 'sm-count' }, n > 99 ? '99+' : String(n)) : null;
  pop = h('div', { class: 'settings-pop', role: 'menu', 'aria-label': 'Ustawienia' },
    student ? link('user', 'Mój profil', 'Profilowe, ramka, tytuł, muzyka, wygląd, wyniki, punkty', '/uczen/profil',
      h('span', { class: 'sm-item__av' }, avatarEl({ ...u.card, firstName: u.firstName, lastName: u.lastName }, { size: 28, frame: false }))) : null,
    link('bell', 'Skrzynka', student ? 'Wiadomości, punkty i nagrody do odebrania' : 'Prośby o pochwałę i wiadomości', '/skrzynka', count),
    fold('volume', 'Dźwięk', 'Efekty, muzyka w tle, lektor', () => soundControls(), { key: 'sound' }),
    fold('settings', 'Ustawienia ogólne', student ? 'Forma, rankingi, udostępnianie wyników, kod PIN' : 'Forma zwracania się, kod dostępu', () => (student ? generalStudent() : generalTeacher()), { key: 'general' }),
    h('button', { class: 'sm-item sm-item--logout', type: 'button', onClick: () => { closeSettings(); logout(); } }, icon('logout'), h('span', { class: 'sm-item__txt' }, h('b', {}, 'Wyloguj'))));
  document.body.append(pop);
  const b = document.querySelector('.topbar .settings-btn') || btnRef;
  b?.setAttribute('aria-expanded', 'true'); b?.classList.add('is-open');
  const r = b?.getBoundingClientRect();
  if (r) {
    const w = Math.min(380, innerWidth - 16);
    pop.style.width = `${w}px`;
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w)))}px`;
  }
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', onKey, true);
}
export { openSettings };
