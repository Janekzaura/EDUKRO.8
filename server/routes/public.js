// Trasy publiczne (gość), logowanie i zgłoszenia.
import { one, all, run, now, nameKey, normName } from '../db.js';
import { config, mailMode } from '../config.js';
import { verifySecret, hashSecret, DUMMY_HASH, hmac, EMAIL_RE } from '../security.js';
import { HttpError, str, id } from '../http.js';
import {
  createSession, destroySession, destroyUserSessions, guardLimits, failLimits, resetLimit, requireActiveStudent,
} from '../auth.js';
import {
  publicUser, teachersForSubject, subjectRow, publishedCounts, KINDS, getSubjectOr404,
  validateDigitsCode,
} from './common.js';
import { TEST_KINDS, parseDoc, testStatusFor } from '../quiz/attempts.js';
import { parseLesson } from '../lessons/schema.js';
import { notifyAdmins, classOfUser, rewardLabel } from '../notify.js';
import fs from 'node:fs';
import { effectiveCount, RULES } from '../../public/js/shared/quiz-rules.js';
import { parseClass, className } from '../../public/js/shared/classes.js';
import { pointRules } from '../pointrules.js';
import { parseGame } from '../games/engine.js';
import { GAME_TYPE, gameSummary } from '../../public/js/shared/game-rules.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const MIN15 = 15 * 60e3;
const HOUR = 3600e3;

export function register(r) {
  /* ---------- Stan aplikacji ---------- */
  r.get('/api/status', () => ({
    version: VERSION,
    mail: { mode: mailMode() },
    studentPin: true,
    emailCodeLength: config.emailCodeLength,
    studentCodeMinLength: config.studentCodeMinLength,
    pinLength: config.pinLength,
    production: config.production,
    schoolName: config.schoolName,
    schoolPhoto: { url: '/' + config.schoolPhoto.replace(/^\/+/, ''), focus: config.schoolPhotoFocus },
    pointRules: pointRules(),
  }));

  r.get('/api/session', (ctx) => ({ user: publicUser(ctx.user) }));

  /* ---------- Przedmioty (widoczne także dla gości) ---------- */
  r.get('/api/subjects', () => ({
    subjects: all('SELECT * FROM subjects WHERE is_available = 1 ORDER BY sort_order, name').map((s) => ({
      ...subjectRow(s), teachers: teachersForSubject(s.id), counts: publishedCounts(s.id),
    })),
  }));

  r.get('/api/subjects/:slug', (ctx) => {
    const s = getSubjectOr404(ctx.params.slug);
    const t = now();
    const acts = all(`SELECT * FROM activities WHERE subject_id = ? AND status = 'published' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at`, s.id, t);
    const student = ctx.user && ctx.user.role === 'student' && ctx.user.status !== 'blocked' ? ctx.user : null;
    // uczeń widzi lekcje opublikowane dla swojej klasy (albo dla wszystkich uczniów)
    const myClass = student ? classOfUser(student) : null;
    const visibleLessons = new Set(all(`SELECT lesson_id FROM lesson_classes WHERE published = 1 AND (class_label = '*' OR class_label = ?)`, myClass || '-').map((x) => x.lesson_id));
    const row = (a) => {
      const out = { id: a.id, title: a.title, summary: a.summary, requiresAccount: !!a.requires_account };
      if (TEST_KINDS.includes(a.kind)) {
        const d = parseDoc(a);
        out.isTest = true;
        out.questionCount = effectiveCount(d);
        out.maxMistakes = a.kind === 'exam_test' ? d.settings.maxMistakes : null;
        out.points = a.kind === 'exam_test' ? d.settings.points.examFirst : a.kind === 'quiz' ? RULES.gradePoints[5] : d.settings.points.teachingFirst;
        if (a.kind === 'quiz') out.deadline = d.settings.deadline || null;
        out.expiresAt = a.kind === 'quiz' ? null : a.expires_at || null;
        out.reward = d.settings.reward ? rewardLabel(d.settings.reward) : null;
        if (student) out.status = testStatusFor(student.id, a);
      }
      if (a.kind === 'game') {
        const doc = parseGame(a);
        out.isGame = true; out.gameType = doc.type; out.typeLabel = GAME_TYPE[doc.type].label; out.summaryLine = gameSummary(doc); out.points = doc.points;
        if (student) {
          const st = one('SELECT COUNT(*) n, COALESCE(SUM(win), 0) w, MAX(pct) best FROM game_runs WHERE user_id = ? AND game_id = ? AND preview = 0 AND finished_at IS NOT NULL', student.id, a.id);
          out.status = { played: st.n, wins: st.w, best: st.best };
        }
      }
      if (a.kind === 'lesson') {
        const L = parseLesson(a);
        out.isLesson = true;
        out.className = myClass ? `klasa ${myClass}` : null;
        out.slideCount = L.slides.length;
        out.taughtAt = myClass ? one('SELECT completed_at FROM lesson_classes WHERE lesson_id = ? AND class_label = ?', a.id, myClass)?.completed_at || null : null;
      }
      return out;
    };
    const visible = acts.filter((a) => a.kind !== 'lesson' || !student || visibleLessons.has(a.id));
    return {
      subject: { ...subjectRow(s), teachers: teachersForSubject(s.id) },
      categories: Object.fromEntries(KINDS.map((k) => [k, visible.filter((a) => a.kind === k).map(row)])),
    };
  });

  /* Uruchomienie aktywności – uprawnienia sprawdzane po stronie serwera. */
  r.post('/api/activities/:id/start', (ctx) => {
    const a = one(`SELECT a.*, s.is_available FROM activities a JOIN subjects s ON s.id = a.subject_id
                   WHERE a.id = ?`, id(ctx.params.id));
    if (!a || a.status !== 'published' || !a.is_available) throw new HttpError(404, 'Nie znaleziono aktywności.');
    if (a.requires_account) requireActiveStudent(ctx);
    let content = null;
    try { content = a.content_json ? JSON.parse(a.content_json) : null; } catch { content = null; }
    return { activity: { id: a.id, kind: a.kind, title: a.title }, content };
  });

  /* Lista nauczycieli do ekranu logowania (tylko imię i nazwisko). */
  r.get('/api/teachers', () => ({
    teachers: all(`SELECT id, first_name AS firstName, last_name AS lastName FROM users
                   WHERE role = 'teacher' AND status != 'blocked' ORDER BY last_name, first_name`),
  }));

  /* ---------- Logowanie ---------- */
  r.post('/api/auth/student/login', (ctx) => {
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    const code = String(ctx.body.code ?? '');
    const key = nameKey(first, last);
    const limits = [[`login:student:${key}`, 5, MIN15], [`login:ip:${ctx.ip}`, 30, MIN15]];
    guardLimits(limits);
    const u = one("SELECT * FROM users WHERE role = 'student' AND name_key = ?", key);
    const ok = verifySecret(code.slice(0, 64), u ? u.code_hash : DUMMY_HASH) && !!u;
    if (!ok) {
      failLimits(limits);
      throw new HttpError(401, 'Nieprawidłowe imię, nazwisko lub kod dostępu.');
    }
    resetLimit(`login:student:${key}`);
    if (u.status === 'blocked') throw new HttpError(403, 'To konto jest zablokowane. Skontaktuj się z administratorem.');
    createSession(ctx.res, u);
    return { user: publicUser(u) };
  });

  r.post('/api/auth/teacher/login', (ctx) => {
    const teacherId = id(ctx.body.teacherId);
    const code = String(ctx.body.code ?? '');
    const limits = [[`login:teacher:${teacherId}`, 5, MIN15], [`login:ip:${ctx.ip}`, 30, MIN15], [`login:teacher-any:${teacherId}`, 20, HOUR]];
    guardLimits(limits);
    const u = one("SELECT * FROM users WHERE role = 'teacher' AND id = ?", teacherId);
    const ok = /^\d{4,8}$/.test(code) && verifySecret(code, u ? u.code_hash : DUMMY_HASH) && !!u;
    if (!ok) {
      failLimits(limits);
      throw new HttpError(401, 'Nieprawidłowy kod dostępu.');
    }
    resetLimit(`login:teacher:${teacherId}`);
    if (u.status === 'blocked') throw new HttpError(403, 'To konto jest zablokowane. Skontaktuj się z administratorem.');
    createSession(ctx.res, u);
    return { user: publicUser(u) };
  });

  r.post('/api/auth/admin/login', (ctx) => {
    const code = String(ctx.body.code ?? '');
    const limits = [[`login:admin:${ctx.ip}`, 5, MIN15], ['login:admin:global', 30, HOUR]];
    guardLimits(limits);
    const u = one("SELECT * FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1");
    const ok = /^\d{4,8}$/.test(code) && verifySecret(code, u ? u.code_hash : DUMMY_HASH) && !!u;
    if (!ok) {
      failLimits(limits);
      throw new HttpError(401, 'Nieprawidłowy kod.');
    }
    resetLimit(`login:admin:${ctx.ip}`);
    createSession(ctx.res, u);
    return { user: publicUser(u) };
  });

  r.post('/api/auth/logout', (ctx) => { destroySession(ctx.req, ctx.res); return { ok: true }; });

  /* Zmiana własnego kodu (uczeń, nauczyciel, administrator). */
  r.post('/api/auth/change-code', (ctx) => {
    const u = ctx.user;
    if (!u) throw new HttpError(401, 'Musisz się zalogować.', { needLogin: true });
    const limits = [[`change-code:${u.id}`, 5, MIN15]];
    guardLimits(limits);
    const current = String(ctx.body.current ?? '');
    const fresh = one('SELECT code_hash FROM users WHERE id = ?', u.id);
    if (!verifySecret(current.slice(0, 64), fresh.code_hash)) {
      failLimits(limits);
      throw new HttpError(403, 'Aktualny kod jest nieprawidłowy.');
    }
    const next = validateDigitsCode(ctx.body.next, config.pinLength);
    if (String(ctx.body.nextRepeat ?? '') !== next) throw new HttpError(400, 'Nowy kod i jego powtórzenie różnią się.');
    if (next === current) throw new HttpError(400, 'Nowy kod musi różnić się od obecnego.');
    run('UPDATE users SET code_hash = ?, must_change_code = 0, updated_at = ? WHERE id = ?', hashSecret(next), now(), u.id);
    // wyloguj pozostałe sesje tego konta
    run('DELETE FROM sessions WHERE user_id = ? AND id != ?', u.id, u.sid);
    resetLimit(`change-code:${u.id}`);
    return { ok: true };
  }, { allowMustChange: true });

  /* Ustawienie nowego kodu ucznia na podstawie kodu resetu wydanego przez administratora. */
  r.post('/api/auth/student/reset', (ctx) => {
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    const key = nameKey(first, last);
    const limits = [[`reset:student:${key}`, 5, MIN15], [`reset:ip:${ctx.ip}`, 20, MIN15]];
    guardLimits(limits);
    const resetCode = String(ctx.body.resetCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const u = one("SELECT * FROM users WHERE role = 'student' AND name_key = ?", key);
    const rs = u && one(`SELECT * FROM access_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
                         ORDER BY created_at DESC LIMIT 1`, u.id, now());
    if (!rs || hmac(`reset:${rs.id}:${resetCode}`) !== rs.token_hash) {
      failLimits(limits);
      throw new HttpError(401, 'Nieprawidłowe dane lub kod resetu wygasł.');
    }
    const next = validateDigitsCode(ctx.body.newCode, config.pinLength);
    if (String(ctx.body.newCodeRepeat ?? '') !== next) throw new HttpError(400, 'Nowy kod i jego powtórzenie różnią się.');
    if (u.status === 'blocked') throw new HttpError(403, 'To konto jest zablokowane. Skontaktuj się z administratorem.');
    run('UPDATE users SET code_hash = ?, updated_at = ? WHERE id = ?', hashSecret(next), now(), u.id);
    run('UPDATE access_resets SET used_at = ? WHERE id = ?', now(), rs.id);
    destroyUserSessions(u.id);
    resetLimit(`reset:student:${key}`);
    resetLimit(`login:student:${key}`);
    createSession(ctx.res, u);
    return { user: publicUser(u) };
  });

  /* ---------- Zgłoszenie: „Moje imię i nazwisko jest zajęte” ---------- */
  r.post('/api/claims', (ctx) => {
    const limits = [[`claim:ip:${ctx.ip}`, 5, HOUR]];
    guardLimits(limits);
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    // EDUKRO nie używa e-maili – kontakt przez szkołę: klasa (i opcjonalnie wychowawca) z formularza.
    const cls = str(ctx.body.classLabel, { max: 40, field: 'Klasa' });
    const email = cls ? `klasa ${cls}` : 'przez szkołę';
    const description = str(ctx.body.description, { max: 1000, field: 'Opis' });
    const kind = ['name_taken', 'registration', 'access'].includes(ctx.body.kind) ? ctx.body.kind : 'name_taken';
    failLimits(limits);
    const t = now();
    const cid = run(`INSERT INTO claims (kind, first_name, last_name, name_key, contact_email, description, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`, kind, normName(first), normName(last), nameKey(first, last), email, description, t, t).lastInsertRowid;
    notifyAdmins({ kind: 'admin_claim', title: `Nowe zgłoszenie: ${normName(first)} ${normName(last)}`, body: description ? description.slice(0, 200) : 'Uczeń zgłasza problem z kontem.', link: '/administracja/zgloszenia' }, `claim:${cid}`);
    return { ok: true, status: 'pending' };
  });
}
