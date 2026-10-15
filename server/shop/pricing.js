// Ceny w sklepie: ceny domyślne z katalogu, zmienione przez administratora, promocje czasowe
// (dla wszystkich albo osobiste – np. nagroda za test) i automatyczna promocja tygodnia.
import { one, all, run, now } from '../db.js';
import {
  COLORS, TEXTS, FONTS, LIFELINE, PRAISE, BUNDLES, PROFILE_KINDS, itemOf, isDefault, isExclusive, weeklyPromo, profileList,
} from '../../public/js/shared/shop.js';

export const COSMETIC_KEYS = [...COLORS.map((c) => `color:${c.id}`), ...TEXTS.map((c) => `text:${c.id}`), ...FONTS.map((c) => `font:${c.id}`)].filter((k) => !isDefault(k));
export const PROFILE_KEYS = PROFILE_KINDS.flatMap((k) => profileList(k).map((x) => `${k}:${x.id}`)).filter((k) => !isDefault(k) && !isExclusive(k));
export const PRICE_KEYS = [...COSMETIC_KEYS, ...PROFILE_KEYS, 'lifeline', 'praise'];
/** Na co może być promocja: konkretny przedmiot albo cały sklep („all” – bez pochwały i pakietów). */
export const PROMO_KEYS = ['all', ...PRICE_KEYS];
export const MAX_PRICE = 100000;

export function itemName(key) {
  if (key === 'all') return 'cały sklep';
  if (key === 'lifeline') return LIFELINE.name;
  if (key === 'praise') return PRAISE.name;
  const b = BUNDLES.find((x) => `bundle:${x.id}` === key);
  if (b) return b.name;
  const pk = /^pack:(\d+)$/.exec(String(key));
  if (pk) { const row = one('SELECT name FROM shop_bundles WHERE id = ?', Number(pk[1])); return row ? `pakiet „${row.name}”` : 'pakiet'; }
  const it = itemOf(key);
  if (!it) return key;
  const kind = { color: 'kolor', text: 'kolor tekstu', font: 'czcionka', avatar: 'profilowe', frame: 'ramka', title: 'tytuł', music: 'muzyka', cele: 'efekt' }[it.kind];
  return `${kind} „${it.name}”`;
}

export function defaultPrice(key) {
  if (key === 'lifeline') return LIFELINE.packs[0].price;
  if (key === 'praise') return PRAISE.price;
  return itemOf(key)?.price ?? null;
}
let cache = null;
function overrides() {
  if (!cache) cache = Object.fromEntries(all('SELECT item, price FROM shop_prices').map((r) => [r.item, r.price]));
  return cache;
}
export function basePrice(key) {
  const o = overrides()[key];
  return Number.isInteger(o) ? o : defaultPrice(key);
}
export function setPrice(key, price, by) {
  if (price === null || price === defaultPrice(key)) run('DELETE FROM shop_prices WHERE item = ?', key);
  else run('INSERT INTO shop_prices (item, price, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(item) DO UPDATE SET price = excluded.price, updated_by = excluded.updated_by, updated_at = excluded.updated_at', key, price, by, now());
  cache = null;
}

export const weeklyEnabled = () => one("SELECT value FROM meta WHERE key = 'shop_weekly_promo'")?.value !== '0';
export function setWeekly(on) { run("INSERT INTO meta (key, value) VALUES ('shop_weekly_promo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", on ? '1' : '0'); }

/** Promocje trwające teraz: wspólne + osobiste danego ucznia. */
export function activePromos(userId = null, t = now()) {
  const rows = all(`SELECT * FROM shop_promos WHERE starts_at <= ? AND ends_at > ? AND ended_at IS NULL AND (user_id IS NULL OR user_id = ?) ORDER BY ends_at`, t, t, userId ?? -1);
  const out = rows.map((p) => ({ id: p.id, item: p.item, off: p.off, until: p.ends_at, startsAt: p.starts_at, personal: !!p.user_id, note: p.note, name: itemName(p.item) }));
  if (weeklyEnabled()) { const w = weeklyPromo(t); out.push({ id: 'weekly', item: w.item, off: w.off, until: w.until, personal: false, weekly: true, note: 'Promocja tygodnia', name: itemName(w.item) }); }
  return out;
}

/** Najlepsza promocja dla przedmiotu (promocje się nie sumują – wygrywa największa zniżka). */
export function promoFor(key, promos) {
  let best = null;
  for (const p of promos) {
    const hit = p.item === key || (p.item === 'all' && key !== 'praise');
    if (hit && (!best || p.off > best.off)) best = p;
  }
  return best;
}
const apply = (price, off) => Math.max(0, Math.round(price * (100 - off) / 100));

export function priceInfo(key, promos) {
  const base = basePrice(key);
  if (base === null) return null;
  const p = promoFor(key, promos);
  return { base, price: p ? apply(base, p.off) : base, off: p?.off || 0, until: p?.until || null, personal: !!p?.personal, weekly: !!p?.weekly };
}

/**
 * Pakiety kół ratunkowych: zniżka za ilość + ewentualna promocja.
 * „separate” = ile kosztowałyby te koła kupowane pojedynczo PO AKTUALNEJ cenie (z promocją),
 * więc opis „taniej o…” zawsze zgadza się z tym, co uczeń widzi przy pojedynczym kole.
 */
export function lifelinePacks(promos) {
  const one1 = priceInfo('lifeline', promos);
  return LIFELINE.packs.map((p) => {
    const list = apply(one1.base * p.qty, p.off || 0);
    const price = one1.off ? apply(list, one1.off) : list;
    const separate = one1.price * p.qty;
    return { qty: p.qty, off: p.off || 0, full: one1.base * p.qty, single: one1.price, singleBase: one1.base, separate, price, saving: Math.max(0, separate - price), promoOff: one1.off };
  });
}
/** Aktualna cena (z promocją) – do porównań „osobno kosztowałoby…”. */
const nowPrice = (k, promos) => priceInfo(k, promos)?.price ?? basePrice(k) ?? 0;
/**
 * Cena pakietu liczona tylko za przedmioty, których uczeń jeszcze nie ma.
 * „full” = ile te przedmioty kosztują teraz osobno (z promocjami) – pakiet nigdy nie jest droższy.
 */
export function bundleInfo(b, owned = new Set(), promos = []) {
  const missing = b.items.filter((k) => !owned.has(k));
  const full = missing.reduce((s, k) => s + nowPrice(k, promos), 0);
  const price = Math.min(full, apply(missing.reduce((s, k) => s + basePrice(k), 0), b.off));
  return { missing, full, price, saving: Math.max(0, full - price) };
}
export { nowPrice };

export function allPrices(userId) {
  const promos = activePromos(userId);
  const map = {};
  for (const k of PRICE_KEYS) map[k] = priceInfo(k, promos);
  return { promos, map };
}
