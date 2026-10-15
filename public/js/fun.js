// „Puls” ucznia (co 12 s): licznik skrzynki, punkty na pasku, profilowe i muzyka z profilu, wygląd aplikacji.
import { get } from './api.js';
import * as sound from './sound.js';

let timer = null;
let hooks = null;          // { state, applyInboxSummary, setPointsChip, syncTheme, refreshAvatar }
let last = { balance: null, card: null };

export function startPulse(h0) {
  hooks = h0;
  if (timer) return;
  pulse();
  timer = setInterval(() => { if (document.visibilityState === 'visible') pulse(); }, 12000);
}
export function stopPulse() {
  clearInterval(timer); timer = null;
  last = { balance: null, card: null };
}
document.addEventListener('visibilitychange', () => { if (timer && document.visibilityState === 'visible') pulse(); });
/** Natychmiastowe odświeżenie (np. po zakupie w sklepie). */
export function pulseNow() { if (timer) pulse(); }

async function pulse() {
  if (!hooks || hooks.state.user.role !== 'student') return;
  let r;
  try { r = await get('/api/pulse'); } catch { return; }
  const { state } = hooks;
  if (state.user.role !== 'student') return;
  hooks.applyInboxSummary(r.summary);
  if (last.balance !== null && r.balance !== last.balance) hooks.setPointsChip(r.balance);
  else state.user.points = r.balance;
  last.balance = r.balance;
  const cardKey = JSON.stringify(r.card);
  if (cardKey !== last.card) {
    state.user.card = r.card;
    if (last.card !== null) hooks.refreshAvatar?.();
    last.card = cardKey;
  }
  sound.setTrack(r.card?.music || 'calm');
  if (JSON.stringify(state.user.theme) !== JSON.stringify(r.theme)) { state.user.theme = r.theme; hooks.syncTheme(); }
}
