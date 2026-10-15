// Skrzynka powiadomień EDUKRO: zatwierdzenie konta, nowe testy i lekcje, punkty i nagrody do odebrania,
// kończące się testy tymczasowe, pochwały, promocje – oraz sprawy dla nauczycieli i administratora.
import crypto from 'node:crypto';
import { one, all, run, now, tx } from './db.js';
import { HttpError } from './http.js';
import { addPoints, unclaimedClassPoints, pointsBalance, starBoostActive, STAR_BOOST } from './points.js';
import { grantItem, itemQty } from './shop/store.js';
import { itemName, basePrice } from './shop/pricing.js';
import { itemOf, isDefault } from '../public/js/shared/shop.js';
import { parseClass } from '../public/js/shared/classes.js';
import { genderOf, gfor } from '../public/js/shared/gender.js';
export { genderOf, gfor };

const MIN = 60e3, HOUR = 3600e3;
/** Koło fortuny (nagroda za ponad 3 dni na 1. miejscu w rankingu ogólnym): 100–750 pkt. */
export const WHEEL_SEGMENTS = [100, 150, 200, 250, 300, 400, 500, 750];

/** Jedno powiadomienie; dedupe chroni przed dublowaniem (np. ponowna publikacja testu). */
export function notify(userId, { kind, title, body = '', link = null, points = 0, reward = null, dedupe = null }) {
  const r = run(`INSERT INTO notifications (user_id, kind, title, body, link, points, reward_json, dedupe, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe) DO NOTHING`,
  userId, kind, String(title).slice(0, 200), String(body || '').slice(0, 600), link, Math.max(0, Math.round(points || 0)), reward ? JSON.stringify(reward) : null, dedupe, now());
  return r.changes > 0;
}

/** Klasa ucznia z rejestru, np. „7a” (albo null). */
export function classOfUser(u) {
  const reg = u.registry_id ? one('SELECT class_label FROM registry WHERE id = ?', u.registry_id) : null;
  const c = parseClass(reg?.class_label);
  return c && c.section ? `${c.grade}${c.section}` : null;
}

/** Konta uczniów (bez zablokowanych); classes = ['7a', …] albo null = wszyscy. */
export function studentsFor(classes = null) {
  const rows = all(`SELECT u.id, u.registry_id, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id
                    WHERE u.role = 'student' AND u.status != 'blocked'`);
  if (!classes) return rows;
  if (classes.includes('*')) return rows;
  const set = new Set(classes);
  return rows.filter((u) => { const c = parseClass(u.class_label); return c && set.has(`${c.grade}${c.section}`); });
}
export function notifyStudents(classes, note, dedupePrefix) {
  let n = 0;
  for (const s of studentsFor(classes)) if (notify(s.id, { ...note, dedupe: dedupePrefix ? `${dedupePrefix}:${s.id}` : null })) n++;
  return n;
}
export function notifyAdmins(note, dedupePrefix) {
  for (const a of all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")) notify(a.id, { ...note, dedupe: dedupePrefix ? `${dedupePrefix}:${a.id}` : null });
}

/** „Joanna Hyżorek dodała” / „Marek Nowak dodał” / „Administrator EDUKRO dodał”. */
export function authorPhrase(userId, verb = 'dodał') {
  const u = userId ? one('SELECT first_name, last_name, role, gender FROM users WHERE id = ?', userId) : null;
  if (!u || u.role === 'admin') return `Administrator EDUKRO ${verb}`;
  return `${u.first_name} ${u.last_name} ${genderOf(u) === 'f' ? verb.replace(/ł$/, 'ła') : verb}`;
}

/* ---------- Opis nagrody ---------- */
export function rewardLabel(r) {
  if (!r) return null;
  if (r.type === 'item') return itemName(r.item);
  if (r.type === 'promo') return `promocja −${r.off}% na: ${itemName(r.item)} (${hoursLabel(r.hours)})`;
  if (r.type === 'wheel') return 'koło fortuny: 100–750 pkt';
  return null;
}
export function hoursLabel(h) {
  if (h % 168 === 0) { const w = h / 168; return w === 1 ? '1 tydzień' : `${w} tyg.`; }
  if (h % 24 === 0) { const d = h / 24; return d === 1 ? '1 dzień' : `${d} dni`; }
  return h === 1 ? '1 godzina' : `${h} godz.`;
}

/* ---------- Przypomnienia o kończących się testach tymczasowych ---------- */
export function syncExpiring(user) {
  if (user.role !== 'student') return;
  const t = now();
  const tests = all(`SELECT id, title, kind, expires_at, COALESCE(published_at, updated_at) AS pub FROM activities
                     WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at > ? AND kind IN ('teaching_test','exam_test')`, t);
  for (const a of tests) {
    const life = Math.max(0, a.expires_at - a.pub);
    const windowMs = Math.min(24 * HOUR, Math.max(30 * MIN, life / 4));
    if (t < a.expires_at - windowMs) continue;
    const done = one(`SELECT 1 FROM test_attempts WHERE user_id = ? AND activity_id = ? AND preview = 0 AND status IN (?)`, user.id, a.id, a.kind === 'exam_test' ? 'passed' : 'completed');
    if (done) continue;
    // świeża informacja o nowym teście wystarczy – nie przypominamy w tej samej godzinie
    const fresh = one('SELECT created_at FROM notifications WHERE dedupe = ?', `test:${a.id}:${user.id}`);
    if (fresh && t - fresh.created_at < Math.min(HOUR, windowMs / 2)) continue;
    notify(user.id, {
      kind: 'expiring', title: `Test „${a.title}” wkrótce zniknie`, body: `Zostało ${leftLabel(a.expires_at - t)} – rozwiąż go, zanim zniknie z listy.`,
      link: `/uczen/test/${a.id}`, dedupe: `exp:${a.id}:${user.id}`,
    });
  }
}
export function leftLabel(ms) {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} godz.`;
  return `${Math.round(h / 24)} dni`;
}

/* ---------- Skrzynka ---------- */
function noteRow(n) {
  let reward = null;
  try { reward = n.reward_json ? JSON.parse(n.reward_json) : null; } catch { reward = null; }
  const claimable = (n.points > 0 || !!reward);
  return {
    id: `n${n.id}`, kind: n.kind, title: n.title, body: n.body, link: n.link, points: n.points,
    reward: reward ? { ...reward, label: rewardLabel(reward) } : null,
    claimable, claimed: !!n.claimed_at, read: !!n.read_at, createdAt: n.created_at,
  };
}
function classRow(c) {
  return {
    id: `c${c.id}`, kind: 'lesson_points', title: `+${c.amount} pkt z lekcji`, body: c.reason, link: null, points: c.amount,
    reward: null, claimable: true, claimed: false, read: false, createdAt: c.created_at,
  };
}

export function inboxFor(user, { limit = 100 } = {}) {
  syncExpiring(user);
  const notes = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', user.id, limit).map(noteRow);
  const cls = user.role === 'student' ? unclaimedClassPoints(user.id).map(classRow) : [];
  const items = [...cls, ...notes].sort((a, b) => (Number(b.claimable && !b.claimed) - Number(a.claimable && !a.claimed)) || b.createdAt - a.createdAt);
  return { items, ...summaryFor(user, { synced: true }) };
}

export function summaryFor(user, { synced = false } = {}) {
  if (!synced) syncExpiring(user);
  const unread = one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', user.id).n;
  const noteClaims = one('SELECT COUNT(*) n, COALESCE(SUM(points), 0) p FROM notifications WHERE user_id = ? AND claimed_at IS NULL AND (points > 0 OR reward_json IS NOT NULL)', user.id);
  const cls = user.role === 'student' ? unclaimedClassPoints(user.id) : [];
  return {
    unread: unread + cls.length,
    toClaim: noteClaims.n + cls.length,
    pointsToClaim: noteClaims.p + cls.reduce((s, c) => s + c.amount, 0),
  };
}

export function markRead(user, ids = null) {
  if (ids === null) return run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), user.id).changes;
  let n = 0;
  for (const raw of ids.slice(0, 200)) {
    const m = /^n(\d+)$/.exec(String(raw));
    if (m) n += run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now(), Number(m[1]), user.id).changes;
  }
  return n;
}

/** Odebranie punktów albo nagrody. Zwraca opis tego, co uczeń dostał. */
export function claim(user, rawId) {
  if (user.role !== 'student') throw new HttpError(403, 'Punkty i nagrody odbierają uczniowie.');
  const id = String(rawId || '');
  return tx(() => {
    const t = now();
    let m = /^c(\d+)$/.exec(id);
    if (m) {
      const u = one('SELECT registry_id FROM users WHERE id = ?', user.id);
      const c = one('SELECT * FROM class_points WHERE id = ? AND registry_id = ?', Number(m[1]), u?.registry_id ?? -1);
      if (!c) throw new HttpError(404, 'Nie znaleziono tych punktów.');
      if (c.claimed_at) throw new HttpError(409, 'Te punkty zostały już odebrane.');
      run('UPDATE class_points SET claimed_at = ? WHERE id = ?', t, c.id);
      let pts = c.amount;
      // Gwiazda szkoły: ×1,2 także za punkty z lekcji
      if (c.amount > 0 && starBoostActive(u.registry_id, t)) {
        const extra = Math.round(c.amount * (STAR_BOOST - 1));
        if (extra > 0) { addPoints(user.id, extra, `Bonus Gwiazdy szkoły ×${String(STAR_BOOST).replace('.', ',')} (lekcja)`, { source: 'star-bonus' }); pts += extra; }
      }
      return { points: pts, message: `+${pts} pkt`, balance: pointsBalance(user.id) };
    }
    m = /^n(\d+)$/.exec(id);
    const n = m ? one('SELECT * FROM notifications WHERE id = ? AND user_id = ?', Number(m[1]), user.id) : null;
    if (!n) throw new HttpError(404, 'Nie znaleziono tego powiadomienia.');
    if (n.claimed_at) throw new HttpError(409, 'To zostało już odebrane.');
    let reward = null;
    try { reward = n.reward_json ? JSON.parse(n.reward_json) : null; } catch { reward = null; }
    if (!n.points && !reward) throw new HttpError(400, 'Tu nie ma nic do odebrania.');
    const out = { points: 0, message: '', item: null, promo: null };
    if (n.points > 0) { const got = addPoints(user.id, n.points, `Skrzynka: ${n.title}`, { source: 'inbox' }); out.points += got; out.message = `+${got} pkt`; }
    if (reward?.type === 'item') {
      const it = itemOf(reward.item);
      const owned = it && (isDefault(reward.item) || itemQty(user.id, reward.item) > 0);
      if (it && !owned) { grantItem(user.id, reward.item, 1, { max: 1 }); out.item = reward.item; out.message = `Nowy przedmiot: ${itemName(reward.item)}`; }
      else {
        const pts = Math.max(10, Math.round((basePrice(reward.item) || 100) / 2));
        addPoints(user.id, pts, `Nagroda: ${itemName(reward.item)} (już ją masz – zamiast tego punkty)`, { source: 'inbox', noBoost: true });
        out.points += pts; out.message = `Masz już ${itemName(reward.item)} – zamiast tego +${pts} pkt`;
      }
    }
    if (reward?.type === 'promo') {
      const hours = Math.max(1, Math.min(24 * 30, Number(reward.hours) || 24));
      run('INSERT INTO shop_promos (item, off, starts_at, ends_at, user_id, note, created_at) VALUES (?,?,?,?,?,?,?)',
        reward.item, reward.off, t, t + hours * HOUR, user.id, `Nagroda: ${n.title}`.slice(0, 200), t);
      out.promo = { item: reward.item, off: reward.off, until: t + hours * HOUR };
      out.message = `Promocja −${reward.off}% na: ${itemName(reward.item)} – ważna ${hoursLabel(hours)}`;
    }
    if (reward?.type === 'wheel') {
      // wynik losuje serwer – przeglądarka tylko animuje koło do wylosowanego pola
      const index = crypto.randomInt(WHEEL_SEGMENTS.length);
      const amount = WHEEL_SEGMENTS[index];
      const got = addPoints(user.id, amount, `Koło fortuny: ${n.title}`, { source: 'wheel' });
      out.points += got;
      out.wheel = { index, segments: WHEEL_SEGMENTS, amount, got };
      out.message = `Koło fortuny: +${got} pkt`;
    }
    run('UPDATE notifications SET claimed_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ?', t, t, n.id);
    out.balance = pointsBalance(user.id);
    return out;
  });
}

/** „Odbierz wszystko” – bez kół fortuny (te kręci się osobno, żeby zobaczyć wynik). */
export function claimAll(user) {
  const ids = inboxFor(user, { limit: 500 }).items.filter((x) => x.claimable && !x.claimed && x.reward?.type !== 'wheel').map((x) => x.id);
  let points = 0; const messages = [];
  for (const i of ids) { const r = claim(user, i); points += r.points; if (r.item || r.promo) messages.push(r.message); }
  return { count: ids.length, points, messages, balance: pointsBalance(user.id) };
}
