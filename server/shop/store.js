// Ekwipunek ucznia (przedmioty ze sklepu).
import { one, run } from '../db.js';

export const itemQty = (userId, item) => one('SELECT qty FROM inventory WHERE user_id = ? AND item = ?', userId, item)?.qty || 0;

export function grantItem(userId, item, qty = 1, { max = null } = {}) {
  run(`INSERT INTO inventory (user_id, item, qty) VALUES (?,?,?)
       ON CONFLICT(user_id, item) DO UPDATE SET qty = ${max ? `MIN(${Number(max)}, qty + excluded.qty)` : 'qty + excluded.qty'}`, userId, item, qty);
}

/** Zużywa przedmiot; zwraca false, gdy uczeń go nie ma. */
export function takeItem(userId, item, qty = 1) {
  const r = run('UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?', qty, userId, item, qty);
  return r.changes > 0;
}
