// Klasy szkolne (np. „7b”) – wspólne dla panelu administratora, lekcji i serwera.
export const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const SECTIONS = ['a', 'b', 'c', 'd', 'e', 'f'];
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };

/** „7b”, „7 B”, „VII b”, „7-b” → { grade: '7', section: 'b' }; nieczytelne → null. */
export function parseClass(label) {
  const s = String(label ?? '').toLowerCase().replace(/[\s.\-_/]/g, '').replace(/^klasa/, '');
  if (!s) return null;
  let m = /^([1-8])([a-h])?$/.exec(s);
  if (m) return { grade: m[1], section: m[2] || '' };
  m = /^(viii|vii|vi|iv|v|iii|ii|i)([a-h])?$/.exec(s);
  if (m) return { grade: String(ROMAN[m[1]]), section: m[2] || '' };
  return null;
}
export const classLabel = (grade, section) => (grade ? `${grade}${section || ''}` : '');
export const className = (grade, section) => (grade ? `klasa ${grade}${section || ''}` : 'bez klasy');
/** Czy wpis z rejestru (np. „7b”) należy do klasy grade+section. */
export function inClass(label, grade, section) {
  const c = parseClass(label);
  return !!c && c.grade === String(grade) && (!section || c.section === section);
}
