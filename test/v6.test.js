// Testy wersji 0.6: przedmioty klas 4–8, dzienne pytania (seria i bonus), szablony.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v6-'));
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


const chemId = () => dbm.one("SELECT id FROM subjects WHERE slug = 'chemia'").id;
const bioId = () => dbm.one("SELECT id FROM subjects WHERE slug = 'biologia'").id;
const single = (prompt, correct = 1) => ({ type: 'single', prompt, options: ['a', 'b', 'c', 'd'], correct });

test('0.6: wszystkie przedmioty 4–8, nauczycielka tylko chemia i biologia', async () => {
  const names = dbm.all('SELECT name FROM subjects').map((r) => r.name);
  for (const n of ['Język polski', 'Język angielski', 'Język niemiecki', 'Matematyka', 'Historia', 'Wiedza o społeczeństwie', 'Przyroda', 'Fizyka', 'Geografia', 'Informatyka', 'Technika', 'Muzyka', 'Plastyka', 'Edukacja dla bezpieczeństwa', 'Edukacja zdrowotna']) assert.ok(names.includes(n), n);
  const t = await login.teacher();
  const subs = (await t('GET', '/api/editor/subjects')).body.subjects.map((s) => s.name).sort();
  assert.deepEqual(subs, ['Biologia', 'Chemia']);
  // drugi raz dodawanie nic nie zmienia (usunięty przedmiot nie wraca)
  assert.equal(dbm.ensureSubjects(), 0);
});

test('0.6: dzienne pytania – baza nauczyciela, losowanie raz dziennie, seria i bonus', async () => {
  const t = await login.teacher();
  // niekompletne pytanie odrzucone
  assert.equal((await t('POST', '/api/daily/manage', { subjectId: chemId(), question: { type: 'single', prompt: 'x', options: ['a', '', '', ''], correct: null } })).status, 400);
  // brak uprawnień do przedmiotu
  const math = dbm.one("SELECT id FROM subjects WHERE slug = 'matematyka'").id;
  assert.equal((await t('POST', '/api/daily/manage', { subjectId: math, question: single('2+2?') })).status, 403);
  for (let i = 0; i < 3; i++) assert.equal((await t('POST', '/api/daily/manage', { subjectId: chemId(), question: single(`Chemia ${i}`) })).status, 200);
  assert.equal((await t('POST', '/api/daily/manage', { subjectId: bioId(), question: single('Biologia 1', 2) })).status, 200);
  const list = (await t('GET', `/api/daily/manage?subjectId=${chemId()}`)).body;
  assert.equal(list.questions.length, 3);
  assert.ok(list.questions.every((q) => q.canEdit));

  const s = await student('Dzienna', 'Seria', '5813');
  let ov = (await s.c('GET', '/api/daily')).body;
  assert.equal(ov.streak, 0); assert.equal(ov.nextPoints, 1);
  assert.deepEqual(ov.subjects.map((x) => x.name).sort(), ['Biologia', 'Chemia']);
  const before0 = await balance(s.c);
  // pierwsze pytanie dnia – chemia
  const d1 = (await s.c('POST', `/api/daily/${chemId()}/draw`)).body;
  assert.equal(d1.first, true); assert.equal(d1.stake, 1);
  assert.ok(!JSON.stringify(d1.question).includes('"correct"'));
  // ponowne losowanie zwraca to samo pytanie
  const d1b = (await s.c('POST', `/api/daily/${chemId()}/draw`)).body;
  assert.equal(d1b.question.prompt, d1.question.prompt);
  const okId = (q) => q.options.find((o) => o.text === 'b').id;
  const r1 = (await s.c('POST', `/api/daily/${chemId()}/answer`, { answer: { choice: okId(d1.question) } })).body;
  assert.equal(r1.correct, true); assert.equal(r1.points, 1); assert.equal(r1.streak, 1);
  assert.equal((await s.c('POST', `/api/daily/${chemId()}/answer`, { answer: { choice: okId(d1.question) } })).status, 409, 'raz dziennie');
  // drugi przedmiot – bonus 2 pkt (zła odpowiedź nie psuje serii)
  const d2 = (await s.c('POST', `/api/daily/${bioId()}/draw`)).body;
  assert.equal(d2.first, false); assert.equal(d2.stake, 2);
  const r2 = (await s.c('POST', `/api/daily/${bioId()}/answer`, { answer: { choice: d2.question.options.find((o) => o.text === 'c').id } })).body;
  assert.equal(r2.correct, true); assert.equal(r2.points, 2); assert.equal(r2.streak, 1);
  assert.equal(await balance(s.c), before0 + 3);

  // „jutro” i „pojutrze”: seria rośnie (2 pkt, 3 pkt) – symulujemy przesuwając zapisane dni
  const shiftDays = (n) => {
    dbm.run("UPDATE daily_answers SET day = date(day, ?) WHERE student_id = ?", `-${n} day`, s.id);
    dbm.run("UPDATE daily_streaks SET last_day = date(last_day, ?) WHERE student_id = ?", `-${n} day`, s.id);
  };
  shiftDays(1);
  ov = (await s.c('GET', '/api/daily')).body;
  assert.equal(ov.streak, 1); assert.equal(ov.nextPoints, 2);
  let d = (await s.c('POST', `/api/daily/${bioId()}/draw`)).body; // tym razem pierwsza jest biologia
  assert.equal(d.first, true);
  let r = (await s.c('POST', `/api/daily/${bioId()}/answer`, { answer: { choice: d.question.options.find((o) => o.text === 'c').id } })).body;
  assert.equal(r.points, 2); assert.equal(r.streak, 2);
  // chemia źle – to nie pierwsze pytanie, seria zostaje
  d = (await s.c('POST', `/api/daily/${chemId()}/draw`)).body;
  r = (await s.c('POST', `/api/daily/${chemId()}/answer`, { answer: { choice: d.question.options.find((o) => o.text === 'a').id } })).body;
  assert.equal(r.correct, false); assert.equal(r.points, 0); assert.equal(r.streak, 2);
  shiftDays(1);
  d = (await s.c('POST', `/api/daily/${chemId()}/draw`)).body;
  r = (await s.c('POST', `/api/daily/${chemId()}/answer`, { answer: { choice: okId(d.question) } })).body;
  assert.equal(r.points, 3); assert.equal(r.streak, 3);
  // następny dzień: pierwsze pytanie źle → seria od zera, mimo że potem drugie dobrze
  shiftDays(1);
  d = (await s.c('POST', `/api/daily/${chemId()}/draw`)).body;
  r = (await s.c('POST', `/api/daily/${chemId()}/answer`, { answer: { choice: d.question.options.find((o) => o.text === 'd').id } })).body;
  assert.equal(r.streak, 0); assert.equal(r.points, 0);
  d = (await s.c('POST', `/api/daily/${bioId()}/draw`)).body;
  r = (await s.c('POST', `/api/daily/${bioId()}/answer`, { answer: { choice: d.question.options.find((o) => o.text === 'c').id } })).body;
  assert.equal(r.points, 2, 'bonus'); assert.equal(r.streak, 0, 'seria liczy się z pierwszego pytania');
  // opuszczony dzień zeruje serię
  dbm.run('UPDATE daily_streaks SET streak = 5, last_day = date(?, \'-3 day\') WHERE student_id = ?', new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }), s.id);
  shiftDays(1);
  assert.equal((await s.c('GET', '/api/daily')).body.streak, 0);

  // inny nauczyciel nie zmieni cudzego pytania; administrator tak
  const a = await login.admin();
  const qid = list.questions[0].id;
  assert.equal((await a('PUT', `/api/daily/manage/${qid}`, { active: false })).status, 200);
  assert.equal((await t('GET', `/api/daily/manage?subjectId=${chemId()}`)).body.questions.find((q) => q.id === qid).active, false);
  assert.equal((await t('DELETE', `/api/daily/manage/${qid}`)).status, 200);
});

test('0.6: szablony – gotowe i zapisane (układ bez tekstu)', async () => {
  const t = await login.teacher();
  const list = (await t('GET', '/api/templates?kind=lesson')).body;
  assert.ok(list.builtin.length >= 3);
  // lekcja z gotowego szablonu
  const r1 = await t('POST', '/api/editor/lessons', { title: 'Moja krótka lekcja', subjectId: chemId(), templateId: 'b:krotka' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const L1 = (await t('GET', `/api/editor/lessons/${r1.body.lesson.id}`)).body.lesson;
  assert.deepEqual(L1.slides.map((s) => s.type), ['title', 'info', 'question', 'flashcards', 'copy']);
  assert.equal(L1.slides[0].title, 'Moja krótka lekcja');
  // zapis przykładowej lekcji jako szablonu: ten sam układ, bez tekstu, z wyglądem
  const demo = dbm.one("SELECT id FROM activities WHERE kind = 'lesson' AND title = 'Budowa atomu'").id;
  const D = (await t('GET', `/api/editor/lessons/${demo}`)).body.lesson;
  D.slides[1].look = { bg: 'board', title: { size: 1.5, font: 'pen' } };
  D.slides[1].blocks[0].look = { color: 'amber', dx: 5 };
  assert.equal((await t('PUT', `/api/editor/lessons/${demo}`, { slides: D.slides })).status, 200);
  const sv = await t('POST', '/api/templates', { kind: 'lesson', sourceId: demo, name: 'Atom – układ' });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  assert.equal((await t('POST', '/api/templates', { kind: 'lesson', sourceId: demo, name: 'atom – UKŁAD' })).status, 409, 'nazwa unikalna');
  const r2 = await t('POST', '/api/editor/lessons', { title: 'Nowa z mojego', subjectId: chemId(), templateId: sv.body.template.id });
  const L2 = (await t('GET', `/api/editor/lessons/${r2.body.lesson.id}`)).body.lesson;
  assert.deepEqual(L2.slides.map((s) => s.type), D.slides.map((s) => s.type));
  assert.equal(L2.slides[1].look.bg, 'board');
  assert.equal(L2.slides[1].blocks[0].look.color, 'amber');
  assert.equal(L2.slides[1].blocks.length, D.slides[1].blocks.length);
  const text = JSON.stringify(L2.slides.slice(1));
  assert.ok(!/elektron|proton/i.test(text), 'bez tekstu');
  // test z gotowego szablonu sprawdzianu
  const tt = await t('POST', '/api/editor/tests', { title: 'Sprawdzian z szablonu', subjectId: chemId(), kind: 'teaching_test', templateId: 'b:sprawdzian', settings: { deadline: Date.now() + 7 * DAY } });
  assert.equal(tt.status, 200, JSON.stringify(tt.body));
  assert.equal(tt.body.test.kind, 'quiz');
  assert.equal(tt.body.test.questions.length, 20);
  assert.equal(tt.body.test.settings.categories.length, 3);
  assert.ok(tt.body.test.settings.deadline > Date.now());
  // zapis testu jako szablonu i usuwanie (autor albo administrator)
  const exam = dbm.one("SELECT id FROM activities WHERE title = 'Egzamin próbny: pierwiastki i związki'").id;
  const st = await t('POST', '/api/templates', { kind: 'test', sourceId: exam, name: 'Egzamin 6 pytań' });
  assert.equal(st.status, 200);
  const tests = (await t('GET', '/api/templates?kind=test')).body;
  const mine = tests.saved.find((x) => x.name === 'Egzamin 6 pytań');
  assert.equal(mine.testKind, 'exam_test'); assert.equal(mine.count, 6); assert.ok(mine.canDelete);
  const t2 = await t('POST', '/api/editor/tests', { title: 'Z szablonu egzaminu', subjectId: chemId(), kind: 'teaching_test', templateId: mine.id });
  assert.equal(t2.body.test.kind, 'exam_test');
  assert.ok(t2.body.test.questions.every((q) => q.type && !q.prompt.includes('Fe')));
  const a = await login.admin();
  assert.equal((await a('DELETE', `/api/templates/${mine.id}`)).status, 200);
});
