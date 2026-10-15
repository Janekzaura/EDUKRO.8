// Lekcje: edytor (nauczyciel i administrator), prowadzenie lekcji na tablicy, samodzielna nauka ucznia.
import { one, all, run, now, audit } from '../db.js';
import { hmac, sha256 } from '../security.js';
import { HttpError, str, id } from '../http.js';
import { requireRole, requireStudent } from '../auth.js';
import { editableSubjects, assertSubject } from './tests.js';
import { parseLesson, cleanSlides, cleanLessonSettings, lessonMediaIds } from '../lessons/schema.js';
import { validateLesson, emptySlide, LL, AWARD, GAME } from '../../public/js/shared/lesson-rules.js';
import { inClass, className } from '../../public/js/shared/classes.js';
import { prepare, grade, seededRng } from '../quiz/engine.js';
import { awardClassPoints } from '../points.js';
import { notifyStudents, classOfUser } from '../notify.js';
import { demoLesson, addImage, chemistryAll } from '../quiz/demo.js';
import { templateContent } from './templates.js';
import { cleanQuestions } from '../quiz/schema.js';
import { parseClass as parseCls, classLabel as clsLabel } from '../../public/js/shared/classes.js';
import { lockOf, lockMessage, assertPublishable, copyFpFor, canDelete, assertCanDelete, authorName } from '../ownership.js';
import { giveLessonStar } from '../stars.js';

const editor = requireRole('teacher', 'admin');
export const ALL_CLASSES = '*';

/** „7a”, „7 A”, „VII a” → „7a”; „*” = wszyscy uczniowie; nieczytelne → null. */
export function normClass(v) {
  if (v === ALL_CLASSES) return ALL_CLASSES;
  const c = parseCls(v);
  return c && c.section ? clsLabel(c.grade, c.section) : null;
}
export const classTitle = (label) => (label === ALL_CLASSES ? 'wszyscy uczniowie' : `klasa ${label}`);

/** Klasy z rejestru szkoły (do wyboru przy „Prowadź” i „Opublikuj dla…”). */
export function schoolClasses() {
  const map = new Map();
  for (const r of all("SELECT r.class_label, u.id AS uid FROM registry r LEFT JOIN users u ON u.registry_id = r.id AND u.role = 'student'")) {
    const c = normClass(r.class_label);
    if (!c) continue;
    if (!map.has(c)) map.set(c, { label: c, students: 0, accounts: 0 });
    const x = map.get(c); x.students++; if (r.uid) x.accounts++;
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pl', { numeric: true }));
}
function lessonClasses(lessonId) {
  return all('SELECT class_label AS label, published, paused, published_at AS publishedAt, completed_at AS completedAt FROM lesson_classes WHERE lesson_id = ? ORDER BY class_label', lessonId)
    .map((x) => ({ ...x, published: !!x.published, paused: !!x.paused }));
}
function syncStatus(lessonId, userId) {
  const any = one('SELECT 1 FROM lesson_classes WHERE lesson_id = ? AND published = 1', lessonId);
  run('UPDATE activities SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?', any ? 'published' : 'draft', now(), userId, lessonId);
  return any ? 'published' : 'draft';
}
function announce(a, classes) {
  const s = one('SELECT name, is_available FROM subjects WHERE id = ?', a.subject_id);
  if (!s?.is_available || !classes.length) return 0;
  return notifyStudents(classes, { kind: 'lesson_new', title: `Nowa lekcja (${s.name}): „${a.title}”`, body: 'Lekcja z zajęć jest już w EDUKRO – możesz do niej wracać i ćwiczyć pytania ze slajdów.', link: `/uczen/lekcja/${a.id}` }, `lesson:${a.id}`);
}
/** Publikacja dla podanych klas (pozostałe przestają widzieć lekcję). */
function setPublished(a, user, classes, { completedClass = null } = {}) {
  const t = now();
  const before = new Set(lessonClasses(a.id).filter((x) => x.published).map((x) => x.label));
  for (const c of classes) {
    run(`INSERT INTO lesson_classes (lesson_id, class_label, published, paused, published_at, by_user) VALUES (?,?,1,0,?,?)
         ON CONFLICT(lesson_id, class_label) DO UPDATE SET published = 1, paused = 0, published_at = COALESCE(published_at, excluded.published_at), by_user = excluded.by_user`, a.id, c, t, user.id);
  }
  const keep = new Set(classes);
  for (const c of before) if (!keep.has(c)) run('UPDATE lesson_classes SET published = 0, paused = 0 WHERE lesson_id = ? AND class_label = ?', a.id, c);
  if (completedClass) run('UPDATE lesson_classes SET completed_at = ? WHERE lesson_id = ? AND class_label = ?', t, a.id, completedClass);
  const status = syncStatus(a.id, user.id);
  const fresh = classes.filter((c) => !before.has(c));
  const notified = announce(a, fresh);
  return { status, classes: lessonClasses(a.id), notified };
}
function cleanClassList(list) {
  const out = [...new Set((Array.isArray(list) ? list : []).map(normClass).filter(Boolean))].slice(0, 60);
  return out.includes(ALL_CLASSES) ? [ALL_CLASSES] : out;
}

function getLesson(user, lessonId) {
  const a = one("SELECT * FROM activities WHERE id = ? AND kind = 'lesson' AND status != 'archived'", id(lessonId));
  if (!a) throw new HttpError(404, 'Nie znaleziono lekcji.');
  assertSubject(user, a.subject_id);
  return a;
}
function fullDoc(a) {
  const d = parseLesson(a);
  return { title: a.title, summary: a.summary, settings: d.settings, slides: d.slides };
}
function editorLesson(a) {
  const d = fullDoc(a);
  return { id: a.id, title: a.title, summary: a.summary, subjectId: a.subject_id, status: a.status, settings: d.settings, slides: d.slides, updatedAt: a.updated_at, tutorial: !!a.tutorial, copyOfTutorial: !!a.copy_fp, author: authorName(a), lock: lockOf(a, d.slides) };
}
function listRow(a, user) {
  const d = fullDoc(a);
  const v = validateLesson(d);
  const s = one('SELECT name, accent FROM subjects WHERE id = ?', a.subject_id);
  return {
    id: a.id, title: a.title, status: a.status, subjectId: a.subject_id, subject: s?.name, accent: s?.accent,
    slideCount: d.slides.length, errors: v.errors, updatedAt: a.updated_at, classes: lessonClasses(a.id),
    author: authorName(a), mine: a.created_by === user.id, canDelete: canDelete(user, a), lock: lockOf(a, d.slides),
  };
}
function dropUnknownMedia(slides) {
  const known = new Set(lessonMediaIds(slides).filter((m) => one('SELECT 1 FROM media WHERE id = ?', m)));
  const fix = (o, k) => { if (o && o[k] && !known.has(o[k])) o[k] = null; };
  for (const s of slides) {
    fix(s, 'image');
    for (const b of s.blocks || []) fix(b, 'image');
    if (s.question) { fix(s.question, 'image'); fix(s.question, 'diagram'); }
  }
  return slides;
}

/** Uczniowie klasy (np. „7a”) – z rejestru (także ci, którzy nie mają jeszcze konta). */
export function rosterFor(label) {
  const c = parseCls(typeof label === 'string' ? label : label?.grade ? `${label.grade}${label.section || ''}` : '');
  if (!c || !c.section) return [];
  return all(`SELECT r.id, r.first_name AS firstName, r.last_name AS lastName, r.class_label AS cls, u.id AS userId
              FROM registry r LEFT JOIN users u ON u.registry_id = r.id AND u.role = 'student'
              ORDER BY r.last_name, r.first_name`)
    .filter((r) => inClass(r.cls, c.grade, c.section))
    .map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, hasAccount: !!r.userId }));
}
/** Klasa prowadzonej lekcji: z zapytania, a dla starszych lekcji – z ustawień. */
function presentClass(a, raw) {
  const c = normClass(raw);
  if (c && c !== ALL_CLASSES) return c;
  const st = parseLesson(a).settings;
  return st.grade && st.section ? `${st.grade}${st.section}` : null;
}

/* ---------- Pytania na slajdach: losowość z ziarnem, żeby sprawdzić odpowiedź bez przechowywania stanu ---------- */
function seedOf(a, slide, userId) {
  const v = sha256(JSON.stringify(slide.question)).slice(0, 12);
  return { seed: hmac(`lesson:${a.id}:${slide.id}:${userId}:${v}`), v };
}
function viewQuestion(a, slide, userId) {
  const { seed, v } = seedOf(a, slide, userId);
  const { view } = prepare(slide.question, { shuffleAnswers: true }, { rng: seededRng(seed) });
  return { ...view, v, serve: `${slide.id}-${v}` };
}
function checkQuestion(a, userId, body) {
  const slide = parseLesson(a).slides.find((s) => s.id === String(body.slideId || ''));
  if (!slide || slide.type !== 'question' || !slide.question?.type) throw new HttpError(404, 'Nie znaleziono pytania.');
  const { seed, v } = seedOf(a, slide, userId);
  if (String(body.v || '') !== v) throw new HttpError(409, 'To pytanie zostało zmienione – odśwież lekcję.');
  const { key } = prepare(slide.question, { shuffleAnswers: true }, { rng: seededRng(seed) });
  const g = grade(slide.question, key, body.answer, { spelling: true });
  return { correct: g.correct, parts: g.parts, solution: g.correct ? null : g.solution, explanation: g.correct ? null : slide.question.explanation || null };
}

/** Slajdy do pokazania: pytania bez odpowiedzi; dla ucznia – bez gier i koła (odbywają się w klasie). */
function slidesFor(a, userId, { teacher }) {
  return parseLesson(a).slides.map((s) => {
    if (s.type === 'question') return s.question?.type ? { id: s.id, type: 'question', title: s.title, look: s.look, question: viewQuestion(a, s, userId) } : null;
    if (!teacher && (s.type === 'wheel' || s.type === 'game')) return { id: s.id, type: s.type, title: s.title, look: s.look, game: s.game, classOnly: true };
    return s;
  }).filter(Boolean);
}

/** Czy uczeń widzi lekcję: opublikowana dla jego klasy albo dla wszystkich uczniów. */
export function lessonVisibleTo(lessonId, user) {
  const mine = classOfUser(user);
  return !!one(`SELECT 1 FROM lesson_classes WHERE lesson_id = ? AND published = 1 AND (class_label = ? OR class_label = '*')`, lessonId, mine || '-');
}

export function register(r) {
  /* ================= Edytor ================= */
  r.get('/api/editor/lessons', (ctx) => {
    const ids = editableSubjects(ctx.user).map((s) => s.id);
    if (!ids.length) return { lessons: [] };
    const rows = all(`SELECT * FROM activities WHERE kind = 'lesson' AND status != 'archived'
                      AND subject_id IN (${ids.map(() => '?').join(',')}) ORDER BY updated_at DESC`, ...ids);
    return { lessons: rows.map((a) => listRow(a, ctx.user)) };
  }, editor);

  r.post('/api/editor/lessons', (ctx) => {
    const title = str(ctx.body.title, { min: 1, max: LL.title, field: 'Nazwa lekcji' });
    const subjectId = id(ctx.body.subjectId);
    assertSubject(ctx.user, subjectId);
    let doc = { settings: cleanLessonSettings(ctx.body.settings), slides: cleanSlides([{ ...emptySlide('title'), title }]) };
    if (ctx.body.templateId) {
      // szablon: układ slajdów bez tekstu; na slajd tytułowy (jeśli jest pierwszy) trafia nazwa lekcji
      const tpl = templateContent('lesson', ctx.body.templateId, ctx.user);
      if (tpl.slides[0]?.type === 'title') tpl.slides[0].title = title;
      doc = { settings: doc.settings, slides: tpl.slides };
    }
    const t = now();
    const lid = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at, tutorial)
                     VALUES (?, 'lesson', ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?)`,
    subjectId, title, str(ctx.body.summary, { max: LL.summary, field: 'Opis' }), JSON.stringify(doc), ctx.user.id, ctx.user.id, t, t, ctx.body.tutorial === true ? 1 : 0).lastInsertRowid;
    audit(ctx.user.id, 'lesson.create', `activity:${lid}`);
    return { lesson: editorLesson(one('SELECT * FROM activities WHERE id = ?', lid)) };
  }, editor);

  r.get('/api/editor/lessons/:id', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    return { lesson: { ...editorLesson(a), canDelete: canDelete(ctx.user, a) }, subjects: editableSubjects(ctx.user), classes: lessonClasses(a.id), schoolClasses: schoolClasses() };
  }, editor);

  r.get('/api/editor/classes', () => ({ classes: schoolClasses() }), editor);

  r.put('/api/editor/lessons/:id', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const b = ctx.body;
    const title = b.title === undefined ? a.title : str(b.title, { max: LL.title, field: 'Nazwa lekcji' });
    const summary = b.summary === undefined ? a.summary : str(b.summary, { max: LL.summary, field: 'Opis' });
    let subjectId = a.subject_id;
    if (b.subjectId !== undefined) { subjectId = id(b.subjectId); assertSubject(ctx.user, subjectId); }
    const prev = parseLesson(a);
    const doc = {
      settings: b.settings === undefined ? prev.settings : cleanLessonSettings(b.settings),
      slides: b.slides === undefined ? prev.slides : dropUnknownMedia(cleanSlides(b.slides)),
    };
    let status = a.status, unpublished = false;
    const v = validateLesson({ title, ...doc });
    if (status === 'published' && v.errors) {
      status = 'draft'; unpublished = true;
      run('UPDATE lesson_classes SET published = 0, paused = 1 WHERE lesson_id = ? AND published = 1', a.id);
    }
    const t = now();
    run('UPDATE activities SET title = ?, summary = ?, subject_id = ?, content_json = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
      title || a.title, summary, subjectId, JSON.stringify(doc), status, ctx.user.id, t, a.id);
    return { ok: true, updatedAt: t, status, unpublished, errors: v.errors, classes: lessonClasses(a.id), lock: lockOf(a, doc.slides) };
  }, editor, { bodyLimit: 2 * 1024 * 1024 });

  /* Samouczek: dodaje do lekcji po jednym przykładzie każdego rodzaju slajdu (do obejrzenia i przerobienia). */
  r.post('/api/editor/lessons/:id/sample-slides', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const prev = parseLesson(a);
    const have = new Set(prev.slides.map((x) => (x.type === 'game' ? `game:${x.game}` : x.type)));
    const media = one("SELECT id FROM media WHERE owner_id IS NULL ORDER BY created_at LIMIT 1")?.id || addImage('atom.png');
    const extra = cleanSlides(demoLesson(media)).filter((x) => x.type !== 'title' && !have.has(x.type === 'game' ? `game:${x.game}` : x.type) && (have.add(x.type === 'game' ? `game:${x.game}` : x.type) || true));
    const slides = cleanSlides([...prev.slides, ...extra]).slice(0, LL.slides);
    run('UPDATE activities SET content_json = ?, updated_at = ?, updated_by = ? WHERE id = ?', JSON.stringify({ settings: prev.settings, slides }), now(), ctx.user.id, a.id);
    return { ok: true, added: slides.length - prev.slides.length, slides: slides.length };
  }, editor);

  /* Treść do samouczków („Wpisz za mnie”): lekcja z każdym rodzajem slajdu i test z każdym rodzajem pytania. */
  r.get('/api/editor/tutorial-content', () => {
    let media = {};
    try { media = JSON.parse(one("SELECT value FROM meta WHERE key = 'tutorial_media'")?.value || '{}'); } catch { media = {}; }
    if (!media.atom || !one('SELECT 1 FROM media WHERE id = ?', media.atom)) {
      media = { atom: addImage('atom.png') };
      run("INSERT INTO meta (key, value) VALUES ('tutorial_media', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(media));
    }
    return {
      lesson: { title: 'Lekcja z samouczka – wszystkie rodzaje slajdów', summary: 'Budowa atomu: każdy rodzaj slajdu EDUKRO w jednej lekcji.', slides: cleanSlides(demoLesson(media.atom)) },
      test: { title: 'Test z samouczka – wszystkie rodzaje pytań', summary: 'Pierwiastki, związki i budowa atomu – po jednym pytaniu każdego rodzaju.', questions: cleanQuestions(chemistryAll(media.atom)) },
    };
  }, editor);

  /* Publikacja dla wybranych klas („Opublikuj dla…”). Pusta lista = wycofanie publikacji. */
  r.post('/api/editor/lessons/:id/classes', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const classes = cleanClassList(ctx.body.classes);
    if (classes.length) {
      assertPublishable(a, parseLesson(a).slides, 'lesson');
      const v = validateLesson(fullDoc(a));
      if (v.errors) throw new HttpError(422, `Przed publikacją popraw: ${v.errors} ${v.errors === 1 ? 'rzecz' : 'rzeczy'}.`, { problems: v.problems });
    }
    const r2 = setPublished(a, ctx.user, classes);
    audit(ctx.user.id, 'lesson.classes', `activity:${a.id}:${classes.join(',')}`);
    return { ok: true, ...r2 };
  }, editor);

  /* Starsza ścieżka: publikacja dla klas z treści żądania albo z ustawień lekcji. */
  r.post('/api/editor/lessons/:id/publish', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    let classes = cleanClassList(ctx.body.classes);
    if (!classes.length) {
      const prev = lessonClasses(a.id).filter((x) => x.published || x.paused).map((x) => x.label);
      const st = parseLesson(a).settings;
      classes = prev.length ? prev : st.grade && st.section ? [`${st.grade}${st.section}`] : [];
    }
    if (!classes.length) throw new HttpError(422, 'Wybierz, dla których klas opublikować lekcję.', { needClasses: true });
    assertPublishable(a, parseLesson(a).slides, 'lesson');
    const v = validateLesson(fullDoc(a));
    if (v.errors) throw new HttpError(422, `Przed publikacją popraw: ${v.errors} ${v.errors === 1 ? 'rzecz' : 'rzeczy'}.`, { problems: v.problems });
    const r2 = setPublished(a, ctx.user, [...new Set([...lessonClasses(a.id).filter((x) => x.published).map((x) => x.label), ...classes])]);
    audit(ctx.user.id, 'lesson.publish', `activity:${a.id}`);
    return { ok: true, ...r2 };
  }, editor);

  r.post('/api/editor/lessons/:id/unpublish', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    run('UPDATE lesson_classes SET published = 0, paused = 0 WHERE lesson_id = ?', a.id);
    return { ok: true, status: syncStatus(a.id, ctx.user.id), classes: lessonClasses(a.id) };
  }, editor);

  /* Lekcja przeprowadzona do końca z klasą → od razu dostępna dla uczniów tej klasy. */
  r.post('/api/editor/lessons/:id/complete', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const cls = normClass(ctx.body.classLabel);
    if (!cls || cls === ALL_CLASSES) throw new HttpError(400, 'Nie wybrano klasy.');
    const v = validateLesson(fullDoc(a));
    const lock = lockOf(a, parseLesson(a).slides);
    if (lock) {
      // lekcja z samouczka (albo jej niezmieniona kopia) – zapamiętujemy przerobienie, ale nie publikujemy
      run(`INSERT INTO lesson_classes (lesson_id, class_label, completed_at, by_user) VALUES (?,?,?,?)
           ON CONFLICT(lesson_id, class_label) DO UPDATE SET completed_at = excluded.completed_at`, a.id, cls, now(), ctx.user.id);
      return { ok: true, published: false, locked: lock, message: lockMessage(lock, 'lesson'), classes: lessonClasses(a.id) };
    }
    if (v.errors) {
      run(`INSERT INTO lesson_classes (lesson_id, class_label, completed_at, by_user) VALUES (?,?,?,?)
           ON CONFLICT(lesson_id, class_label) DO UPDATE SET completed_at = excluded.completed_at`, a.id, cls, now(), ctx.user.id);
      return { ok: true, published: false, errors: v.errors, classes: lessonClasses(a.id) };
    }
    const current = lessonClasses(a.id).filter((x) => x.published).map((x) => x.label);
    const r2 = setPublished(a, ctx.user, current.includes(ALL_CLASSES) ? current : [...new Set([...current, cls])], { completedClass: cls });
    audit(ctx.user.id, 'lesson.complete', `activity:${a.id}:${cls}`);
    return { ok: true, published: true, ...r2 };
  }, editor);

  r.post('/api/editor/lessons/:id/duplicate', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const t = now();
    const fp = copyFpFor(a, parseLesson(a).slides);
    const copy = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at, copy_fp)
                      VALUES (?, 'lesson', ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?)`,
    a.subject_id, `${a.title} (kopia)`.slice(0, LL.title), a.summary, a.content_json, ctx.user.id, ctx.user.id, t, t, fp).lastInsertRowid;
    audit(ctx.user.id, 'lesson.copy', `activity:${a.id}->${copy}`);
    return { id: Number(copy), mustChange: !!fp };
  }, editor);

  r.delete('/api/editor/lessons/:id', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    assertCanDelete(ctx.user, a, 'lesson');
    const used = one('SELECT COUNT(*) n FROM class_points WHERE activity_id = ?', a.id).n;
    if (used) run("UPDATE activities SET status = 'archived', updated_at = ? WHERE id = ?", now(), a.id);
    else run('DELETE FROM activities WHERE id = ?', a.id);
    audit(ctx.user.id, used ? 'lesson.archive' : 'lesson.delete', `activity:${a.id}`);
    return { ok: true, archived: !!used };
  }, editor);

  /* ---------- Prowadzenie lekcji (tablica) ---------- */
  r.get('/api/editor/lessons/:id/present', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const d = parseLesson(a);
    const s = one('SELECT name, accent FROM subjects WHERE id = ?', a.subject_id);
    const cls = presentClass(a, ctx.query.class);
    const lc = cls ? one('SELECT published, completed_at FROM lesson_classes WHERE lesson_id = ? AND class_label = ?', a.id, cls) : null;
    return {
      lesson: { id: a.id, title: a.title, summary: a.summary, status: a.status, settings: d.settings, classLabel: cls, className: cls ? `klasa ${cls}` : null,
        subject: s?.name, accent: s?.accent, publishedForClass: !!lc?.published, completedAt: lc?.completed_at || null, errors: validateLesson(fullDoc(a)).errors, lock: lockOf(a, d.slides) },
      slides: slidesFor(a, ctx.user.id, { teacher: true }),
      roster: cls ? rosterFor(cls) : [],
      award: AWARD,
    };
  }, editor);

  r.post('/api/editor/lessons/:id/check', (ctx) => checkQuestion(getLesson(ctx.user, ctx.params.id), ctx.user.id, ctx.body), editor, { bodyLimit: 64 * 1024 });

  /* Punkty z lekcji: kwotę ustala serwer (koło: +10 za dobrą odpowiedź, gra: +5 dla zwycięzców, remis +2). */
  r.post('/api/editor/lessons/:id/award', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const d = parseLesson(a);
    const slide = d.slides.find((s) => s.id === String(ctx.body.slideId || ''));
    if (!slide || !['wheel', 'game'].includes(slide.type)) throw new HttpError(404, 'Nie znaleziono slajdu z kołem fortuny ani gry.');
    const outcome = String(ctx.body.outcome || '');
    const ids = [...new Set((Array.isArray(ctx.body.registryIds) ? ctx.body.registryIds : []).map(Number).filter(Number.isInteger))].slice(0, 60);
    if (!ids.length) throw new HttpError(400, 'Nie wskazano uczniów.');
    const roster = new Set(rosterFor(presentClass(a, ctx.body.classLabel)).map((x) => x.id));
    if (ids.some((x) => !roster.has(x))) throw new HttpError(400, 'Punkty można przyznać tylko uczniom klasy, z którą prowadzisz lekcję.');
    let amount, reason;
    if (slide.type === 'wheel') {
      if (outcome !== 'correct' || ids.length !== 1) throw new HttpError(400, 'Nieprawidłowe dane.');
      amount = AWARD.wheel; reason = `Lekcja „${a.title}”: dobra odpowiedź przy kole fortuny`;
    } else {
      if (!['win', 'draw'].includes(outcome)) throw new HttpError(400, 'Nieprawidłowe dane.');
      amount = outcome === 'win' ? AWARD.gameWin : AWARD.gameDraw;
      reason = `Lekcja „${a.title}”: ${outcome === 'win' ? 'wygrana' : 'remis'} w grze „${GAME[slide.game]?.label || 'gra klasowa'}”`;
    }
    if (ctx.body.preview === true) return { preview: true, amount, count: ids.length };
    const runKey = String(ctx.body.runKey || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    if (runKey.length < 6) throw new HttpError(400, 'Nieprawidłowe dane.');
    let count = 0;
    for (const rid of ids) if (awardClassPoints(rid, amount, reason, { activityId: a.id, by: ctx.user.id, runKey: `${a.id}:${slide.id}:${runKey}:${rid}` })) count++;
    return { ok: true, amount, count };
  }, editor);

  /* Gwiazda lekcji: na koniec lekcji nauczyciel wybiera najaktywniejszą osobę z klasy (+100 pkt, ranking tygodnia). */
  r.post('/api/editor/lessons/:id/star', (ctx) => {
    const a = getLesson(ctx.user, ctx.params.id);
    const cls = presentClass(a, ctx.body.classLabel);
    if (!cls) throw new HttpError(400, 'Gwiazdę lekcji wybiera się podczas lekcji prowadzonej z klasą.');
    const rid = Number(ctx.body.registryId);
    if (!rosterFor(cls).some((x) => x.id === rid)) throw new HttpError(400, 'Gwiazdą lekcji może zostać tylko osoba z klasy, z którą prowadzisz lekcję.');
    if (ctx.body.preview === true) return { preview: true, points: AWARD.lessonStar };
    const runKey = String(ctx.body.runKey || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    if (runKey.length < 6) throw new HttpError(400, 'Nieprawidłowe dane.');
    const res = giveLessonStar({ lesson: a, classLabel: cls, registryId: rid, by: ctx.user.id, runKey });
    audit(ctx.user.id, 'lesson.star', `activity:${a.id}:registry:${rid}`);
    return res;
  }, editor);

  /* ================= Uczeń: samodzielna nauka ================= */
  function publishedLesson(lessonId, user) {
    const a = one(`SELECT a.*, s.is_available, s.name AS subject_name, s.slug AS subject_slug, s.accent FROM activities a
                   JOIN subjects s ON s.id = a.subject_id WHERE a.id = ? AND a.kind = 'lesson'`, id(lessonId));
    if (!a || a.status !== 'published' || !a.is_available) throw new HttpError(404, 'Ta lekcja nie jest dostępna.');
    if (!lessonVisibleTo(a.id, user)) throw new HttpError(404, 'Ta lekcja nie jest dostępna dla Twojej klasy.');
    return a;
  }
  r.get('/api/lessons/:id', (ctx) => {
    const a = publishedLesson(ctx.params.id, ctx.user);
    const d = parseLesson(a);
    const mine = classOfUser(ctx.user);
    return {
      lesson: { id: a.id, title: a.title, summary: a.summary, settings: d.settings, className: mine ? `klasa ${mine}` : null, subject: { name: a.subject_name, slug: a.subject_slug, accent: a.accent } },
      slides: slidesFor(a, ctx.user.id, { teacher: false }),
    };
  }, requireStudent);
  r.post('/api/lessons/:id/check', (ctx) => checkQuestion(publishedLesson(ctx.params.id, ctx.user), ctx.user.id, ctx.body), requireStudent, { bodyLimit: 64 * 1024 });
}
