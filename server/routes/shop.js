// Sklep EDUKRO: zakupy za punkty, wygląd aplikacji ucznia, pochwały od wychowawcy,
// a dla administratora: zmiana cen i promocje czasowe.
import { one, all, run, now, tx, audit } from '../db.js';
import { HttpError, str, id } from '../http.js';
import { requireRole, requireStudent, requireApprovedStudent } from '../auth.js';
import { pointsBalance, addPoints } from '../points.js';
import { notify, notifyAdmins, notifyStudents, hoursLabel, gfor } from '../notify.js';
import { itemQty, grantItem } from '../shop/store.js';
import {
  COLORS, TEXTS, FONTS, LIFELINE, PRAISE, BUNDLES, DEFAULT_THEME, PARTS, itemOf, isDefault, isExclusive, themeProblems,
  AVATARS, FRAMES, TITLES, MUSIC, CELEBRATIONS, PROFILE_PARTS, DEFAULT_PROFILE,
} from '../../public/js/shared/shop.js';
import {
  allPrices, priceInfo, lifelinePacks, bundleInfo, activePromos, nowPrice, basePrice, defaultPrice, setPrice, weeklyEnabled, setWeekly,
  PRICE_KEYS, PROMO_KEYS, MAX_PRICE, itemName, COSMETIC_KEYS, PROFILE_KEYS,
} from '../shop/pricing.js';
import { parseClass, className } from '../../public/js/shared/classes.js';
import { ownedSet, profileOf, saveProfile, card } from '../profile.js';

const COSMETIC = /^(color|text|font|avatar|frame|title|music|cele):[a-z-]+$/;
const PACKABLE = new Set([...COSMETIC_KEYS, ...PROFILE_KEYS]);
const admin = requireRole('admin');

/* ---------- Pakiety administratora: cena za całość, uczeń płaci tylko za to, czego nie ma ---------- */
function packRow(p) {
  let items = [];
  try { items = JSON.parse(p.items_json || '[]').filter((k) => PACKABLE.has(k)); } catch { items = []; }
  return { id: p.id, key: `pack:${p.id}`, name: p.name, description: p.description, items, price: p.price, active: !!p.active, createdAt: p.created_at };
}
export function packInfo(p, owned = new Set(), promos = []) {
  const full = p.items.reduce((s, k) => s + (basePrice(k) || 0), 0);
  const missing = p.items.filter((k) => !owned.has(k) && !isDefault(k));
  const missingValue = missing.reduce((s, k) => s + (basePrice(k) || 0), 0);
  // ile brakujące przedmioty kosztują TERAZ osobno (z promocjami) – opis i przekreślona cena zawsze aktualne
  const separate = missing.reduce((s, k) => s + nowPrice(k, promos), 0);
  let price = !missing.length ? 0 : full ? Math.max(1, Math.round((p.price * missingValue) / full)) : p.price;
  if (missing.length) price = Math.min(price, separate); // pakiet nigdy nie droższy niż kupowanie osobno
  return { missing, full, worth: full, separate, price, saving: Math.max(0, separate - price) };
}
function cleanPack(body) {
  const name = str(body.name, { min: 2, max: 60, field: 'Nazwa pakietu' });
  const description = str(body.description, { max: 200, field: 'Opis' });
  const items = [...new Set((Array.isArray(body.items) ? body.items : []).map(String))];
  if (items.some((k) => !PACKABLE.has(k))) throw new HttpError(400, 'Pakiet może zawierać tylko przedmioty do kupienia raz (kolory, czcionki, profilowe, ramki, tytuły, muzykę, efekty).');
  if (items.length < 2 || items.length > 40) throw new HttpError(400, 'Pakiet: od 2 do 40 przedmiotów.');
  const price = Number(body.price);
  if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) throw new HttpError(400, `Cena pakietu: liczba od 1 do ${MAX_PRICE}.`);
  return { name, description, items, price };
}
export function themeOf(u) {
  try { return { ...DEFAULT_THEME, ...(u.theme_json ? JSON.parse(u.theme_json) : {}) }; } catch { return { ...DEFAULT_THEME }; }
}
function studentClass(userId) {
  const r = one('SELECT r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id = ?', userId);
  const c = parseClass(r?.class_label);
  return c ? `${c.grade}${c.section}` : null;
}
function homeroomTeacher(cls) {
  if (!cls) return null;
  return all("SELECT id, first_name, last_name, homeroom_class FROM users WHERE role = 'teacher' AND status = 'active' AND homeroom_class IS NOT NULL")
    .find((t) => { const c = parseClass(t.homeroom_class); return c && `${c.grade}${c.section}` === cls; }) || null;
}

function spend(userId, price, reason) {
  if (pointsBalance(userId) < price) throw new HttpError(409, 'Masz za mało punktów na ten zakup.', { notEnough: true });
  addPoints(userId, -price, reason, { source: 'shop' });
}

export function register(r) {
  r.get('/api/shop', (ctx) => {
    const u = ctx.user;
    const owned = ownedSet(u.id);
    const packs = all('SELECT * FROM shop_bundles WHERE active = 1 ORDER BY id').map(packRow).filter((p) => p.items.length);
    const prof = (list, kind) => list.map((c) => ({ ...c, price: isDefault(`${kind}:${c.id}`) || isExclusive(`${kind}:${c.id}`) ? (isDefault(`${kind}:${c.id}`) ? 0 : null) : map[`${kind}:${c.id}`].base }));
    const cls = studentClass(u.id);
    const hr = homeroomTeacher(cls);
    const { promos, map } = allPrices(u.id);
    const withPrice = (list, kind) => list.map((c) => ({ ...c, price: isDefault(`${kind}:${c.id}`) ? 0 : map[`${kind}:${c.id}`].base }));
    const weekly = promos.find((p) => p.weekly);
    return {
      catalog: { colors: withPrice(COLORS, 'color'), texts: withPrice(TEXTS, 'text'), fonts: withPrice(FONTS, 'font'), parts: PARTS,
        lifeline: { ...LIFELINE, packs: lifelinePacks(promos), base: map.lifeline.base },
        praise: { ...PRAISE, price: map.praise.price, base: map.praise.base, off: map.praise.off },
        bundles: BUNDLES.map((b) => ({ ...b, ...bundleInfo(b, owned, promos) })),
        avatars: prof(AVATARS, 'avatar'), frames: prof(FRAMES, 'frame'), titles: prof(TITLES, 'title'), music: prof(MUSIC, 'music'), cele: prof(CELEBRATIONS, 'cele'),
        profileParts: PROFILE_PARTS,
        packs: packs.map((p) => ({ ...p, ...packInfo(p, owned, promos), names: p.items.map((k) => ({ key: k, name: itemName(k) })) })) },
      profile: profileOf(u),
      me: card(one('SELECT u.*, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id = ?', u.id)),
      promo: weekly ? { item: weekly.item, off: weekly.off, until: weekly.until } : { item: null, off: 0, until: null },
      promos: promos.map((p) => ({ item: p.item, name: p.name, off: p.off, until: p.until, personal: p.personal, weekly: !!p.weekly, note: p.note })),
      prices: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.price])),
      priceInfo: map,
      owned: [...owned],
      lifelines: itemQty(u.id, 'lifeline'),
      balance: pointsBalance(u.id),
      canSpend: u.status === 'active',
      theme: themeOf(u),
      praise: {
        to: hr ? `${hr.first_name} ${hr.last_name} (wychowawca, ${className(...Object.values(parseClass(cls)))})` : 'administrator EDUKRO',
        requests: all('SELECT id, status, price, message, note, created_at AS createdAt, decided_at AS decidedAt FROM praise_requests WHERE student_id = ? ORDER BY id DESC LIMIT 10', u.id),
      },
    };
  }, requireStudent);

  r.post('/api/shop/buy', (ctx) => {
    const u = ctx.user;
    const key = String(ctx.body.item || '');
    return tx(() => {
      const promos = activePromos(u.id);
      if (COSMETIC.test(key)) {
        const it = itemOf(key);
        if (!it) throw new HttpError(404, 'Nie ma takiego przedmiotu.');
        if (isExclusive(key)) throw new HttpError(403, 'Ten tytuł można zdobyć tylko w rankingu ogólnym – ponad 3 dni na 1. miejscu.');
        if (isDefault(key) || ownedSet(u.id).has(key)) throw new HttpError(409, 'Już to masz.');
        const { price } = priceInfo(key, promos);
        spend(u.id, price, `Sklep: ${it.name}`);
        grantItem(u.id, key, 1, { max: 1 });
        run('INSERT INTO purchases (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)', u.id, key, 1, price, now());
        return { ok: true, balance: pointsBalance(u.id), owned: [...ownedSet(u.id)] };
      }
      if (key.startsWith('bundle:')) {
        const b = BUNDLES.find((x) => `bundle:${x.id}` === key);
        if (!b) throw new HttpError(404, 'Nie ma takiego pakietu.');
        const bp = bundleInfo(b, ownedSet(u.id), promos);
        if (!bp.missing.length) throw new HttpError(409, 'Masz już wszystko z tego pakietu.');
        spend(u.id, bp.price, `Sklep: ${b.name}`);
        for (const k of bp.missing) grantItem(u.id, k, 1, { max: 1 });
        run('INSERT INTO purchases (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)', u.id, key, bp.missing.length, bp.price, now());
        return { ok: true, balance: pointsBalance(u.id), owned: [...ownedSet(u.id)] };
      }
      if (/^pack:\d+$/.test(key)) {
        const row = one('SELECT * FROM shop_bundles WHERE id = ? AND active = 1', Number(key.slice(5)));
        if (!row) throw new HttpError(404, 'Nie ma takiego pakietu.');
        const p = packRow(row);
        const info = packInfo(p, ownedSet(u.id), promos);
        if (!info.missing.length) throw new HttpError(409, 'Masz już wszystko z tego pakietu.');
        spend(u.id, info.price, `Sklep: pakiet „${p.name}”`);
        for (const k of info.missing) grantItem(u.id, k, 1, { max: 1 });
        run('INSERT INTO purchases (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)', u.id, key, info.missing.length, info.price, now());
        return { ok: true, balance: pointsBalance(u.id), owned: [...ownedSet(u.id)], got: info.missing };
      }
      if (key === 'lifeline') {
        const pack = lifelinePacks(promos).find((p) => p.qty === Number(ctx.body.qty));
        if (!pack) throw new HttpError(400, 'Wybierz liczbę kół ratunkowych.');
        if (itemQty(u.id, 'lifeline') + pack.qty > LIFELINE.max) throw new HttpError(409, `Możesz mieć najwyżej ${LIFELINE.max} kół ratunkowych naraz.`);
        spend(u.id, pack.price, `Sklep: ${LIFELINE.name} ×${pack.qty}`);
        grantItem(u.id, 'lifeline', pack.qty);
        run('INSERT INTO purchases (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)', u.id, 'lifeline', pack.qty, pack.price, now());
        return { ok: true, balance: pointsBalance(u.id), lifelines: itemQty(u.id, 'lifeline') };
      }
      if (key === 'praise') {
        if (one("SELECT 1 FROM praise_requests WHERE student_id = ? AND status = 'pending'", u.id)) {
          throw new HttpError(409, 'Masz już prośbę o pochwałę, która czeka na decyzję wychowawcy.');
        }
        const message = str(ctx.body.message, { max: 300, field: 'Wiadomość' });
        const { price } = priceInfo('praise', promos);
        spend(u.id, price, `Sklep: ${PRAISE.name}`);
        const pid = run('INSERT INTO praise_requests (student_id, class_label, price, message, created_at) VALUES (?,?,?,?,?)', u.id, studentClass(u.id), price, message, now()).lastInsertRowid;
        run('INSERT INTO purchases (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)', u.id, 'praise', 1, price, now());
        const hr = homeroomTeacher(studentClass(u.id));
        const note = { kind: 'praise_request', title: `Prośba o pochwałę: ${u.first_name} ${u.last_name}`, body: message ? `„${message}”` : 'Uczeń kupił pochwałę w sklepie EDUKRO – zdecyduj, czy ją przyznać.' };
        if (hr) notify(hr.id, { ...note, link: '/nauczyciel/panel/pochwaly', dedupe: `praise:${pid}:${hr.id}` });
        notifyAdmins({ ...note, link: '/administracja/pochwaly' }, `praise:${pid}`);
        return { ok: true, balance: pointsBalance(u.id) };
      }
      throw new HttpError(404, 'Nie ma takiego przedmiotu.');
    });
  }, requireApprovedStudent);

  /* ---------- Administrator: ceny i promocje ---------- */
  const promoRow = (p) => ({
    id: p.id, item: p.item, name: itemName(p.item), off: p.off, startsAt: p.starts_at, endsAt: p.ends_at, endedAt: p.ended_at, note: p.note, createdAt: p.created_at,
    state: p.ended_at || p.ends_at <= now() ? 'past' : p.starts_at > now() ? 'planned' : 'active',
  });
  r.get('/api/admin/shop', () => ({
    items: PRICE_KEYS.map((k) => {
      const it = itemOf(k);
      return { key: k, name: itemName(k), kind: it ? it.kind : k, hex: it?.hex || null, emoji: it?.emoji || null, tier: it?.tier || null, fx: it?.fx || null, price: basePrice(k), defaultPrice: defaultPrice(k) };
    }),
    promos: all('SELECT * FROM shop_promos WHERE user_id IS NULL ORDER BY CASE WHEN ended_at IS NULL AND ends_at > ? THEN 0 ELSE 1 END, ends_at DESC LIMIT 60', now()).map(promoRow),
    personalActive: one('SELECT COUNT(*) n FROM shop_promos WHERE user_id IS NOT NULL AND ended_at IS NULL AND ends_at > ?', now()).n,
    weekly: { enabled: weeklyEnabled(), current: activePromos(null).find((p) => p.weekly) || null },
    promoKeys: PROMO_KEYS.map((k) => ({ key: k, name: itemName(k) })),
    maxPrice: MAX_PRICE,
  }), admin);

  r.put('/api/admin/shop/prices', (ctx) => {
    const changes = ctx.body.prices && typeof ctx.body.prices === 'object' ? ctx.body.prices : {};
    const keys = Object.keys(changes);
    if (!keys.length) throw new HttpError(400, 'Brak zmian.');
    for (const k of keys) {
      if (!PRICE_KEYS.includes(k)) throw new HttpError(400, 'Nieznany przedmiot.');
      const v = changes[k];
      if (v !== null && (!Number.isInteger(v) || v < 0 || v > MAX_PRICE)) throw new HttpError(400, `Cena: liczba całkowita od 0 do ${MAX_PRICE}.`);
    }
    tx(() => { for (const k of keys) setPrice(k, changes[k], ctx.user.id); });
    audit(ctx.user.id, 'shop.prices', keys.join(',').slice(0, 200));
    return { ok: true };
  }, admin);

  r.post('/api/admin/shop/promos', (ctx) => {
    const item = String(ctx.body.item || '');
    if (!PROMO_KEYS.includes(item)) throw new HttpError(400, 'Wybierz przedmiot z listy.');
    const off = Number(ctx.body.off);
    if (!Number.isInteger(off) || off < 5 || off > 90) throw new HttpError(400, 'Zniżka: od 5 do 90%.');
    const t = now();
    const startsAt = ctx.body.startsAt ? Math.max(t, Math.round(Number(ctx.body.startsAt))) : t;
    let endsAt = Math.round(Number(ctx.body.endsAt));
    if (ctx.body.hours !== undefined) endsAt = startsAt + Math.round(Number(ctx.body.hours) * 3600e3);
    if (!Number.isFinite(endsAt) || endsAt <= startsAt + 5 * 60e3) throw new HttpError(400, 'Promocja musi trwać co najmniej 5 minut.');
    if (endsAt - startsAt > 92 * 24 * 3600e3) throw new HttpError(400, 'Promocja może trwać najwyżej 3 miesiące.');
    const note = str(ctx.body.note, { max: 120, field: 'Opis' });
    const pid = run('INSERT INTO shop_promos (item, off, starts_at, ends_at, note, created_by, created_at) VALUES (?,?,?,?,?,?,?)', item, off, startsAt, endsAt, note, ctx.user.id, t).lastInsertRowid;
    const hours = Math.round((endsAt - startsAt) / 3600e3);
    if (ctx.body.notify !== false && startsAt <= t) {
      notifyStudents(null, { kind: 'promo', title: `Promocja w sklepie: ${itemName(item)} −${off}%`, body: `${note ? `${note} · ` : ''}Trwa ${hours >= 1 ? hoursLabel(hours) : 'krótko'} – do ${new Date(endsAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`, link: '/uczen/sklep' }, `promo:${pid}`);
    }
    audit(ctx.user.id, 'shop.promo', `promo:${pid}`);
    return { promo: promoRow(one('SELECT * FROM shop_promos WHERE id = ?', pid)) };
  }, admin);

  r.post('/api/admin/shop/promos/:id/end', (ctx) => {
    const p = one('SELECT * FROM shop_promos WHERE id = ? AND user_id IS NULL', id(ctx.params.id));
    if (!p) throw new HttpError(404, 'Nie znaleziono promocji.');
    run('UPDATE shop_promos SET ended_at = ? WHERE id = ?', now(), p.id);
    audit(ctx.user.id, 'shop.promo.end', `promo:${p.id}`);
    return { ok: true };
  }, admin);

  r.put('/api/admin/shop/settings', (ctx) => {
    if (typeof ctx.body.weekly !== 'boolean') throw new HttpError(400, 'Nieprawidłowe ustawienie.');
    setWeekly(ctx.body.weekly);
    return { ok: true, weekly: ctx.body.weekly };
  }, admin);

  /* Wygląd: tylko posiadane (albo domyślne) przedmioty i tylko czytelne zestawienia kolorów. */
  r.put('/api/me/profile', (ctx) => {
    const profile = saveProfile(ctx.user, ctx.body.profile || ctx.body);
    return { ok: true, profile, card: card(one('SELECT u.*, r.class_label FROM users u LEFT JOIN registry r ON r.id = u.registry_id WHERE u.id = ?', ctx.user.id)) };
  }, requireStudent);

  /* ---------- Administrator: pakiety (np. „Pakiet muzyczny”) ---------- */
  r.get('/api/admin/shop/packs', () => ({
    packs: all('SELECT * FROM shop_bundles ORDER BY active DESC, id DESC').map(packRow).map((p) => ({ ...p, ...packInfo(p), names: p.items.map((k) => ({ key: k, name: itemName(k) })) })),
    items: [...PACKABLE].map((k) => { const it = itemOf(k); return { key: k, kind: it.kind, name: itemName(k), short: it.name, price: basePrice(k), tier: it.tier, hex: it.hex || null, emoji: it.emoji || null }; }),
  }), admin);
  r.post('/api/admin/shop/packs', (ctx) => {
    const p = cleanPack(ctx.body);
    const pid = run('INSERT INTO shop_bundles (name, description, items_json, price, active, created_by, created_at) VALUES (?,?,?,?,1,?,?)', p.name, p.description, JSON.stringify(p.items), p.price, ctx.user.id, now()).lastInsertRowid;
    audit(ctx.user.id, 'shop.pack.create', `pack:${pid}`);
    if (ctx.body.notify) notifyStudents(null, { kind: 'promo', title: `Nowy pakiet w sklepie: ${p.name}`, body: p.description || `${p.items.length} przedmiotów taniej razem.`, link: '/uczen/sklep' }, `pack:${pid}`);
    return { pack: packRow(one('SELECT * FROM shop_bundles WHERE id = ?', pid)) };
  }, admin);
  r.put('/api/admin/shop/packs/:id', (ctx) => {
    const row = one('SELECT * FROM shop_bundles WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono pakietu.');
    if (typeof ctx.body.active === 'boolean' && ctx.body.name === undefined) {
      run('UPDATE shop_bundles SET active = ? WHERE id = ?', ctx.body.active ? 1 : 0, row.id);
    } else {
      const p = cleanPack(ctx.body);
      run('UPDATE shop_bundles SET name = ?, description = ?, items_json = ?, price = ?, active = ? WHERE id = ?', p.name, p.description, JSON.stringify(p.items), p.price, ctx.body.active === false ? 0 : 1, row.id);
    }
    audit(ctx.user.id, 'shop.pack.edit', `pack:${row.id}`);
    return { pack: packRow(one('SELECT * FROM shop_bundles WHERE id = ?', row.id)) };
  }, admin);
  r.delete('/api/admin/shop/packs/:id', (ctx) => {
    const row = one('SELECT * FROM shop_bundles WHERE id = ?', id(ctx.params.id));
    if (!row) throw new HttpError(404, 'Nie znaleziono pakietu.');
    run('DELETE FROM shop_bundles WHERE id = ?', row.id);
    audit(ctx.user.id, 'shop.pack.delete', `pack:${row.id}`);
    return { ok: true };
  }, admin);

  r.put('/api/me/theme', (ctx) => {
    const u = ctx.user;
    const owned = ownedSet(u.id);
    const theme = {};
    for (const p of PARTS) {
      const v = String(ctx.body.theme?.[p.key] ?? DEFAULT_THEME[p.key]);
      const key = `${p.kind}:${v}`;
      if (!itemOf(key)) throw new HttpError(400, 'Nieprawidłowy wybór.');
      if (!isDefault(key) && !owned.has(key)) throw new HttpError(403, `Najpierw kup „${itemOf(key).name}” w sklepie.`);
      theme[p.key] = v;
    }
    const probs = themeProblems(theme);
    if (probs.length) throw new HttpError(400, probs[0].msg, { problems: probs });
    run('UPDATE users SET theme_json = ?, updated_at = ? WHERE id = ?', JSON.stringify(theme), now(), u.id);
    return { ok: true, theme };
  }, requireStudent);

  /* ---------- Pochwały: wychowawca klasy (lub administrator) ---------- */
  const praiseScope = (user) => {
    const rows = all(`SELECT p.*, u.first_name, u.last_name FROM praise_requests p JOIN users u ON u.id = p.student_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 200`);
    if (user.role === 'admin') return rows;
    const mine = parseClass(user.homeroom_class);
    if (!mine) return [];
    return rows.filter((p) => { const c = parseClass(p.class_label); return c && c.grade === mine.grade && c.section === mine.section; });
  };
  const praiseRow = (p) => ({
    id: p.id, firstName: p.first_name, lastName: p.last_name, className: p.class_label ? className(...Object.values(parseClass(p.class_label) || {})) : null,
    status: p.status, message: p.message, note: p.note, createdAt: p.created_at, decidedAt: p.decided_at, price: p.price,
  });
  r.get('/api/praise', (ctx) => ({ requests: praiseScope(ctx.user).map(praiseRow), homeroom: ctx.user.homeroom_class || null }), requireRole('teacher', 'admin'));
  r.post('/api/praise/:id/decide', (ctx) => {
    const p = praiseScope(ctx.user).find((x) => x.id === id(ctx.params.id));
    if (!p) throw new HttpError(404, 'Nie znaleziono prośby o pochwałę.');
    if (p.status !== 'pending') throw new HttpError(409, 'Ta prośba została już rozpatrzona.');
    const status = ctx.body.status === 'granted' ? 'granted' : ctx.body.status === 'rejected' ? 'rejected' : null;
    if (!status) throw new HttpError(400, 'Nieprawidłowa decyzja.');
    const note = str(ctx.body.note, { max: 300, field: 'Notatka' });
    tx(() => {
      run('UPDATE praise_requests SET status = ?, note = ?, decided_by = ?, decided_at = ? WHERE id = ?', status, note, ctx.user.id, now(), p.id);
      if (status === 'rejected') addPoints(p.student_id, p.price, 'Zwrot punktów: prośba o pochwałę nie została przyjęta', { source: 'refund' });
      notify(p.student_id, status === 'granted'
        ? { kind: 'praise', title: 'Masz pochwałę od wychowawcy!', body: note ? `„${note}”` : `Gratulacje – ${gfor(one('SELECT first_name, gender FROM users WHERE id = ?', p.student_id), 'zasłużyłeś', 'zasłużyłaś')} na nią swoją pracą w EDUKRO.`, link: '/uczen/sklep', dedupe: `praise-decided:${p.id}` }
        : { kind: 'praise', title: 'Pochwała tym razem nie została przyznana', body: `${note ? `„${note}” ` : ''}Punkty (${p.price}) wróciły na Twoje konto.`, link: '/uczen/sklep', dedupe: `praise-decided:${p.id}` });
    });
    audit(ctx.user.id, `praise.${status}`, `praise:${p.id}`);
    return { ok: true };
  }, requireRole('teacher', 'admin'));
}
