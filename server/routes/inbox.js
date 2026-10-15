// Skrzynka powiadomień, przyznawanie punktów (administrator bez limitu, nauczyciel raz dziennie do 100 pkt)
// oraz stan samouczka.
import crypto from 'node:crypto';
import { one, all, run, now, tx, audit } from '../db.js';
import { HttpError, str } from '../http.js';
import { requireRole } from '../auth.js';
import { pointsBalance, addPoints } from '../points.js';
import { inboxFor, summaryFor, markRead, claim, claimAll, notify, authorPhrase, gfor } from '../notify.js';

const anyone = requireRole('student', 'teacher', 'admin');
const giver = requireRole('teacher', 'admin');
export const TEACHER_DAILY_MAX = 100;
export const ADMIN_MAX = 100000;

/** Dzień w strefie szkoły (limit nauczyciela odnawia się o północy czasu polskiego). */
export function dayKey(t = Date.now()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date(t));
}

function budgetFor(user) {
  if (user.role === 'admin') return { unlimited: true, max: ADMIN_MAX, usedToday: false };
  const today = one('SELECT COUNT(DISTINCT batch) n, COALESCE(SUM(amount), 0) s FROM point_grants WHERE giver_id = ? AND day_key = ?', user.id, dayKey());
  return { unlimited: false, max: TEACHER_DAILY_MAX, usedToday: today.n > 0, givenToday: today.s };
}

const TUTORIAL_KEYS = /^[a-z0-9-]{2,40}$/;
export function tutorialOf(u) {
  try { const t = u.tutorial_json ? JSON.parse(u.tutorial_json) : {}; return { done: Array.isArray(t.done) ? t.done : [], offered: !!t.offered, off: !!t.off }; }
  catch { return { done: [], offered: false, off: false }; }
}

export function register(r) {
  /* ---------- Skrzynka ---------- */
  r.get('/api/inbox', (ctx) => inboxFor(ctx.user), anyone);
  r.get('/api/inbox/summary', (ctx) => summaryFor(ctx.user), anyone);
  r.post('/api/inbox/read', (ctx) => ({ marked: markRead(ctx.user, Array.isArray(ctx.body.ids) ? ctx.body.ids : null) }), anyone);
  r.post('/api/inbox/claim', (ctx) => claim(ctx.user, ctx.body.id), anyone);
  r.post('/api/inbox/claim-all', (ctx) => claimAll(ctx.user), anyone);

  /* ---------- Przyznawanie punktów ---------- */
  r.get('/api/grants', (ctx) => {
    const students = all(`SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, r.class_label AS classLabel
                          FROM users u LEFT JOIN registry r ON r.id = u.registry_id
                          WHERE u.role = 'student' AND u.status = 'active' ORDER BY r.class_label, u.last_name, u.first_name`);
    const mine = ctx.user.role === 'admin' ? '' : 'WHERE g.giver_id = ?';
    const history = all(`SELECT g.amount, g.message, g.created_at AS createdAt, g.giver_role AS giverRole,
                           u.first_name AS firstName, u.last_name AS lastName, gv.first_name AS giverFirst, gv.last_name AS giverLast
                         FROM point_grants g JOIN users u ON u.id = g.student_id LEFT JOIN users gv ON gv.id = g.giver_id
                         ${mine} ORDER BY g.id DESC LIMIT 40`, ...(mine ? [ctx.user.id] : []));
    if (ctx.user.role === 'admin') for (const st of students) st.points = pointsBalance(st.id);
    return { students, budget: budgetFor(ctx.user), history, homeroom: ctx.user.homeroom_class || null };
  }, giver);

  r.post('/api/grants', (ctx) => {
    const u = ctx.user;
    const ids = [...new Set((Array.isArray(ctx.body.studentIds) ? ctx.body.studentIds : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
    if (!ids.length) throw new HttpError(400, 'Wybierz co najmniej jednego ucznia.');
    if (ids.length > 500) throw new HttpError(400, 'Za dużo uczniów naraz.');
    const amount = Number(ctx.body.amount);
    const max = u.role === 'admin' ? ADMIN_MAX : TEACHER_DAILY_MAX;
    if (!Number.isInteger(amount) || amount < 1 || amount > max) throw new HttpError(400, `Liczba punktów: od 1 do ${max}.`);
    const message = str(ctx.body.message, { max: 200, field: 'Wiadomość' });
    const students = ids.map((sid) => one("SELECT id, first_name, last_name FROM users WHERE id = ? AND role = 'student' AND status = 'active'", sid));
    if (students.some((s) => !s)) throw new HttpError(400, 'Punkty można przyznać tylko zatwierdzonym kontom uczniów.');
    return tx(() => {
      if (u.role === 'teacher') {
        const b = budgetFor(u);
        if (b.usedToday) throw new HttpError(409, `Dziś już ${gfor(u, 'przyznałeś', 'przyznałaś')} punkty. Kolejne przyznanie będzie możliwe jutro.`, { usedToday: true });
        if (amount * students.length > TEACHER_DAILY_MAX) {
          throw new HttpError(400, `Nauczyciel może przyznać dziennie łącznie do ${TEACHER_DAILY_MAX} pkt (${students.length} × ${amount} = ${amount * students.length}).`);
        }
      }
      const batch = crypto.randomBytes(6).toString('hex');
      const t = now();
      const who = authorPhrase(u.id, 'przyznał');
      for (const s of students) {
        run('INSERT INTO point_grants (giver_id, giver_role, student_id, amount, message, day_key, batch, created_at) VALUES (?,?,?,?,?,?,?,?)',
          u.id, u.role, s.id, amount, message, dayKey(t), batch, t);
        notify(s.id, { kind: 'gift', title: `${who} Ci ${amount} pkt!`, body: message || 'Odbierz punkty – trafią na Twoje konto.', points: amount });
      }
      audit(u.id, 'points.grant', `students:${students.length};amount:${amount}`);
      return { ok: true, count: students.length, amount, budget: budgetFor(u) };
    });
  }, giver);

  /* Odejmowanie punktów – tylko administrator. Saldo nie spada poniżej zera. */
  r.post('/api/grants/deduct', (ctx) => {
    const u = ctx.user;
    const ids = [...new Set((Array.isArray(ctx.body.studentIds) ? ctx.body.studentIds : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
    if (!ids.length) throw new HttpError(400, 'Wybierz co najmniej jednego ucznia.');
    if (ids.length > 500) throw new HttpError(400, 'Za dużo uczniów naraz.');
    const amount = Number(ctx.body.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > ADMIN_MAX) throw new HttpError(400, `Liczba punktów do odjęcia: od 1 do ${ADMIN_MAX}.`);
    const message = str(ctx.body.message, { max: 200, field: 'Powód' });
    const students = ids.map((sid) => one("SELECT id, first_name, last_name FROM users WHERE id = ? AND role = 'student'", sid));
    if (students.some((s) => !s)) throw new HttpError(400, 'Punkty można odjąć tylko kontom uczniów.');
    return tx(() => {
      const batch = crypto.randomBytes(6).toString('hex');
      const t = now();
      const out = [];
      for (const s of students) {
        const take = Math.min(amount, Math.max(0, pointsBalance(s.id)));
        out.push({ id: s.id, name: `${s.first_name} ${s.last_name}`, taken: take });
        if (!take) continue;
        addPoints(s.id, -take, `Odjęte przez administratora${message ? `: ${message}` : ''}`, { source: 'admin' });
        run('INSERT INTO point_grants (giver_id, giver_role, student_id, amount, message, day_key, batch, created_at) VALUES (?,?,?,?,?,?,?,?)',
          u.id, u.role, s.id, -take, message, dayKey(t), batch, t);
        notify(s.id, { kind: 'deduct', title: `Administrator odjął Ci ${take} pkt`, body: message || 'Jeśli uważasz, że to pomyłka, porozmawiaj z wychowawcą.' });
      }
      const total = out.reduce((n, x) => n + x.taken, 0);
      audit(u.id, 'points.deduct', `students:${students.length};amount:${amount};total:${total}`);
      return { ok: true, count: out.filter((x) => x.taken).length, total, short: out.filter((x) => x.taken < amount) };
    });
  }, requireRole('admin'));

  /* ---------- Samouczek (stan zapisany na koncie, więc nie wraca na innym urządzeniu) ---------- */
  r.put('/api/me/tutorial', (ctx) => {
    const cur = tutorialOf(ctx.user);
    const done = new Set(cur.done);
    for (const k of (Array.isArray(ctx.body.done) ? ctx.body.done : [])) if (TUTORIAL_KEYS.test(String(k))) done.add(String(k));
    if (Array.isArray(ctx.body.reset)) for (const k of ctx.body.reset) done.delete(String(k));
    const next = { done: [...done].slice(0, 40), offered: ctx.body.offered === undefined ? cur.offered : !!ctx.body.offered, off: ctx.body.off === undefined ? cur.off : !!ctx.body.off };
    run('UPDATE users SET tutorial_json = ?, updated_at = ? WHERE id = ?', JSON.stringify(next), now(), ctx.user.id);
    return { tutorial: next };
  }, anyone, { allowMustChange: true });
}
