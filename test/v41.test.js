// Testy wersji 0.4.1: płeć (formy), odejmowanie punktów, nagrody punktowe, prawa do usuwania,
// lekcje i testy z samouczka (bez publikacji, kopia po zmianach).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v41-'));
fs.writeFileSync(path.join(tmp, '.env'), [
  'EDUKRO_ENV=development', 'EDUKRO_INIT_TEACHER_CODE=1111', 'EDUKRO_INIT_ADMIN_CODE=0907',
  'EDUKRO_DEV_MAIL=1', `EDUKRO_DATA_DIR=${tmp}`,
].join('\n'));
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

let base, server, dbm;

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

test('płeć: odgadnięta z imienia, zmiana przez siebie i przez administratora', async () => {
  const t = await login.teacher();
  const me = await t('GET', '/api/session');
  assert.equal(me.body.user.firstName, 'Joanna');
  assert.equal(me.body.user.gender, 'f');
  assert.equal(me.body.user.genderSet, false);
  const s = await student('Kuba', 'Testowy', '4839');
  let u = (await s.c('GET', '/api/session')).body.user;
  assert.equal(u.gender, 'm', 'Kuba to imię męskie');
  assert.equal((await s.c('PUT', '/api/me/gender', { gender: 'f' })).status, 200);
  u = (await s.c('GET', '/api/session')).body.user;
  assert.equal(u.gender, 'f'); assert.equal(u.genderSet, true);
  const a = await login.admin();
  assert.equal((await a('PUT', `/api/admin/accounts/${s.id}/gender`, { gender: 'm' })).status, 200);
  assert.equal((await s.c('GET', '/api/session')).body.user.gender, 'm');
  assert.equal((await a('PUT', `/api/admin/accounts/${s.id}/gender`, { gender: 'x' })).status, 400);
  assert.equal((await s.c('PUT', `/api/admin/accounts/${s.id}/gender`, { gender: 'f' })).status, 403);
});

test('nagroda za test w formie żeńskiej dla uczennicy', async () => {
  const { notify } = await import('../server/notify.js');
  const { gfor } = await import('../public/js/shared/gender.js');
  assert.equal(gfor({ first_name: 'Ola' }, 'zdobyłeś', 'zdobyłaś'), 'zdobyłaś');
  assert.equal(gfor({ firstName: 'Jan' }, 'zdobyłeś', 'zdobyłaś'), 'zdobyłeś');
  assert.equal(gfor({ firstName: 'Ola', gender: 'm' }, 'zdobyłeś', 'zdobyłaś'), 'zdobyłeś');
  void notify;
});

test('administrator odejmuje punkty (saldo nie spada poniżej zera), nauczyciel nie może', async () => {
  const s = await student('Ola', 'Odejmowana', '5839');
  const a = await login.admin();
  assert.equal((await a('POST', '/api/grants', { studentIds: [s.id], amount: 50, message: 'na start' })).status, 200);
  assert.equal((await s.c('POST', '/api/inbox/claim-all')).status, 200);
  const before = (await s.c('GET', '/api/me/profile')).body.points.balance;
  assert.ok(before >= 50);
  const r = await a('POST', '/api/grants/deduct', { studentIds: [s.id], amount: 20, message: 'pomyłka' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.total, 20);
  assert.equal((await s.c('GET', '/api/me/profile')).body.points.balance, before - 20);
  const big = await a('POST', '/api/grants/deduct', { studentIds: [s.id], amount: 100000 });
  assert.equal(big.body.total, before - 20);
  assert.equal((await s.c('GET', '/api/me/profile')).body.points.balance, 0);
  const inbox = (await s.c('GET', '/api/inbox')).body.items;
  assert.ok(inbox.some((x) => x.kind === 'deduct' && /odjął Ci 20 pkt/.test(x.title)));
  const t = await login.teacher();
  assert.equal((await t('POST', '/api/grants/deduct', { studentIds: [s.id], amount: 1 })).status, 403);
  const hist = (await a('GET', '/api/grants')).body.history;
  assert.ok(hist.some((x) => x.amount === -20));
});

test('nagrody punktowe: administrator zmienia punkty za szóstkę i za koło fortuny', async () => {
  const a = await login.admin();
  const cur = (await a('GET', '/api/admin/points-rules')).body;
  assert.deepEqual(cur.rules.grades, [1, 5, 12, 22, 35, 50]);
  const r = await a('PUT', '/api/admin/points-rules', { grades: [1, 5, 12, 22, 35, 80], wheel: 15, teachingFirst: 30 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const st = (await client()('GET', '/api/status')).body;
  assert.equal(st.pointRules.grades[5], 80);
  assert.equal(st.pointRules.wheel, 15);
  const { RULES, DEFAULT_SETTINGS } = await import('../public/js/shared/quiz-rules.js');
  const { AWARD } = await import('../public/js/shared/lesson-rules.js');
  assert.equal(RULES.gradePoints[5], 80);
  assert.equal(AWARD.wheel, 15);
  assert.equal(DEFAULT_SETTINGS.points.teachingFirst, 30);
  assert.equal((await a('PUT', '/api/admin/points-rules', { wheel: -1 })).status, 400);
  const t = await login.teacher();
  assert.equal((await t('PUT', '/api/admin/points-rules', { wheel: 1 })).status, 403);
  // przywrócenie domyślnych
  const back = await a('PUT', '/api/admin/points-rules', { reset: true });
  assert.equal(back.body.rules.wheel, 10);
  assert.equal(AWARD.wheel, 10);
});

test('usuwanie: nauczyciel tylko swoje lekcje i testy, administrator wszystko', async () => {
  const a = await login.admin();
  const t = await login.teacher();
  const chem = dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
  const adminLesson = (await a('POST', '/api/editor/lessons', { title: 'Lekcja administratora', subjectId: chem })).body.lesson.id;
  const adminTest = (await a('POST', '/api/editor/tests', { title: 'Test administratora', subjectId: chem, kind: 'teaching_test', questionCount: 1 })).body.test.id;
  const list = (await t('GET', '/api/editor/lessons')).body.lessons.find((x) => x.id === adminLesson);
  assert.equal(list.canDelete, false); assert.equal(list.mine, false); assert.equal(list.author, 'Administrator');
  const del1 = await t('DELETE', `/api/editor/lessons/${adminLesson}`);
  assert.equal(del1.status, 403); assert.match(del1.body.error, /tylko autor albo administrator/);
  assert.equal((await t('DELETE', `/api/editor/tests/${adminTest}`)).status, 403);
  const own = (await t('POST', '/api/editor/lessons', { title: 'Moja lekcja', subjectId: chem })).body.lesson.id;
  assert.equal((await t('GET', '/api/editor/lessons')).body.lessons.find((x) => x.id === own).canDelete, true);
  assert.equal((await t('DELETE', `/api/editor/lessons/${own}`)).status, 200);
  assert.equal((await a('DELETE', `/api/editor/lessons/${adminLesson}`)).status, 200);
  assert.equal((await a('DELETE', `/api/editor/tests/${adminTest}`)).status, 200);
});

test('lekcja z samouczka: nie do publikacji; kopia dopiero po zmianach', async () => {
  const t = await login.teacher();
  const chem = dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
  const content = (await t('GET', '/api/editor/tutorial-content')).body;
  assert.equal(content.lesson.slides.length, 11);
  assert.equal(content.test.questions.length, 15);
  assert.equal(new Set(content.test.questions.map((q) => q.type)).size, 15);
  const id = (await t('POST', '/api/editor/lessons', { title: 'Lekcja z samouczka', subjectId: chem, tutorial: true })).body.lesson.id;
  assert.equal((await t('PUT', `/api/editor/lessons/${id}`, { slides: content.lesson.slides })).status, 200);
  const ed = (await t('GET', `/api/editor/lessons/${id}`)).body.lesson;
  assert.equal(ed.lock, 'tutorial'); assert.equal(ed.tutorial, true);
  const pub = await t('POST', `/api/editor/lessons/${id}/classes`, { classes: ['7a'] });
  assert.equal(pub.status, 422); assert.equal(pub.body.locked, 'tutorial');
  const done = await t('POST', `/api/editor/lessons/${id}/complete`, { classLabel: '7a' });
  assert.equal(done.status, 200); assert.equal(done.body.published, false); assert.equal(done.body.locked, 'tutorial');
  assert.equal(dbm.one('SELECT status FROM activities WHERE id = ?', id).status, 'draft');
  // kopia: zablokowana do pierwszej zmiany treści
  const cp = await t('POST', `/api/editor/lessons/${id}/duplicate`);
  assert.equal(cp.body.mustChange, true);
  const copyId = cp.body.id;
  assert.equal((await t('GET', `/api/editor/lessons/${copyId}`)).body.lesson.lock, 'copy');
  const p2 = await t('POST', `/api/editor/lessons/${copyId}/classes`, { classes: ['7a'] });
  assert.equal(p2.status, 422); assert.equal(p2.body.locked, 'copy');
  // sama zmiana nazwy nie wystarczy
  await t('PUT', `/api/editor/lessons/${copyId}`, { title: 'Budowa atomu – moja wersja' });
  assert.equal((await t('POST', `/api/editor/lessons/${copyId}/classes`, { classes: ['7a'] })).status, 422);
  const slides = (await t('GET', `/api/editor/lessons/${copyId}`)).body.lesson.slides;
  slides[0].subtitle = 'Chemia · klasa 7a – moja lekcja';
  const saved = await t('PUT', `/api/editor/lessons/${copyId}`, { slides });
  assert.equal(saved.body.lock, null);
  const ok = await t('POST', `/api/editor/lessons/${copyId}/classes`, { classes: ['7a'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  // kopia zmienionej kopii nie jest już zablokowana
  assert.equal((await t('POST', `/api/editor/lessons/${copyId}/duplicate`)).body.mustChange, false);
});

test('test z samouczka: nie do publikacji; kopia po zmianie pytania', async () => {
  const t = await login.teacher();
  const chem = dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
  const content = (await t('GET', '/api/editor/tutorial-content')).body;
  const id = (await t('POST', '/api/editor/tests', { title: 'Test z samouczka', subjectId: chem, kind: 'teaching_test', questionCount: 15, tutorial: true })).body.test.id;
  assert.equal((await t('PUT', `/api/editor/tests/${id}`, { questions: content.test.questions })).status, 200);
  const p = await t('POST', `/api/editor/tests/${id}/publish`);
  assert.equal(p.status, 422); assert.equal(p.body.locked, 'tutorial');
  const row = (await t('GET', '/api/editor/tests')).body.tests.find((x) => x.id === id);
  assert.equal(row.lock, 'tutorial');
  const copyId = (await t('POST', `/api/editor/tests/${id}/duplicate`)).body.id;
  assert.equal((await t('POST', `/api/editor/tests/${copyId}/publish`)).body.locked, 'copy');
  const qs = (await t('GET', `/api/editor/tests/${copyId}`)).body.test.questions;
  qs[0].prompt = 'Jaki symbol chemiczny ma sód?';
  assert.equal((await t('PUT', `/api/editor/tests/${copyId}`, { questions: qs })).body.lock, null);
  const ok = await t('POST', `/api/editor/tests/${copyId}/publish`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});
