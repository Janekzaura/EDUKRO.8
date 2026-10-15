// Punkty ucznia: zdobyte na koncie (testy, sprawdziany, zakupy, odebrane ze skrzynki)
// + przyznane na lekcjach osobie z rejestru (liczą się po odebraniu w skrzynce).
import { one, all, run, now } from './db.js';

export function pointsBalance(userId) {
  const u = one('SELECT registry_id FROM users WHERE id = ?', userId);
  const own = one('SELECT COALESCE(SUM(amount), 0) n FROM points_ledger WHERE student_id = ?', userId).n;
  const cls = u?.registry_id ? one('SELECT COALESCE(SUM(amount), 0) n FROM class_points WHERE registry_id = ? AND claimed_at IS NOT NULL', u.registry_id).n : 0;
  return own + cls;
}

/** Punkty z lekcji, które czekają w skrzynce na odebranie. */
export function unclaimedClassPoints(userId) {
  const u = one('SELECT registry_id FROM users WHERE id = ?', userId);
  if (!u?.registry_id) return [];
  return all('SELECT * FROM class_points WHERE registry_id = ? AND claimed_at IS NULL ORDER BY id DESC LIMIT 200', u.registry_id);
}

export function pointsHistory(userId, limit = 30) {
  const u = one('SELECT registry_id FROM users WHERE id = ?', userId);
  const own = all('SELECT amount, reason, created_at AS createdAt FROM points_ledger WHERE student_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
  const cls = u?.registry_id
    ? all('SELECT amount, reason, claimed_at AS createdAt, 1 AS lesson FROM class_points WHERE registry_id = ? AND claimed_at IS NOT NULL ORDER BY claimed_at DESC LIMIT ?', u.registry_id, limit)
    : [];
  return [...own, ...cls].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Źródła, których nie zwiększa bonus Gwiazdy szkoły (×1,2): wydatki, zwroty, kary, sam bonus. */
export const NO_BOOST = new Set(['refund', 'shop', 'admin', 'star-bonus']);
export const STAR_BOOST = 1.2;

/** Dodaje punkty; Gwiazda szkoły dostaje ×1,2 za zdobyte punkty. Zwraca faktycznie dodaną liczbę. */
export function addPoints(userId, amount, reason, { activityId = null, attemptId = null, source = null, noBoost = false } = {}) {
  if (!amount) return 0;
  const t = now();
  run('INSERT INTO points_ledger (student_id, amount, reason, activity_id, attempt_id, created_at, source) VALUES (?,?,?,?,?,?,?)',
    userId, amount, reason, activityId, attemptId, t, source);
  let total = amount;
  if (amount > 0 && !noBoost && !NO_BOOST.has(source || '')) {
    const u = one('SELECT registry_id FROM users WHERE id = ?', userId);
    if (u?.registry_id && starBoostActive(u.registry_id, t)) {
      const extra = Math.round(amount * (STAR_BOOST - 1));
      if (extra > 0) {
        run('INSERT INTO points_ledger (student_id, amount, reason, activity_id, attempt_id, created_at, source) VALUES (?,?,?,?,?,?,?)',
          userId, extra, `Bonus Gwiazdy szkoły ×${String(STAR_BOOST).replace('.', ',')}`, activityId, attemptId, t, 'star-bonus');
        total += extra;
      }
    }
  }
  return total;
}
export const starBoostActive = (registryId, t = now()) => !!one('SELECT 1 FROM school_stars WHERE registry_id = ? AND until > ?', registryId, t);

/** Punkty z lekcji dla osoby z rejestru; runKey chroni przed podwójnym przyznaniem (np. po ponowieniu żądania). */
export function awardClassPoints(registryId, amount, reason, { activityId = null, by = null, runKey = null } = {}) {
  const r = run(`INSERT INTO class_points (registry_id, amount, reason, activity_id, awarded_by, run_key, created_at)
                 VALUES (?,?,?,?,?,?,?) ON CONFLICT(run_key) DO NOTHING`, registryId, amount, reason, activityId, by, runKey, now());
  return r.changes > 0;
}
