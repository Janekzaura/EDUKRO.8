// Administrator: ile punktów dają oceny ze sprawdzianu, lekcje (koło fortuny, gry) i nowe testy.
import { h, icon, notice, toast, withBusy, dialog } from '../ui.js';
import { get, put } from '../api.js';
import { stepper } from './tests-list.js';
import { state } from '../app.js';
import { applyPointRules } from '../point-rules-apply.js';

const GRADE_NAMES = ['niedostateczna', 'dopuszczająca', 'dostateczna', 'dobra', 'bardzo dobra', 'celująca'];

export async function pointRulesBlock({ reload } = {}) {
  const { rules, defaults, max } = await get('/api/admin/points-rules');
  const changed = new Set();
  const save = h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, icon('check'), 'Zapisz nagrody');
  const mark = (key, v, def) => { if (v !== def) changed.add(key); else changed.delete(key); save.disabled = false; };
  const field = (label, value, def, onChange, hint) => {
    const st = stepper({ value, min: 0, max, label, onChange: (v) => { onChange(v); mark(label, v, value); } });
    return h('div', { class: ['field', 'rule-field', value !== def && 'is-changed'] },
      h('span', { class: 'field__label' }, label), st.el,
      h('span', { class: 'field__hint' }, value !== def ? `domyślnie ${def} pkt` : hint || 'pkt'));
  };
  const next = { grades: [...rules.grades], wheel: rules.wheel, gameWin: rules.gameWin, gameDraw: rules.gameDraw, teachingFirst: rules.teachingFirst, examFirst: rules.examFirst, examRepeat: rules.examRepeat, lessonStar: rules.lessonStar, schoolStar: rules.schoolStar };
  const grades = rules.grades.map((v, i) => field(`Ocena ${i + 1}`, v, defaults.grades[i], (x) => { next.grades[i] = x; }, GRADE_NAMES[i]));
  save.addEventListener('click', () => withBusy(save, async () => {
    try {
      const r = await put('/api/admin/points-rules', next);
      applyPointRules(r.rules);
      if (state.status) state.status.pointRules = r.rules;
      toast('Zapisano nagrody punktowe.');
      reload?.();
    } catch (e) { toast(e.message, 'error'); }
  }));
  const reset = h('button', { class: 'btn btn--quiet', type: 'button', onClick: () => dialog({
    iconName: 'info', title: 'Przywrócić domyślne nagrody?', body: h('p', {}, 'Punkty za oceny, lekcje i domyślne punkty dla nowych testów wrócą do ustawień fabrycznych EDUKRO.'),
    actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Przywróć domyślne', kind: 'primary', onClick: async () => {
      const r = await put('/api/admin/points-rules', { reset: true }); applyPointRules(r.rules); toast('Przywrócono domyślne nagrody.'); reload?.();
    } }],
  }) }, 'Przywróć domyślne');
  return h('section', { class: 'block rules-block', 'data-help': 'Tu ustawiasz, ile punktów uczniowie dostają za oceny ze sprawdzianów, na lekcjach i za nowe testy.' },
    h('div', { class: 'block__head' }, h('h2', {}, icon('star'), 'Nagrody punktowe'), h('div', { class: 'actions' }, reset, save)),
    h('p', { class: 'muted small' }, 'Zmiany działają od razu dla nowych wyników. Punkty zdobyte wcześniej się nie zmieniają.'),
    h('h3', { class: 'subhead' }, 'Sprawdzian – punkty za ocenę'),
    h('p', { class: 'muted small' }, 'Liczy się najlepsza ocena ucznia: gdy poprawi ocenę, dostaje różnicę punktów.'),
    h('div', { class: 'rules-grid' }, ...grades),
    h('h3', { class: 'subhead' }, 'Lekcja'),
    h('div', { class: 'rules-grid' },
      field('Koło fortuny – dobra odpowiedź', rules.wheel, defaults.wheel, (x) => { next.wheel = x; }),
      field('Gra klasowa – wygrana drużyna', rules.gameWin, defaults.gameWin, (x) => { next.gameWin = x; }, 'pkt dla każdej osoby'),
      field('Gra klasowa – remis', rules.gameDraw, defaults.gameDraw, (x) => { next.gameDraw = x; }, 'pkt dla wszystkich'),
      field('Gwiazda lekcji', rules.lessonStar, defaults.lessonStar, (x) => { next.lessonStar = x; }, 'pkt dla najaktywniejszej osoby'),
      field('Gwiazda szkoły (piątek 16:00)', rules.schoolStar, defaults.schoolStar, (x) => { next.schoolStar = x; }, 'pkt + tytuł i ×1,2 na tydzień')),
    h('h3', { class: 'subhead' }, 'Nowe testy – punkty domyślne'),
    notice('info', 'Te wartości dostaje każdy nowo utworzony test. Nauczyciel może je zmienić w ustawieniach swojego testu; już istniejące testy zachowują swoje punkty.'),
    h('div', { class: 'rules-grid' },
      field('Test nauczający – pierwsze ukończenie', rules.teachingFirst, defaults.teachingFirst, (x) => { next.teachingFirst = x; }),
      field('Egzamin – pierwsze zaliczenie', rules.examFirst, defaults.examFirst, (x) => { next.examFirst = x; }),
      field('Egzamin – powtórka', rules.examRepeat, defaults.examRepeat, (x) => { next.examRepeat = x; })));
}
