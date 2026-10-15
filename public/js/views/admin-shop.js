// Administrator: ceny w sklepie i promocje czasowe (godzina, dzień, tydzień… albo własny termin).
import { h, icon, notice, toast, withBusy, switchEl, formatDate, input } from '../ui.js';
import { get, post, put, del } from '../api.js';
import { dialog } from '../ui.js';
import { bgShades } from '../shared/shop.js';
import { stepper } from './tests-list.js';

const PRESETS = [[1, '1 godzina'], [3, '3 godziny'], [24, '1 dzień'], [72, '3 dni'], [168, '1 tydzień'], [336, '2 tygodnie']];
const STATE = { active: ['Trwa', 'ok'], planned: ['Zaplanowana', 'info'], past: ['Zakończona', 'plain'] };
const KIND_LABEL = { color: 'Kolory', text: 'Kolor tekstu', font: 'Czcionki', avatar: 'Profilowe', frame: 'Ramki', title: 'Tytuły', music: 'Muzyka', cele: 'Efekty po teście', lifeline: 'Koło ratunkowe (cena za 1 szt.)', praise: 'Pochwała' };
const KIND_ICON = { font: 'font', lifeline: 'lifebuoy', praise: 'medal', avatar: 'user', frame: 'sparkle', title: 'tag', music: 'music', cele: 'sparkle' };

/* ---------- Pakiety tworzone przez administratora (np. „Pakiet muzyczny”) ---------- */
async function packsBlock(reload) {
  const d = await get('/api/admin/shop/packs');
  const byKind = {};
  for (const it of d.items) (byKind[it.kind] ||= []).push(it);
  function edit(pack = null) {
    const chosen = new Set(pack?.items || []);
    const name = input({ maxlength: 60, value: pack?.name || '', placeholder: 'np. Pakiet muzyczny' });
    const desc = input({ maxlength: 200, value: pack?.description || '', placeholder: 'np. Trzy utwory do nauki taniej' });
    const price = h('input', { class: 'input input--price', type: 'number', min: '1', max: '100000', inputmode: 'numeric', value: String(pack?.price || '') });
    const worth = h('p', { class: 'small muted' });
    const notifyCb = h('input', { type: 'checkbox', checked: !pack });
    const sync = () => {
      const sum = [...chosen].reduce((s0, k) => s0 + (d.items.find((x) => x.key === k)?.price || 0), 0);
      worth.textContent = `Wybrano: ${chosen.size} · osobno kosztują ${sum} pkt${Number(price.value) ? ` · zniżka ${Math.max(0, Math.round(100 - (Number(price.value) / Math.max(1, sum)) * 100))}%` : ''}`;
    };
    price.addEventListener('input', sync);
    const picker = h('div', { class: 'pack-picker' }, ...Object.entries(byKind).map(([k, list]) => h('div', { class: 'pack-picker__group' },
      h('h4', {}, KIND_LABEL[k] || k),
      h('div', { class: 'pack-picker__items' }, ...list.map((it) => {
        const b = h('button', { class: 'pack-pill', type: 'button', 'aria-pressed': String(chosen.has(it.key)) }, it.emoji ? `${it.emoji} ` : '', it.short, h('i', {}, `${it.price}`));
        b.addEventListener('click', () => { if (chosen.has(it.key)) chosen.delete(it.key); else chosen.add(it.key); b.setAttribute('aria-pressed', String(chosen.has(it.key))); sync(); });
        return b;
      })))));
    sync();
    const err = h('div', { 'aria-live': 'assertive' });
    dialog({
      iconName: 'gift', title: pack ? `Pakiet „${pack.name}”` : 'Nowy pakiet',
      body: [h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Nazwa'), name), h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Cena za cały pakiet (pkt)'), price)),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Opis (opcjonalnie)'), desc),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Co jest w pakiecie (kliknij, żeby dodać)'), picker, worth),
        !pack ? h('label', { class: 'check-row' }, notifyCb, 'Powiadom uczniów o nowym pakiecie') : null, err],
      actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: pack ? 'Zapisz' : 'Utwórz pakiet', kind: 'primary', onClick: async () => {
        const body = { name: name.value, description: desc.value, items: [...chosen], price: Number(price.value), notify: notifyCb.checked };
        try {
          if (pack) await put(`/api/admin/shop/packs/${pack.id}`, { ...body, active: pack.active });
          else await post('/api/admin/shop/packs', body);
          toast(pack ? 'Zapisano pakiet.' : 'Pakiet jest w sklepie.'); reload();
        } catch (e) { err.replaceChildren(notice('error', e.message)); return false; }
      } }],
    });
  }
  const rows = d.packs.map((p) => h('div', { class: ['pack-row', !p.active && 'is-off'] },
    h('div', {}, h('b', {}, p.name), h('small', {}, `${p.items.length} przedmiotów · ${p.price} pkt (osobno ${p.worth} pkt)${p.active ? '' : ' · ukryty'}`), h('small', {}, p.names.map((x) => x.name).join(' · '))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => edit(p) }, icon('edit'), 'Edytuj'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await put(`/api/admin/shop/packs/${p.id}`, { active: !p.active }); toast(p.active ? 'Pakiet ukryty.' : 'Pakiet znowu w sklepie.'); reload(); }) }, icon(p.active ? 'eye' : 'check'), p.active ? 'Ukryj' : 'Pokaż'),
      h('button', { class: 'btn btn--danger btn--sm', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await del(`/api/admin/shop/packs/${p.id}`); toast('Pakiet usunięty.'); reload(); }) }, icon('trash')))));
  return h('section', { class: 'block', 'data-help': 'Pakiety: wybierz kilka przedmiotów (np. utwory muzyczne) i ustal cenę za całość. Uczeń, który ma już część, płaci proporcjonalnie mniej.' },
    h('div', { class: 'block__head' }, h('h2', {}, icon('gift'), 'Pakiety'), h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => edit() }, icon('plus'), 'Nowy pakiet')),
    h('p', { class: 'muted small' }, 'Np. „Pakiet muzyczny” albo „Pakiet kosmiczny” (rakieta, Ziemia, kosmita, ramka Orbita). Uczeń płaci tylko za przedmioty, których jeszcze nie ma.'),
    rows.length ? h('div', { class: 'stack' }, ...rows) : h('p', { class: 'muted' }, 'Nie ma jeszcze pakietów.'));
}
const until = (ms) => new Date(ms).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function shopAdminSection({ reload }) {
  const d = await get('/api/admin/shop');

  /* ---------- Promocja tygodnia ---------- */
  const weekly = switchEl({
    label: 'Automatyczna promocja tygodnia', sub: d.weekly.current ? `Co tydzień inny przedmiot −25%. Teraz: ${d.weekly.current.name}, do ${until(d.weekly.current.until)}.` : 'Co tydzień inny przedmiot jest tańszy o 25%.',
    checked: d.weekly.enabled, onChange: async (v, el) => { try { await put('/api/admin/shop/settings', { weekly: v }); toast(v ? 'Włączono promocję tygodnia.' : 'Wyłączono promocję tygodnia.'); } catch (e) { el.checked = !v; toast(e.message, 'error'); } },
  });

  /* ---------- Nowa promocja ---------- */
  const groups = {};
  for (const k of d.promoKeys) {
    const it = d.items.find((x) => x.key === k.key);
    const g = k.key === 'all' ? 'Cały sklep' : KIND_LABEL[it?.kind] || 'Inne';
    (groups[g] ||= []).push(k);
  }
  const item = h('select', { class: 'select', 'aria-label': 'Przedmiot' }, ...Object.entries(groups).map(([g, list]) => h('optgroup', { label: g }, ...list.map((k) => h('option', { value: k.key }, k.key === 'all' ? 'Cały sklep (kosmetyki i koła ratunkowe)' : k.name)))));
  const off = stepper({ value: 25, min: 5, max: 90, label: 'Zniżka (%)' });
  let hours = 24, custom = false;
  const endInput = h('input', { class: 'input', type: 'datetime-local', hidden: true, style: { maxWidth: '240px' } });
  const presets = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Czas trwania' }, ...PRESETS.map(([v, l]) => h('button', { class: ['chip chip--btn', v === hours && 'is-on'], type: 'button', role: 'radio', 'aria-checked': String(v === hours), dataset: { h: String(v) } }, l)),
    h('button', { class: 'chip chip--btn', type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { h: 'custom' } }, 'Własny termin…'));
  presets.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    custom = b.dataset.h === 'custom'; if (!custom) hours = Number(b.dataset.h);
    presets.querySelectorAll('button').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
    endInput.hidden = !custom;
  });
  const note = input({ maxlength: 120, placeholder: 'np. Szczęśliwa godzina!' });
  const notifyCb = h('input', { type: 'checkbox', checked: true });
  const err = h('div', { 'aria-live': 'assertive' });
  const create = h('button', { class: 'btn btn--primary', type: 'button' }, icon('tag'), 'Utwórz promocję');
  create.addEventListener('click', () => withBusy(create, async () => {
    err.replaceChildren();
    const body = { item: item.value, off: off.value(), note: note.value, notify: notifyCb.checked };
    if (custom) { if (!endInput.value) { err.replaceChildren(notice('error', 'Wybierz, do kiedy ma trwać promocja.')); return; } body.endsAt = new Date(endInput.value).getTime(); }
    else body.hours = hours;
    try { await post('/api/admin/shop/promos', body); toast('Promocja działa – uczniowie dostali powiadomienie.'); reload(); }
    catch (e) { err.replaceChildren(notice('error', e.message)); }
  }));
  const form = h('div', { class: 'promo-form', 'data-help': 'Nowa promocja: wybierz przedmiot (albo cały sklep), zniżkę i czas trwania. Uczniowie dostaną powiadomienie w skrzynce.' },
    h('div', { class: 'row-2' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Na co'), item), h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Zniżka (%)'), off.el)),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Jak długo'), presets, endInput),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Opis (opcjonalnie)'), note),
    h('label', { class: 'check-row' }, notifyCb, 'Wyślij uczniom powiadomienie do skrzynki'),
    err, h('div', { class: 'actions' }, create));

  const promoRows = d.promos.map((p) => h('tr', {},
    h('td', {}, h('b', {}, p.item === 'all' ? 'Cały sklep' : p.name), p.note ? h('div', { class: 'small muted' }, p.note) : null),
    h('td', { 'data-label': 'Zniżka', class: 'num' }, `−${p.off}%`),
    h('td', { 'data-label': 'Kiedy' }, `${until(p.startsAt)} → ${until(p.endedAt || p.endsAt)}`),
    h('td', { 'data-label': 'Stan' }, h('span', { class: `badge badge--${STATE[p.state][1]}` }, STATE[p.state][0])),
    h('td', {}, p.state !== 'past' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: (e) => withBusy(e.currentTarget, async () => { await post(`/api/admin/shop/promos/${p.id}/end`); toast('Promocja zakończona.'); reload(); }) }, 'Zakończ teraz') : null)));

  /* ---------- Ceny ---------- */
  const changes = {};
  const saveBtn = h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, icon('check'), 'Zapisz ceny');
  const mark = () => { saveBtn.disabled = !Object.keys(changes).length; saveBtn.lastChild.textContent = Object.keys(changes).length ? `Zapisz ceny (${Object.keys(changes).length})` : 'Zapisz ceny'; };
  saveBtn.addEventListener('click', () => withBusy(saveBtn, async () => {
    try { await put('/api/admin/shop/prices', { prices: changes }); toast('Zapisano nowe ceny.'); reload(); } catch (e) { toast(e.message, 'error'); }
  }));
  const priceRow = (it) => {
    const inp = h('input', { class: 'input input--price', type: 'number', min: '0', max: String(d.maxPrice), value: String(it.price), inputmode: 'numeric', 'aria-label': `Cena: ${it.name}` });
    const row = h('tr', { class: it.price !== it.defaultPrice ? 'is-changed' : null });
    const reset = h('button', { class: 'btn btn--quiet btn--sm', type: 'button', hidden: it.price === it.defaultPrice, onClick: () => { inp.value = String(it.defaultPrice); changes[it.key] = null; reset.hidden = true; row.classList.add('is-dirty'); mark(); } }, 'Domyślna');
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      if (Number.isInteger(v) && v >= 0 && v <= d.maxPrice && v !== it.price) changes[it.key] = v === it.defaultPrice ? null : v; else delete changes[it.key];
      row.classList.toggle('is-dirty', it.key in changes); mark();
    });
    const sw = it.hex ? h('span', { class: ['swatch swatch--sm', it.fx && `fx-${it.fx}`, it.kind === 'text' && 'swatch--text'], style: { '--c': it.hex, '--deep': it.kind === 'color' ? bgShades(it.key.split(':')[1])[900] : '#0E1529' } }, it.kind === 'text' ? 'Aa' : '')
      : it.emoji ? h('span', { class: 'swatch swatch--sm swatch--icon', style: { fontSize: '18px' } }, it.emoji) : h('span', { class: 'swatch swatch--sm swatch--icon' }, icon(KIND_ICON[it.kind] || 'medal'));
    row.append(h('td', {}, h('span', { class: 'price-name' }, sw, h('span', {}, it.name.replace(/^(kolor tekstu|kolor|czcionka|profilowe|ramka|tytuł|muzyka|efekt) /, '').replace(/[„”]/g, ''), it.tier === 'premium' ? h('small', { class: 'tier', style: { marginLeft: '8px' } }, 'premium') : null))),
      h('td', { 'data-label': 'Domyślnie', class: 'num muted' }, `${it.defaultPrice} pkt`),
      h('td', { 'data-label': 'Cena' }, h('span', { class: 'price-edit' }, inp, 'pkt', reset)));
    return row;
  };
  const byKind = {};
  for (const it of d.items) (byKind[it.kind] ||= []).push(it);
  const priceTables = Object.entries(byKind).map(([k, list]) => h('details', { class: 'price-group', open: k === 'color' },
    h('summary', {}, KIND_LABEL[k] || k, h('span', { class: 'muted small' }, ` · ${list.length}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards price-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Przedmiot'), h('th', { class: 'num' }, 'Domyślnie'), h('th', {}, 'Cena w sklepie'))),
      h('tbody', {}, ...list.map(priceRow))))));

  return h('div', { class: 'admin-shop' },
    h('header', { class: 'admin__head' }, h('div', {}, h('h1', {}, 'Sklep: ceny i promocje'),
      h('p', {}, 'Zmieniaj ceny przedmiotów i uruchamiaj promocje na godzinę, dzień albo tydzień. Promocje się nie sumują – uczeń płaci według największej zniżki.'))),
    h('section', { class: 'block' }, h('h2', {}, icon('tag'), 'Nowa promocja'), form),
    h('section', { class: 'block' }, h('h2', {}, 'Promocje'),
      weekly.el,
      d.personalActive ? h('p', { class: 'small muted', style: { margin: '10px 0' } }, `Osobiste promocje uczniów (nagrody za testy) – aktywne: ${d.personalActive}.`) : null,
      promoRows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
        h('thead', {}, h('tr', {}, ...['Promocja', 'Zniżka', 'Kiedy', 'Stan', ''].map((x) => h('th', { class: x === 'Zniżka' ? 'num' : null }, x)))), h('tbody', {}, ...promoRows)))
        : h('p', { class: 'muted', style: { marginTop: '12px' } }, 'Nie ma jeszcze żadnych promocji.')),
    await packsBlock(reload),
    h('section', { class: 'block' }, h('div', { class: 'block__head' }, h('h2', {}, 'Ceny'), saveBtn),
      h('p', { class: 'muted small' }, 'Zmienione ceny są podświetlone. Pakiety liczą się z aktualnych cen (ze swoją zniżką).'),
      ...priceTables));
}
