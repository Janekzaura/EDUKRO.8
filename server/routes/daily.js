// Dzienne pytania: w każdym przedmiocie nauczyciel tworzy dowolnie wiele pytań, a uczeń raz dziennie
// losuje jedno pytanie z każdego przedmiotu.
//  • Seria (streak): liczy się PIERWSZE dzienne pytanie dnia (z dowolnego przedmiotu). Dobra odpowiedź –
//    seria +1 i tyle punktów, ile wynosi seria (1, 2, 3…). Zła odpowiedź albo opuszczony dzień – seria od zera.
//  • Każde kolejne dzienne pytanie tego dnia (z innych przedmiotów): dobra odpowiedź = +2 pkt bonusu.
//  • Wylosowane pytanie jest ustalone na cały dzień – odświeżenie strony nie losuje nowego.
import crypto from 'node:crypto';
import { one, all, run, now, tx, audit } from '../db.js';
import { HttpError, id } from '../http.js';
import { requireRole, requireStudent } from '../auth.js';
import { cleanQuestion, mediaIds } from '../quiz/schema.js';
import { validateQuestion, TYPE, clean } from '../../public/js/shared/quiz-rules.js';
import { prepare, grade, seededRng } from '../quiz/engine.js';
import { addPoints, pointsBalance } from '../points.js';
import { editableSubjects, assertSubject } from './tests.js';

export const DAILY_BONUS = 2;
const editor = requireRole('teacher', 'admin');

/** Dzień w Polsce (YYYY-MM-DD) – pytanie dnia zmienia się o północy. */
export const dayKey = (t = now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
export function prevDay(day) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

const parseQ = (json) => { try { return cleanQuestion(JSON.parse(json)); } catch { return null; } };
function dropUnknownMedia(q) {
  for (const m of mediaIds([q])) if (!one('SELECT 1 FROM media WHERE id = ?', m)) { if (q.image === m) q.image = null; if (q.diagram === m) q.diagram = null; }
  return q;
}
const authorOf = (row) => {
  if (!row.created_by) return null;
  const u = one('SELECT first_name, last_name, role FROM users WHERE id = ?', row.created_by);
  return u ? (u.role === 'admin' ? 'Administrator' : `${u.first_name} ${u.last_name}`) : null;
};
const canEdit = (user, row) => user.role === 'admin' || row.created_by === user.id;
function manageRow(row, user) {
  const q = parseQ(row.question_json) || {};
  const st = one('SELECT COUNT(*) n, COALESCE(SUM(correct), 0) ok FROM daily_answers WHERE question_id = ? AND answered_at IS NOT NULL', row.id);
  return {
    id: row.id, subjectId: row.subject_id, active: !!row.active, type: q.type, typeLabel: TYPE[q.type]?.label || '—', prompt: clean(q.prompt),
    author: authorOf(row), mine: row.created_by === user.id, canEdit: canEdit(user, row), answered: st.n, correct: st.ok, updatedAt: row.updated_at,
  };
}

/** Seria ucznia: aktualna (żywa, gdy ostatni dobry dzień to dziś albo wczoraj) i najlepsza. */
export function streakOf(userId, day = dayKey()) {
  const r = one('SELECT * FROM daily_streaks WHERE student_id = ?', userId);
  const alive = r && r.streak > 0 && (r.last_day === day || r.last_day === prevDay(day));
  return { streak: alive ? r.streak : 0, best: r?.best || 0, today: r?.last_day === day };
}

function studentSubjects(userId) {
  const day = dayKey();
  const rows = all(`SELECT s.id, s.name, s.slug, s.accent, s.motif, COUNT(q.id) n FROM subjects s
                    JOIN daily_questions q ON q.subject_id = s.id AND q.active = 1
                    WHERE s.is_available = 1 GROUP BY s.id ORDER BY s.sort_order, s.name`);
  const mine = Object.fromEntries(all('SELECT * FROM daily_answers WHERE student_id = ? AND day = ?', userId, day).map((a) => [a.subject_id, a]));
  return rows.map((s) => {
    const a = mine[s.id];
    return { id: s.id, name: s.name, slug: s.slug, accent: s.accent, count: s.n,
      state: !a ? 'new' : a.answered_at ? 'done' : 'open', correct: a?.answered_at ? !!a.correct : null, points: a?.points || 0, first: !!a?.first };
  });
}
function overview(userId) {
  const day = dayKey();
  const st = streakOf(userId, day);
  const todays = all('SELECT * FROM daily_answers WHERE student_id = ? AND day = ?', userId, day);
  const first = todays.find((a) => a.first);
  // ile dostaniesz za pierwsze pytanie dnia (seria + 1)
  const next = first ? null : st.streak + 1;
  return { day, streak: st.streak, best: st.best, firstDone: !!first, firstCorrect: first?.answered_at ? !!first.correct : null, nextPoints: next, bonus: DAILY_BONUS, subjects: studentSubjects(userId) };
}

function viewOf(a) {
  const q = parseQ(a.question_json);
  const { view } = prepare(q, { shuffleAnswers: true }, { rng: seededRng(a.seed) });
  return { ...view, serve: null };
}

export function register(r) {
  /* ================= Nauczyciel / administrator: baza pytań ================= */
  r.get('/api/daily/manage', (ctx) => {
    const subjects = editableSubjects(ctx.user).map((s) => ({ ...s, count: one('SELECT COUNT(*) n FROM daily_questions WHERE subject_id = ?', s.id).n }));
    const sid = Number(ctx.query.subjectId) || subjects[0]?.id || null;
    if (sid) assertSubject(ctx.user, sid);
    const rows = sid ? all('SELECT * FROM daily_questions WHERE subject_id = ? ORDER BY id DESC', sid) : [];
    return { subjects, subjectId: sid, questions: rows.map((x) => manageRow(x, ctx.user)), bonus: DAILY_BONUS };
  }, editor);

  r.get('/api/daily/manage/:id', (ctx) => {
    const row = one('SELECT * FROM daily_questions WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono pytania.');
    assertSubject(ctx.user, row.subject_id);
    return { question: parseQ(row.question_json), item: manageRow(row, ctx.user), subjects: editableSubjects(ctx.user) };
  }, editor);

  const cleanValid = (raw) => {
    const q = dropUnknownMedia(cleanQuestion(raw || {}));
    if (!q.type) throw new HttpError(400, 'Wybierz rodzaj pytania.');
    const errs = validateQuestion(q, { kind: 'teaching_test' }).problems.filter((p) => p.level === 'error');
    if (errs.length) throw new HttpError(400, `Pytanie nie jest gotowe: ${errs[0].msg}`, { problems: errs });
    return q;
  };

  r.post('/api/daily/manage', (ctx) => {
    const subjectId = id(ctx.body.subjectId);
    assertSubject(ctx.user, subjectId);
    const q = cleanValid(ctx.body.question);
    const t = now();
    const qid = run('INSERT INTO daily_questions (subject_id, question_json, active, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?)',
      subjectId, JSON.stringify(q), ctx.body.active === false ? 0 : 1, ctx.user.id, t, t).lastInsertRowid;
    audit(ctx.user.id, 'daily.create', `daily:${qid}`);
    return { item: manageRow(one('SELECT * FROM daily_questions WHERE id = ?', qid), ctx.user) };
  }, editor);

  r.put('/api/daily/manage/:id', (ctx) => {
    const row = one('SELECT * FROM daily_questions WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono pytania.');
    assertSubject(ctx.user, row.subject_id);
    if (!canEdit(ctx.user, row)) throw new HttpError(403, 'To pytanie dodał inny nauczyciel – zmienić je może tylko autor albo administrator.');
    if (ctx.body.question !== undefined) {
      const subjectId = ctx.body.subjectId !== undefined ? id(ctx.body.subjectId) : row.subject_id;
      assertSubject(ctx.user, subjectId);
      run('UPDATE daily_questions SET question_json = ?, subject_id = ?, updated_at = ? WHERE id = ?', JSON.stringify(cleanValid(ctx.body.question)), subjectId, now(), row.id);
    }
    if (typeof ctx.body.active === 'boolean') run('UPDATE daily_questions SET active = ?, updated_at = ? WHERE id = ?', ctx.body.active ? 1 : 0, now(), row.id);
    audit(ctx.user.id, 'daily.edit', `daily:${row.id}`);
    return { item: manageRow(one('SELECT * FROM daily_questions WHERE id = ?', row.id), ctx.user) };
  }, editor);

  r.delete('/api/daily/manage/:id', (ctx) => {
    const row = one('SELECT * FROM daily_questions WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono pytania.');
    assertSubject(ctx.user, row.subject_id);
    if (!canEdit(ctx.user, row)) throw new HttpError(403, 'To pytanie dodał inny nauczyciel – usunąć je może tylko autor albo administrator.');
    run('DELETE FROM daily_questions WHERE id = ?', row.id);
    audit(ctx.user.id, 'daily.delete', `daily:${row.id}`);
    return { ok: true };
  }, editor);

  /* ================= Uczeń ================= */
  r.get('/api/daily', (ctx) => overview(ctx.user.id), requireStudent);

  /** Losowanie (albo zwrot już wylosowanego) pytania z przedmiotu na dziś. */
  r.post('/api/daily/:subjectId/draw', (ctx) => {
    const sid = id(ctx.params.subjectId);
    const s = one('SELECT id, name, is_available FROM subjects WHERE id = ?', sid);
    if (!s || !s.is_available) throw new HttpError(404, 'Nie ma takiego przedmiotu.');
    const day = dayKey();
    const a = tx(() => {
      let row = one('SELECT * FROM daily_answers WHERE student_id = ? AND subject_id = ? AND day = ?', ctx.user.id, sid, day);
      if (row) return row;
      const pool = all('SELECT id, question_json FROM daily_questions WHERE subject_id = ? AND active = 1', sid);
      if (!pool.length) throw new HttpError(404, 'W tym przedmiocie nie ma jeszcze dziennych pytań.');
      const pick = pool[crypto.randomInt(pool.length)];
      const first = !one('SELECT 1 FROM daily_answers WHERE student_id = ? AND day = ?', ctx.user.id, day);
      const aid = run('INSERT INTO daily_answers (student_id, subject_id, question_id, question_json, day, seed, first, created_at) VALUES (?,?,?,?,?,?,?,?)',
        ctx.user.id, sid, pick.id, pick.question_json, day, crypto.randomBytes(8).toString('hex'), first ? 1 : 0, now()).lastInsertRowid;
      return one('SELECT * FROM daily_answers WHERE id = ?', aid);
    });
    const st = streakOf(ctx.user.id, day);
    const res = a.answered_at ? { correct: !!a.correct, points: a.points } : null;
    return { subject: { id: s.id, name: s.name }, first: !!a.first, stake: a.first ? st.streak + 1 : DAILY_BONUS, question: viewOf(a), answered: res, streak: st.streak };
  }, requireStudent);

  r.post('/api/daily/:subjectId/answer', (ctx) => {
    const sid = id(ctx.params.subjectId);
    const day = dayKey();
    return tx(() => {
      const a = one('SELECT * FROM daily_answers WHERE student_id = ? AND subject_id = ? AND day = ?', ctx.user.id, sid, day);
      if (!a) throw new HttpError(404, 'Najpierw wylosuj dzienne pytanie.');
      if (a.answered_at) throw new HttpError(409, 'Na dzisiejsze pytanie z tego przedmiotu już odpowiedziałeś(-aś). Wróć jutro!');
      const q = parseQ(a.question_json);
      const { key } = prepare(q, { shuffleAnswers: true }, { rng: seededRng(a.seed) });
      const g = grade(q, key, ctx.body.answer, { spelling: true });
      const subj = one('SELECT name FROM subjects WHERE id = ?', sid);
      let points = 0, streak = streakOf(ctx.user.id, day).streak;
      if (a.first) {
        const prev = one('SELECT * FROM daily_streaks WHERE student_id = ?', ctx.user.id);
        if (g.correct) {
          const base = prev && prev.last_day === prevDay(day) ? prev.streak : 0;
          streak = base + 1;
          points = streak;
          run(`INSERT INTO daily_streaks (student_id, streak, best, last_day) VALUES (?,?,?,?)
               ON CONFLICT(student_id) DO UPDATE SET streak = excluded.streak, best = MAX(daily_streaks.best, excluded.streak), last_day = excluded.last_day`, ctx.user.id, streak, streak, day);
        } else {
          streak = 0;
          run(`INSERT INTO daily_streaks (student_id, streak, best, last_day) VALUES (?,0,0,?)
               ON CONFLICT(student_id) DO UPDATE SET streak = 0, last_day = excluded.last_day`, ctx.user.id, day);
        }
      } else if (g.correct) points = DAILY_BONUS;
      let added = 0;
      if (points) added = addPoints(ctx.user.id, points, a.first ? `Dzienne pytanie (${subj.name}) – seria ${streak}` : `Dzienne pytanie (${subj.name}) – bonus`, { source: 'daily' });
      run('UPDATE daily_answers SET answered_at = ?, correct = ?, points = ? WHERE id = ?', now(), g.correct ? 1 : 0, added, a.id);
      return { correct: g.correct, parts: g.parts, solution: g.solution, explanation: clean(q.explanation) || null, points: added, first: !!a.first, streak, balance: pointsBalance(ctx.user.id), overview: overview(ctx.user.id) };
    });
  }, requireStudent);
}
