// Płeć użytkownika – do poprawnych form („zrobiłeś” / „zrobiłaś”). Bez DOM, wspólne dla serwera i przeglądarki.
// Gdy nikt jej nie ustawił, zgadujemy z imienia (polskie imiona żeńskie kończą się zwykle na „a”).
const MALE_A = new Set(['kuba', 'barnaba', 'bonawentura', 'kosma', 'jarema', 'dyzma', 'sasza', 'nikita', 'ilja', 'zawisza', 'juda', 'boryna', 'luca', 'joshua', 'jona', 'jonasza', 'mustafa', 'andrea']);
const FEMALE_OTHER = new Set(['beatrycze', 'noemi', 'abigail', 'miriam', 'nel', 'inez', 'karmen', 'rut', 'ester', 'ingrid', 'carmen', 'nicole', 'michelle', 'vivien', 'dagmar', 'astrid', 'zoe', 'chloe', 'sophie', 'rachel', 'mercedes', 'ines', 'liv', 'ruth', 'esther', 'margit', 'alison', 'kim', 'nikol', 'iris', 'irys', 'lili', 'lilly', 'emili', 'emely', 'noelle', 'maite']);

export const GENDERS = [
  { key: 'm', label: 'Chłopiec / mężczyzna', short: 'on' },
  { key: 'f', label: 'Dziewczyna / kobieta', short: 'ona' },
];

export function guessGender(firstName) {
  const f = String(firstName || '').trim().split(/[\s-]+/)[0].toLocaleLowerCase('pl-PL');
  if (!f || f === 'administrator') return 'm';
  if (MALE_A.has(f)) return 'm';
  if (FEMALE_OTHER.has(f)) return 'f';
  return /a$/.test(f) ? 'f' : 'm';
}

/** Płeć konta: ustawiona ręcznie albo odgadnięta z imienia. Działa z wierszem bazy (first_name) i obiektem z API (firstName). */
export function genderOf(u) {
  if (!u) return 'm';
  if (u.gender === 'm' || u.gender === 'f') return u.gender;
  return guessGender(u.first_name ?? u.firstName);
}

/** Forma zależna od płci: g(u, 'zrobiłeś', 'zrobiłaś'). */
export const gfor = (u, m, f) => (genderOf(u) === 'f' ? f : m);
