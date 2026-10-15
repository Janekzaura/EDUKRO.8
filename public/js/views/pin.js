// Wspólny formularz zmiany kodu PIN (nauczyciel, administrator).
import { h, dialog, notice, pinInput, toast, withBusy } from '../ui.js';
import { post } from '../api.js';
import { state, refreshSession } from '../app.js';

export function changePinForm({ onDone, submitLabel = 'Zapisz nowy kod' } = {}) {
  const len = state.status?.pinLength || 4;
  const cur = pinInput({ length: len, label: 'Obecny kod' });
  const n1 = pinInput({ length: len, label: 'Nowy kod' });
  const n2 = pinInput({ length: len, label: 'Powtórz nowy kod' });
  const err = h('div', { 'aria-live': 'assertive' });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, submitLabel);
  const group = (label, p, hint) => h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), p.el, hint ? h('p', { class: 'field__hint' }, hint) : null);
  const form = h('form', { class: 'sheet__body', novalidate: true, style: { marginTop: 0 } },
    group('Obecny kod', cur),
    group('Nowy kod', n1, `${len} cyfr. Unikaj powtórzeń (np. 7777) i ciągów (np. 1234).`),
    group('Powtórz nowy kod', n2),
    err, h('div', { class: 'actions' }, submit));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (n1.value() !== n2.value()) { n2.error(); return err.replaceChildren(notice('error', 'Nowy kod i jego powtórzenie różnią się.')); }
    withBusy(submit, async () => {
      try {
        await post('/api/auth/change-code', { current: cur.value(), next: n1.value(), nextRepeat: n2.value() });
        await refreshSession();
        toast('Kod dostępu został zmieniony.');
        cur.clear(); n1.clear(); n2.clear();
        err.replaceChildren();
        onDone && onDone();
      } catch (ex) {
        err.replaceChildren(notice('error', ex.message));
        if (/Aktualny/.test(ex.message)) { cur.error(); cur.clear(); }
      }
    });
  });
  return form;
}

/** Nauczyciel: zmiana kodu dostępu w okienku (z menu Ustawienia → Ustawienia ogólne) – bez osobnej strony. */
export function teacherCodeDialog() {
  let dlg = null;
  const form = changePinForm({ submitLabel: 'Zapisz nowy kod', onDone: () => dlg?.close() });
  dlg = dialog({ iconName: 'key', title: 'Zmień kod dostępu', body: [h('p', { class: 'muted' }, 'Podaj obecny kod, a potem nowy. Po zmianie pozostałe sesje Twojego konta zostaną wylogowane.'), form], actions: [{ label: 'Anuluj', kind: 'quiet' }] });
  return dlg;
}
