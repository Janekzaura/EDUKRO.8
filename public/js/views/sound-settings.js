// Okno ustawień dźwięku (zapisywane na tym urządzeniu).
import { h, icon, dialog, switchEl } from '../ui.js';
import * as sound from '../sound.js';

function slider({ label, value, onInput }) {
  const inp = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), class: 'range', 'aria-label': label });
  const out = h('output', { class: 'range__val' }, `${Math.round(value * 100)}%`);
  inp.addEventListener('input', () => { out.textContent = `${inp.value}%`; onInput(Number(inp.value) / 100); });
  return h('label', { class: 'range-row' }, h('span', {}, label), inp, out);
}

const SAMPLE = { standard: 'Dzień dobry! Jestem lektorem EDUKRO.', kobieta: 'Cześć! Jestem lektorką EDUKRO.', mlody: 'Hej! Jestem młodym lektorem EDUKRO.' };
/** Wybór głosu lektora (domyślny dla podpowiedzi, zadań na słuch i słów „Do wymowy”). */
export function voicePicker({ value = sound.defaultVoice(), onPick = (id) => sound.update({ voiceKind: id }), label = 'Głos lektora' } = {}) {
  let cur = value;
  const box = h('div', { class: 'voice-pick', role: 'radiogroup', 'aria-label': label });
  const render = () => box.replaceChildren(...sound.VOICES.map((v) => h('button', {
    class: ['voice-pick__opt', v.id === cur && 'is-on'], type: 'button', role: 'radio', 'aria-checked': String(v.id === cur),
    onClick: () => { cur = v.id; onPick(v.id); render(); sound.speak(SAMPLE[v.id], { force: true, voice: v.id }); },
  }, icon('mic'), h('span', {}, h('b', {}, v.name), h('small', {}, v.sub)))));
  render();
  return h('div', { class: 'field voice-field' }, h('span', { class: 'field__label' }, label), box,
    h('span', { class: 'field__hint' }, 'Kliknij, żeby posłuchać. Brzmienie zależy od głosów zainstalowanych w przeglądarce.'));
}

/** Ustawienia dźwięku jako element (w oknie albo w rozwijanym menu „Ustawienia”). */
export function soundControls() {
  const s = sound.settings();
  const rows = h('div', { class: 'sound-rows' });
  const sw = (key, label, sub, after) => switchEl({ label, sub, checked: s[key], onChange: (v) => { sound.update({ [key]: v }); after?.(v); if (v) sound.play('pop'); } }).el;
  const detail = h('div', { class: 'sound-detail', hidden: !s.on });
  const musicVol = slider({ label: 'Głośność muzyki', value: s.musicVolume, onInput: (v) => sound.update({ musicVolume: v }) });
  musicVol.hidden = !s.music;
  detail.append(
    slider({ label: 'Głośność', value: s.volume, onInput: (v) => sound.update({ volume: v }) }),
    sw('ui', 'Kliknięcia przycisków', 'Ciche „klik” przy przyciskach i zakładkach.'),
    sw('fx', 'Efekty', 'Dobra i zła odpowiedź, punkty, nagrody, powiadomienia.'),
    sw('chalk', 'Kreda przy logo', 'Gdy na ekranie głównym pisze się napis EDUKRO, słychać kredę na tablicy.'),
    sw('music', 'Muzyka w tle', 'Gra cicho w tle. Utwór wybierasz w „Mój profil” (kliknij swoje profilowe). Najlepiej na słuchawkach.', (v) => { musicVol.hidden = !v; }),
    musicVol,
    sw('voice', 'Lektor podpowiedzi', sound.canSpeak() ? 'Samouczek i tryb pomocy czytają podpowiedzi na głos (głos przeglądarki).' : 'Ta przeglądarka nie potrafi czytać na głos – podpowiedzi będą tylko tekstem.'),
    sound.canSpeak() ? voicePicker() : null);
  rows.append(
    sw('on', 'Dźwięki w EDUKRO', 'Wyłącz, jeśli pracujesz w cichej sali.', (v) => { detail.hidden = !v; }),
    detail);
  return h('div', { class: 'sound-box' }, rows, h('div', { class: 'actions' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { sound.play('success'); setTimeout(() => sound.play('coin'), 520); } }, icon('play'), 'Wypróbuj efekty'),
      sound.canSpeak() ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => sound.speak('Cześć! Tak brzmi lektor EDUKRO.', { force: true }) }, icon('mic'), 'Posłuchaj lektora') : null),
    h('p', { class: 'small muted' }, 'Ustawienia dotyczą tego urządzenia.'));
}

export function openSoundSettings() {
  dialog({ iconName: 'volume', title: 'Dźwięk', body: soundControls(), actions: [{ label: 'Gotowe', kind: 'primary' }] });
}
