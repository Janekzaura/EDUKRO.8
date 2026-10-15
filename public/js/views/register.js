// Rejestracja ucznia: imię i nazwisko (rejestr szkoły) → kod PIN (e-mail niewymagany) → konto czeka na zatwierdzenie.
// Uczeń od razu może się uczyć i zbierać punkty; administrator zatwierdza albo odrzuca konto.
import { h, icon, notice, field, input, pinInput, withBusy } from '../ui.js';
import { get, post } from '../api.js';
import { navigate, state, setCrumbs, renderTopbar, syncTheme } from '../app.js';

const STEPS = ['Imię i nazwisko', 'Kod PIN'];

export async function registerView() {
  if (state.user.role === 'student') { navigate('/uczen/profil', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Tryb ucznia', href: '/uczen' }, { label: 'Utwórz konto' }]);
  const reg = await get('/api/register/state');
  const ctx = { firstName: reg.firstName, maskedEmail: reg.maskedEmail, pinLength: reg.pinLength || state.status?.pinLength || 4 };

  const stepsEl = h('ol', { class: 'steps', 'aria-label': 'Etapy rejestracji' });
  const body = h('div', {});
  const sheet = h('div', { class: 'sheet' }, stepsEl, body);
  const root = h('div', { class: 'wrap wrap--narrow' },
    h('button', { class: 'back', type: 'button', onClick: cancel }, icon('arrowLeft'), 'Przerwij rejestrację'), sheet);

  async function cancel() {
    try { await post('/api/register/cancel'); } catch {}
    navigate('/uczen');
  }
  function setStep(i) {
    stepsEl.replaceChildren(...STEPS.map((s, k) => h('li', { class: [k < i && 'is-done', k === i && 'is-current'], 'aria-current': k === i ? 'step' : null }, h('span', {}, `${k + 1}. ${s}`))));
    stepsEl.hidden = i >= STEPS.length;
  }
  function show(i, ...content) {
    setStep(i);
    body.replaceChildren(h('div', { class: 'cat-view' }, ...content));
    const f = body.querySelector('input'); f && setTimeout(() => f.focus(), 60);
  }
  const errBox = () => h('div', { 'aria-live': 'assertive' });
  const handle = (box, e) => {
    if (e.body?.restart) { box.replaceChildren(notice('error', e.message)); setTimeout(stepName, 1600); return; }
    box.replaceChildren(notice('error', e.message));
  };

  /* KROK 1 */
  function stepName() {
    const first = input({ autocomplete: 'given-name', maxlength: 60 });
    const last = input({ autocomplete: 'family-name', maxlength: 80 });
    const err = errBox();
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Dalej');
    const form = h('form', { class: 'sheet__body', novalidate: true },
      h('div', { class: 'row-2' }, field({ label: 'Imię', input: first }), field({ label: 'Nazwisko', input: last })), err, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!first.value.trim() || !last.value.trim()) return err.replaceChildren(notice('error', 'Wpisz imię i nazwisko.'));
      withBusy(submit, async () => {
        try {
          const r = await post('/api/register/start', { firstName: first.value, lastName: last.value });
          ctx.firstName = r.firstName;
          stepCode();
        } catch (ex) {
          if (ex.body?.taken) {
            err.replaceChildren(notice('warn', ex.message, h('div', { class: 'actions' },
              h('a', { class: 'btn btn--ghost btn--sm', href: '/uczen/logowanie', 'data-link': '' }, 'Zaloguj się'),
              h('a', { class: 'btn btn--ghost btn--sm', href: '/uczen/zgloszenie', 'data-link': '' }, 'Moje imię i nazwisko jest zajęte'))));
          } else err.replaceChildren(notice('error', ex.message));
        }
      });
    });
    show(0, h('h1', {}, 'Utwórz konto ucznia'),
      h('p', { class: 'sheet__lead' }, 'Wpisz imię i nazwisko tak, jak zostały zgłoszone w szkole. Sprawdzimy je na liście uczniów EDUKRO.'),
      form,
      h('div', { class: 'sheet__foot' },
        h('span', {}, 'Masz już konto? ', h('a', { href: '/uczen/logowanie', 'data-link': '' }, 'Zaloguj się')),
        h('a', { href: '/uczen/zgloszenie', 'data-link': '' }, 'Moje imię i nazwisko jest zajęte')));
  }

  /* KROK 3 */
  function stepCode() {
    const len = ctx.pinLength;
    const err = errBox();
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Utwórz konto');
    const p1 = pinInput({ length: len, label: 'Twój kod PIN', onComplete: () => p2.focus() });
    const p2 = pinInput({ length: len, label: 'Powtórz kod PIN', onComplete: () => form.requestSubmit() });
    const form = h('form', { class: 'sheet__body', novalidate: true },
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, `Twój kod PIN (${len} cyfry)`), p1.el, h('p', { class: 'field__hint' }, 'Unikaj prostych kodów jak 1234 czy 7777.')),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Powtórz kod PIN'), p2.el),
      err, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (p1.value().length !== len) { p1.error(); return err.replaceChildren(notice('error', `Kod PIN musi mieć ${len} cyfry.`)); }
      if (p1.value() !== p2.value()) { p2.error(); p2.clear(); return err.replaceChildren(notice('error', 'Kod i jego powtórzenie różnią się.')); }
      withBusy(submit, async () => {
        try {
          const r = await post('/api/register/complete', { code: p1.value(), codeRepeat: p2.value() });
          state.user = r.user;
          syncTheme();
          await renderTopbar();
          stepDone();
        } catch (ex) { p1.clear(); p2.clear(); handle(err, ex); }
      });
    });
    show(1, h('h1', {}, 'Ustal kod PIN'),
      h('p', { class: 'sheet__lead' }, 'To Twój osobisty kod do logowania w EDUKRO. Zapamiętaj go – nikt, nawet administrator, nie może go odczytać.'),
      form);
    setTimeout(() => p1.focus(), 80);
  }

  /* GOTOWE */
  function stepDone() {
    show(STEPS.length,
      icon('check', 'dialog__icon'),
      h('h1', {}, 'Konto utworzone!'),
      h('p', { class: 'sheet__lead' }, 'Możesz już się uczyć, rozwiązywać testy i zbierać punkty. Prośba o zatwierdzenie konta trafiła do administratora EDUKRO.'),
      notice('info', h('strong', {}, 'Do czasu zatwierdzenia '), 'nie wydasz punktów w sklepie. Jeśli administrator nie zatwierdzi konta (np. gdy założył je ktoś inny), konto zostanie usunięte razem z punktami zdobytymi na nim.'),
      h('div', { class: 'sheet__body' },
        h('a', { class: 'btn btn--primary', href: '/uczen/przedmioty', 'data-link': '' }, 'Zacznij naukę', icon('arrowRight')),
        h('a', { class: 'btn btn--ghost', href: '/uczen/profil', 'data-link': '' }, 'Mój profil')));
  }

  ({ name: stepName, code: stepCode })[reg.step]?.() ?? stepName();
  return root;
}
