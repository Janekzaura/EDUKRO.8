// Lekcja jest wspólna dla wszystkich klas: przy „Prowadź” wybierasz klasę, a „Opublikuj dla…” decyduje, kto ją widzi.
import { h, icon, dialog, notice, toast, plural } from '../ui.js';
const shortDate = (ms) => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
import { get, post } from '../api.js';
import { navigate } from '../app.js';
import { lockedDialog, lockText } from './locked.js';

export const classLabelText = (c) => (c === '*' ? 'wszyscy uczniowie' : `klasa ${c}`);

/** Krótkie podsumowanie publikacji: „Widzą: 7a, 7b · przerobiona z 7a”. */
export function classSummary(classes = []) {
  const pub = classes.filter((c) => c.published).map((c) => (c.label === '*' ? 'wszyscy' : c.label));
  const taught = classes.filter((c) => c.completedAt).map((c) => c.label);
  const paused = classes.filter((c) => c.paused).map((c) => c.label);
  return { pub, taught, paused };
}
export function classChips(classes = []) {
  const { pub, taught, paused } = classSummary(classes);
  if (!pub.length && !taught.length && !paused.length) return h('span', { class: 'small muted' }, 'Jeszcze nikt jej nie widzi – kliknij „Prowadź” albo „Opublikuj dla…”');
  return h('span', { class: 'class-chips' },
    ...pub.map((c) => h('span', { class: 'cchip cchip--on', title: 'Uczniowie tej klasy widzą lekcję' }, icon('eye'), c)),
    ...paused.map((c) => h('span', { class: 'cchip cchip--paused', title: 'Wstrzymana – lekcja ma niekompletny slajd' }, icon('pause'), c)),
    ...taught.filter((c) => !pub.includes(c)).map((c) => h('span', { class: 'cchip', title: 'Przerobiona na lekcji' }, icon('check'), c)));
}

/** Okno wyboru klasy przed prowadzeniem lekcji. */
export async function pickClassForLesson({ lessonId, base, lessonTitle = '', fromEditor = false }) {
  const [{ classes: school }, ed] = await Promise.all([get('/api/editor/classes'), get(`/api/editor/lessons/${lessonId}`)]);
  const mine = new Map((ed.classes || []).map((c) => [c.label, c]));
  const usesClass = ed.lesson.slides.some((s) => s.type === 'wheel' || s.type === 'game');
  const go = (label) => { d.close(); navigate(`${base}/lekcja/${lessonId}/prowadz?${label ? `klasa=${encodeURIComponent(label)}` : 'bez-klasy=1'}${fromEditor ? '&z=edytor' : ''}`); };
  const list = h('div', { class: 'cls-tiles', 'data-help': 'Klasy z rejestru szkoły. Z wybranej klasy losowani są uczniowie do koła fortuny i gier, a po skończeniu lekcji uczniowie tej klasy zobaczą ją u siebie.' },
    ...school.map((c) => {
      const st = mine.get(c.label);
      return h('button', { class: 'cls-tile', type: 'button', onClick: () => go(c.label) },
        h('b', {}, c.label),
        h('span', {}, `${c.students} ${plural(c.students, ['uczeń', 'uczniów', 'uczniów'])}`, c.accounts !== c.students ? h('small', {}, ` · z kontem: ${c.accounts}`) : null),
        st?.completedAt ? h('small', { class: 'cls-tile__st' }, icon('check'), `przerobiona ${shortDate(st.completedAt)}`) : st?.published ? h('small', { class: 'cls-tile__st' }, icon('eye'), 'opublikowana') : null);
    }));
  const d = dialog({
    iconName: 'present', title: lessonTitle ? `Prowadź: ${lessonTitle}` : 'Z którą klasą prowadzisz lekcję?',
    body: [
      ed.lesson.lock ? h('p', {}, 'Wybierz klasę – na kole fortuny i w grach pojawią się jej uczniowie.') : h('p', {}, 'Wybierz klasę. Na kole fortuny i w grach pojawią się uczniowie tej klasy, a gdy dojdziesz do końca lekcji, ', h('b', {}, 'uczniowie tej klasy zobaczą ją na swoich kontach'), '.'),
      ed.lesson.lock ? notice('info', lockText(ed.lesson.lock, 'lesson'), ' Możesz ją poprowadzić na próbę – uczniowie jej nie zobaczą.') : null,
      school.length ? list : notice('info', 'W rejestrze szkoły nie ma jeszcze klas. Administrator dodaje uczniów z klasami w „Rejestrze uczniów”.'),
      h('button', { class: 'linkish', type: 'button', onClick: () => go(null), 'data-help': 'Pokaz lekcji bez klasy: koło fortuny i gry użyją przykładowych imion, a lekcja nie zostanie nikomu opublikowana.' },
        usesClass ? 'Tylko pokaz, bez klasy (koło fortuny i gry z przykładowymi imionami)' : 'Tylko pokaz, bez klasy (nikomu nie publikuję)')],
    actions: [{ label: 'Anuluj', kind: 'quiet' }],
  });
  return d;
}

/** „Opublikuj dla…” – zaznacz klasy, które mają widzieć lekcję. */
export async function publishDialog({ lessonId, onDone, onProblems, base = location.pathname.startsWith('/administracja') ? '/administracja' : '/nauczyciel' }) {
  const [{ classes: school }, ed] = await Promise.all([get('/api/editor/classes'), get(`/api/editor/lessons/${lessonId}`)]);
  if (ed.lesson.lock) return lockedDialog({ kind: 'lesson', id: lessonId, lock: ed.lesson.lock, base, onEdit: location.pathname.includes(`/lekcja/${lessonId}`) ? null : () => navigate(`${base}/lekcja/${lessonId}`) });
  const cur = new Map((ed.classes || []).map((c) => [c.label, c]));
  const checked = (label) => !!(cur.get(label)?.published || cur.get(label)?.paused);
  const all = h('input', { type: 'checkbox', checked: checked('*') });
  const boxes = school.map((c) => ({ c, inp: h('input', { type: 'checkbox', value: c.label, checked: checked(c.label) }) }));
  const sync = () => boxes.forEach((b) => { b.inp.disabled = all.checked; b.inp.closest('label')?.classList.toggle('is-off', all.checked); });
  all.addEventListener('change', sync);
  const err = h('div', { 'aria-live': 'assertive' });
  const d = dialog({
    iconName: 'flag', title: `Opublikuj dla… – ${ed.lesson.title}`,
    body: [
      h('p', {}, 'Zaznaczone klasy zobaczą lekcję w swoim przedmiocie (i dostaną powiadomienie). Odznaczenie klasy ukrywa przed nią lekcję. Uczniowie innych klas jej nie zobaczą.'),
      h('label', { class: 'check-row check-row--big' }, all, h('span', {}, h('b', {}, 'Wszyscy uczniowie'), h('small', {}, ' – każda klasa, także uczniowie bez przypisanej klasy'))),
      school.length ? h('div', { class: 'checks checks--classes' }, ...boxes.map(({ c, inp }) => h('label', { class: 'check-row' }, inp, h('span', {}, h('b', {}, `klasa ${c.label}`),
        cur.get(c.label)?.completedAt ? h('small', {}, ` · przerobiona ${shortDate(cur.get(c.label).completedAt)}`) : null,
        cur.get(c.label)?.paused ? h('small', {}, ' · wstrzymana (niekompletny slajd)') : null)))) : notice('info', 'W rejestrze nie ma jeszcze klas.'),
      err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Zapisz', kind: 'primary', onClick: async () => {
        const classes = all.checked ? ['*'] : boxes.filter((b) => b.inp.checked).map((b) => b.c.label);
        try {
          const r = await post(`/api/editor/lessons/${lessonId}/classes`, { classes });
          toast(classes.length ? `Lekcję widzą: ${classes.map(classLabelText).join(', ')}.${r.notified ? ` Powiadomienia: ${r.notified}.` : ''}` : 'Lekcja nie jest już nikomu opublikowana.');
          onDone?.(r);
        } catch (e) {
          if (e.status === 422 && onProblems) { d.close(); onProblems(e); return; }
          err.replaceChildren(notice('error', e.message)); return false;
        }
      },
    }],
  });
  sync();
  return d;
}
