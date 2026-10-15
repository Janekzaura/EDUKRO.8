// Samouczki EDUKRO: nauczyciel (pierwsze kroki, lekcja z każdym rodzajem slajdu, test z każdym rodzajem pytania, punkty i skrzynka),
// administrator (panel, punkty, sklep) i krótki samouczek ucznia. Uruchamiane przy pierwszym logowaniu
// albo z menu „Samouczki” (przycisk „?” → Samouczki).
import { h, icon, dialog } from './ui.js';
import { put, post, get } from './api.js';
import { g } from './g.js';
import { state, navigate, flushLeaveGuards } from './app.js';
import { runTour, tourActive } from './tour.js';
import { closeSettings } from './views/settings-menu.js';
import * as sound from './sound.js';

export { tourActive };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lessonIdFromUrl = () => Number((/\/lekcja\/(\d+)/.exec(location.pathname) || [])[1]) || null;
const closeDialogs = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());
function typeInto(sel, value) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- Treść „Wpisz za mnie” (lekcja i test z samouczka) ---------- */
let CONTENT = null;
async function content() {
  if (!CONTENT) CONTENT = await get('/api/editor/tutorial-content');
  return CONTENT;
}
const ED = () => window.__edukroEd || null;
/** Wstawia gotowy slajd: w bieżący (gdy to ten sam rodzaj), w przeciwnym razie na koniec lekcji. */
async function fillSlide(k) {
  const c = await content();
  const e = ED();
  if (!e || e.kind !== 'lesson') return;
  const data = c.lesson.slides[k];
  const cur = e.current();
  const idx = k === 0 ? 0 : cur.view === 'slide' && e.slideType(cur.index) === data.type ? cur.index : e.count();
  e.fill(idx, data);
  await sleep(350);
}
async function fillQuestion(i) {
  const c = await content();
  const e = ED();
  if (!e || e.kind !== 'test') return;
  e.fill(i, c.test.questions[i]);
  await sleep(350);
}
function chooseSubject(word) {
  const sel = document.querySelector('form select');
  if (!sel) return;
  const opt = [...sel.options].find((o) => o.textContent.toLocaleLowerCase('pl-PL').includes(word));
  if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
}
const panel = '.ed__main .ed-panel';

/* Slajdy lekcji z samouczka: [indeks w treści, etykieta kafelka, rodzaj pytania/gry, opis rodzaju, wskazówki] */
function slidePlan() {
  return [
    { k: 1, card: 'Slajd informacyjny', title: 'Slajd informacyjny',
      what: 'Najważniejszy slajd do tłumaczenia nowego tematu: tytuł, tekst, punkty, tabela i obrazki.',
      tips: ['Krótki tytuł i najwyżej kilka zdań – resztę opowiesz na lekcji.',
        'Słowo w klamrach, np. {elektronów}, będzie zasłonięte – klasa zgaduje, a Ty odsłaniasz je kliknięciem.',
        'Punkty ustaw „Na kliknięcie” – pojawią się po kolei, gdy o nich mówisz.',
        'Ważną zasadę oznacz wyglądem „Ważne!”, a przykład – „Przykład”. Element „Po czasie” pojawi się sam.',
        'Przycisk „Do wymowy”: zaznacz słowo albo zdanie i kliknij – na tablicy będzie podkreślone, a po kliknięciu przeczyta je lektor (np. słówka po angielsku).'] },
    { k: 2, card: 'Slajd do przepisania', title: 'Slajd do przepisania',
      what: 'Notatka do zeszytu z paskiem czasu u góry – uruchamiasz go przyciskiem Start, gdy uczniowie zaczynają pisać.',
      tips: ['Czas wpisz w minutach: 3 = trzy minuty, 2.30 = dwie i pół minuty.',
        'Daj tyle czasu, ile potrzebuje najwolniej piszący uczeń.',
        'Notatka ma być krótka: tabela albo kilka punktów. Definicję oznacz wyglądem „Definicja”.'] },
    { k: 3, card: 'Fiszki', title: 'Fiszki',
      what: 'Pojęcie z przodu, wyjaśnienie z tyłu. Kliknięcie odwraca kartę – świetne na powtórkę.',
      tips: ['Z przodu jedno–dwa słowa, z tyłu jedno krótkie zdanie.',
        'Najlepiej 4–8 fiszek: najpierw klasa próbuje odpowiedzieć, potem odwracasz kartę.'] },
    { k: 4, card: 'Slajd z pytaniem', qcard: 'Jedna poprawna', title: 'Slajd z pytaniem',
      what: 'Pytanie takie jak w testach – piętnaście rodzajów. Klasa odpowiada na tablicy, a EDUKRO od razu sprawdza.',
      qwhat: 'Wybierz rodzaj pytania – kliknij „Jedna poprawna (A–D)”.',
      tips: ['Wpisz pytanie i cztery odpowiedzi, a przy poprawnej kliknij „Ustaw jako poprawną”.',
        'Błędne odpowiedzi powinny brzmieć wiarygodnie – wtedy pytanie naprawdę sprawdza wiedzę.',
        'W „Wyjaśnieniu” napisz, dlaczego tak jest – klasa zobaczy je po błędnej odpowiedzi.'] },
    { k: 5, card: 'Slajd z pytaniem', qcard: 'Ułóż w kolejności', title: 'Drugie pytanie: kolejność',
      what: 'Jeszcze jeden slajd z pytaniem – tym razem inny rodzaj, żeby lekcja była ciekawsza.',
      qwhat: 'Kliknij „Ułóż w kolejności”.',
      tips: ['Elementy wpisz w POPRAWNEJ kolejności – uczniowie zobaczą je pomieszane.',
        'W treści pytania napisz, według czego układać, np. „od najmniejszego do największego”.'] },
    { k: 6, card: 'Burza mózgów', title: 'Burza mózgów',
      what: 'Pytanie do całej klasy. W trakcie lekcji wpisujesz pomysły uczniów – pojawiają się jako kolorowe karteczki.',
      tips: ['Zadaj pytanie otwarte, na które jest wiele dobrych odpowiedzi.',
        'Dobrze sprawdza się na początku tematu – zobaczysz, co klasa już wie.'] },
    { k: 7, card: 'Koło fortuny', title: 'Koło fortuny',
      what: 'Koło z imionami uczniów klasy, z którą prowadzisz lekcję. Za dobrą odpowiedź uczeń dostaje punkty do skrzynki.',
      tips: ['Dodaj kilka krótkich pytań z odpowiedziami – po każdym losowaniu pojawi się kolejne. Odpowiedź widzisz tylko Ty.',
        'Zostaw włączone „Wylosowana osoba znika z koła” – każdy odpowie raz, zanim ktoś odpowie drugi raz.'] },
    { k: 8, card: 'Gra klasowa', game: 'Czerwoni vs Niebiescy', title: 'Gra klasowa: pojedynek',
      what: 'Klasa dzieli się na czerwonych i niebieskich. Wygrana drużyna dostaje punkty.',
      qwhat: 'Wybierz grę „Czerwoni vs Niebiescy” – pojedynek na szybkość.',
      tips: ['Pytania krótkie, z jedną odpowiedzią – liczy się szybkość.',
        'Liczba pytań musi być nieparzysta (co najmniej 5), żeby zawsze był zwycięzca.'] },
    { k: 9, card: 'Gra klasowa', game: 'Kółko i krzyżyk', title: 'Gra klasowa: kółko i krzyżyk',
      what: 'Drużyny na zmianę wybierają pole planszy 3×3 i odpowiadają na pytanie.',
      qwhat: 'Wybierz „Kółko i krzyżyk”.',
      tips: ['Każde pole to jedno pytanie. Przygotuj co najmniej 9, a najlepiej 12–15 pytań.',
        'Po błędnej odpowiedzi pole zostaje wolne – dlatego potrzebne są pytania zapasowe.'] },
    { k: 10, card: 'Gra klasowa', game: 'Va banque', title: 'Gra klasowa: Va banque',
      what: 'Plansza z kategoriami i pytaniami za 100, 200, 300… Wygrywa drużyna z większą sumą.',
      qwhat: 'Wybierz „Va banque”.',
      tips: ['Od 2 do 5 kategorii, w każdej 3–5 pytań.',
        'Pytanie za 100 – najłatwiejsze, za 500 – najtrudniejsze.'] },
  ];
}

function lessonSteps() {
  const B = teacherBase(state.user.role);
  const doIt = g('Możesz wpisać wszystko sam albo kliknąć „Wpisz za mnie”. Gdy skończysz, kliknij „Dalej”.', 'Możesz wpisać wszystko sama albo kliknąć „Wpisz za mnie”. Gdy skończysz, kliknij „Dalej”.');
  const steps = [
    { route: B.lessons, target: `.tabpanel a[href="${B.edit}/lekcja/nowa"]`, action: 'click', before: () => { content().catch(() => {}); }, title: 'Stwórz lekcję', text: 'Zbudujemy razem lekcję z każdym rodzajem slajdu. Jeśli zawsze klikniesz „Wpisz za mnie”, powstanie gotowa lekcja „Budowa atomu”. Kliknij „Stwórz lekcję”.' },
    { target: 'form .field input', action: 'input', fill: 'Lekcja z samouczka – wszystkie rodzaje slajdów', title: 'Nazwa lekcji', text: 'Wpisz nazwę lekcji albo kliknij „Wpisz za mnie”.' },
    { target: 'form select', title: 'Przedmiot', text: 'Wybierz przedmiot, do którego należy lekcja. Nasza przykładowa lekcja jest z chemii.', doLabel: 'Wybierz za mnie', do: async () => chooseSubject('chem') },
    { target: 'form .notice', title: 'Jedna lekcja dla wszystkich klas', text: 'Klasę wybierzesz dopiero przy prowadzeniu – nie trzeba robić tej samej lekcji dla 7a i 7b.' },
    { target: 'form button[type="submit"]', action: 'click', title: 'Utwórz lekcję', text: 'To będzie lekcja z samouczka: możesz ją prowadzić na próbę, kopiować i usunąć, ale nie da się jej opublikować uczniom. Kliknij, aby ją utworzyć.' },
    { target: '.ed__nav', title: 'Spis lekcji', text: 'Po lewej jest spis: ustawienia, wszystkie slajdy, lista slajdów i „Sprawdź lekcję”. Kolor przy slajdzie mówi, czy jest gotowy: zielony – gotowy, czerwony – do uzupełnienia.' },
    { target: '.lp', title: 'Podgląd na żywo', text: 'W rogu ekranu jest podgląd na żywo: tak wygląda bieżący slajd na tablicy, a zmienia się, gdy tylko coś wpiszesz. Przeciągnij okienko za pasek w dowolne miejsce, a kliknij je, żeby zobaczyć slajd na pełnym ekranie.' },
    { dock: true, target: panel, title: 'Slajd 1: tytułowy', text: `Każda lekcja zaczyna się od slajdu tytułowego. ${doIt}`,
      tips: ['Tytuł do pięciu słów – czytelny z ostatniej ławki.', 'W podtytule przedmiot i klasa albo pytanie, które zaciekawi uczniów.', 'Obrazek nie jest obowiązkowy, ale bardzo pomaga.'],
      doLabel: 'Wpisz za mnie', do: () => fillSlide(0) },
  ];
  for (const p of slidePlan()) {
    const n = p.k + 1;
    steps.push({ target: '.ed-nav__item::Dodaj slajd', action: 'click', title: `Slajd ${n}: dodaj slajd`, text: p.k === 1 ? 'Dodajmy drugi slajd. Kliknij „Dodaj slajd”.' : 'Dodajmy kolejny slajd – kliknij „Dodaj slajd”.' });
    steps.push({ target: `.type-grid--slides .type-card::${p.card}`, action: 'click', title: p.title, text: `${p.what} Kliknij „${p.card}”.` });
    if (p.qcard) steps.push({ target: `.ed__main .type-grid .type-card::${p.qcard}`, action: 'click', title: 'Rodzaj pytania', text: p.qwhat });
    if (p.game) steps.push({ target: `.ed__main .kind-card::${p.game}`, action: 'click', title: 'Rodzaj gry', text: p.qwhat });
    steps.push({ dock: true, target: panel, title: `Slajd ${n}: ${p.title.toLocaleLowerCase('pl-PL')}`, text: `Jak zrobić to dobrze: ${doIt}`, tips: p.tips, doLabel: 'Wpisz za mnie', do: () => fillSlide(p.k) });
  }
  steps.push(
    { target: '.ed-nav__item::Wszystkie slajdy', action: 'click', title: 'Wszystkie slajdy', text: 'Masz już wszystkie rodzaje slajdów! Kliknij „Wszystkie slajdy”.' },
    { target: '.q-cards', title: 'Lista slajdów', text: 'Każdy kafelek to slajd. Strzałkami zmienisz kolejność, możesz też kopiować i usuwać slajdy. Czerwony kafelek trzeba jeszcze uzupełnić.' },
    { target: '.ed__actions button::Podgląd', action: 'click', title: 'Podgląd', text: 'Zobaczmy, jak lekcja wygląda na tablicy. Kliknij „Podgląd”.' },
    { target: '.present__stage', title: 'Lekcja na tablicy', text: 'Strzałka w prawo albo spacja przechodzi dalej, a litera F włącza pełny ekran. Zasłonięte słowa i elementy „na kliknięcie” odsłaniają się po kolei.' },
    { target: '.present__dots', title: 'Kropki slajdów', text: 'Kropki pokazują wszystkie slajdy – kliknij kropkę, aby skoczyć do slajdu.' },
    { target: '.lk-toggle', action: 'click', title: 'Wygląd slajdu', text: 'W podglądzie zmienisz też wygląd slajdów – naprawdę, w lekcji. Kliknij „Wygląd”.' },
    { before: async () => { await sleep(500); document.querySelector('.present__stage [data-lk="title"]')?.click(); await sleep(300); }, target: '.lk-bar', title: 'Powiększaj, zmieniaj, przesuwaj',
      text: 'Kliknij napis albo obrazek na slajdzie: zmienisz rozmiar, czcionkę i kolor, a przeciągając – przesuniesz go w inne miejsce. Obrazek wykadrujesz przyciskiem „Kadruj”. Po prawej wybierasz tło slajdu. Wszystko od razu zapisuje się w lekcji, a „Przywróć” cofa zmiany.' },
    { target: '.lk-bar button::Gotowe', action: 'click', title: 'Gotowe', text: 'Kliknij „Gotowe”, żeby zakończyć zmiany wyglądu.' },
    { target: '.present__close', action: 'click', title: 'Wyjdź z podglądu', text: 'Wróćmy do edytora. Kliknij „Wyjdź z podglądu”.' },
    { target: '.ed__actions button::Prowadź lekcję', action: 'click', title: 'Prowadź lekcję', text: 'Gdy prowadzisz lekcję z klasą, kliknij „Prowadź lekcję”. Kliknij teraz – pokażę wybór klasy.' },
    { target: '.cls-tiles, dialog[open] .notice', title: 'Wybór klasy', text: 'Wybierasz klasę: na kole fortuny i w grach pojawią się jej uczniowie. Zwykła lekcja po dojściu do końca od razu pojawia się u uczniów tej klasy. Lekcję z samouczka możesz poprowadzić na próbę – uczniowie jej nie zobaczą.' },
    { target: '.cls-tiles, dialog[open] .notice', title: 'Gwiazda lekcji', text: 'Na końcu lekcji prowadzonej z klasą wybierzesz Gwiazdę lekcji – najaktywniejszą osobę. Dostaje ona sto punktów i gwiazdkę w rankingu tygodnia, a w piątek o szesnastej osoba z największą liczbą gwiazdek zostaje Gwiazdą szkoły.' },
    { before: closeDialogs, target: '.ed__actions button::Kopiuj', title: 'Lekcja z samouczka', text: 'Tej lekcji nie można opublikować. Możesz ją usunąć albo skopiować – kopię opublikujesz, gdy wprowadzisz w niej choć małą zmianę, na przykład poprawisz jedno słowo.' },
    { target: '.ed-nav__item::Sprawdź lekcję', title: 'Sprawdź lekcję', text: 'Tu zobaczysz, czego brakuje przed publikacją – kliknięcie przenosi do slajdu z błędem.' },
    { title: 'Lekcja gotowa!', text: 'Znasz już wszystkie rodzaje slajdów. Lekcja z samouczka zostaje na liście – możesz ją poprowadzić, skopiować albo usunąć. Teraz zrobimy razem test.', final: true, finalLabel: 'Dalej: tworzymy test' },
  );
  return steps;
}

/* Pytania testu z samouczka – w kolejności z /api/editor/tutorial-content */
const QPLAN = [
  { card: 'Jedna poprawna', title: 'Jedna poprawna (A–D)', what: 'Cztery odpowiedzi, uczeń wybiera jedną dobrą.',
    tips: ['Przy poprawnej odpowiedzi kliknij „Ustaw jako poprawną”.', 'Złe odpowiedzi muszą brzmieć wiarygodnie – inaczej uczeń zgadnie.', 'Podpowiedź naprowadza, a wyjaśnienie mówi, dlaczego – uczeń zobaczy je po błędzie.'] },
  { card: 'Wszystkie poprawne', title: 'Wszystkie poprawne', what: 'Kilka odpowiedzi – uczeń zaznacza wszystkie dobre.',
    tips: ['Zaznacz każdą poprawną odpowiedź.', 'Najlepiej 4–6 odpowiedzi, z czego 2–3 poprawne – wtedy trudno zgadnąć.'] },
  { card: 'Prawda czy fałsz', title: 'Prawda czy fałsz', what: 'Seria 3–5 zdań – przy każdym uczeń wybiera prawdę albo fałsz.',
    tips: ['Mieszaj zdania prawdziwe i fałszywe.', 'Unikaj podchwytliwych słów „nigdy” i „zawsze” – sprawdzaj wiedzę, nie czujność.'] },
  { card: 'Odpowiedź pisemna', title: 'Odpowiedź pisemna', what: 'Uczeń pisze własnymi słowami, a EDUKRO sprawdza odpowiedź po seriach słów kluczowych.',
    tips: ['W każdej serii wpisz odmiany i synonimy oddzielone ukośnikiem, np. atom / atomy / atomów.', 'Uczeń musi użyć słowa z każdej serii – ale nie wie, jakich słów szukamy.', 'Dodaj przykładową odpowiedź – uczeń zobaczy ją po błędzie.'] },
  { card: 'Odpowiedź liczbowa', title: 'Odpowiedź liczbowa', what: 'Uczeń wpisuje liczbę.',
    tips: ['Przecinek i kropka znaczą to samo.', '„Dopuszczalny błąd” pozwala zaliczyć wynik przybliżony, a jednostka pojawi się obok pola.'] },
  { card: 'Połącz w pary', title: 'Połącz w pary', what: 'Uczeń łączy linią elementy z dwóch kolumn (do 6 par).',
    tips: ['Lewa kolumna – pojęcia, prawa – ich odpowiedniki.', 'Każdy element z prawej powinien pasować tylko do jednego z lewej.'] },
  { card: 'Ułóż zdanie', title: 'Ułóż zdanie', what: 'Rozsypane słowa – uczeń układa z nich zdanie.',
    tips: ['Wpisz całe poprawne zdanie – EDUKRO samo je rozsypie.', 'Zbędne słowa (pułapki) oddziel ukośnikiem.'] },
  { card: 'Ułóż w kolejności', title: 'Ułóż w kolejności', what: 'Uczeń ustawia elementy w kolejności, która ma sens.',
    tips: ['Wpisuj elementy w poprawnej kolejności.', 'W treści pytania napisz, według czego układać.'] },
  { card: 'Uzupełnij zdanie – wpisz', title: 'Uzupełnij zdanie – wpisz', what: 'Zdanie z lukami – uczeń wpisuje brakujące słowa.',
    tips: ['Lukę zrób nawiasem okrągłym: (atom).', 'Kilka poprawnych odpowiedzi oddziel ukośnikiem: (neutrony/neutronów).'] },
  { card: 'Uzupełnij zdanie – wybierz', title: 'Uzupełnij zdanie – wybierz', what: 'Zdanie z lukami – uczeń wybiera słowo z listy.',
    tips: ['Lukę z wyborem zrób nawiasem kwadratowym: [gazem/cieczą/ciałem stałym].', 'Pierwsza odpowiedź jest poprawna – uczeń zobaczy je pomieszane.'] },
  { card: 'Uzupełnij tabelę', title: 'Uzupełnij tabelę', what: 'Gotowa tabela z ukrytymi komórkami do wpisania.',
    tips: ['Najpierw przygotuj pełną, poprawnie wypełnioną tabelę.', 'Narzędziem „Zostaw puste” zaznacz komórki, które uczeń ma uzupełnić.', '„Grupa” pozwala wpisać odpowiedzi w dowolnej kolejności, a „Kłódka” przypina odpowiedź do jednej komórki.'] },
  { card: 'Przeciągnij do kategorii', title: 'Przeciągnij do kategorii', what: 'Uczeń rozdziela słowa do właściwych kategorii.',
    tips: ['Od 2 do 6 kategorii; słowa w kategorii oddziel ukośnikiem.', 'Każde słowo powinno pasować tylko do jednej kategorii.'] },
  { card: 'Podpisz obrazek', title: 'Podpisz obrazek', what: 'Punkty na obrazku – uczeń przeciąga do nich nazwy.',
    tips: ['Dodaj obrazek, kliknij „Zaznacz punkty” i klikaj miejsca na rysunku.', 'Podpisz każdy punkt. Zbędne nazwy utrudnią zgadywanie.'] },
  { card: 'Przeczytaj i odpowiedz', title: 'Przeczytaj i odpowiedz', what: 'Uczeń czyta tekst, który potem znika, i odpowiada pisemnie.',
    tips: ['Tekst powinien być krótki – kilka zdań.', 'Pytania sprawdzają zrozumienie: każde ma słowa kluczowe i przykładową odpowiedź.'] },
  { card: 'Zadanie na słuch', title: 'Zadanie na słuch', what: 'Lektor czyta słowo albo zdanie – także po angielsku czy niemiecku – a uczeń zapisuje, co usłyszał.',
    tips: ['Wpisz dokładnie to, co uczeń ma zapisać, i wybierz język lektora.', 'Kliknij „Posłuchaj”, żeby sprawdzić, jak to brzmi. Uczeń może słuchać wiele razy, także wolniej.', 'Inne poprawne zapisy (np. colour / color) oddziel ukośnikiem.'] },
];

function testSteps() {
  const B = teacherBase(state.user.role);
  const doIt = g('Wpisz pytanie sam albo kliknij „Wpisz za mnie”, a potem „Dalej”.', 'Wpisz pytanie sama albo kliknij „Wpisz za mnie”, a potem „Dalej”.');
  const steps = [
    { route: B.tests, target: `.tabpanel a[href="${B.edit}/test/nowy"]`, action: 'click', before: () => { content().catch(() => {}); }, title: 'Stwórz test', text: 'Zrobimy test z wszystkimi piętnastoma rodzajami pytań – po jednym każdego rodzaju. Kliknij „Stwórz test”.' },
    { target: '.kind-cards', title: 'Rodzaje testów', text: 'Test nauczający – bez zegara, po błędzie uczeń widzi poprawną odpowiedź. Egzaminacyjny – na czas, z limitem błędów, pierwsze zaliczenie trafia do Ciebie. Sprawdzian – ocena od jeden do sześć, sprawdzany na końcu.' },
    { target: '.kind-card::Test nauczający', action: 'click', title: 'Test nauczający', text: 'Wybierz test nauczający.' },
    { target: 'form > .field:nth-of-type(2) input, form input.input:not([type="number"])', action: 'input', fill: 'Test z samouczka – wszystkie rodzaje pytań', title: 'Nazwa testu', text: 'Wpisz nazwę albo kliknij „Wpisz za mnie”.' },
    { target: 'form select', title: 'Przedmiot', text: 'Wybierz przedmiot. Nasz przykładowy test jest z chemii.', doLabel: 'Wybierz za mnie', do: async () => chooseSubject('chem') },
    { target: '.start-cards', title: 'Skąd pytania?', text: `Możesz wpisać pytania ${g('sam', 'sama')} albo wyodrębnić je z innych testów, sprawdzianów i lekcji.` },
    { target: 'form .stepper__input', action: 'input', fill: '15', title: 'Liczba pytań', text: 'Piętnaście rodzajów pytań – piętnaście pytań. Wpisz 15 albo kliknij „Wpisz za mnie”.' },
    { target: 'form button[type="submit"]', action: 'click', title: 'Utwórz test', text: 'To będzie test z samouczka – nie da się go opublikować, ale możesz go skopiować albo usunąć. Kliknij, aby go utworzyć.' },
    { target: '.type-grid', title: 'Rodzaje pytań', text: 'Oto wszystkie rodzaje pytań. Przejdziemy przez każdy z nich – pokażę, jak zrobić go dobrze.' },
  ];
  QPLAN.forEach((p, i) => {
    steps.push({
      before: async () => { const e = ED(); if (e?.kind === 'test') { e.ensure(i); e.show({ view: 'question', index: i }); await sleep(250); } },
      target: () => [...document.querySelectorAll('.type-picker .type-card')].find((x) => x.textContent.toLocaleLowerCase('pl-PL').includes(p.card.toLocaleLowerCase('pl-PL'))) || null,
      action: 'click', title: `Pytanie ${i + 1}: ${p.title}`, text: `${p.what} Kliknij „${p.title}”.`,
    });
    steps.push({ dock: true, target: panel, title: `Pytanie ${i + 1}: jak zrobić to dobrze`, text: doIt, tips: p.tips, doLabel: 'Wpisz za mnie', do: () => fillQuestion(i) });
  });
  steps.push(
    { target: '.ed-nav__item::Wszystkie pytania', action: 'click', title: 'Wszystkie pytania', text: 'Masz już wszystkie rodzaje pytań! Kliknij „Wszystkie pytania”.' },
    { target: '.q-cards', title: 'Lista pytań', text: 'Zielony kafelek – pytanie gotowe, czerwony – trzeba coś uzupełnić. Pytania możesz przesuwać, kopiować i usuwać.' },
    { target: '.ed-nav__item::Ustawienia testu', action: 'click', title: 'Ustawienia testu', text: 'Zajrzyjmy do ustawień. Kliknij „Ustawienia testu”.' },
    { target: () => document.querySelector('[data-field="reward"]')?.closest('.qe-box'), title: 'Nagroda za test', text: 'Oprócz punktów możesz dać nagrodę: kolor, czcionkę albo promocję w sklepie. Trafi do skrzynki ucznia po ukończeniu testu.' },
    { target: () => document.querySelector('.qe-box .switch input')?.closest('.qe-box'), title: 'Test tymczasowy', text: 'Test tymczasowy sam znika po wybranym czasie – na przykład wyzwanie na jeden dzień. Uczniowie widzą go w specjalnej ramce z odliczaniem i dostają przypomnienie.' },
    { target: '.ed-nav__add::Wyodrębnij', title: 'Wyodrębnij pytania', text: 'Skopiujesz tu pytania z innych testów, sprawdzianów i lekcji – nie trzeba wpisywać ich drugi raz.' },
    { target: '.ed__actions button::Podgląd ucznia', title: 'Podgląd ucznia', text: 'Rozwiążesz test dokładnie tak jak uczeń – bez zapisywania wyników.' },
    { target: '.ed__actions button::Kopiuj', title: 'Test z samouczka', text: 'Tego testu nie można opublikować. Możesz go usunąć albo skopiować – kopię opublikujesz, gdy wprowadzisz w niej choć małą zmianę. Zwykły test publikujesz przyciskiem „Opublikuj”, a uczniowie od razu dostają powiadomienie.' },
    { title: 'Brawo!', text: 'Znasz już wszystkie rodzaje pytań. Na koniec pokażę punkty i skrzynkę.', final: true, finalLabel: 'Dalej: punkty i skrzynka' },
  );
  return steps;
}

/* ---------- Rozdziały ---------- */
function teacherBase(role) {
  const admin = role === 'admin';
  return {
    admin,
    edit: admin ? '/administracja' : '/nauczyciel',
    lessons: admin ? '/administracja/lekcje' : '/nauczyciel/panel/lekcje',
    tests: admin ? '/administracja/testy' : '/nauczyciel/panel/testy',
  };
}

const CHAPTERS = {
  'teacher-start': {
    roles: ['teacher'], title: 'Pierwsze kroki', desc: 'Panel nauczyciela, skrzynka, punkty, dźwięk i przycisk pomocy.', min: 2, next: 'teacher-lesson',
    steps: () => [
      { title: `Witaj w EDUKRO${state.user.greetingName ? `, ${state.user.greetingName}` : ''}!`, text: 'Pokażę Ci najważniejsze rzeczy. Strzałka wskaże przycisk, a ja powiem, co robi. Samouczek możesz w każdej chwili zakończyć: naciśnij Esc, a na górze pojawi się przycisk „Pomiń samouczek”.' },
      { route: '/nauczyciel/panel/przeglad', target: '.tabs', title: 'Zakładki panelu', text: 'Tu przełączasz części panelu: przegląd, lekcje, testy i gry, dzienne pytania, wyniki uczniów, pochwały i punkty. Przyciski „Stwórz…” są tylko w Przeglądzie.' },
      { target: '.actions a[href="/nauczyciel/lekcja/nowa"]', title: 'Stwórz lekcję', text: 'Lekcja to slajdy jak w prezentacji. Jedna lekcja służy wszystkim klasom – klasę wybierasz dopiero, gdy ją prowadzisz.' },
      { target: '.actions a[href="/nauczyciel/test/nowy"]', title: 'Stwórz test lub sprawdzian', text: 'Testy nauczające, egzaminacyjne i sprawdziany. Lekcję i test możesz zacząć od gotowego szablonu, na przykład „Klasyczny sprawdzian” – wpiszesz tylko treść. Własny szablon zapiszesz w edytorze.' },
      { target: '.actions a[href="/nauczyciel/gra/nowa"]', title: 'Stwórz grę', text: 'Dwie gry z Twoimi pytaniami: Saper – rozbrajanie bomby, w którym jeden błąd oznacza wybuch – i Hammer Game, w którym uczeń uderza młotkiem w kartki, żuki i odpowiedzi. Są już dwie przykładowe gry z chemii.' },
      { target: '.tabs .tab::Lekcje, testy i gry', title: 'Lekcje, testy i gry', text: 'Wszystkie Twoje materiały są w jednej zakładce. W środku przełączasz: lekcje, testy i sprawdziany albo gry.' },
      { target: '.tabs .tab::Dzienne pytania', title: 'Dzienne pytania', text: 'Dodawaj pytania do swoich przedmiotów – ile chcesz, nie muszą dotyczyć bieżącego tematu. Każdy uczeń raz dziennie losuje jedno pytanie z przedmiotu i buduje serię: pierwsze pytanie dnia daje tyle punktów, ile dni trwa seria.' },
      { target: '.tabs .tab::Punkty', title: 'Punkty', text: 'Nagradzaj uczniów punktami – raz dziennie, łącznie do stu punktów. Przycisk „Przyznaj punkty” jest w tej zakładce, a punkty trafią do skrzynek uczniów.' },
      { target: '.topbar .settings-btn', action: 'click', title: 'Ustawienia', text: 'Skrzynka, dźwięk, ustawienia ogólne i wylogowanie są w jednym miejscu. Kliknij „Ustawienia” – menu się rozwinie.' },
      { target: '.settings-pop', title: 'Menu ustawień', text: 'Skrzynka – liczba przy przycisku to nowe wiadomości, na przykład prośby o pochwałę. Dźwięk i ustawienia ogólne rozwijają się na miejscu: efekty, muzyka, lektor, czyli ja, forma zwracania się i zmiana kodu dostępu – w okienku, bez przechodzenia na inną stronę.' },
      { before: () => closeSettings(), target: '.tool-btn--help', title: 'Przycisk pomocy', text: 'Kliknij znak zapytania, a potem dowolny przycisk – powiem, co robi. W pasku pomocy jest też przycisk „Samouczki” ze wszystkimi samouczkami.' },
      { title: 'Panel już znasz!', text: 'Teraz zbudujemy razem lekcję z każdym rodzajem slajdu – krok po kroku.', final: true, finalLabel: 'Dalej: tworzymy lekcję' },
    ],
  },

  'teacher-lesson': {
    roles: ['teacher', 'admin'], title: 'Tworzenie lekcji', desc: 'Krok po kroku zbudujesz lekcję z każdym rodzajem slajdu – samodzielnie albo z przyciskiem „Wpisz za mnie”. Potem podgląd, prowadzenie z klasą i zasady publikacji.', min: 15, next: 'teacher-test',
    steps: () => lessonSteps(),
  },

  'teacher-test': {
    roles: ['teacher', 'admin'], title: 'Tworzenie testu', desc: 'Test z wszystkimi 15 rodzajami pytań – każdy rodzaj omówiony: jak go zrobić dobrze. Potem nagroda, test tymczasowy, podgląd i publikacja.', min: 15, next: 'teacher-points',
    steps: () => testSteps(),
  },

  'teacher-points': {
    roles: ['teacher'], title: 'Punkty, pochwały i skrzynka', desc: 'Jak nagradzać uczniów punktami, decydować o pochwałach i korzystać ze skrzynki.', min: 1,
    steps: () => [
      { route: '/nauczyciel/panel/punkty', target: '.tabpanel .admin__head', title: 'Punkty dla uczniów', text: 'Tu przyznajesz punkty – raz dziennie, łącznie do stu. Możesz dać je jednemu uczniowi albo kilku.' },
      { target: '.tabpanel button::Przyznaj punkty', title: 'Przyznaj punkty', text: 'Zaznaczasz uczniów, wpisujesz liczbę punktów i krótką wiadomość. Uczniowie odbiorą punkty w skrzynce.' },
      { route: '/nauczyciel/panel/pochwaly', target: '.tabpanel', title: 'Pochwały', text: `Uczniowie mogą kupić w sklepie pochwałę od wychowawcy. Jeśli jesteś ${g('wychowawcą', 'wychowawczynią')}, prośby z Twojej klasy trafią tutaj i do skrzynki.` },
      { route: '/ranking', target: '.rk-tabs', title: 'Rankingi', text: 'Ranking widzisz także Ty. Z boku wybierasz zakładkę: ogólny, najaktywniejsi, najwięcej punktów, najlepsze oceny ze sprawdzianów, najwięcej wygranych testów i gwiazdy lekcji. Kto prowadzi ponad trzy dni, dostaje wyjątkowy tytuł i kręci kołem fortuny.' },
      { before: () => document.querySelector('.rk-tab[data-k="gwiazdy"]')?.click(), target: '.rk-main', title: 'Gwiazdy lekcji', text: 'Gwiazdy lekcji wybierasz na koniec lekcji – osoba z największą liczbą gwiazdek w piątek o szesnastej zostaje Gwiazdą szkoły: ma tytuł i dostaje o jedną piątą więcej punktów przez tydzień.' },
      { route: '/skrzynka', target: '.inbox__head', title: 'Twoja skrzynka', text: 'Skrzynkę otwierasz z menu Ustawienia. Tu przychodzą wiadomości. Uczniowie dostają tu informacje o nowych testach i lekcjach oraz odbierają punkty i nagrody.' },
      { target: '.exit-btn', title: 'Wyjdź', text: 'Przycisk „Wyjdź” wraca do panelu – a jeśli przyszłaś lub przyszedłeś z menu Ustawienia, z powrotem je rozwija.' },
      { target: '.topbar .tool-btn--help', title: 'Pomoc zawsze pod ręką', text: 'Gdy nie wiesz, co robi przycisk, kliknij znak zapytania, a potem ten przycisk. Samouczki uruchomisz ponownie z menu pomocy. Powodzenia!', final: true },
    ],
  },

  'teacher-v6': {
    roles: ['teacher', 'admin'], title: 'Nowości: dzienne pytania, szablony, lektor', desc: 'Dzienne pytania i seria, szablony lekcji i testów, „Do wymowy”, zadanie na słuch, nowe głosy lektora i zmiana wyglądu w podglądzie.', min: 2,
    steps: () => {
      const B = teacherBase(state.user.role);
      return [
        { route: B.admin ? '/administracja/dzienne' : '/nauczyciel/panel/dzienne', target: '.daily-admin', title: 'Dzienne pytania', text: 'Wybierz przedmiot i dodaj pytania – ile chcesz, każdego rodzaju. Uczeń raz dziennie losuje jedno pytanie z przedmiotu. Pierwsze pytanie dnia buduje serię: tyle punktów, ile dni z rzędu. Kolejne przedmioty dają dwa punkty bonusu.' },
        { target: '.daily-admin a::Dodaj pytanie', title: 'Dodaj pytanie', text: 'Pytanie tworzysz tak samo jak w teście. Przełącznikiem przy pytaniu wyłączysz je z losowania.' },
        { route: `${B.edit}/lekcja/nowa`, target: '.tpl-picker', title: 'Szablony', text: 'Nową lekcję albo test możesz zacząć od szablonu: ten sam układ slajdów lub pytań, ale bez tekstu. Są gotowe szablony – na przykład krótka lekcja i klasyczny sprawdzian – a własny zapiszesz w edytorze przyciskiem „Zapisz jako szablon”.' },
        { title: 'Lektor i wymowa', text: 'W slajdach z tekstem jest przycisk „Do wymowy”: zaznacz słowo albo zdanie, wybierz język i lektora, a na tablicy po kliknięciu lektor je przeczyta. Nowy rodzaj pytania „Zadanie na słuch”: lektor mówi, uczeń zapisuje. Są też nowe głosy: lektorka i młody lektor – w Ustawienia, Dźwięk.' },
        { title: 'Wygląd w podglądzie', text: 'W podglądzie lekcji kliknij „Wygląd”: powiększysz napis albo obrazek, zmienisz czcionkę, kolor i tło slajdu, przesuniesz element i wykadrujesz obrazek. Z podglądu wychodzisz przyciskiem „Wyjdź z podglądu”.', final: true },
      ];
    },
  },

  'admin-start': {
    roles: ['admin'], title: 'Panel administratora', desc: 'Sekcje panelu, zatwierdzanie kont, punkty bez limitu, ceny i promocje w sklepie.', min: 3, next: 'teacher-lesson',
    steps: () => [
      { title: 'Witaj w panelu administratora!', text: 'Pokażę Ci najważniejsze sekcje. Samouczek zakończysz klawiszem Esc i przyciskiem „Pomiń samouczek”, który wtedy pojawi się na górze.' },
      { route: '/administracja/przeglad', target: '.admin__nav', title: 'Sekcje panelu', text: 'Po lewej są wszystkie sekcje: rejestr uczniów, konta, nauczyciele, przedmioty, lekcje, testy, gry, pochwały, punkty, sklep i zgłoszenia.' },
      { target: '.admin__nav button::Rejestr uczniów', title: 'Rejestr uczniów', text: 'Lista uczniów szkoły z klasami. Tylko osoby z rejestru mogą założyć konto, a klasy służą do lekcji, koła fortuny i gier.' },
      { target: '.admin__nav button::Konta', title: 'Konta', text: 'Tu zatwierdzasz nowe konta uczniów. Uczeń dostaje wtedy powiadomienie i może wydawać punkty.' },
      { target: '.admin__nav button::Punkty', title: 'Punkty', text: 'Przyznajesz punkty dowolnym uczniom – bez limitu. Nauczyciele mogą raz dziennie, do stu punktów.' },
      { target: '.admin__nav button::Sklep', action: 'click', title: 'Sklep', text: 'Kliknij „Sklep”.' },
      { target: '.promo-form', title: 'Promocje czasowe', text: 'Promocja na godzinę, dzień, tydzień albo do wybranego terminu – na jeden przedmiot albo cały sklep. Uczniowie dostaną powiadomienie.' },
      { target: () => [...document.querySelectorAll('.admin-shop .block')].find((b) => /Pakiety/.test(b.querySelector('h2')?.textContent || '')), title: 'Pakiety', text: 'Tworzysz tu własne pakiety, na przykład „Pakiet muzyczny”: wybierasz przedmioty i cenę za całość. Uczeń, który ma już część, płaci proporcjonalnie mniej.' },
      { target: '.price-group', title: 'Ceny', text: 'Tu zmienisz cenę każdego przedmiotu – także profilowych, ramek, tytułów i muzyki. Zmienione ceny są podświetlone i zawsze możesz przywrócić domyślną.' },
      { route: '/administracja/rejestr', target: 'button::Szybkie dodawanie', title: 'Szybkie dodawanie uczniów', text: 'Całą klasę dodasz naraz: wybierz klasę, wklej listę (imię i nazwisko w każdej linii), kliknij „Zamień”, popraw tabelę i „Przenieś do rejestru”.' },
      { target: '.topbar .bell, .topbar .settings-btn', title: 'Skrzynka', text: 'W skrzynce czekają nowe konta do zatwierdzenia, prośby o pochwałę i zgłoszenia uczniów.' },
      { target: '.topbar .tool-btn--help', title: 'Pomoc', text: 'Znak zapytania włącza tryb pomocy: kliknij dowolny przycisk, a powiem, co robi. Teraz możemy razem zbudować lekcję z każdym rodzajem slajdu – albo zakończ i wróć do samouczków później.', final: true, finalLabel: 'Dalej: tworzymy lekcję' },
    ],
  },

  'teacher-games': {
    roles: ['teacher', 'admin'], title: 'Gry: Saper i Hammer Game', desc: 'Jak działają obie gry, jak zbudować Sapera (zdarzenia, krzyżówka, katana) i Hammer Game (etapy) oraz jak zagrać w podglądzie.', min: 3,
    steps: () => {
      const B = teacherBase(state.user.role);
      const gamesList = B.admin ? '/administracja/gry' : '/nauczyciel/panel/gry';
      let saperId = null, hammerId = null;
      const ids = async () => {
        if (saperId) return;
        try { const r = await get('/api/editor/games'); saperId = r.games.find((x) => x.type === 'saper')?.id; hammerId = r.games.find((x) => x.type === 'hammer')?.id; } catch { /* nic */ }
      };
      return [
        { route: gamesList, before: ids, target: '.games-table, .tabpanel .empty, .admin__main .empty', title: 'Gry', text: 'Tu są Twoje gry. Uczniowie widzą opublikowane gry w przedmiocie, w zakładce „Gry”. Za pierwszą wygraną dostają punkty, które ustawiasz.' },
        { target: `a[href="${B.edit}/gra/nowa"]`, title: 'Stwórz grę', text: 'Wybierasz rodzaj gry, nazwę i przedmiot. Gra startuje z przykładowym układem, który zmienisz w edytorze.' },
        { title: 'Saper', text: 'Saper to rozbrajanie bomby w stylu Painta. Ustawiasz czas bomby i kolejność zdarzeń: przecinanie kabla, palnik z pytaniem pisemnym, trojan – czyli układanie w kolejności – krzyżówkę z kodem dostępu i oprogramowaniem bomby oraz usuwanie plików. Zdarzenia mogą się powtarzać. Jeden błąd oznacza wybuch.' },
        { before: async () => { await ids(); if (saperId) navigate(`${B.edit}/gra/${saperId}`); await sleep(900); }, target: '.ed__nav', title: 'Edytor Sapera', text: 'Po lewej są zdarzenia po kolei. Kliknij zdarzenie, żeby je edytować; strzałkami zmienisz kolejność. „Dodaj zdarzenie” dopisze nowe, a „Katana” to finał: pytania prawda czy fałsz albo A–D na 6 sekund.' },
        { before: async () => { const b = [...document.querySelectorAll('.ed-q')].find((x) => /Krzyżówka/.test(x.textContent)); b?.click(); await sleep(600); }, target: () => document.querySelector('.ge-cw-wrap') || document.querySelector('.ed__main'), title: 'Krzyżówka', text: 'Wpisz hasła, kliknij „Zaznacz pola” i klikaj pola w siatce po kolei – pierwsze kliknięte to pierwsza litera. Pola nie muszą być w linii. Potem zaznacz pola kodu dostępu: z ich liter powstaje hasło do oprogramowania bomby.' },
        { target: 'button::Zagraj (podgląd)', title: 'Zagraj w podglądzie', text: 'Zawsze możesz zagrać jak uczeń – bez punktów. Po wyjściu wrócisz do edytora.' },
        { before: async () => { await ids(); if (hammerId) navigate(`${B.edit}/gra/${hammerId}`); await sleep(900); }, target: '.ed__nav', title: 'Hammer Game', text: 'Hammer Game ma pięć etapów, które możesz włączać i wyłączać: kartki TAK lub NIE – z serią pięciu dobrych i powtórką w telewizyjnym stylu – żuki z odpowiedziami, pary na zdrapce, test młotkiem i stemple APPROVED albo DECLINED. Od 55 procent uczeń dostaje APPROVED.' },
        { target: () => document.querySelector('.ed__actions .btn--primary') || document.querySelector('.ed__actions'), title: 'Publikacja', text: 'Gdy wszystko jest gotowe, kliknij „Opublikuj” – uczniowie dostaną powiadomienie w skrzynce. Powodzenia!', final: true },
      ];
    },
  },

  'student-start': {
    roles: ['student'], title: 'Krótki przewodnik', desc: 'Przedmioty, Twój profil i punkty, ranking, Ustawienia (skrzynka, dźwięk, ustawienia ogólne) i pomoc.', min: 2, next: 'student-new',
    steps: () => [
      { title: `Cześć${state.user.firstName ? `, ${state.user.firstName}` : ''}!`, text: 'W dwie minuty pokażę Ci, co gdzie jest. Chcesz pominąć? Naciśnij Esc i kliknij „Pomiń samouczek”.' },
      { route: '/uczen/przedmioty', target: '.subjects', title: 'Przedmioty', text: 'To Twoje główne miejsce. Wybierz przedmiot: są tam lekcje, testy nauczające, egzaminacyjne, sprawdziany i gry – Saper i Hammer Game. Przedmioty bez materiałów są niżej, w „Pozostałych przedmiotach”.' },
      { target: () => document.querySelector('.daily') || document.querySelector('.subjects'), title: 'Dzienne pytania', text: 'Codziennie możesz wylosować jedno pytanie z każdego przedmiotu. Pierwsze pytanie dnia buduje serię: dobra odpowiedź daje tyle punktów, ile dni z rzędu odpowiadasz dobrze – jeden, dwa, trzy… Zła odpowiedź zeruje serię. Każde kolejne pytanie tego dnia to dwa punkty bonusu.' },
      { target: '.topbar .me-chip', title: 'Twój profil i punkty', text: 'Twoje profilowe i punkty to jeden przycisk. Kliknięcie otwiera Mój profil: ustawisz tam profilowe, ramkę, tytuł, muzykę i wygląd aplikacji, a na dole jest wejście do sklepu.' },
      { target: '.topbar .rank-chip', title: 'Ranking', text: 'Rankingi uczniów i Gwiazdy lekcji tygodnia.' },
      { target: '.topbar .settings-btn', action: 'click', title: 'Ustawienia', text: 'Wszystko inne jest w Ustawieniach. Kliknij – menu rozwinie się w tym miejscu.' },
      { target: '.settings-pop', title: 'Menu ustawień', text: 'Mój profil, Skrzynka – tu odbierasz punkty i nagrody, a liczba przy przycisku to nowe wiadomości – oraz Dźwięk. Dźwięk i Ustawienia ogólne rozwijają się na miejscu, bez przechodzenia na inną stronę.' },
      { before: async () => { const b = document.querySelector('.sm-item--fold[data-key="general"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); await sleep(700); },
        target: '.settings-pop', title: 'Ustawienia ogólne', text: 'Tu wybierasz, jak EDUKRO ma się do Ciebie zwracać, czy bierzesz udział w rankingach i którym nauczycielom udostępniasz wyniki – na początku wszystko jest włączone. Tu zmienisz też kod PIN.' },
      { before: () => closeSettings(), target: '.topbar .tool-btn--help', title: 'Pomoc i samouczki', text: 'Znak zapytania jest zawsze pod ręką: kliknij go, a potem dowolny przycisk, a powiem, co robi. Tam są też samouczki. I jeszcze jedno: przycisk „Wyjdź” na każdej stronie wraca do przedmiotów – a jeśli przyszłaś lub przyszedłeś z Ustawień, z powrotem je rozwija.', final: true, finalLabel: 'Dalej: Twój profil i rankingi' },
    ],
  },

  'student-new': {
    roles: ['student'], title: 'Twój profil, sklep i rankingi', desc: 'Profilowe, ramki, tytuły i muzyka; sklep z rozwijanymi działami; rankingi z zakładkami, Wygrani, koło fortuny i Gwiazda szkoły.', min: 2,
    steps: () => [
      { route: '/uczen/profil', target: '#p-profilowe', before: () => { const d = document.getElementById('p-profilowe'); if (d) d.open = true; }, title: 'Mój profil', text: 'Tu ustawiasz, jak widzą Cię inni. Kliknij profilowe albo ramkę – zapisuje się od razu. Każdy dział rozwijasz i zwijasz kliknięciem w nagłówek.' },
      { target: '#p-tytul', title: 'Tytuł, muzyka i wygląd', text: `Niżej są tytuł przy imieniu, na przykład „${state.user.firstName || 'Jan'} – Mistrz hulajnogi”, muzyka – gra też u każdego, kto otworzy Twój profil – efekt po teście, wygląd aplikacji, Twoje wyniki i historia punktów.` },
      { target: '.shop-cta', title: 'Sklep', text: 'Na dole strony jest sklep. Tam kupujesz nowe rzeczy, a tutaj je ustawiasz.' },
      { route: '/uczen/sklep', target: '.acc-list', title: 'Działy sklepu', text: 'Sklep ma rozwijane działy, więc nie trzeba długo przewijać. Kliknij dział, na przykład Ramki, a rozwinie się z cenami.' },
      { route: '/ranking', target: '.rk-tabs', title: 'Rankingi', text: 'Z boku wybierasz ranking. Domyślnie widzisz ranking ogólny, a po kliknięciu innej zakładki pokazuje się ona na całej stronie.' },
      { target: '.rk-main', title: 'Nagrody za prowadzenie', text: 'Kto prowadzi w rankingu ponad trzy dni, dostaje wyjątkowy tytuł i kręci kołem fortuny – od stu do siedmiuset pięćdziesięciu punktów. Kliknij osobę, żeby zobaczyć jej profil i posłuchać jej muzyki.' },
      { before: () => document.querySelector('.rk-tab[data-k="gwiazdy"]')?.click(), target: '.rk-main', title: 'Gwiazdy lekcji', text: 'Na koniec lekcji nauczyciel wybiera najaktywniejszą osobę: sto punktów i gwiazdka. W piątek o szesnastej osoba z największą liczbą gwiazdek zostaje Gwiazdą szkoły – ma tytuł i o jedną piątą więcej punktów przez tydzień.' },
      { title: 'Ranking każdego testu', text: 'Na ekranie startowym testu jest jego ranking. Kto pierwszy zdobędzie sto procent na pierwszym miejscu, trafia na zawsze do Wygranych i dostaje nagrodę za ukończenie podwójnie. Jeśli nie chcesz pokazywać się w rankingach, wyłączysz to w Ustawieniach. Powodzenia!', final: true },
    ],
  },
};

/* ---------- Uruchamianie ---------- */
async function saveTutorial(patch) {
  try {
    const r = await put('/api/me/tutorial', patch);
    if (state.user.role !== 'guest') state.user.tutorial = r.tutorial;
  } catch { /* stan samouczka nie jest krytyczny */ }
}

export function startChapter(key) {
  const ch = CHAPTERS[key];
  if (!ch) return;
  closeDialogs();
  runTour(ch.steps(), {
    id: key, title: ch.title,
    onEnd: (reason) => {
      if (reason === 'done') {
        saveTutorial({ done: [key], offered: true });
        sound.play('fanfare');
        if (ch.next && CHAPTERS[ch.next].roles.includes(state.user.role)) setTimeout(() => startChapter(ch.next), 500);
      } else if (reason === 'done-only') saveTutorial({ done: [key], offered: true });
      else if (reason === 'skip') saveTutorial({ offered: true });
    },
  });
}

export function chaptersFor(role) {
  return Object.entries(CHAPTERS).filter(([, c]) => c.roles.includes(role)).map(([key, c]) => ({ key, ...c }));
}

export function openTutorialMenu() {
  const role = state.user.role;
  if (role === 'guest') {
    return dialog({ iconName: 'play', title: 'Samouczki', body: [h('p', {}, 'Samouczki są dostępne po zalogowaniu. Do tego czasu kliknij „?”, a potem dowolny przycisk, żeby dowiedzieć się, co robi.')], actions: [{ label: 'Rozumiem', kind: 'primary' }] });
  }
  const done = new Set(state.user.tutorial?.done || []);
  const list = chaptersFor(role);
  const d = dialog({
    iconName: 'play', title: 'Samouczki',
    body: [h('p', {}, 'Każdy samouczek pokazuje krok po kroku, co kliknąć. Strzałka wskazuje przycisk, a lektor czyta podpowiedzi (wyciszysz go w dymku). Możesz przerwać w dowolnej chwili.'),
      h('div', { class: 'tut-list' }, ...list.map((c) => h('button', { class: ['tut-item', done.has(c.key) && 'is-done'], type: 'button', 'data-help-ui': '', onClick: () => { d.close(); setTimeout(() => startChapter(c.key), 200); } },
        h('span', { class: 'tut-item__icon' }, icon(done.has(c.key) ? 'check' : 'play')),
        h('span', { class: 'tut-item__body' }, h('b', {}, c.title), h('small', {}, c.desc)),
        h('span', { class: 'tut-item__min' }, `~${c.min} min`))))],
    actions: [{ label: 'Zamknij', kind: 'quiet' }],
  });
  return d;
}

let offering = false;
/** Przy pierwszym wejściu do panelu (albo do przedmiotów u ucznia) proponujemy samouczek. */
export function maybeOfferTutorial(user, path) {
  if (offering || tourActive() || !user || user.role === 'guest' || user.mustChangeCode) return;
  const t = user.tutorial || {};
  if (t.offered || t.off) return;
  const where = { teacher: /^\/nauczyciel\/panel/, admin: /^\/administracja\/[a-z]/, student: /^\/uczen\/(przedmioty|profil)$/ }[user.role];
  if (!where || !where.test(path)) return;
  if (document.querySelector('dialog[open]')) return;
  offering = true;
  const first = { teacher: 'teacher-start', admin: 'admin-start', student: 'student-start' }[user.role];
  const text = {
    teacher: 'Pokażę Ci panel, a potem razem zbudujemy lekcję z każdym rodzajem slajdu i test z każdym rodzajem pytania. Strzałki wskażą, co kliknąć, a lektor przeczyta podpowiedzi. Każdy rozdział możesz przerwać i wrócić do niego później.',
    admin: 'Pokażę Ci sekcje panelu: zatwierdzanie kont, punkty bez limitu, ceny i promocje w sklepie. Potem możesz przejść do samouczków tworzenia lekcji i testów.',
    student: 'W minutę pokażę Ci, gdzie są punkty, sklep i skrzynka.',
  }[user.role];
  dialog({
    iconName: 'play', title: user.role === 'student' ? `Cześć, ${user.firstName}! Pokazać, co gdzie jest?` : 'Witaj w EDUKRO! Chcesz samouczek?',
    body: [h('p', {}, text), h('p', { class: 'small muted' }, 'Samouczki uruchomisz też później: przycisk „?” na górze → „Samouczki”.')],
    actions: [
      { label: 'Nie pokazuj więcej', kind: 'quiet', onClick: () => { saveTutorial({ offered: true, off: true }); } },
      { label: 'Później', kind: 'ghost', onClick: () => { saveTutorial({ offered: true }); } },
      { label: user.role === 'student' ? 'Pokaż' : 'Zaczynamy!', kind: 'primary', onClick: () => { saveTutorial({ offered: true }); setTimeout(() => startChapter(first), 250); } },
    ],
    onClose: () => { offering = false; },
  });
}
