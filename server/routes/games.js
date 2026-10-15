// Gry (0.7): edytor (nauczyciel i administrator), podgląd, gra ucznia, ruchy sprawdzane na serwerze, punkty.
import crypto from 'node:crypto';
import { one, all, run, now, tx, audit } from '../db.js';
import { HttpError, str, id } from '../http.js';
import { requireRole, requireStudent } from '../auth.js';
import { editableSubjects, assertSubject } from './tests.js';
import { cleanGame, parseGame, buildPlay, act, outcome } from '../games/engine.js';
import { validateGame, GAME_TYPE, GL, emptyGame, gameSummary } from '../../public/js/shared/game-rules.js';
import { notifyStudents, authorPhrase } from '../notify.js';
import { canDelete, assertCanDelete, authorName } from '../ownership.js';
import { addPoints, pointsBalance } from '../points.js';

const editor = requireRole('teacher', 'admin');

function getGame(user, gameId) {
  const a = one(`SELECT * FROM activities WHERE id = ? AND kind = 'game' AND status != 'archived'`, id(gameId));
  if (!a) throw new HttpError(404, 'Nie znaleziono gry.');
  assertSubject(user, a.subject_id);
  return a;
}
function editorGame(a) {
  const doc = parseGame(a);
  return {
    id: a.id, title: a.title, summary: a.summary, subjectId: a.subject_id, status: a.status, content: doc, updatedAt: a.updated_at, author: authorName(a),
    plays: one('SELECT COUNT(*) n FROM game_runs WHERE game_id = ? AND preview = 0', a.id).n,
  };
}
function listRow(a, user) {
  const doc = parseGame(a);
  const s = one('SELECT name, accent FROM subjects WHERE id = ?', a.subject_id);
  const r = one('SELECT COUNT(*) n, COALESCE(SUM(win), 0) w FROM game_runs WHERE game_id = ? AND preview = 0 AND finished_at IS NOT NULL', a.id);
  return {
    id: a.id, title: a.title, type: doc.type, typeLabel: GAME_TYPE[doc.type].label, status: a.status, subjectId: a.subject_id, subject: s?.name, accent: s?.accent,
    errors: validateGame(doc).errors, summaryLine: gameSummary(doc), updatedAt: a.updated_at, author: authorName(a), mine: a.created_by === user.id,
    canDelete: canDelete(user, a), plays: r.n, wins: r.w,
  };
}
const titleOf = (v, fallback) => str(v === undefined ? fallback : v, { max: GL.title, field: 'Nazwa gry' }) || fallback;

/* ---------- Podejście ---------- */
function loadRun(runId, user) {
  const r = one('SELECT * FROM game_runs WHERE id = ?', id(runId));
  if (!r || r.user_id !== user.id) throw new HttpError(404, 'Nie znaleziono gry.');
  return r;
}
function runOwner(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Musisz się zalogować.', { needLogin: true });
  if (ctx.user.role === 'student') return requireStudent(ctx);
  if (!['teacher', 'admin'].includes(ctx.user.role)) throw new HttpError(403, 'Brak uprawnień.');
}
function startRun(user, a, preview) {
  const doc = parseGame(a);
  if (!preview && validateGame(doc).errors) throw new HttpError(409, 'Ta gra nie jest jeszcze gotowa.');
  if (preview) run('DELETE FROM game_runs WHERE user_id = ? AND game_id = ? AND preview = 1', user.id, a.id);
  return Number(run('INSERT INTO game_runs (game_id, user_id, preview, seed, content_json, state_json, started_at) VALUES (?,?,?,?,?,?,?)',
    a.id, user.id, preview ? 1 : 0, crypto.randomBytes(8).toString('hex'), JSON.stringify(doc), JSON.stringify({ checks: {} }), now()).lastInsertRowid);
}
function statusFor(userId, gameId) {
  const r = one(`SELECT COUNT(*) n, COALESCE(SUM(win), 0) wins, MAX(pct) best, COALESCE(SUM(points), 0) pts FROM game_runs
                 WHERE user_id = ? AND game_id = ? AND preview = 0 AND finished_at IS NOT NULL`, userId, gameId);
  return { played: r.n, wins: r.wins, best: r.best ?? null, points: r.pts };
}

export function register(r) {
  /* ================= Edytor ================= */
  r.get('/api/editor/games', (ctx) => {
    const ids = editableSubjects(ctx.user).map((s) => s.id);
    if (!ids.length) return { games: [] };
    const rows = all(`SELECT * FROM activities WHERE kind = 'game' AND status != 'archived' AND subject_id IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`, ...ids);
    return { games: rows.map((a) => listRow(a, ctx.user)) };
  }, editor);

  r.post('/api/editor/games', (ctx) => {
    const title = str(ctx.body.title, { min: 1, max: GL.title, field: 'Nazwa gry' });
    const subjectId = id(ctx.body.subjectId);
    assertSubject(ctx.user, subjectId);
    const type = GAME_TYPE[ctx.body.type] ? ctx.body.type : 'saper';
    const doc = cleanGame(emptyGame(type));
    const t = now();
    const gid = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at)
                     VALUES (?, 'game', ?, ?, 'draft', 1, ?, ?, ?, ?, ?)`, subjectId, title, str(ctx.body.summary, { max: GL.summary, field: 'Opis' }), JSON.stringify(doc), ctx.user.id, ctx.user.id, t, t).lastInsertRowid;
    audit(ctx.user.id, 'game.create', `activity:${gid}`);
    return { game: editorGame(one('SELECT * FROM activities WHERE id = ?', gid)) };
  }, editor);

  r.get('/api/editor/games/:id', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    return { game: { ...editorGame(a), canDelete: canDelete(ctx.user, a) }, subjects: editableSubjects(ctx.user) };
  }, editor);

  r.put('/api/editor/games/:id', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    const b = ctx.body;
    let subjectId = a.subject_id;
    if (b.subjectId !== undefined) { subjectId = id(b.subjectId); assertSubject(ctx.user, subjectId); }
    const prev = parseGame(a);
    const doc = b.content === undefined ? prev : cleanGame({ ...b.content, type: prev.type });
    const v = validateGame(doc);
    let status = a.status, unpublished = false;
    if (status === 'published' && v.errors) { status = 'draft'; unpublished = true; }
    const t = now();
    run('UPDATE activities SET title = ?, summary = ?, subject_id = ?, content_json = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
      titleOf(b.title, a.title), b.summary === undefined ? a.summary : str(b.summary, { max: GL.summary, field: 'Opis' }), subjectId, JSON.stringify(doc), status, ctx.user.id, t, a.id);
    return { ok: true, updatedAt: t, status, unpublished, errors: v.errors };
  }, editor, { bodyLimit: 512 * 1024 });

  r.post('/api/editor/games/:id/publish', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    const v = validateGame(parseGame(a));
    if (v.errors) throw new HttpError(422, `Przed publikacją popraw: ${v.errors} ${v.errors === 1 ? 'rzecz' : 'rzeczy'}.`, { problems: v.problems });
    run("UPDATE activities SET status = 'published', updated_at = ?, updated_by = ?, published_at = COALESCE(published_at, ?) WHERE id = ?", now(), ctx.user.id, now(), a.id);
    audit(ctx.user.id, 'game.publish', `activity:${a.id}`);
    const subj = one('SELECT name, is_available FROM subjects WHERE id = ?', a.subject_id);
    let notified = 0;
    if (subj?.is_available && a.status !== 'published') {
      notified = notifyStudents(null, { kind: 'game_new', title: `${authorPhrase(a.created_by || ctx.user.id)} nową grę: „${a.title}”`, body: `${subj.name}. ${GAME_TYPE[parseGame(a).type].label} – zagraj i zdobądź punkty!`, link: `/uczen/gra/${a.id}` }, `game:${a.id}`);
    }
    return { ok: true, status: 'published', notified };
  }, editor);

  r.post('/api/editor/games/:id/unpublish', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    run("UPDATE activities SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", now(), ctx.user.id, a.id);
    audit(ctx.user.id, 'game.unpublish', `activity:${a.id}`);
    return { ok: true, status: 'draft' };
  }, editor);

  r.post('/api/editor/games/:id/duplicate', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    const t = now();
    const copy = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at)
                      VALUES (?, 'game', ?, ?, 'draft', 1, ?, ?, ?, ?, ?)`, a.subject_id, `${a.title} (kopia)`.slice(0, GL.title), a.summary, a.content_json, ctx.user.id, ctx.user.id, t, t).lastInsertRowid;
    audit(ctx.user.id, 'game.copy', `activity:${a.id}->${copy}`);
    return { id: Number(copy) };
  }, editor);

  r.delete('/api/editor/games/:id', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    if (!canDelete(ctx.user, a)) assertCanDelete(ctx.user, a, 'test');
    const used = one('SELECT COUNT(*) n FROM game_runs WHERE game_id = ? AND preview = 0', a.id).n;
    if (used) run("UPDATE activities SET status = 'archived', updated_at = ? WHERE id = ?", now(), a.id);
    else run('DELETE FROM activities WHERE id = ?', a.id);
    audit(ctx.user.id, used ? 'game.archive' : 'game.delete', `activity:${a.id}`);
    return { ok: true, archived: !!used };
  }, editor);

  /* Podgląd nauczyciela: pełna gra, bez punktów i wyników. */
  r.post('/api/editor/games/:id/preview', (ctx) => {
    const a = getGame(ctx.user, ctx.params.id);
    return { runId: startRun(ctx.user, a, true) };
  }, editor);

  /* ================= Uczeń ================= */
  function publishedGame(gameId) {
    const a = one(`SELECT a.*, s.is_available, s.name AS subject_name, s.slug AS subject_slug, s.accent FROM activities a
                   JOIN subjects s ON s.id = a.subject_id WHERE a.id = ? AND a.kind = 'game'`, id(gameId));
    if (!a || a.status !== 'published' || !a.is_available) throw new HttpError(404, 'Ta gra nie jest dostępna.');
    return a;
  }
  r.get('/api/games/:id', (ctx) => {
    const a = publishedGame(ctx.params.id);
    const doc = parseGame(a);
    return {
      game: { id: a.id, title: a.title, summary: a.summary, type: doc.type, typeLabel: GAME_TYPE[doc.type].label, points: doc.points, summaryLine: gameSummary(doc),
        subject: { name: a.subject_name, slug: a.subject_slug, accent: a.accent } },
      status: statusFor(ctx.user.id, a.id),
    };
  }, requireStudent);

  r.post('/api/games/:id/runs', (ctx) => {
    const a = publishedGame(ctx.params.id);
    // nieukończone podejścia sprzed chwili nie liczą się – nowa gra zaczyna od zera
    run('DELETE FROM game_runs WHERE user_id = ? AND game_id = ? AND preview = 0 AND finished_at IS NULL', ctx.user.id, a.id);
    return { runId: startRun(ctx.user, a, false) };
  }, requireStudent);

  /* ================= Podejście (uczeń albo podgląd nauczyciela) ================= */
  r.get('/api/game-runs/:id', (ctx) => {
    const row = loadRun(ctx.params.id, ctx.user);
    const a = one('SELECT a.title, a.id, s.name AS subject, s.accent, s.slug FROM activities a JOIN subjects s ON s.id = a.subject_id WHERE a.id = ?', row.game_id);
    const doc = cleanGame(JSON.parse(row.content_json));
    return { run: { id: row.id, preview: !!row.preview, finished: !!row.finished_at, startedAt: row.started_at },
      game: { id: a.id, title: a.title, subject: a.subject, accent: a.accent, slug: a.slug }, play: buildPlay(doc, row.seed).view };
  }, runOwner);

  r.post('/api/game-runs/:id/act', (ctx) => tx(() => {
    const row = loadRun(ctx.params.id, ctx.user);
    if (row.finished_at) throw new HttpError(409, 'Ta gra już się skończyła.');
    const doc = cleanGame(JSON.parse(row.content_json));
    const state = JSON.parse(row.state_json || '{}');
    const res = act(doc, row.seed, state, ctx.body);
    run('UPDATE game_runs SET state_json = ? WHERE id = ?', JSON.stringify(state), row.id);
    return res;
  }), runOwner, { bodyLimit: 64 * 1024 });

  r.post('/api/game-runs/:id/finish', (ctx) => tx(() => {
    const row = loadRun(ctx.params.id, ctx.user);
    const doc = cleanGame(JSON.parse(row.content_json));
    const state = JSON.parse(row.state_json || '{}');
    const o = outcome(doc, state, { elapsedMs: now() - row.started_at });
    if (row.finished_at) return { ...o, points: row.points, already: true };
    let points = 0, first = false;
    const a = one('SELECT title, subject_id FROM activities WHERE id = ?', row.game_id);
    if (!row.preview && o.win && ctx.user.role === 'student') {
      first = !one('SELECT 1 FROM game_runs WHERE user_id = ? AND game_id = ? AND preview = 0 AND win = 1', row.user_id, row.game_id);
      const base = doc.type === 'hammer' ? Math.round(doc.points * o.pct / 100) : doc.points;
      if (first && base > 0) points = addPoints(row.user_id, base, `${doc.type === 'saper' ? 'Saper – bomba rozbrojona' : `Hammer Game – APPROVED (${o.pct}%)`}: ${a?.title || 'gra'}`, { activityId: row.game_id, source: 'game' });
    }
    if (!row.preview && ctx.user.role === 'student' && a) {
      const share = one('SELECT share FROM student_sharing WHERE student_id = ? AND subject_id = ?', row.user_id, a.subject_id);
      run(`INSERT INTO results (student_id, activity_id, subject_id, score, max_score, completed_at, shared_with_teacher)
           VALUES (?,?,?,?,?,?,?)`, row.user_id, row.game_id, a.subject_id, o.score, o.max, now(), share ? (share.share ? 1 : 0) : 1);
    }
    run('UPDATE game_runs SET finished_at = ?, win = ?, pct = ?, points = ? WHERE id = ?', now(), o.win ? 1 : 0, o.pct, points, row.id);
    return { ...o, points, first, balance: ctx.user.role === 'student' ? pointsBalance(ctx.user.id) : null, preview: !!row.preview };
  }), runOwner);
}
