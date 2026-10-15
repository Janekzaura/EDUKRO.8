import { one, all } from '../db.js';
import { pointsBalance } from '../points.js';
import { DEFAULT_THEME } from '../../public/js/shared/shop.js';
import { maskEmail } from '../security.js';
import { HttpError } from '../http.js';
import { genderOf } from '../../public/js/shared/gender.js';
import { card } from '../profile.js';

export const KINDS = ['lesson', 'teaching_test', 'exam_test', 'quiz', 'game'];
export const ACCENTS = ['copper', 'chlorophyll', 'amber', 'violet', 'rose', 'sky', 'teal', 'coral'];
export const MOTIFS = ['hex', 'leaf', 'orbit', 'grid', 'book', 'speech', 'column', 'globe', 'code', 'gear', 'notes', 'palette', 'shield', 'heart', 'compass', 'none'];

/** Dane konta bezpieczne do przekazania przeglądarce (nigdy hasz kodu). */
export function publicUser(u) {
  if (!u) return { role: 'guest' };
  return {
    id: u.id,
    role: u.role,
    firstName: u.first_name,
    lastName: u.last_name,
    greetingName: u.greeting_name || u.first_name,
    gender: genderOf(u),
    genderSet: u.gender === 'm' || u.gender === 'f',
    status: u.status,
    mustChangeCode: u.must_change_code === 1,
    initialCode: u.must_change_code === 2,
    email: u.role === 'student' ? maskEmail(u.email) : undefined,
    notifyOptIn: u.role === 'student' ? !!u.notify_opt_in : undefined,
    points: u.role === 'student' ? pointsBalance(u.id) : undefined,
    theme: u.role === 'student' ? themeJson(u.theme_json) : undefined,
    homeroomClass: u.role === 'teacher' ? u.homeroom_class || null : undefined,
    tutorial: tutorialState(u.tutorial_json),
    card: u.role === 'student' ? card(u) : undefined,
    rankingsOn: u.role === 'student' ? u.rankings_on !== 0 : undefined,
  };
}
function tutorialState(j) {
  try { const t = j ? JSON.parse(j) : {}; return { done: Array.isArray(t.done) ? t.done : [], offered: !!t.offered, off: !!t.off }; }
  catch { return { done: [], offered: false, off: false }; }
}
function themeJson(j) {
  try { return { ...DEFAULT_THEME, ...(j ? JSON.parse(j) : {}) }; } catch { return { ...DEFAULT_THEME }; }
}

export function teachersForSubject(subjectId) {
  return all(`SELECT u.id, u.first_name AS firstName, u.last_name AS lastName FROM teacher_subjects ts
              JOIN users u ON u.id = ts.teacher_id WHERE ts.subject_id = ? AND u.status = 'active'
              ORDER BY u.last_name`, subjectId);
}

export function subjectRow(s) {
  return {
    id: s.id, slug: s.slug, name: s.name, description: s.description,
    accent: s.accent, motif: s.motif, isAvailable: !!s.is_available,
  };
}

export function publishedCounts(subjectId) {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const r of all(`SELECT kind, COUNT(*) n FROM activities WHERE subject_id = ? AND status = 'published' AND (expires_at IS NULL OR expires_at > ?) GROUP BY kind`, subjectId, Date.now())) out[r.kind] = r.n;
  return out;
}

export function slugify(name) {
  const map = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return name.toLocaleLowerCase('pl-PL').replace(/[ąćęłńóśźż]/g, (c) => map[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'przedmiot';
}

/** Zasady kodów dostępu. */
export function validateStudentCode(code, minLen) {
  const c = String(code ?? '');
  if (c.length < minLen) throw new HttpError(400, `Kod dostępu musi mieć co najmniej ${minLen} znaków.`);
  if (c.length > 64) throw new HttpError(400, 'Kod dostępu może mieć maksymalnie 64 znaki.');
  if (/^(.)\1+$/.test(c)) throw new HttpError(400, 'Kod nie może składać się z jednego powtórzonego znaku.');
  if ('01234567890123456789'.includes(c) || '98765432109876543210'.includes(c) || 'abcdefghijklmnopqrstuvwxyz'.includes(c.toLowerCase())) {
    throw new HttpError(400, 'Kod nie może być prostym ciągiem kolejnych znaków.');
  }
  return c;
}
export function validateDigitsCode(code, length) {
  const c = String(code ?? '');
  if (!new RegExp(`^\\d{${length}}$`).test(c)) throw new HttpError(400, `Kod musi składać się z ${length} cyfr.`);
  if (/^(\d)\1+$/.test(c)) throw new HttpError(400, 'Kod nie może składać się z jednej powtórzonej cyfry.');
  if ('01234567890123456789'.includes(c) || '98765432109876543210'.includes(c)) {
    throw new HttpError(400, 'Kod nie może być ciągiem kolejnych cyfr.');
  }
  return c;
}

export function getSubjectOr404(slugOrId, { includeHidden = false } = {}) {
  const s = typeof slugOrId === 'number'
    ? one('SELECT * FROM subjects WHERE id = ?', slugOrId)
    : one('SELECT * FROM subjects WHERE slug = ?', slugOrId);
  if (!s || (!includeHidden && !s.is_available)) throw new HttpError(404, 'Nie znaleziono przedmiotu.');
  return s;
}
