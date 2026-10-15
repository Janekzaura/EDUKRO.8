// Baza danych EDUKRO (SQLite wbudowany w Node.js ≥ 22.13).
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { hashSecret } from './security.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

export const now = () => Date.now();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Rejestr uprawnionych uczniów (zarządza administrator)
CREATE TABLE IF NOT EXISTS registry (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  class_label TEXT,
  approved_email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Konta: uczniowie, nauczyciele, administrator (rola = uprawnienia)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  name_key TEXT,
  greeting_name TEXT,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  notify_opt_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','active','blocked')),
  code_hash TEXT NOT NULL,
  must_change_code INTEGER NOT NULL DEFAULT 0,
  registry_id INTEGER UNIQUE REFERENCES registry(id) ON DELETE SET NULL,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS users_student_name ON users(name_key) WHERE role = 'student';
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL;

-- Przedmioty i przypisania nauczycieli
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'amber',
  motif TEXT NOT NULL DEFAULT 'none',
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);

-- Materiały: lekcje, testy nauczające, testy egzaminacyjne, sprawdziany, gry
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('lesson','teaching_test','exam_test','quiz','game')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  requires_account INTEGER NOT NULL DEFAULT 1,
  content_json TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Wyniki uczniów
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  score REAL,
  max_score REAL,
  completed_at INTEGER NOT NULL,
  shared_with_teacher INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS results_subject ON results(subject_id, shared_with_teacher);

-- Decyzja ucznia o udostępnianiu wyników nauczycielom danego przedmiotu
CREATE TABLE IF NOT EXISTS student_sharing (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  share INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, subject_id)
);

-- Rejestracja: próby i kody e-mail
CREATE TABLE IF NOT EXISTS registration_attempts (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  registry_id INTEGER NOT NULL REFERENCES registry(id) ON DELETE CASCADE,
  email TEXT,
  notify_opt_in INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES registration_attempts(id) ON DELETE CASCADE,
  registry_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  invalidated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS email_code_failures (
  id INTEGER PRIMARY KEY,
  registry_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Sesje
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Ogólny licznik limitów (logowanie, rejestracja, zgłoszenia)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- Zgłoszenia (zajęte imię i nazwisko, problemy z rejestracją i dostępem)
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'name_taken' CHECK (kind IN ('name_taken','registration','access')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_info','resolved','rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Resetowanie dostępu inicjowane przez administratora
CREATE TABLE IF NOT EXISTS access_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Dziennik działań administracyjnych (bez kodów i danych wrażliwych)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  created_at INTEGER NOT NULL
);

-- Widok statusu osoby w rejestrze (liczony, więc zawsze spójny z kontami i próbami)
DROP VIEW IF EXISTS registry_status;
CREATE VIEW registry_status AS
SELECT r.*,
  u.id AS user_id,
  u.status AS account_status,
  CASE
    WHEN u.id IS NOT NULL AND u.status = 'blocked' THEN 'blocked'
    WHEN u.id IS NOT NULL AND u.status = 'active' THEN 'active'
    WHEN u.id IS NOT NULL AND u.status = 'pending' THEN 'pending_approval'
    WHEN EXISTS (SELECT 1 FROM registration_attempts a WHERE a.registry_id = r.id AND a.superseded = 0
                 AND a.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000 AND a.email_verified = 1)
      THEN 'email_verified'
    WHEN EXISTS (SELECT 1 FROM registration_attempts a WHERE a.registry_id = r.id AND a.superseded = 0
                 AND a.expires_at > CAST(strftime('%s','now') AS INTEGER) * 1000 AND a.email IS NOT NULL)
      THEN 'registration_started'
    ELSE 'added'
  END AS status
FROM registry r LEFT JOIN users u ON u.registry_id = r.id AND u.role = 'student';
`;

db.exec(SCHEMA);

/* ---------- Etap 2: testy, obrazy, punkty (migracja bez utraty danych) ---------- */
db.exec(`
-- Obrazy dołączane do pytań (plik w data/media, dostęp tylko po zalogowaniu)
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Podejścia do testów; stan (kolejka pytań, klucz odpowiedzi, czas) tylko po stronie serwera
CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('exam','teaching')),
  preview INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','passed','failed','completed','abandoned')),
  snapshot_json TEXT NOT NULL,
  state_json TEXT NOT NULL,
  mistakes INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  total INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  first_pass INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS attempts_user ON test_attempts(user_id, activity_id, status);

-- Punkty ucznia (do wymiany w przyszłym sklepie)
CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  attempt_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS points_student ON points_ledger(student_id);
`);

function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
// Wynik pierwszego zaliczenia egzaminu trafia do nauczyciela bez względu na ustawienie udostępniania.
addColumn('results', 'direct_to_teacher', 'INTEGER NOT NULL DEFAULT 0');
addColumn('results', 'mistakes', 'INTEGER');
addColumn('results', 'attempt_id', 'INTEGER');
addColumn('activities', 'updated_by', 'INTEGER');

/* ---------- Etap 3: sprawdziany, lekcje, punkty z lekcji, sklep, pochwały ---------- */
// test_attempts.mode dostaje wartość 'quiz' (sprawdzian) – SQLite wymaga przebudowy tabeli z nowym CHECK.
{
  const ta = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'test_attempts'").get();
  if (ta && !ta.sql.includes("'quiz'")) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE test_attempts_v3 (
        id INTEGER PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('exam','teaching','quiz')),
        preview INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('active','passed','failed','completed','abandoned')),
        snapshot_json TEXT NOT NULL,
        state_json TEXT NOT NULL,
        mistakes INTEGER NOT NULL DEFAULT 0,
        score INTEGER,
        total INTEGER,
        points INTEGER NOT NULL DEFAULT 0,
        first_pass INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        grade INTEGER
      )`);
      const cols = 'id, activity_id, user_id, mode, preview, status, snapshot_json, state_json, mistakes, score, total, points, first_pass, started_at, finished_at';
      db.exec(`INSERT INTO test_attempts_v3 (${cols}) SELECT ${cols} FROM test_attempts`);
      db.exec('DROP TABLE test_attempts');
      db.exec('ALTER TABLE test_attempts_v3 RENAME TO test_attempts');
      db.exec('CREATE INDEX IF NOT EXISTS attempts_user ON test_attempts(user_id, activity_id, status)');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
}
addColumn('test_attempts', 'grade', 'INTEGER');
addColumn('results', 'grade', 'INTEGER');
addColumn('users', 'theme_json', 'TEXT');
addColumn('users', 'homeroom_class', 'TEXT');

db.exec(`
-- Punkty przyznane na lekcji (koło fortuny, gry klasowe) – przypisane do osoby z rejestru,
-- więc czekają na ucznia, który jeszcze nie ma konta, i nie przepadają, gdy ktoś podszył się pod jego konto.
CREATE TABLE IF NOT EXISTS class_points (
  id INTEGER PRIMARY KEY,
  registry_id INTEGER NOT NULL REFERENCES registry(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  awarded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  run_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS class_points_reg ON class_points(registry_id);

-- Sklep: posiadane przedmioty (kolory, czcionki – 1 szt.; koła ratunkowe – liczba) i historia zakupów
CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item)
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Pochwały kupione w sklepie – trafiają do wychowawcy klasy (lub administratora)
CREATE TABLE IF NOT EXISTS praise_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','rejected')),
  price INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
`);

/* ---------- Etap 4: skrzynka, przyznawanie punktów, ceny i promocje, lekcje dla klas, samouczek ---------- */
db.exec(`
-- Skrzynka powiadomień (także nagrody i punkty do odebrania)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  reward_json TEXT,
  claimed_at INTEGER,
  read_at INTEGER,
  dedupe TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at);

-- Punkty przyznane przez administratora albo nauczyciela (nauczyciel: raz dziennie, do 100 pkt)
CREATE TABLE IF NOT EXISTS point_grants (
  id INTEGER PRIMARY KEY,
  giver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  giver_role TEXT NOT NULL,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  day_key TEXT NOT NULL,
  batch TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS point_grants_giver ON point_grants(giver_id, day_key);

-- Sklep: ceny ustawione przez administratora i promocje czasowe (user_id = promocja osobista, np. nagroda za test)
CREATE TABLE IF NOT EXISTS shop_prices (
  item TEXT PRIMARY KEY,
  price INTEGER NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shop_promos (
  id INTEGER PRIMARY KEY,
  item TEXT NOT NULL,
  off INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS shop_promos_time ON shop_promos(ends_at);

-- Lekcja jest wspólna dla wszystkich klas; dla każdej klasy osobno: przerobiona na lekcji i/lub opublikowana uczniom
CREATE TABLE IF NOT EXISTS lesson_classes (
  lesson_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  class_label TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  completed_at INTEGER,
  by_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (lesson_id, class_label)
);
`);
addColumn('class_points', 'claimed_at', 'INTEGER');
addColumn('users', 'tutorial_json', 'TEXT');
addColumn('activities', 'expires_at', 'INTEGER');   // test tymczasowy: po tym czasie znika z listy ucznia
addColumn('activities', 'published_at', 'INTEGER'); // pierwsza publikacja (do przypomnień o kończącym się teście)
addColumn('users', 'gender', 'TEXT');               // 'm' | 'f' | NULL (= zgadujemy z imienia)
addColumn('activities', 'tutorial', 'INTEGER NOT NULL DEFAULT 0'); // lekcja/test z samouczka – nie do publikacji
addColumn('activities', 'copy_fp', 'TEXT');          // kopia samouczka: odcisk treści – publikacja dopiero po zmianach
// Punkty z lekcji przyznane przed wprowadzeniem skrzynki były już doliczone do salda – zostają odebrane.
if (!one0("SELECT value FROM meta WHERE key = 'v4_claimed_migrated'")) {
  db.exec("UPDATE class_points SET claimed_at = created_at WHERE claimed_at IS NULL");
  // opublikowane lekcje z klasą w ustawieniach → publikacja dla tej klasy (albo wszystkich oddziałów rocznika)
  const lessons = db.prepare("SELECT id, content_json, updated_at FROM activities WHERE kind = 'lesson' AND status = 'published'").all();
  const regClasses = db.prepare('SELECT DISTINCT class_label FROM registry WHERE class_label IS NOT NULL').all().map((r) => String(r.class_label));
  const ins = db.prepare('INSERT OR IGNORE INTO lesson_classes (lesson_id, class_label, published, published_at) VALUES (?,?,1,?)');
  for (const l of lessons) {
    let s = {};
    try { s = JSON.parse(l.content_json || '{}').settings || {}; } catch { s = {}; }
    const g = String(s.grade || ''), sec = String(s.section || '');
    if (!/^[1-8]$/.test(g)) { ins.run(l.id, '*', l.updated_at); continue; }
    if (/^[a-h]$/.test(sec)) ins.run(l.id, `${g}${sec}`, l.updated_at);
    else for (const c of regClasses) { const m = /^([1-8])\s*([a-h])$/i.exec(c.replace(/\s+/g, '')); if (m && m[1] === g) ins.run(l.id, `${m[1]}${m[2].toLowerCase()}`, l.updated_at); }
  }
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('v4_claimed_migrated', '1')").run();
}
function one0(sql) { return db.prepare(sql).get(); }

/* ---------- Etap 5: profil (awatar, ramka, tytuł, muzyka), rankingi, gwiazdy ---------- */
addColumn('users', 'profile_json', 'TEXT');                 // wybrany awatar, ramka, tytuł, muzyka, efekt
addColumn('points_ledger', 'source', 'TEXT');               // test, shop, refund, admin, inbox, wheel, star-bonus
addColumn('users', 'rankings_on', 'INTEGER NOT NULL DEFAULT 1'); // udział w rankingach (domyślnie tak)
// 0.5.1: udostępnianie wyników jest domyślnie włączone (brak wpisu = udostępnia). Konta założone wcześniej
// zachowują dotychczasowy stan (wtedy brak wpisu znaczył „nie udostępnia”) – zapisujemy go jawnie, raz.
if (!one0("SELECT value FROM meta WHERE key = 'v51_sharing_default'")) {
  db.exec(`INSERT OR IGNORE INTO student_sharing (student_id, subject_id, share)
           SELECT u.id, s.id, 0 FROM users u CROSS JOIN subjects s WHERE u.role = 'student'`);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('v51_sharing_default', '1')").run();
}
db.exec(`
-- Pakiety tworzone przez administratora (np. „Pakiet muzyczny”)
CREATE TABLE IF NOT EXISTS shop_bundles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL,
  price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

-- Ranking testu: pierwsza osoba ze 100% przechodzi na zawsze do „Wygranych”
CREATE TABLE IF NOT EXISTS test_winners (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pct INTEGER NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  won_at INTEGER NOT NULL,
  PRIMARY KEY (activity_id, user_id)
);

-- Ranking ogólny: kto i od kiedy prowadzi w kategorii (ponad 3 dni → tytuł + koło fortuny)
CREATE TABLE IF NOT EXISTS ranking_leaders (
  category TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  since INTEGER NOT NULL,
  rewarded_at INTEGER
);

-- Gwiazda lekcji: nauczyciel wybiera najaktywniejszą osobę (z rejestru – także bez konta)
CREATE TABLE IF NOT EXISTS lesson_stars (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
  class_label TEXT,
  registry_id INTEGER NOT NULL REFERENCES registry(id) ON DELETE CASCADE,
  by_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cycle_key TEXT NOT NULL,
  run_key TEXT UNIQUE,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lesson_stars_cycle ON lesson_stars(cycle_key, registry_id);

-- Gwiazda szkoły: zwycięzca tygodnia (piątek 16:00) – tytuł i ×1,2 punktów do następnego piątku
CREATE TABLE IF NOT EXISTS school_stars (
  id INTEGER PRIMARY KEY,
  registry_id INTEGER NOT NULL REFERENCES registry(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  stars INTEGER NOT NULL,
  until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (registry_id, cycle_key)
);

`);

db.exec(`
-- 0.6: Dzienne pytania – baza pytań przedmiotu (nauczyciel dodaje dowolnie wiele)
CREATE TABLE IF NOT EXISTS daily_questions (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  question_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_questions_subject ON daily_questions(subject_id, active);
-- Wylosowane pytanie ucznia na dany dzień (jedno na przedmiot); kopia pytania – edycja nie psuje otwartego pytania
CREATE TABLE IF NOT EXISTS daily_answers (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES daily_questions(id) ON DELETE SET NULL,
  question_json TEXT NOT NULL,
  day TEXT NOT NULL,
  seed TEXT NOT NULL,
  first INTEGER NOT NULL DEFAULT 0,
  answered_at INTEGER,
  correct INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (student_id, subject_id, day)
);
CREATE INDEX IF NOT EXISTS daily_answers_day ON daily_answers(student_id, day);
-- 0.6: Szablony lekcji i testów zapisane przez nauczycieli (układ bez tekstu)
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('lesson','test')),
  test_kind TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
-- Seria (streak): liczy się pierwsze dzienne pytanie dnia
CREATE TABLE IF NOT EXISTS daily_streaks (
  student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_day TEXT
);
-- 0.7: Gry (Saper, Hammer Game) – podejścia: stan ruchów zna tylko serwer
CREATE TABLE IF NOT EXISTS game_runs (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preview INTEGER NOT NULL DEFAULT 0,
  seed TEXT NOT NULL,
  content_json TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  win INTEGER,
  pct INTEGER,
  points INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS game_runs_user ON game_runs(user_id, game_id);
`);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const one = (sql, ...a) => db.prepare(sql).get(...a);
export const all = (sql, ...a) => db.prepare(sql).all(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);

export function audit(actorId, action, target = null) {
  run('INSERT INTO audit_log (actor_id, action, target, created_at) VALUES (?,?,?,?)', actorId, action, target, now());
}

/** Normalizacja imienia i nazwiska do porównań (wielkość liter, spacje, Unicode). */
export function normName(s) {
  return String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}
export function nameKey(first, last) {
  return `${normName(first).toLocaleLowerCase('pl-PL')}|${normName(last).toLocaleLowerCase('pl-PL')}`;
}
export function defaultGreeting(firstName) {
  const f = normName(firstName);
  return /a$/i.test(f) ? f.slice(0, -1) + 'o' : f; // Joanna → Joanno
}

/**
 * Wszystkie przedmioty klas 4–8 szkoły podstawowej (bez wychowania fizycznego).
 * Dodawane raz – administrator może je potem ukryć, zmienić albo usunąć. Nauczyciela przypisuje się
 * przy jego koncie (Administracja → Nauczyciele → „Czego uczy”).
 */
export const SUBJECT_CATALOG = [
  ['chemia', 'Chemia', 'Substancje, reakcje i budowa materii.', 'copper', 'hex'],
  ['biologia', 'Biologia', 'Organizmy, komórki i zależności w przyrodzie.', 'chlorophyll', 'leaf'],
  ['jezyk-polski', 'Język polski', 'Lektury, pisanie, gramatyka i ortografia.', 'rose', 'book'],
  ['jezyk-angielski', 'Język angielski', 'Słówka, gramatyka, słuchanie i mówienie po angielsku.', 'sky', 'speech'],
  ['jezyk-niemiecki', 'Język niemiecki', 'Drugi język obcy – słówka, wymowa i rozmówki.', 'amber', 'speech'],
  ['matematyka', 'Matematyka', 'Liczby, działania, geometria i zadania tekstowe.', 'violet', 'grid'],
  ['historia', 'Historia', 'Dzieje Polski i świata – od starożytności do dziś.', 'amber', 'column'],
  ['wiedza-o-spoleczenstwie', 'Wiedza o społeczeństwie', 'Państwo, prawa obywatela i życie społeczne.', 'sky', 'column'],
  ['przyroda', 'Przyroda', 'Świat wokół nas: pogoda, rośliny, zwierzęta i mapa.', 'chlorophyll', 'leaf'],
  ['fizyka', 'Fizyka', 'Ruch, siły, energia, prąd i światło.', 'violet', 'orbit'],
  ['geografia', 'Geografia', 'Mapy, krajobrazy, klimat i państwa świata.', 'teal', 'globe'],
  ['informatyka', 'Informatyka', 'Programowanie, algorytmy i bezpieczna praca z komputerem.', 'sky', 'code'],
  ['technika', 'Technika', 'Rysunek techniczny, urządzenia i bezpieczeństwo na drodze.', 'amber', 'gear'],
  ['muzyka', 'Muzyka', 'Śpiew, rytm, nuty i historia muzyki.', 'rose', 'notes'],
  ['plastyka', 'Plastyka', 'Rysunek, malarstwo i historia sztuki.', 'coral', 'palette'],
  ['edukacja-dla-bezpieczenstwa', 'Edukacja dla bezpieczeństwa', 'Pierwsza pomoc i zachowanie w sytuacjach zagrożenia.', 'coral', 'shield'],
  ['edukacja-zdrowotna', 'Edukacja zdrowotna', 'Zdrowie, odżywianie, sen, emocje i dbanie o siebie.', 'teal', 'heart'],
  ['religia', 'Religia', 'Lekcje religii.', 'amber', 'none'],
  ['etyka', 'Etyka', 'Wartości, dobro i rozmowa o tym, jak żyć.', 'violet', 'none'],
  ['doradztwo-zawodowe', 'Doradztwo zawodowe', 'Zawody, zainteresowania i wybór szkoły średniej.', 'sky', 'compass'],
];
const plain = (x) => String(x).toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim();
/** 0.6: dodaje brakujące przedmioty z katalogu (raz – usunięte przez administratora nie wracają). */
export function ensureSubjects() {
  if (one("SELECT value FROM meta WHERE key = 'v6_subjects'")) return 0;
  let added = 0;
  tx(() => {
    const have = all('SELECT slug, name FROM subjects');
    const t = now();
    SUBJECT_CATALOG.forEach(([slug, name, desc, accent, motif], i) => {
      if (have.some((x) => x.slug === slug || plain(x.name) === plain(name))) return;
      run('INSERT INTO subjects (slug,name,description,accent,motif,sort_order,created_at) VALUES (?,?,?,?,?,?,?)', slug, name, desc, accent, motif, 10 + i, t);
      added++;
    });
    run("INSERT OR REPLACE INTO meta (key, value) VALUES ('v6_subjects', '1')");
  });
  return added;
}

/** Pierwsza inicjalizacja: przedmioty, konto nauczycielki, konto administratora. */
export function seed() {
  if (one("SELECT value FROM meta WHERE key = 'seeded'")) { ensureSubjects(); return { seeded: false }; }
  const missing = [];
  if (!/^\d{4,8}$/.test(config.initTeacherCode)) missing.push('EDUKRO_INIT_TEACHER_CODE');
  if (!/^\d{4,8}$/.test(config.initAdminCode)) missing.push('EDUKRO_INIT_ADMIN_CODE');
  if (missing.length) {
    throw new Error(`Brak konfiguracji początkowej: ${missing.join(', ')} (4–8 cyfr) w pliku .env`);
  }
  const t = now();
  // 1 = zmiana wymagana przed dalszą pracą, 2 = zalecana (komunikat w panelu)
  const force = config.forceInitialCodeChange ? 1 : 2;
  tx(() => {
    const chem = run(`INSERT INTO subjects (slug,name,description,accent,motif,sort_order,created_at)
      VALUES ('chemia','Chemia','Substancje, reakcje i budowa materii.','copper','hex',1,?)`, t).lastInsertRowid;
    const bio = run(`INSERT INTO subjects (slug,name,description,accent,motif,sort_order,created_at)
      VALUES ('biologia','Biologia','Organizmy, komórki i zależności w przyrodzie.','chlorophyll','leaf',2,?)`, t).lastInsertRowid;
    const teacher = run(`INSERT INTO users (role,first_name,last_name,greeting_name,status,code_hash,must_change_code,created_at,updated_at)
      VALUES ('teacher','Joanna','Hyżorek','Joanno','active',?,?,?,?)`,
      hashSecret(config.initTeacherCode), force, t, t).lastInsertRowid;
    run('INSERT INTO teacher_subjects VALUES (?,?)', teacher, chem);
    run('INSERT INTO teacher_subjects VALUES (?,?)', teacher, bio);
    run(`INSERT INTO users (role,first_name,last_name,status,code_hash,must_change_code,created_at,updated_at)
      VALUES ('admin','Administrator','EDUKRO','active',?,?,?,?)`, hashSecret(config.initAdminCode), force, t, t);
    run("INSERT INTO meta VALUES ('seeded', ?)", String(t));
    run("INSERT INTO meta VALUES ('initial_codes_in_use', '1')");
  });
  ensureSubjects();
  return { seeded: true };
}

/** Okresowe sprzątanie wygasłych danych tymczasowych. */
export function cleanup() {
  const t = now();
  run('DELETE FROM sessions WHERE expires_at < ?', t);
  run('DELETE FROM registration_attempts WHERE expires_at < ?', t - 24 * 3600e3);
  run('DELETE FROM email_code_failures WHERE created_at < ?', t - 24 * 3600e3);
  run('DELETE FROM rate_limits WHERE window_start < ?', t - 24 * 3600e3);
  run('DELETE FROM access_resets WHERE expires_at < ? OR used_at IS NOT NULL', t - 7 * 24 * 3600e3);
  // podglądy nauczycieli i porzucone podejścia nauczające nie są potrzebne długo
  run('DELETE FROM test_attempts WHERE preview = 1 AND started_at < ?', t - 24 * 3600e3);
}
