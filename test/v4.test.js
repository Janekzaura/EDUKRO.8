// Testy wersji 0.4: skrzynka, przyznawanie punktów, ceny i promocje, nagrody i testy tymczasowe,
// lekcje wspólne dla klas (Prowadź → klasa → publikacja), samouczek.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v4-'));
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

let kasia, tomek, olek;
/** Poprawna odpowiedź na bieżące pytanie jednokrotnego wyboru (z danych serwera); inne pytania – pusta odpowiedź. */
function rightAnswer(att) {
  const row = dbm.one('SELECT snapshot_json, state_json FROM test_attempts WHERE id = ?', att);
  const st = JSON.parse(row.state_json), snap = JSON.parse(row.snapshot_json);
  const q = snap.questions[st.current.qi];
  if (q.type === 'single') return { choice: st.current.key.ids[q.correct] };
  if (q.type === 'number') return { value: String(q.value) };
  return {};
}

test('skrzynka: powitanie, zatwierdzenie konta i nowe konto u administratora', async () => {
  kasia = await student('Kasia', 'Skrzynkowa', '4826', '7a');
  const inbox = (await kasia.c('GET', '/api/inbox')).body;
  const kinds = inbox.items.map((x) => x.kind);
  assert.ok(kinds.includes('welcome'));
  assert.ok(kinds.includes('account'), 'powiadomienie o zatwierdzeniu konta');
  assert.ok(inbox.unread >= 2);
  const a = await login.admin();
  const ai = (await a('GET', '/api/inbox')).body.items;
  assert.ok(ai.some((x) => x.kind === 'admin_account' && /Kasia Skrzynkowa/.test(x.title)));
  assert.equal((await kasia.c('POST', '/api/inbox/read', {})).status, 200);
  assert.equal((await kasia.c('GET', '/api/inbox/summary')).body.unread, 0);
  // gość nie ma skrzynki
  assert.equal((await client()('GET', '/api/inbox')).status, 401);
});

test('punkty: administrator bez limitu, nauczyciel raz dziennie do 100 pkt; odbiór w skrzynce', async () => {
  tomek = await student('Tomek', 'Punktowy', '5937', '7b');
  const a = await login.admin();
  const t = await login.teacher();
  const g = (await t('GET', '/api/grants')).body;
  assert.equal(g.budget.unlimited, false);
  assert.ok(g.students.some((s) => s.id === kasia.id));
  // nauczyciel: łącznie do 100 pkt
  assert.equal((await t('POST', '/api/grants', { studentIds: [kasia.id, tomek.id], amount: 60 })).status, 400);
  assert.equal((await t('POST', '/api/grants', { studentIds: [kasia.id], amount: 101 })).status, 400);
  const ok = await t('POST', '/api/grants', { studentIds: [kasia.id, tomek.id], amount: 50, message: 'Za świetną pracę' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.budget.usedToday, true);
  const again = await t('POST', '/api/grants', { studentIds: [kasia.id], amount: 5 });
  assert.equal(again.status, 409);
  // administrator: bez limitu
  assert.equal((await a('POST', '/api/grants', { studentIds: [kasia.id], amount: 5000 })).status, 200);
  assert.equal((await a('POST', '/api/grants', { studentIds: [kasia.id], amount: 300 })).status, 200);
  // punkty liczą się dopiero po odebraniu
  const before = (await kasia.c('GET', '/api/me/profile')).body.points;
  assert.equal(before.pointsToClaim, 5350);
  const inbox = (await kasia.c('GET', '/api/inbox')).body.items.filter((x) => x.kind === 'gift');
  assert.equal(inbox.length, 3);
  assert.ok(inbox.some((x) => /Joanna Hyżorek przyznała Ci 50 pkt/.test(x.title)));
  const one = await kasia.c('POST', '/api/inbox/claim', { id: inbox.find((x) => x.points === 50).id });
  assert.equal(one.body.points, 50);
  assert.equal((await kasia.c('POST', '/api/inbox/claim', { id: inbox.find((x) => x.points === 50).id })).status, 409, 'nie da się odebrać dwa razy');
  const all = (await kasia.c('POST', '/api/inbox/claim-all')).body;
  assert.equal(all.points, 5300);
  assert.equal(all.balance, before.balance + 5350);
  // uczeń nie może przyznawać punktów; odebrać cudzych też nie
  assert.equal((await kasia.c('POST', '/api/grants', { studentIds: [kasia.id], amount: 5 })).status, 403);
  const tomekGift = (await tomek.c('GET', '/api/inbox')).body.items.find((x) => x.kind === 'gift');
  assert.equal((await kasia.c('POST', '/api/inbox/claim', { id: tomekGift.id })).status, 404);
});

test('sklep: administrator zmienia cenę i tworzy promocję czasową; uczeń płaci mniej', async () => {
  const a = await login.admin();
  const adm = (await a('GET', '/api/admin/shop')).body;
  assert.ok(adm.items.some((x) => x.key === 'color:ruby'));
  assert.equal((await a('PUT', '/api/admin/shop/prices', { prices: { 'color:ruby': 400, praise: 2000 } })).status, 200);
  let S = (await kasia.c('GET', '/api/shop')).body;
  assert.equal(S.prices['color:ruby'], 400);
  assert.equal(S.catalog.praise.price, 2000);
  // promocja na godzinę: −50% na rubin + powiadomienie dla uczniów
  const p = await a('POST', '/api/admin/shop/promos', { item: 'color:ruby', off: 50, hours: 1, note: 'Szczęśliwa godzina' });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  S = (await kasia.c('GET', '/api/shop')).body;
  assert.equal(S.prices['color:ruby'], 200);
  assert.ok(S.promos.some((x) => x.item === 'color:ruby' && x.off === 50));
  assert.ok((await kasia.c('GET', '/api/inbox')).body.items.some((x) => x.kind === 'promo' && /−50%/.test(x.title)));
  const bal = S.balance;
  assert.equal((await kasia.c('POST', '/api/shop/buy', { item: 'color:ruby' })).body.balance, bal - 200);
  // promocja na cały sklep nie obejmuje pochwały
  await a('POST', '/api/admin/shop/promos', { item: 'all', off: 20, hours: 24 });
  S = (await kasia.c('GET', '/api/shop')).body;
  assert.equal(S.prices['color:sapphire'], 120);
  assert.equal(S.catalog.praise.price, 2000);
  assert.equal(S.catalog.lifeline.packs[0].price, 64);
  // zakończenie promocji
  const list = (await a('GET', '/api/admin/shop')).body.promos.filter((x) => x.state === 'active');
  for (const x of list) assert.equal((await a('POST', `/api/admin/shop/promos/${x.id}/end`)).status, 200);
  await a('PUT', '/api/admin/shop/settings', { weekly: false });
  S = (await kasia.c('GET', '/api/shop')).body;
  assert.equal(S.prices['color:sapphire'], 150);
  assert.equal(S.promos.length, 0);
  // przywrócenie ceny domyślnej
  await a('PUT', '/api/admin/shop/prices', { prices: { 'color:ruby': null, praise: null } });
  assert.equal((await kasia.c('GET', '/api/shop')).body.catalog.praise.price, 2500);
  // walidacja i uprawnienia
  assert.equal((await a('POST', '/api/admin/shop/promos', { item: 'color:ruby', off: 95, hours: 1 })).status, 400);
  assert.equal((await kasia.c('GET', '/api/admin/shop')).status, 403);
});

test('test tymczasowy z nagrodą: powiadomienie o nowym teście, ramka, przypomnienie, nagroda w skrzynce, znika po czasie', async () => {
  const t = await login.teacher();
  const chem = dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
  const src = dbm.one("SELECT content_json FROM activities WHERE title = 'Egzamin próbny: pierwiastki i związki'");
  const qs = JSON.parse(src.content_json).questions.filter((q) => q.type === 'single').slice(0, 2);
  assert.ok(qs.length >= 1);
  const now = Date.now();
  const created = (await t('POST', '/api/editor/tests', { title: 'Tymczasowy z nagrodą', subjectId: chem, kind: 'teaching_test', questionCount: 0 })).body.test;
  const put = await t('PUT', `/api/editor/tests/${created.id}`, {
    questions: qs, settings: { expiresAt: now + 3 * 3600e3, reward: { type: 'item', item: 'color:emerald' } },
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const pub = await t('POST', `/api/editor/tests/${created.id}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.ok(pub.body.notified >= 2);
  const note = (await kasia.c('GET', '/api/inbox')).body.items.find((x) => x.kind === 'test_new' && x.link === `/uczen/test/${created.id}`);
  assert.ok(note, 'uczeń dostał powiadomienie o nowym teście');
  assert.match(note.title, /Joanna Hyżorek dodała nowy test nauczający/);
  assert.match(note.body, /tymczasowy/);
  // lista ucznia: test z czasem zniknięcia i nagrodą
  const list = (await kasia.c('GET', '/api/subjects/chemia')).body.categories.teaching_test;
  const row = list.find((x) => x.id === created.id);
  assert.ok(row.expiresAt && /Szmaragd/.test(row.reward));
  // przypomnienie, gdy zostaje mało czasu (okno = 1/4 czasu życia, nie dubluje się)
  dbm.run('UPDATE activities SET published_at = ?, expires_at = ? WHERE id = ?', now - 3 * 3600e3, now + 20 * 60e3, created.id);
  dbm.run('UPDATE notifications SET created_at = ? WHERE dedupe = ?', now - 3 * 3600e3, `test:${created.id}:${kasia.id}`);
  await kasia.c('GET', '/api/inbox/summary');
  await kasia.c('GET', '/api/inbox/summary');
  const exp = (await kasia.c('GET', '/api/inbox')).body.items.filter((x) => x.kind === 'expiring' && x.link === `/uczen/test/${created.id}`);
  assert.equal(exp.length, 1);
  // ukończenie testu → nagroda czeka w skrzynce (raz)
  const att = (await kasia.c('POST', `/api/tests/${created.id}/attempts`)).body.attemptId;
  let summary = null;
  for (let i = 0; i < 20 && !summary; i++) {
    const v = (await kasia.c('GET', `/api/attempts/${att}`)).body;
    if (v.summary) { summary = v.summary; break; }
    const r = (await kasia.c('POST', `/api/attempts/${att}/answer`, { serve: v.question.serve, answer: rightAnswer(att) })).body;
    if (r.finished) summary = r.summary;
  }
  assert.ok(summary?.reward?.waiting, JSON.stringify(summary));
  const reward = (await kasia.c('GET', '/api/inbox')).body.items.find((x) => x.kind === 'reward');
  assert.ok(reward.claimable);
  const got = (await kasia.c('POST', '/api/inbox/claim', { id: reward.id })).body;
  assert.equal(got.item, 'color:emerald');
  assert.ok((await kasia.c('GET', '/api/shop')).body.owned.includes('color:emerald'));
  // ukończony test nie przypomina się innym razem; Tomek (nie ukończył) wciąż widzi test
  assert.equal((await tomek.c('GET', `/api/tests/${created.id}`)).status, 200);
  // po czasie test znika z listy i nie da się go rozpocząć
  dbm.run('UPDATE activities SET expires_at = ? WHERE id = ?', Date.now() - 1000, created.id);
  assert.ok(!(await tomek.c('GET', '/api/subjects/chemia')).body.categories.teaching_test.some((x) => x.id === created.id));
  assert.equal((await tomek.c('POST', `/api/tests/${created.id}/attempts`)).status, 404);
  // nauczyciel widzi, że test wygasł
  assert.equal((await t('GET', '/api/editor/tests')).body.tests.find((x) => x.id === created.id).expired, true);
});

test('nagroda-promocja za sprawdzian od oceny 4: osobista promocja w sklepie po odebraniu', async () => {
  const a = await login.admin();
  const quiz = dbm.one("SELECT id, content_json FROM activities WHERE kind = 'quiz' LIMIT 1");
  const doc = JSON.parse(quiz.content_json);
  doc.settings.reward = { type: 'promo', item: 'color:gold', off: 50, hours: 24 };
  doc.settings.rewardMinGrade = 2;
  assert.equal((await a('PUT', `/api/editor/tests/${quiz.id}`, { settings: doc.settings })).status, 200);
  olek = await student('Olek', 'Nagrodowy', '7351', '7a');
  const info = (await olek.c('GET', `/api/tests/${quiz.id}`)).body.test;
  assert.match(info.reward.label, /promocja −50%/);
  const att = (await olek.c('POST', `/api/tests/${quiz.id}/attempts`)).body.attemptId;
  let summary = null;
  for (let i = 0; i < 30 && !summary; i++) {
    const v = (await olek.c('GET', `/api/attempts/${att}`)).body;
    if (v.summary) { summary = v.summary; break; }
    const r = (await olek.c('POST', `/api/attempts/${att}/answer`, { serve: v.question.serve, answer: rightAnswer(att) })).body;
    if (r.finished) summary = r.summary;
  }
  assert.ok(summary.grade >= 2, `ocena ${summary.grade}`);
  {
    assert.ok(summary.reward?.waiting);
    const rw = (await olek.c('GET', '/api/inbox')).body.items.find((x) => x.kind === 'reward');
    const got = (await olek.c('POST', '/api/inbox/claim', { id: rw.id })).body;
    assert.equal(got.promo.off, 50);
    const S = (await olek.c('GET', '/api/shop')).body;
    assert.equal(S.prices['color:gold'], 350);
    assert.ok(S.promos.some((p) => p.personal));
    // osobista promocja nie dotyczy innych uczniów
    assert.equal((await kasia.c('GET', '/api/shop')).body.prices['color:gold'], 700);
  }
});

test('lekcja: wspólna dla klas; Prowadź z klasą → koniec lekcji publikuje ją tej klasie', async () => {
  const t = await login.teacher();
  const chem = dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
  const demo = dbm.one("SELECT content_json FROM activities WHERE kind = 'lesson' AND title = 'Budowa atomu'");
  const { lesson } = (await t('POST', '/api/editor/lessons', { title: 'Wiązania chemiczne', subjectId: chem })).body;
  const slides = JSON.parse(demo.content_json).slides;
  assert.equal((await t('PUT', `/api/editor/lessons/${lesson.id}`, { slides })).status, 200);
  const ed = (await t('GET', `/api/editor/lessons/${lesson.id}`)).body;
  assert.ok(ed.schoolClasses.some((c) => c.label === '7a'));
  assert.equal(ed.classes.length, 0);
  // nikt nie widzi lekcji przed prowadzeniem/publikacją
  assert.ok(!(await kasia.c('GET', '/api/subjects/chemia')).body.categories.lesson.some((x) => x.id === lesson.id));
  assert.equal((await kasia.c('GET', `/api/lessons/${lesson.id}`)).status, 404);
  // prowadzenie z klasą 7a: lista z rejestru tej klasy
  const p = (await t('GET', `/api/editor/lessons/${lesson.id}/present?class=7a`)).body;
  assert.equal(p.lesson.classLabel, '7a');
  assert.ok(p.roster.length >= 12);
  const pb = (await t('GET', `/api/editor/lessons/${lesson.id}/present?class=7b`)).body;
  assert.ok(pb.roster.some((x) => x.firstName === 'Tomek'));
  // punkty tylko dla klasy, z którą prowadzisz
  const wheel = p.slides.find((s) => s.type === 'wheel');
  const tomekReg = pb.roster.find((x) => x.firstName === 'Tomek').id;
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/award`, { slideId: wheel.id, outcome: 'correct', registryIds: [tomekReg], runKey: 'v4-wheel-0001', classLabel: '7a' })).status, 400);
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/award`, { slideId: wheel.id, outcome: 'correct', registryIds: [tomekReg], runKey: 'v4-wheel-0002', classLabel: '7b' })).status, 200);
  // koniec lekcji z 7a → opublikowana dla 7a (+ powiadomienie), 7b nadal nie widzi
  const done = (await t('POST', `/api/editor/lessons/${lesson.id}/complete`, { classLabel: '7a' })).body;
  assert.equal(done.published, true);
  assert.ok(done.notified >= 1);
  assert.ok(done.classes.some((c) => c.label === '7a' && c.published && c.completedAt));
  assert.ok((await kasia.c('GET', '/api/subjects/chemia')).body.categories.lesson.some((x) => x.id === lesson.id));
  assert.equal((await kasia.c('GET', `/api/lessons/${lesson.id}`)).status, 200);
  assert.ok((await kasia.c('GET', '/api/inbox')).body.items.some((x) => x.kind === 'lesson_new' && x.link === `/uczen/lekcja/${lesson.id}`));
  assert.ok(!(await tomek.c('GET', '/api/subjects/chemia')).body.categories.lesson.some((x) => x.id === lesson.id));
  assert.equal((await tomek.c('GET', `/api/lessons/${lesson.id}`)).status, 404);
  // „Opublikuj dla…” – ręcznie dla 7b; potem wycofanie dla 7a
  const pub = (await t('POST', `/api/editor/lessons/${lesson.id}/classes`, { classes: ['7a', '7b'] })).body;
  assert.equal(pub.status, 'published');
  assert.equal((await tomek.c('GET', `/api/lessons/${lesson.id}`)).status, 200);
  await t('POST', `/api/editor/lessons/${lesson.id}/classes`, { classes: ['7b'] });
  assert.equal((await kasia.c('GET', `/api/lessons/${lesson.id}`)).status, 404);
  // lista nauczyciela pokazuje klasy
  const row = (await t('GET', '/api/editor/lessons')).body.lessons.find((x) => x.id === lesson.id);
  assert.ok(row.classes.some((c) => c.label === '7a' && !c.published && c.completedAt), 'historia: przerobiona z 7a');
  // pusta lista = wycofanie publikacji
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/classes`, { classes: [] })).body.status, 'draft');
  // uczeń z klasy 8 nie zobaczy lekcji klasy 7 nawet przez adres
  const zosia = await student('Zosia', 'Ósmoklasistka', '8264', '8c');
  await t('POST', `/api/editor/lessons/${lesson.id}/classes`, { classes: ['7a'] });
  assert.equal((await zosia.c('GET', `/api/lessons/${lesson.id}`)).status, 404);
  // „wszyscy uczniowie”
  await t('POST', `/api/editor/lessons/${lesson.id}/classes`, { classes: ['*'] });
  assert.equal((await zosia.c('GET', `/api/lessons/${lesson.id}`)).status, 200);
});

test('samouczek: stan zapisuje się na koncie', async () => {
  const t = await login.teacher();
  assert.deepEqual((await t('GET', '/api/session')).body.user.tutorial, { done: [], offered: false, off: false });
  await t('PUT', '/api/me/tutorial', { offered: true, done: ['teacher-start', 'zły klucz!!'] });
  const s = (await t('GET', '/api/session')).body.user.tutorial;
  assert.deepEqual(s.done, ['teacher-start']);
  assert.equal(s.offered, true);
  await t('PUT', '/api/me/tutorial', { reset: ['teacher-start'] });
  assert.deepEqual((await t('GET', '/api/session')).body.user.tutorial.done, []);
});

test('samouczek lekcji: przykłady wszystkich rodzajów slajdów, bez dublowania', async () => {
  const t = await login.teacher();
  const { lesson } = (await t('POST', '/api/editor/lessons', { title: 'Lekcja próbna – samouczek', subjectId: 1 })).body;
  const r1 = (await t('POST', `/api/editor/lessons/${lesson.id}/sample-slides`)).body;
  assert.ok(r1.added >= 8, `dodano ${r1.added}`);
  const types = new Set((await t('GET', `/api/editor/lessons/${lesson.id}`)).body.lesson.slides.map((s) => s.type));
  for (const k of ['title', 'info', 'copy', 'question', 'flashcards', 'brainstorm', 'wheel', 'game']) assert.ok(types.has(k), k);
  assert.equal((await t('POST', `/api/editor/lessons/${lesson.id}/sample-slides`)).body.added, 0);
  assert.equal((await t('GET', '/api/editor/lessons')).body.lessons.find((x) => x.id === lesson.id).errors, 0);
  // klasy szkoły do wyboru przy „Prowadź”
  assert.ok((await t('GET', '/api/editor/classes')).body.classes.some((c) => c.label === '7a' && c.students >= 12));
});
