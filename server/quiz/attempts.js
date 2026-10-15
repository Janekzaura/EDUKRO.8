// Przebieg podejścia do testu: losowanie i kolejka pytań, czas, błędy, powtórki, wynik, punkty.
// Cały stan jest po stronie serwera – przeglądarka dostaje tylko bieżące pytanie bez odpowiedzi.
//  teaching – test nauczający: po błędzie poprawna odpowiedź, pytanie wraca do skutku
//  exam     – test egzaminacyjny: zegar, limit błędów, przerwy między podejściami
//  quiz     – sprawdzian: bez sprawdzania na bieżąco i bez podpowiedzi, ocena 1–6 na końcu, 3 podejścia, termin
import crypto from 'node:crypto';
import { one, run, now, tx } from '../db.js';
import { HttpError } from '../http.js';
import { prepare, grade, shuffle, assist } from './engine.js';
import {
  parseTime, validateQuestion, RULES, DEFAULT_SETTINGS, upgradeQuestion, gradeFor, GRADE_NAMES, clean,
} from '../../public/js/shared/quiz-rules.js';
import { pointsBalance, pointsHistory, addPoints } from '../points.js';
import { itemQty, takeItem } from '../shop/store.js';
import { notify, rewardLabel, gfor } from '../notify.js';
import { processTestWinners } from '../rankings.js';

export { pointsBalance, pointsHistory };
export const TEST_KINDS = ['teaching_test', 'exam_test', 'quiz'];
const GRACE_MS = 3000; // tolerancja opóźnienia sieci przy limicie czasu
const MIN = 60e3, DAY = 24 * 3600e3;

export function parseDoc(a) {
  let doc = {};
  try { doc = a.content_json ? JSON.parse(a.content_json) : {}; } catch { doc = {}; }
  const s = doc.settings || {};
  return {
    settings: {
      ...DEFAULT_SETTINGS, ...s,
      categories: Array.isArray(s.categories) ? s.categories : [],
      gradeScale: Array.isArray(s.gradeScale) && s.gradeScale.length === 5 ? s.gradeScale : DEFAULT_SETTINGS.gradeScale,
      points: { ...DEFAULT_SETTINGS.points, ...(s.points || {}) },
    },
    questions: Array.isArray(doc.questions) ? doc.questions.map(upgradeQuestion) : [],
  };
}

export const modeOf = (kind) => (kind === 'exam_test' ? 'exam' : kind === 'quiz' ? 'quiz' : 'teaching');

export function questionSeconds(q, settings) {
  const own = parseTime(q.time);
  if (own.ok && !own.empty) return own.seconds;
  const d = parseTime(settings.defaultTime);
  return d.ok && !d.empty ? d.seconds : 60;
}

/* ---------- Status testu dla ucznia ---------- */
export function testStatusFor(userId, activity) {
  const mode = modeOf(activity.kind);
  const active = one(`SELECT id FROM test_attempts WHERE user_id = ? AND activity_id = ? AND status = 'active' AND preview = 0
                      ORDER BY id DESC LIMIT 1`, userId, activity.id);
  const done = mode === 'exam' ? "'passed'" : mode === 'quiz' ? "'completed','passed','failed'" : "'completed'";
  const passedCount = one(`SELECT COUNT(*) n FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0
                           AND status IN (${done})`, userId, activity.id).n;
  const best = one(`SELECT MAX(score) s, MAX(grade) g FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0 AND status IN ('passed','completed')`, userId, activity.id);
  const out = { mode, activeAttemptId: active?.id || null, passedCount, bestScore: best?.s ?? null, canStart: true, reason: null, retryAt: null };
  if (mode === 'quiz') {
    const d = parseDoc(activity).settings;
    out.bestGrade = best?.g ?? null;
    out.attemptsUsed = passedCount;
    out.attemptsLeft = Math.max(0, RULES.quizMaxAttempts - passedCount);
    out.deadline = d.deadline || null;
    if (active) return out;
    if (out.attemptsLeft <= 0) { out.canStart = false; out.reason = 'no_attempts'; }
    else if (d.deadline && now() > d.deadline) { out.canStart = false; out.reason = 'deadline'; }
    return out;
  }
  if (active) return out;
  if (mode === 'exam') {
    const last = one(`SELECT status, finished_at FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0
                      AND status IN ('passed','failed') ORDER BY finished_at DESC LIMIT 1`, userId, activity.id);
    if (last) {
      const wait = last.status === 'failed' ? RULES.examFailCooldownMin * MIN : RULES.examRepeatDays * DAY;
      const retryAt = last.finished_at + wait;
      if (retryAt > now()) {
        out.canStart = false;
        out.retryAt = retryAt;
        out.reason = last.status === 'failed' ? 'failed' : 'passed';
      }
    }
  }
  return out;
}

/* ---------- Start ---------- */
export function startAttempt(user, activity, { preview = false } = {}) {
  const doc = parseDoc(activity);
  let pool = doc.questions;
  const cats = doc.settings.categories;
  if (preview) pool = pool.filter((q) => q.type && !validateQuestion(q, { kind: activity.kind === 'quiz' ? 'teaching_test' : activity.kind, categories: cats }).problems.some((p) => p.level === 'error'));
  if (!pool.length) throw new HttpError(422, preview ? 'Żadne pytanie nie jest jeszcze gotowe – uzupełnij przynajmniej jedno, aby zobaczyć podgląd.' : 'Ten test nie ma pytań.');
  // losowanie z puli: uczeń dostaje N losowych pytań (nie N pierwszych)
  const draw = Number(doc.settings.drawCount) || 0;
  let chosen = pool.map((_, i) => i);
  if (draw > 0 && draw < pool.length) chosen = shuffle(chosen).slice(0, draw).sort((a, b) => a - b);
  const questions = chosen.map((i) => pool[i]);
  const order = questions.map((_, i) => i);
  const queue = doc.settings.shuffleQuestions ? shuffle(order) : order;
  const snapshot = { title: activity.title, kind: activity.kind, subjectId: activity.subject_id, settings: doc.settings, questions };
  const state = { queue, pos: 0, current: null, firstTry: {}, mastered: {}, answered: 0, notice: null, lifelineUsed: false, abandoned: false };
  const id = run(`INSERT INTO test_attempts (activity_id, user_id, mode, preview, status, snapshot_json, state_json, started_at)
                  VALUES (?,?,?,?, 'active', ?, ?, ?)`,
  activity.id, user.id, modeOf(activity.kind), preview ? 1 : 0, JSON.stringify(snapshot), JSON.stringify(state), now()).lastInsertRowid;
  return Number(id);
}

/* ---------- Odczyt i zapis ---------- */
export function loadAttempt(id, user) {
  const a = one('SELECT * FROM test_attempts WHERE id = ?', id);
  if (!a || a.user_id !== user.id) throw new HttpError(404, 'Nie znaleziono tego podejścia do testu.');
  return { row: a, snapshot: JSON.parse(a.snapshot_json), state: JSON.parse(a.state_json) };
}
function saveState(id, state, extra = {}) {
  const sets = ['state_json = ?'];
  const vals = [JSON.stringify(state)];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); vals.push(v); }
  run(`UPDATE test_attempts SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
}

function progressOf(row, snapshot, state) {
  const total = snapshot.questions.length;
  const done = row.mode === 'teaching' ? Object.keys(state.mastered).length : state.answered;
  return { total, done, pos: state.pos, queueLength: state.queue.length, remaining: state.queue.length - state.pos };
}

function lifelineInfo(row, state, user) {
  if (row.preview) return { count: null, preview: true, allowed: !(row.mode === 'quiz' && state.lifelineUsed) };
  if (user.role !== 'student') return null;
  return { count: itemQty(user.id, 'lifeline'), allowed: !(row.mode === 'quiz' && state.lifelineUsed) };
}

const deadlinePassed = (row, snapshot) => row.mode === 'quiz' && !row.preview && snapshot.settings.deadline && now() > snapshot.settings.deadline;

/** Bieżący widok podejścia; w razie potrzeby wydaje kolejne pytanie i uruchamia jego zegar. */
export function currentView(id, user) {
  return tx(() => {
    let { row, snapshot, state } = loadAttempt(id, user);
    if (row.status !== 'active') return { attempt: attemptInfo(row, snapshot), summary: summaryOf(row, snapshot) };
    if (deadlinePassed(row, snapshot)) {
      const summary = finish(row, snapshot, state, 'completed');
      return { attempt: attemptInfo(one('SELECT * FROM test_attempts WHERE id = ?', id), snapshot), summary, notice: `Termin sprawdzianu minął – sprawdziliśmy odpowiedzi, których ${gfor(user, 'udzieliłeś', 'udzieliłaś')}.` };
    }
    const t = now();
    // zegar minął, a uczeń nie odpowiedział (np. zamknął kartę) – liczy się jako błąd
    if (state.current && state.current.deadline && t > state.current.deadline + GRACE_MS) {
      const r = applyAnswer(row, snapshot, state, null, { timeout: true });
      row = one('SELECT * FROM test_attempts WHERE id = ?', id);
      state = JSON.parse(row.state_json);
      if (r.finished) return { attempt: attemptInfo(row, snapshot), summary: summaryOf(row, snapshot), notice: 'Czas na ostatnie pytanie minął.' };
      state.notice = 'Czas na poprzednie pytanie minął – liczy się jako błąd.';
    }
    if (!state.current) {
      const qi = state.queue[state.pos];
      const q = snapshot.questions[qi];
      const { view, key } = prepare(q, snapshot.settings, { noHints: row.mode === 'quiz' });
      const secs = row.mode === 'exam' ? questionSeconds(q, snapshot.settings) : null;
      state.current = {
        qi, serve: crypto.randomBytes(8).toString('hex'), view, key, startedAt: t,
        deadline: secs ? t + secs * 1000 : null, seconds: secs, isRepeat: state.pos >= snapshot.questions.length,
      };
    }
    const notice = state.notice;
    state.notice = null;
    saveState(id, state);
    const c = state.current;
    return {
      attempt: attemptInfo(row, snapshot),
      progress: progressOf(row, snapshot, state),
      mistakes: row.mistakes,
      maxMistakes: row.mode === 'exam' ? snapshot.settings.maxMistakes : null,
      question: { serve: c.serve, number: Math.min(state.pos + 1, snapshot.questions.length), isRepeat: c.isRepeat, ...c.view },
      timer: c.deadline ? { totalMs: c.seconds * 1000, remainingMs: Math.max(0, c.deadline - now()) } : null,
      lifelines: lifelineInfo(row, state, user),
      assist: c.assist ? { data: c.assist, note: c.assistNote } : null,
      notice,
    };
  });
}

function attemptInfo(row, snapshot) {
  return {
    id: row.id, mode: row.mode, preview: !!row.preview, status: row.status, title: snapshot.title, activityId: row.activity_id,
    total: snapshot.questions.length, deadline: row.mode === 'quiz' ? snapshot.settings.deadline || null : null,
  };
}

/** Odpowiedź ucznia na bieżące pytanie. */
export function answer(id, user, { serve, answer: ans, timeout }) {
  return tx(() => {
    const { row, snapshot, state } = loadAttempt(id, user);
    if (row.status !== 'active') throw new HttpError(409, 'Ten test jest już zakończony.');
    if (!state.current || state.current.serve !== serve) throw new HttpError(409, 'To pytanie zostało już sprawdzone. Odśwież widok.');
    if (deadlinePassed(row, snapshot)) {
      return { saved: false, finished: true, summary: finish(row, snapshot, state, 'completed'), notice: 'Termin sprawdzianu minął.' };
    }
    return applyAnswer(row, snapshot, state, ans, { timeout: timeout === true });
  });
}

function applyAnswer(row, snapshot, state, ans, { timeout }) {
  const c = state.current;
  const q = snapshot.questions[c.qi];
  const t = now();
  const late = c.deadline && t > c.deadline + GRACE_MS;
  const timedOut = row.mode === 'exam' && (timeout || late);
  const g = timedOut ? { correct: false, parts: {}, solution: null } : grade(q, c.key, ans, snapshot.settings);
  if (state.firstTry[q.id] === undefined) state.firstTry[q.id] = g.correct;
  if (g.correct) state.mastered[q.id] = true;
  const mistakes = row.mistakes + (g.correct ? 0 : 1);
  state.answered += 1;
  state.pos += 1;
  if (row.mode === 'teaching' && !g.correct) state.queue.push(c.qi); // pytanie wróci na końcu – aż do skutku
  state.current = null;

  let finished = null;
  if (row.mode === 'exam') {
    if (mistakes > snapshot.settings.maxMistakes) finished = 'failed';
    else if (state.pos >= state.queue.length) finished = 'passed';
  } else if (state.pos >= state.queue.length) finished = 'completed';

  saveState(row.id, state, { mistakes });
  // Sprawdzian: odpowiedź jest zapisana, ale uczeń nie dowiaduje się, czy była dobra – wszystko na końcu.
  if (row.mode === 'quiz') {
    const res = { saved: true };
    if (finished) { res.finished = true; res.summary = finish(one('SELECT * FROM test_attempts WHERE id = ?', row.id), snapshot, state, finished); }
    return res;
  }
  const res = {
    correct: g.correct,
    timeout: timedOut,
    mistakes,
    maxMistakes: row.mode === 'exam' ? snapshot.settings.maxMistakes : null,
    willRepeat: row.mode === 'teaching' && !g.correct,
  };
  // W teście nauczającym uczeń od razu poznaje poprawną odpowiedź (i wyjaśnienie nauczyciela).
  // W egzaminie – tylko informacja dobrze/źle, bez zdradzania odpowiedzi.
  if (row.mode === 'teaching') {
    res.parts = g.parts;
    if (!g.correct) { res.solution = g.solution; res.explanation = q.explanation || null; }
  } else if (g.parts && (g.parts.tooShort || g.parts.tooLong)) res.parts = { tooShort: g.parts.tooShort, tooLong: g.parts.tooLong };
  if (finished) {
    const fresh = one('SELECT * FROM test_attempts WHERE id = ?', row.id);
    res.finished = true;
    res.summary = finish(fresh, snapshot, state, finished);
  }
  return res;
}

/* ---------- Zakończenie: wynik, ocena, nauczyciel, punkty ---------- */
function finish(row, snapshot, state, status) {
  const t = now();
  const total = snapshot.questions.length;
  const score = snapshot.questions.filter((q) => state.firstTry[q.id] === true).length;
  let points = 0, firstPass = 0, sentToTeacher = false, gradeVal = null, gotPoints = 0;
  const mistakes = row.mode === 'quiz' ? total - score : row.mistakes;
  if (row.mode === 'quiz') gradeVal = gradeFor(total ? (score / total) * 100 : 0, snapshot.settings.gradeScale);
  if (!row.preview && (status === 'passed' || status === 'completed')) {
    const prev = one(`SELECT COUNT(*) n, COALESCE(SUM(points), 0) pts FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0 AND status = ? AND id != ?`,
      row.user_id, row.activity_id, status, row.id);
    firstPass = prev.n === 0 ? 1 : 0;
    const P = snapshot.settings.points;
    let why;
    if (row.mode === 'quiz') {
      // liczy się najlepsza ocena: za poprawę dostajesz różnicę, za słabszy wynik nic nie tracisz
      points = Math.max(0, RULES.gradePoints[gradeVal - 1] - prev.pts);
      why = `Sprawdzian (ocena ${gradeVal})`;
    } else if (status === 'passed') {
      points = firstPass ? P.examFirst : P.examRepeat;
      sentToTeacher = !!firstPass;
      why = firstPass ? 'Zaliczony test egzaminacyjny' : 'Powtórka testu egzaminacyjnego';
    } else { points = firstPass ? P.teachingFirst : 0; why = 'Ukończony test nauczający'; }
    // Wynik na profilu ucznia. Pierwsze zaliczenie egzaminu trafia do nauczyciela bezpośrednio;
    // powtórka egzaminu nie jest wysyłana; test nauczający i sprawdzian – tylko gdy uczeń udostępnia wyniki.
    run(`INSERT INTO results (student_id, activity_id, subject_id, score, max_score, completed_at, shared_with_teacher, direct_to_teacher, mistakes, attempt_id, grade)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    row.user_id, row.activity_id, snapshot.subjectId, score, total, t,
    status === 'completed' ? 1 : (sentToTeacher ? 1 : 0), sentToTeacher ? 1 : 0, mistakes, row.id, gradeVal);
    if (points > 0) gotPoints = addPoints(row.user_id, points, `${why}: ${snapshot.title}`, { activityId: row.activity_id, attemptId: row.id, source: 'test' });
  }
  run('UPDATE test_attempts SET status = ?, finished_at = ?, score = ?, total = ?, points = ?, first_pass = ?, mistakes = ?, grade = ?, state_json = ? WHERE id = ?',
    status, t, score, total, points, firstPass, mistakes, gradeVal, JSON.stringify(state), row.id);
  const sum = summaryOf(one('SELECT * FROM test_attempts WHERE id = ?', row.id), snapshot);
  if (gotPoints > points) { sum.starBonus = gotPoints - points; sum.points = gotPoints; }
  // Ranking testu: 100% na 1. miejscu → Wygrani (×2 nagrody)
  if (!row.preview && (status === 'passed' || status === 'completed')) {
    try {
      const won = processTestWinners(row.activity_id);
      if (won.includes(row.user_id)) sum.rankingWinner = true;
    } catch (e) { console.error('[EDUKRO] Ranking testu:', e.message); }
  }
  // Nagroda za test (raz na ucznia): ukończony test nauczający, zaliczony egzamin, sprawdzian od wybranej oceny.
  if (!row.preview) {
    const act = one('SELECT * FROM activities WHERE id = ?', row.activity_id);
    const cur = act ? parseDoc(act).settings : null;
    const r = cur?.reward;
    const earned = r && (row.mode === 'quiz' ? (gradeVal || 0) >= (cur.rewardMinGrade || 4) : (row.mode === 'exam' ? status === 'passed' : status === 'completed'));
    if (earned && notify(row.user_id, { kind: 'reward', title: `Nagroda za „${snapshot.title}”`, body: `Gratulacje – ${gfor(one('SELECT first_name, gender FROM users WHERE id = ?', row.user_id), 'zdobyłeś', 'zdobyłaś')} nagrodę! Kliknij „Odbierz nagrodę”.`, reward: r, link: null, dedupe: `reward:${row.activity_id}:${row.user_id}` })) {
      sum.reward = { label: rewardLabel(r), waiting: true };
    }
  }
  return sum;
}

/** Wyniki sprawdzianu w podziale na kategorie + lista pytań (bez poprawnych odpowiedzi). */
function quizDetails(row, snapshot) {
  let state = {};
  try { state = JSON.parse(row.state_json); } catch { state = {}; }
  const ft = state.firstTry || {};
  const cats = snapshot.settings.categories || [];
  const byCat = new Map(cats.map((c) => [c.id, { id: c.id, name: c.name, total: 0, correct: 0 }]));
  const other = { id: '', name: 'Bez kategorii', total: 0, correct: 0 };
  for (const q of snapshot.questions) {
    const b = byCat.get(q.cat) || other;
    b.total++;
    if (ft[q.id] === true) b.correct++;
  }
  const categories = [...byCat.values(), other].filter((c) => c.total).map((c) => ({ ...c, pct: Math.round((c.correct / c.total) * 100) }));
  const weak = categories.filter((c) => c.pct < RULES.weakCategoryPct).sort((a, b) => a.pct - b.pct).map((c) => c.name);
  const review = (state.queue || snapshot.questions.map((_, i) => i)).map((qi, n) => {
    const q = snapshot.questions[qi];
    return { n: n + 1, prompt: clean(q.prompt).slice(0, 160), type: q.type, correct: ft[q.id] === true, answered: ft[q.id] !== undefined, cat: byCat.get(q.cat)?.name || null };
  });
  return { categories, weak, review, abandoned: !!state.abandoned };
}

export function summaryOf(row, snapshot) {
  const s = {
    status: row.status, mode: row.mode, preview: !!row.preview, score: row.score, total: row.total ?? snapshot.questions.length,
    mistakes: row.mistakes, maxMistakes: row.mode === 'exam' ? snapshot.settings.maxMistakes : null,
    points: row.points, firstPass: !!row.first_pass, sentToTeacher: row.mode === 'exam' && !!row.first_pass && row.status === 'passed',
    retryAt: null, balance: null,
  };
  if (!row.preview && row.mode === 'exam' && row.finished_at) {
    if (row.status === 'failed' || row.status === 'abandoned') s.retryAt = row.finished_at + RULES.examFailCooldownMin * MIN;
    if (row.status === 'passed') s.retryAt = row.finished_at + RULES.examRepeatDays * DAY;
  }
  if (row.mode === 'quiz' && row.status !== 'active') {
    Object.assign(s, quizDetails(row, snapshot));
    s.grade = row.grade;
    s.gradeName = row.grade ? GRADE_NAMES[row.grade - 1] : null;
    s.pct = s.total ? Math.round(((row.score || 0) / s.total) * 100) : 0;
    s.gradePoints = RULES.gradePoints;
    if (!row.preview) {
      const used = one(`SELECT COUNT(*) n FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0 AND status IN ('completed','passed','failed')`, row.user_id, row.activity_id).n;
      s.attemptsUsed = used;
      s.attemptsLeft = Math.max(0, RULES.quizMaxAttempts - used);
      s.bestGrade = one(`SELECT MAX(grade) g FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0`, row.user_id, row.activity_id).g;
      s.deadline = snapshot.settings.deadline || null;
    }
  }
  if (!row.preview) s.balance = pointsBalance(row.user_id);
  return s;
}

/** Przerwanie: egzamin liczy się jak przegrany (20 min przerwy), sprawdzian jest oceniany (nieodpowiedziane = błędne),
 *  test nauczający po prostu się kończy. */
export function abandon(id, user) {
  return tx(() => {
    const { row, snapshot, state } = loadAttempt(id, user);
    if (row.status !== 'active') return summaryOf(row, snapshot);
    if (row.mode === 'quiz' && !row.preview) {
      state.abandoned = true;
      state.current = null;
      return finish(row, snapshot, state, 'completed');
    }
    const status = row.mode === 'exam' && !row.preview ? 'failed' : 'abandoned';
    run('UPDATE test_attempts SET status = ?, finished_at = ? WHERE id = ?', status, now(), id);
    return summaryOf(one('SELECT * FROM test_attempts WHERE id = ?', id), snapshot);
  });
}

/** Koło ratunkowe na bieżące pytanie (w sprawdzianie – tylko raz na całe podejście). */
export function useLifeline(id, user) {
  return tx(() => {
    const { row, snapshot, state } = loadAttempt(id, user);
    if (row.status !== 'active') throw new HttpError(409, 'Ten test jest już zakończony.');
    const c = state.current;
    if (!c) throw new HttpError(409, 'Odśwież widok testu.');
    if (c.assist) return { assist: c.assist, note: c.assistNote, left: row.preview ? null : itemQty(user.id, 'lifeline') };
    if (row.mode === 'quiz' && state.lifelineUsed) throw new HttpError(409, 'W sprawdzianie koło ratunkowe można użyć tylko raz.');
    if (c.deadline && now() > c.deadline) throw new HttpError(409, 'Czas na to pytanie już minął.');
    const r = assist(snapshot.questions[c.qi], c.key, c.view);
    if (!r.ok) throw new HttpError(422, r.reason, { notUsable: true });
    if (!row.preview && (user.role !== 'student' || !takeItem(user.id, 'lifeline', 1))) {
      throw new HttpError(409, 'Nie masz koła ratunkowego – kupisz je w sklepie EDUKRO.', { noLifeline: true });
    }
    c.assist = r.assist;
    c.assistNote = r.note;
    state.lifelineUsed = true;
    saveState(row.id, state);
    return { assist: r.assist, note: r.note, left: row.preview ? null : itemQty(user.id, 'lifeline') };
  });
}
