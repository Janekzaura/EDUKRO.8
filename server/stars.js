// Gwiazda lekcji i Gwiazda szkoły.
//  • Na koniec lekcji nauczyciel wybiera najaktywniejszą osobę: +100 pkt (punkty z lekcji) i gwiazdka w rankingu tygodnia.
//  • W piątek o 16:00 osoba z największą liczbą gwiazdek (przy remisie – wszystkie) zostaje Gwiazdą szkoły:
//    tytuł, punkty i ×1,2 za wszystkie zdobywane punkty – do następnego piątku (chyba że wygra znowu).
import { one, all, run, now } from './db.js';
import { HttpError } from './http.js';
import { awardClassPoints } from './points.js';
import { notify, gfor, authorPhrase } from './notify.js';
import { AWARD } from '../public/js/shared/lesson-rules.js';
import { cycleKey, cycleEnd, nextCycleKey } from './clock.js';
import { card } from './profile.js';
import { titleText } from '../public/js/shared/shop.js';

export function giveLessonStar({ lesson, classLabel, registryId, by, runKey }) {
  const t = now();
  const key = cycleKey(t);
  const rk = `${lesson.id}:${runKey}`;
  if (one('SELECT 1 FROM lesson_stars WHERE run_key = ?', rk)) throw new HttpError(409, 'Gwiazda tej lekcji została już wybrana.');
  const reg = one('SELECT id, first_name, last_name FROM registry WHERE id = ?', registryId);
  if (!reg) throw new HttpError(404, 'Nie znaleziono ucznia.');
  const pts = AWARD.lessonStar || 0;
  run('INSERT INTO lesson_stars (lesson_id, class_label, registry_id, by_user, cycle_key, run_key, points, created_at) VALUES (?,?,?,?,?,?,?,?)',
    lesson.id, classLabel, reg.id, by, key, rk, pts, t);
  if (pts) awardClassPoints(reg.id, pts, `Gwiazda lekcji „${lesson.title}”`, { activityId: lesson.id, by, runKey: `star:${rk}` });
  const stars = one('SELECT COUNT(*) n FROM lesson_stars WHERE registry_id = ? AND cycle_key = ?', reg.id, key).n;
  const u = one("SELECT id, first_name, gender FROM users WHERE registry_id = ? AND role = 'student'", reg.id);
  if (u) {
    notify(u.id, {
      kind: 'lesson_star', title: `Jesteś gwiazdą lekcji „${lesson.title}”!`,
      body: `${authorPhrase(by, 'wybrał')} Cię najaktywniejszą osobą na lekcji. ${pts ? `+${pts} pkt czeka w skrzynce. ` : ''}Gwiazdki w tym tygodniu: ${stars}. W piątek o 16:00 osoba z największą liczbą gwiazdek zostaje Gwiazdą szkoły!`,
      link: '/ranking', dedupe: `lesson-star:${rk}`,
    });
  }
  return { ok: true, points: pts, stars, name: `${reg.first_name} ${reg.last_name}`, hasAccount: !!u };
}

/** Rozdanie tytułów za zakończone tygodnie (wywoływane co kilka minut – bezpieczne do powtarzania). */
export function awardSchoolStars(t = now()) {
  const keys = all('SELECT DISTINCT cycle_key AS k FROM lesson_stars').map((r) => r.k).filter((k) => cycleEnd(k) <= t);
  let awarded = 0;
  for (const key of keys) {
    const done = `school_star:${key}`;
    if (one('SELECT 1 FROM meta WHERE key = ?', done)) continue;
    // osoby, które wyłączyły udział w rankingach, nie walczą o tytuł Gwiazdy szkoły (punkty za gwiazdki lekcji i tak dostają)
    const rows = all(`SELECT s.registry_id AS rid, COUNT(*) AS n FROM lesson_stars s LEFT JOIN users u ON u.registry_id = s.registry_id AND u.role = 'student'
                      WHERE s.cycle_key = ? AND (u.id IS NULL OR u.rankings_on = 1) GROUP BY s.registry_id ORDER BY n DESC`, key);
    const top = rows.length ? rows[0].n : 0;
    const until = cycleEnd(nextCycleKey(key));
    for (const r of rows.filter((x) => x.n === top && top > 0)) {
      const ins = run('INSERT OR IGNORE INTO school_stars (registry_id, cycle_key, stars, until, created_at) VALUES (?,?,?,?,?)', r.rid, key, r.n, until, t);
      if (!ins.changes) continue;
      awarded++;
      const pts = AWARD.schoolStar || 0;
      if (pts) awardClassPoints(r.rid, pts, `Gwiazda szkoły – tydzień do ${key}`, { runKey: `school-star:${key}:${r.rid}` });
      const u = one("SELECT id, first_name, gender FROM users WHERE registry_id = ? AND role = 'student'", r.rid);
      if (u && until > t) {
        notify(u.id, {
          kind: 'school_star', title: `${gfor(u, 'Zostałeś', 'Zostałaś')} Gwiazdą szkoły!`,
          body: `Najwięcej gwiazdek lekcji w tym tygodniu (${r.n}). Masz tytuł „${titleText('school-star', gfor(u, 'm', 'f'))}”${pts ? `, +${pts} pkt w skrzynce` : ''} i ×1,2 za wszystkie zdobywane punkty – do następnego piątku, 16:00. Zbieraj gwiazdki dalej, żeby go utrzymać!`,
          link: '/ranking', dedupe: `school-star:${key}:${u.id}`,
        });
      }
    }
    run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', done, String(t));
  }
  return awarded;
}

/** Aktualne Gwiazdy szkoły (tytuł ważny do piątku 16:00). */
export function currentSchoolStars(t = now()) {
  const rows = all(`SELECT s.registry_id AS rid, MAX(s.until) AS until, MAX(s.stars) AS stars, r.first_name, r.last_name, r.class_label, u.id AS uid
                    FROM school_stars s JOIN registry r ON r.id = s.registry_id LEFT JOIN users u ON u.registry_id = r.id AND u.role = 'student'
                    WHERE s.until > ? GROUP BY s.registry_id ORDER BY stars DESC`, t);
  return rows.map((r) => {
    const u = r.uid ? one('SELECT u.*, rr.class_label FROM users u LEFT JOIN registry rr ON rr.id = u.registry_id WHERE u.id = ?', r.uid) : null;
    return { until: r.until, stars: r.stars, card: u ? card(u) : null, name: { firstName: r.first_name, lastName: r.last_name, classLabel: r.class_label } };
  });
}
