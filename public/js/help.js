// Tryb pomocy („?”): kliknij dowolny przycisk, a EDUKRO powie, co on robi (tekst + lektor).
// Opis pochodzi z atrybutu data-help, a gdy go nie ma – ze słownika przycisków poniżej.
import { h, icon, raise } from './ui.js';
import * as sound from './sound.js';
import { openTutorialMenu } from './tutorials.js';

/* ---------- Słownik: etykieta przycisku → co robi ---------- */
const LABELS = {
  // ogólne
  'ekran główny': 'Powrót na ekran główny EDUKRO (wybór: uczeń albo nauczyciel).',
  'wyloguj': 'Wylogowanie z EDUKRO na tym urządzeniu.',
  'wyloguj się': 'Wylogowanie z EDUKRO na tym urządzeniu.',
  'zaloguj się': 'Logowanie do EDUKRO – imię, nazwisko i kod PIN.',
  'utwórz konto': 'Zakładanie konta ucznia: imię, nazwisko z listy szkoły i własny kod PIN. Konto zatwierdza administrator.',
  'przeglądaj jako gość': 'Oglądanie przedmiotów i materiałów bez logowania. Żeby rozwiązywać testy i zbierać punkty, trzeba się zalogować.',
  'jestem uczniem': 'Wejście do części dla uczniów: przedmioty, lekcje, testy, sprawdziany, sklep.',
  'jestem nauczycielem': 'Logowanie nauczyciela: lekcje, testy, wyniki uczniów, pochwały i punkty.',
  'pomiń animację': 'Od razu pokazuje gotowe logo i przyciski.',
  'skrzynka': 'Skrzynka z wiadomościami: nowe testy i lekcje, punkty i nagrody do odebrania, sprawy do załatwienia.',
  'sklep': 'Sklep EDUKRO: kolory, czcionki, koła ratunkowe i pochwała od wychowawcy – za punkty.',
  'dźwięk': 'Ustawienia dźwięku: głośność, kliknięcia, efekty, kreda przy logo, muzyka w tle i lektor.',
  'mój profil': 'Twój profil: punkty, wyniki, udostępnianie wyników i ustawienia konta.',
  'przejdź do przedmiotów': 'Lista przedmiotów – wybierz, z czym chcesz dziś pracować.',
  'zmień kod pin': 'Zmiana Twojego kodu PIN. Najpierw podajesz obecny kod.',
  'wygląd aplikacji': 'Ustawienia wyglądu EDUKRO – kolory i czcionki kupione w sklepie.',
  // panel nauczyciela
  'przegląd': 'Podsumowanie: Twoje przedmioty i liczba opublikowanych materiałów.',
  'lekcje': 'Lista Twoich lekcji: tworzenie, edycja, prowadzenie na tablicy i publikowanie dla klas.',
  'testy i sprawdziany': 'Lista testów nauczających, egzaminacyjnych i sprawdzianów – tworzenie, edycja, podgląd.',
  'testy': 'Lista testów nauczających, egzaminacyjnych i sprawdzianów.',
  'wyniki uczniów': 'Wyniki uczniów z Twoich przedmiotów (pierwsze zaliczenie egzaminu zawsze, inne – gdy uczeń udostępnia).',
  'pochwały': 'Prośby uczniów o pochwałę kupione w sklepie – decydujesz, czy ją przyznać (odmowa zwraca punkty).',
  'materiały': 'Stan materiałów w przedmiotach: ile jest opublikowanych, a ile w przygotowaniu.',
  'ustawienia konta': 'Forma zwracania się do Ciebie („zrobiłeś” / „zrobiłaś”) i zmiana kodu dostępu.',
  'punkty': 'Przyznawanie punktów uczniom. Nauczyciel: raz dziennie, łącznie do 100 pkt. Administrator: bez limitu.',
  'przyznaj punkty': 'Otwiera okno przyznawania punktów: wybierasz uczniów, liczbę punktów i krótką wiadomość. Punkty trafią do ich skrzynek.',
  'przyznaj': 'Wysyła punkty wybranym uczniom – czekają w ich skrzynce do odebrania.',
  'odejmij punkty': 'Administrator: odejmuje punkty wybranym uczniom (saldo nie spada poniżej zera). Uczeń dostaje wiadomość z powodem.',
  'odejmij': 'Odejmuje punkty zaznaczonym uczniom – od razu, z ich konta.',
  'dodaj punkty': 'Przełącza okno na przyznawanie punktów.',
  'zapisz nagrody': 'Zapisuje nowe nagrody punktowe: za oceny ze sprawdzianu, na lekcjach i domyślne dla nowych testów.',
  'przywróć domyślne': 'Przywraca ustawienia fabryczne EDUKRO.',
  'kopiuj': 'Tworzy kopię, którą możesz zmieniać niezależnie od oryginału. Kopię lekcji lub testu z samouczka opublikujesz po wprowadzeniu zmian.',
  'kopiuj, aby opublikować': 'Materiału z samouczka nie można opublikować – ten przycisk tworzy kopię. Wprowadź w niej choć małą zmianę i opublikuj ją.',
  'kopiuj lekcję': 'Tworzy kopię lekcji, którą możesz zmieniać i opublikować.',
  'kopiuj test': 'Tworzy kopię testu, którą możesz zmieniać i opublikować.',
  'usuń lekcję': 'Usuwa lekcję. Nauczyciel może usuwać tylko swoje lekcje, administrator – wszystkie.',
  'usuń test': 'Usuwa test. Nauczyciel może usuwać tylko swoje testy, administrator – wszystkie.',
  'wpisz za mnie': 'Samouczek wpisze przykładową treść za Ciebie – potem możesz ją zmienić.',
  'wybierz za mnie': 'Samouczek wybierze przykładową wartość za Ciebie.',
  'stwórz lekcję': 'Tworzy nową lekcję: nadajesz nazwę i przedmiot, a potem dodajesz slajdy. Klasę wybierasz dopiero przy prowadzeniu.',
  'stwórz pierwszą lekcję': 'Tworzy nową lekcję: nadajesz nazwę i przedmiot, a potem dodajesz slajdy.',
  'stwórz test': 'Tworzy nowy test: wybierasz rodzaj (nauczający, egzaminacyjny, sprawdzian), nazwę i liczbę pytań.',
  'stwórz test lub sprawdzian': 'Tworzy nowy test nauczający, egzaminacyjny albo sprawdzian.',
  'stwórz pierwszy test': 'Tworzy nowy test: wybierasz rodzaj, nazwę i liczbę pytań.',
  'prowadź': 'Prowadzenie lekcji na tablicy. Najpierw wybierasz klasę – z niej losowani są uczniowie do koła fortuny i gier. Gdy dojdziesz do końca, lekcja sama pojawi się uczniom tej klasy.',
  'prowadź lekcję': 'Prowadzenie lekcji na tablicy z wybraną klasą. Po dojściu do końca uczniowie tej klasy zobaczą lekcję u siebie.',
  'opublikuj dla': 'Wybierasz klasy, które mają widzieć lekcję – bez prowadzenia jej na tablicy. Odznaczenie klasy ukrywa przed nią lekcję.',
  'opublikuj dla…': 'Wybierasz klasy, które mają widzieć lekcję – bez prowadzenia jej na tablicy. Odznaczenie klasy ukrywa przed nią lekcję.',
  'edytuj': 'Otwiera edytor – zmiany zapisują się same.',
  'podgląd': 'Pokazuje materiał oczami ucznia. Wyniki i punkty nie są zapisywane.',
  'podgląd ucznia': 'Rozwiązujesz test jak uczeń – bez zapisywania wyników i punktów.',
  'opublikuj': 'Udostępnia materiał uczniom. Przed publikacją EDUKRO sprawdza, czy wszystko jest uzupełnione.',
  'opublikuj test': 'Udostępnia test uczniom i wysyła im powiadomienie do skrzynki.',
  'opublikuj lekcję': 'Udostępnia lekcję wybranym klasom.',
  'wycofaj publikację': 'Ukrywa materiał przed uczniami (wyniki zostają).',
  'usuń': 'Usuwa element. Materiały, które uczniowie już rozwiązywali, trafiają do archiwum, żeby wyniki nie przepadły. Nauczyciel usuwa tylko swoje lekcje i testy.',
  'kopia': 'Tworzy kopię – przydatne, gdy chcesz zrobić podobny materiał.',
  'utwórz kopię': 'Tworzy kopię – przydatne, gdy chcesz zrobić podobny materiał.',
  'wszystkie lekcje': 'Powrót do listy lekcji.',
  'wszystkie testy': 'Powrót do listy testów.',
  'wszystkie slajdy': 'Lista wszystkich slajdów lekcji – zmienisz kolejność, skopiujesz albo usuniesz slajd.',
  'wszystkie pytania': 'Lista wszystkich pytań testu – zmienisz kolejność, skopiujesz albo usuniesz pytanie.',
  'ustawienia lekcji': 'Nazwa, przedmiot i opis lekcji.',
  'ustawienia testu': 'Nazwa, rodzaj testu, punkty, losowanie pytań, test tymczasowy i nagroda.',
  'dodaj slajd': 'Dodaje nowy slajd – wybierasz rodzaj: tytułowy, informacyjny, do przepisania, pytanie, fiszki, burza mózgów, koło fortuny albo gra.',
  'dodaj kolejny slajd': 'Dodaje nowy slajd na końcu lekcji.',
  'dodaj pytanie': 'Dodaje nowe, puste pytanie – potem wybierasz jego rodzaj.',
  'sprawdź lekcję': 'Lista rzeczy do uzupełnienia przed publikacją – kliknięcie przenosi do miejsca z błędem.',
  'sprawdź test': 'Lista rzeczy do uzupełnienia przed publikacją – kliknięcie przenosi do pytania z błędem.',
  'wyodrębnij z innych materiałów': 'Kopiuje wybrane pytania z innych testów, sprawdzianów i lekcji do tego testu.',
  'wyodrębnij pytania': 'Kopiuje wybrane pytania z innych testów, sprawdzianów i lekcji.',
  'slajdy z pytań z testów': 'Zamienia wybrane pytania z testów na slajdy z pytaniem.',
  'dodaj pytania z testów': 'Dodaje do gry pytania z Twoich testów (zamienione na pytania ustne).',
  'przejdź do slajdów': 'Przechodzi do listy slajdów lekcji.',
  'przejdź do pytań': 'Przechodzi do listy pytań testu.',
  'następny slajd': 'Przechodzi do edycji następnego slajdu.',
  'poprzedni': 'Wraca do poprzedniego elementu.',
  'podgląd tego slajdu': 'Pokazuje ten slajd tak, jak zobaczy go klasa na tablicy.',
  'zmień rodzaj pytania': 'Zmienia typ pytania (treść zostaje, odpowiedzi trzeba wpisać od nowa).',
  'konto testowe ucznia': 'Tworzy konto „Uczeń Testowy”, żeby sprawdzić testy dokładnie tak, jak uczeń.',
  // prowadzenie lekcji
  'zakończ': 'Kończy prowadzenie i wraca do listy lekcji.',
  'dalej': 'Następny slajd albo następny element slajdu.',
  'pokaż dalej': 'Pokazuje kolejny element slajdu (tekst pojawiający się na kliknięcie).',
  'pełny ekran': 'Włącza pełny ekran – najlepiej na tablicy interaktywnej.',
  'start': 'Uruchamia pasek czasu na przepisanie notatki.',
  'zakręć kołem': 'Losuje ucznia klasy. Za dobrą odpowiedź (przycisk „Dobrze”) dostanie punkty.',
  'dobrze': 'Odpowiedź poprawna – uczeń dostaje punkty (trafią do jego skrzynki).',
  'źle': 'Odpowiedź błędna – bez punktów.',
  'pokaż odpowiedź': 'Odsłania odpowiedź na pytanie (widzi ją cała klasa).',
  'przywróć wylosowanych': 'Wraca na koło osoby, które już odpowiadały.',
  'losuj od nowa': 'Losuje drużyny jeszcze raz.',
  'zaczynamy grę!': 'Startuje grę klasową z wylosowanymi drużynami.',
  'zakończ grę wcześniej': 'Kończy grę – wygrywa drużyna z większą liczbą punktów.',
  'odwróć wszystkie': 'Odwraca wszystkie fiszki naraz.',
  'od początku': 'Wraca do pierwszego slajdu.',
  // uczeń: testy
  'zaczynamy!': 'Rozpoczyna test. Zasady są wypisane powyżej.',
  'kontynuuj': 'Wraca do rozpoczętego testu w miejscu, w którym nastąpiła przerwa.',
  'rozpocznij': 'Otwiera ekran startowy testu z zasadami.',
  'sprawdź': 'Sprawdza Twoją odpowiedź.',
  'zapisz i dalej': 'Zapisuje odpowiedź w sprawdzianie i przechodzi dalej (wynik poznasz na końcu).',
  'zakończ i sprawdź': 'Kończy sprawdzian – zobaczysz ocenę i co warto powtórzyć.',
  'podpowiedź': 'Pokazuje podpowiedź nauczyciela do tego pytania.',
  'koło ratunkowe': 'Duża pomoc w trudnym pytaniu (np. 50/50 albo część odpowiedzi). Zużywa jedno koło ze sklepu.',
  'zakończ test': 'Przerywa test. W egzaminie liczy się to jak przegrana (20 min przerwy).',
  'zobacz wynik': 'Pokazuje podsumowanie testu.',
  'rozwiąż jeszcze raz': 'Zaczyna test od nowa.',
  'wróć do przedmiotu': 'Powrót do listy materiałów z tego przedmiotu.',
  'otwórz lekcję': 'Otwiera lekcję do samodzielnej nauki – możesz odpowiadać na pytania ze slajdów.',
  'popraw ocenę': 'Kolejne podejście do sprawdzianu – liczy się najlepsza ocena.',
  // sklep i skrzynka
  'odbierz nagrodę': 'Odbiera nagrodę za test – przedmiot trafi do Twojego wyglądu albo zacznie działać promocja.',
  'odbierz': 'Odbiera punkty – od razu pojawią się na Twoim koncie.',
  'odbierz wszystko': 'Odbiera naraz wszystkie punkty i nagrody czekające w skrzynce.',
  'oznacz jako przeczytane': 'Oznacza wiadomości jako przeczytane.',
  'zapisz wygląd': 'Zapisuje wybrane kolory i czcionkę – zobaczysz je na każdym ekranie.',
  'przywróć domyślny': 'Przywraca domyślny wygląd EDUKRO (zakupy zostają).',
  'wróć': 'Powrót do poprzedniego ekranu.',
  // administrator
  'rejestr uczniów': 'Lista uczniów szkoły z klasami. Tylko osoby z rejestru mogą założyć konto.',
  'konta': 'Konta uczniów i nauczycieli: zatwierdzanie, blokowanie, reset dostępu.',
  'nauczyciele': 'Konta nauczycieli, ich przedmioty i wychowawstwo.',
  'przedmioty': 'Przedmioty w EDUKRO: nazwa, kolor, widoczność i nauczyciele.',
  'zgłoszenia': 'Zgłoszenia uczniów, którzy nie mogą założyć konta albo się zalogować.',
  'ustawienia': 'Kod administratora i informacje o konfiguracji.',
  'zatwierdź': 'Zatwierdza konto ucznia – od teraz może wydawać punkty.',
  'odrzuć': 'Odrzuca i usuwa konto (np. gdy założył je ktoś inny).',
  'zablokuj': 'Blokuje konto – osoba nie zaloguje się, dopóki go nie odblokujesz.',
  'odblokuj': 'Odblokowuje konto.',
  'reset dostępu': 'Wydaje jednorazowy kod resetu (uczeń) albo kod tymczasowy (nauczyciel).',
  'dodaj do rejestru': 'Dodaje ucznia do listy szkoły – będzie mógł założyć konto.',
  'dodaj nauczyciela': 'Tworzy konto nauczyciela z kodem tymczasowym.',
  'dodaj przedmiot': 'Dodaje nowy przedmiot.',
  'nowa promocja': 'Tworzy promocję w sklepie: przedmiot, zniżka i czas trwania (godzina, dzień, tydzień…). Uczniowie dostaną powiadomienie.',
  'utwórz promocję': 'Zapisuje promocję – od razu zaczyna działać w sklepie.',
  'zakończ teraz': 'Kończy promocję przed czasem.',
  'zapisz ceny': 'Zapisuje nowe ceny w sklepie.',
  'samouczki': 'Lista samouczków – każdy pokazuje krok po kroku, jak coś zrobić w EDUKRO.',
};
const SELECTORS = [
  ['.topbar__logo', 'Logo EDUKRO – kliknięcie wraca na ekran główny.'],
  ['.crumbs a', 'Ścieżka – kliknij, aby wrócić do wcześniejszego miejsca.'],
  ['.pts-chip', 'Twoje punkty. Zdobywasz je za testy, sprawdziany i na lekcjach – wydajesz w sklepie.'],
  ['.me-chip', 'Twój profil i punkty: profilowe, ramka, tytuł, muzyka i wygląd aplikacji. Na dole tej strony jest sklep.'],
  ['.bell', 'Skrzynka z wiadomościami i nagrodami do odebrania.'],
  ['.subject', 'Przedmiot – otwiera lekcje, testy i sprawdziany z tego przedmiotu.'],
  ['.cat', 'Rodzaj materiałów w przedmiocie: lekcje, testy nauczające, egzaminacyjne, sprawdziany, gry.'],
  ['.shop-item', 'Przedmiot w sklepie – kup go za punkty, a potem ustaw w „Mój wygląd”.'],
  ['.present__dot', 'Skok do wybranego slajdu.'],
  ['.ed-q', 'Przejście do edycji tego elementu. Kolor kropki: zielony – gotowe, czerwony – do uzupełnienia.'],
  ['.q-card__main', 'Otwiera ten element do edycji.'],
  ['.type-card', 'Wybór rodzaju – kliknij, aby dodać.'],
  ['.kind-card', 'Wybór rodzaju. Opis pod nazwą mówi, czym się różni.'],
  ['.msg', 'Wiadomość w skrzynce.'],
  ['.item--temp', 'Test tymczasowy – zniknie z listy po upływie czasu. Rozwiąż go, zanim zniknie!'],
  ['.role', 'Wybierz, kim jesteś w EDUKRO.'],
  ['.welcome__logo', 'Logo EDUKRO.'],
];

const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[\d+−-]+\s*pkt.*$/i, '').replace(/\(\d+\)/g, '').trim().toLocaleLowerCase('pl-PL').replace(/[.:!?]+$/, '');
function labelOf(el) {
  return (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
}
export function explain(el) {
  const own = el.closest('[data-help]');
  const label = labelOf(el).slice(0, 80) || labelOf(own || el).slice(0, 80);
  if (own) return { label: label || 'Element', text: own.getAttribute('data-help') };
  const key = norm(label);
  if (LABELS[key]) return { label, text: LABELS[key] };
  for (const [k, v] of Object.entries(LABELS)) if (key && key.length > 3 && (key.startsWith(`${k} `) || key.startsWith(k))) return { label, text: v };
  for (const [sel, text] of SELECTORS) if (el.closest(sel)) return { label: label || 'Element', text };
  const tag = el.tagName.toLowerCase();
  if (el.matches('[role="tab"]')) return { label, text: `Zakładka „${label}” – przełącza widok na tę część.` };
  if (tag === 'input' || tag === 'textarea') {
    const lab = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : el.closest('label, .field')?.querySelector('.field__label')?.textContent;
    return { label: (lab || label || 'Pole').trim(), text: el.type === 'checkbox' ? 'Pole do zaznaczenia – włącza albo wyłącza tę opcję.' : `Pole do wpisania${lab ? `: ${lab.trim().toLocaleLowerCase('pl-PL')}` : ''}.` };
  }
  if (tag === 'select') return { label: label.slice(0, 40), text: 'Lista do wyboru – kliknij i wybierz jedną z opcji.' };
  if (tag === 'a') return { label, text: `Przejście do: ${label}.` };
  return { label: label || 'Element', text: label ? `Przycisk „${label}”.` : 'Ten element nie ma jeszcze opisu.' };
}

/* ---------- Tryb pomocy ---------- */
let active = false, banner = null, bubble = null, hoverEl = null;
document.addEventListener('edukro:help-toggle', () => toggleHelp());
export const helpActive = () => active;
const TARGET = 'button, a, [role="tab"], input, select, textarea, label.switch, .shop-item, .msg, .item, .subject, .cat, [data-help]';

export function toggleHelp(on = !active) {
  if (on === active) return;
  active = on;
  document.body.classList.toggle('help-mode', on);
  document.querySelectorAll('.tool-btn--help').forEach((b) => b.classList.toggle('is-on', on));
  if (on) {
    sound.play('whoosh');
    banner = h('div', { class: 'help-banner', role: 'status' },
      icon('help'), h('span', {}, h('b', {}, 'Tryb pomocy. '), 'Kliknij dowolny przycisk, a powiem, co robi.'),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-help-ui': '', onClick: () => { toggleHelp(false); openTutorialMenu(); } }, icon('play'), 'Samouczki'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-help-ui': '', onClick: () => toggleHelp(false) }, 'Zakończ (Esc)'));
    document.body.append(banner);
    raise(banner);
    document.addEventListener('edukro:dialog-open', onDialog);
    document.addEventListener('edukro:dialog-close', onDialog);
    addEventListener('mousedown', onDown, true);
    addEventListener('click', onClick, true);
    addEventListener('pointerover', onOver, true);
    addEventListener('keydown', onKey, true);
    sound.speak('Tryb pomocy. Kliknij dowolny przycisk, a powiem, co robi.');
  } else {
    banner?.remove(); banner = null;
    closeBubble();
    hoverEl?.classList.remove('help-hover'); hoverEl = null;
    removeEventListener('click', onClick, true);
    removeEventListener('mousedown', onDown, true);
    document.removeEventListener('edukro:dialog-open', onDialog);
    document.removeEventListener('edukro:dialog-close', onDialog);
    removeEventListener('pointerover', onOver, true);
    removeEventListener('keydown', onKey, true);
    sound.stopSpeaking();
  }
}
function candidate(t) {
  if (!(t instanceof Element)) return null;
  if (t.closest('[data-help-ui], .help-bubble, .help-banner')) return null;
  return t.closest(TARGET);
}
function onOver(e) {
  const el = candidate(e.target);
  if (el === hoverEl) return;
  hoverEl?.classList.remove('help-hover');
  hoverEl = el;
  el?.classList.add('help-hover');
}
function onDialog() { setTimeout(() => { raise(banner); if (bubble) raise(bubble); }, 30); }
/* pola wyboru i tekstowe nie otwierają się w trybie pomocy */
function onDown(e) { if (e.target.closest('[data-help-ui], .help-bubble, .help-banner')) return; if (candidate(e.target)) e.preventDefault(); }
function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleHelp(false); } }
function onClick(e) {
  const t = e.target;
  if (t.closest('[data-help-ui]')) return; // przyciski samego trybu pomocy działają normalnie
  if (t.closest('.tool-btn--help')) { e.preventDefault(); e.stopPropagation(); toggleHelp(false); return; }
  const el = candidate(t);
  e.preventDefault(); e.stopImmediatePropagation();
  if (!el) { closeBubble(); return; }
  showBubble(el, explain(el));
}
function closeBubble() { bubble?.remove(); bubble = null; document.querySelectorAll('.help-target').forEach((x) => x.classList.remove('help-target')); }
function showBubble(el, { label, text }) {
  closeBubble();
  el.classList.add('help-target');
  sound.play('pop');
  bubble = h('div', { class: 'help-bubble', role: 'dialog', 'aria-label': `Pomoc: ${label}` },
    h('div', { class: 'help-bubble__head' }, icon('help'), h('b', {}, label.length > 60 ? `${label.slice(0, 58)}…` : label),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zamknij', 'data-help-ui': '', onClick: closeBubble }, icon('x'))),
    h('p', {}, text),
    sound.canSpeak() ? h('button', { class: 'linkish help-bubble__say', type: 'button', 'data-help-ui': '', onClick: () => sound.speak(text, { force: true }) }, icon('volume'), 'Przeczytaj na głos') : null);
  document.body.append(bubble);
  raise(bubble);
  const r = el.getBoundingClientRect();
  const bw = Math.min(340, innerWidth - 24);
  bubble.style.width = `${bw}px`;
  const bh = bubble.offsetHeight;
  let top = r.bottom + 12, arrow = 'top';
  if (top + bh > innerHeight - 12) { top = r.top - bh - 12; arrow = 'bottom'; }
  top = Math.max(12, Math.min(top, innerHeight - bh - 12));
  const left = Math.max(12, Math.min(r.left + r.width / 2 - bw / 2, innerWidth - bw - 12));
  bubble.style.top = `${top}px`; bubble.style.left = `${left}px`;
  bubble.style.setProperty('--ax', `${Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - left))}px`);
  bubble.classList.add(`arrow-${arrow}`);
  sound.speak(`${label}. ${text}`);
}
