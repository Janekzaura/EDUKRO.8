// Testy: edytor (nauczyciel i administrator), obrazy do pytań, podejścia ucznia.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { one, all, run, now, audit } from '../db.js';
import { config } from '../config.js';
import { HttpError, str, id } from '../http.js';
import { requireRole, requireStudent, guardLimits, failLimits } from '../auth.js';
import { cleanSettings, cleanQuestions, mediaIds } from '../quiz/schema.js';
import { validateTest, emptyQuestion, LIMITS, effectiveCount, RULES, upgradeQuestion } from '../../public/js/shared/quiz-rules.js';
import {
  TEST_KINDS, parseDoc, testStatusFor, startAttempt, currentView, answer, abandon, loadAttempt, summaryOf, useLifeline,
} from '../quiz/attempts.js';
import { parseLesson } from '../lessons/schema.js';
import { notifyStudents, authorPhrase, rewardLabel, gfor } from '../notify.js';
import { lockOf, assertPublishable, copyFpFor, canDelete, assertCanDelete, authorName } from '../ownership.js';
import { templateContent } from './templates.js';

const editor = requireRole('teacher', 'admin');
const MEDIA_DIR = path.join(config.dataDir, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const MEDIA_MAX = 3 * 1024 * 1024;
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/* ---------- Uprawnienia do przedmiotów ---------- */
export function editableSubjects(user) {
  if (user.role === 'admin') return all('SELECT id, name, accent, slug FROM subjects ORDER BY sort_order, name');
  return all(`SELECT s.id, s.name, s.accent, s.slug FROM teacher_subjects ts JOIN subjects s ON s.id = ts.subject_id
              WHERE ts.teacher_id = ? ORDER BY s.sort_order, s.name`, user.id);
}
export function assertSubject(user, subjectId) {
  if (!editableSubjects(user).some((s) => s.id === subjectId)) throw new HttpError(403, 'Nie masz uprawnień do tego przedmiotu.');
}
function getTest(user, testId) {
  const a = one(`SELECT * FROM activities WHERE id = ? AND kind IN ('teaching_test','exam_test','quiz') AND status != 'archived'`, id(testId));
  if (!a) throw new HttpError(404, 'Nie znaleziono testu.');
  assertSubject(user, a.subject_id);
  return a;
}
const kindOf = (v) => (TEST_KINDS.includes(v) ? v : 'teaching_test');
/** Test tymczasowy – tylko nauczający i egzaminacyjny (sprawdzian ma termin). */
const expiresOf = (kind, settings) => (kind !== 'quiz' && settings.expiresAt ? settings.expiresAt : null);
export const isExpired = (a) => !!a.expires_at && a.expires_at <= now();
const KIND_WORD = { teaching_test: 'test nauczający', exam_test: 'test egzaminacyjny', quiz: 'sprawdzian' };

function fullDoc(a) {
  const d = parseDoc(a);
  return { title: a.title, summary: a.summary, kind: a.kind, settings: d.settings, questions: d.questions };
}
function editorTest(a) {
  const d = fullDoc(a);
  return {
    id: a.id, title: a.title, summary: a.summary, kind: a.kind, subjectId: a.subject_id, status: a.status,
    settings: d.settings, questions: d.questions, updatedAt: a.updated_at, tutorial: !!a.tutorial, copyOfTutorial: !!a.copy_fp, author: authorName(a), lock: lockOf(a, d.questions),
    attempts: one('SELECT COUNT(*) n FROM test_attempts WHERE activity_id = ? AND preview = 0', a.id).n,
  };
}
function listRow(a, user) {
  const d = fullDoc(a);
  const v = validateTest(d);
  const s = one('SELECT name, accent FROM subjects WHERE id = ?', a.subject_id);
  return {
    mine: a.created_by === user.id, canDelete: canDelete(user, a), lock: lockOf(a, d.questions),
    id: a.id, title: a.title, kind: a.kind, status: a.status, subjectId: a.subject_id, subject: s?.name, accent: s?.accent,
    questionCount: d.questions.length, drawCount: effectiveCount(d), errors: v.errors, updatedAt: a.updated_at, deadline: d.settings.deadline || null,
    author: authorName(a),
    completions: one(`SELECT COUNT(*) n FROM test_attempts WHERE activity_id = ? AND preview = 0 AND status IN ('passed','completed')`, a.id).n,
    expiresAt: a.kind === 'quiz' ? null : d.settings.expiresAt || null, expired: isExpired(a),
    reward: d.settings.reward ? rewardLabel(d.settings.reward) : null,
  };
}

/** Obrazy w teście muszą istnieć w bazie (nie da się podpiąć cudzego pliku z dysku). */
function dropUnknownMedia(questions) {
  const known = new Set(mediaIds(questions).filter((m) => one('SELECT 1 FROM media WHERE id = ?', m)));
  for (const q of questions) {
    if (q.image && !known.has(q.image)) q.image = null;
    if (q.diagram && !known.has(q.diagram)) q.diagram = null;
  }
  return questions;
}

export function register(r) {
  /* ================= Edytor ================= */
  r.get('/api/editor/subjects', (ctx) => ({ subjects: editableSubjects(ctx.user) }), editor);

  r.get('/api/editor/tests', (ctx) => {
    const ids = editableSubjects(ctx.user).map((s) => s.id);
    if (!ids.length) return { tests: [] };
    const rows = all(`SELECT * FROM activities WHERE kind IN ('teaching_test','exam_test','quiz') AND status != 'archived'
                      AND subject_id IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`, ...ids);
    return { tests: rows.map((a) => listRow(a, ctx.user)) };
  }, editor);

  r.post('/api/editor/tests', (ctx) => {
    const title = str(ctx.body.title, { min: 1, max: LIMITS.title, field: 'Nazwa testu' });
    const subjectId = id(ctx.body.subjectId);
    assertSubject(ctx.user, subjectId);
    let kind = kindOf(ctx.body.kind);
    const count = Math.min(LIMITS.questions, Math.max(0, Number.isInteger(ctx.body.questionCount) ? ctx.body.questionCount : 5));
    let doc = { settings: cleanSettings(ctx.body.settings), questions: Array.from({ length: count }, () => emptyQuestion(null)) };
    if (ctx.body.templateId) {
      // szablon: te same rodzaje pytań i ustawienia, bez tekstu; termin sprawdzianu z formularza
      const tpl = templateContent('test', ctx.body.templateId, ctx.user);
      kind = tpl.kind;
      doc = { settings: cleanSettings({ ...tpl.settings, deadline: doc.settings.deadline }), questions: tpl.questions };
    }
    const t = now();
    const testId = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at, expires_at, tutorial)
                        VALUES (?,?,?,?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?)`,
    subjectId, kind, title, str(ctx.body.summary, { max: LIMITS.summary, field: 'Opis' }), JSON.stringify(doc), ctx.user.id, ctx.user.id, t, t, expiresOf(kind, doc.settings), ctx.body.tutorial === true ? 1 : 0).lastInsertRowid;
    audit(ctx.user.id, 'test.create', `activity:${testId}`);
    return { test: editorTest(one('SELECT * FROM activities WHERE id = ?', testId)) };
  }, editor);

  r.get('/api/editor/tests/:id', (ctx) => { const a = getTest(ctx.user, ctx.params.id); return { test: { ...editorTest(a), canDelete: canDelete(ctx.user, a) }, subjects: editableSubjects(ctx.user) }; }, editor);

  /* Zapis (także automatyczny). Szkic może być niekompletny; opublikowany test z błędem wraca do szkicu. */
  r.put('/api/editor/tests/:id', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    const b = ctx.body;
    const title = b.title === undefined ? a.title : str(b.title, { max: LIMITS.title, field: 'Nazwa testu' });
    const summary = b.summary === undefined ? a.summary : str(b.summary, { max: LIMITS.summary, field: 'Opis' });
    const kind = b.kind === undefined ? a.kind : kindOf(b.kind);
    let subjectId = a.subject_id;
    if (b.subjectId !== undefined) { subjectId = id(b.subjectId); assertSubject(ctx.user, subjectId); }
    const prev = parseDoc(a);
    const doc = {
      settings: b.settings === undefined ? prev.settings : cleanSettings(b.settings),
      questions: b.questions === undefined ? prev.questions : dropUnknownMedia(cleanQuestions(b.questions)),
    };
    let status = a.status;
    let unpublished = false;
    const v = validateTest({ title, kind, ...doc });
    if (status === 'published' && v.errors) { status = 'draft'; unpublished = true; }
    const t = now();
    run(`UPDATE activities SET title = ?, summary = ?, kind = ?, subject_id = ?, content_json = ?, status = ?, updated_by = ?, updated_at = ?, expires_at = ? WHERE id = ?`,
      title || a.title, summary, kind, subjectId, JSON.stringify(doc), status, ctx.user.id, t, expiresOf(kind, doc.settings), a.id);
    return { ok: true, updatedAt: t, status, unpublished, errors: v.errors, lock: lockOf(a, doc.questions) };
  }, editor, { bodyLimit: 1024 * 1024 });

  r.post('/api/editor/tests/:id/publish', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    assertPublishable(a, parseDoc(a).questions, 'test');
    const v = validateTest(fullDoc(a));
    if (v.errors) throw new HttpError(422, `Przed publikacją popraw: ${v.errors} ${v.errors === 1 ? 'rzecz' : 'rzeczy'}.`, { problems: v.problems });
    const d = parseDoc(a);
    if (a.kind === 'quiz' && d.settings.deadline && d.settings.deadline < now()) {
      throw new HttpError(422, 'Termin sprawdzianu już minął – ustaw nowy termin w ustawieniach.', { problems: [{ level: 'error', msg: 'Termin sprawdzianu jest w przeszłości.', where: 'settings', field: 'deadline' }] });
    }
    const exp = expiresOf(a.kind, d.settings);
    if (exp && exp <= now() + 60e3) {
      throw new HttpError(422, 'Czas zniknięcia testu tymczasowego już minął – ustaw późniejszy w ustawieniach.', { problems: [{ level: 'error', msg: 'Test tymczasowy: czas zniknięcia jest w przeszłości.', where: 'settings', field: 'expiresAt' }] });
    }
    run("UPDATE activities SET status = 'published', updated_at = ?, updated_by = ?, published_at = COALESCE(published_at, ?) WHERE id = ?", now(), ctx.user.id, now(), a.id);
    audit(ctx.user.id, 'test.publish', `activity:${a.id}`);
    const subj = one('SELECT name, is_available FROM subjects WHERE id = ?', a.subject_id);
    let notified = 0;
    if (subj?.is_available) {
      const extra = [exp ? `Test tymczasowy – dostępny do ${new Date(exp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : null,
        a.kind === 'quiz' && d.settings.deadline ? `Termin: ${new Date(d.settings.deadline).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : null,
        d.settings.reward ? `Nagroda: ${rewardLabel(d.settings.reward)}.` : null].filter(Boolean).join(' ');
      notified = notifyStudents(null, {
        kind: a.kind === 'quiz' ? 'quiz_new' : 'test_new',
        title: `${authorPhrase(a.created_by || ctx.user.id)} ${a.kind === 'quiz' ? 'nowy sprawdzian' : `nowy ${KIND_WORD[a.kind]}`}: „${a.title}”`,
        body: `${subj.name}. ${extra}`.trim(), link: `/uczen/test/${a.id}`,
      }, `test:${a.id}`);
    }
    return { ok: true, status: 'published', notified };
  }, editor);

  r.post('/api/editor/tests/:id/unpublish', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    run("UPDATE activities SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?", now(), ctx.user.id, a.id);
    audit(ctx.user.id, 'test.unpublish', `activity:${a.id}`);
    return { ok: true, status: 'draft' };
  }, editor);

  r.post('/api/editor/tests/:id/duplicate', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    const t = now();
    const fp = copyFpFor(a, parseDoc(a).questions);
    const copy = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at, copy_fp)
                      VALUES (?,?,?,?, 'draft', 1, ?, ?, ?, ?, ?, ?)`,
    a.subject_id, a.kind, `${a.title} (kopia)`.slice(0, LIMITS.title), a.summary, a.content_json, ctx.user.id, ctx.user.id, t, t, fp).lastInsertRowid;
    audit(ctx.user.id, 'test.copy', `activity:${a.id}->${copy}`);
    return { id: Number(copy), mustChange: !!fp };
  }, editor);

  /* Usunięcie: jeśli uczniowie już rozwiązywali test, przenosimy go do archiwum, żeby nie stracić ich wyników. */
  r.delete('/api/editor/tests/:id', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    assertCanDelete(ctx.user, a, 'test');
    const used = one('SELECT COUNT(*) n FROM test_attempts WHERE activity_id = ? AND preview = 0', a.id).n;
    if (used) run("UPDATE activities SET status = 'archived', updated_at = ? WHERE id = ?", now(), a.id);
    else run('DELETE FROM activities WHERE id = ?', a.id);
    audit(ctx.user.id, used ? 'test.archive' : 'test.delete', `activity:${a.id}`);
    return { ok: true, archived: !!used };
  }, editor);

  /* Podgląd ucznia: podejście bez wyników i punktów, tylko z gotowych pytań. */
  r.post('/api/editor/tests/:id/preview', (ctx) => {
    const a = getTest(ctx.user, ctx.params.id);
    run('DELETE FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 1', ctx.user.id, a.id);
    return { attemptId: startAttempt(ctx.user, a, { preview: true }) };
  }, editor);

  /* ================= Wyodrębnianie pytań z innych materiałów ================= */
  r.get('/api/editor/sources', (ctx) => {
    const ids = editableSubjects(ctx.user).map((s) => s.id);
    if (!ids.length) return { sources: [] };
    const rows = all(`SELECT a.*, s.name AS subject_name FROM activities a JOIN subjects s ON s.id = a.subject_id
                      WHERE a.kind IN ('teaching_test','exam_test','quiz','lesson') AND a.status != 'archived'
                      AND a.subject_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.sort_order, a.kind, a.title`, ...ids);
    return {
      sources: rows.map((a) => {
        const n = a.kind === 'lesson' ? parseLesson(a).slides.filter((x) => x.type === 'question' && x.question?.type).length
          : parseDoc(a).questions.filter((q) => q.type).length;
        return { id: a.id, kind: a.kind, title: a.title, subject: a.subject_name, subjectId: a.subject_id, status: a.status, questionCount: n };
      }).filter((x) => x.questionCount > 0),
    };
  }, editor);

  r.get('/api/editor/sources/:id', (ctx) => {
    const a = one(`SELECT * FROM activities WHERE id = ? AND kind IN ('teaching_test','exam_test','quiz','lesson') AND status != 'archived'`, id(ctx.params.id));
    if (!a) throw new HttpError(404, 'Nie znaleziono materiału.');
    assertSubject(ctx.user, a.subject_id);
    if (a.kind === 'lesson') {
      const L = parseLesson(a);
      return { title: a.title, kind: a.kind, questions: L.slides.filter((x) => x.type === 'question' && x.question?.type).map((x) => ({ ...upgradeQuestion(x.question), catName: null })) };
    }
    const d = parseDoc(a);
    const catName = Object.fromEntries(d.settings.categories.map((c) => [c.id, c.name]));
    return { title: a.title, kind: a.kind, questions: d.questions.filter((q) => q.type).map((q) => ({ ...q, catName: catName[q.cat] || null })) };
  }, editor);

  /* ================= Obrazy ================= */
  r.post('/api/media', (ctx) => {
    const limits = [[`media:${ctx.user.id}`, 200, 3600e3]];
    guardLimits(limits);
    const mime = String(ctx.body.mime || '');
    if (!MIME_EXT[mime]) throw new HttpError(400, 'Obsługiwane są obrazy PNG, JPG, WEBP i GIF.');
    const b64 = String(ctx.body.data || '').replace(/^data:[^,]*,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new HttpError(400, 'Pusty plik.');
    if (buf.length > MEDIA_MAX) throw new HttpError(413, 'Obraz jest za duży (maksymalnie 3 MB).');
    const sig = buf.subarray(0, 12);
    const ok = (mime === 'image/png' && sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      || (mime === 'image/jpeg' && sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff)
      || (mime === 'image/gif' && sig.subarray(0, 4).toString('latin1') === 'GIF8')
      || (mime === 'image/webp' && sig.subarray(0, 4).toString('latin1') === 'RIFF' && sig.subarray(8, 12).toString('latin1') === 'WEBP');
    if (!ok) throw new HttpError(400, 'Plik nie jest prawidłowym obrazem.');
    failLimits(limits);
    const mid = crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(path.join(MEDIA_DIR, `${mid}.${MIME_EXT[mime]}`), buf);
    run('INSERT INTO media (id, owner_id, mime, bytes, created_at) VALUES (?,?,?,?,?)', mid, ctx.user.id, mime, buf.length, now());
    return { id: mid, url: `/api/media/${mid}` };
  }, editor, { bodyLimit: 5 * 1024 * 1024 });

  r.get('/api/media/:id', (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Musisz się zalogować.', { needLogin: true });
    const mid = String(ctx.params.id);
    if (!/^[a-f0-9]{24}$/.test(mid)) throw new HttpError(404, 'Nie znaleziono.');
    const m = one('SELECT * FROM media WHERE id = ?', mid);
    if (!m) throw new HttpError(404, 'Nie znaleziono.');
    const file = path.join(MEDIA_DIR, `${mid}.${MIME_EXT[m.mime]}`);
    if (!fs.existsSync(file)) throw new HttpError(404, 'Nie znaleziono.');
    ctx.res.writeHead(200, { 'Content-Type': m.mime, 'Content-Length': m.bytes, 'Cache-Control': 'private, max-age=604800, immutable', 'Content-Disposition': 'inline' });
    fs.createReadStream(file).pipe(ctx.res);
  });

  /* ================= Uczeń ================= */
  function publishedTest(testId) {
    const a = one(`SELECT a.*, s.is_available, s.name AS subject_name, s.slug AS subject_slug, s.accent FROM activities a
                   JOIN subjects s ON s.id = a.subject_id WHERE a.id = ? AND a.kind IN ('teaching_test','exam_test','quiz')`, id(testId));
    if (!a || a.status !== 'published' || !a.is_available) throw new HttpError(404, 'Ten test nie jest dostępny.');
    if (isExpired(a)) throw new HttpError(404, 'Ten test tymczasowy już zniknął.', { expired: true });
    return a;
  }

  r.get('/api/tests/:id', (ctx) => {
    const a = publishedTest(ctx.params.id);
    const d = parseDoc(a);
    const st = testStatusFor(ctx.user.id, a);
    const quiz = a.kind === 'quiz';
    return {
      test: {
        id: a.id, title: a.title, summary: a.summary, kind: a.kind, questionCount: effectiveCount(d), poolSize: d.questions.length,
        subject: { name: a.subject_name, slug: a.subject_slug, accent: a.accent },
        maxMistakes: a.kind === 'exam_test' ? d.settings.maxMistakes : null,
        points: a.kind === 'exam_test' ? { first: d.settings.points.examFirst, repeat: d.settings.points.examRepeat }
          : quiz ? { byGrade: RULES.gradePoints } : { first: d.settings.points.teachingFirst, repeat: 0 },
        hasTimer: a.kind === 'exam_test',
        deadline: quiz ? d.settings.deadline || null : null,
        gradeScale: quiz ? d.settings.gradeScale : null,
        maxAttempts: quiz ? RULES.quizMaxAttempts : null,
        categories: quiz ? d.settings.categories.map((c) => c.name) : null,
        expiresAt: quiz ? null : a.expires_at || null,
        reward: d.settings.reward ? { label: rewardLabel(d.settings.reward), minGrade: quiz ? d.settings.rewardMinGrade : null,
          got: !!one('SELECT 1 FROM notifications WHERE dedupe = ?', `reward:${a.id}:${ctx.user.id}`) } : null,
      },
      status: st,
    };
  }, requireStudent);

  r.post('/api/tests/:id/attempts', (ctx) => {
    const a = publishedTest(ctx.params.id);
    const st = testStatusFor(ctx.user.id, a);
    if (st.activeAttemptId) return { attemptId: st.activeAttemptId, resumed: true };
    if (!st.canStart) {
      const msg = {
        failed: 'Po nieudanym egzaminie możesz spróbować ponownie po 20 minutach.',
        passed: 'Ten egzamin możesz powtórzyć tydzień po zaliczeniu.',
        no_attempts: `Sprawdzian można rozwiązać najwyżej ${RULES.quizMaxAttempts} razy – ${gfor(ctx.user, 'wykorzystałeś', 'wykorzystałaś')} wszystkie podejścia.`,
        deadline: 'Termin tego sprawdzianu już minął.',
      }[st.reason] || 'Nie możesz teraz rozpocząć tego testu.';
      throw new HttpError(409, msg, { retryAt: st.retryAt, reason: st.reason });
    }
    return { attemptId: startAttempt(ctx.user, a) };
  }, requireStudent);

  /* Podejście: uczeń (aktywny) albo nauczyciel/administrator w trybie podglądu – zawsze tylko własne. */
  const attemptOwner = (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Musisz się zalogować.', { needLogin: true });
    if (ctx.user.role === 'student') return requireStudent(ctx);
    if (!['teacher', 'admin'].includes(ctx.user.role)) throw new HttpError(403, 'Brak uprawnień.');
    const a = one('SELECT preview, user_id FROM test_attempts WHERE id = ?', Number(ctx.params.id) || 0);
    if (a && !a.preview) throw new HttpError(403, 'Brak uprawnień.');
  };

  r.get('/api/attempts/:id', (ctx) => currentView(id(ctx.params.id), ctx.user), attemptOwner);
  r.post('/api/attempts/:id/answer', (ctx) => answer(id(ctx.params.id), ctx.user, ctx.body), attemptOwner, { bodyLimit: 64 * 1024 });
  r.post('/api/attempts/:id/abandon', (ctx) => ({ summary: abandon(id(ctx.params.id), ctx.user) }), attemptOwner);
  r.post('/api/attempts/:id/lifeline', (ctx) => useLifeline(id(ctx.params.id), ctx.user), attemptOwner);
  r.get('/api/attempts/:id/summary', (ctx) => {
    const { row, snapshot } = loadAttempt(id(ctx.params.id), ctx.user);
    return { summary: summaryOf(row, snapshot) };
  }, attemptOwner);
}
