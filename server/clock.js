// Czas szkoły (Europe/Warsaw): dzień, tydzień „gwiazd” kończący się w piątek o 16:00.
const TZ = 'Europe/Warsaw';
const DAY = 86400e3;
export const STAR_HOUR = 16; // piątek, 16:00 – koniec tygodnia Gwiazdy szkoły

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
/** Części daty w czasie polskim. */
export function warsawParts(t = Date.now()) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second, wd };
}
/** Moment (UTC ms) odpowiadający podanemu czasowi lokalnemu w Warszawie. */
export function warsawTime(y, m, d, hh = 0, mm = 0) {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = warsawParts(guess);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Date.UTC(y, m - 1, d, hh, mm);
    if (!diff) break;
    guess -= diff;
  }
  return guess;
}
export const dayKeyOf = (t = Date.now()) => { const p = warsawParts(t); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
export function dayStart(t = Date.now()) { const p = warsawParts(t); return warsawTime(p.y, p.m, p.d, 0, 0); }

/** Klucz tygodnia gwiazd = data piątku, w którym tydzień się kończy (piątek 16:00). */
export function cycleKey(t = Date.now()) {
  const p = warsawParts(t);
  let ahead = (5 - p.wd + 7) % 7; // dni do piątku
  if (ahead === 0 && p.hh >= STAR_HOUR) ahead = 7; // piątek po 16:00 → już następny tydzień
  const base = Date.UTC(p.y, p.m - 1, p.d) + ahead * DAY;
  const f = new Date(base);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}
/** Koniec tygodnia o danym kluczu (piątek 16:00 czasu polskiego). */
export function cycleEnd(key) {
  const [y, m, d] = key.split('-').map(Number);
  return warsawTime(y, m, d, STAR_HOUR, 0);
}
export function nextCycleKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d) + 7 * DAY);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}
export function prevCycleKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d) - 7 * DAY);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}
