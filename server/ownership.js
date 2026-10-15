// Materiały z samouczka i uprawnienia do usuwania.
// • Lekcji i testu z samouczka nie da się opublikować – można je usunąć albo skopiować.
// • Kopię materiału z samouczka można opublikować dopiero po wprowadzeniu zmian w treści.
// • Nauczyciel usuwa tylko materiały, które sam utworzył; administrator – wszystkie.
import { sha256 } from './security.js';
import { HttpError } from './http.js';
import { one } from './db.js';
import { gfor } from '../public/js/shared/gender.js';

const stripIds = (x) => (Array.isArray(x) ? x.map(stripIds)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : x);
/** Odcisk treści (slajdów albo pytań) – bez identyfikatorów, żeby kopia miała ten sam odcisk co oryginał. */
export const contentFp = (items) => sha256(JSON.stringify(stripIds(items || [])));

export function lockOf(a, items) {
  if (a.tutorial) return 'tutorial';
  if (a.copy_fp && a.copy_fp === contentFp(items)) return 'copy';
  return null;
}
const WORD = { lesson: ['lekcja', 'lekcji', 'lekcję'], test: ['test', 'testu', 'test'] };
export function lockMessage(lock, what = 'lesson') {
  const [nom, gen] = WORD[what];
  if (lock === 'tutorial') return `To ${what === 'lesson' ? 'lekcja' : 'test'} z samouczka – nie można ${what === 'lesson' ? 'jej' : 'go'} opublikować uczniom. Kliknij „Kopiuj”, wprowadź w kopii choć małą zmianę i opublikuj kopię.`;
  if (lock === 'copy') return `To niezmieniona kopia ${gen} z samouczka. Zmień w ${what === 'lesson' ? 'niej' : 'nim'} coś w treści (choćby jedno słowo), a potem ${what === 'lesson' ? 'ją' : 'go'} opublikuj.`;
  return `${nom} nie może być opublikowany.`;
}
export function assertPublishable(a, items, what) {
  const lock = lockOf(a, items);
  if (lock) throw new HttpError(422, lockMessage(lock, what), { locked: lock, problems: [{ level: 'error', msg: lockMessage(lock, what), where: 'settings', field: 'tutorial' }] });
}
/** Odcisk dla kopii: kopia materiału z samouczka (albo jego wciąż niezmienionej kopii) dziedziczy blokadę do pierwszej zmiany. */
export const copyFpFor = (a, items) => (lockOf(a, items) ? contentFp(items) : null);

export function canDelete(user, a) {
  return user.role === 'admin' || (a.created_by != null && a.created_by === user.id);
}
export function assertCanDelete(user, a, what = 'lesson') {
  if (canDelete(user, a)) return;
  const author = a.created_by ? one('SELECT first_name, last_name, role, gender FROM users WHERE id = ?', a.created_by) : null;
  const who = !author || author.role === 'admin' ? 'administrator' : `${author.first_name} ${author.last_name}`;
  const verb = !author || author.role === 'admin' ? 'utworzył' : gfor(author, 'utworzył', 'utworzyła');
  throw new HttpError(403, `${what === 'lesson' ? 'Tę lekcję' : 'Ten test'} ${verb} ${who}. Usunąć ${what === 'lesson' ? 'ją' : 'go'} może tylko autor albo administrator.`);
}
export function authorName(a) {
  const author = a.created_by ? one('SELECT first_name, last_name, role FROM users WHERE id = ?', a.created_by) : null;
  return author ? (author.role === 'admin' ? 'Administrator' : `${author.first_name} ${author.last_name}`) : null;
}
