// Wygląd aplikacji ucznia (kolory tła, akcentu i kart, kolor tekstu, czcionka) – z kupionych rzeczy.
// Używane na stronie „Mój profil”. Zmiany widać od razu; zapis tylko czytelnych zestawień (sprawdza też serwer).
import { h, icon, notice, toast, withBusy } from '../ui.js';
import { put } from '../api.js';
import { state, syncTheme, leaveGuards } from '../app.js';
import { applyTheme } from '../theme.js';
import { themeProblems, DEFAULT_THEME, isDefault } from '../shared/shop.js';

/** S = dane sklepu (/api/shop): katalog, posiadane rzeczy, aktualny motyw. */
export function appearanceEditor(S) {
  let draft = { ...S.theme };
  let saved = { ...S.theme };
  leaveGuards.add(() => { applyTheme(state.user.theme); });
  const owned = (key) => isDefault(key) || S.owned.includes(key);
  const box = h('div', { class: 'appear', id: 'wyglad' });
  const warn = h('div', { 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn btn--primary', type: 'button' }, icon('check'), 'Zapisz wygląd');
  const resetBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('repeat'), 'Przywróć domyślny');
  const selects = {};
  const list = (kind) => (kind === 'color' ? S.catalog.colors : kind === 'text' ? S.catalog.texts : S.catalog.fonts).filter((x) => owned(`${kind}:${x.id}`));
  const check = () => {
    const probs = themeProblems(draft);
    warn.replaceChildren(...probs.map((p) => notice('warn', h('strong', {}, 'Ups – to byłoby nieczytelne. '), p.msg)));
    saveBtn.disabled = !!probs.length || JSON.stringify(draft) === JSON.stringify(saved);
    for (const p of S.catalog.parts) {
      for (const opt of selects[p.key].options) {
        const bad = themeProblems({ ...draft, [p.key]: opt.value }).length > themeProblems({ ...draft, [p.key]: DEFAULT_THEME[p.key] }).length;
        opt.textContent = `${opt.dataset.name}${bad && opt.value !== draft[p.key] ? ' – nieczytelne z resztą' : ''}`;
      }
    }
    applyTheme(draft);
  };
  const rows = S.catalog.parts.map((p) => {
    const sel = h('select', { class: 'select', 'aria-label': p.label }, ...list(p.kind).map((x) => h('option', { value: x.id, selected: draft[p.key] === x.id, dataset: { name: x.name } }, x.name)));
    sel.addEventListener('change', () => { draft[p.key] = sel.value; check(); });
    selects[p.key] = sel;
    return h('label', { class: 'appear__row' }, h('span', {}, p.label), sel);
  });
  saveBtn.addEventListener('click', () => withBusy(saveBtn, async () => {
    try {
      const r = await put('/api/me/theme', { theme: draft });
      saved = { ...r.theme }; state.user.theme = r.theme; syncTheme(); check();
      toast('Zapisano Twój wygląd EDUKRO.');
    } catch (e) { toast(e.message, 'error'); }
  }));
  resetBtn.addEventListener('click', () => { draft = { ...DEFAULT_THEME }; for (const p of S.catalog.parts) selects[p.key].value = draft[p.key]; check(); });
  const ownedCount = S.owned.filter((k) => /^(color|text|font):/.test(k)).length;
  box.append(
    h('p', { class: 'muted' }, ownedCount ? 'Wybierz, które z kupionych kolorów i czcionek ma mieć Twoja aplikacja. Zmiany widzisz od razu – zapisz, żeby zostały.' : 'Kup w sklepie kolor albo czcionkę, a tu ustawisz, gdzie ma się pojawić – np. bursztynowe tło, a złote karty pytań.'),
    h('div', { class: 'appear__grid' }, h('div', { class: 'appear__rows' }, ...rows),
      h('div', { class: 'appear__prev', 'aria-hidden': 'true' },
        h('div', { class: 'appear__mini q-card-play' }, h('p', { class: 'q-num' }, 'Pytanie 1'), h('h3', { class: 'q-prompt' }, 'Jaki jest symbol tlenu?'),
          h('div', { class: 'appear__ans' }, h('span', {}, 'A  O'), h('span', {}, 'B  Ox')), h('span', { class: 'btn btn--primary btn--sm' }, 'Sprawdź')))),
    warn, h('div', { class: 'actions' }, resetBtn, saveBtn));
  queueMicrotask(check);
  return box;
}
