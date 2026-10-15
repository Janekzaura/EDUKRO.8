// Nagrody punktowe ustawiane przez administratora: punkty za oceny ze sprawdzianu, punkty z lekcji
// (koło fortuny, gry) i domyślne punkty dla nowych testów. Zapisane w tabeli meta.
// Wartości trafiają do wspólnych obiektów reguł (RULES, AWARD, DEFAULT_SETTINGS), z których korzysta reszta kodu.
import { one, run } from './db.js';
import { HttpError } from './http.js';
import { RULES, DEFAULT_SETTINGS } from '../public/js/shared/quiz-rules.js';
import { AWARD } from '../public/js/shared/lesson-rules.js';

export const POINT_DEFAULTS = Object.freeze({
  grades: [1, 5, 12, 22, 35, 50], wheel: 10, gameWin: 5, gameDraw: 2, teachingFirst: 20, examFirst: 100, examRepeat: 10,
  lessonStar: 100, schoolStar: 300,
});
export const POINT_MAX = 10000;
const SCALARS = ['wheel', 'gameWin', 'gameDraw', 'teachingFirst', 'examFirst', 'examRepeat', 'lessonStar', 'schoolStar'];

export function pointRules() {
  let saved = {};
  try { saved = JSON.parse(one("SELECT value FROM meta WHERE key = 'point_rules'")?.value || '{}'); } catch { saved = {}; }
  const out = { grades: [...POINT_DEFAULTS.grades] };
  if (Array.isArray(saved.grades) && saved.grades.length === 6 && saved.grades.every((x) => Number.isInteger(x) && x >= 0 && x <= POINT_MAX)) out.grades = saved.grades;
  for (const k of SCALARS) out[k] = Number.isInteger(saved[k]) && saved[k] >= 0 && saved[k] <= POINT_MAX ? saved[k] : POINT_DEFAULTS[k];
  return out;
}

export function applyPointRules(r = pointRules()) {
  RULES.gradePoints.splice(0, RULES.gradePoints.length, ...r.grades);
  Object.assign(AWARD, { wheel: r.wheel, gameWin: r.gameWin, gameDraw: r.gameDraw, lessonStar: r.lessonStar, schoolStar: r.schoolStar });
  Object.assign(DEFAULT_SETTINGS.points, { teachingFirst: r.teachingFirst, examFirst: r.examFirst, examRepeat: r.examRepeat });
  return r;
}

const int = (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > POINT_MAX) throw new HttpError(400, `${label}: wpisz liczbę od 0 do ${POINT_MAX}.`);
  return n;
};
const LABELS = { wheel: 'Koło fortuny', gameWin: 'Wygrana w grze', gameDraw: 'Remis w grze', teachingFirst: 'Test nauczający', examFirst: 'Egzamin – pierwsze zaliczenie', examRepeat: 'Egzamin – powtórka', lessonStar: 'Gwiazda lekcji', schoolStar: 'Gwiazda szkoły' };

export function setPointRules(body) {
  if (body?.reset === true) {
    run("DELETE FROM meta WHERE key = 'point_rules'");
    return applyPointRules();
  }
  const cur = pointRules();
  const next = { ...cur };
  if (body.grades !== undefined) {
    if (!Array.isArray(body.grades) || body.grades.length !== 6) throw new HttpError(400, 'Podaj punkty za każdą ocenę od 1 do 6.');
    next.grades = body.grades.map((v, i) => int(v, `Ocena ${i + 1}`));
  }
  for (const k of SCALARS) if (body[k] !== undefined) next[k] = int(body[k], LABELS[k]);
  run("INSERT INTO meta (key, value) VALUES ('point_rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(next));
  return applyPointRules(next);
}

applyPointRules();
