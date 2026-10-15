// Okno „Wyodrębnij pytania”: wybór materiału (test, sprawdzian, lekcja) i pytań do skopiowania.
import { h, icon, dialog, toast, plural } from '../ui.js';
import { get } from '../api.js';
import { TYPE, clean } from '../shared/quiz-rules.js';
import { TYPE_ICON } from './test-editor.js';

const KIND = {
  teaching_test: ['Test nauczający', 'teaching'], exam_test: ['Test egzaminacyjny', 'exam'], quiz: ['Sprawdzian', 'quiz'], lesson: ['Lekcja', 'lesson'],
};

/** onPick(listaPytań) – pytania z polem catName (nazwa kategorii w materiale źródłowym). */
export async function extractDialog({ excludeId = null, room = 100, onPick, title = 'Wyodrębnij pytania z innych materiałów' }) {
  let sources;
  try { ({ sources } = await get('/api/editor/sources')); } catch (e) { toast(e.message, 'error'); return; }
  sources = sources.filter((x) => x.id !== excludeId);
  const body = h('div', { class: 'xd' });
  const d = dialog({ iconName: 'extract', title, body, actions: [{ label: 'Zamknij', kind: 'quiet' }] });
  d.el.classList.add('dialog--wide');

  function listView() {
    if (!sources.length) {
      body.replaceChildren(h('p', {}, 'Nie ma jeszcze innych testów, sprawdzianów ani lekcji z pytaniami w Twoich przedmiotach.'));
      return;
    }
    const q = h('input', { class: 'input search', type: 'search', placeholder: 'Szukaj materiału…', 'aria-label': 'Szukaj materiału' });
    const list = h('div', { class: 'xd-list' });
    const render = () => {
      const v = q.value.trim().toLocaleLowerCase('pl-PL');
      const rows = sources.filter((x) => !v || `${x.title} ${x.subject}`.toLocaleLowerCase('pl-PL').includes(v));
      list.replaceChildren(...rows.map((x) => h('button', { type: 'button', class: 'xd-src', onClick: () => questionsView(x) },
        h('span', { class: 'xd-src__icon' }, icon(KIND[x.kind][1])),
        h('span', { class: 'xd-src__body' }, h('b', {}, x.title), h('small', {}, `${KIND[x.kind][0]} · ${x.subject}${x.status === 'published' ? '' : ' · szkic'}`)),
        h('span', { class: 'xd-src__n' }, `${x.questionCount} ${plural(x.questionCount, ['pytanie', 'pytania', 'pytań'])}`), icon('arrowRight'))));
      if (!rows.length) list.append(h('p', { class: 'muted' }, 'Nic nie pasuje do wyszukiwania.'));
    };
    q.addEventListener('input', render);
    render();
    body.replaceChildren(h('p', { class: 'small' }, 'Wybierz test, sprawdzian albo lekcję, z której chcesz skopiować pytania. Skopiowane pytania możesz potem dowolnie zmieniać – oryginał zostanie bez zmian.'), q, list);
    setTimeout(() => q.focus(), 50);
  }

  async function questionsView(src) {
    body.replaceChildren(h('div', { class: 'loading' }, 'Wczytywanie pytań'));
    let data;
    try { data = await get(`/api/editor/sources/${src.id}`); } catch (e) { toast(e.message, 'error'); return listView(); }
    const qs = data.questions;
    const checks = qs.map(() => h('input', { type: 'checkbox' }));
    const all = h('input', { type: 'checkbox' });
    const pickBtn = h('button', { class: 'btn btn--primary', type: 'button', disabled: true });
    const allBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, `Wyodrębnij wszystkie (${qs.length})`);
    const upd = () => {
      const n = checks.filter((c) => c.checked).length;
      pickBtn.disabled = !n;
      pickBtn.textContent = n ? `Wyodrębnij zaznaczone (${n})` : 'Zaznacz pytania';
      all.checked = n === qs.length; all.indeterminate = n > 0 && n < qs.length;
    };
    all.addEventListener('change', () => { checks.forEach((c) => { c.checked = all.checked; }); upd(); });
    checks.forEach((c) => c.addEventListener('change', upd));
    const finish = (list) => {
      if (list.length > room) { toast(`Zmieści się jeszcze ${Math.max(0, room)} ${plural(room, ['pytanie', 'pytania', 'pytań'])} – wybierz mniej.`, 'error'); return; }
      d.close();
      onPick(list);
    };
    pickBtn.addEventListener('click', () => finish(qs.filter((_, i) => checks[i].checked)));
    allBtn.addEventListener('click', () => finish(qs));
    upd();
    body.replaceChildren(
      h('button', { class: 'back', type: 'button', onClick: listView, style: { marginBottom: '8px' } }, icon('arrowLeft'), 'Inne materiały'),
      h('h3', { class: 'xd-title' }, data.title, h('small', {}, ` · ${KIND[data.kind][0]}`)),
      h('label', { class: 'check-row xd-all' }, all, 'Zaznacz wszystkie'),
      h('ol', { class: 'xd-qs' }, ...qs.map((x, i) => h('li', {}, h('label', { class: 'xd-q' }, checks[i],
        h('span', { class: 'xd-q__icon' }, icon(TYPE_ICON[x.type])),
        h('span', { class: 'xd-q__body' }, h('b', {}, TYPE[x.type].label, x.catName ? h('span', { class: 'q-cat-chip' }, x.catName) : null), h('span', {}, clean(x.prompt) || '(bez treści)')))))),
      h('div', { class: 'actions actions--end xd-actions' }, allBtn, pickBtn));
  }
  listView();
}
