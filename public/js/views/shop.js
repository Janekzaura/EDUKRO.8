// Sklep EDUKRO: rozwijane działy – profilowe, ramki, tytuły, muzyka, efekty, kolory, czcionki, pakiety, koła ratunkowe, pochwała.
// Kupione rzeczy ustawia się w „Mój profil” (/uczen/profil).
import { h, icon, notice, dialog, toast, withBusy, plural, formatDate } from '../ui.js';
import { get, post, put } from '../api.js';
import { navigate, state, setCrumbs, leaveGuards, refreshAvatar, exitButton } from '../app.js';
import { itemOf, isDefault, bgShades, cardShade, titleText } from '../shared/shop.js';
import { avatarEl } from '../avatar.js';
import { celebrate } from '../celebrate.js';
import { pulseNow } from '../fun.js';
import { confetti } from './test-player.js';
import * as sound from '../sound.js';

const PRAISE_STATUS = { pending: ['czeka na decyzję', 'wait'], granted: ['przyznana!', 'ok'], rejected: ['nieprzyznana – punkty wróciły', 'plain'] };

export async function shopView() {
  if (state.user.role !== 'student') { navigate('/uczen/logowanie', { replace: true }); return null; }
  setCrumbs([{ label: 'Ekran główny', href: '/' }, { label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: 'Mój profil', href: '/uczen/profil' }, { label: 'Sklep' }]);
  let S = await get('/api/shop');
  const root = h('div', { class: 'wrap shop' });
  let profDraft = { ...S.profile };
  let stopPreview = null;
  leaveGuards.add(() => { stopPreview?.(); });

  const owned = (key) => isDefault(key) || S.owned.includes(key);
  async function refresh() { S = await get('/api/shop'); state.user.points = S.balance; profDraft = { ...S.profile }; render(); pulseNow(); }
  async function saveProfile(profile, quiet = false) {
    const r = await put('/api/me/profile', { profile });
    S.profile = r.profile; profDraft = { ...r.profile };
    state.user.card = r.card;
    refreshAvatar();
    sound.setTrack(r.card.music);
    if (!quiet) toast('Zapisano Twój profil.');
    return r;
  }

  function buy(key, { label, price, qty, message, extra, equip } = {}) {
    if (!S.canSpend) return dialog({ iconName: 'lock', title: 'Konto czeka na zatwierdzenie', body: h('p', {}, 'Punkty możesz wydawać, gdy administrator zatwierdzi Twoje konto. Zbieraj je dalej!'), actions: [{ label: 'Rozumiem', kind: 'primary' }] });
    if (S.balance < price) return toast(`Brakuje Ci ${price - S.balance} pkt.`, 'error');
    dialog({
      iconName: 'bag', title: `Kupić: ${label}?`,
      body: [h('p', {}, `Cena: ${price} pkt. Po zakupie zostanie Ci ${S.balance - price} pkt.`), extra || null],
      actions: [{ label: 'Anuluj', kind: 'quiet' }, ...[equip ? [true, `Kupuję i ustawiam`] : null, [false, `Kupuję za ${price} pkt`]].filter(Boolean).map(([andEquip, lbl], i, arr) => ({ label: lbl, kind: i === arr.length - 1 ? 'primary' : 'ghost', onClick: async () => {
        try {
          await post('/api/shop/buy', { item: key, qty, message: message?.() });
          toast(`Kupiono: ${label}!`);
          sound.play('claim');
          confetti({ count: 60 });
          if (andEquip) await saveProfile({ ...S.profile, [equip.part]: equip.id }, true);
          await refresh();
        } catch (e) { toast(e.message, 'error'); return false; }
      } }))],
    });
  }

  const info = (key) => S.priceInfo?.[key];
  const onPromo = (key) => !!info(key)?.off;
  const priceTag = (key, base) => {
    const i = info(key);
    const p = S.prices[key] ?? base;
    return i?.off ? h('span', { class: 'price price--promo' }, h('s', {}, `${i.base}`), ` ${p} pkt`) : h('span', { class: 'price' }, `${p} pkt`);
  };
  const buyBtn = (key, name, base) => {
    if (owned(key)) return h('span', { class: 'owned' }, icon('check'), isDefault(key) ? 'Domyślny' : 'Masz');
    const p = S.prices[key] ?? base;
    return h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !S.canSpend || S.balance < p, onClick: () => buy(key, { label: name, price: p }) }, priceTag(key, base));
  };

  function swatchCard(c, kind) {
    const key = `${kind}:${c.id}`;
    const fx = c.fx ? `fx-${c.fx}` : '';
    const prev = kind === 'color'
      ? h('span', { class: ['swatch', fx], style: { '--c': c.hex, '--deep': bgShades(c.id)[900] } })
      : h('span', { class: ['swatch swatch--text', fx], style: { '--c': c.hex } }, 'Aa');
    return h('div', { class: ['shop-item', c.tier === 'premium' && 'is-premium', onPromo(key) && 'is-promo', info(key)?.personal && 'is-personal'], 'data-help': `${c.name}: ${c.note || (kind === 'color' ? 'kolor tła, akcentu albo kart' : 'kolor tekstu')}. Kup za punkty, a potem ustaw w „Mój profil” → Wygląd aplikacji.` },
      prev, h('div', { class: 'shop-item__body' }, h('b', {}, c.name), c.note ? h('small', {}, c.note) : null,
        c.tier === 'premium' ? h('span', { class: 'tier' }, icon('star'), 'premium') : null),
      buyBtn(key, c.name, c.price));
  }
  function fontCard(f) {
    const key = `font:${f.id}`;
    return h('div', { class: ['shop-item shop-item--font', f.tier === 'premium' && 'is-premium', onPromo(key) && 'is-promo', info(key)?.personal && 'is-personal'] },
      h('span', { class: 'font-prev' }, h('span', { style: { fontFamily: f.head } }, 'Zażółć'), h('small', { style: { fontFamily: f.body } }, 'gęślą jaźń – 123')),
      h('div', { class: 'shop-item__body' }, h('b', {}, f.name), f.note ? h('small', {}, f.note) : null),
      buyBtn(key, `czcionka „${f.name}”`, f.price));
  }

  const profList = (kind) => ({ avatar: S.catalog.avatars, frame: S.catalog.frames, title: S.catalog.titles, music: S.catalog.music, cele: S.catalog.cele }[kind]);

  function profCard(kind, x) {
    const key = `${kind}:${x.id}`;
    const exclusive = x.tier === 'exclusive';
    const anim = x.anim || ['neon', 'rainbow', 'orbit', 'fire', 'vinyl', 'can', 'scooter'].includes(x.id) && kind === 'frame';
    let prev;
    if (kind === 'avatar') prev = avatarEl({ ...S.me, avatar: x.id, frame: 'none' }, { size: 52, frame: false });
    else if (kind === 'frame') prev = h('span', { class: 'prof-prev prof-prev--frame' }, avatarEl({ ...S.me, avatar: profDraft.avatar, frame: x.id }, { size: 38 }));
    else if (kind === 'title') prev = h('span', { class: 'prof-prev prof-prev--title' }, icon(exclusive ? 'crown' : 'tag'));
    else if (kind === 'music') prev = h('button', { class: 'prof-prev prof-prev--play', type: 'button', 'aria-label': `Posłuchaj: ${x.name}`, onClick: () => { stopPreview?.(); stopPreview = sound.previewTrack(x.id, 10000); toast(`Gra: ${x.name} (10 s)`, 'info'); } }, icon('play'));
    else prev = h('button', { class: 'prof-prev prof-prev--play', type: 'button', 'aria-label': `Pokaż: ${x.name}`, onClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); celebrate({ count: 70, style: x.id, origin: [r.left + r.width / 2, r.top] }); } }, icon('sparkle'));
    const label = kind === 'title' ? titleText(x.id, state.user.gender) : x.name;
    const action = owned(key) ? h('span', { class: 'owned' }, icon('check'), 'Masz')
      : exclusive ? h('span', { class: 'owned owned--lock' }, icon('lock'), 'Tylko z rankingu')
        : h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !S.canSpend || S.balance < (S.prices[key] ?? x.price), onClick: () => buy(key, { label: kind === 'title' ? `tytuł „${label}”` : x.name, price: S.prices[key] ?? x.price, equip: { part: kind, id: x.id } }) }, priceTag(key, x.price));
    return h('div', { class: ['shop-item', 'shop-item--prof', `prof-${kind}`, x.tier === 'premium' && 'is-premium', exclusive && 'is-exclusive', onPromo(key) && 'is-promo', info(key)?.personal && 'is-personal'] },
      prev, h('div', { class: 'shop-item__body' }, h('b', {}, kind === 'title' ? `〈${label}〉` : label), x.note ? h('small', {}, x.note) : null,
        x.tier === 'premium' ? h('span', { class: 'tier' }, icon('star'), anim ? 'premium · animowane' : 'premium') : exclusive ? h('span', { class: 'tier tier--excl' }, icon('crown'), 'wyjątkowy') : null),
      action);
  }
  const profSection = (kind, title, ic, lead, id) => h('section', { class: 'shop-sec', id },
    h('h2', {}, icon(ic), title), h('p', { class: 'muted' }, lead),
    h('div', { class: 'shop-grid' }, ...profList(kind).filter((x) => x.tier !== 'default').map((x) => profCard(kind, x))));

  function packCard(p) {
    return h('div', { class: 'shop-item shop-item--bundle shop-item--admin-pack' },
      h('span', { class: 'bundle-off' }, icon('gift')),
      h('div', { class: 'shop-item__body' }, h('b', {}, p.name), p.description ? h('small', {}, p.description) : null,
        h('small', { class: 'pack-items' }, p.names.map((x) => x.name).join(' · ')),
        p.missing.length && p.missing.length < p.items.length ? h('small', {}, `Płacisz tylko za to, czego jeszcze nie masz (${p.missing.length} z ${p.items.length}).`) : null,
        savingNote(p.missing.length, p.separate, p.saving)),
      p.missing.length ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !S.canSpend || S.balance < p.price, onClick: () => buy(`pack:${p.id}`, { label: `pakiet „${p.name}”`, price: p.price }) },
        p.saving > 0 ? h('span', { class: 'price price--promo' }, h('s', {}, String(p.separate)), ` ${p.price} pkt`) : `${p.price} pkt`)
        : h('span', { class: 'owned' }, icon('check'), 'Masz wszystko'));
  }

  /** „Osobno teraz X pkt – oszczędzasz Y” – liczone z aktualnych cen (z promocjami). */
  const savingNote = (n, separate, saving) => !n ? null : h('small', { class: 'saving-note' }, saving > 0
    ? `Osobno teraz ${separate} pkt – oszczędzasz ${saving} pkt.`
    : 'Przez promocję osobno wychodzi teraz tak samo.');
  /** Opis pakietu kół – zawsze liczony z AKTUALNEJ ceny pojedynczego koła (także w promocji). */
  function lifelineNote(p) {
    if (p.qty === 1) return h('small', {}, p.promoOff ? [h('span', { class: 'off-chip' }, `−${p.promoOff}%`), ` promocja · zwykle ${p.singleBase} pkt`] : 'pojedyncze');
    const pct = p.separate ? Math.round((p.saving / p.separate) * 100) : 0;
    return h('small', {}, pct > 0 ? h('span', { class: 'off-chip' }, `−${pct}%`) : null,
      ` osobno ${p.qty} × ${p.single} = ${p.separate} pkt`, p.saving > 0 ? ` · oszczędzasz ${p.saving} pkt` : '');
  }
  /* ---------- Rozwijane działy (nie trzeba przewijać w nieskończoność) ---------- */
  let openSecs;
  try { openSecs = new Set(JSON.parse(sessionStorage.getItem('edukro-shop-open') || '[]')); } catch { openSecs = new Set(); }
  if (location.hash.length > 1) openSecs.add(location.hash.slice(1));
  const keepOpen = () => { try { sessionStorage.setItem('edukro-shop-open', JSON.stringify([...openSecs])); } catch { /* nic */ } };
  function acc(id, ic, title, sub, count, ...content) {
    const d = h('details', { class: 'acc', id, open: openSecs.has(id) },
      h('summary', { class: 'acc__head' }, h('span', { class: 'acc__icon' }, icon(ic)), h('span', { class: 'acc__txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null),
        count ? h('span', { class: 'acc__count' }, count) : null, icon('chevron', 'acc__caret')),
      h('div', { class: 'acc__body' }, ...content));
    d.addEventListener('toggle', () => { if (d.open) openSecs.add(id); else openSecs.delete(id); keepOpen(); });
    return d;
  }
  const ownedOf = (list, kind) => { const buyable = list.filter((x) => x.tier !== 'default'); return `masz ${buyable.filter((x) => owned(`${kind}:${x.id}`)).length} z ${buyable.length}`; };
  const profGrid = (kind) => h('div', { class: 'shop-grid' }, ...profList(kind).filter((x) => x.tier !== 'default').map((x) => profCard(kind, x)));

  function render() {
    const L = S.catalog.lifeline;
    const until = (ms, dateOnly = false) => new Date(ms - (dateOnly ? 1 : 0)).toLocaleString('pl-PL', { day: 'numeric', month: 'long', ...(!dateOnly && ms - Date.now() < 2 * 86400e3 ? { hour: '2-digit', minute: '2-digit' } : {}) });
    const msg = h('textarea', { class: 'textarea', rows: 2, maxlength: 300, placeholder: 'Np. Bardzo się staram na chemii – proszę o pochwałę :)' });
    const pendingPraise = S.praise.requests.find((r) => r.status === 'pending');
    const packsN = (S.catalog.packs || []).length + S.catalog.bundles.length;
    root.replaceChildren(
      h('div', { class: 'page-top' }, exitButton(),
        h('a', { class: 'btn btn--ghost btn--sm', href: '/uczen/profil', 'data-link': '', 'data-help': 'Mój profil – tu ustawisz kupione rzeczy (profilowe, ramkę, tytuł, muzykę, kolory).' }, icon('user'), 'Mój profil')),
      h('header', { class: 'shop-head' },
        h('div', {}, h('h1', {}, 'Sklep EDUKRO'), h('p', {}, 'Kliknij dział, żeby go rozwinąć. Kupione rzeczy ustawisz w „Mój profil”.')),
        h('div', { class: 'wallet', 'data-help': 'Twoje punkty do wydania.' }, icon('star'), h('b', {}, String(S.balance)), h('span', {}, 'pkt'))),
      !S.canSpend ? notice('info', h('strong', {}, 'Konto czeka na zatwierdzenie. '), 'Możesz oglądać sklep i zbierać punkty, ale kupisz coś dopiero, gdy administrator zatwierdzi Twoje konto.') : null,
      (S.promos || []).length ? h('div', { class: 'promo-strip' }, ...(S.promos || []).map((p) => h('div', { class: ['promo', p.personal && 'promo--personal'] }, icon(p.personal ? 'gift' : 'tag'),
        h('span', {}, h('b', {}, `${p.personal ? 'Twoja promocja' : p.weekly ? 'Promocja tygodnia' : 'Promocja'}: ${p.item === 'all' ? 'cały sklep' : (itemOf(p.item)?.name || p.name)} −${p.off}%`),
          p.note && !p.weekly ? ` · ${p.note}` : '', p.weekly ? ` · do ${until(p.until - 86400e3, true)} włącznie` : ` · do ${until(p.until)}`)))) : null,
      h('div', { class: 'acc-list' },
        h('p', { class: 'acc-group' }, 'Mój profil w rankingach'),
        acc('profilowe', 'user', 'Profilowe', 'Obrazek przy Twoim imieniu – premium są animowane', ownedOf(S.catalog.avatars, 'avatar'), profGrid('avatar')),
        acc('ramki', 'sparkle', 'Ramki', 'Od kocich uszu po hulajnogę, winyl i puszkę EDU FIZZ', ownedOf(S.catalog.frames, 'frame'), profGrid('frame')),
        acc('tytuly', 'medal', 'Tytuły', 'Widać je przy imieniu w rankingach', ownedOf(S.catalog.titles.filter((t) => t.tier !== 'exclusive'), 'title'),
          h('p', { class: 'muted small' }, 'Wyjątkowe tytuły (oznaczone koroną) zdobywa się tylko w rankingu ogólnym – ponad 3 dni na 1. miejscu.'), profGrid('title')),
        acc('muzyka', 'music', 'Muzyka', 'Kliknij ▶, żeby posłuchać – gra też u osoby, która otworzy Twój profil', ownedOf(S.catalog.music, 'music'), profGrid('music')),
        acc('efekty', 'sparkle', 'Efekty po teście', 'Co wybucha na ekranie po zaliczonym teście', ownedOf(S.catalog.cele, 'cele'), profGrid('cele')),
        h('p', { class: 'acc-group' }, 'Wygląd aplikacji'),
        acc('kolory', 'palette', 'Kolory', 'Tło, przyciski albo karty pytań – złoty, srebrny i tęczowy mają efekty', ownedOf(S.catalog.colors, 'color'),
          h('div', { class: 'shop-grid' }, ...S.catalog.colors.filter((c) => c.tier !== 'default').map((c) => swatchCard(c, 'color')))),
        acc('tekst', 'type', 'Kolor tekstu', 'EDUKRO nie pozwoli wybrać tekstu, który zleje się z tłem', ownedOf(S.catalog.texts, 'text'),
          h('div', { class: 'shop-grid' }, ...S.catalog.texts.filter((c) => c.tier !== 'default').map((c) => swatchCard(c, 'text')))),
        acc('czcionki', 'font', 'Czcionki', 'Inny krój liter w całej aplikacji', ownedOf(S.catalog.fonts, 'font'),
          h('div', { class: 'shop-grid' }, ...S.catalog.fonts.filter((c) => c.tier !== 'default').map(fontCard))),
        h('p', { class: 'acc-group' }, 'Taniej razem i na testy'),
        acc('pakiety', 'gift', 'Pakiety', 'Kilka rzeczy taniej – płacisz tylko za to, czego nie masz', `${packsN} ${plural(packsN, ['pakiet', 'pakiety', 'pakietów'])}`,
          h('div', { class: 'shop-grid shop-grid--wide' }, ...(S.catalog.packs || []).map(packCard), ...S.catalog.bundles.map((b) => h('div', { class: 'shop-item shop-item--bundle' },
            h('span', { class: 'bundle-off' }, `−${b.full ? Math.round((b.saving / b.full) * 100) : b.off}%`),
            h('div', { class: 'shop-item__body' }, h('b', {}, b.name), h('small', {}, b.desc), b.missing.length && b.missing.length < b.items.length ? h('small', {}, `Płacisz tylko za to, czego jeszcze nie masz (${b.missing.length} z ${b.items.length}).`) : null,
              savingNote(b.missing.length, b.full, b.saving)),
            b.missing.length ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !S.canSpend || S.balance < b.price, onClick: () => buy(`bundle:${b.id}`, { label: b.name, price: b.price }) }, b.saving > 0 ? h('span', { class: 'price price--promo' }, h('s', {}, String(b.full)), ` ${b.price} pkt`) : `${b.price} pkt`)
              : h('span', { class: 'owned' }, icon('check'), 'Masz wszystko'))))),
        acc('kolo', 'lifebuoy', 'Koło ratunkowe', 'Pomoc w trudnym pytaniu testu', `masz ${S.lifelines}`,
          h('p', { class: 'muted' }, 'W tabeli wypełni 75% komórek, w pytaniu A–D zostawi 2 odpowiedzi (50/50), w osi czasu ustawi 75% elementów… W sprawdzianie możesz go użyć tylko raz.'),
          h('div', { class: 'shop-grid' }, ...L.packs.map((p) => h('div', { class: ['shop-item shop-item--pack', p.promoOff && 'is-promo'] },
            h('span', { class: 'pack-n' }, `×${p.qty}`),
            h('div', { class: 'shop-item__body' }, h('b', {}, `${p.qty} ${plural(p.qty, ['koło ratunkowe', 'koła ratunkowe', 'kół ratunkowych'])}`), lifelineNote(p)),
            h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !S.canSpend || S.balance < p.price || S.lifelines + p.qty > L.max, onClick: () => buy('lifeline', { label: `${p.qty} × koło ratunkowe`, price: p.price, qty: p.qty }) },
              p.qty === 1 && p.promoOff ? h('span', { class: 'price price--promo' }, h('s', {}, String(p.singleBase)), ` ${p.price} pkt`) : `${p.price} pkt`))))),
        acc('pochwala', 'medal', 'Pochwała od wychowawcy', 'Największa nagroda w EDUKRO', pendingPraise ? 'czeka na decyzję' : `${S.catalog.praise.price} pkt`,
          h('div', { class: 'praise-card' },
            h('div', {}, h('p', {}, 'Po zakupie prośba trafi do: ', h('b', {}, S.praise.to), '. Wychowawca zdecyduje o pochwale – jeśli jej nie przyzna, punkty wrócą do Ciebie.'),
              S.praise.requests.length ? h('ul', { class: 'praise-list' }, ...S.praise.requests.map((r) => h('li', {}, h('span', { class: `badge badge--${PRAISE_STATUS[r.status][1]}` }, PRAISE_STATUS[r.status][0]), ` ${formatDate(r.createdAt)}`, r.note ? h('small', {}, `„${r.note}”`) : null))) : null),
            pendingPraise ? h('p', { class: 'muted' }, 'Twoja prośba czeka na decyzję.') : h('button', { class: 'btn btn--primary', type: 'button', disabled: !S.canSpend || S.balance < S.catalog.praise.price, onClick: () => buy('praise', { label: 'pochwała od wychowawcy', price: S.catalog.praise.price, message: () => msg.value, extra: h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Wiadomość do wychowawcy (opcjonalnie)'), msg) }) }, icon('medal'),
              S.catalog.praise.off ? h('span', { class: 'price price--promo' }, h('s', {}, String(S.catalog.praise.base)), ` ${S.catalog.praise.price} pkt`) : `${S.catalog.praise.price} pkt`)))),
      h('div', { class: 'shop-foot' }, exitButton(), h('a', { class: 'btn btn--primary', href: '/uczen/profil', 'data-link': '' }, icon('user'), 'Ustaw kupione w „Mój profil”')));
    if (location.hash.length > 1) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
  }
  render();
  return root;
}

export const swatchDeep = (id) => cardShade(id);
