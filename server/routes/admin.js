// Panel administratora – każda trasa wymaga sesji z rolą „admin”, sprawdzanej na serwerze.
import { one, all, run, now, tx, audit, nameKey, normName, defaultGreeting } from '../db.js';
import { config, mailMode } from '../config.js';
import { hashSecret, hmac, readableCode, randomDigits, EMAIL_RE, maskEmail } from '../security.js';
import { HttpError, str, id } from '../http.js';
import { requireRole, confirmAdmin, destroyUserSessions } from '../auth.js';
import { subjectRow, KINDS, ACCENTS, MOTIFS, slugify, teachersForSubject, validateDigitsCode } from './common.js';
import { parseClass, classLabel } from '../../public/js/shared/classes.js';
import { pointsBalance } from '../points.js';
import { notify } from '../notify.js';
import { genderOf } from '../../public/js/shared/gender.js';
import { pointRules, setPointRules, POINT_DEFAULTS, POINT_MAX } from '../pointrules.js';

/** Klasa z formularza: „7” + „b” albo dowolny zapis („7b”, „VII b”) → „7b”; puste → null. */
function classOf(body, prev = null) {
  if (body.grade !== undefined || body.section !== undefined) {
    const g = String(body.grade ?? ''), sct = String(body.section ?? '');
    if (!g) return null;
    if (!/^[1-8]$/.test(g) || (sct && !/^[a-h]$/.test(sct))) throw new HttpError(400, 'Wybierz klasę 1–8 i oddział a–h.');
    return classLabel(g, sct);
  }
  if (body.classLabel === undefined) return prev;
  const raw = str(body.classLabel, { max: 20, field: 'Klasa' });
  if (!raw) return null;
  const c = parseClass(raw);
  return c ? classLabel(c.grade, c.section) : raw;
}

const admin = requireRole('admin');

function emailOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const e = str(v, { max: 120, field: 'E-mail' }).toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Podaj prawidłowy adres e-mail.');
  return e;
}

function registryRow(r) {
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name, classLabel: r.class_label,
    approvedEmail: r.approved_email, status: r.status, userId: r.user_id, createdAt: r.created_at,
  };
}

function studentRow(u) {
  return {
    id: u.id, role: u.role, firstName: u.first_name, lastName: u.last_name, email: u.email,
    status: u.status, registryId: u.registry_id, createdAt: u.created_at, lastLoginAt: u.last_login_at,
    notifyOptIn: !!u.notify_opt_in, classLabel: u.class_label || null, points: pointsBalance(u.id), gender: genderOf(u), genderSet: !!u.gender,
    approvedEmailMatch: u.approved_email ? u.approved_email.toLowerCase() === (u.email || '').toLowerCase() : null,
  };
}

function teacherRow(u) {
  return {
    id: u.id, role: u.role, firstName: u.first_name, lastName: u.last_name, greetingName: u.greeting_name,
    status: u.status, createdAt: u.created_at, lastLoginAt: u.last_login_at, mustChangeCode: u.must_change_code === 1, homeroomClass: u.homeroom_class || null, gender: genderOf(u), genderSet: !!u.gender,
    subjects: all(`SELECT s.id, s.name FROM teacher_subjects ts JOIN subjects s ON s.id = ts.subject_id
                   WHERE ts.teacher_id = ? ORDER BY s.sort_order, s.name`, u.id),
  };
}

function setTeacherSubjects(teacherId, subjectIds) {
  if (!Array.isArray(subjectIds)) return;
  const ids = [...new Set(subjectIds.map(id))];
  for (const sid of ids) if (!one('SELECT 1 FROM subjects WHERE id = ?', sid)) throw new HttpError(400, 'Wybrano nieistniejący przedmiot.');
  run('DELETE FROM teacher_subjects WHERE teacher_id = ?', teacherId);
  for (const sid of ids) run('INSERT INTO teacher_subjects VALUES (?,?)', teacherId, sid);
}

function getAccount(accountId) {
  const u = one('SELECT * FROM users WHERE id = ?', id(accountId));
  if (!u) throw new HttpError(404, 'Nie znaleziono konta.');
  return u;
}

export function register(r) {
  r.get('/api/admin/overview', () => {
    const c = (sql, ...a) => one(sql, ...a).n;
    return {
      registry: c('SELECT COUNT(*) n FROM registry'),
      students: {
        active: c("SELECT COUNT(*) n FROM users WHERE role='student' AND status='active'"),
        pending: c("SELECT COUNT(*) n FROM users WHERE role='student' AND status='pending'"),
        blocked: c("SELECT COUNT(*) n FROM users WHERE role='student' AND status='blocked'"),
      },
      teachers: c("SELECT COUNT(*) n FROM users WHERE role='teacher'"),
      subjects: c('SELECT COUNT(*) n FROM subjects'),
      openClaims: c("SELECT COUNT(*) n FROM claims WHERE status IN ('pending','needs_info')"),
      pendingPraise: c("SELECT COUNT(*) n FROM praise_requests WHERE status = 'pending'"),
      lessons: c("SELECT COUNT(*) n FROM activities WHERE kind = 'lesson' AND status != 'archived'"),
      tests: c("SELECT COUNT(*) n FROM activities WHERE kind IN ('teaching_test','exam_test','quiz') AND status != 'archived'"),
      mailMode: mailMode(),
      emailCodeLength: config.emailCodeLength,
      production: config.production,
      initialCodes: all("SELECT role, first_name AS firstName, last_name AS lastName FROM users WHERE must_change_code > 0 AND role IN ('teacher','admin')"),
    };
  }, admin);

  /* ---------- A. Rejestr uprawnionych uczniów ---------- */
  r.get('/api/admin/registry', () => ({
    registry: all('SELECT * FROM registry_status ORDER BY last_name, first_name').map(registryRow),
  }), admin);

  r.post('/api/admin/registry', (ctx) => {
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    const cls = classOf(ctx.body);
    const approved = emailOrNull(ctx.body.approvedEmail);
    const key = nameKey(first, last);
    if (one('SELECT 1 FROM registry WHERE name_key = ?', key)) {
      throw new HttpError(409, 'Ta osoba jest już w rejestrze. Jeśli to inny uczeń o tym samym imieniu i nazwisku, dodaj drugie imię, aby ich rozróżnić.');
    }
    if (approved && one('SELECT 1 FROM registry WHERE lower(approved_email) = ?', approved)) {
      throw new HttpError(409, 'Ten adres e-mail jest już przypisany innej osobie w rejestrze.');
    }
    const t = now();
    const rid = run(`INSERT INTO registry (first_name, last_name, name_key, class_label, approved_email, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?)`, normName(first), normName(last), key, cls, approved, t, t).lastInsertRowid;
    audit(ctx.user.id, 'registry.add', `registry:${rid}`);
    return { entry: registryRow(one('SELECT * FROM registry_status WHERE id = ?', rid)) };
  }, admin);

  /* Szybkie dodawanie: cała lista uczniów jednej klasy naraz (pomija osoby, które już są w rejestrze). */
  r.post('/api/admin/registry/bulk', (ctx) => {
    const cls = classOf({ grade: ctx.body.grade, section: ctx.body.section });
    if (!cls) throw new HttpError(400, 'Wybierz klasę.');
    const people = Array.isArray(ctx.body.people) ? ctx.body.people : [];
    if (!people.length) throw new HttpError(400, 'Lista uczniów jest pusta.');
    if (people.length > 60) throw new HttpError(400, 'Najwyżej 60 osób naraz.');
    const clean = people.map((p, i) => ({
      first: str(p?.firstName, { min: 1, max: 60, field: `Wiersz ${i + 1}: imię` }),
      last: str(p?.lastName, { min: 1, max: 80, field: `Wiersz ${i + 1}: nazwisko` }),
    }));
    const added = [], skipped = [];
    const seen = new Set();
    tx(() => {
      const t = now();
      for (const p of clean) {
        const key = nameKey(p.first, p.last);
        if (seen.has(key) || one('SELECT 1 FROM registry WHERE name_key = ?', key)) { skipped.push(`${normName(p.first)} ${normName(p.last)}`); continue; }
        seen.add(key);
        const rid = run(`INSERT INTO registry (first_name, last_name, name_key, class_label, approved_email, created_at, updated_at)
                         VALUES (?,?,?,?,NULL,?,?)`, normName(p.first), normName(p.last), key, cls, t, t).lastInsertRowid;
        added.push(Number(rid));
      }
    });
    audit(ctx.user.id, 'registry.bulk', `class:${cls};added:${added.length};skipped:${skipped.length}`);
    return { added: added.length, skipped, classLabel: cls };
  }, admin);

  r.patch('/api/admin/registry/:id', (ctx) => {
    const reg = one('SELECT * FROM registry WHERE id = ?', id(ctx.params.id));
    if (!reg) throw new HttpError(404, 'Nie znaleziono wpisu.');
    const first = ctx.body.firstName !== undefined ? str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' }) : reg.first_name;
    const last = ctx.body.lastName !== undefined ? str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' }) : reg.last_name;
    const cls = classOf(ctx.body, reg.class_label);
    const approved = ctx.body.approvedEmail !== undefined ? emailOrNull(ctx.body.approvedEmail) : reg.approved_email;
    const key = nameKey(first, last);
    if (key !== reg.name_key && one('SELECT 1 FROM registry WHERE name_key = ?', key)) {
      throw new HttpError(409, 'W rejestrze jest już osoba o takim imieniu i nazwisku.');
    }
    if (approved && one('SELECT 1 FROM registry WHERE lower(approved_email) = ? AND id != ?', approved, reg.id)) {
      throw new HttpError(409, 'Ten adres e-mail jest już przypisany innej osobie w rejestrze.');
    }
    tx(() => {
      run('UPDATE registry SET first_name=?, last_name=?, name_key=?, class_label=?, approved_email=?, updated_at=? WHERE id=?',
        normName(first), normName(last), key, cls, approved, now(), reg.id);
      // imię i nazwisko konta są zawsze zgodne z rejestrem
      run("UPDATE users SET first_name=?, last_name=?, name_key=?, updated_at=? WHERE registry_id=? AND role='student'",
        normName(first), normName(last), key, now(), reg.id);
    });
    audit(ctx.user.id, 'registry.edit', `registry:${reg.id}`);
    return { entry: registryRow(one('SELECT * FROM registry_status WHERE id = ?', reg.id)) };
  }, admin);

  r.delete('/api/admin/registry/:id', (ctx) => {
    const reg = one('SELECT * FROM registry WHERE id = ?', id(ctx.params.id));
    if (!reg) throw new HttpError(404, 'Nie znaleziono wpisu.');
    if (one("SELECT 1 FROM users WHERE registry_id = ? AND role = 'student'", reg.id)) {
      throw new HttpError(409, 'Ta osoba ma konto. Najpierw usuń konto ucznia w zakładce Konta.');
    }
    run('DELETE FROM registry WHERE id = ?', reg.id);
    audit(ctx.user.id, 'registry.delete', `registry:${reg.id}`);
    return { ok: true };
  }, admin);

  /* Przykładowa klasa 7a (tryb deweloperski) – usuwana jednym kliknięciem; osoby z kontem zostają. */
  r.post('/api/admin/registry/remove-demo', () => {
    const ids = all(`SELECT r.id FROM registry r WHERE r.last_name IN ('Przykładowa','Przykładowy')
                     AND NOT EXISTS (SELECT 1 FROM users u WHERE u.registry_id = r.id AND u.role = 'student')`).map((x) => x.id);
    tx(() => { for (const rid of ids) { run('DELETE FROM class_points WHERE registry_id = ?', rid); run('DELETE FROM registry WHERE id = ?', rid); } });
    return { removed: ids.length };
  }, admin);

  /* ---------- Nagrody punktowe ---------- */
  r.get('/api/admin/points-rules', () => ({ rules: pointRules(), defaults: POINT_DEFAULTS, max: POINT_MAX }), admin);
  r.put('/api/admin/points-rules', (ctx) => {
    const rules = setPointRules(ctx.body || {});
    audit(ctx.user.id, 'points.rules', JSON.stringify(rules).slice(0, 300));
    return { ok: true, rules };
  }, admin);

  /* ---------- B. Konta ---------- */
  r.get('/api/admin/accounts', (ctx) => {
    const role = ctx.query.role === 'teacher' ? 'teacher' : 'student';
    if (role === 'teacher') {
      return { accounts: all("SELECT * FROM users WHERE role = 'teacher' ORDER BY last_name, first_name").map(teacherRow) };
    }
    return {
      accounts: all(`SELECT u.*, r.approved_email, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id
                     WHERE u.role = 'student' ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.last_name, u.first_name`).map(studentRow),
    };
  }, admin);

  r.post('/api/admin/accounts/:id/approve', (ctx) => {
    const u = getAccount(ctx.params.id);
    if (u.role !== 'student') throw new HttpError(400, 'Zatwierdzać można tylko konta uczniów.');
    if (u.status !== 'pending') throw new HttpError(409, 'To konto nie oczekuje na zatwierdzenie.');
    run("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?", now(), u.id);
    notify(u.id, { kind: 'account', title: 'Twoje konto zostało zatwierdzone!', body: 'Możesz już wydawać punkty w sklepie EDUKRO – kolory, czcionki, koła ratunkowe i pochwałę od wychowawcy.', link: '/uczen/sklep', dedupe: `approved:${u.id}` });
    audit(ctx.user.id, 'account.approve', `user:${u.id}`);
    return { ok: true };
  }, admin);

  /* Odrzucenie konta oczekującego: konto jest usuwane razem z punktami zdobytymi na nim.
     Punkty z lekcji (koło fortuny, gry) należą do osoby z rejestru i czekają na prawdziwego ucznia. */
  /* Płeć – do poprawnych form w EDUKRO („zdobyłaś”, „zdobyłeś”). */
  r.put('/api/admin/accounts/:id/gender', (ctx) => {
    const u = getAccount(ctx.params.id);
    const g = ctx.body.gender;
    if (!['m', 'f', null].includes(g)) throw new HttpError(400, 'Wybierz płeć.');
    run('UPDATE users SET gender = ?, updated_at = ? WHERE id = ?', g, now(), u.id);
    audit(ctx.user.id, 'account.gender', `user:${u.id}:${g || 'auto'}`);
    return { ok: true, gender: genderOf({ ...u, gender: g }) };
  }, admin);

  r.post('/api/admin/accounts/:id/reject', (ctx) => {
    const u = getAccount(ctx.params.id);
    if (u.role !== 'student') throw new HttpError(400, 'Odrzucać można tylko konta uczniów.');
    if (u.status !== 'pending') throw new HttpError(409, 'To konto nie oczekuje na zatwierdzenie.');
    run('DELETE FROM users WHERE id = ?', u.id);
    audit(ctx.user.id, 'account.reject', `user:${u.id}`);
    return { ok: true };
  }, admin);

  r.post('/api/admin/accounts/:id/block', (ctx) => {
    const u = getAccount(ctx.params.id);
    if (u.role === 'admin') throw new HttpError(400, 'Nie można zablokować konta administratora.');
    run("UPDATE users SET status = 'blocked', updated_at = ? WHERE id = ?", now(), u.id);
    destroyUserSessions(u.id);
    audit(ctx.user.id, 'account.block', `user:${u.id}`);
    return { ok: true };
  }, admin);

  r.post('/api/admin/accounts/:id/unblock', (ctx) => {
    const u = getAccount(ctx.params.id);
    if (u.status !== 'blocked') throw new HttpError(409, 'To konto nie jest zablokowane.');
    run("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?", now(), u.id);
    audit(ctx.user.id, 'account.unblock', `user:${u.id}`);
    return { ok: true };
  }, admin);

  /* Reset dostępu – administrator nigdy nie widzi kodu, tylko wydaje jednorazowy kod resetu / tymczasowy kod. */
  r.post('/api/admin/accounts/:id/reset', (ctx) => {
    confirmAdmin(ctx, ctx.body.confirmCode);
    const u = getAccount(ctx.params.id);
    if (u.role === 'admin') throw new HttpError(400, 'Kod administratora zmienia się w ustawieniach panelu.');
    destroyUserSessions(u.id);
    if (u.role === 'student') {
      const code = readableCode(10);
      const t = now();
      const expiresAt = t + 72 * 3600e3;
      run('UPDATE access_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', t, u.id);
      const rid = run('INSERT INTO access_resets (user_id, token_hash, created_by, created_at, expires_at) VALUES (?,?,?,?,?)',
        u.id, 'pending', ctx.user.id, t, expiresAt).lastInsertRowid;
      run('UPDATE access_resets SET token_hash = ? WHERE id = ?', hmac(`reset:${rid}:${code.replace(/-/g, '')}`), rid);
      audit(ctx.user.id, 'account.reset.student', `user:${u.id}`);
      return { kind: 'student', resetCode: code, expiresAt };
    }
    const temp = randomDigits(config.pinLength);
    run('UPDATE users SET code_hash = ?, must_change_code = 1, updated_at = ? WHERE id = ?', hashSecret(temp), now(), u.id);
    audit(ctx.user.id, 'account.reset.teacher', `user:${u.id}`);
    return { kind: 'teacher', temporaryCode: temp };
  }, admin);

  r.delete('/api/admin/accounts/:id', (ctx) => {
    confirmAdmin(ctx, ctx.body.confirmCode);
    const u = getAccount(ctx.params.id);
    if (u.role === 'admin') throw new HttpError(400, 'Nie można usunąć konta administratora.');
    if (str(ctx.body.confirmName, { max: 150 }) !== `${u.first_name} ${u.last_name}`) {
      throw new HttpError(400, 'Wpisane imię i nazwisko nie zgadza się z kontem. Operacja nie została wykonana.');
    }
    // Usunięcie konta usuwa sesje, wyniki i ustawienia udostępniania (ON DELETE CASCADE).
    // Wpis w rejestrze zostaje – uczeń może ponownie założyć konto, jeśli administrator na to pozwoli.
    run('DELETE FROM users WHERE id = ?', u.id);
    audit(ctx.user.id, `account.delete.${u.role}`, `user:${u.id}`);
    return { ok: true };
  }, admin);

  /* ---------- C. Nauczyciele ---------- */
  r.post('/api/admin/teachers', (ctx) => {
    const first = str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' });
    const last = str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' });
    const greeting = str(ctx.body.greetingName, { max: 60, field: 'Forma powitania' }) || defaultGreeting(first);
    if (one("SELECT 1 FROM users WHERE role='teacher' AND lower(first_name)=lower(?) AND lower(last_name)=lower(?)", first, last)) {
      throw new HttpError(409, 'Nauczyciel o tym imieniu i nazwisku już istnieje.');
    }
    const temp = randomDigits(config.pinLength);
    const t = now();
    const homeroom = classOf({ grade: ctx.body.homeroomGrade ?? '', section: ctx.body.homeroomSection ?? '' });
    const tid = tx(() => {
      const tid = run(`INSERT INTO users (role, first_name, last_name, greeting_name, status, code_hash, must_change_code, homeroom_class, created_at, updated_at)
                       VALUES ('teacher',?,?,?,'active',?,1,?,?,?)`, normName(first), normName(last), greeting, hashSecret(temp), homeroom, t, t).lastInsertRowid;
      setTeacherSubjects(tid, ctx.body.subjectIds || []);
      return tid;
    });
    audit(ctx.user.id, 'teacher.add', `user:${tid}`);
    return { teacher: teacherRow(one('SELECT * FROM users WHERE id = ?', tid)), temporaryCode: temp };
  }, admin);

  r.patch('/api/admin/teachers/:id', (ctx) => {
    const u = getAccount(ctx.params.id);
    if (u.role !== 'teacher') throw new HttpError(400, 'To nie jest konto nauczyciela.');
    const first = ctx.body.firstName !== undefined ? str(ctx.body.firstName, { min: 1, max: 60, field: 'Imię' }) : u.first_name;
    const last = ctx.body.lastName !== undefined ? str(ctx.body.lastName, { min: 1, max: 80, field: 'Nazwisko' }) : u.last_name;
    const greeting = ctx.body.greetingName !== undefined ? (str(ctx.body.greetingName, { max: 60 }) || defaultGreeting(first)) : u.greeting_name;
    const homeroom = ctx.body.homeroomGrade !== undefined ? classOf({ grade: ctx.body.homeroomGrade, section: ctx.body.homeroomSection ?? '' }) : u.homeroom_class;
    tx(() => {
      run('UPDATE users SET first_name=?, last_name=?, greeting_name=?, homeroom_class=?, updated_at=? WHERE id=?', normName(first), normName(last), greeting, homeroom, now(), u.id);
      setTeacherSubjects(u.id, ctx.body.subjectIds);
    });
    audit(ctx.user.id, 'teacher.edit', `user:${u.id}`);
    return { teacher: teacherRow(one('SELECT * FROM users WHERE id = ?', u.id)) };
  }, admin);

  /* ---------- D. Przedmioty ---------- */
  const subjectFull = (s) => ({
    ...subjectRow(s),
    teachers: all(`SELECT u.id, u.first_name AS firstName, u.last_name AS lastName FROM teacher_subjects ts
                   JOIN users u ON u.id = ts.teacher_id WHERE ts.subject_id = ?`, s.id),
    activities: one('SELECT COUNT(*) n FROM activities WHERE subject_id = ?', s.id).n,
  });

  r.get('/api/admin/subjects', () => ({
    subjects: all('SELECT * FROM subjects ORDER BY sort_order, name').map(subjectFull),
    accents: ACCENTS, motifs: MOTIFS,
  }), admin);

  r.post('/api/admin/subjects', (ctx) => {
    const name = str(ctx.body.name, { min: 2, max: 60, field: 'Nazwa' });
    let slug = slugify(name);
    if (one('SELECT 1 FROM subjects WHERE slug = ?', slug)) throw new HttpError(409, 'Przedmiot o tej nazwie już istnieje.');
    const description = str(ctx.body.description, { max: 200, field: 'Opis' });
    const accent = ACCENTS.includes(ctx.body.accent) ? ctx.body.accent : 'amber';
    const motif = MOTIFS.includes(ctx.body.motif) ? ctx.body.motif : 'none';
    const order = one('SELECT COALESCE(MAX(sort_order),0)+1 n FROM subjects').n;
    const sid = run(`INSERT INTO subjects (slug, name, description, accent, motif, is_available, sort_order, created_at)
                     VALUES (?,?,?,?,?,?,?,?)`, slug, name, description, accent, motif, ctx.body.isAvailable === false ? 0 : 1, order, now()).lastInsertRowid;
    if (Array.isArray(ctx.body.teacherIds)) {
      for (const tid of ctx.body.teacherIds.map(id)) {
        if (one("SELECT 1 FROM users WHERE id = ? AND role = 'teacher'", tid)) run('INSERT OR IGNORE INTO teacher_subjects VALUES (?,?)', tid, sid);
      }
    }
    audit(ctx.user.id, 'subject.add', `subject:${sid}`);
    return { subject: subjectFull(one('SELECT * FROM subjects WHERE id = ?', sid)) };
  }, admin);

  r.patch('/api/admin/subjects/:id', (ctx) => {
    const s = one('SELECT * FROM subjects WHERE id = ?', id(ctx.params.id));
    if (!s) throw new HttpError(404, 'Nie znaleziono przedmiotu.');
    const name = ctx.body.name !== undefined ? str(ctx.body.name, { min: 2, max: 60, field: 'Nazwa' }) : s.name;
    const description = ctx.body.description !== undefined ? str(ctx.body.description, { max: 200, field: 'Opis' }) : s.description;
    const accent = ACCENTS.includes(ctx.body.accent) ? ctx.body.accent : s.accent;
    const motif = MOTIFS.includes(ctx.body.motif) ? ctx.body.motif : s.motif;
    const avail = typeof ctx.body.isAvailable === 'boolean' ? (ctx.body.isAvailable ? 1 : 0) : s.is_available;
    tx(() => {
      run('UPDATE subjects SET name=?, description=?, accent=?, motif=?, is_available=? WHERE id=?', name, description, accent, motif, avail, s.id);
      if (Array.isArray(ctx.body.teacherIds)) {
        run('DELETE FROM teacher_subjects WHERE subject_id = ?', s.id);
        for (const tid of [...new Set(ctx.body.teacherIds.map(id))]) {
          if (!one("SELECT 1 FROM users WHERE id = ? AND role = 'teacher'", tid)) throw new HttpError(400, 'Wybrano nieistniejącego nauczyciela.');
          run('INSERT INTO teacher_subjects VALUES (?,?)', tid, s.id);
        }
      }
    });
    audit(ctx.user.id, 'subject.edit', `subject:${s.id}`);
    return { subject: subjectFull(one('SELECT * FROM subjects WHERE id = ?', s.id)) };
  }, admin);

  /* ---------- E. Materiały (fundament – podgląd stanu) ---------- */
  r.get('/api/admin/materials', () => ({
    kinds: KINDS,
    subjects: all('SELECT * FROM subjects ORDER BY sort_order, name').map((s) => {
      const counts = Object.fromEntries(KINDS.map((k) => [k, { published: 0, draft: 0, archived: 0 }]));
      for (const c of all('SELECT kind, status, COUNT(*) n FROM activities WHERE subject_id = ? GROUP BY kind, status', s.id)) counts[c.kind][c.status] = c.n;
      return { ...subjectRow(s), teachers: teachersForSubject(s.id), counts };
    }),
  }), admin);

  /* ---------- F. Zgłoszenia ---------- */
  const claimRow = (c) => ({
    id: c.id, kind: c.kind, firstName: c.first_name, lastName: c.last_name, contactEmail: c.contact_email,
    description: c.description, status: c.status, adminNote: c.admin_note, createdAt: c.created_at, updatedAt: c.updated_at,
  });

  r.get('/api/admin/claims', () => ({
    claims: all(`SELECT * FROM claims ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END, created_at DESC`).map(claimRow),
  }), admin);

  r.get('/api/admin/claims/:id', (ctx) => {
    const c = one('SELECT * FROM claims WHERE id = ?', id(ctx.params.id));
    if (!c) throw new HttpError(404, 'Nie znaleziono zgłoszenia.');
    const reg = one('SELECT * FROM registry_status WHERE name_key = ?', c.name_key);
    const acc = reg && reg.user_id ? one('SELECT * FROM users WHERE id = ?', reg.user_id) : null;
    return {
      claim: claimRow(c),
      registry: reg ? registryRow(reg) : null,
      account: acc ? {
        id: acc.id, status: acc.status, email: acc.email, createdAt: acc.created_at, lastLoginAt: acc.last_login_at,
        emailMatchesClaim: (acc.email || '').toLowerCase() === c.contact_email.toLowerCase(),
        emailMatchesRegistry: reg.approved_email ? reg.approved_email.toLowerCase() === (acc.email || '').toLowerCase() : null,
      } : null,
      claimEmailMatchesRegistry: reg && reg.approved_email ? reg.approved_email.toLowerCase() === c.contact_email.toLowerCase() : null,
      maskedClaimEmail: maskEmail(c.contact_email),
    };
  }, admin);

  r.patch('/api/admin/claims/:id', (ctx) => {
    const c = one('SELECT * FROM claims WHERE id = ?', id(ctx.params.id));
    if (!c) throw new HttpError(404, 'Nie znaleziono zgłoszenia.');
    const status = ['pending', 'needs_info', 'resolved', 'rejected'].includes(ctx.body.status) ? ctx.body.status : c.status;
    const note = ctx.body.adminNote !== undefined ? str(ctx.body.adminNote, { max: 1000, field: 'Notatka' }) : c.admin_note;
    run('UPDATE claims SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?', status, note, now(), c.id);
    audit(ctx.user.id, `claim.${status}`, `claim:${c.id}`);
    return { claim: claimRow(one('SELECT * FROM claims WHERE id = ?', c.id)) };
  }, admin);

  /* Konto testowe ucznia – do sprawdzania testów „oczami ucznia” (z punktami i przerwami). Kod widoczny tylko raz. */
  r.post('/api/admin/demo-student', (ctx) => {
    const first = 'Uczeń', last = 'Testowy';
    const key = nameKey(first, last);
    let code;
    do { code = randomDigits(config.pinLength); } while ((() => { try { validateDigitsCode(code, config.pinLength); return false; } catch { return true; } })());
    const t = now();
    const ex = one("SELECT id FROM users WHERE role = 'student' AND name_key = ?", key);
    if (ex) {
      run("UPDATE users SET code_hash = ?, status = 'active', updated_at = ? WHERE id = ?", hashSecret(code), t, ex.id);
      destroyUserSessions(ex.id);
    } else {
      run(`INSERT INTO users (role, first_name, last_name, name_key, greeting_name, status, code_hash, email_verified, created_at, updated_at)
           VALUES ('student', ?, ?, ?, ?, 'active', ?, 0, ?, ?)`, first, last, key, first, hashSecret(code), t, t);
    }
    audit(ctx.user.id, 'account.demo_student', 'student:demo');
    return { firstName: first, lastName: last, code };
  }, admin);

  r.get('/api/admin/audit', () => ({
    entries: all('SELECT action, target, created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT 100'),
  }), admin);
}
