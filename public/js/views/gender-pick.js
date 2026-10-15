// Wybór formy zwracania się („zrobiłeś” / „zrobiłaś”) – na własnym koncie i w panelu administratora.
import { h, toast } from '../ui.js';
import { put } from '../api.js';
import { state } from '../app.js';

/** Własne konto: „Jak EDUKRO ma się do Ciebie zwracać?” */
export function myGenderPicker() {
  const u = state.user;
  const box = h('div', { class: 'gender-pick', 'data-help': 'Wybierz, jak EDUKRO ma się do Ciebie zwracać – na przykład „dobrze to zrobiłeś” albo „dobrze to zrobiłaś”.' });
  const render = () => box.replaceChildren(
    h('span', { class: 'field__label' }, 'Jak EDUKRO ma się do Ciebie zwracać?'),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Forma zwracania się' },
      ...[['m', 'Dobrze to zrobiłeś!'], ['f', 'Dobrze to zrobiłaś!']].map(([k, label]) => {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.user.gender === k) }, label);
        b.addEventListener('click', async () => {
          if (state.user.gender === k) return;
          try {
            const r = await put('/api/me/gender', { gender: k });
            Object.assign(state.user, { gender: r.user.gender, genderSet: true });
            render();
            toast(k === 'f' ? 'Gotowe – EDUKRO będzie zwracać się do Ciebie w formie żeńskiej.' : 'Gotowe – EDUKRO będzie zwracać się do Ciebie w formie męskiej.');
          } catch (e) { toast(e.message, 'error'); }
        });
        return b;
      })),
    h('p', { class: 'field__hint' }, u.genderSet || state.user.genderSet ? 'Możesz to zmienić w każdej chwili.' : 'EDUKRO odgadło to z imienia – popraw, jeśli się pomyliło.'));
  render();
  return box;
}

/** Panel administratora: mały przełącznik „on / ona” przy koncie. */
export function genderToggle(acc, onDone) {
  const el = h('div', { class: 'seg seg--sm gender-toggle', role: 'radiogroup', 'aria-label': `Forma dla: ${acc.firstName} ${acc.lastName}`, 'data-help': 'Jak EDUKRO zwraca się do tej osoby: „zrobiłeś” (on) albo „zrobiłaś” (ona). Domyślnie odgadujemy z imienia.' },
    ...[['m', 'on'], ['f', 'ona']].map(([k, label]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(acc.gender === k), title: k === 'm' ? 'Forma męska – „zrobiłeś”' : 'Forma żeńska – „zrobiłaś”' }, label);
      b.addEventListener('click', async () => {
        if (acc.gender === k) return;
        try {
          await put(`/api/admin/accounts/${acc.id}/gender`, { gender: k });
          acc.gender = k; acc.genderSet = true;
          el.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-checked', String(['m', 'f'][i] === k)));
          toast(`${acc.firstName} ${acc.lastName}: forma ${k === 'f' ? 'żeńska („zrobiłaś”)' : 'męska („zrobiłeś”)'}.`);
          onDone?.();
        } catch (e) { toast(e.message, 'error'); }
      });
      return b;
    }));
  return el;
}
