// Jednorazowe przygotowanie konta „Jan Kossakowski” i materiałów do wypróbowania nowych funkcji.
// Uruchom: URUCHOM-PRZYKLAD-JAN.bat  (albo: node tools/setup-jan.mjs). Można uruchamiać wielokrotnie – niczego nie dubluje.
// Skrypt działa przez prawdziwe API aplikacji (rejestracja, edytor lekcji i testów, wyodrębnianie, sklep).
import crypto from 'node:crypto';

const PIN = '6712';
const FIRST = 'Jan', LAST = 'Kossakowski';
const POINTS = 2800; // pochwała 2500 + zmiana koloru tła, z zapasem

const dbm = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { sha256 } = await import('../server/security.js');
const { newId } = await import('../public/js/shared/quiz-rules.js');
const demo = await import('../server/quiz/demo.js');
const { cleanSlides } = await import('../server/lessons/schema.js');
const { effectiveCount } = await import('../public/js/shared/quiz-rules.js');

dbm.seed();
// przykładowe testy i lekcja (normalnie dodaje je serwer przy pierwszym uruchomieniu)
const { config } = await import('../server/config.js');
if (!config.production) { demo.seedDemo(); demo.seedDemoV3(); demo.seedDemoV6(); (await import('../server/games/demo.js')).seedDemoV7(); }
const { one, run, now } = dbm;
const server = createApp();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

function plantSession(userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  const t = now();
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)', sha256(token), userId, t, t + 3600e3, t);
  return token;
}
function client(token) {
  const jar = token ? { edukro_sid: token } : {};
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-EDUKRO': '1' };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${json.error || ''}`);
    return json;
  };
}
const log = (m) => console.log('  ✔ ' + m);

const adminRow = one("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
const teacherRow = one("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1");
const chem = one("SELECT id FROM subjects WHERE slug = 'chemia'");
const admin = client(plantSession(adminRow.id));
const teacher = client(plantSession(teacherRow.id));

console.log('\nPrzygotowuję konto i materiały…\n');
try {
  /* 1. Rejestr + konto ucznia (prawdziwa rejestracja, potem zatwierdzenie) */
  let user = one("SELECT * FROM users WHERE role = 'student' AND name_key = ?", dbm.nameKey(FIRST, LAST));
  if (!user) {
    if (!one('SELECT 1 FROM registry WHERE name_key = ?', dbm.nameKey(FIRST, LAST))) {
      await admin('POST', '/api/admin/registry', { firstName: FIRST, lastName: LAST, grade: '7', section: 'a' });
      log('dodano do rejestru: Jan Kossakowski (klasa 7a)');
    }
    const c = client();
    await c('POST', '/api/register/start', { firstName: FIRST, lastName: LAST });
    await c('POST', '/api/register/complete', { code: PIN, codeRepeat: PIN });
    user = one("SELECT * FROM users WHERE role = 'student' AND name_key = ?", dbm.nameKey(FIRST, LAST));
    log(`utworzono konto ucznia (kod ${PIN})`);
  } else log('konto ucznia już istnieje');
  if (user.status !== 'active') { await admin('POST', `/api/admin/accounts/${user.id}/approve`); log('konto zatwierdzone'); }

  /* 2. Lekcja z każdym rodzajem slajdu */
  const LESSON = 'Lekcja przykładowa – wszystkie typy slajdów';
  if (!one("SELECT 1 FROM activities WHERE kind = 'lesson' AND title = ?", LESSON)) {
    const atom = demo.addImage('atom.png');
    const { lesson } = await teacher('POST', '/api/editor/lessons', { title: LESSON, summary: 'Slajdy: tytułowy, informacyjny, do przepisania, fiszki, pytania, burza mózgów, koło fortuny i trzy gry klasowe.', subjectId: chem.id });
    const slides = cleanSlides(demo.demoLesson(atom)).map((s) => (s.type === 'title' ? { ...s, title: LESSON } : s));
    await teacher('PUT', `/api/editor/lessons/${lesson.id}`, { slides });
    // lekcja jest wspólna dla klas – publikujemy ją klasie 7a (tak jak po przeprowadzeniu jej z tą klasą)
    await teacher('POST', `/api/editor/lessons/${lesson.id}/complete`, { classLabel: '7a' });
    log(`lekcja „${LESSON}” (${slides.length} slajdów, przerobiona z klasą 7a i dla niej opublikowana)`);
  } else log('lekcja przykładowa już istnieje');

  /* 3. Test egzaminacyjny z wyodrębnionych pytań testu nauczającego „wszystkie typy pytań” */
  const EXAM = 'Egzamin z wyodrębnionych pytań (wszystkie typy)';
  if (!one("SELECT 1 FROM activities WHERE kind = 'exam_test' AND title = ?", EXAM)) {
    const { sources } = await teacher('GET', '/api/editor/sources');
    const src = sources.find((s) => s.kind === 'teaching_test' && /wszystkie (typy|rodzaje) pytań/i.test(s.title));
    if (!src) throw new Error('Nie znaleziono testu nauczającego „wszystkie typy pytań”.');
    const data = await teacher('GET', `/api/editor/sources/${src.id}`);
    const { test } = await teacher('POST', '/api/editor/tests', { title: EXAM, summary: 'Pytania wyodrębnione z testu nauczającego.', subjectId: chem.id, kind: 'exam_test', questionCount: 0 });
    const questions = data.questions.map((q) => { const c = JSON.parse(JSON.stringify(q)); delete c.catName; c.id = newId(); c.cat = ''; return c; });
    const settings = { ...test.settings, maxMistakes: Math.floor(effectiveCount({ settings: test.settings, questions }) / 5) };
    await teacher('PUT', `/api/editor/tests/${test.id}`, { questions, settings });
    await teacher('POST', `/api/editor/tests/${test.id}/publish`);
    log(`test egzaminacyjny „${EXAM}”: ${questions.length} pytań z „${src.title}”, dozwolone błędy: ${settings.maxMistakes}`);
  } else log('test egzaminacyjny już istnieje');

  /* 4. Sprawdzian z banalnymi pytaniami (20, trzy działy) */
  const QUIZ = 'Sprawdzian banalny (do wypróbowania)';
  if (!one("SELECT 1 FROM activities WHERE kind = 'quiz' AND title = ?", QUIZ)) {
    const cats = [{ id: newId(), name: 'Rachunki' }, { id: newId(), name: 'Przyroda' }, { id: newId(), name: 'Polska' }];
    const S = (prompt, good, bad, c) => ({ type: 'single', prompt, options: [good, ...bad], correct: 0, cat: cats[c].id });
    const questions = [
      S('Ile to 2 + 2?', '4', ['3', '5', '22'], 0), S('Ile to 10 − 5?', '5', ['3', '15', '2'], 0), S('Ile to 3 · 3?', '9', ['6', '12', '33'], 0),
      S('Ile to 10 : 2?', '5', ['8', '20', '2'], 0), S('Ile to 1 + 1?', '2', ['1', '3', '11'], 0), S('Ile to 5 + 5?', '10', ['25', '0', '55'], 0),
      S('Ile to 100 − 1?', '99', ['101', '90', '9'], 0),
      S('Jakiego koloru jest trawa?', 'zielonego', ['czerwonego', 'fioletowego', 'czarnego'], 1), S('Co pijemy najczęściej?', 'wodę', ['benzynę', 'olej', 'klej'], 1),
      S('Które zwierzę szczeka?', 'pies', ['kot', 'krowa', 'ryba'], 1), S('Co świeci w dzień na niebie?', 'Słońce', ['Księżyc', 'latarnia', 'komar'], 1),
      S('Ile łap ma pies?', 'cztery', ['dwie', 'osiem', 'sto'], 1), S('Woda w zamrażarce zamienia się w…', 'lód', ['ogień', 'piasek', 'dym'], 1),
      S('Ile dni ma tydzień?', 'siedem', ['pięć', 'dziesięć', 'trzy'], 1),
      S('Stolicą Polski jest…', 'Warszawa', ['Berlin', 'Paryż', 'Rzym'], 2), S('Nad jakim morzem leży Polska?', 'Bałtyckim', ['Czarnym', 'Śródziemnym', 'Czerwonym'], 2),
      S('Jak nazywa się nasza największa rzeka?', 'Wisła', ['Amazonka', 'Nil', 'Sekwana'], 2), S('Jakie barwy ma polska flaga?', 'biała i czerwona', ['niebieska i żółta', 'zielona i biała', 'czarna i złota'], 2),
      S('W jakim języku mówi się w Polsce?', 'po polsku', ['po chińsku', 'po japońsku', 'po fińsku'], 2), S('Najwyższe polskie góry to…', 'Tatry', ['Alpy', 'Himalaje', 'Andy'], 2),
    ];
    const { test } = await teacher('POST', '/api/editor/tests', { title: QUIZ, summary: 'Same łatwe pytania – do sprawdzenia, jak działa sprawdzian, ocena i punkty.', subjectId: chem.id, kind: 'quiz', questionCount: 0 });
    const settings = { ...test.settings, categories: cats, deadline: now() + 90 * 86400e3, drawCount: 0 };
    await teacher('PUT', `/api/editor/tests/${test.id}`, { questions, settings });
    await teacher('POST', `/api/editor/tests/${test.id}/publish`);
    log(`sprawdzian „${QUIZ}”: ${questions.length} pytań, termin za 90 dni`);
  } else log('sprawdzian już istnieje');

  /* 5. Punkty i zakupy na koncie ucznia */
  const GRANT = 'Punkty startowe do wypróbowania sklepu';
  if (!one('SELECT 1 FROM points_ledger WHERE student_id = ? AND reason = ?', user.id, GRANT)) {
    run('INSERT INTO points_ledger (student_id, amount, reason, created_at) VALUES (?,?,?,?)', user.id, POINTS, GRANT, now());
    log(`dodano ${POINTS} punktów`);
  }
  const jan = client();
  await jan('POST', '/api/auth/student/login', { firstName: FIRST, lastName: LAST, code: PIN });
  const shop = await jan('GET', '/api/shop');
  if (!shop.owned.includes('color:emerald')) { await jan('POST', '/api/shop/buy', { item: 'color:emerald' }); log('kupiono kolor „Szmaragd”'); }
  await jan('PUT', '/api/me/theme', { theme: { bg: 'emerald' } });
  log('ustawiono tło: Szmaragd');

  /* 6. Nowości wersji 0.4: skrzynka, punkty do odebrania, test tymczasowy z nagrodą, promocja */
  const GIFT = 'Prezent na start EDUKRO 0.4 – odbierz go w skrzynce!';
  if (!one('SELECT 1 FROM point_grants WHERE student_id = ? AND message = ?', user.id, GIFT)) {
    await admin('POST', '/api/grants', { studentIds: [user.id], amount: 100, message: GIFT });
    log('skrzynka: 100 pkt od administratora do odebrania');
  }
  const lessonRow = one("SELECT id, content_json FROM activities WHERE kind = 'lesson' AND title = ?", LESSON);
  const wheel = lessonRow ? JSON.parse(lessonRow.content_json).slides.find((s) => s.type === 'wheel') : null;
  if (wheel && user.registry_id) {
    const r = await teacher('POST', `/api/editor/lessons/${lessonRow.id}/award`, { slideId: wheel.id, outcome: 'correct', registryIds: [user.registry_id], runKey: 'jan-demo-wheel-0001', classLabel: '7a' });
    if (r.count) log('skrzynka: +10 pkt z koła fortuny na lekcji do odebrania');
  }
  const TEMP = 'Wyzwanie tygodnia (test tymczasowy z nagrodą)';
  if (!one("SELECT 1 FROM activities WHERE title = ? AND status != 'archived'", TEMP)) {
    const S = (prompt, good, bad) => ({ type: 'single', prompt, options: [good, ...bad], correct: 0 });
    const questions = [S('Symbol chemiczny tlenu to…', 'O', ['Ox', 'Tl', 'H']), S('Woda to H₂O. Ile atomów wodoru ma jedna cząsteczka wody?', '2', ['1', '3', '4']), S('Który pierwiastek jest gazem szlachetnym?', 'hel', ['sód', 'żelazo', 'węgiel'])];
    const { test } = await teacher('POST', '/api/editor/tests', { title: TEMP, summary: 'Znika po tygodniu! Za ukończenie: kolor „Rubin”.', subjectId: chem.id, kind: 'teaching_test', questionCount: 0 });
    await teacher('PUT', `/api/editor/tests/${test.id}`, { questions, settings: { ...test.settings, expiresAt: now() + 7 * 86400e3, reward: { type: 'item', item: 'color:ruby' } } });
    await teacher('POST', `/api/editor/tests/${test.id}/publish`);
    log(`test tymczasowy „${TEMP}” – znika za 7 dni, nagroda: kolor „Rubin”`);
  } else log('test tymczasowy już istnieje');
  const PROMO = 'Na start wersji 0.4';
  if (!one('SELECT 1 FROM shop_promos WHERE note = ? AND ended_at IS NULL AND ends_at > ?', PROMO, now())) {
    await admin('POST', '/api/admin/shop/promos', { item: 'color:gold', off: 50, hours: 168, note: PROMO });
    log('promocja w sklepie: kolor „Złoty” −50% przez tydzień');
  }
  /* 7. Nowości wersji 0.5: profil (awatar, ramka, tytuł, muzyka), pakiet administratora, gwiazda lekcji */
  const GRANT5 = 'Punkty na nowości EDUKRO 0.5 (profil, ramki, tytuły, muzyka)';
  if (!one('SELECT 1 FROM points_ledger WHERE student_id = ? AND reason = ?', user.id, GRANT5)) {
    run('INSERT INTO points_ledger (student_id, amount, reason, created_at, source) VALUES (?,?,?,?,?)', user.id, 2200, GRANT5, now(), 'admin');
    log('dodano 2200 punktów na nowości 0.5');
  }
  const owned5 = (await jan('GET', '/api/shop')).owned;
  for (const item of ['avatar:rocket', 'frame:scooter', 'title:hulajnoga', 'music:arcade']) {
    if (!owned5.includes(item)) await jan('POST', '/api/shop/buy', { item });
  }
  await jan('PUT', '/api/me/profile', { profile: { avatar: 'rocket', frame: 'scooter', title: 'hulajnoga', music: 'arcade' } });
  log('profil: rakieta, ramka „Hulajnoga”, tytuł „Mistrz hulajnogi”, muzyka „Automat 8-bit”');
  const packs = await admin('GET', '/api/admin/shop/packs');
  if (!packs.packs.some((x) => x.name === 'Pakiet muzyczny')) {
    await admin('POST', '/api/admin/shop/packs', { name: 'Pakiet muzyczny', description: 'Lo-fi, Kosmos, Jazz i Sprint – taniej razem.', items: ['music:lofi', 'music:kosmos', 'music:jazz', 'music:sprint'], price: 650, notify: true });
    log('sklep: pakiet administratora „Pakiet muzyczny”');
  }
  if (lessonRow && user.registry_id && !one('SELECT 1 FROM lesson_stars WHERE run_key = ?', `${lessonRow.id}:jan-demo-star-0001`)) {
    await teacher('POST', `/api/editor/lessons/${lessonRow.id}/star`, { classLabel: '7a', registryId: user.registry_id, runKey: 'jan-demo-star-0001' });
    log('Gwiazda lekcji: Jan (+100 pkt do odebrania, gwiazdka w rankingu tygodnia)');
  }

  // koło fortuny do wypróbowania (normalnie: nagroda za ponad 3 dni na 1. miejscu w rankingu ogólnym)
  const { notify } = await import('../server/notify.js');
  if (notify(user.id, { kind: 'leader', title: 'Koło fortuny do wypróbowania', body: 'Tak wygląda nagroda za ponad 3 dni na 1. miejscu w rankingu ogólnym: wyjątkowy tytuł i koło fortuny 100–750 pkt. Zakręć!', reward: { type: 'wheel' }, link: '/ranking', dedupe: `demo-wheel:${user.id}` })) log('skrzynka: koło fortuny do wypróbowania');

  const after = await jan('GET', '/api/shop');
  const box = await jan('GET', '/api/inbox/summary');
  console.log(`\nGotowe. Jan Kossakowski ma ${after.balance} pkt – na pochwałę (2500) wystarczy.`);
  const n = box.unread, few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  console.log(`W skrzynce ${n === 1 ? 'czeka 1 wiadomość' : few ? `czekają ${n} wiadomości` : `czeka ${n} wiadomości`}, w tym ${box.pointsToClaim} pkt do odebrania.\n`);
} catch (e) {
  console.error('\n  ✖ ' + e.message + '\n');
  process.exitCode = 1;
} finally {
  run('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE created_at >= ? AND user_id IN (?, ?))', now() - 600e3, adminRow.id, teacherRow.id);
  server.close();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
