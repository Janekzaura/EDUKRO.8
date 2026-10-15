// Zakładka „Lekcje” (nauczyciel i administrator) oraz ekran tworzenia nowej lekcji.
import { h, icon, notice, field, input, dialog, toast, withBusy, formatDate, plural } from '../ui.js';
import { get, post, del } from '../api.js';
import { navigate, setCrumbs } from '../app.js';
import { pickClassForLesson, publishDialog, classChips } from './lesson-classes.js';
import { lockBadge, lockedDialog, copyItem } from './locked.js';
import { tourId } from '../tour.js';
import { templatePicker } from './templates.js';

function statusBadge(t) {
  if (t.status === 'published') return h('span', { class: 'badge badge--ok' }, 'Opublikowana');
  if ((t.classes || []).some((c) => c.paused)) return h('span', { class: 'badge badge--wait' }, `Wstrzymana · ${t.errors} ${plural(t.errors, ['rzecz', 'rzeczy', 'rzeczy'])} do poprawy`);
  if (t.errors) return h('span', { class: 'badge badge--wait' }, `Szkic · ${t.errors} ${plural(t.errors, ['rzecz', 'rzeczy', 'rzeczy'])} do uzupełnienia`);
  return h('span', { class: 'badge badge--info' }, 'Szkic – gotowa do publikacji');
}

export async function lessonsSection({ base, admin = false }) {
  const { lessons } = await get('/api/editor/lessons');
  const create = h('a', { class: 'btn btn--primary', href: `${base}/lekcja/nowa`, 'data-link': '' }, icon('plus'), 'Stwórz lekcję');
  const head = h('header', { class: 'admin__head' },
    h('div', {}, admin ? h('h1', {}, 'Lekcje') : h('h2', { class: 'section-title' }, 'Lekcje'),
      h('p', { class: admin ? null : 'section-lead', style: { marginBottom: 0 } }, 'Lekcje to slajdy jak w prezentacji – z zasłoniętymi słowami, paskiem czasu do przepisywania, pytaniami, kołem fortuny i grami klasowymi. Jedna lekcja służy wszystkim klasom: przy „Prowadź” wybierasz klasę, a gdy skończysz, uczniowie tej klasy zobaczą lekcję u siebie.')),
    h('div', { class: 'actions' }, create));
  if (!lessons.length) {
    return h('div', {}, head, h('div', { class: 'empty' }, icon('lesson', 'empty__icon'),
      h('div', {}, h('h3', {}, 'Nie ma jeszcze żadnych lekcji'),
        h('p', {}, 'Kliknij „Stwórz lekcję”, nadaj jej nazwę i zacznij dodawać slajdy. Wszystko zapisuje się samo.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn--primary', href: `${base}/lekcja/nowa`, 'data-link': '' }, icon('plus'), 'Stwórz pierwszą lekcję')))));
  }
  const bySubject = new Map();
  for (const t of lessons) { if (!bySubject.has(t.subject)) bySubject.set(t.subject, []); bySubject.get(t.subject).push(t); }
  const row = (t) => {
    const open = () => navigate(`${base}/lekcja/${t.id}`);
    const removeBtn = h('button', { class: 'btn btn--quiet btn--sm', type: 'button', disabled: !t.canDelete, title: t.canDelete ? 'Usuń lekcję' : `Usunąć może tylko autor (${t.author || 'administrator'}) albo administrator`, 'aria-label': `Usuń lekcję ${t.title}`,
      'data-help': t.canDelete ? 'Usuwa lekcję z listy. Punkty przyznane już uczniom zostają.' : 'Tę lekcję utworzył ktoś inny – usunąć może ją tylko autor albo administrator.',
      onClick: () => dialog({
        iconName: 'trash', title: `Usunąć lekcję „${t.title}”?`, body: h('p', {}, 'Lekcja zniknie z listy. Punkty przyznane już uczniom na lekcjach zostaną zachowane.'),
        actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń lekcję', kind: 'danger', onClick: async () => { await del(`/api/editor/lessons/${t.id}`); toast('Lekcja usunięta.'); navigate(location.pathname, { replace: true }); } }],
      }) }, icon('trash'), 'Usuń');
    return h('tr', { class: t.lock ? `is-lock-${t.lock}` : null },
      h('td', {}, h('button', { class: 'linkish test-title', type: 'button', onClick: open }, t.title),
        h('div', { class: 'small muted' }, `${t.slideCount} ${plural(t.slideCount, ['slajd', 'slajdy', 'slajdów'])}${!t.mine && t.author ? ` · autor: ${t.author}` : ''}`)),
      h('td', { 'data-label': 'Kto widzi' }, t.lock ? lockBadge(t.lock, 'lesson') : statusBadge(t), t.lock === 'tutorial' ? null : h('div', { style: { marginTop: '6px' } }, classChips(t.classes))),
      h('td', { 'data-label': 'Zmiana' }, formatDate(t.updatedAt)),
      h('td', {}, h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => pickClassForLesson({ lessonId: t.id, base, lessonTitle: t.title }) }, icon('present'), 'Prowadź'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => (t.lock ? lockedDialog({ kind: 'lesson', id: t.id, lock: t.lock, base, onEdit: open }) : publishDialog({ lessonId: t.id, onDone: () => navigate(location.pathname, { replace: true }), onProblems: () => navigate(`${base}/lekcja/${t.id}?sprawdz=1`) })) }, icon('flag'), 'Opublikuj dla…'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: open }, icon('edit'), 'Edytuj'),
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', title: 'Utwórz kopię lekcji', 'aria-label': `Kopia lekcji ${t.title}`, 'data-help': 'Tworzy kopię lekcji, którą możesz zmieniać niezależnie od oryginału.', onClick: (e) => withBusy(e.currentTarget, () => copyItem({ kind: 'lesson', id: t.id, base })) }, icon('copy'), 'Kopiuj'),
        removeBtn)));
  };
  return h('div', {}, head,
    ...[...bySubject].map(([subject, list]) => h('section', { class: `block acc-${list[0].accent}` },
      h('h2', { class: 'subject-dot' }, subject),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards tests-table lessons-table' },
        h('thead', {}, h('tr', {}, ...['Lekcja', 'Kto widzi', 'Ostatnia zmiana', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, ...list.map(row)))))));
}

export async function newLessonView({ base }) {
  const area = base === '/administracja' ? 'Administracja' : 'Panel nauczyciela';
  const listHref = base === '/administracja' ? '/administracja/lekcje' : '/nauczyciel/panel/lekcje';
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: area, href: listHref }, { label: 'Nowa lekcja' }]);
  const { subjects } = await get('/api/editor/subjects');
  if (!subjects.length) return h('div', { class: 'wrap wrap--mid' }, notice('info', 'Nie masz przypisanych przedmiotów. Administrator EDUKRO może je przypisać w swoim panelu.'));
  const title = input({ maxlength: 120, placeholder: 'np. Budowa atomu' });
  const summary = input({ maxlength: 400, placeholder: 'np. Protony, neutrony i elektrony – z czego zbudowana jest materia' });
  const subject = h('select', { class: 'select' }, ...subjects.map((s) => h('option', { value: String(s.id) }, s.name)));
  const err = h('div', { 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Utwórz lekcję i dodaj slajdy', icon('arrowRight'));
  let template = null;
  const tour = tourId() === 'teacher-lesson';
  const picker = tour ? null : await templatePicker({ kind: 'lesson', emptyLabel: 'Pusta lekcja', emptySub: 'Zaczniesz od slajdu tytułowego i dodasz kolejne.', onPick: (t) => {
    template = t;
    submit.firstChild.textContent = t ? 'Utwórz lekcję z szablonu' : 'Utwórz lekcję i dodaj slajdy';
  } });
  const form = h('form', { class: 'sheet__body', novalidate: true },
    field({ label: '1. Nazwa lekcji', input: title }),
    field({ label: '2. Przedmiot', input: subject }),
    picker ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, '3. Zacznij od'), picker) : null,
    field({ label: 'Krótki opis dla ucznia (opcjonalnie)', input: summary }),
    notice('info', h('strong', {}, 'Jedna lekcja dla wszystkich klas. '), 'Klasę wybierzesz dopiero, gdy klikniesz „Prowadź” – z niej losowani są uczniowie do koła fortuny i gier. Gdy dojdziesz do końca lekcji, uczniowie tej klasy zobaczą ją u siebie.'),
    err, submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) { err.replaceChildren(notice('error', 'Wpisz nazwę lekcji.')); title.focus(); return; }
    withBusy(submit, async () => {
      try {
        const r = await post('/api/editor/lessons', { title: title.value, summary: summary.value, subjectId: Number(subject.value), tutorial: tourId() === 'teacher-lesson', templateId: template?.id || null });
        if (template) toast(`Lekcja z szablonu „${template.name}” – uzupełnij tekst na slajdach.`);
        navigate(`${base}/lekcja/${r.lesson.id}`, { replace: true });
      } catch (ex) { err.replaceChildren(notice('error', ex.message)); }
    });
  });
  setTimeout(() => title.focus(), 60);
  return h('div', { class: 'wrap wrap--mid' },
    h('button', { class: 'back', type: 'button', onClick: () => navigate(listHref) }, icon('arrowLeft'), 'Wszystkie lekcje'),
    h('div', { class: 'sheet' }, h('h1', {}, 'Nowa lekcja'),
      h('p', { class: 'sheet__lead' }, 'Lekcja to zestaw slajdów, który prowadzisz na tablicy. Zaczniemy od slajdu tytułowego – potem dodasz kolejne.'), form));
}
