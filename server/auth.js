// Sesje, role, limity prób i strażnicy uprawnień.
import { one, run, now } from './db.js';
import { config } from './config.js';
import { randomToken, sha256, verifySecret, DUMMY_HASH } from './security.js';
import { HttpError, parseCookies, setCookie, clearCookie } from './http.js';

export const SESSION_COOKIE = 'edukro_sid';

/* ---------- Limity prób ---------- */

/** Zwraca ile ms trzeba czekać, jeśli limit został przekroczony (bez zwiększania licznika). */
export function limitedFor(key, limit, windowMs) {
  const r = one('SELECT count, window_start FROM rate_limits WHERE key = ?', key);
  if (!r) return 0;
  const end = r.window_start + windowMs;
  if (end < now()) return 0;
  return r.count >= limit ? end - now() : 0;
}
/** Zwiększa licznik; zwraca ms blokady, jeśli po tej próbie limit został osiągnięty. */
export function hit(key, limit, windowMs) {
  const t = now();
  const r = one('SELECT count, window_start FROM rate_limits WHERE key = ?', key);
  if (!r || r.window_start + windowMs < t) {
    run('INSERT INTO rate_limits (key, count, window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start', key, t);
    return limit <= 1 ? windowMs : 0;
  }
  run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return r.count + 1 >= limit ? r.window_start + windowMs - t : 0;
}
export const resetLimit = (key) => run('DELETE FROM rate_limits WHERE key = ?', key);

export function tooMany(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return new HttpError(429, `Zbyt wiele prób. Spróbuj ponownie za ${min} min.`, { retryAfterMin: min });
}

/** Sprawdza wiele limitów naraz; rzuca 429 przy przekroczeniu. */
export function guardLimits(limits) {
  for (const [key, limit, windowMs] of limits) {
    const ms = limitedFor(key, limit, windowMs);
    if (ms > 0) throw tooMany(ms);
  }
}
export function failLimits(limits) {
  for (const [key, limit, windowMs] of limits) hit(key, limit, windowMs);
}

/* ---------- Sesje ---------- */

export function createSession(res, user) {
  const token = randomToken();
  const hours = config.sessionHours[user.role] || 4;
  const t = now();
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)',
    sha256(token), user.id, t, t + hours * 3600e3, t);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', t, user.id);
  setCookie(res, SESSION_COOKIE, token, { maxAgeSec: hours * 3600 });
}

export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  clearCookie(res, SESSION_COOKIE);
}

export function destroyUserSessions(userId) {
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/** Ustala, kim jest użytkownik – WYŁĄCZNIE na podstawie sesji po stronie serwera. */
export function loadSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const s = one(`SELECT s.id AS sid, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ?`, sha256(token));
  if (!s) return null;
  if (s.expires_at < now() || s.status === 'blocked') {
    run('DELETE FROM sessions WHERE id = ?', s.sid);
    return null;
  }
  run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', now(), s.sid);
  return s;
}

/* ---------- Strażnicy ---------- */

export function requireRole(...roles) {
  return (ctx) => {
    const u = ctx.user;
    if (!u) throw new HttpError(401, 'Musisz się zalogować.', { needLogin: true });
    if (!roles.includes(u.role)) throw new HttpError(403, 'Brak uprawnień do tej operacji.');
    if (u.must_change_code === 1 && !ctx.allowMustChange) {
      throw new HttpError(403, 'Najpierw ustaw nowy kod dostępu.', { mustChangeCode: true });
    }
  };
}

/** Uczeń zalogowany – także z kontem czekającym na zatwierdzenie (może się uczyć i zbierać punkty). */
export function requireStudent(ctx) {
  const u = ctx.user;
  if (!u) throw new HttpError(401, 'Ta aktywność jest dostępna dla zalogowanych uczniów.', { needLogin: true });
  if (u.role !== 'student') throw new HttpError(403, 'Aktywności mogą uruchamiać tylko konta uczniów.');
  if (u.status === 'blocked') throw new HttpError(403, 'To konto jest zablokowane.');
}
export const requireActiveStudent = requireStudent;

/** Wydawanie punktów (sklep) – tylko konto zatwierdzone przez administratora. */
export function requireApprovedStudent(ctx) {
  requireStudent(ctx);
  if (ctx.user.status !== 'active') {
    throw new HttpError(403, 'Twoje konto czeka na zatwierdzenie przez administratora. Punkty zbierasz normalnie, ale wydasz je dopiero po zatwierdzeniu.', { pending: true });
  }
}

/** Ponowne potwierdzenie kodem administratora przed operacjami nieodwracalnymi. */
export function confirmAdmin(ctx, code) {
  const limits = [[`confirm:admin:${ctx.user.id}`, 5, 15 * 60e3]];
  guardLimits(limits);
  const fresh = one('SELECT code_hash FROM users WHERE id = ?', ctx.user.id);
  if (!/^\d{4,8}$/.test(String(code || '')) || !verifySecret(String(code), fresh?.code_hash || DUMMY_HASH)) {
    failLimits(limits);
    throw new HttpError(403, 'Kod administratora jest nieprawidłowy. Operacja nie została wykonana.');
  }
}
