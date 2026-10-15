// Profil ucznia: awatar, ramka, tytuł, muzyka, efekt świętowania – wybierane z posiadanych przedmiotów.
// Karta osoby (do rankingów i podglądu profilu).
import { one, all, run, now } from './db.js';
import { HttpError } from './http.js';
import { DEFAULT_PROFILE, PROFILE_PARTS, itemOf, isDefault, titleText } from '../public/js/shared/shop.js';
import { genderOf } from '../public/js/shared/gender.js';
import { parseClass } from '../public/js/shared/classes.js';

export function profileOf(u) {
  let p = {};
  try { p = u?.profile_json ? JSON.parse(u.profile_json) : {}; } catch { p = {}; }
  const out = { ...DEFAULT_PROFILE };
  for (const part of PROFILE_PARTS) if (itemOf(`${part.kind}:${p[part.key]}`)) out[part.key] = p[part.key];
  return out;
}

export function ownedSet(userId) {
  return new Set(all("SELECT item FROM inventory WHERE user_id = ? AND qty > 0 AND item LIKE '%:%'", userId).map((r) => r.item));
}

/** Zapis profilu: tylko posiadane (albo domyślne) przedmioty. */
export function saveProfile(u, body) {
  const owned = ownedSet(u.id);
  const cur = profileOf(u);
  const next = { ...cur };
  for (const part of PROFILE_PARTS) {
    if (body?.[part.key] === undefined) continue;
    const v = String(body[part.key]);
    const key = `${part.kind}:${v}`;
    const it = itemOf(key);
    if (!it) throw new HttpError(400, 'Nieprawidłowy wybór.');
    if (!isDefault(key) && !owned.has(key)) throw new HttpError(403, it.tier === 'exclusive' ? 'Ten tytuł zdobywa się tylko w rankingu ogólnym.' : `Najpierw kup „${it.name}” w sklepie.`);
    next[part.key] = v;
  }
  run('UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ?', JSON.stringify(next), now(), u.id);
  return next;
}

/** Do kiedy osoba z rejestru jest Gwiazdą szkoły (0 = nie jest). */
export function schoolStarUntil(registryId, t = now()) {
  if (!registryId) return 0;
  return one('SELECT MAX(until) u FROM school_stars WHERE registry_id = ? AND until > ?', registryId, t)?.u || 0;
}

const classOf = (label) => { const c = parseClass(label); return c && c.section ? `${c.grade}${c.section}` : null; };

/** Publiczna karta ucznia: imię, klasa, awatar, ramka, tytuł, muzyka – bez danych prywatnych. */
export function card(u) {
  if (!u) return null;
  const p = profileOf(u);
  const gender = genderOf(u);
  const reg = u.class_label !== undefined ? { class_label: u.class_label } : (u.registry_id ? one('SELECT class_label FROM registry WHERE id = ?', u.registry_id) : null);
  const starUntil = schoolStarUntil(u.registry_id);
  return {
    id: u.id, firstName: u.first_name, lastName: u.last_name, gender, classLabel: classOf(reg?.class_label),
    avatar: p.avatar, frame: p.frame, music: p.music, cele: p.cele, titleId: p.title,
    title: titleText(p.title, gender), schoolStar: starUntil ? { until: starUntil, title: titleText('school-star', gender) } : null,
  };
}
export function cardById(userId) {
  const u = one(`SELECT u.*, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id = ? AND u.role = 'student'`, userId);
  return u ? card(u) : null;
}
