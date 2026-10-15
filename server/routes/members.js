// Profil ucznia i panel nauczyciela.
import { one, all, run, now } from '../db.js';
import { HttpError, id } from '../http.js';
import { requireRole } from '../auth.js';
import { publicUser, subjectRow, teachersForSubject, KINDS, getSubjectOr404 } from './common.js';
import { pointsBalance, pointsHistory } from '../points.js';
import { itemQty } from '../shop/store.js';
import { summaryFor } from '../notify.js';

const student = requireRole('student');
const teacher = requireRole('teacher');

/** Przedmioty, do których nauczyciel ma uprawnienia (z bazy, nie z kodu). */
export function teacherSubjectIds(teacherId) {
  return all('SELECT subject_id FROM teacher_subjects WHERE teacher_id = ?', teacherId).map((r) => r.subject_id);
}

export function register(r) {
  /* ---------- Uczeń ---------- */
  r.get('/api/me/profile', (ctx) => {
    const u = ctx.user;
    const subjects = all('SELECT * FROM subjects WHERE is_available = 1 ORDER BY sort_order, name').map((s) => ({
      ...subjectRow(s),
      teachers: teachersForSubject(s.id),
      sharing: !!(one('SELECT share FROM student_sharing WHERE student_id = ? AND subject_id = ?', u.id, s.id)?.share ?? 1), // domyślnie udostępnia
    }));
    const results = all(`SELECT r.id, r.score, r.max_score AS maxScore, r.completed_at AS completedAt, r.grade,
        r.shared_with_teacher AS shared, r.direct_to_teacher AS direct, r.mistakes, a.title, a.kind, s.name AS subject
        FROM results r JOIN activities a ON a.id = r.activity_id JOIN subjects s ON s.id = r.subject_id
        WHERE r.student_id = ? ORDER BY r.completed_at DESC LIMIT 200`, u.id);
    const completed = Object.fromEntries(KINDS.map((k) => [k, results.filter((x) => x.kind === k).length]));
    const reg = u.registry_id ? one('SELECT class_label FROM registry WHERE id = ?', u.registry_id) : null;
    return {
      user: publicUser(u), subjects, results, completed, classLabel: reg?.class_label || null,
      points: { balance: pointsBalance(u.id), history: pointsHistory(u.id), canSpend: u.status === 'active', lifelines: itemQty(u.id, 'lifeline'), ...summaryFor(u) },
    };
  }, student);

  r.put('/api/me/preferences', (ctx) => {
    const b = ctx.body;
    if (b.notifyOptIn === undefined && b.rankingsOn === undefined) throw new HttpError(400, 'Nieprawidłowe ustawienie.');
    for (const k of ['notifyOptIn', 'rankingsOn']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw new HttpError(400, 'Nieprawidłowe ustawienie.');
    if (b.notifyOptIn !== undefined) run('UPDATE users SET notify_opt_in = ?, updated_at = ? WHERE id = ?', b.notifyOptIn ? 1 : 0, now(), ctx.user.id);
    if (b.rankingsOn !== undefined) run('UPDATE users SET rankings_on = ?, updated_at = ? WHERE id = ?', b.rankingsOn ? 1 : 0, now(), ctx.user.id);
    return { ok: true, user: publicUser(one('SELECT * FROM users WHERE id = ?', ctx.user.id)) };
  }, student);

  /* Jak EDUKRO ma się do mnie zwracać („zrobiłeś” / „zrobiłaś”) – każdy zalogowany może to zmienić. */
  r.put('/api/me/gender', (ctx) => {
    const g = ctx.body.gender;
    if (!['m', 'f'].includes(g)) throw new HttpError(400, 'Wybierz formę.');
    run('UPDATE users SET gender = ?, updated_at = ? WHERE id = ?', g, now(), ctx.user.id);
    return { ok: true, user: publicUser({ ...ctx.user, gender: g }) };
  }, requireRole('student', 'teacher', 'admin'));

  r.put('/api/me/sharing', (ctx) => {
    const s = getSubjectOr404(id(ctx.body.subjectId));
    if (typeof ctx.body.share !== 'boolean') throw new HttpError(400, 'Nieprawidłowe ustawienie.');
    run(`INSERT INTO student_sharing (student_id, subject_id, share) VALUES (?,?,?)
         ON CONFLICT(student_id, subject_id) DO UPDATE SET share = excluded.share`, ctx.user.id, s.id, ctx.body.share ? 1 : 0);
    return { ok: true };
  }, student);

  /* ---------- Nauczyciel ---------- */
  r.get('/api/teacher/overview', (ctx) => {
    const ids = teacherSubjectIds(ctx.user.id);
    const subjects = ids.map((sid) => {
      const s = one('SELECT * FROM subjects WHERE id = ?', sid);
      const counts = Object.fromEntries(KINDS.map((k) => [k, { published: 0, draft: 0 }]));
      for (const c of all('SELECT kind, status, COUNT(*) n FROM activities WHERE subject_id = ? GROUP BY kind, status', sid)) {
        if (counts[c.kind] && c.status !== 'archived') counts[c.kind][c.status] = c.n;
      }
      const sharing = one(`SELECT COUNT(*) n FROM users u LEFT JOIN student_sharing ss ON ss.student_id = u.id AND ss.subject_id = ?
          WHERE u.role = 'student' AND u.status != 'blocked' AND COALESCE(ss.share, 1) = 1`, sid).n;
      const resultsCount = one(`SELECT COUNT(*) n FROM results r LEFT JOIN student_sharing ss
          ON ss.student_id = r.student_id AND ss.subject_id = r.subject_id
          WHERE r.subject_id = ? AND (r.direct_to_teacher = 1 OR (r.shared_with_teacher = 1 AND COALESCE(ss.share, 1) = 1))`, sid).n;
      return { ...subjectRow(s), order: s.sort_order, counts, studentsSharing: sharing, resultsCount };
    }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pl'));
    const praisePending = ctx.user.homeroom_class ? one("SELECT COUNT(*) n FROM praise_requests WHERE status = 'pending' AND lower(replace(class_label, ' ', '')) = lower(replace(?, ' ', ''))", ctx.user.homeroom_class).n : 0;
    return { user: publicUser(ctx.user), subjects, praisePending };
  }, teacher);

  /* Wyniki: tylko przedmioty nauczyciela i tylko udostępnione przez ucznia. */
  r.get('/api/teacher/results', (ctx) => {
    const ids = teacherSubjectIds(ctx.user.id);
    let scope = ids;
    if (ctx.query.subjectId) {
      const sid = id(ctx.query.subjectId);
      if (!ids.includes(sid)) throw new HttpError(403, 'Nie masz uprawnień do wyników z tego przedmiotu.');
      scope = [sid];
    }
    if (!scope.length) return { results: [] };
    // Pierwsze zaliczenie egzaminu trafia do nauczyciela bezpośrednio (zasada szkoły);
    // pozostałe wyniki – tylko jeśli uczeń udostępnia wyniki z danego przedmiotu.
    const results = all(`SELECT r.id, r.score, r.max_score AS maxScore, r.completed_at AS completedAt, r.mistakes, r.grade,
        r.direct_to_teacher AS direct,
        u.first_name AS firstName, u.last_name AS lastName, a.title, a.kind, s.name AS subject, s.id AS subjectId
        FROM results r
        JOIN users u ON u.id = r.student_id AND u.role = 'student' AND u.status = 'active'
        JOIN activities a ON a.id = r.activity_id
        JOIN subjects s ON s.id = r.subject_id
        LEFT JOIN student_sharing ss ON ss.student_id = r.student_id AND ss.subject_id = r.subject_id
        WHERE (r.direct_to_teacher = 1 OR (r.shared_with_teacher = 1 AND COALESCE(ss.share, 1) = 1))
          AND r.subject_id IN (${scope.map(() => '?').join(',')})
        ORDER BY r.completed_at DESC LIMIT 500`, ...scope);
    return { results };
  }, teacher);
}
