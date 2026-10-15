// Testy API EDUKRO: uprawnienia, rejestracja, kody, limity prób.
// Uruchomienie: npm test   (używa tymczasowej bazy, nie dotyka data/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-test-'));
fs.writeFileSync(path.join(tmp, '.env'), [
  'EDUKRO_ENV=development', 'EDUKRO_INIT_TEACHER_CODE=1111', 'EDUKRO_INIT_ADMIN_CODE=0907',
  'EDUKRO_DEV_MAIL=1', 'EMAIL_CODE_LENGTH=3', `EDUKRO_DATA_DIR=${tmp}`,
].join('\n'));
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

let base, server, dbm;
const outbox = () => (fs.existsSync(path.join(tmp, 'dev-outbox.log')) ? fs.readFileSync(path.join(tmp, 'dev-outbox.log'), 'utf8') : '');

function client() {
  const jar = {};
  return async function call(method, url, body, { csrf = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (csrf) headers['X-EDUKRO'] = '1';
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const v = kv.slice(i + 1);
      if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = v;
    }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

before(async () => {
  dbm = await import('../server/db.js');
  const { createApp } = await import('../server/index.js');
  dbm.seed();
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function adminClient() {
  const a = client();
  assert.equal((await a('POST', '/api/auth/admin/login', { code: '0907' })).status, 200);
  return a;
}

async function registerStudent(first, last, email, pin = '4826') {
  const c = client();
  assert.equal((await c('POST', '/api/register/start', { firstName: first, lastName: last })).status, 200);
  const e = await c('POST', '/api/register/email', { email, notifyOptIn: true });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  const done = await c('POST', '/api/register/complete', { code: pin, codeRepeat: pin });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return { c, status: done.body.status, user: done.body.user };
}

test('kody początkowe nie występują w kodzie frontendu', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(new URL('../public', import.meta.url).pathname).filter((f) => /\.(js|html|css)$/.test(f))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/['"`]0907['"`]/.test(src) && !/['"`]1111['"`]/.test(src), `sekret w ${f}`);
  }
});

test('kody są przechowywane wyłącznie jako hasz', () => {
  for (const u of dbm.all('SELECT code_hash FROM users')) {
    assert.match(u.code_hash, /^scrypt\$/);
    assert.ok(!u.code_hash.includes('1111') && !u.code_hash.includes('0907'));
  }
});

test('gość widzi przedmioty, ale nie ma dostępu do chronionych tras', async () => {
  const g = client();
  const s = await g('GET', '/api/subjects');
  const names = s.body.subjects.map((x) => x.name);
  assert.deepEqual(names.slice(0, 2), ['Chemia', 'Biologia']);
  for (const n of ['Język polski', 'Język angielski', 'Matematyka', 'Historia', 'Geografia', 'Fizyka', 'Informatyka', 'Edukacja zdrowotna']) assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => /fizyczne/i.test(n)), 'bez WF');
  assert.equal(s.body.subjects[0].teachers[0].lastName, 'Hyżorek');
  assert.equal(s.body.subjects.find((x) => x.name === 'Matematyka').teachers.length, 0, 'nauczycielka nie jest od wszystkiego');
  assert.equal((await g('GET', '/api/me/profile')).status, 401);
  assert.equal((await g('GET', '/api/teacher/overview')).status, 401);
  assert.equal((await g('GET', '/api/admin/registry')).status, 401);
});

test('żądanie bez nagłówka aplikacji (CSRF) jest odrzucane', async () => {
  const g = client();
  const r = await g('POST', '/api/auth/admin/login', { code: '0907' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('rejestracja: osoba spoza rejestru nie może się zarejestrować', async () => {
  const g = client();
  const r = await g('POST', '/api/register/start', { firstName: 'Nie', lastName: 'Istnieje' });
  assert.equal(r.status, 404);
  assert.match(r.body.error, /Nie znaleźliśmy tego imienia i nazwiska/);
});

test('rejestracja bez przypisanego e-maila → konto oczekuje na zatwierdzenie', async () => {
  const a = await adminClient();
  await a('POST', '/api/admin/registry', { firstName: 'Ola', lastName: 'Wiśniewska', classLabel: '7a' });
  // wielkość liter i spacje nie mają znaczenia
  const { c, status } = await registerStudent('  ola ', 'WIŚNIEWSKA', 'ola@example.com', '4826');
  assert.equal(status, 'pending');
  const prof = await c('GET', '/api/me/profile');
  assert.equal(prof.body.user.status, 'pending');
  assert.equal(prof.body.user.notifyOptIn, true);
  const reg = (await a('GET', '/api/admin/registry')).body.registry.find((x) => x.lastName === 'Wiśniewska');
  assert.equal(reg.status, 'pending_approval');
});

test('drugie konto dla tej samej osoby jest niemożliwe', async () => {
  const g = client();
  const r = await g('POST', '/api/register/start', { firstName: 'Ola', lastName: 'Wiśniewska' });
  assert.equal(r.status, 409);
  assert.equal(r.body.taken, true);
});

test('rejestracja bez weryfikacji e-maila: nie wysyłamy kodu, każde konto czeka na administratora', async () => {
  const a = await adminClient();
  await a('POST', '/api/admin/registry', { firstName: 'Jan', lastName: 'Kowalski', approvedEmail: 'jan@szkola.pl' });
  const before = outbox();
  const { status, user } = await registerStudent('Jan', 'Kowalski', 'jan@szkola.pl', '7391');
  assert.equal(status, 'pending');
  assert.equal(user.canSpend ?? false, false);
  assert.equal(outbox(), before, 'rejestracja nie wysyła żadnych e-maili');
  // administrator zatwierdza – od teraz uczeń może wydawać punkty
  const jan = dbm.one("SELECT id FROM users WHERE name_key = 'jan|kowalski'").id;
  assert.equal((await a('POST', `/api/admin/accounts/${jan}/approve`)).status, 200);
  assert.equal(dbm.one('SELECT status FROM users WHERE id = ?', jan).status, 'active');
});

test('rejestracja: walidacja e-maila, kolejność kroków i zajęty adres', async () => {
  const a = await adminClient();
  await a('POST', '/api/admin/registry', { firstName: 'Ewa', lastName: 'Lis' });
  const c = client();
  await c('POST', '/api/register/start', { firstName: 'Ewa', lastName: 'Lis' });
  // e-mail jest opcjonalny, ale jeśli jest podany, musi być prawidłowy
  assert.equal((await c('POST', '/api/register/email', { email: 'to-nie-email' })).status, 400);
  assert.equal((await c('POST', '/api/register/email', { email: 'JAN@szkola.pl' })).status, 409);
  const ok = await c('POST', '/api/register/email', { email: 'ewa@example.com' });
  assert.equal(ok.status, 200);
  assert.equal((await c('GET', '/api/register/state')).body.step, 'code');
  // powtórzenie kodu musi się zgadzać
  assert.equal((await c('POST', '/api/register/complete', { code: '7391', codeRepeat: '7392' })).status, 400);
});

test('słaby lub niepoprawny kod PIN ucznia jest odrzucany', async () => {
  const a = await adminClient();
  await a('POST', '/api/admin/registry', { firstName: 'Piotr', lastName: 'Zając' });
  const c = client();
  await c('POST', '/api/register/start', { firstName: 'Piotr', lastName: 'Zając' });
  await c('POST', '/api/register/email', { email: 'piotr@example.com' });
  for (const bad of ['123', '12345', '1234', '9876', '1111', 'abcd', '12a4']) {
    assert.equal((await c('POST', '/api/register/complete', { code: bad, codeRepeat: bad })).status, 400, bad);
  }
  assert.equal((await c('POST', '/api/register/complete', { code: '5170', codeRepeat: '5170' })).status, 200);
});

test('logowanie ucznia: ogólny komunikat i limit prób', async () => {
  const g = client();
  const r1 = await g('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '0000' });
  const r2 = await g('POST', '/api/auth/student/login', { firstName: 'Nikt', lastName: 'Taki', code: '0000' });
  assert.equal(r1.status, 401);
  assert.equal(r1.body.error, r2.body.error); // brak informacji, czy konto istnieje
  for (let i = 0; i < 4; i++) await g('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '0000' });
  const locked = await g('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '7391' });
  assert.equal(locked.status, 429);
  dbm.run("DELETE FROM rate_limits WHERE key LIKE 'login:%'");
  const ok = await g('POST', '/api/auth/student/login', { firstName: 'jan', lastName: 'kowalski', code: '7391' });
  assert.equal(ok.status, 200);
});

test('gość nie uruchomi aktywności; konto oczekujące uczy się, ale nie wydaje punktów', async () => {
  const t = Date.now();
  const actId = dbm.run(`INSERT INTO activities (subject_id, kind, title, status, created_at, updated_at)
                         VALUES (1, 'game', 'Test uprawnień', 'published', ?, ?)`, t, t).lastInsertRowid;
  const g = client();
  const r = await g('POST', `/api/activities/${actId}/start`);
  assert.equal(r.status, 401);
  assert.equal(r.body.needLogin, true);

  const pending = client();
  assert.equal((await pending('POST', '/api/auth/student/login', { firstName: 'Ola', lastName: 'Wiśniewska', code: '4826' })).status, 200);
  assert.equal((await pending('POST', `/api/activities/${actId}/start`)).status, 200);
  const ola = dbm.one("SELECT id FROM users WHERE name_key = 'ola|wiśniewska'").id;
  dbm.run("INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?, 500, 'test', ?)", ola, t);
  assert.equal((await pending('GET', '/api/shop')).status, 200);
  const buy = await pending('POST', '/api/shop/buy', { item: 'lifeline', qty: 1 });
  assert.equal(buy.status, 403);
  assert.equal(buy.body.pending, true);
  assert.equal(dbm.one('SELECT COALESCE(SUM(amount), 0) n FROM points_ledger WHERE student_id = ?', ola).n, 500);

  const active = client();
  await active('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '7391' });
  assert.equal((await active('POST', `/api/activities/${actId}/start`)).status, 200);
  dbm.run('DELETE FROM activities WHERE id = ?', actId);
});

test('odrzucenie konta usuwa je razem z punktami; wpis w rejestrze zostaje', async () => {
  const a = await adminClient();
  const ewa = await (async () => {
    const c = client();
    await c('POST', '/api/register/start', { firstName: 'Ewa', lastName: 'Lis' });
    await c('POST', '/api/register/email', { email: 'ewa@example.com' });
    const done = await c('POST', '/api/register/complete', { code: '6142', codeRepeat: '6142' });
    assert.equal(done.status, 200);
    return { c, id: done.body.user.id };
  })();
  dbm.run("INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?, 120, 'test', ?)", ewa.id, Date.now());
  assert.equal((await ewa.c('GET', '/api/me/profile')).body.points.balance, 120);
  assert.equal((await a('POST', `/api/admin/accounts/${ewa.id}/reject`)).status, 200);
  assert.equal(dbm.one('SELECT COUNT(*) n FROM users WHERE id = ?', ewa.id).n, 0);
  assert.equal(dbm.one('SELECT COUNT(*) n FROM points_ledger WHERE student_id = ?', ewa.id).n, 0);
  assert.equal(dbm.one("SELECT COUNT(*) n FROM registry WHERE name_key = 'ewa|lis'").n, 1);
  assert.equal((await ewa.c('GET', '/api/me/profile')).status, 401);
  // zatwierdzonego konta nie da się „odrzucić”
  const jan = dbm.one("SELECT id FROM users WHERE name_key = 'jan|kowalski'").id;
  assert.equal((await a('POST', `/api/admin/accounts/${jan}/reject`)).status, 409);
});

test('nauczyciel: logowanie, powitanie, brak dostępu do panelu admina', async () => {
  const g = client();
  const list = (await g('GET', '/api/teachers')).body.teachers;
  const joanna = list.find((x) => x.lastName === 'Hyżorek');
  assert.equal((await g('POST', '/api/auth/teacher/login', { teacherId: joanna.id, code: '1234' })).status, 401);
  const ok = await g('POST', '/api/auth/teacher/login', { teacherId: joanna.id, code: '1111' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.greetingName, 'Joanno');
  const ov = await g('GET', '/api/teacher/overview');
  assert.deepEqual(ov.body.subjects.map((s) => s.name).sort(), ['Biologia', 'Chemia']);
  assert.equal((await g('GET', '/api/admin/overview')).status, 403);
});

test('wyniki: nauczyciel widzi tylko swoje przedmioty i tylko udostępnione wyniki', async () => {
  const a = await adminClient();
  const bio = dbm.one("SELECT id FROM subjects WHERE slug='biologia'").id;
  const chem = dbm.one("SELECT id FROM subjects WHERE slug='chemia'").id;
  const created = await a('POST', '/api/admin/teachers', { firstName: 'Marek', lastName: 'Biolog', subjectIds: [bio] });
  assert.equal(created.status, 200);
  const temp = created.body.temporaryCode;
  assert.match(temp, /^\d{4}$/);

  const jan = dbm.one("SELECT id FROM users WHERE name_key = 'jan|kowalski'").id;
  const t = Date.now();
  const act = dbm.run(`INSERT INTO activities (subject_id, kind, title, status, created_at, updated_at) VALUES (?, 'quiz', 'Sprawdzian z chemii', 'published', ?, ?)`, chem, t, t).lastInsertRowid;
  dbm.run('INSERT INTO results (student_id, activity_id, subject_id, score, max_score, completed_at, shared_with_teacher) VALUES (?,?,?,?,?,?,1)', jan, act, chem, 8, 10, t);

  const joanna = client();
  const jid = dbm.one("SELECT id FROM users WHERE last_name='Hyżorek'").id;
  await joanna('POST', '/api/auth/teacher/login', { teacherId: jid, code: '1111' });
  // od 0.5.1 udostępnianie wyników jest domyślnie włączone
  assert.equal((await joanna('GET', '/api/teacher/results')).body.results.length, 1);

  const student = client();
  await student('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '7391' });
  await student('PUT', '/api/me/sharing', { subjectId: chem, share: false });
  assert.equal((await joanna('GET', '/api/teacher/results')).body.results.length, 0);
  assert.equal((await student('PUT', '/api/me/sharing', { subjectId: chem, share: true })).status, 200);
  const res = (await joanna('GET', '/api/teacher/results')).body.results;
  assert.equal(res.length, 1);
  assert.equal(res[0].subject, 'Chemia');

  const marek = client();
  await marek('POST', '/api/auth/teacher/login', { teacherId: created.body.teacher.id, code: temp });
  // nowy nauczyciel musi najpierw zmienić kod tymczasowy
  assert.equal((await marek('GET', '/api/teacher/overview')).body.mustChangeCode, true);
  assert.equal((await marek('POST', '/api/auth/change-code', { current: temp, next: '4826', nextRepeat: '4826' })).status, 200);
  assert.equal((await marek('GET', '/api/teacher/results')).body.results.length, 0);
  assert.equal((await marek('GET', `/api/teacher/results?subjectId=${chem}`)).status, 403);

  // wycofanie zgody ukrywa wyniki
  await student('PUT', '/api/me/sharing', { subjectId: chem, share: false });
  assert.equal((await joanna('GET', '/api/teacher/results')).body.results.length, 0);
});

test('zmiana kodu nauczyciela wymaga aktualnego kodu', async () => {
  const c = client();
  const jid = dbm.one("SELECT id FROM users WHERE last_name='Hyżorek'").id;
  await c('POST', '/api/auth/teacher/login', { teacherId: jid, code: '1111' });
  assert.equal((await c('POST', '/api/auth/change-code', { current: '9999', next: '5831', nextRepeat: '5831' })).status, 403);
  assert.equal((await c('POST', '/api/auth/change-code', { current: '1111', next: '2222', nextRepeat: '2222' })).status, 400);
  assert.equal((await c('POST', '/api/auth/change-code', { current: '1111', next: '5831', nextRepeat: '5831' })).status, 200);
  const g = client();
  assert.equal((await g('POST', '/api/auth/teacher/login', { teacherId: jid, code: '1111' })).status, 401);
  assert.equal((await g('POST', '/api/auth/teacher/login', { teacherId: jid, code: '5831' })).status, 200);
});

test('zgłoszenie zajętego imienia trafia do administratora i nie daje dostępu', async () => {
  const g = client();
  const r = await g('POST', '/api/claims', { firstName: 'Ola', lastName: 'Wiśniewska', classLabel: '6b', description: 'Ktoś założył konto na moje dane' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'pending');
  assert.equal((await g('GET', '/api/me/profile')).status, 401);
  const a = await adminClient();
  const list = (await a('GET', '/api/admin/claims')).body.claims;
  const claim = list.find((c) => c.contactEmail === 'klasa 6b' && c.lastName === 'Wiśniewska');
  assert.ok(claim);
  const detail = (await a('GET', `/api/admin/claims/${claim.id}`)).body;
  assert.equal(detail.registry.lastName, 'Wiśniewska');
  assert.ok(detail.account, 'konto istnieje');
  assert.equal((await a('PATCH', `/api/admin/claims/${claim.id}`, { status: 'needs_info', adminNote: 'Poproszono o kontakt przez wychowawcę' })).body.claim.status, 'needs_info');
});

test('administrator: zatwierdzanie, blokowanie, reset dostępu i bezpieczne usuwanie', async () => {
  const a = await adminClient();
  const ola = dbm.one("SELECT id FROM users WHERE name_key='ola|wiśniewska'").id;
  assert.equal((await a('POST', `/api/admin/accounts/${ola}/approve`)).status, 200);

  const s = client();
  await s('POST', '/api/auth/student/login', { firstName: 'Ola', lastName: 'Wiśniewska', code: '4826' });
  assert.equal((await s('GET', '/api/me/profile')).status, 200);
  await a('POST', `/api/admin/accounts/${ola}/block`);
  assert.equal((await s('GET', '/api/me/profile')).status, 401); // sesja unieważniona
  await a('POST', `/api/admin/accounts/${ola}/unblock`);

  // reset wymaga ponownego podania kodu administratora
  assert.equal((await a('POST', `/api/admin/accounts/${ola}/reset`, { confirmCode: '1234' })).status, 403);
  const reset = await a('POST', `/api/admin/accounts/${ola}/reset`, { confirmCode: '0907' });
  assert.equal(reset.status, 200);
  assert.ok(!JSON.stringify(reset.body).includes('4826'));
  const s2 = client();
  const set = await s2('POST', '/api/auth/student/reset', {
    firstName: 'Ola', lastName: 'Wiśniewska', resetCode: reset.body.resetCode.toLowerCase(), newCode: '5829', newCodeRepeat: '5829',
  });
  assert.equal(set.status, 200);
  // kod resetu jest jednorazowy
  assert.equal((await client()('POST', '/api/auth/student/reset', {
    firstName: 'Ola', lastName: 'Wiśniewska', resetCode: reset.body.resetCode, newCode: '6153', newCodeRepeat: '6153',
  })).status, 401);

  // usunięcie: zły kod / złe imię → odmowa
  assert.equal((await a('DELETE', `/api/admin/accounts/${ola}`, { confirmCode: '0907', confirmName: 'Ola' })).status, 400);
  assert.equal((await a('DELETE', `/api/admin/accounts/${ola}`, { confirmCode: '0000', confirmName: 'Ola Wiśniewska' })).status, 403);
  assert.equal((await a('DELETE', `/api/admin/accounts/${ola}`, { confirmCode: '0907', confirmName: 'Ola Wiśniewska' })).status, 200);
  assert.equal(dbm.one("SELECT COUNT(*) n FROM users WHERE name_key='ola|wiśniewska'").n, 0);
  // wpis w rejestrze pozostaje
  assert.equal(dbm.one("SELECT COUNT(*) n FROM registry WHERE name_key='ola|wiśniewska'").n, 1);
});

test('uczeń i nauczyciel nie mają dostępu do API administratora', async () => {
  const s = client();
  await s('POST', '/api/auth/student/login', { firstName: 'Jan', lastName: 'Kowalski', code: '7391' });
  for (const [m, u] of [['GET', '/api/admin/registry'], ['POST', '/api/admin/registry'], ['GET', '/api/admin/accounts'], ['GET', '/api/teacher/results']]) {
    assert.equal((await s(m, u, m === 'POST' ? { firstName: 'X', lastName: 'Y' } : undefined)).status, 403, u);
  }
});

test('logowanie administratora: limit prób', async () => {
  const g = client();
  for (let i = 0; i < 5; i++) assert.equal((await g('POST', '/api/auth/admin/login', { code: '1234' })).status, 401);
  assert.equal((await g('POST', '/api/auth/admin/login', { code: '0907' })).status, 429);
  dbm.run("DELETE FROM rate_limits WHERE key LIKE 'login:admin%'");
});
