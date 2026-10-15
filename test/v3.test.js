// Testy nowych funkcji EDUKRO: pytanie pisemne z seriami słów, losowanie pytań, sprawdziany,
// rejestracja z zatwierdzaniem, lekcje (koło fortuny, gry, punkty czekające w rejestrze), sklep i koło ratunkowe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v3-'));
fs.writeFileSync(path.join(tmp, '.env'), [
  'EDUKRO_ENV=development', 'EDUKRO_INIT_TEACHER_CODE=1111', 'EDUKRO_INIT_ADMIN_CODE=0907',
  'EDUKRO_DEV_MAIL=1', `EDUKRO_DATA_DIR=${tmp}`,
].join('\n'));
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

let base, server, dbm, engine, shop;

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
  engine = await import('../server/quiz/engine.js');
  shop = await import('../public/js/shared/shop.js');
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
async function register(first, last, email, pin) {
  const c = client();
  assert.equal((await c('POST', '/api/register/start', { firstName: first, lastName: last })).status, 200);
  assert.equal((await c('POST', '/api/register/email', { email })).status, 200);
  const r = await c('POST', '/api/register/complete', { code: pin, codeRepeat: pin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, user: r.body.user, status: r.body.status };
}

/* ---------------- Pytanie pisemne: serie słów ---------------- */
const breakfast = {
  type: 'open', prompt: 'Opisz swoje śniadanie.', minWords: '10', maxWords: '',
  series: ['ser / białko / mleko', 'miska / kubek / talerz'], sample: 'Piję mleko z kubka i jem kanapkę z serem.',
};

test('pytanie pisemne: losowe słowa nie przechodzą, nawet z ortografio-zaliczaczem', () => {
  const r = engine.gradeOpen('losowa odpowiedź bez sensu ale ma naprawdę dużo różnych słów tutaj', breakfast, true);
  assert.equal(r.correct, false);
  // jedna seria to za mało – potrzebne słowo z KAŻDEJ serii
  assert.equal(engine.gradeOpen('Rano piję ciepłe mleko i jem pyszną kanapkę z masłem orzechowym', breakfast, true).correct, false);
});

test('pytanie pisemne: słowo z każdej serii w dowolnej kolejności i odmianie + minimalna liczba słów', () => {
  assert.equal(engine.gradeOpen('Rano piję ciepłe mleko z dużego kubka i jem kanapkę', breakfast, true).correct, true);
  assert.equal(engine.gradeOpen('Na talerzu leży ser, a obok stoi pusta miska na płatki śniadaniowe', breakfast, true).correct, true);
  const short = engine.gradeOpen('Mleko w kubku', breakfast, true);
  assert.equal(short.correct, false);
  assert.equal(short.tooShort, true);
  const limited = { ...breakfast, minWords: '', maxWords: '5' };
  assert.equal(engine.gradeOpen('Mleko w kubku', limited, true).correct, true);
  assert.equal(engine.gradeOpen('Rano piję ciepłe mleko z dużego kubka', limited, true).tooLong, true);
});

test('pytanie pisemne: uczeń nigdy nie widzi słów kluczowych (widok i rozwiązanie)', () => {
  const { view, key } = engine.prepare(breakfast, { spelling: true });
  const shown = JSON.stringify(view);
  for (const w of ['series', 'ser /', 'białko', 'miska', 'talerz']) assert.ok(!shown.includes(w), `widok zdradza: ${w}`);
  assert.equal(view.minWords, 10);
  const g = engine.grade(breakfast, key, { text: 'nie wiem' }, { spelling: true });
  const sol = JSON.stringify(g.solution);
  for (const w of ['białko', 'miska', 'talerz']) assert.ok(!sol.includes(w), `rozwiązanie zdradza: ${w}`);
  assert.equal(g.solution.sample, breakfast.sample);
});

test('koło ratunkowe w pytaniu pisemnym: tylko przy krótkiej odpowiedzi i jednej serii, bez słowa „kluczowe”', () => {
  const short = { type: 'open', prompt: 'Jak nazywa się najmniejsza cząstka pierwiastka?', minWords: '', maxWords: '3', series: ['atom'], sample: '' };
  const p = engine.prepare(short, {});
  const r = engine.assist(short, p.key, p.view);
  assert.equal(r.ok, true);
  assert.ok(JSON.stringify(r.assist).includes('atom'));
  assert.ok(!/kluczow/i.test(JSON.stringify(r)));
  const long = engine.prepare(breakfast, {});
  assert.equal(engine.assist(breakfast, long.key, long.view).ok, false);
});

/* ---------------- Rejestracja, sprawdzian, losowanie ---------------- */
let quizId, lessonId, ania;

test('sprawdzian: konto oczekujące może pisać; losowe 20 z 24 pytań, bez podpowiedzi i bez sprawdzania na bieżąco', async () => {
  ania = await register('Ania', 'Przykładowa', 'ania@example.com', '4821');
  assert.equal(ania.status, 'pending');
  const cats = (await ania.c('GET', '/api/subjects/chemia')).body.categories;
  quizId = cats.quiz[0].id; lessonId = cats.lesson[0].id;
  const info = (await ania.c('GET', `/api/tests/${quizId}`)).body.test;
  assert.equal(info.questionCount, 20);

  const att = (await ania.c('POST', `/api/tests/${quizId}/attempts`)).body.attemptId;
  let v = (await ania.c('GET', `/api/attempts/${att}`)).body;
  assert.equal(v.progress.total, 20);
  assert.equal(v.question.hint, null);
  // bez kół ratunkowych → odmowa (nic nie jest zabierane)
  assert.ok([409, 422].includes((await ania.c('POST', `/api/attempts/${att}/lifeline`)).status));
  let summary = null;
  for (let i = 0; i < 25 && !summary; i++) {
    v = (await ania.c('GET', `/api/attempts/${att}`)).body;
    if (v.summary) { summary = v.summary; break; }
    const a = (await ania.c('POST', `/api/attempts/${att}/answer`, { serve: v.question.serve, answer: {} })).body;
    assert.equal(a.correct, undefined, 'sprawdzian nie zdradza wyniku pytania');
    assert.equal(a.solution, undefined);
    if (a.finished) summary = a.summary;
  }
  assert.equal(summary.grade, 1);
  assert.equal(summary.points, 1); // ocena 1 → 1 punkt
  assert.equal(summary.attemptsLeft, 2);
  assert.ok(summary.weak.length > 0, 'polecane działy do powtórki');
  const snap = JSON.parse(dbm.one('SELECT snapshot_json FROM test_attempts WHERE id = ?', att).snapshot_json);
  assert.equal(snap.questions.length, 20);
});

test('koło ratunkowe: konto oczekujące nie kupi; po zatwierdzeniu pakiet 3 sztuk jest tańszy; w sprawdzianie tylko raz', async () => {
  assert.equal((await ania.c('POST', '/api/shop/buy', { item: 'lifeline', qty: 3 })).status, 403);
  const a = await login.admin();
  assert.equal((await a('POST', `/api/admin/accounts/${ania.user.id}/approve`)).status, 200);
  dbm.run("INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?, 1000, 'test', ?)", ania.user.id, Date.now());
  const before = (await ania.c('GET', '/api/shop')).body.balance;
  const buy = await ania.c('POST', '/api/shop/buy', { item: 'lifeline', qty: 3 });
  assert.equal(buy.status, 200);
  assert.equal(buy.body.lifelines, 3);
  assert.equal(before - buy.body.balance, 192); // 3 × 80 = 240, −20%

  const att = (await ania.c('POST', `/api/tests/${quizId}/attempts`)).body.attemptId;
  let used = false, blocked = false;
  for (let i = 0; i < 20 && !blocked; i++) {
    const v = (await ania.c('GET', `/api/attempts/${att}`)).body;
    if (v.summary) break;
    const r = await ania.c('POST', `/api/attempts/${att}/lifeline`);
    if (!used && r.status === 200) used = true;
    else if (used && r.status === 409) { blocked = /tylko raz/.test(r.body.error); }
    else assert.equal(r.status, 422, JSON.stringify(r.body)); // pytanie, w którym koło nie działa – nic nie znika
    await ania.c('POST', `/api/attempts/${att}/answer`, { serve: v.question.serve, answer: {} });
  }
  assert.ok(used && blocked, 'drugie koło w tym samym sprawdzianie jest blokowane');
  assert.equal((await ania.c('GET', '/api/shop')).body.lifelines, 2);
  await ania.c('POST', `/api/attempts/${att}/abandon`);
});

test('sprawdzian: najwyżej 3 podejścia; za kolejne podejścia punkty tylko za lepszą ocenę', async () => {
  const att = (await ania.c('POST', `/api/tests/${quizId}/attempts`)).body.attemptId;
  const ab = (await ania.c('POST', `/api/attempts/${att}/abandon`)).body.summary;
  assert.equal(ab.abandoned, true);
  assert.equal(ab.attemptsLeft, 0);
  const fourth = await ania.c('POST', `/api/tests/${quizId}/attempts`);
  assert.equal(fourth.status, 409);
  const sets = dbm.all('SELECT snapshot_json FROM test_attempts WHERE activity_id = ? AND user_id = ?', quizId, ania.user.id)
    .map((r) => JSON.parse(r.snapshot_json).questions.map((q) => q.prompt).sort().join('|'));
  assert.equal(sets.length, 3);
  assert.ok(new Set(sets).size > 1, 'każde podejście losuje pytania z puli');
  const quizPoints = dbm.one("SELECT COALESCE(SUM(amount), 0) n FROM points_ledger WHERE student_id = ? AND activity_id = ?", ania.user.id, quizId).n;
  assert.equal(quizPoints, 1);
});

/* ---------------- Lekcje ---------------- */
test('lekcja: uczeń sprawdza pytanie ze slajdu, koło fortuny i gry są tylko na lekcji', async () => {
  const l = (await ania.c('GET', `/api/lessons/${lessonId}`)).body;
  assert.equal(l.slides.find((s) => s.type === 'wheel').classOnly, true);
  const qs = l.slides.find((s) => s.type === 'question' && s.question.type === 'single');
  const right = qs.question.options.find((o) => o.text === 'nie ma ładunku');
  const wrong = qs.question.options.find((o) => o.text !== 'nie ma ładunku');
  assert.equal((await ania.c('POST', `/api/lessons/${lessonId}/check`, { slideId: qs.id, v: qs.question.v, answer: { choice: right.id } })).body.correct, true);
  assert.equal((await ania.c('POST', `/api/lessons/${lessonId}/check`, { slideId: qs.id, v: qs.question.v, answer: { choice: wrong.id } })).body.correct, false);
});

test('lekcja: +10 za koło fortuny, +5 dla wygranej drużyny; punkty bez konta czekają w rejestrze', async () => {
  const t = await login.teacher();
  const p = (await t('GET', `/api/editor/lessons/${lessonId}/present`)).body;
  assert.equal(p.roster.length, 12); // klasa 7a z rejestru
  const wheel = p.slides.find((s) => s.type === 'wheel');
  const game = p.slides.find((s) => s.type === 'game');
  const aniaR = p.roster.find((x) => x.firstName === 'Ania');
  const bartek = p.roster.find((x) => x.firstName === 'Bartek');
  const award = (body) => t('POST', `/api/editor/lessons/${lessonId}/award`, body);
  assert.equal((await award({ slideId: wheel.id, outcome: 'correct', registryIds: [aniaR.id], runKey: 'wheel-run-0001' })).body.amount, 10);
  // ponowione żądanie nie dubluje punktów
  assert.equal((await award({ slideId: wheel.id, outcome: 'correct', registryIds: [aniaR.id], runKey: 'wheel-run-0001' })).body.count, 0);
  assert.equal((await award({ slideId: wheel.id, outcome: 'correct', registryIds: [bartek.id], runKey: 'wheel-run-0002' })).body.amount, 10);
  const team = [aniaR.id, bartek.id];
  const g = (await award({ slideId: game.id, outcome: 'win', registryIds: team, runKey: 'game-run-0001' })).body;
  assert.equal(g.amount, 5);
  assert.equal(g.count, 2);
  // osoba spoza klasy lekcji nie dostanie punktów
  const outsider = dbm.run("INSERT INTO registry (first_name, last_name, name_key, class_label, created_at, updated_at) VALUES ('Obcy','Uczeń','obcy|uczeń','6b',?,?)", Date.now(), Date.now()).lastInsertRowid;
  assert.equal((await award({ slideId: wheel.id, outcome: 'correct', registryIds: [outsider], runKey: 'wheel-run-0003' })).status, 400);

  // punkty z lekcji czekają w skrzynce – liczą się po odebraniu
  const prof = (await ania.c('GET', '/api/me/profile')).body.points;
  assert.equal(prof.balance, 1 + 1000 - 192);
  assert.equal(prof.pointsToClaim, 15);
  const claimed = (await ania.c('POST', '/api/inbox/claim-all')).body;
  assert.equal(claimed.points, 15);
  assert.equal(claimed.balance, 1 + 1000 - 192 + 10 + 5);
  // Bartek nie ma konta – punkty czekają i pojawią się w skrzynce po rejestracji
  const b = await register('Bartek', 'Przykładowy', 'bartek@example.com', '5937');
  assert.equal((await b.c('GET', '/api/me/profile')).body.points.pointsToClaim, 15);
  assert.equal((await b.c('POST', '/api/inbox/claim-all')).body.balance, 15);
  // odrzucenie konta usuwa punkty zdobyte na koncie, ale punkty z lekcji należą do osoby z rejestru
  dbm.run("INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?, 40, 'test', ?)", b.user.id, Date.now());
  const a = await login.admin();
  assert.equal((await a('POST', `/api/admin/accounts/${b.user.id}/reject`)).status, 200);
  assert.equal(dbm.one('SELECT COUNT(*) n FROM points_ledger WHERE student_id = ?', b.user.id).n, 0);
  const again = await register('Bartek', 'Przykładowy', 'bartek2@example.com', '5938');
  assert.equal((await again.c('GET', '/api/me/profile')).body.points.balance, 15);
});

/* ---------------- Sklep i wygląd ---------------- */
test('sklep: kolory trzeba kupić, pakiet jest tańszy, tekst nie może zlać się z tłem', async () => {
  dbm.run("INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?, 3000, 'test', ?)", ania.user.id, Date.now());
  const before = (await ania.c('GET', '/api/shop')).body;
  assert.equal((await ania.c('PUT', '/api/me/theme', { theme: { bg: 'emerald' } })).status, 403);
  const em = await ania.c('POST', '/api/shop/buy', { item: 'color:emerald' });
  assert.equal(em.status, 200, JSON.stringify(em.body) + ' balance ' + before.balance);
  assert.equal((await ania.c('POST', '/api/shop/buy', { item: 'color:emerald' })).status, 409);
  const bundle = await ania.c('POST', '/api/shop/buy', { item: 'bundle:bundle-neon' });
  assert.equal(bundle.status, 200, JSON.stringify(bundle.body));
  const neonFull = shop.TEXTS.filter((x) => x.fx === 'glow').reduce((s, x) => s + x.price, 0);
  const spent = before.balance - bundle.body.balance - before.prices['color:emerald'];
  assert.ok(spent < neonFull, `pakiet (${spent}) tańszy niż osobno (${neonFull})`);
  // anty-niszczenie: tekst w kolorze tła jest odrzucany przez serwer
  assert.equal(shop.themeProblems({ ...shop.DEFAULT_THEME, bg: 'emerald', text: 'paper' }).length, 0);
  const near = shop.COLORS.find((c) => c.id === 'emerald');
  const sameText = shop.TEXTS.find((x) => x.id === near.id || x.hex === near.hex);
  if (sameText) assert.ok(shop.themeProblems({ ...shop.DEFAULT_THEME, bg: 'emerald', text: sameText.id }).length > 0);
  assert.equal((await ania.c('PUT', '/api/me/theme', { theme: { bg: 'emerald', text: 'neon-pink' } })).status, 200);
  assert.equal((await ania.c('GET', '/api/session')).body.user.theme.bg, 'emerald');
});

test('rejestracja bez e-maila: imię i nazwisko + PIN wystarczą', async () => {
  const a = await login.admin();
  await a('POST', '/api/admin/registry', { firstName: 'Zofia', lastName: 'Bezmailowa', grade: '6', section: 'b' });
  const c = client();
  assert.equal((await c('POST', '/api/register/start', { firstName: 'Zofia', lastName: 'Bezmailowa' })).status, 200);
  assert.equal((await c('GET', '/api/register/state')).body.step, 'code');
  const r = await c('POST', '/api/register/complete', { code: '2749', codeRepeat: '2749' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'pending');
  assert.equal(dbm.one("SELECT email FROM users WHERE first_name = 'Zofia'").email, null);
  assert.equal((await c('GET', '/api/me/profile')).status, 200);
});
