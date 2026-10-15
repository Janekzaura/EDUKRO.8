// Profil i rankingi oraz „puls” ucznia (skrzynka, punkty, profil i wygląd – odświeżane co kilkanaście sekund).
import { one, all, now } from '../db.js';
import { HttpError, id } from '../http.js';
import { requireRole, requireStudent } from '../auth.js';
import { pointsBalance } from '../points.js';
import { summaryFor } from '../notify.js';
import { cardById, card } from '../profile.js';
import { rankings, testRanking } from '../rankings.js';
import { themeOf } from './shop.js';

const anyone = requireRole('student', 'teacher', 'admin');

export function register(r) {
  r.get('/api/pulse', (ctx) => {
    const u = ctx.user;
    return {
      summary: summaryFor(u), balance: pointsBalance(u.id),
      card: card(one('SELECT u.*, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id = ?', u.id)),
      theme: themeOf(u), now: now(),
    };
  }, requireStudent);

  /* Podgląd profilu innej osoby (karta + kilka liczb) – dla zalogowanych. */
  r.get('/api/profiles/:id', (ctx) => {
    const c = cardById(id(ctx.params.id));
    if (!c) throw new HttpError(404, 'Nie znaleziono tej osoby.');
    const u = one('SELECT registry_id FROM users WHERE id = ?', c.id);
    const stats = {
      tests: one("SELECT COUNT(*) n FROM test_attempts WHERE user_id = ? AND preview = 0 AND status IN ('passed','completed')", c.id).n,
      wins: one('SELECT COUNT(*) n FROM test_winners WHERE user_id = ?', c.id).n,
      stars: u?.registry_id ? one('SELECT COUNT(*) n FROM lesson_stars WHERE registry_id = ?', u.registry_id).n : 0,
      titles: all("SELECT item FROM inventory WHERE user_id = ? AND item LIKE 'title:lider-%' AND qty > 0", c.id).length,
    };
    return { card: c, stats, me: ctx.user.id === c.id };
  }, anyone);

  r.get('/api/rankings', (ctx) => {
    const st = ctx.user.role === 'student';
    return { ...rankings(st ? ctx.user : null, { limit: 20 }), participating: st ? ctx.user.rankings_on !== 0 : null };
  }, anyone);

  r.get('/api/tests/:id/ranking', (ctx) => {
    const a = one("SELECT id, title, kind, status FROM activities WHERE id = ? AND kind IN ('teaching_test','exam_test','quiz')", id(ctx.params.id));
    if (!a || (a.status !== 'published' && ctx.user.role === 'student')) throw new HttpError(404, 'Nie znaleziono testu.');
    const limit = Number(ctx.query.limit) > 0 ? Math.min(100, Number(ctx.query.limit)) : 20;
    const me = ctx.user.role === 'student' && ctx.user.rankings_on !== 0 ? ctx.user.id : null;
    return { test: { id: a.id, title: a.title, kind: a.kind }, ...testRanking(a.id, me, limit), participating: ctx.user.role === 'student' ? ctx.user.rankings_on !== 0 : null };
  }, anyone);
}
