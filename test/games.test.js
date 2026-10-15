// Testy wersji 0.7: gry Saper i Hammer Game – edytor, walidacja, ruchy sprawdzane na serwerze, punkty.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-v7-'));
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
  (await import('../server/games/demo.js')).seedDemoV7();
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
const { cleanGame, buildPlay } = await import('../server/games/engine.js');
const { crosswordCode, letters } = await import('../public/js/shared/game-rules.js');
const { saperDemo } = await import('../server/games/demo.js');
const keyOf = (runId) => { const r = dbm.one('SELECT * FROM game_runs WHERE id = ?', runId); const doc = cleanGame(JSON.parse(r.content_json)); return { doc, ...buildPlay(doc, r.seed) }; };
const games = () => dbm.all("SELECT id, title, content_json FROM activities WHERE kind = 'game'").map((g) => ({ ...g, type: JSON.parse(g.content_json).type }));

/** Rozwiązanie sapera „po kolei” przez API (odpowiedzi z klucza serwera). */
async function solveSaper(c, runId, { breakAt = null } = {}) {
  const { doc, view, key } = keyOf(runId);
  const A = (b) => c('POST', `/api/game-runs/${runId}/act`, b);
  for (const ev of doc.events) {
    const v = view.events.find((x) => x.id === ev.id);
    if (breakAt === ev.kind) return A({ ev: ev.id, choice: v.options.find((o) => o.id !== key[ev.id].correct).id });
    if (ev.kind === 'wire') assert.equal((await A({ ev: ev.id, choice: key[ev.id].correct })).body.ok, true);
    if (ev.kind === 'torch') assert.equal((await A({ ev: ev.id, answer: { text: 'To jest atom.' } })).body.ok, true);
    if (ev.kind === 'trojan') assert.equal((await A({ ev: ev.id, answer: { order: key[ev.id].key.ids } })).body.ok, true);
    if (ev.kind === 'crossword') {
      // zły kod przed krzyżówką – odrzucony, ale bez wybuchu
      assert.equal((await A({ ev: ev.id, part: 'code', text: 'SODA' })).body.ok, false);
      assert.equal((await A({ ev: ev.id, part: 'word', word: ev.words[0].id, text: 'wodor' })).body.ok, true, 'bez polskich znaków też dobrze');
      const bad = await A({ ev: ev.id, part: 'word', word: ev.words[1].id, text: 'AZOT' });
      assert.equal(bad.body.ok, false); assert.ok(!bad.body.exploded, 'pomyłka w krzyżówce nie wysadza bomby');
      for (const w of ev.words.slice(1)) assert.equal((await A({ ev: ev.id, part: 'word', word: w.id, text: w.answer })).body.ok, true);
      assert.equal(crosswordCode(ev), 'SODA');
      assert.equal((await A({ ev: ev.id, part: 'code', text: 'soda' })).body.ok, true);
      assert.equal((await A({ ev: ev.id, part: 'task', i: 0, answer: { text: 'topnienie' } })).body.ok, true);
      assert.equal((await A({ ev: ev.id, part: 'task', i: 1, answer: { cells: { '2,1': 'Fe', '3,1': 'Ca' } } })).body.ok, true);
      assert.equal((await A({ ev: ev.id, part: 'task', i: 2, answer: { values: [true, false, true] } })).body.ok, true);
    }
    if (ev.kind === 'files') {
      const ans = new Set(key[ev.id].answers);
      const decoys = v.files.filter((f) => !ans.has(f.id));
      assert.equal(decoys.length, 12);
      let last;
      for (const f of decoys) last = (await A({ ev: ev.id, file: f.id })).body;
      assert.equal(last.done, true);
    }
  }
  assert.equal((await A({ kind: 'katana-start' })).body.ok, true);
  for (const q of doc.katana.questions) {
    const k = key.katana[q.id];
    const r = await A({ kind: 'katana', id: q.id, ...('answer' in k ? { value: k.answer } : { choice: k.correct }) });
    assert.equal(r.body.ok, true);
  }
  return null;
}

test('0.7: przykładowe gry są opublikowane i widoczne dla ucznia (zakładka Gry)', async () => {
  const g = games();
  assert.deepEqual(g.map((x) => x.type).sort(), ['hammer', 'saper']);
  const { c } = await student('Gracz', 'Pierwszy', '4826');
  const subj = await c('GET', '/api/subjects/chemia');
  assert.equal(subj.body.categories.game.length, 2);
  const t = await login.teacher();
  const list = (await t('GET', '/api/editor/games')).body.games;
  assert.equal(list.length, 2);
  assert.ok(list.every((x) => x.status === 'published' && x.errors === 0));
});

test('0.7: Saper – rozbrojenie daje punkty raz, jeden błąd = wybuch', async () => {
  const { c, id: uid } = await student('Saper', 'Odważny', '5937');
  const gid = games().find((x) => x.type === 'saper').id;
  const info = await c('GET', `/api/games/${gid}`);
  assert.equal(info.status, 200);
  assert.equal(info.body.status.played, 0);
  // widok gry nie zdradza odpowiedzi
  let run = (await c('POST', `/api/games/${gid}/runs`)).body.runId;
  const view = (await c('GET', `/api/game-runs/${run}`)).body;
  const txt = JSON.stringify(view.play);
  assert.ok(!/"correct"|"answer"|SODA|WODÓR|"series"|"sample"/.test(txt), 'w widoku nie ma odpowiedzi');
  const before = (await c('GET', '/api/session')).body.user.points;
  await solveSaper(c, run);
  let fin = (await c('POST', `/api/game-runs/${run}/finish`)).body;
  assert.equal(fin.win, true); assert.equal(fin.points, 30); assert.equal(fin.first, true);
  assert.equal((await c('GET', '/api/session')).body.user.points, before + 30);
  // drugi raz – wygrana bez punktów
  run = (await c('POST', `/api/games/${gid}/runs`)).body.runId;
  await solveSaper(c, run);
  fin = (await c('POST', `/api/game-runs/${run}/finish`)).body;
  assert.equal(fin.win, true); assert.equal(fin.points, 0);
  // błąd przy kablu = wybuch, potem żadnych ruchów i przegrana
  run = (await c('POST', `/api/games/${gid}/runs`)).body.runId;
  const boom = await solveSaper(c, run, { breakAt: 'wire' });
  assert.equal(boom.body.exploded, true);
  const after = await c('POST', `/api/game-runs/${run}/act`, { kind: 'katana-start' });
  assert.equal(after.body.exploded, true);
  fin = (await c('POST', `/api/game-runs/${run}/finish`)).body;
  assert.equal(fin.win, false); assert.equal(fin.points, 0);
  // usunięcie pliku-odpowiedzi też wysadza bombę
  run = (await c('POST', `/api/games/${gid}/runs`)).body.runId;
  const { doc, key } = keyOf(run);
  const fev = doc.events.find((e) => e.kind === 'files');
  assert.equal((await c('POST', `/api/game-runs/${run}/act`, { ev: fev.id, file: key[fev.id].answers[0] })).body.exploded, true);
  // nie można zakończyć cudzego podejścia
  const other = await student('Inny', 'Gracz', '6048');
  assert.equal((await other.c('POST', `/api/game-runs/${run}/finish`)).status, 404);
  // wynik trafia do wyników ucznia
  assert.ok(dbm.one('SELECT COUNT(*) n FROM results WHERE student_id = ? AND activity_id = ?', uid, gid).n >= 3);
});

test('0.7: Hammer Game – procent z pierwszych prób, APPROVED od 55%', async () => {
  const { c } = await student('Młot', 'Mocny', '7159');
  const gid = games().find((x) => x.type === 'hammer').id;
  const play = async (good) => {
    const run = (await c('POST', `/api/games/${gid}/runs`)).body.runId;
    const { doc, view, key } = keyOf(run);
    const A = (b) => c('POST', `/api/game-runs/${run}/act`, b);
    let n = 0; const ok = () => n++ < good;
    for (const card of view.cards) {
      const k = key.cards[card.id];
      const right = ok();
      const body = 'answer' in k ? { value: right ? k.answer : !k.answer } : { choice: right ? k.correct : card.options.find((o) => o.id !== k.correct).id };
      assert.equal((await A({ kind: 'card', id: card.id, ...body })).body.ok, right);
    }
    for (const q of doc.bugs.questions) {
      if (!ok()) await A({ kind: 'bug', q: q.id, answer: view.bugs.answers.find((a) => a.id !== key.bugs[q.id]).id });
      assert.equal((await A({ kind: 'bug', q: q.id, answer: key.bugs[q.id] })).body.ok, true);
    }
    for (const p of doc.pairs) {
      const ids = Object.entries(key.pairs).filter(([, pid]) => pid === p.id).map(([x]) => x);
      if (!ok()) { const wrong = Object.keys(key.pairs).find((x) => key.pairs[x] !== p.id); await A({ kind: 'pair', a: ids[0], b: wrong }); }
      assert.equal((await A({ kind: 'pair', a: ids[0], b: ids[1] })).body.ok, true);
    }
    const answers = {};
    for (const q of view.test) answers[q.id] = ok() ? key.test[q.id].correct : q.options.find((o) => o.id !== key.test[q.id].correct).id;
    const t = (await A({ kind: 'test', answers })).body;
    assert.equal(t.total, 6);
    for (const s of view.approve) { const right = ok(); await A({ kind: 'approve', id: s.id, value: right ? key.approve[s.id] : !key.approve[s.id] }); }
    return (await c('POST', `/api/game-runs/${run}/finish`)).body;
  };
  const total = keyOf((await c('POST', `/api/games/${gid}/runs`)).body.runId).view.total;
  assert.equal(total, 31);
  const low = await play(10); // 10/31 = 32% → DECLINED
  assert.equal(low.win, false); assert.equal(low.pct, 32); assert.equal(low.points, 0);
  const high = await play(31);
  assert.equal(high.win, true); assert.equal(high.pct, 100); assert.equal(high.points, 30);
  const again = await play(31);
  assert.equal(again.points, 0);
});

test('0.7: edytor gier – tworzenie, walidacja, podgląd bez punktów, kopia, usuwanie', async () => {
  const t = await login.teacher();
  const sid = chemId();
  const g = (await t('POST', '/api/editor/games', { title: 'Moja bomba', subjectId: sid, type: 'saper' })).body.game;
  assert.equal(g.content.type, 'saper');
  // pusta gra nie może być opublikowana
  const pub = await t('POST', `/api/editor/games/${g.id}/publish`);
  assert.equal(pub.status, 422); assert.ok(pub.body.problems.length);
  // wpisanie gotowej treści → publikacja
  const save = await t('PUT', `/api/editor/games/${g.id}`, { content: saperDemo(), title: 'Moja bomba 2' });
  assert.equal(save.body.errors, 0);
  assert.equal((await t('POST', `/api/editor/games/${g.id}/publish`)).status, 200);
  // zmiana typu przez PUT jest ignorowana
  await t('PUT', `/api/editor/games/${g.id}`, { content: { ...saperDemo(), type: 'hammer' } });
  assert.equal((await t('GET', `/api/editor/games/${g.id}`)).body.game.content.type, 'saper');
  // zła treść cofa publikację
  const broken = await t('PUT', `/api/editor/games/${g.id}`, { content: { ...saperDemo(), events: [] } });
  assert.equal(broken.body.unpublished, true);
  await t('PUT', `/api/editor/games/${g.id}`, { content: saperDemo() });
  // podgląd: pełna gra, wygrana bez punktów
  const run = (await t('POST', `/api/editor/games/${g.id}/preview`)).body.runId;
  await solveSaper(t, run);
  const fin = (await t('POST', `/api/game-runs/${run}/finish`)).body;
  assert.equal(fin.win, true); assert.equal(fin.points, 0); assert.equal(fin.preview, true);
  // uczeń nie użyje podglądu nauczyciela
  const { c } = await student('Ciekawski', 'Uczeń', '8260');
  assert.equal((await c('GET', `/api/game-runs/${run}`)).status, 404);
  const copy = (await t('POST', `/api/editor/games/${g.id}/duplicate`)).body.id;
  assert.ok(copy);
  assert.equal((await t('DELETE', `/api/editor/games/${copy}`)).status, 200);
  assert.equal(dbm.one('SELECT 1 x FROM activities WHERE id = ?', copy), undefined);
  // krzyżówka: konflikt liter w wspólnym polu = błąd
  const bad = saperDemo();
  bad.events[3].words[2].answer = 'SAD'; // „A” w polu, gdzie WODÓR ma „Ó”
  const v = (await t('PUT', `/api/editor/games/${g.id}`, { content: bad })).body;
  assert.ok(v.errors >= 1);
  assert.deepEqual(letters('wo-dór'), ['W', 'O', 'D', 'Ó', 'R']);
});
