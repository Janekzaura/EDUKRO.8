// Przyznawanie punktów uczniom: administrator – bez limitu, nauczyciel – raz dziennie, łącznie do 100 pkt.
// Punkty trafiają do skrzynki ucznia i liczą się po odebraniu.
import { h, icon, notice, dialog, toast, input, formatDate, plural } from '../ui.js';
import { get, post } from '../api.js';
import { stepper } from './tests-list.js';
import * as sound from '../sound.js';
import { g } from '../g.js';
import { pointRulesBlock } from './point-rules.js';

const fullName = (x) => `${x.firstName} ${x.lastName}`;

export async function grantDialog({ preselect = [], onDone, mode: startMode = 'give' } = {}) {
  const data = await get('/api/grants');
  const b = data.budget;
  const teacher = !b.unlimited;
  if (teacher && b.usedToday) {
    return dialog({ iconName: 'clock', title: `Dziś już ${g('przyznałeś', 'przyznałaś')} punkty`, body: [h('p', {}, `Nauczyciel może przyznać punkty raz dziennie (łącznie do ${b.max} pkt). Dziś ${g('przyznałeś', 'przyznałaś')} już ${b.givenToday} pkt – kolejne przyznanie będzie możliwe jutro.`)], actions: [{ label: 'Rozumiem', kind: 'primary' }] });
  }
  let mode = teacher ? 'give' : startMode; // administrator może też odejmować punkty
  const take = () => mode === 'take';
  const chosen = new Set(preselect);
  const q = input({ type: 'search', placeholder: 'Szukaj ucznia…', 'aria-label': 'Szukaj ucznia' });
  const classes = [...new Set(data.students.map((s) => s.classLabel || ''))].sort((a, z) => a.localeCompare(z, 'pl', { numeric: true }));
  const cls = h('select', { class: 'select', 'aria-label': 'Klasa' }, h('option', { value: '' }, 'Wszystkie klasy'), ...classes.map((c) => h('option', { value: c, selected: !!data.homeroom && c.replace(/\s/g, '').toLowerCase() === data.homeroom.replace(/\s/g, '').toLowerCase() }, c ? `klasa ${c}` : 'bez klasy')));
  const list = h('div', { class: 'grant-list', role: 'group', 'aria-label': 'Uczniowie' });
  const amount = stepper({ value: teacher ? 10 : 50, min: 1, max: b.max, label: 'Punkty dla każdego ucznia', onChange: () => sum() });
  const msg = input({ maxlength: 200, placeholder: 'np. Za świetną pracę na lekcji!' });
  const msgLabel = h('span', { class: 'field__label' }, 'Wiadomość (opcjonalnie)');
  const amountLabel = h('span', { class: 'field__label' }, 'Punkty dla każdego zaznaczonego ucznia');
  const total = h('p', { class: 'grant-total', 'aria-live': 'polite' });
  const info = h('div');
  const err = h('div', { 'aria-live': 'assertive' });
  const quick = h('div', { class: 'chips' }, ...(teacher ? [5, 10, 20, 50, 100] : [10, 50, 100, 500, 1000]).map((n) => h('button', { class: 'chip chip--btn', type: 'button', onClick: () => { amount.input.value = String(n); sum(); } }, `${n} pkt`)));
  const balance = (s) => (typeof s.points === 'number' ? s.points : null);
  function sum() {
    const n = chosen.size, a = amount.value();
    total.replaceChildren(n ? h('span', {}, h('b', {}, `${n} ${plural(n, ['uczeń', 'uczniów', 'uczniów'])} × ${take() ? '−' : ''}${a} pkt = ${take() ? '−' : ''}${n * a} pkt`), teacher ? ` (Twój dzienny limit: ${b.max} pkt)` : take() ? ' (saldo nie spadnie poniżej zera)' : '') : h('span', { class: 'muted' }, 'Zaznacz uczniów na liście.'));
    total.classList.toggle('is-over', teacher && n * a > b.max);
    total.classList.toggle('is-take', take());
  }
  function renderList() {
    const v = q.value.trim().toLocaleLowerCase('pl-PL');
    const rows = data.students.filter((s) => (!cls.value || (s.classLabel || '') === cls.value) && (!v || fullName(s).toLocaleLowerCase('pl-PL').includes(v)));
    list.replaceChildren(...(rows.length ? rows.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: chosen.has(s.id) });
      cb.addEventListener('change', () => { if (cb.checked) chosen.add(s.id); else chosen.delete(s.id); sum(); });
      return h('label', { class: 'check-row grant-row' }, cb, h('span', {}, fullName(s)), h('small', { class: 'muted' }, [s.classLabel ? `kl. ${s.classLabel}` : '', !teacher && balance(s) !== null ? `${balance(s)} pkt` : ''].filter(Boolean).join(' · ')));
    }) : [h('p', { class: 'muted small' }, 'Brak zatwierdzonych kont uczniów pasujących do wyszukiwania.')]));
  }
  const allBtn = h('button', { class: 'linkish', type: 'button', onClick: () => { list.querySelectorAll('input').forEach((x) => { x.checked = true; x.dispatchEvent(new Event('change')); }); } }, 'Zaznacz widocznych');
  q.addEventListener('input', renderList); cls.addEventListener('change', renderList);
  const modeSeg = teacher ? null : h('div', { class: 'seg grant-mode', role: 'radiogroup', 'aria-label': 'Co zrobić z punktami' },
    ...[['give', 'gift', 'Dodaj punkty'], ['take', 'minus', 'Odejmij punkty']].map(([k, ic, label]) => {
      const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === k), 'data-help': k === 'take' ? 'Odejmuje punkty zaznaczonym uczniom (saldo nie spadnie poniżej zera). Uczeń dostanie wiadomość w skrzynce.' : 'Dodaje punkty – trafią do skrzynek uczniów.' }, icon(ic), label);
      btn.addEventListener('click', () => { mode = k; modeSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === btn))); applyMode(); });
      return btn;
    }));
  let d;
  function applyMode() {
    info.replaceChildren(teacher ? notice('info', h('strong', {}, 'Raz dziennie, łącznie do 100 pkt. '), 'Możesz dać punkty jednemu uczniowi albo kilku (np. 4 × 25 pkt). Punkty trafią do skrzynek uczniów.')
      : take() ? notice('warn', h('strong', {}, 'Odejmowanie punktów. '), 'Punkty znikną od razu z konta ucznia (najwyżej tyle, ile ma). Uczeń dostanie wiadomość w skrzynce z podanym powodem.')
        : notice('info', 'Jako administrator przyznajesz punkty bez limitu. Trafią do skrzynek uczniów – liczą się po odebraniu.'));
    amountLabel.textContent = take() ? 'Ile punktów odjąć każdemu zaznaczonemu uczniowi' : 'Punkty dla każdego zaznaczonego ucznia';
    msgLabel.textContent = take() ? 'Powód (uczeń go zobaczy)' : 'Wiadomość (opcjonalnie)';
    msg.placeholder = take() ? 'np. Punkty przyznane przez pomyłkę' : 'np. Za świetną pracę na lekcji!';
    if (d) {
      d.el.querySelector('#dlg-title').textContent = take() ? 'Odejmij punkty' : 'Przyznaj punkty';
      const go = d.el.querySelector('.dialog__actions .btn:last-child');
      go.textContent = take() ? 'Odejmij' : 'Przyznaj';
      go.classList.toggle('btn--danger', take()); go.classList.toggle('btn--primary', !take());
    }
    sum();
  }
  renderList(); applyMode();
  d = dialog({
    iconName: 'gift', title: 'Przyznaj punkty',
    body: [
      modeSeg, info,
      h('div', { class: 'grant-filters' }, q, cls),
      list, h('div', { class: 'grant-tools' }, allBtn, h('button', { class: 'linkish', type: 'button', onClick: () => { chosen.clear(); renderList(); sum(); } }, 'Wyczyść')),
      h('div', { class: 'field' }, amountLabel, h('div', { class: 'grant-amount' }, amount.el, quick)),
      total,
      h('label', { class: 'field' }, msgLabel, msg), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, {
      label: 'Przyznaj', kind: 'primary', onClick: async () => {
        try {
          if (take()) {
            const r = await post('/api/grants/deduct', { studentIds: [...chosen], amount: amount.value(), message: msg.value });
            toast(r.total ? `Odjęto łącznie ${r.total} pkt (${r.count} ${plural(r.count, ['uczeń', 'uczniów', 'uczniów'])}).${r.short.length ? ` ${r.short.length} ${plural(r.short.length, ['osoba miała', 'osoby miały', 'osób miało'])} mniej punktów – odjęto tyle, ile było.` : ''}` : 'Zaznaczeni uczniowie nie mają punktów – nic nie odjęto.');
            onDone?.(r);
            return;
          }
          const r = await post('/api/grants', { studentIds: [...chosen], amount: amount.value(), message: msg.value });
          sound.play('coin');
          toast(`Wysłano ${r.amount} pkt do ${r.count === 1 ? 'skrzynki ucznia' : `skrzynek ${r.count} uczniów`}.`);
          onDone?.(r);
        } catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      },
    }],
  });
  applyMode();
  return d;
}

export async function grantsSection({ admin = false, reload } = {}) {
  const data = await get('/api/grants');
  const b = data.budget;
  const head = h('header', { class: 'admin__head' },
    h('div', {}, admin ? h('h1', {}, 'Punkty') : h('h2', { class: 'section-title' }, 'Punkty dla uczniów'),
      h('p', { class: admin ? null : 'section-lead', style: { marginBottom: 0 } }, admin
        ? 'Przyznawaj i odejmuj punkty dowolnym uczniom – bez limitu. Uczniowie odbierają przyznane punkty w swojej skrzynce. Nauczyciele mogą przyznawać raz dziennie, łącznie do 100 pkt. Niżej ustawisz, ile punktów dają oceny, lekcje i testy.'
        : 'Nagródź uczniów za aktywność, pomoc albo świetną pracę. Możesz przyznać punkty raz dziennie, łącznie do 100 pkt – trafią do skrzynek uczniów.')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn--primary', type: 'button', disabled: !b.unlimited && b.usedToday, onClick: () => grantDialog({ onDone: () => reload?.() }) }, icon('gift'), 'Przyznaj punkty'),
      admin ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => grantDialog({ mode: 'take', onDone: () => reload?.() }), 'data-help': 'Odejmij punkty wybranym uczniom – np. przyznane przez pomyłkę.' }, icon('minus'), 'Odejmij punkty') : null));
  const status = b.unlimited ? null : b.usedToday
    ? notice('ok', h('strong', {}, `Dziś ${g('przyznałeś', 'przyznałaś')} już ${b.givenToday} pkt. `), 'Kolejne przyznanie będzie możliwe jutro.')
    : notice('info', h('strong', {}, 'Dziś możesz jeszcze przyznać punkty: '), `łącznie do ${b.max} pkt.`);
  const rows = data.history.map((x) => h('tr', { class: x.amount < 0 ? 'is-taken' : null },
    h('td', {}, fullName(x), x.message ? h('div', { class: 'small muted' }, `„${x.message}”`) : null),
    h('td', { 'data-label': 'Punkty', class: 'num' }, x.amount < 0 ? `−${-x.amount}` : `+${x.amount}`),
    admin ? h('td', { 'data-label': 'Kto' }, x.giverRole === 'admin' ? 'Administrator' : `${x.giverFirst || ''} ${x.giverLast || ''}`) : null,
    h('td', { 'data-label': 'Kiedy' }, formatDate(x.createdAt))));
  return h('div', {}, head, status,
    h('h3', { class: 'subhead' }, admin ? 'Ostatnio przyznane i odjęte' : 'Ostatnio przyznane'),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', {}, h('tr', {}, ...['Uczeń', 'Punkty', admin ? 'Kto' : null, 'Kiedy'].filter(Boolean).map((x) => h('th', { class: x === 'Punkty' ? 'num' : null }, x)))),
      h('tbody', {}, ...rows)))
      : h('div', { class: 'empty' }, icon('gift', 'empty__icon'), h('div', {}, h('h3', {}, 'Jeszcze nikt nie dostał punktów'), h('p', {}, 'Kliknij „Przyznaj punkty”, zaznacz uczniów i wpisz liczbę punktów.'))),
    admin ? await pointRulesBlock({ reload }) : null);
}
