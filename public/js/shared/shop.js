// Sklep EDUKRO: katalog, ceny, promocje i wygląd aplikacji ucznia.
// Wspólny dla serwera (ceny, własność, kontrola czytelności) i przeglądarki (podgląd, motyw).

/* ---------- Kolory: tło, akcent, karty pytań ---------- */
export const COLORS = [
  { id: 'ink', name: 'Atrament', hex: '#4A5C93', price: 0, tier: 'default', note: 'Domyślne tło EDUKRO' },
  { id: 'amber', name: 'Bursztyn', hex: '#F2A541', price: 0, tier: 'default', note: 'Domyślny akcent EDUKRO' },
  { id: 'emerald', name: 'Szmaragd', hex: '#34D399', price: 150, tier: 'basic' },
  { id: 'ruby', name: 'Rubin', hex: '#F0566E', price: 150, tier: 'basic' },
  { id: 'sapphire', name: 'Szafir', hex: '#5B8CFF', price: 150, tier: 'basic' },
  { id: 'amethyst', name: 'Ametyst', hex: '#B388FF', price: 150, tier: 'basic' },
  { id: 'teal', name: 'Turkus', hex: '#2CCFCF', price: 150, tier: 'basic' },
  { id: 'coral', name: 'Koral', hex: '#FF8A65', price: 150, tier: 'basic' },
  { id: 'lime', name: 'Limonka', hex: '#B8E659', price: 150, tier: 'basic' },
  { id: 'rose', name: 'Róż', hex: '#FF8FB8', price: 150, tier: 'basic' },
  { id: 'copper', name: 'Miedź', hex: '#E0915F', price: 150, tier: 'basic' },
  { id: 'silver', name: 'Srebrny', hex: '#C9D1DC', price: 500, tier: 'premium', fx: 'silver', note: 'Metaliczny połysk' },
  { id: 'gold', name: 'Złoty', hex: '#F3C752', price: 700, tier: 'premium', fx: 'gold', note: 'Metaliczny połysk' },
  { id: 'rainbow', name: 'Tęczowy', hex: '#B07CF2', price: 1200, tier: 'premium', fx: 'rainbow', note: 'Kolory płynnie przelewają się jak ciecz' },
];

/* ---------- Kolor tekstu ---------- */
export const TEXTS = [
  { id: 'paper', name: 'Papier', hex: '#EDE6D6', price: 0, tier: 'default', note: 'Domyślny' },
  { id: 'snow', name: 'Śnieżnobiały', hex: '#FFFFFF', price: 120, tier: 'basic' },
  { id: 'mint', name: 'Miętowy', hex: '#B9F5D8', price: 150, tier: 'basic' },
  { id: 'sky', name: 'Błękitny', hex: '#BFE3FF', price: 150, tier: 'basic' },
  { id: 'lemon', name: 'Cytrynowy', hex: '#FFF3A3', price: 150, tier: 'basic' },
  { id: 'peach', name: 'Brzoskwiniowy', hex: '#FFD2B8', price: 150, tier: 'basic' },
  { id: 'lavender', name: 'Lawendowy', hex: '#DCCBFF', price: 150, tier: 'basic' },
  { id: 'gray', name: 'Szary', hex: '#8E949E', price: 100, tier: 'basic', note: 'Dobry tylko na ciemnym tle' },
  { id: 'gold-text', name: 'Złoty tekst', hex: '#F5D27A', price: 600, tier: 'premium', fx: 'gold' },
  { id: 'neon-pink', name: 'Neon różowy', hex: '#FF5BDB', price: 400, tier: 'premium', fx: 'glow' },
  { id: 'neon-green', name: 'Neon zielony', hex: '#5CFF3A', price: 400, tier: 'premium', fx: 'glow' },
  { id: 'neon-blue', name: 'Neon błękitny', hex: '#2BE8FF', price: 400, tier: 'premium', fx: 'glow' },
  { id: 'neon-yellow', name: 'Neon żółty', hex: '#FFF23A', price: 400, tier: 'premium', fx: 'glow' },
];

/* ---------- Kroje pisma (pliki w /fonts, licencje OFL / GUST) ---------- */
export const FONTS = [
  { id: 'inter', name: 'Klasyczny EDUKRO', body: "'Inter'", head: "'Pagella'", price: 0, tier: 'default', note: 'Domyślny' },
  { id: 'schola', name: 'Elementarz', body: "'Schola'", head: "'Schola'", price: 250, tier: 'basic', note: 'Jak w szkolnych podręcznikach' },
  { id: 'poppins', name: 'Nowoczesny', body: "'Poppins'", head: "'Poppins'", price: 250, tier: 'basic' },
  { id: 'adventor', name: 'Geometryczny', body: "'Adventor'", head: "'Adventor'", price: 250, tier: 'basic' },
  { id: 'lora', name: 'Książkowy', body: "'Lora'", head: "'Lora'", price: 250, tier: 'basic' },
  { id: 'cursor', name: 'Maszyna do pisania', body: "'Cursor'", head: "'Cursor'", price: 300, tier: 'basic' },
  { id: 'chorus', name: 'Kaligraficzny', body: "'Pagella'", head: "'Chorus'", price: 500, tier: 'premium', note: 'Nagłówki pisane piórem' },
];

/* ---------- Pozostałe ---------- */
export const LIFELINE = { id: 'lifeline', name: 'Koło ratunkowe', max: 30, packs: [{ qty: 1, price: 80 }, { qty: 3, price: 192, off: 20 }, { qty: 5, price: 280, off: 30 }] };
export const PRAISE = { id: 'praise', name: 'Pochwała od wychowawcy', price: 2500 };
export const BUNDLES = [
  { id: 'bundle-basic', name: 'Pakiet kolorów', items: COLORS.filter((c) => c.tier === 'basic').map((c) => `color:${c.id}`), off: 35, desc: 'Wszystkie 9 podstawowych kolorów' },
  { id: 'bundle-neon', name: 'Pakiet neonów', items: TEXTS.filter((t) => t.fx === 'glow').map((t) => `text:${t.id}`), off: 30, desc: '4 neonowe kolory tekstu' },
];
export const PROMO_OFF = 25;

/* ---------- Profil: awatar, ramka, tytuł, muzyka, efekt świętowania ---------- */
// Awatary to emoji (działają na każdym urządzeniu); premium są animowane (anim = nazwa animacji CSS).
export const AVATARS = [
  { id: 'letter', name: 'Inicjały', emoji: '', price: 0, tier: 'default', note: 'Twoje inicjały' },
  { id: 'fox', name: 'Lis', emoji: '🦊', price: 120, tier: 'basic' },
  { id: 'cat', name: 'Kot', emoji: '🐱', price: 120, tier: 'basic' },
  { id: 'owl', name: 'Sowa', emoji: '🦉', price: 120, tier: 'basic' },
  { id: 'panda', name: 'Panda', emoji: '🐼', price: 120, tier: 'basic' },
  { id: 'penguin', name: 'Pingwin', emoji: '🐧', price: 120, tier: 'basic' },
  { id: 'turtle', name: 'Żółw', emoji: '🐢', price: 120, tier: 'basic' },
  { id: 'dog', name: 'Pies', emoji: '🐶', price: 120, tier: 'basic' },
  { id: 'octopus', name: 'Ośmiornica', emoji: '🐙', price: 150, tier: 'basic' },
  { id: 'atom', name: 'Atom', emoji: '⚛️', price: 150, tier: 'basic' },
  { id: 'flask', name: 'Kolba', emoji: '🧪', price: 150, tier: 'basic' },
  { id: 'books', name: 'Książki', emoji: '📚', price: 150, tier: 'basic' },
  { id: 'ball', name: 'Piłka', emoji: '⚽', price: 150, tier: 'basic' },
  { id: 'basket', name: 'Koszykówka', emoji: '🏀', price: 150, tier: 'basic' },
  { id: 'guitar', name: 'Gitara', emoji: '🎸', price: 150, tier: 'basic' },
  { id: 'palette', name: 'Paleta', emoji: '🎨', price: 150, tier: 'basic' },
  { id: 'cactus', name: 'Kaktus', emoji: '🌵', price: 150, tier: 'basic' },
  { id: 'rocket', name: 'Rakieta', emoji: '🚀', price: 450, tier: 'premium', anim: 'float', note: 'Animowana – unosi się' },
  { id: 'earth', name: 'Ziemia', emoji: '🌍', price: 450, tier: 'premium', anim: 'orbit', note: 'Animowana – krąży księżyc' },
  { id: 'dino', name: 'Dinozaur', emoji: '🦖', price: 500, tier: 'premium', anim: 'stomp', note: 'Animowany – tupie' },
  { id: 'unicorn', name: 'Jednorożec', emoji: '🦄', price: 500, tier: 'premium', anim: 'sparkle', note: 'Animowany – iskry' },
  { id: 'dragon', name: 'Smok', emoji: '🐉', price: 600, tier: 'premium', anim: 'breathe', note: 'Animowany – zieje ogniem' },
  { id: 'robot', name: 'Robot', emoji: '🤖', price: 500, tier: 'premium', anim: 'scan', note: 'Animowany – skanuje' },
  { id: 'bolt', name: 'Błyskawica', emoji: '⚡', price: 450, tier: 'premium', anim: 'flash', note: 'Animowana – błyska' },
  { id: 'dna', name: 'DNA', emoji: '🧬', price: 450, tier: 'premium', anim: 'sway', note: 'Animowane – kołysze się' },
  { id: 'alien', name: 'Kosmita', emoji: '👽', price: 500, tier: 'premium', anim: 'hop', note: 'Animowany – skacze' },
];
export const FRAMES = [
  { id: 'none', name: 'Bez ramki', price: 0, tier: 'default' },
  { id: 'pixel', name: 'Pikselowa', price: 150, tier: 'basic' },
  { id: 'cat-ears', name: 'Kocie uszy', price: 200, tier: 'basic' },
  { id: 'bunny', name: 'Królicze uszy', price: 200, tier: 'basic' },
  { id: 'stars', name: 'Gwiazdki', price: 200, tier: 'basic' },
  { id: 'gold-crown', name: 'Złota z koroną', price: 350, tier: 'basic', note: 'Złoty pierścień i korona' },
  { id: 'laurel', name: 'Laurowy wieniec', price: 300, tier: 'basic' },
  { id: 'headphones', name: 'Słuchawki', price: 250, tier: 'basic' },
  { id: 'neon', name: 'Neon', price: 600, tier: 'premium', note: 'Animowana – pulsujący neon' },
  { id: 'rainbow', name: 'Tęczowa', price: 700, tier: 'premium', note: 'Animowana – kolory krążą' },
  { id: 'orbit', name: 'Orbita', price: 650, tier: 'premium', note: 'Animowana – krążące elektrony' },
  { id: 'fire', name: 'Ognista', price: 700, tier: 'premium', note: 'Animowana – płomienie' },
  { id: 'vinyl', name: 'Winyl', price: 650, tier: 'premium', note: 'Animowana – profilowe w kręcącej się płycie' },
  { id: 'can', name: 'Puszka EDU FIZZ', price: 650, tier: 'premium', note: 'Animowana – profilowe w puszce napoju' },
  { id: 'scooter', name: 'Hulajnoga', price: 750, tier: 'premium', note: 'Animowana – profilowe jedzie na hulajnodze elektrycznej' },
];
// Tytuł widoczny przy imieniu w rankingach i na profilu: „Jan Kossakowski 〈Mistrz hulajnogi〉”.
export const TITLES = [
  { id: 'none', m: 'Bez tytułu', f: 'Bez tytułu', price: 0, tier: 'default' },
  { id: 'hulajnoga', m: 'Mistrz hulajnogi', f: 'Mistrzyni hulajnogi', price: 200, tier: 'basic' },
  { id: 'chemik', m: 'Szalony chemik', f: 'Szalona chemiczka', price: 200, tier: 'basic' },
  { id: 'mol', m: 'Mól książkowy', f: 'Mól książkowy', price: 200, tier: 'basic' },
  { id: 'odkrywca', m: 'Odkrywca', f: 'Odkrywczyni', price: 200, tier: 'basic' },
  { id: 'ninja', m: 'Ninja testów', f: 'Ninja testów', price: 250, tier: 'basic' },
  { id: 'kosmonauta', m: 'Kosmonauta', f: 'Kosmonautka', price: 250, tier: 'basic' },
  { id: 'marek', m: 'Nocny marek', f: 'Nocny marek', price: 200, tier: 'basic' },
  { id: 'speedrun', m: 'Speedrunner', f: 'Speedrunnerka', price: 250, tier: 'basic' },
  { id: 'szef', m: 'Szef klasy', f: 'Szefowa klasy', price: 800, tier: 'premium' },
  { id: 'legenda', m: 'Legenda EDUKRO', f: 'Legenda EDUKRO', price: 1200, tier: 'premium' },
  { id: 'krol', m: 'Król wiedzy', f: 'Królowa wiedzy', price: 1500, tier: 'premium' },
  // tylko z rankingu ogólnego (ponad 3 dni na 1. miejscu) – nie do kupienia
  { id: 'lider-aktywnosci', m: 'Niezmordowany', f: 'Niezmordowana', price: null, tier: 'exclusive', note: 'Ponad 3 dni na 1. miejscu: najaktywniejsi' },
  { id: 'lider-punktow', m: 'Król punktów', f: 'Królowa punktów', price: null, tier: 'exclusive', note: 'Ponad 3 dni na 1. miejscu: najwięcej punktów' },
  { id: 'lider-ocen', m: 'Prymus', f: 'Prymuska', price: null, tier: 'exclusive', note: 'Ponad 3 dni na 1. miejscu: najlepsze oceny ze sprawdzianów' },
  { id: 'lider-wygranych', m: 'Pogromca testów', f: 'Pogromczyni testów', price: null, tier: 'exclusive', note: 'Ponad 3 dni na 1. miejscu: najwięcej wygranych testów' },
];
export const SCHOOL_STAR_TITLE = { m: 'Gwiazda szkoły', f: 'Gwiazda szkoły' };
export const MUSIC = [
  { id: 'calm', name: 'Spokojna', price: 0, tier: 'default', note: 'Wolna · domyślna muzyka EDUKRO' },
  { id: 'lofi', name: 'Lo-fi do nauki', price: 200, tier: 'basic', note: 'Wolna' },
  { id: 'kosmos', name: 'Kosmos', price: 200, tier: 'basic', note: 'Wolna · rozmarzona' },
  { id: 'jazz', name: 'Jazzowa kawiarnia', price: 250, tier: 'basic', note: 'Średnia' },
  { id: 'arcade', name: 'Automat 8-bit', price: 250, tier: 'basic', note: 'Szybka' },
  { id: 'sprint', name: 'Sprint', price: 250, tier: 'basic', note: 'Szybka · energetyczna' },
  { id: 'disco', name: 'Disco', price: 500, tier: 'premium', note: 'Szybka · do tańca' },
  { id: 'epic', name: 'Epicka', price: 600, tier: 'premium', note: 'Średnia · jak w filmie' },
];
export const CELEBRATIONS = [
  { id: 'confetti', name: 'Konfetti', price: 0, tier: 'default' },
  { id: 'stars', name: 'Gwiazdki', price: 150, tier: 'basic' },
  { id: 'hearts', name: 'Serduszka', price: 150, tier: 'basic' },
  { id: 'emoji', name: 'Emoji', price: 200, tier: 'basic' },
  { id: 'fireworks', name: 'Fajerwerki', price: 300, tier: 'basic' },
  { id: 'gold', name: 'Złoty deszcz', price: 600, tier: 'premium', note: 'Spadające złote monety' },
];
export const PROFILE_PARTS = [
  { key: 'avatar', label: 'Profilowe', kind: 'avatar' },
  { key: 'frame', label: 'Ramka', kind: 'frame' },
  { key: 'title', label: 'Tytuł', kind: 'title' },
  { key: 'music', label: 'Muzyka w tle', kind: 'music' },
  { key: 'cele', label: 'Efekt po teście', kind: 'cele' },
];
export const DEFAULT_PROFILE = { avatar: 'letter', frame: 'none', title: 'none', music: 'calm', cele: 'confetti' };
export const PROFILE_KINDS = ['avatar', 'frame', 'title', 'music', 'cele'];

/** Tytuł w formie dla płci osoby („Mistrz hulajnogi” / „Mistrzyni hulajnogi”). */
export function titleText(id, gender = 'm') {
  if (id === 'school-star') return SCHOOL_STAR_TITLE[gender === 'f' ? 'f' : 'm'];
  const t = TITLES.find((x) => x.id === id);
  if (!t || t.id === 'none') return null;
  return gender === 'f' ? t.f : t.m;
}

export const PARTS = [
  { key: 'bg', label: 'Tło', kind: 'color' },
  { key: 'accent', label: 'Akcent (przyciski, wyróżnienia)', kind: 'color' },
  { key: 'cards', label: 'Karty pytań i slajdów', kind: 'color' },
  { key: 'text', label: 'Kolor tekstu', kind: 'text' },
  { key: 'font', label: 'Czcionka', kind: 'font' },
];
export const DEFAULT_THEME = { bg: 'ink', accent: 'amber', cards: 'ink', text: 'paper', font: 'inter' };

const map = (list) => Object.fromEntries(list.map((c) => [c.id, c]));
const BY = {
  color: map(COLORS), text: map(TEXTS), font: map(FONTS),
  avatar: map(AVATARS), frame: map(FRAMES), title: map(TITLES.map((t) => ({ ...t, name: t.m === t.f ? t.m : `${t.m} / ${t.f}` }))), music: map(MUSIC), cele: map(CELEBRATIONS),
};
export const itemOf = (key) => {
  const [kind, name] = String(key).split(':');
  return BY[kind]?.[name] ? { kind, ...BY[kind][name], key } : null;
};
export const isDefault = (key) => itemOf(key)?.tier === 'default';
/** Tytuły z rankingu – nie do kupienia. */
export const isExclusive = (key) => itemOf(key)?.tier === 'exclusive';
export const profileList = (kind) => ({ avatar: AVATARS, frame: FRAMES, title: TITLES, music: MUSIC, cele: CELEBRATIONS }[kind] || []);

/** Promocja tygodnia – co tydzień inny przedmiot kosmetyczny taniej. */
export function weeklyPromo(t = Date.now()) {
  const list = [...COLORS.map((c) => `color:${c.id}`), ...TEXTS.map((c) => `text:${c.id}`), ...FONTS.map((c) => `font:${c.id}`),
    ...AVATARS.map((c) => `avatar:${c.id}`), ...FRAMES.map((c) => `frame:${c.id}`), ...TITLES.map((c) => `title:${c.id}`), ...MUSIC.map((c) => `music:${c.id}`), ...CELEBRATIONS.map((c) => `cele:${c.id}`)]
    .filter((k) => !isDefault(k) && !isExclusive(k));
  const week = Math.floor((t / 86400000 + 3) / 7); // tygodnie od poniedziałku
  return { item: list[week % list.length], off: PROMO_OFF, until: (week + 1) * 7 * 86400000 - 3 * 86400000 };
}
export function priceOf(key, t = Date.now()) {
  const it = itemOf(key);
  if (!it) return null;
  const p = weeklyPromo(t);
  return p.item === key ? Math.round(it.price * (100 - p.off) / 100) : it.price;
}
/** Cena pakietu liczona tylko za przedmioty, których uczeń jeszcze nie ma. */
export function bundlePrice(b, owned = new Set()) {
  const missing = b.items.filter((k) => !owned.has(k));
  const full = missing.reduce((s, k) => s + itemOf(k).price, 0);
  return { missing, full, price: Math.round(full * (100 - b.off) / 100) };
}

/* ---------- Kolory: obliczenia ---------- */
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export function mix(a, b, t) { // t = udział koloru b
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function lum(hex) {
  return hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

const NIGHT = '#05070D';
/** Ciemne odcienie tła dla wybranego koloru (tekst musi być czytelny). */
export function bgShades(colorId) {
  const c = BY.color[colorId] || BY.color.ink;
  if (c.id === 'ink') return { 950: '#0A1022', 900: '#0E1529', 850: '#121B33', 800: '#17223F', 700: '#22305A' };
  if (c.fx === 'silver') return { 950: '#1A1F27', 900: '#232A35', 850: '#2B3341', 800: '#343E4E', 700: '#4A5568' };
  const base = c.fx === 'gold' ? '#D9A93A' : c.hex;
  return { 950: mix(base, NIGHT, 0.9), 900: mix(base, NIGHT, 0.85), 850: mix(base, NIGHT, 0.8), 800: mix(base, NIGHT, 0.74), 700: mix(base, NIGHT, 0.6) };
}
/** Kolory, na których leży tekst (do sprawdzenia czytelności). Tęcza – próbki wszystkich odcieni. */
export function bgSamples(colorId) {
  const c = BY.color[colorId] || BY.color.ink;
  if (c.fx === 'rainbow') return Array.from({ length: 12 }, (_, i) => hsl(i * 30, 70, 16));
  const s = bgShades(colorId);
  const out = [s[950], s[900], s[850], s[800]];
  if (c.fx === 'silver') out.push('#3C4656');
  if (c.fx === 'gold') out.push(mix('#F3C752', NIGHT, 0.7));
  return out;
}
export function cardShade(colorId) {
  const c = BY.color[colorId] || BY.color.ink;
  if (c.id === 'ink') return '#16203C';
  if (c.fx === 'rainbow') return '#1D1830';
  if (c.fx === 'silver') return '#283039';
  return mix(c.fx === 'gold' ? '#D9A93A' : c.hex, NIGHT, 0.78);
}
export function inkFor(hex) { return contrast(hex, '#14100A') >= contrast(hex, '#FFFFFF') ? '#1A1206' : '#FFFFFF'; }

// tekst: co najmniej 3,5:1 (wyraźnie różny od tła), akcent: 2,2:1 (przyciski muszą odcinać się od tła)
const MIN_TEXT = 3.5, MIN_ACCENT = 2.2;
/**
 * Sprawdza, czy wybrane kolory się „nie gryzą”: tekst musi być czytelny na tle i na kartach,
 * a akcent widoczny na tle. Zwraca listę problemów (pusta = OK).
 */
export function themeProblems(theme) {
  const t = { ...DEFAULT_THEME, ...theme };
  const text = BY.text[t.text] || BY.text.paper;
  const out = [];
  const bgWorst = Math.min(...bgSamples(t.bg).map((b) => contrast(text.hex, b)));
  if (bgWorst < MIN_TEXT) out.push({ part: 'text', msg: `${text.name} kolor tekstu byłby słabo widoczny na tle „${(BY.color[t.bg] || BY.color.ink).name}”. Wybierz jaśniejszy tekst albo inne tło.` });
  const cardC = contrast(text.hex, cardShade(t.cards));
  if (cardC < MIN_TEXT) out.push({ part: 'cards', msg: `Tekst „${text.name}” byłby nieczytelny na kartach w kolorze „${(BY.color[t.cards] || BY.color.ink).name}”.` });
  const acc = BY.color[t.accent] || BY.color.amber;
  if (acc.fx !== 'rainbow') {
    const accWorst = Math.min(...bgSamples(t.bg).map((b) => contrast(acc.hex, b)));
    if (accWorst < MIN_ACCENT) out.push({ part: 'accent', msg: `Akcent „${acc.name}” zlewałby się z tłem – przyciski byłyby niewidoczne.` });
  }
  return out;
}

/** Zmienne CSS dla motywu (stosowane na <html>). */
export function themeVars(theme) {
  const t = { ...DEFAULT_THEME, ...theme };
  const sh = bgShades(t.bg);
  const acc = BY.color[t.accent] || BY.color.amber;
  const text = BY.text[t.text] || BY.text.paper;
  const font = BY.font[t.font] || BY.font.inter;
  const accHex = acc.fx === 'gold' ? '#F3C752' : acc.fx === 'silver' ? '#D5DCE6' : acc.hex;
  const cardC = BY.color[t.cards] || BY.color.ink;
  const vars = {
    '--ink-950': sh[950], '--ink-900': sh[900], '--ink-850': sh[850], '--ink-800': sh[800], '--ink-700': sh[700],
    '--ink-rgb': hexToRgb(sh[950]).join(' '), '--ink-mid-rgb': hexToRgb(sh[800]).join(' '),
    '--paper': text.hex, '--paper-rgb': hexToRgb(text.hex).join(' '),
    '--flame': accHex, '--flame-rgb': hexToRgb(accHex).join(' '), '--flame-ink': inkFor(accHex), '--flame-hover': mix(accHex, '#FFFFFF', 0.18),
    '--card-bg': cardShade(t.cards), '--card-line': t.cards === 'ink' ? 'rgb(var(--paper-rgb) / .26)' : (cardC.fx === 'gold' ? '#E8B93F' : cardC.fx === 'silver' ? '#C9D1DC' : cardC.hex),
    '--sans': `${font.body}, 'Inter', system-ui, sans-serif`, '--serif': `${font.head}, 'Pagella', Georgia, serif`,
  };
  const classes = [];
  if (t.bg !== 'ink') classes.push('theme-bg');
  if (BY.color[t.bg]?.fx) classes.push(`bg-fx-${BY.color[t.bg].fx}`);
  if (acc.fx) classes.push(`acc-fx-${acc.fx}`);
  if (cardC.fx) classes.push(`card-fx-${cardC.fx}`);
  if (t.cards !== 'ink') classes.push('theme-cards');
  if (text.fx) classes.push(`text-fx-${text.fx}`);
  if (font.id !== 'inter') classes.push(`font-${font.id}`);
  return { vars, classes };
}
