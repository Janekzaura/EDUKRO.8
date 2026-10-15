// Testy wersji 0.5: profil (awatary, ramki, tytuły, muzyka, efekty), pakiety administratora, rankingi testów
// (Wygrani ×2), ranking ogólny (lider > 3 dni → tytuł + koło fortuny), Gwiazda lekcji / szkoły (×1,2),
// szybkie dodawanie uczniów do rejestru.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v5-'));
fs.writeFileSync(path.join(tmp, '.env'), [
  'EDUKRO_ENV=development', 'EDUKRO_INIT_TEACHER_CODE=1111', 'EDUKRO_INIT_ADMIN_CODE=0907',
  'EDUKRO_DEV_MAIL=1', `EDUKRO_DATA_DIR=${tmp}`,
].join('\n'));
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

let base, server, dbm;
const DAY = 86400e3;

function client() {
  const jar = {};
  return async function call(method, url, body) {
    const headers = { 'Content-Type': 'application/json', 'X-EDUKRO': '1' };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

before(async () => {
  dbm = await import('../server/db.js');
  const demo = await import('../server/quiz/demo.js');
  const { createApp } = await import('../server/index.js');
  dbm.seed();
  demo.seedDemo();
  demo.seedDemoV3();
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const login = {
  async admin() { const c = client(); assert.equal((await c('POST', '/api/auth/admin/login', { code: '0907' })).status, 200); return c; },
  async teacher() { const c = client(); assert.equal((await c('POST', '/api/auth/teacher/login', { teacherId: 1, code: '1111' })).status, 200); return c; },
};
async function student(first, last, pin, cls = '7a', approve = true) {
  const a = await login.admin();
  if (!dbm.one('SELECT 1 FROM registry WHERE name_key = ?', dbm.nameKey(first, last))) {
    await a('POST', '/api/admin/registry', { firstName: first, lastName: last, grade: cls[0], section: cls[1] });
  }
  const c = client();
  assert.equal((await c('POST', '/api/register/start', { firstName: first, lastName: last })).status, 200);
  const r = await c('POST', '/api/register/complete', { code: pin, codeRepeat: pin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (approve) assert.equal((await a('POST', `/api/admin/accounts/${r.body.user.id}/approve`)).status, 200);
  return { c, id: r.body.user.id };
}
const give = (userId, amount, source = 'admin') => dbm.run('INSERT INTO points_ledger (student_id, amount, reason, created_at, source) VALUES (?,?,?,?,?)', userId, amount, 'test', Date.now(), source);
const balance = async (c) => (await c('GET', '/api/session')).body.user.points;

test('profil: zakup i ustawienie awatara, ramki, tytułu, muzyki; tytuł z rankingu nie do kupienia', async () => {
  const s = await student('Olek', 'Profilowy', '4821');
  give(s.id, 5000);
  const shop = (await s.c('GET', '/api/shop')).body;
  assert.ok(shop.catalog.avatars.length >= 20);
  assert.ok(shop.catalog.frames.some((f) => f.id === 'can' && f.tier === 'premium'));
  assert.ok(shop.catalog.music.length >= 6);
  assert.equal(shop.catalog.titles.find((t) => t.id === 'lider-punktow').price, null);
  assert.deepEqual(shop.profile, { avatar: 'letter', frame: 'none', title: 'none', music: 'calm', cele: 'confetti' });
  // bez zakupu nie da się ustawić
  assert.equal((await s.c('PUT', '/api/me/profile', { profile: { avatar: 'rocket' } })).status, 403);
  for (const item of ['avatar:rocket', 'frame:scooter', 'title:hulajnoga', 'music:arcade', 'cele:gold']) {
    const r = await s.c('POST', '/api/shop/buy', { item });
    assert.equal(r.status, 200, `${item}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await s.c('POST', '/api/shop/buy', { item: 'title:lider-punktow' })).status, 403);
  const p = await s.c('PUT', '/api/me/profile', { profile: { avatar: 'rocket', frame: 'scooter', title: 'hulajnoga', music: 'arcade', cele: 'gold' } });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.card.title, 'Mistrz hulajnogi');
  assert.equal(p.body.card.frame, 'scooter');
  const sess = (await s.c('GET', '/api/session')).body.user;
  assert.equal(sess.card.avatar, 'rocket');
  // podgląd profilu dla innej osoby (nauczyciel)
  const t = await login.teacher();
  const prof = await t('GET', `/api/profiles/${s.id}`);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.card.music, 'arcade');
  assert.equal(prof.body.card.title, 'Mistrz hulajnogi');
});

test('pakiety administratora: cena za całość, uczeń płaci proporcjonalnie za brakujące', async () => {
  const a = await login.admin();
  const bad = await a('POST', '/api/admin/shop/packs', { name: 'Zły', items: ['lifeline', 'music:lofi'], price: 100 });
  assert.equal(bad.status, 400);
  const r = await a('POST', '/api/admin/shop/packs', { name: 'Pakiet muzyczny', description: 'Trzy utwory', items: ['music:lofi', 'music:kosmos', 'music:jazz'], price: 420 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const packId = r.body.pack.id;
  const s = await student('Ala', 'Pakietowa', '5821');
  give(s.id, 2000);
  assert.equal((await s.c('POST', '/api/shop/buy', { item: 'music:jazz' })).status, 200);
  const shop = (await s.c('GET', '/api/shop')).body;
  const pk = shop.catalog.packs.find((x) => x.id === packId);
  assert.deepEqual(pk.missing.sort(), ['music:kosmos', 'music:lofi']);
  assert.equal(pk.price, Math.round(420 * 400 / 650)); // 200+200 z 650
  const before = await balance(s.c);
  assert.equal((await s.c('POST', '/api/shop/buy', { item: `pack:${packId}` })).status, 200);
  assert.equal(await balance(s.c), before - pk.price);
  assert.equal((await s.c('POST', '/api/shop/buy', { item: `pack:${packId}` })).status, 409);
  // wyłączony pakiet znika ze sklepu
  assert.equal((await a('PUT', `/api/admin/shop/packs/${packId}`, { active: false })).status, 200);
  assert.ok(!(await s.c('GET', '/api/shop')).body.catalog.packs.some((x) => x.id === packId));
});

test('ranking testu: 100% na 1. miejscu → Wygrani (×2 nagrody), kolejni walczą dalej', async () => {
  const rk = await import('../server/rankings.js');
  const test1 = dbm.one("SELECT * FROM activities WHERE kind = 'teaching_test' AND status = 'published' ORDER BY id LIMIT 1");
  const A = await student('Wiktor', 'Rankingowy', '6821');
  const B = await student('Basia', 'Rankingowa', '6822');
  const C = await student('Celina', 'Rankingowa', '6823');
  const add = (uid, score, total, at) => dbm.run(`INSERT INTO test_attempts (activity_id, user_id, mode, preview, status, snapshot_json, state_json, score, total, started_at, finished_at)
    VALUES (?,?, 'teaching', 0, 'completed', '{}', '{}', ?, ?, ?, ?)`, test1.id, uid, score, total, at - 1000, at);
  const t0 = Date.now() - 10000;
  add(B.id, 8, 10, t0);
  add(A.id, 10, 10, t0 + 1000);
  add(C.id, 10, 10, t0 + 2000);
  const won = rk.processTestWinners(test1.id);
  assert.deepEqual(won, [A.id, C.id]);
  const r = await B.c('GET', `/api/tests/${test1.id}/ranking`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.winners.map((w) => w.card.id), [A.id, C.id]);
  assert.deepEqual(r.body.rows.map((x) => x.card.id), [B.id]);
  assert.equal(r.body.me.rank, 1);
  // zwycięzca dostaje drugie tyle punktów (×2) w skrzynce
  const inbox = (await A.c('GET', '/api/inbox')).body.items;
  const w = inbox.find((x) => x.kind === 'winner');
  assert.ok(w && w.points > 0, 'powiadomienie o wygranej z punktami');
  assert.equal((await A.c('GET', `/api/tests/${test1.id}/ranking`)).body.me.winner, true);
  // ponowne przeliczenie nie dubluje
  assert.deepEqual(rk.processTestWinners(test1.id), []);
});

test('ranking ogólny: lider ponad 3 dni → wyjątkowy tytuł i koło fortuny 100–750', async () => {
  const rk = await import('../server/rankings.js');
  const L = await student('Leon', 'Liderski', '7821');
  give(L.id, 99999, 'test');
  rk.checkLeaders(Date.now());
  const row = dbm.one("SELECT * FROM ranking_leaders WHERE category = 'punkty'");
  assert.equal(row.user_id, L.id);
  assert.equal(row.rewarded_at, null);
  dbm.run("UPDATE ranking_leaders SET since = ? WHERE category = 'punkty'", Date.now() - 4 * DAY);
  rk.checkLeaders(Date.now());
  assert.ok(dbm.one("SELECT rewarded_at FROM ranking_leaders WHERE category = 'punkty'").rewarded_at);
  assert.equal(dbm.one("SELECT qty FROM inventory WHERE user_id = ? AND item = 'title:lider-punktow'", L.id)?.qty, 1);
  const note = (await L.c('GET', '/api/inbox')).body.items.find((x) => x.kind === 'leader');
  assert.equal(note.reward.type, 'wheel');
  // „odbierz wszystko” pomija koło – kręci się osobno
  const all = await L.c('POST', '/api/inbox/claim-all');
  assert.equal(all.status, 200);
  const spin = await L.c('POST', '/api/inbox/claim', { id: note.id });
  assert.equal(spin.status, 200, JSON.stringify(spin.body));
  assert.ok(spin.body.wheel.segments.includes(spin.body.wheel.amount));
  assert.ok(spin.body.wheel.amount >= 100 && spin.body.wheel.amount <= 750);
  // tytuł z rankingu można ustawić
  const p = await L.c('PUT', '/api/me/profile', { profile: { title: 'lider-punktow' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.card.title, 'Król punktów');
  const r = (await L.c('GET', '/api/rankings')).body;
  assert.equal(r.categories.length, 5); // ogólny + 4 kategorie
  assert.equal(r.categories.find((c) => c.id === 'punkty').rows[0].card.id, L.id);
});

test('gwiazda lekcji (+100) i Gwiazda szkoły w piątek o 16:00 (×1,2 punktów)', async () => {
  const stars = await import('../server/stars.js');
  const clock = await import('../server/clock.js');
  const t = await login.teacher();
  const lesson = dbm.one("SELECT id FROM activities WHERE kind = 'lesson' AND status = 'published' ORDER BY id LIMIT 1");
  const S = await student('Gabi', 'Gwiazdowa', '8821');
  const rid = dbm.one('SELECT registry_id FROM users WHERE id = ?', S.id).registry_id;
  const other = dbm.one("SELECT id FROM registry WHERE class_label = '7a' AND id != ? ORDER BY id LIMIT 1", rid).id;
  const r1 = await t('POST', `/api/editor/lessons/${lesson.id}/star`, { classLabel: '7a', registryId: rid, runKey: 'run-abc-1' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.points, 100);
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/star`, { classLabel: '7a', registryId: rid, runKey: 'run-abc-1' })).status, 409);
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/star`, { classLabel: '7a', registryId: rid, runKey: 'run-abc-2' })).status, 200);
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/star`, { classLabel: '7a', registryId: other, runKey: 'run-abc-3' })).status, 200);
  // osoba spoza klasy – odmowa
  const outsider = dbm.run("INSERT INTO registry (first_name, last_name, name_key, class_label, created_at, updated_at) VALUES ('Ktoś','Inny','ktoś|inny','6b',1,1)").lastInsertRowid;
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/star`, { classLabel: '7a', registryId: Number(outsider), runKey: 'run-abc-4' })).status, 400);
  const week = (await S.c('GET', '/api/rankings')).body.stars;
  assert.equal(week.rows[0].value, 2);
  assert.equal(week.me.rank, 1);
  // koniec tygodnia
  const key = clock.cycleKey();
  const awarded = stars.awardSchoolStars(clock.cycleEnd(key) + 1000);
  assert.equal(awarded, 1);
  assert.equal(stars.awardSchoolStars(clock.cycleEnd(key) + 2000), 0); // bez dublowania
  const row = dbm.one('SELECT * FROM school_stars WHERE registry_id = ?', rid);
  assert.ok(row.until > Date.now());
  const sess = (await S.c('GET', '/api/session')).body.user;
  assert.equal(sess.card.schoolStar.title, 'Gwiazda szkoły');
  // ×1,2 za zdobyte punkty
  const pts = await import('../server/points.js');
  const got = pts.addPoints(S.id, 100, 'Test bonusu', { source: 'test' });
  assert.equal(got, 120);
  assert.equal(pts.addPoints(S.id, 100, 'Zwrot', { source: 'refund' }), 100);
});

test('szybkie dodawanie uczniów do rejestru (cała klasa naraz, bez duplikatów)', async () => {
  const a = await login.admin();
  const r = await a('POST', '/api/admin/registry/bulk', { grade: '5', section: 'c', people: [
    { firstName: 'Jan', lastName: 'Nowy' }, { firstName: 'Anna Maria', lastName: 'Nowa' }, { firstName: 'Jan', lastName: 'Nowy' },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 2);
  assert.deepEqual(r.body.skipped, ['Jan Nowy']);
  assert.equal(r.body.classLabel, '5c');
  assert.equal((await a('POST', '/api/admin/registry/bulk', { grade: '', section: '', people: [{ firstName: 'X', lastName: 'Y' }] })).status, 400);
  const reg = (await a('GET', '/api/admin/registry')).body.registry.filter((x) => x.classLabel === '5c');
  assert.equal(reg.length, 2);
});

test('udział w rankingach: domyślnie tak; po wyłączeniu osoby nie ma w rankingach ani w Wygranych', async () => {
  const rk = await import('../server/rankings.js');
  const A = await student('Rafał', 'Bezrankingowy', '9821');
  give(A.id, 88888, 'test');
  let r = (await A.c('GET', '/api/rankings')).body;
  assert.equal(r.participating, true);
  assert.equal(r.categories[0].id, 'ogolny');
  assert.ok(r.categories.find((c) => c.id === 'punkty').rows.some((x) => x.card.id === A.id));
  assert.ok(r.categories[0].rows.some((x) => x.card.id === A.id), 'ranking ogólny liczy miejsca z kategorii');
  const off = await A.c('PUT', '/api/me/preferences', { rankingsOn: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.user.rankingsOn, false);
  r = (await A.c('GET', '/api/rankings')).body;
  assert.equal(r.participating, false);
  assert.ok(!r.categories.find((c) => c.id === 'punkty').rows.some((x) => x.card.id === A.id));
  assert.equal(r.categories[0].me, null);
  const test1 = dbm.one("SELECT * FROM activities WHERE kind = 'teaching_test' AND status = 'published' ORDER BY id DESC LIMIT 1");
  dbm.run(`INSERT INTO test_attempts (activity_id, user_id, mode, preview, status, snapshot_json, state_json, score, total, started_at, finished_at)
    VALUES (?,?, 'teaching', 0, 'completed', '{}', '{}', 5, 5, ?, ?)`, test1.id, A.id, Date.now() - 2000, Date.now() - 1000);
  assert.ok(!rk.processTestWinners(test1.id).includes(A.id));
  assert.equal((await A.c('PUT', '/api/me/preferences', { rankingsOn: true })).status, 200);
  assert.ok(rk.processTestWinners(test1.id).includes(A.id));
});
