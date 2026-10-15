// Szablony lekcji i testów: gotowe (wbudowane) i zapisane przez nauczycieli – ten sam układ, bez tekstu.
// Szablony nauczycieli widzą wszyscy nauczyciele szkoły; usunąć może autor albo administrator.
import { one, all, run, now, audit } from '../db.js';
import { HttpError, str, id } from '../http.js';
import { requireRole } from '../auth.js';
import { assertSubject } from './tests.js';
import { parseLesson, cleanSlides } from '../lessons/schema.js';
import { parseDoc } from '../quiz/attempts.js';
import { cleanSettings, cleanQuestions } from '../quiz/schema.js';
import { BUILTIN_LESSONS, BUILTIN_TESTS, builtinLesson, builtinTest, stripLesson, stripTest } from '../../public/js/shared/templates.js';

const editor = requireRole('teacher', 'admin');
const KIND_LABEL = { teaching_test: 'test nauczający', exam_test: 'test egzaminacyjny', quiz: 'sprawdzian' };

function authorOf(uid) {
  const u = uid ? one('SELECT first_name, last_name, role FROM users WHERE id = ?', uid) : null;
  return u ? (u.role === 'admin' ? 'Administrator' : `${u.first_name} ${u.last_name}`) : null;
}
const countOf = (row) => { try { const d = JSON.parse(row.content_json); return (row.kind === 'lesson' ? d.slides : d.questions)?.length || 0; } catch { return 0; } };

/** Treść szablonu (świeże identyfikatory) – do utworzenia lekcji albo testu. */
export function templateContent(kind, templateId, user) {
  const tid = String(templateId || '');
  if (kind === 'lesson') {
    const b = builtinLesson(tid);
    if (b) return { slides: cleanSlides(b.make()) };
    const row = one("SELECT * FROM templates WHERE id = ? AND kind = 'lesson'", Number(tid) || -1);
    if (!row) throw new HttpError(404, 'Nie znaleziono szablonu.');
    return { slides: cleanSlides(stripLesson(JSON.parse(row.content_json)).slides) };
  }
  const b = builtinTest(tid);
  if (b) { const d = b.make(); return { kind: b.kind, settings: cleanSettings(d.settings), questions: cleanQuestions(d.questions) }; }
  const row = one("SELECT * FROM templates WHERE id = ? AND kind = 'test'", Number(tid) || -1);
  if (!row) throw new HttpError(404, 'Nie znaleziono szablonu.');
  const d = stripTest(JSON.parse(row.content_json));
  void user;
  return { kind: row.test_kind || 'teaching_test', settings: cleanSettings(d.settings), questions: cleanQuestions(d.questions) };
}

export function register(r) {
  r.get('/api/templates', (ctx) => {
    const kind = ctx.query.kind === 'test' ? 'test' : 'lesson';
    const builtin = (kind === 'lesson' ? BUILTIN_LESSONS : BUILTIN_TESTS).map((t) => {
      const made = t.make();
      return { id: t.id, builtin: true, name: t.name, description: t.desc, testKind: t.kind || null, kindLabel: t.kind ? KIND_LABEL[t.kind] : null,
        count: kind === 'lesson' ? made.length : made.questions.length };
    });
    const mine = all('SELECT * FROM templates WHERE kind = ? ORDER BY id DESC', kind).map((row) => ({
      id: row.id, builtin: false, name: row.name, description: row.description, testKind: row.test_kind, kindLabel: KIND_LABEL[row.test_kind] || null,
      count: countOf(row), author: authorOf(row.created_by), mine: row.created_by === ctx.user.id,
      canDelete: ctx.user.role === 'admin' || row.created_by === ctx.user.id, createdAt: row.created_at,
    }));
    return { builtin, saved: mine };
  }, editor);

  /** „Zapisz jako szablon”: z lekcji albo testu zostaje układ bez tekstu. */
  r.post('/api/templates', (ctx) => {
    const kind = ctx.body.kind === 'test' ? 'test' : 'lesson';
    const name = str(ctx.body.name, { min: 2, max: 80, field: 'Nazwa szablonu' });
    const description = str(ctx.body.description, { max: 200, field: 'Opis' });
    const a = one(`SELECT * FROM activities WHERE id = ? AND kind ${kind === 'lesson' ? "= 'lesson'" : "IN ('teaching_test','exam_test','quiz')"} AND status != 'archived'`, id(ctx.body.sourceId));
    if (!a) throw new HttpError(404, kind === 'lesson' ? 'Nie znaleziono lekcji.' : 'Nie znaleziono testu.');
    assertSubject(ctx.user, a.subject_id);
    let content;
    if (kind === 'lesson') content = stripLesson(parseLesson(a));
    else { const d = parseDoc(a); content = stripTest({ settings: d.settings, questions: d.questions }); }
    if (!(kind === 'lesson' ? content.slides : content.questions).length) throw new HttpError(400, kind === 'lesson' ? 'Lekcja nie ma slajdów.' : 'Test nie ma pytań.');
    const low = (x) => String(x).trim().toLocaleLowerCase('pl-PL');
    if (all('SELECT name FROM templates WHERE kind = ?', kind).some((x) => low(x.name) === low(name))) throw new HttpError(409, 'Szablon o tej nazwie już istnieje – wybierz inną nazwę.');
    const tid = run('INSERT INTO templates (kind, test_kind, name, description, content_json, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
      kind, kind === 'test' ? a.kind : null, name, description, JSON.stringify(content), ctx.user.id, now()).lastInsertRowid;
    audit(ctx.user.id, 'template.create', `template:${tid}`);
    return { template: { id: tid, name } };
  }, editor);

  r.delete('/api/templates/:id', (ctx) => {
    const row = one('SELECT * FROM templates WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono szablonu.');
    if (ctx.user.role !== 'admin' && row.created_by !== ctx.user.id) throw new HttpError(403, 'Szablon usunąć może tylko autor albo administrator.');
    run('DELETE FROM templates WHERE id = ?', row.id);
    audit(ctx.user.id, 'template.delete', `template:${row.id}`);
    return { ok: true };
  }, editor);
}
