// Nagrody punktowe ustawione przez administratora (z /api/status) → wspólne reguły w przeglądarce.
import { RULES, DEFAULT_SETTINGS } from './shared/quiz-rules.js';
import { AWARD } from './shared/lesson-rules.js';

export function applyPointRules(r) {
  if (!r) return;
  if (Array.isArray(r.grades) && r.grades.length === 6) RULES.gradePoints.splice(0, RULES.gradePoints.length, ...r.grades);
  for (const k of ['wheel', 'gameWin', 'gameDraw', 'lessonStar', 'schoolStar']) if (Number.isInteger(r[k])) AWARD[k] = r[k];
  for (const k of ['teachingFirst', 'examFirst', 'examRepeat']) if (Number.isInteger(r[k])) DEFAULT_SETTINGS.points[k] = r[k];
}
