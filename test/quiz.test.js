// Testy modułu testów EDUKRO: składnia komend, ocenianie, przebieg egzaminu i testu nauczającego,
// punkty, przerwy, widoczność wyników dla nauczyciela, uprawnienia edytora i obrazy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-quiz-'));
fs.writeFileSync(path.join(tmp, '.env'), [
  'EDUKRO_ENV=development', 'EDUKRO_INIT_TEACHER_CODE=1111', 'EDUKRO_INIT_ADMIN_CODE=0907',
  'EDUKRO_DEV_MAIL=1', `EDUKRO_DATA_DIR=${tmp}`,
].join('\n'));
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

let base, server, dbm, rules, engine;

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
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.arrayBuffer(), type: ct };
  };
}

before(async () => {
  rules = await import('../public/js/shared/quiz-rules.js');
  engine = await import('../server/quiz/engine.js');
  dbm = await import('../server/db.js');
  const { createApp } = await import('../server/index.js');
  dbm.seed();
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const login = {
  async teacher() { const c = client(); assert.equal((await c('POST', '/api/auth/teacher/login', { teacherId: 1, code: '1111' })).status, 200); return c; },
  async admin() { const c = client(); assert.equal((await c('POST', '/api/auth/admin/login', { code: '0907' })).status, 200); return c; },
  async student() {
    const a = await login.admin();
    const r = await a('POST', '/api/admin/demo-student');
    const c = client();
    assert.equal((await c('POST', '/api/auth/student/login', { firstName: r.body.firstName, lastName: r.body.lastName, code: r.body.code })).status, 200);
    return c;
  },
};

/* ---------------- Składnia „komend” ---------------- */
test('czas: 2.30 = 2 min 30 s, błędne zapisy są opisane', () => {
  assert.equal(rules.parseTime('2.30').seconds, 150);
  assert.equal(rules.parseTime('2').seconds, 120);
  assert.equal(rules.parseTime('0.45').seconds, 45);
  assert.equal(rules.parseTime('1:05').seconds, 65);
  assert.ok(rules.parseTime('').empty);
  assert.match(rules.parseTime('2.5').error, /dwiema cyframi/);
  assert.match(rules.parseTime('1.75').error, /59/);
  assert.equal(rules.parseTime('abc').ok, false);
});

test('luki: nawiasy, alternatywy, błędy składni i podpowiedź o złym nawiasie', () => {
  const ok = rules.parseCloze('Dom może być z (drewna/cegieł/metalu). Drzewo to (roślina).');
  assert.equal(ok.gaps, 2);
  assert.deepEqual(ok.segments[1].answers, ['drewna', 'cegieł', 'metalu']);
  assert.ok(rules.parseCloze('Brak (zamknięcia').errors[0].includes('Brakuje nawiasu'));
  assert.ok(rules.parseCloze('Pusty () nawias').errors[0].includes('pusta'));
  assert.ok(rules.parseCloze('Zwykły \\(nawias\\) i (luka)').gaps === 1);
  const wrong = rules.parseCloze('W nocy jest [ciemno/jasno].', 'open');
  assert.ok(wrong.warnings[0].includes('kwadratowych'));
  const choice = rules.parseCloze('W nocy jest [ciemno/jasno/szaro/mglisto/biało].', 'choice');
  assert.ok(choice.errors[0].includes('najwyżej 4'));
  const v = rules.validateQuestion({ ...rules.emptyQuestion('cloze'), text: 'Drzewo to (roślina).' });
  assert.ok(v.commands.some((c) => c.ok && /Komenda napisana poprawnie/.test(c.msg)));
});

/* ---------------- Ortografio-zaliczacz ---------------- */
test('zaliczacz: polskie znaki i 1–2 litery różnicy; wyłączony = dokładnie', () => {
  const m = engine.textMatches;
  assert.ok(m('lud', 'lód', true));
  assert.ok(m('swiatlo', 'światło', true));
  assert.ok(m('fotosynteza', 'fotosyntaza', true));
  assert.ok(m('mitochondrum', 'mitochondrium', true));
  assert.ok(!m('kot', 'pies', true));
  assert.ok(!m('101', '100', true), 'liczby muszą być dokładne');
  assert.ok(!m('lud', 'lód', false));
  assert.ok(m('Lód', 'lód', false), 'wielkość liter nie ma znaczenia');
  assert.ok(engine.gradeGap('cegieł, drewna', ['drewna', 'cegieł', 'metalu'], true), 'kilka poprawnych naraz');
  assert.ok(!engine.gradeGap('cegieł, plastiku', ['drewna', 'cegieł', 'metalu'], true));
  assert.ok(engine.containsKeyword('Pierwiastek to substancja z atomów jednego rodzaju.', 'atomów', true));
});

/* ---------------- Tabela: grupy i kłódki ---------------- */
test('tabela: grupa w dowolnej kolejności, kłódka ściśle, bez dublowania odpowiedzi', () => {
  const c = (t, s = 'blank', ex = {}) => ({ t, s, lock: false, g: '', ...ex });
  const tb = {
    rows: 2, cols: 4, headerRow: false, headerCol: true, groupRepeat: {},
    cells: [
      [c('Monety', 'show'), c('1 zł', 'blank', { g: 'A' }), c('2 zł', 'blank', { g: 'A' }), c('5 zł', 'blank', { g: 'A' })],
      [c('Banknoty', 'show'), c('10 zł', 'blank', { lock: true }), c('500 zł', 'blank', { lock: true }), c('', 'gone')],
    ],
  };
  let r = engine.gradeTable(tb, { '0,1': '5 zł', '0,2': '1 zł', '0,3': '2 zł', '1,1': '10 zł', '1,2': '500 zł' }, true);
  assert.ok(r.correct, 'grupa w innej kolejności');
  r = engine.gradeTable(tb, { '0,1': '1 zł', '0,2': '2 zł', '0,3': '5 zł', '1,1': '500 zł', '1,2': '10 zł' }, true);
  assert.ok(!r.correct);
  assert.equal(r.parts['1,1'], false, 'kłódka: 500 zł w polu najniższego nominału to błąd');
  r = engine.gradeTable(tb, { '0,1': '1 zł', '0,2': '1 zł', '0,3': '5 zł', '1,1': '10 zł', '1,2': '500 zł' }, true);
  assert.ok(!r.correct, 'ta sama odpowiedź nie może zaliczyć dwóch luk');
  const shared = 'pies/kot/koń';
  const tb2 = { rows: 1, cols: 3, headerRow: false, headerCol: false, groupRepeat: {}, cells: [[c(shared, 'blank', { g: 'A' }), c(shared, 'blank', { g: 'A' }), c(shared, 'blank', { g: 'A' })]] };
  assert.ok(engine.gradeTable(tb2, { '0,0': 'kot', '0,1': 'pies', '0,2': 'koń' }, true).correct);
  assert.ok(!engine.gradeTable(tb2, { '0,0': 'pies', '0,1': 'pies', '0,2': 'koń' }, true).correct);
  tb2.groupRepeat = { A: true };
  assert.ok(engine.gradeTable(tb2, { '0,0': 'pies', '0,1': 'pies', '0,2': 'pies' }, true).correct, 'jawnie włączone powtórzenia');
  // walidacja: grupa z jedną luką i konflikt kłódka+grupa wskazują komórkę
  const bad = { ...rules.emptyQuestion('table'), prompt: 'x', table: { ...tb, cells: [[c('M', 'show'), c('1', 'blank', { g: 'A', lock: true }), c('', 'show'), c('', 'gone')], [c('B', 'show'), c('', 'blank'), c('x', 'show'), c('', 'gone')]] } };
  const probs = rules.validateQuestion(bad).problems.filter((p) => p.level === 'error');
  assert.ok(probs.some((p) => /kłódkę i jednocześnie/.test(p.msg) && p.cell[0] === 0 && p.cell[1] === 1));
  assert.ok(probs.some((p) => /nie ma poprawnej odpowiedzi/.test(p.msg) && p.cell[0] === 1 && p.cell[1] === 1));
  assert.ok(probs.some((p) => /tylko jedną lukę/.test(p.msg)));
});

/* ---------------- Każdy rodzaj: przygotowanie bez odpowiedzi + poprawna ocena ---------------- */
test('przykładowe pytania: widok ucznia nie zdradza odpowiedzi, poprawna odpowiedź jest zaliczana', async () => {
  const { seedDemo } = await import('../server/quiz/demo.js');
  seedDemo();
  const { parseDoc } = await import('../server/quiz/attempts.js');
  const a = dbm.one("SELECT * FROM activities WHERE title LIKE 'Przykład:%'");
  const { questions, settings } = parseDoc(a);
  assert.equal(new Set(questions.map((q) => q.type)).size, 15, 'wszystkie 15 rodzajów');
  for (const q of questions) {
    const { view, key } = engine.prepare(q, settings);
    const json = JSON.stringify(view);
    assert.ok(!/"correct"|"answer"|"lock"|"g":/.test(json), `${q.type}: widok zawiera klucz`);
    if (q.type === 'cloze') assert.ok(!json.includes('neutrony'));
    if (q.type === 'table') assert.ok(!json.includes('ciało stałe'));
    if (q.type === 'listen') assert.ok(!json.includes(q.phrase), 'tekst lektora nie jest jawny');
    // poprawna odpowiedź zbudowana z klucza
    const ans = solve(q, view, key);
    const g = engine.grade(q, key, ans, settings);
    assert.ok(g.correct, `${q.type}: poprawna odpowiedź nie została zaliczona`);
    const bad = engine.grade(q, key, {}, settings);
    assert.ok(!bad.correct, `${q.type}: pusta odpowiedź zaliczona`);
  }
});

function solve(q, view, key) {
  switch (q.type) {
    case 'single': return { choice: key.ids[q.correct] };
    case 'multi': return { choices: key.ids.filter((_, i) => q.options[i].correct) };
    case 'truefalse': return { values: q.statements.map((s) => s.answer) };
    case 'open': return { text: 'To substancja z atomów jednego rodzaju.' };
    case 'number': return { value: q.value };
    case 'match': return { links: Object.fromEntries(q.pairs.map((_, i) => [`L${i}`, key.right[i]])) };
    case 'order_words': {
      const words = rules.sentenceWords(q.sentence); const used = new Set();
      return { sequence: words.map((w) => { const id = Object.keys(key.tiles).find((k) => key.tiles[k] === w && !used.has(k)); used.add(id); return id; }) };
    }
    case 'timeline': return { order: key.ids };
    case 'cloze': return { gaps: rules.parseCloze(q.text).segments.filter((s) => s.t === 'gap').map((g) => g.answers[0]) };
    case 'cloze_choice': return { gaps: key.gaps.map((ids) => ids[0]) };
    case 'table': {
      const cells = {};
      q.table.cells.forEach((row, r) => row.forEach((c, cc) => { if (c.s === 'blank') cells[`${r},${cc}`] = rules.parseSlash(c.t)[0]; }));
      return { cells };
    }
    case 'categorize': return { placement: key.items };
    case 'image_labels': return { placement: Object.fromEntries(key.labels.map((id, i) => [i, id])) };
    case 'data': return { answers: ['100°C', 'około 71%', 'z wodoru i tlenu'] };
    case 'listen': return { text: rules.showSpeech(view.speech.code, view.speech.seed).toUpperCase() + '.' };
    default: return {};
  }
}

/* ---------------- Edytor: tworzenie, szkic, publikacja z listą problemów ---------------- */
let examId, teachingId;
test('edytor: szkic może być niekompletny, publikacja wskazuje pytanie i komórkę do poprawy', async () => {
  const t = await login.teacher();
  const subj = (await t('GET', '/api/editor/subjects')).body.subjects;
  const chem = subj.find((s) => s.name === 'Chemia');
  const created = await t('POST', '/api/editor/tests', { title: 'Egzamin testowy', subjectId: chem.id, kind: 'exam_test', questionCount: 3, settings: { maxMistakes: 1, defaultTime: '0.20' } });
  assert.equal(created.status, 200);
  examId = created.body.test.id;
  assert.equal(created.body.test.questions.length, 3);
  const pub1 = await t('POST', `/api/editor/tests/${examId}/publish`);
  assert.equal(pub1.status, 422);
  assert.ok(pub1.body.problems.some((p) => p.q === 0 && /rodzaj pytania/.test(p.msg)));

  const q = (type, extra) => ({ ...rules.emptyQuestion(type), ...extra });
  const table = rules.emptyTable(2, 2);
  table.cells[1][1] = { t: '', s: 'blank', lock: false, g: '' };
  const save = await t('PUT', `/api/editor/tests/${examId}`, { questions: [
    q('single', { prompt: 'Symbol sodu?', options: ['Na', 'S', 'So', 'N'], correct: 0 }),
    q('number', { prompt: 'Ile to 2+2?', value: '4' }),
    q('table', { prompt: 'Tabela', table }),
  ] });
  assert.equal(save.status, 200);
  const pub2 = await t('POST', `/api/editor/tests/${examId}/publish`);
  assert.equal(pub2.status, 422);
  const cellProblem = pub2.body.problems.find((p) => p.q === 2 && p.cell && p.level === 'error');
  assert.deepEqual(cellProblem.cell, [1, 1], 'problem wskazuje komórkę B2');

  table.cells[1][1].t = 'tak';
  table.cells[0] = [{ t: 'A', s: 'show' }, { t: 'B', s: 'show' }];
  table.cells[1][0] = { t: 'x', s: 'show' };
  await t('PUT', `/api/editor/tests/${examId}`, { questions: [
    q('single', { prompt: 'Symbol sodu?', options: ['Na', 'S', 'So', 'N'], correct: 0 }),
    q('number', { prompt: 'Ile to 2+2?', value: '4' }),
    q('cloze', { prompt: 'Uzupełnij', text: 'Woda to (H2O).' }),
  ] });
  assert.equal((await t('POST', `/api/editor/tests/${examId}/publish`)).status, 200);

  const t2 = await t('POST', '/api/editor/tests', { title: 'Nauka testowa', subjectId: chem.id, kind: 'teaching_test', questionCount: 1, settings: { points: { teachingFirst: 15 } } });
  teachingId = t2.body.test.id;
  await t('PUT', `/api/editor/tests/${teachingId}`, { questions: [
    q('single', { prompt: 'Symbol tlenu?', options: ['O', 'T', 'Tl', 'Ox'], correct: 0, explanation: 'Tlen to O (oxygenium).' }),
    q('truefalse', { prompt: 'Prawda?', statements: [{ text: 'a', answer: true }, { text: 'b', answer: false }, { text: 'c', answer: true }] }),
  ] });
  assert.equal((await t('POST', `/api/editor/tests/${teachingId}/publish`)).status, 200);

  // edycja opublikowanego testu, która psuje pytanie → wraca do szkicu
  const broken = await t('PUT', `/api/editor/tests/${teachingId}`, { questions: [q('single', { prompt: 'x', options: ['', '', '', ''] })] });
  assert.equal(broken.body.unpublished, true);
  await t('PUT', `/api/editor/tests/${teachingId}`, { questions: [
    q('single', { prompt: 'Symbol tlenu?', options: ['O', 'T', 'Tl', 'Ox'], correct: 0, explanation: 'Tlen to O (oxygenium).' }),
    q('truefalse', { prompt: 'Prawda?', statements: [{ text: 'a', answer: true }, { text: 'b', answer: false }, { text: 'c', answer: true }] }),
  ] });
  assert.equal((await t('POST', `/api/editor/tests/${teachingId}/publish`)).status, 200);
});

test('edytor: uczeń i gość nie mają dostępu; nauczyciel tylko do swoich przedmiotów', async () => {
  const s = await login.student();
  assert.equal((await s('GET', '/api/editor/tests')).status, 403);
  assert.equal((await client()('GET', `/api/editor/tests/${examId}`)).status, 401);
  const a = await login.admin();
  const bio = (await a('GET', '/api/admin/subjects')).body.subjects.find((x) => x.name === 'Biologia');
  const nt = await a('POST', '/api/admin/teachers', { firstName: 'Adam', lastName: 'Nowak', subjectIds: [bio.id] });
  assert.equal(nt.status, 200, JSON.stringify(nt.body));
  const other = client();
  const code = nt.body.temporaryCode;
  assert.equal((await other('POST', '/api/auth/teacher/login', { teacherId: nt.body.teacher.id, code })).status, 200);
  assert.equal((await other('POST', '/api/auth/change-code', { current: code, next: '4826', nextRepeat: '4826' })).status, 200);
  assert.equal((await other('GET', '/api/editor/subjects')).body.subjects.length, 1, 'tylko biologia');
  assert.equal((await other('GET', `/api/editor/tests/${examId}`)).status, 403);
  assert.equal((await other('PUT', `/api/editor/tests/${examId}`, { title: 'hack' })).status, 403);
  // administrator ma dostęp do wszystkiego
  assert.equal((await a('GET', `/api/editor/tests/${examId}`)).status, 200);
});

/* ---------------- Egzamin ---------------- */
async function startExam(s) {
  const st = await s('POST', `/api/tests/${examId}/attempts`);
  assert.equal(st.status, 200, JSON.stringify(st.body));
  return st.body.attemptId;
}
async function answerCurrent(s, att, good) {
  const cur = (await s('GET', `/api/attempts/${att}`)).body;
  const q = cur.question;
  let ans;
  if (q.type === 'single') ans = { choice: q.options.find((o) => (good ? o.text === 'Na' : o.text === 'S')).id };
  if (q.type === 'number') ans = { value: good ? '4' : '5' };
  if (q.type === 'cloze') ans = { gaps: [good ? 'h2o' : 'H3O'] };
  return (await s('POST', `/api/attempts/${att}/answer`, { serve: q.serve, answer: ans })).body;
}

test('egzamin: zegar na serwerze, przegrana po przekroczeniu błędów → 20 min przerwy', async () => {
  const s = await login.student();
  const info = await s('GET', `/api/tests/${examId}`);
  assert.equal(info.body.test.maxMistakes, 1);
  const att = await startExam(s);
  const cur = (await s('GET', `/api/attempts/${att}`)).body;
  assert.ok(cur.timer && cur.timer.totalMs === 20000, 'czas z ustawień domyślnych');
  assert.ok(!JSON.stringify(cur).includes('"correct"'));
  // ponowne pobranie nie resetuje zegara ani pytania
  const again = (await s('GET', `/api/attempts/${att}`)).body;
  assert.equal(again.question.serve, cur.question.serve);
  let r = await answerCurrent(s, att, false);
  assert.equal(r.correct, false);
  assert.equal(r.solution, undefined, 'egzamin nie zdradza odpowiedzi');
  // podwójne wysłanie tej samej odpowiedzi jest odrzucane
  assert.equal((await s('POST', `/api/attempts/${att}/answer`, { serve: cur.question.serve, answer: {} })).status, 409);
  r = await answerCurrent(s, att, false);
  assert.equal(r.finished, true);
  assert.equal(r.summary.status, 'failed');
  assert.ok(r.summary.retryAt - Date.now() > 19 * 60e3);
  const blocked = await s('POST', `/api/tests/${examId}/attempts`);
  assert.equal(blocked.status, 409);
  assert.ok(blocked.body.retryAt);
  // po 20 minutach można podejść ponownie
  dbm.run("UPDATE test_attempts SET finished_at = finished_at - 21 * 60000 WHERE activity_id = ?", examId);
  assert.equal((await s('POST', `/api/tests/${examId}/attempts`)).status, 200);
});

test('egzamin: przekroczenie czasu liczy się jako błąd (także po zamknięciu karty)', async () => {
  const s = await login.student();
  const st = await s('GET', `/api/tests/${examId}`);
  const att = st.body.status.activeAttemptId;
  assert.ok(att, 'trwające podejście jest wznawiane');
  const cur = (await s('GET', `/api/attempts/${att}`)).body;
  const row = dbm.one('SELECT state_json FROM test_attempts WHERE id = ?', att);
  const state = JSON.parse(row.state_json);
  state.current.deadline = Date.now() - 10000;
  dbm.run('UPDATE test_attempts SET state_json = ? WHERE id = ?', JSON.stringify(state), att);
  const next = (await s('GET', `/api/attempts/${att}`)).body;
  assert.notEqual(next.question?.serve, cur.question.serve);
  assert.match(next.notice, /Czas/);
  assert.equal(next.mistakes, 1);
  await s('POST', `/api/attempts/${att}/abandon`);
});

test('egzamin: pierwsze zaliczenie → punkty i wynik u nauczyciela; powtórka po tygodniu → mniej punktów, bez wysyłki', async () => {
  const s = await login.student();
  dbm.run("UPDATE test_attempts SET finished_at = finished_at - 21 * 60000 WHERE activity_id = ?", examId);
  const att = await startExam(s);
  await answerCurrent(s, att, true);
  await answerCurrent(s, att, false); // 1 błąd jest dozwolony
  const end = await answerCurrent(s, att, true);
  assert.equal(end.summary.status, 'passed');
  assert.equal(end.summary.points, 100);
  assert.equal(end.summary.sentToTeacher, true);
  assert.equal(end.summary.score, 2);
  // nauczyciel widzi wynik, choć uczeń nie włączył udostępniania
  const t = await login.teacher();
  const res = (await t('GET', '/api/teacher/results')).body.results;
  assert.ok(res.some((x) => x.title === 'Egzamin testowy' && x.direct === 1 && x.lastName === 'Testowy'));
  // tydzień przerwy
  const wait = await s('POST', `/api/tests/${examId}/attempts`);
  assert.equal(wait.status, 409);
  assert.ok(wait.body.retryAt - Date.now() > 6.9 * 24 * 3600e3);
  dbm.run("UPDATE test_attempts SET finished_at = finished_at - 8 * 24 * 3600e3 WHERE activity_id = ?", examId);
  const att2 = await startExam(s);
  for (let i = 0; i < 3; i++) await answerCurrent(s, att2, true);
  const sum = (await s('GET', `/api/attempts/${att2}/summary`)).body.summary;
  assert.equal(sum.status, 'passed');
  assert.equal(sum.points, 10);
  assert.equal(sum.sentToTeacher, false);
  const res2 = (await t('GET', '/api/teacher/results')).body.results.filter((x) => x.title === 'Egzamin testowy');
  assert.equal(res2.length, 1, 'powtórka nie trafia do nauczyciela');
  const prof = (await s('GET', '/api/me/profile')).body;
  assert.equal(prof.points.balance, 110);
  assert.equal(prof.user.points, 110);
});

/* ---------------- Test nauczający ---------------- */
test('test nauczający: po błędzie poprawna odpowiedź + wyjaśnienie, pytanie wraca do skutku, punkty tylko raz', async () => {
  const s = await login.student();
  const before = (await s('GET', '/api/me/profile')).body.points.balance;
  const att = (await s('POST', `/api/tests/${teachingId}/attempts`)).body.attemptId;
  let cur = (await s('GET', `/api/attempts/${att}`)).body;
  assert.equal(cur.timer, null, 'bez zegara');
  // błąd w pierwszym pytaniu
  const wrong = cur.question.options.find((o) => o.text === 'T');
  let r = (await s('POST', `/api/attempts/${att}/answer`, { serve: cur.question.serve, answer: { choice: wrong.id } })).body;
  assert.equal(r.correct, false);
  assert.equal(r.willRepeat, true);
  assert.equal(r.explanation, 'Tlen to O (oxygenium).');
  assert.equal(cur.question.options.find((o) => o.id === r.solution.correct).text, 'O');
  // drugie pytanie dobrze
  cur = (await s('GET', `/api/attempts/${att}`)).body;
  r = (await s('POST', `/api/attempts/${att}/answer`, { serve: cur.question.serve, answer: { values: [true, false, true] } })).body;
  assert.equal(r.correct, true);
  // powtórka pierwszego – znowu źle, potem dobrze
  cur = (await s('GET', `/api/attempts/${att}`)).body;
  assert.equal(cur.question.isRepeat, true);
  r = (await s('POST', `/api/attempts/${att}/answer`, { serve: cur.question.serve, answer: { choice: cur.question.options.find((o) => o.text === 'Ox').id } })).body;
  assert.equal(r.finished, undefined);
  cur = (await s('GET', `/api/attempts/${att}`)).body;
  r = (await s('POST', `/api/attempts/${att}/answer`, { serve: cur.question.serve, answer: { choice: cur.question.options.find((o) => o.text === 'O').id } })).body;
  assert.equal(r.finished, true);
  assert.equal(r.summary.status, 'completed');
  assert.equal(r.summary.score, 1, 'za pierwszym razem dobrze: 1 z 2');
  assert.equal(r.summary.points, 15);
  // drugi raz – bez punktów, ale można powtarzać od razu
  const att2 = (await s('POST', `/api/tests/${teachingId}/attempts`)).body.attemptId;
  for (let i = 0; i < 2; i++) {
    cur = (await s('GET', `/api/attempts/${att2}`)).body;
    const ans = cur.question.type === 'single' ? { choice: cur.question.options.find((o) => o.text === 'O').id } : { values: [true, false, true] };
    r = (await s('POST', `/api/attempts/${att2}/answer`, { serve: cur.question.serve, answer: ans })).body;
  }
  assert.equal(r.summary.points, 0);
  assert.equal((await s('GET', '/api/me/profile')).body.points.balance, before + 15);
});

test('podgląd nauczyciela: bez wyników i punktów, tylko własne podejście', async () => {
  const t = await login.teacher();
  const p = await t('POST', `/api/editor/tests/${teachingId}/preview`);
  assert.equal(p.status, 200);
  const cur = (await t('GET', `/api/attempts/${p.body.attemptId}`)).body;
  assert.equal(cur.attempt.preview, true);
  const s = await login.student();
  assert.equal((await s('GET', `/api/attempts/${p.body.attemptId}`)).status, 404, 'cudze podejście');
  const before = dbm.one('SELECT COUNT(*) n FROM results').n;
  await t('POST', `/api/attempts/${p.body.attemptId}/answer`, { serve: cur.question.serve, answer: {} });
  assert.equal(dbm.one('SELECT COUNT(*) n FROM results').n, before);
});

/* ---------------- Obrazy ---------------- */
test('obrazy: tylko prawdziwe obrazy od nauczyciela, odczyt tylko po zalogowaniu', async () => {
  const t = await login.teacher();
  const png = fs.readFileSync(new URL('../server/quiz/demo-assets/atom.png', import.meta.url)).toString('base64');
  const up = await t('POST', '/api/media', { mime: 'image/png', data: png });
  assert.equal(up.status, 200);
  const fake = await t('POST', '/api/media', { mime: 'image/png', data: Buffer.from('<svg onload=alert(1)>').toString('base64') });
  assert.equal(fake.status, 400);
  const s = await login.student();
  assert.equal((await s('POST', '/api/media', { mime: 'image/png', data: png })).status, 403);
  const got = await s('GET', up.body.url);
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/png');
  assert.equal((await client()('GET', up.body.url)).status, 401);
});

test('lista przedmiotu pokazuje testy ze statusem ucznia', async () => {
  const s = await login.student();
  const d = (await s('GET', '/api/subjects/chemia')).body;
  const exam = d.categories.exam_test.find((x) => x.id === examId);
  assert.equal(exam.isTest, true);
  assert.equal(exam.questionCount, 3);
  assert.equal(exam.status.canStart, false);
  assert.equal(exam.status.reason, 'passed');
});

test('zadanie na słuch: interpunkcja i wielkość liter nie mają znaczenia, inne zapisy, dokładna pisownia', () => {
  const q = { type: 'listen', prompt: 'x', phrase: 'The weather is beautiful today.', lang: 'en-GB', voice: '', accept: 'the weather\'s beautiful today', exact: true };
  const { view, key } = engine.prepare(q, {});
  assert.equal(rules.showSpeech(view.speech.code, view.speech.seed), q.phrase);
  assert.ok(engine.grade(q, key, { text: 'the weather is beautiful today' }).correct);
  assert.ok(engine.grade(q, key, { text: 'The weather, is beautiful today!' }).correct);
  assert.ok(engine.grade(q, key, { text: "The weather's beautiful today" }).correct, 'inny zapis');
  assert.ok(!engine.grade(q, key, { text: 'The wether is beautiful today' }).correct, 'literówka przy dokładnej pisowni');
  assert.ok(engine.grade({ ...q, exact: false }, key, { text: 'The wether is beautiful today' }, { spelling: true }).correct, 'literówka bez dokładnej pisowni');
  const v = rules.validateQuestion({ ...q, phrase: '' });
  assert.ok(v.problems.some((p) => p.field === 'phrase'));
  assert.equal(engine.assist(q, key, view).assist.text, 'The weather is');
});
