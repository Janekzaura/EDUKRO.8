// Podgląd profilu osoby (z rankingu, skrzynki…): profilowe z ramką, tytuły, klasa, kilka liczb –
// i muzyka tej osoby, która gra, dopóki okno jest otwarte.
import { h, icon, dialog, toast } from '../ui.js';
import { get } from '../api.js';
import { avatarEl, titleTags } from '../avatar.js';
import { MUSIC, CELEBRATIONS } from '../shared/shop.js';
import * as sound from '../sound.js';
import { celebrate } from '../celebrate.js';

const MUSIC_NAME = Object.fromEntries(MUSIC.map((m) => [m.id, m.name]));
const CELE_NAME = Object.fromEntries(CELEBRATIONS.map((m) => [m.id, m.name]));

export async function openProfile(userId) {
  let r;
  try { r = await get(`/api/profiles/${userId}`); } catch (e) { toast(e.message, 'error'); return; }
  const c = r.card;
  const s = sound.settings();
  const off = s.on ? sound.pushTrack(c.music || 'calm', { force: true }) : null;
  const eq = h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const stat = (n, label, ic) => h('div', { class: 'pc-stat' }, icon(ic), h('b', {}, String(n)), h('span', {}, label));
  const body = h('div', { class: 'pc' },
    h('div', { class: 'pc__hero' }, avatarEl(c, { size: 112, label: `Profilowe: ${c.firstName} ${c.lastName}` })),
    h('div', { class: 'pc__name' }, h('b', {}, `${c.firstName} ${c.lastName}`), h('div', { class: 'pc__titles' }, ...titleTags(c))),
    c.classLabel ? h('p', { class: 'pc__class' }, `klasa ${c.classLabel}`) : null,
    h('div', { class: 'pc__music', 'data-help': 'Muzyka tej osoby – gra, dopóki profil jest otwarty. Swoją wybierzesz w sklepie.' },
      s.on ? eq : icon('volumeOff'), icon('music'), h('span', {}, s.on ? `Gra: ${MUSIC_NAME[c.music] || 'Spokojna'}` : `Muzyka: ${MUSIC_NAME[c.music] || 'Spokojna'} (dźwięk wyłączony)`)),
    h('div', { class: 'pc__stats' },
      stat(r.stats.tests, 'ukończonych testów', 'check'),
      stat(r.stats.wins, 'wygranych testów', 'trophy'),
      stat(r.stats.stars, 'gwiazdek lekcji', 'star'),
      r.stats.titles ? stat(r.stats.titles, 'tytułów z rankingu', 'medal') : null),
    c.schoolStar ? h('p', { class: 'pc__star' }, icon('sparkle'), `Gwiazda szkoły do ${new Date(c.schoolStar.until).toLocaleString('pl-PL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} – ×1,2 punktów.`) : null,
    h('button', { class: 'btn btn--ghost btn--sm pc__cele', type: 'button', onClick: (e) => { const b = e.currentTarget.getBoundingClientRect(); celebrate({ count: 70, style: c.cele, origin: [b.left + b.width / 2, b.top] }); } }, icon('sparkle'), `Efekt: ${CELE_NAME[c.cele] || 'Konfetti'}`));
  dialog({ title: r.me ? 'Twój profil' : 'Profil', body, actions: [{ label: 'Zamknij', kind: 'primary' }], onClose: () => off && off() });
}
