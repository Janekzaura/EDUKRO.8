// Rankingi EDUKRO.
//  • Ranking testu: najlepszy wynik każdej osoby (pierwsza, która go osiągnęła, jest wyżej).
//    Kto pierwszy ma 100% na 1. miejscu, przechodzi na zawsze do „Wygranych” (×2 nagrody za ukończenie)
//    i nie wraca już do rankingu tego testu – o 1. miejsce walczą dalej pozostali.
//  • Ranking ogólny (ostatnie 30 dni): najaktywniejsi, najwięcej punktów, najlepsze oceny ze sprawdzianów,
//    najwięcej wygranych testów. Ponad 3 dni na 1. miejscu → wyjątkowy tytuł (tylko stąd) + koło fortuny.
//  • Gwiazdy lekcji – ranking tygodnia (do piątku 16:00).
import { one, all, run, now } from './db.js';
import { notify, gfor } from './notify.js';
import { grantItem, itemQty } from './shop/store.js';
import { card } from './profile.js';
import { parseDoc } from './quiz/attempts.js';
import { RULES } from '../public/js/shared/quiz-rules.js';
import { titleText } from '../public/js/shared/shop.js';
import { cycleKey, cycleEnd } from './clock.js';
import { currentSchoolStars } from './stars.js';

const DAY = 86400e3;
export const WINDOW_DAYS = 30;
export const REIGN_DAYS = 3;
const TEST_KINDS = ['teaching_test', 'exam_test', 'quiz'];

const STUDENT_COLS = `u.id, u.first_name, u.last_name, u.gender, u.registry_id, u.profile_json, r.class_label`;
const studentRows = (ids) => {
  if (!ids.length) return new Map();
  const rows = all(`SELECT ${STUDENT_COLS} FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id IN (${ids.map(() => '?').join(',')})`, ...ids);
  return new Map(rows.map((u) => [u.id, card(u)]));
};

/* ================= Ranking testu ================= */
/** Najlepszy wynik każdego ucznia (procent) i moment, w którym pierwszy raz go osiągnął. */
export function bestResults(activityId) {
  const a = one('SELECT kind FROM activities WHERE id = ?', activityId);
  if (!a || !TEST_KINDS.includes(a.kind)) return [];
  const status = a.kind === 'exam_test' ? "('passed')" : "('completed')";
  const rows = all(`SELECT ta.user_id AS userId, ta.score, ta.total, ta.finished_at AS at FROM test_attempts ta JOIN users u ON u.id = ta.user_id
                    WHERE ta.activity_id = ? AND ta.preview = 0 AND u.role = 'student' AND u.status != 'blocked' AND u.rankings_on = 1
                    AND ta.status IN ${status} AND ta.total > 0 AND ta.finished_at IS NOT NULL ORDER BY ta.finished_at`, activityId);
  const best = new Map();
  for (const r of rows) {
    const pct = Math.round(((r.score || 0) * 100) / r.total);
    const cur = best.get(r.userId);
    if (!cur || pct > cur.pct) best.set(r.userId, { userId: r.userId, pct, score: r.score, total: r.total, at: r.at });
  }
  return [...best.values()].sort((x, y) => y.pct - x.pct || x.at - y.at);
}

/** Punkty za ukończenie testu (tyle samo dostaje zwycięzca jako bonus – razem ×2). */
export function completionPoints(a) {
  const s = parseDoc(a).settings;
  if (a.kind === 'quiz') return RULES.gradePoints[5] || 0;
  return a.kind === 'exam_test' ? s.points.examFirst : s.points.teachingFirst;
}

/** Po każdym zakończonym podejściu: osoby ze 100% na 1. miejscu przechodzą do „Wygranych”. Zwraca nowych zwycięzców. */
export function processTestWinners(activityId) {
  const a = one('SELECT * FROM activities WHERE id = ?', activityId);
  if (!a || !TEST_KINDS.includes(a.kind) || a.tutorial) return [];
  const winners = new Set(all('SELECT user_id FROM test_winners WHERE activity_id = ?', a.id).map((x) => x.user_id));
  const out = [];
  for (const r of bestResults(a.id)) {
    if (winners.has(r.userId)) continue;
    if (r.pct < 100) break; // 1. miejsce bez 100% – nikt (jeszcze) nie przechodzi do Wygranych
    const bonus = completionPoints(a);
    run('INSERT OR IGNORE INTO test_winners (activity_id, user_id, pct, bonus, won_at) VALUES (?,?,?,?,?)', a.id, r.userId, r.pct, bonus, now());
    winners.add(r.userId);
    const u = one('SELECT first_name, gender FROM users WHERE id = ?', r.userId);
    notify(r.userId, {
      kind: 'winner', title: `${gfor(u, 'Wygrałeś', 'Wygrałaś')} ranking testu „${a.title}”!`,
      body: `100% i 1. miejsce – ${gfor(u, 'trafiłeś', 'trafiłaś')} na zawsze do Wygranych. ${bonus ? `Nagroda za ukończenie ×2: odbierz dodatkowe +${bonus} pkt.` : ''}`.trim(),
      points: bonus, link: `/uczen/test/${a.id}`, dedupe: `winner:${a.id}:${r.userId}`,
    });
    out.push(r.userId);
  }
  return out;
}

export function testRanking(activityId, meId = null, limit = 20) {
  const winRows = all('SELECT user_id AS userId, pct, won_at AS at FROM test_winners WHERE activity_id = ? ORDER BY won_at', activityId);
  const winSet = new Set(winRows.map((w) => w.userId));
  const rest = bestResults(activityId).filter((r) => !winSet.has(r.userId));
  let rank = 0, prev = null;
  const ranked = rest.map((r, i) => { if (!prev || prev.pct !== r.pct) rank = i + 1; prev = r; return { ...r, rank }; });
  const show = ranked.slice(0, limit);
  const ids = [...new Set([...winRows.map((w) => w.userId), ...show.map((r) => r.userId), ...(meId ? [meId] : [])])];
  const cards = studentRows(ids);
  const mine = meId ? (winSet.has(meId) ? { winner: true } : ranked.find((r) => r.userId === meId) || null) : null;
  return {
    winners: winRows.map((w, i) => ({ place: i + 1, pct: w.pct, at: w.at, card: cards.get(w.userId) })).filter((x) => x.card),
    rows: show.map((r) => ({ rank: r.rank, pct: r.pct, at: r.at, card: cards.get(r.userId) })).filter((x) => x.card),
    total: ranked.length,
    me: mine ? (mine.winner ? { winner: true } : { rank: mine.rank, pct: mine.pct }) : null,
  };
}

/* ================= Ranking ogólny ================= */
export const CATEGORIES = [
  { id: 'aktywnosc', label: 'Najaktywniejsi', unit: 'ukończonych testów', title: 'lider-aktywnosci', icon: 'flame', desc: 'Ukończone testy nauczające, egzaminy i sprawdziany z ostatnich 30 dni.' },
  { id: 'punkty', label: 'Najwięcej punktów', unit: 'pkt', title: 'lider-punktow', icon: 'star', desc: 'Punkty zdobyte w ostatnich 30 dniach (testy, lekcje, nagrody – bez zwrotów).' },
  { id: 'oceny', label: 'Najlepsze oceny', unit: 'średnia', title: 'lider-ocen', icon: 'quiz', desc: 'Średnia z najlepszych ocen ze sprawdzianów z ostatnich 30 dni.' },
  { id: 'wygrane', label: 'Najwięcej wygranych', unit: 'wygranych testów', title: 'lider-wygranych', icon: 'trophy', desc: 'Testy, w których ktoś trafił do Wygranych (100% i 1. miejsce) w ostatnich 30 dniach.' },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

function scores(cat, t = now()) {
  const from = t - WINDOW_DAYS * DAY;
  const base = "u.role = 'student' AND u.status != 'blocked' AND u.rankings_on = 1"; // tylko osoby biorące udział w rankingach
  if (cat === 'aktywnosc') {
    return all(`SELECT ta.user_id AS userId, COUNT(*) AS v, MAX(ta.finished_at) AS last FROM test_attempts ta JOIN users u ON u.id = ta.user_id
                WHERE ${base} AND ta.preview = 0 AND ta.status IN ('passed','completed','failed') AND ta.finished_at >= ? GROUP BY ta.user_id`, from);
  }
  if (cat === 'punkty') {
    const own = all(`SELECT p.student_id AS userId, SUM(p.amount) AS v, MAX(p.created_at) AS last FROM points_ledger p JOIN users u ON u.id = p.student_id
                     WHERE ${base} AND p.amount > 0 AND p.created_at >= ? AND COALESCE(p.source, '') NOT IN ('refund') GROUP BY p.student_id`, from);
    const cls = all(`SELECT u.id AS userId, SUM(c.amount) AS v, MAX(c.claimed_at) AS last FROM class_points c JOIN users u ON u.registry_id = c.registry_id
                     WHERE ${base} AND c.amount > 0 AND c.claimed_at >= ? GROUP BY u.id`, from);
    const m = new Map();
    for (const r of [...own, ...cls]) { const x = m.get(r.userId) || { userId: r.userId, v: 0, last: 0 }; x.v += r.v; x.last = Math.max(x.last, r.last || 0); m.set(r.userId, x); }
    return [...m.values()];
  }
  if (cat === 'oceny') {
    const rows = all(`SELECT ta.user_id AS userId, ta.activity_id AS aid, MAX(ta.grade) AS g, MAX(ta.finished_at) AS last FROM test_attempts ta JOIN users u ON u.id = ta.user_id
                      WHERE ${base} AND ta.preview = 0 AND ta.mode = 'quiz' AND ta.grade IS NOT NULL AND ta.finished_at >= ? GROUP BY ta.user_id, ta.activity_id`, from);
    const m = new Map();
    for (const r of rows) { const x = m.get(r.userId) || { userId: r.userId, sum: 0, n: 0, last: 0 }; x.sum += r.g; x.n++; x.last = Math.max(x.last, r.last); m.set(r.userId, x); }
    return [...m.values()].map((x) => ({ userId: x.userId, v: Math.round((x.sum / x.n) * 100) / 100, n: x.n, last: x.last }));
  }
  if (cat === 'wygrane') {
    return all(`SELECT w.user_id AS userId, COUNT(*) AS v, MAX(w.won_at) AS last FROM test_winners w JOIN users u ON u.id = w.user_id
                WHERE ${base} AND w.won_at >= ? GROUP BY w.user_id`, from);
  }
  return [];
}
/** Kolejność: wartość malejąco; przy remisie – kto wcześniej to osiągnął (dla ocen: więcej sprawdzianów). */
function ordered(cat, t) {
  const rows = scores(cat, t).filter((r) => r.v > 0);
  rows.sort((a, b) => b.v - a.v || (b.n || 0) - (a.n || 0) || a.last - b.last);
  let rank = 0, prev = null;
  return rows.map((r, i) => { if (prev === null || prev !== r.v) rank = i + 1; prev = r.v; return { ...r, rank }; });
}

/** Ranking ogólny: punkty za miejsca we wszystkich czterech kategoriach (1. miejsce = 10 pkt … 10. miejsce = 1 pkt). */
export const OVERALL = { id: 'ogolny', label: 'Ogólny', unit: 'pkt rankingu', icon: 'trophy', desc: 'Suma miejsc ze wszystkich rankingów z ostatnich 30 dni: 1. miejsce = 10 pkt rankingu, 2. = 9 pkt … 10. = 1 pkt.' };
function overall(t) {
  const m = new Map();
  for (const c of CATEGORIES) {
    for (const r of ordered(c.id, t)) {
      if (r.rank > 10) break;
      const x = m.get(r.userId) || { userId: r.userId, v: 0, best: 99, last: 0 };
      x.v += 11 - r.rank; x.best = Math.min(x.best, r.rank); x.last = Math.max(x.last, r.last || 0);
      m.set(r.userId, x);
    }
  }
  const rows = [...m.values()].sort((a, b) => b.v - a.v || a.best - b.best || a.last - b.last);
  let rank = 0, prev = null;
  return rows.map((r, i) => { if (prev !== r.v) rank = i + 1; prev = r.v; return { ...r, rank }; });
}

export function rankings(me = null, { limit = 10 } = {}) {
  maybeCheckLeaders();
  const t = now();
  if (me && me.rankings_on === 0) me = null; // osoba, która nie bierze udziału, nie ma „swojego miejsca”
  const leaders = Object.fromEntries(all('SELECT * FROM ranking_leaders').map((l) => [l.category, l]));
  const cats = [OVERALL, ...CATEGORIES].map((c) => {
    const rows = c.id === 'ogolny' ? overall(t) : ordered(c.id, t);
    const top = rows.slice(0, limit);
    const ids = [...new Set([...top.map((r) => r.userId), ...(me ? [me.id] : [])])];
    const cards = studentRows(ids);
    const mine = me ? rows.find((r) => r.userId === me.id) : null;
    const L = leaders[c.id];
    return {
      id: c.id, label: c.label, unit: c.unit, icon: c.icon, desc: c.desc,
      titleName: c.title ? { m: titleText(c.title, 'm'), f: titleText(c.title, 'f') } : null,
      rows: top.map((r) => ({ rank: r.rank, value: r.v, card: cards.get(r.userId) })).filter((x) => x.card),
      me: mine ? { rank: mine.rank, value: mine.v } : null,
      leader: L && L.user_id ? { userId: L.user_id, since: L.since, days: Math.floor((t - L.since) / DAY), rewarded: !!L.rewarded_at, rewardAt: L.since + REIGN_DAYS * DAY } : null,
    };
  });
  return { categories: cats, stars: starRows(me, limit), schoolStars: currentSchoolStars(), windowDays: WINDOW_DAYS, reignDays: REIGN_DAYS };
}

/** Gwiazdy lekcji w bieżącym tygodniu (do piątku 16:00) – osoby z rejestru, także bez konta. */
export function starRows(me = null, limit = 10) {
  const key = cycleKey();
  const rows = all(`SELECT s.registry_id AS rid, COUNT(*) AS n, MAX(s.created_at) AS last, r.first_name, r.last_name, r.class_label,
                      u.id AS uid FROM lesson_stars s JOIN registry r ON r.id = s.registry_id
                      LEFT JOIN users u ON u.registry_id = r.id AND u.role = 'student'
                    WHERE s.cycle_key = ? AND (u.id IS NULL OR u.rankings_on = 1) GROUP BY s.registry_id ORDER BY n DESC, last ASC`, key);
  let rank = 0, prev = null;
  const ranked = rows.map((r, i) => { if (prev !== r.n) rank = i + 1; prev = r.n; return { ...r, rank }; });
  const cards = studentRows(ranked.filter((r) => r.uid).map((r) => r.uid));
  const out = ranked.slice(0, limit).map((r) => ({
    rank: r.rank, value: r.n, card: r.uid ? cards.get(r.uid) : null,
    name: { firstName: r.first_name, lastName: r.last_name, classLabel: r.class_label },
  }));
  const mine = me?.registry_id ? ranked.find((r) => r.rid === me.registry_id) : null;
  return { cycleKey: key, endsAt: cycleEnd(key), rows: out, me: mine ? { rank: mine.rank, value: mine.n } : null };
}

/* ---------- Liderzy: ponad 3 dni na 1. miejscu ---------- */
let lastCheck = 0;
export function maybeCheckLeaders(force = false) {
  const t = now();
  if (!force && t - lastCheck < 60e3) return;
  lastCheck = t;
  try { checkLeaders(t); } catch (e) { console.error('[EDUKRO] Ranking:', e.message); }
}

export function checkLeaders(t = now()) {
  for (const c of CATEGORIES) {
    const rows = ordered(c.id, t);
    const cur = one('SELECT * FROM ranking_leaders WHERE category = ?', c.id);
    if (!rows.length) { if (cur) run('DELETE FROM ranking_leaders WHERE category = ?', c.id); continue; }
    const top = rows.filter((r) => r.rank === 1).map((r) => r.userId);
    // przy remisie na 1. miejscu prowadzi dotychczasowy lider
    const leader = cur && top.includes(cur.user_id) ? cur.user_id : top[0];
    if (!cur || cur.user_id !== leader) {
      run(`INSERT INTO ranking_leaders (category, user_id, since, rewarded_at) VALUES (?,?,?,NULL)
           ON CONFLICT(category) DO UPDATE SET user_id = excluded.user_id, since = excluded.since, rewarded_at = NULL`, c.id, leader, t);
      continue;
    }
    if (cur.rewarded_at || t - cur.since <= REIGN_DAYS * DAY) continue;
    // nagroda: tytuł dostępny tylko z rankingu + koło fortuny 100–750 pkt
    const key = `title:${c.title}`;
    if (!itemQty(leader, key)) grantItem(leader, key, 1, { max: 1 });
    const u = one('SELECT first_name, gender FROM users WHERE id = ?', leader);
    notify(leader, {
      kind: 'leader', title: `Ponad ${REIGN_DAYS} dni na 1. miejscu: ${c.label}!`,
      body: `${gfor(u, 'Zdobyłeś', 'Zdobyłaś')} wyjątkowy tytuł „${titleText(c.title, gfor(u, 'm', 'f'))}” – można go mieć tylko dzięki rankingowi. Ustaw go w sklepie („Mój profil”). Do tego kręcisz kołem fortuny: 100–750 pkt!`,
      reward: { type: 'wheel' }, link: '/ranking', dedupe: `leader:${c.id}:${leader}:${cur.since}`,
    });
    run('UPDATE ranking_leaders SET rewarded_at = ? WHERE category = ?', t, c.id);
  }
}
