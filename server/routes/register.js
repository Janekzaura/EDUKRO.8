// Rejestracja ucznia: rejestr → e-mail (bez weryfikacji) → własny kod PIN → konto czeka na zatwierdzenie.
// Uczeń od razu może się uczyć i zbierać punkty; administrator zatwierdza konto albo je odrzuca (usuwa).
import { one, run, now, tx, nameKey } from '../db.js';
import { config } from '../config.js';
import { randomToken, sha256, hashSecret, maskEmail, EMAIL_RE } from '../security.js';
import { HttpError, str, parseCookies, setCookie, clearCookie } from '../http.js';
import { guardLimits, failLimits, createSession } from '../auth.js';
import { notify, notifyAdmins } from '../notify.js';
import { publicUser, validateDigitsCode } from './common.js';

const REG_COOKIE = 'edukro_reg';
const ATTEMPT_MIN = 30;
const MIN15 = 15 * 60e3;

/** E-mail jest na razie opcjonalny – pusty znaczy „bez e-maila”. */
function emailOpt(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (!e) return null;
  if (e.length > 120 || !EMAIL_RE.test(e)) throw new HttpError(400, 'Podaj prawidłowy adres e-mail albo zostaw pole puste.');
  return e;
}

function loadAttempt(ctx, { required = true } = {}) {
  const token = parseCookies(ctx.req)[REG_COOKIE];
  const a = token && one(`SELECT a.*, r.first_name, r.last_name, r.name_key, r.approved_email
                          FROM registration_attempts a JOIN registry r ON r.id = a.registry_id
                          WHERE a.token_hash = ? AND a.superseded = 0 AND a.expires_at > ?`, sha256(token), now());
  if (!a && required) throw new HttpError(410, 'Sesja rejestracji wygasła. Zacznij od początku.', { restart: true });
  if (a && one("SELECT 1 FROM users WHERE role = 'student' AND registry_id = ?", a.registry_id)) {
    run('UPDATE registration_attempts SET superseded = 1 WHERE id = ?', a.id);
    throw new HttpError(409, 'Dla tej osoby istnieje już konto.', { taken: true, restart: true });
  }
  return a;
}

export function register(r) {
  r.get('/api/register/state', (ctx) => {
    const a = loadAttempt(ctx, { required: false });
    if (!a) return { step: 'name', pinLength: config.pinLength };
    return { step: 'code', firstName: a.first_name, maskedEmail: maskEmail(a.email), pinLength: config.pinLength };
  });

  /* KROK 1 – imię i nazwisko w rejestrze uprawnionych uczniów */
  r.post('/api/register/start', (ctx) => {
    const limits = [[`reg-start:ip:${ctx.ip}`, 20, MIN15]];
    guardLimits(limits);
    failLimits(limits);
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    const reg = one('SELECT * FROM registry WHERE name_key = ?', nameKey(first, last));
    if (!reg) {
      throw new HttpError(404, 'Nie znaleźliśmy tego imienia i nazwiska na liście uczniów EDUKRO. Sprawdź pisownię lub skontaktuj się z administratorem.', { notInRegistry: true });
    }
    if (one("SELECT 1 FROM users WHERE role = 'student' AND registry_id = ?", reg.id)) {
      throw new HttpError(409, 'Dla tego imienia i nazwiska istnieje już konto. Jeśli to Twoje konto, zaloguj się. Jeśli to nie Twoje konto, zgłoś problem administratorowi.', { taken: true });
    }
    const token = randomToken();
    const t = now();
    tx(() => {
      // nowa próba zastępuje poprzednie, niedokończone próby tej osoby
      run('UPDATE registration_attempts SET superseded = 1 WHERE registry_id = ?', reg.id);
      run(`INSERT INTO registration_attempts (token_hash, registry_id, created_at, expires_at) VALUES (?,?,?,?)`,
        sha256(token), reg.id, t, t + ATTEMPT_MIN * 60e3);
    });
    setCookie(ctx.res, REG_COOKIE, token, { maxAgeSec: ATTEMPT_MIN * 60 });
    return { ok: true, firstName: reg.first_name };
  });

  /* KROK 2 – adres e-mail (bez wysyłania kodu – konto i tak zatwierdza administrator) */
  r.post('/api/register/email', (ctx) => {
    const a = loadAttempt(ctx);
    const email = emailOpt(ctx.body.email);
    if (email && one('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'Ten adres e-mail jest już używany przez inne konto.');
    const notify = ctx.body.notifyOptIn === true ? 1 : 0;
    run('UPDATE registration_attempts SET email = ?, notify_opt_in = ?, expires_at = ? WHERE id = ?', email, notify, now() + ATTEMPT_MIN * 60e3, a.id);
    return { ok: true, maskedEmail: email ? maskEmail(email) : null, pinLength: config.pinLength };
  });

  /* KROK 3 – własny kod PIN, utworzenie konta (zawsze czeka na zatwierdzenie administratora) */
  r.post('/api/register/complete', (ctx) => {
    const limits = [[`reg-complete:ip:${ctx.ip}`, 20, MIN15]];
    guardLimits(limits);
    failLimits(limits);
    const a = loadAttempt(ctx);
    const email = ctx.body.email !== undefined ? emailOpt(ctx.body.email) : a.email;
    if (email && one('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'Ten adres e-mail jest już używany przez inne konto.');
    const code = validateDigitsCode(ctx.body.code, config.pinLength);
    if (String(ctx.body.codeRepeat ?? '') !== code) throw new HttpError(400, 'Kod i jego powtórzenie różnią się.');
    const status = 'pending';
    const user = tx(() => {
      if (one("SELECT 1 FROM users WHERE role = 'student' AND registry_id = ?", a.registry_id)) {
        throw new HttpError(409, 'Dla tej osoby istnieje już konto.', { taken: true });
      }
      const t = now();
      const uid = run(`INSERT INTO users (role, first_name, last_name, name_key, email, email_verified, notify_opt_in,
          status, code_hash, registry_id, created_at, updated_at)
          VALUES ('student',?,?,?,?,0,?,?,?,?,?,?)`,
        a.first_name, a.last_name, nameKey(a.first_name, a.last_name), email, a.notify_opt_in, status,
        hashSecret(code), a.registry_id, t, t).lastInsertRowid;
      run('UPDATE registration_attempts SET superseded = 1 WHERE registry_id = ?', a.registry_id);
      return one('SELECT * FROM users WHERE id = ?', uid);
    });
    clearCookie(ctx.res, REG_COOKIE);
    createSession(ctx.res, user);
    const cls = one('SELECT class_label FROM registry WHERE id = ?', a.registry_id)?.class_label;
    notifyAdmins({ kind: 'admin_account', title: `Nowe konto ucznia: ${user.first_name} ${user.last_name}`, body: `${cls ? `Klasa ${cls}. ` : ''}Konto czeka na zatwierdzenie.`, link: '/administracja/konta' }, `acc:${user.id}`);
    notify(user.id, { kind: 'welcome', title: `Witaj w EDUKRO, ${user.first_name}!`, body: 'Tu, w skrzynce, znajdziesz wiadomości od nauczycieli, nowe testy i lekcje, a także punkty i nagrody do odebrania.', dedupe: `welcome:${user.id}` });
    return { ok: true, status, user: publicUser(user) };
  });

  r.post('/api/register/cancel', (ctx) => {
    const token = parseCookies(ctx.req)[REG_COOKIE];
    if (token) run('UPDATE registration_attempts SET superseded = 1 WHERE token_hash = ?', sha256(token));
    clearCookie(ctx.res, REG_COOKIE);
    return { ok: true };
  });
}
