// Szablony lekcji i testów: wybór przy tworzeniu („Zacznij od szablonu”) i „Zapisz jako szablon” w edytorach.
import { h, icon, notice, toast, dialog, input, field, plural } from '../ui.js';
import { get, post, del } from '../api.js';

/**
 * Kafelki szablonów: „Pusta …” + gotowe + zapisane przez nauczycieli.
 * onPick(template | null) – null = bez szablonu.
 */
export async function templatePicker({ kind, onPick, emptyLabel, emptySub }) {
  const root = h('div', { class: 'tpl-picker' });
  let chosen = null;
  const unit = kind === 'lesson' ? ['slajd', 'slajdy', 'slajdów'] : ['pytanie', 'pytania', 'pytań'];
  async function load() {
    const d = await get(`/api/templates?kind=${kind}`);
    const card = (t) => {
      const b = h('button', { type: 'button', class: ['tpl-card', t && t.builtin && 'tpl-card--builtin'], role: 'radio', 'aria-checked': String((t?.id ?? null) === (chosen?.id ?? null)) },
        h('span', { class: 'tpl-card__icon' }, icon(!t ? 'plus' : t.builtin ? 'sparkle' : 'copy')),
        h('span', { class: 'tpl-card__body' },
          h('b', {}, t ? t.name : emptyLabel),
          h('small', {}, t ? t.description || `${t.count} ${plural(t.count, unit)}` : emptySub),
          t ? h('span', { class: 'tpl-card__meta' }, [t.kindLabel, `${t.count} ${plural(t.count, unit)}`, t.builtin ? 'gotowy szablon EDUKRO' : t.author ? `zapisał(a): ${t.author}` : null].filter(Boolean).join(' · ')) : null));
      b.addEventListener('click', () => { chosen = t; root.querySelectorAll('.tpl-card').forEach((x) => x.setAttribute('aria-checked', String(x === b))); onPick(t); });
      const wrap = h('div', { class: 'tpl-cell' }, b);
      if (t && !t.builtin && t.canDelete) {
        wrap.append(h('button', { class: 'icon-btn icon-btn--danger tpl-del', type: 'button', title: 'Usuń szablon', 'aria-label': `Usuń szablon ${t.name}`, onClick: () => dialog({
          iconName: 'trash', title: `Usunąć szablon „${t.name}”?`, body: h('p', {}, 'Lekcje i testy utworzone z tego szablonu zostaną – zniknie tylko sam szablon.'),
          actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Usuń', kind: 'danger', onClick: async () => { await del(`/api/templates/${t.id}`); toast('Szablon usunięty.'); if (chosen?.id === t.id) { chosen = null; onPick(null); } load(); } }],
        }) }, icon('trash')));
      }
      return wrap;
    };
    root.replaceChildren(
      h('div', { class: 'tpl-grid', role: 'radiogroup', 'aria-label': 'Szablon' }, card(null), ...d.builtin.map(card)),
      d.saved.length ? h('p', { class: 'tpl-group' }, 'Szablony nauczycieli') : null,
      d.saved.length ? h('div', { class: 'tpl-grid', role: 'radiogroup', 'aria-label': 'Szablony nauczycieli' }, ...d.saved.map(card)) : null,
      h('p', { class: 'field__hint' }, 'Szablon ma ten sam układ (slajdy albo pytania, elementy, wygląd, czasy), ale bez tekstu – wpiszesz własną treść. Własny szablon zapiszesz w edytorze: „Zapisz jako szablon”.'));
  }
  await load();
  return root;
}

/** „Zapisz jako szablon” – z bieżącej lekcji albo testu (najpierw zapis edytora). */
export function saveTemplateDialog({ kind, sourceId, title, beforeSave }) {
  const name = input({ maxlength: 80, value: title ? `Szablon: ${title}`.slice(0, 80) : '', placeholder: kind === 'lesson' ? 'np. Moja lekcja z grą' : 'np. Mój sprawdzian działowy' });
  const desc = input({ maxlength: 200, placeholder: 'np. Tytuł, 3 slajdy z wyjaśnieniem, quiz i gra (opcjonalnie)' });
  const err = h('div', { 'aria-live': 'assertive' });
  dialog({
    iconName: 'copy', title: 'Zapisz jako szablon',
    body: [h('p', {}, kind === 'lesson'
      ? 'Szablon zapamięta układ tej lekcji: rodzaje i kolejność slajdów, elementy, wygląd, obrazki i czasy – ale bez tekstu.'
      : 'Szablon zapamięta układ tego testu: rodzaje i kolejność pytań, ustawienia, czasy i obrazki – ale bez tekstu.'),
    field({ label: 'Nazwa szablonu', input: name }), field({ label: 'Opis (opcjonalnie)', input: desc }),
    notice('info', 'Szablon zobaczą wszyscy nauczyciele w „Nowa lekcja” / „Nowy test” → „Zacznij od szablonu”.'), err],
    actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Zapisz szablon', kind: 'primary', onClick: async () => {
      try {
        await beforeSave?.();
        await post('/api/templates', { kind, sourceId, name: name.value, description: desc.value });
        toast(`Zapisano szablon „${name.value.trim()}”.`);
      } catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
    } }],
  });
}
