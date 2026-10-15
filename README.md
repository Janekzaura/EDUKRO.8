# EDUKRO

Aplikacja edukacyjna Samorządowej Szkoły Podstawowej im. Polskich Noblistów w Nowym Folwarku.
Etap 1: wygląd, ekran powitalny z kaligraficznym logo, konta uczniów, nauczycieli i administratora.
Etap 2: testy nauczające i egzaminacyjne – edytor (15 rodzajów pytań), rozwiązywanie, punkty.
Etap 3: lekcje (slajdy, koło fortuny, gry klasowe), sprawdziany z oceną 1–6, wyodrębnianie pytań,
losowanie pytań z puli, nowa rejestracja uczniów z zatwierdzaniem, sklep z wyglądem i kołami ratunkowymi.
Etap 4 (0.4): interaktywne samouczki z lektorem i tryb pomocy „?”, dźwięki (kreda przy logo, efekty, muzyka),
skrzynka powiadomień z punktami i nagrodami do odebrania, przyznawanie punktów przez nauczyciela i administratora,
ceny i promocje czasowe w sklepie, nagrody za testy i testy tymczasowe, lekcje wspólne dla wszystkich klas.
Wersja 0.4.1: formy żeńskie i męskie („zrobiłaś” / „zrobiłeś”), samouczki z każdym rodzajem slajdu i pytania,
lekcje i testy z samouczka (bez publikacji), usuwanie tylko własnych materiałów, odejmowanie punktów, nagrody punktowe.
Wersja 0.5: profil ucznia (profilowe, ramki, tytuły, muzyka, efekty), pakiety administratora, rankingi testów
z Wygranymi, ranking ogólny z tytułami i kołem fortuny, Gwiazda lekcji i Gwiazda szkoły, podgląd lekcji na żywo,
szybkie dodawanie uczniów do rejestru.
Wersja 0.5.1: porządki – mniej przycisków i przewijania u ucznia (menu „Ustawienia”, jeden przycisk profilu,
sklep z rozwijanymi działami, rankingi w zakładkach), przycisk „Wyjdź” wszędzie, udział w rankingach do wyboru.

## Poprawki w wersji 0.7.1

- **Saper – katana:** cięcie pojawia się teraz dokładnie tam, gdzie ruszasz myszką (przytrzymaj lewy lub prawy przycisk). Ostrze katany podąża za kursorem, a ślad cięcia na bombie powtarza prawdziwą drogę myszki. Poprzednio linia była liczona w trakcie animacji wejścia ekranu, przez co cięcie lądowało obok.
- **Hammer Game:** czerwona kropka pokazuje dokładnie, gdzie uderzy młotek.
- **Hammer Game – APPROVED / DECLINED:** stempel zawsze odpowiada wybranej akcji i zostaje na kartce. Prawy przycisk = zawsze DECLINED; lewy = strona wybrana na młotku (domyślnie APPROVED). Wcześniej na komputerze lewy przycisk nadpisywał przełącznik i stawiał APPROVED.

## Nowości w wersji 0.7 – GRY

| Co | Jak działa |
|---|---|
| **Saper** | Rozbrajanie bomby w stylu Painta (stickman w kasku, kilka klatek animacji, drgające kreski). Nauczyciel ustawia **czas bomby** i **kolejność zdarzeń** (mogą się powtarzać): **Przetnij kabel** (pytanie + 3–5 kabli z odpowiedziami), **Palnik** (uczeń rysuje kwadrat, palnik wycina otwór, na blaszce pytanie pisemne), **Programowanie – trojan** (układanie w kolejności na pionowym kablu, potem wirus wchodzi do bomby), **Krzyżówka i oprogramowanie** (pola hasła zaznaczasz po kolei – nie muszą być w linii; litery z pól kodu tworzą **kod dostępu**, po którym uczeń wchodzi do neonowego „BOMB-OS” i wykonuje 3 kroki: odpowiedź pisemna, tabela, prawda/fałsz), **Usuwanie plików** (4 pytania, 16 plików – trzeba usunąć 12 pułapek). Na koniec zawsze **katana**: pierwsze uderzenie nic nie daje, zegar startuje od nowa, widok oczami sapera, cięcia po liniach i pytania na **6 sekund**, a bomba rozpada się w pył w zwolnionym tempie. **Jeden błąd = wybuch** (wyjątek: literówka przy wpisywaniu krzyżówki i kodu). |
| **Hammer Game** | Gra na spryt i szybkość z młotkiem 3D (lewy przycisk / dotknięcie = uderzenie; nic nie jest zwykłym przyciskiem). Etapy (każdy można wyłączyć): **Kartki** TAK/NIE albo A–D w losowych miejscach – seria **5 dobrych** zwalnia czas i daje **5 kartek naraz na 20 s**, a po sukcesie **INSTANT REPLAY**; **Żuki** z literami chodzą po ekranie (ruszają oczami, odlatują po trafieniu, ściąga liter w lewym dolnym rogu); **Pary** – trafiona para wybucha i zdrapuje ekran, a resztę rozbijasz młotkiem; **Test** – 6 pytań A–D na kartce, procent i ocena w kółku, w które trzeba uderzyć; **APPROVED / DECLINED** – lewy przycisk to stempel APPROVED, prawy DECLINED (na telefonie przełącznik), na końcu podpis szlaczkiem i **chwila prawdy**: od **55%** APPROVED (jasno, muzyka), poniżej DECLINED (ciemno, smutna melodia). Liczy się pierwsze uderzenie w każde pytanie. |
| **Edytor gier** | Nauczyciel: Panel → **Lekcje, testy i gry** → **Gry** (albo Przegląd → **Stwórz grę**); administrator: sekcja **Gry**. Zapis automatyczny, podpowiedzi „do uzupełnienia”, **Zagraj (podgląd)** bez punktów, publikacja z powiadomieniem uczniów, kopiowanie i usuwanie. Punkty za pierwszą wygraną ustawia nauczyciel (Hammer Game: część punktów zależna od procentu). Wyniki gier trafiają do „Wyniki uczniów”. |
| **Gry u ucznia** | Przedmiot → zakładka **Gry**: ekran z zasadami, gra na pełnym ekranie, „Zagraj jeszcze raz”. Odpowiedzi sprawdza serwer – nie da się ich podejrzeć w przeglądarce. |
| **Przykładowe gry** | Od razu po uruchomieniu w **Chemii** są opublikowane dwie gry: „Saper: bomba w laboratorium” (kod krzyżówki: SODA) i „Hammer Game: chemia na szybko”. |
| **Porządki w panelu nauczyciela** | Zakładki: Przegląd · **Lekcje, testy i gry** (w środku przełącznik) · Dzienne pytania · Wyniki uczniów · Pochwały · Punkty. Przyciski **Stwórz lekcję / test / grę** są tylko w Przeglądzie. Usunięte: zakładki „Materiały” i „Ustawienia konta” oraz przycisk „Samouczki” (samouczki są pod **?** → Samouczki). **Zmiana kodu dostępu**: Ustawienia → Ustawienia ogólne → „Zmień kod dostępu” – w okienku, jak u ucznia. |
| **Samouczki** | Nowy rozdział „Gry: Saper i Hammer Game”, zaktualizowane „Pierwsze kroki” (nowe zakładki, Esc zamiast przycisku na górze). |

## Poprawki w wersji 0.6.1
- Podgląd na żywo w edytorze lekcji wygląda tak samo jak zwykły podgląd i odświeża się przy każdej zmianie. Kliknięcie go otwiera zwykły podgląd tego slajdu, a „Wyjdź z podglądu” wraca do edytora tego samego slajdu.
- Samouczek: Esc już go nie kończy – na 3 sekundy pokazuje przycisk „Pomiń samouczek” (który nie zasłania już przycisków na stronie).
- Samouczek: usunięty przycisk „Pomiń krok” (psuł kolejność kroków).

## Nowości w wersji 0.6

| Co | Jak działa |
|---|---|
| **Dzienne pytania** | Nauczyciel: Panel → **Dzienne pytania** – w każdym przedmiocie dowolnie wiele pytań (każdego rodzaju, nie muszą dotyczyć bieżącego tematu; przełącznik wyłącza pytanie z losowania). Uczeń: na górze listy przedmiotów pasek **Dzienne pytania** – raz dziennie losuje jedno pytanie z każdego przedmiotu (wylosowane pytanie nie zmienia się do północy). **Seria**: liczy się **pierwsze** dzienne pytanie dnia – dobra odpowiedź przedłuża serię i daje tyle punktów, ile wynosi seria (1, 2, 3… pkt); zła odpowiedź albo opuszczony dzień zeruje serię. Każde **kolejne** dzienne pytanie tego dnia (z innych przedmiotów) daje **+2 pkt** i nie zmienia serii. Na start są przykładowe pytania z chemii i biologii. |
| **Zadanie na słuch** | Nowy, 15. rodzaj pytania (testy, lekcje, dzienne pytania): lektor czyta słowo albo zdanie – po polsku, angielsku, niemiecku, francusku, hiszpańsku, włosku lub rosyjsku – a uczeń zapisuje, co usłyszał. Można słuchać wiele razy, także **wolniej**. Wielkość liter i znaki interpunkcyjne nie mają znaczenia; można dopisać inne poprawne zapisy (np. *colour / color*) i wybrać, czy wymagać dokładnej pisowni. |
| **Lektorka i młody lektor** | Ustawienia → Dźwięk → **Głos lektora**: Lektor, **Lektorka** (kobiecy) i **Młody lektor** (wyższy, żywszy). Kliknięcie od razu odtwarza próbkę. Głos wybiera się też przy zadaniu na słuch i „Do wymowy”. Brzmienie zależy od głosów zainstalowanych w przeglądarce. |
| **Lekcje: „Do wymowy”** | W slajdach z tekstem (informacyjny, do przepisania, fiszki) przycisk **Do wymowy**: zaznacz słowo albo całe zdanie, wybierz język i lektora. Na tablicy jest **podkreślone** – każde kliknięcie czyta je od nowa. Słowo zasłonięte `{…}` w środku nie jest czytane razem ze zdaniem, dopóki go nie odsłonisz – po odsłonięciu lektor czyta je od razu. Zapis w tekście: `[[słowo]]` albo `[[The weather is nice\|en-GB\|kobieta]]`. |
| **Podgląd lekcji: Wyjdź i Wygląd** | W podglądzie jest wyraźny przycisk **Wyjdź z podglądu**. Przycisk **Wygląd** pozwala kliknąć napis albo obrazek i **powiększyć/pomniejszyć** go, zmienić **czcionkę** i **kolor**, **przesunąć** (przeciągnij), **wykadrować obrazek** („Kadruj”) oraz zmienić **tło slajdu**. Zmiany zapisują się w lekcji (widać je na tablicy, u uczniów i w podglądzie na żywo). W edytorze: „Zmień wygląd” przy slajdzie oraz „Przywróć zwykły wygląd”. |
| **Szablony** | „Nowa lekcja” i „Nowy test” → **Zacznij od szablonu**. Gotowe: Krótka lekcja, Lekcja z powtórką i grą, Lekcja językowa, Prezentacja tematu; Klasyczny sprawdzian (20 pytań, 3 działy), Kartkówka na czas, Powtórka przed sprawdzianem, Test ze słówek. W edytorze **Zapisz jako szablon** – zostaje ten sam układ (slajdy albo pytania, elementy, wygląd, obrazki, czasy, ustawienia), ale bez tekstu. Szablony nauczycieli widzą wszyscy nauczyciele; usuwa autor albo administrator. |
| **Wszystkie przedmioty 4–8** | Dodano przedmioty klas 4–8 (bez wychowania fizycznego): język polski, angielski, niemiecki, matematyka, historia, WOS, przyroda, biologia, chemia, fizyka, geografia, informatyka, technika, muzyka, plastyka, EDB, edukacja zdrowotna, religia, etyka, doradztwo zawodowe. Joanna Hyżorek zostaje przy chemii i biologii – przedmioty nauczyciela zaznacza się przy jego koncie (Nauczyciele → „Czego uczy”). Uczeń widzi na górze przedmioty z materiałami, a resztę w zwijanych „Pozostałych przedmiotach”. |
| **Sklep: aktualne opisy cen** | Pakiety kół ratunkowych i pakiety przedmiotów liczą „osobno kosztowałoby…” i „oszczędzasz…” z **aktualnych** cen (także w promocji), a pakiet nigdy nie jest droższy niż kupowanie osobno. |
| **Jaśniejsze napisy** | Sprawdzian: „Maksymalnie 100 pkt – im lepsza ocena, tym więcej punktów”. Usunięto wszystkie wzmianki o e-mailu (ustawienia, zgłoszenia, panel administratora) – w zgłoszeniu uczeń podaje klasę. |

## Nowości w wersji 0.5.1

| Co | Jak działa |
|---|---|
| **Menu „Ustawienia”** | Uczeń i nauczyciel: przycisk **Ustawienia** na górze **rozwija menu na miejscu** (nie otwiera nowej strony): **Mój profil**, **Skrzynka** (liczba nowych wiadomości), **Dźwięk** (efekty, muzyka w tle, lektor – osobny przycisk dźwięku zniknął z paska) i **Ustawienia ogólne** (forma zwracania się, udział w rankingach, udostępnianie wyników, powiadomienia, zmiana kodu PIN), a na dole **Wyloguj**. Panel administratora bez zmian. |
| **Jeden przycisk profilu** | Profilowe, imię i liczba punktów to teraz **jeden przycisk** na pasku – prowadzi do „Mój profil”. |
| **Mój profil = wygląd, bez sklepu** | Rozwijane działy: profilowe i ramka (kliknięcie od razu zapisuje), tytuł, muzyka i efekt po teście, wygląd aplikacji (kolory, tekst, czcionka), moje wyniki, punkty. Na dole duży przycisk **Sklep EDUKRO**. |
| **Sklep w działach** | Każdy rodzaj rzeczy to **rozwijany dział** z licznikiem „masz X z Y” – nie trzeba przewijać całego sklepu. Działy pogrupowane: mój profil w rankingach, wygląd aplikacji, taniej razem i na testy. |
| **Rankingi w zakładkach** | Domyślnie widać **ranking ogólny** (suma miejsc ze wszystkich rankingów: 1. miejsce = 10 pkt rankingu … 10. = 1 pkt). Z boku zakładki: najaktywniejsi, najwięcej punktów, najlepsze oceny, najwięcej wygranych, gwiazdy lekcji – kliknięta zakładka zajmuje cały ekran. |
| **„Wyjdź”** | Na profilu, w sklepie, skrzynce i rankingu. Prowadzi do przedmiotów (nauczyciel: do panelu), a jeśli weszło się tam z menu Ustawienia – z powrotem rozwija to menu. |
| **Udział w rankingach** | Ustawienia → Ustawienia ogólne → „Biorę udział w rankingach”. Po wyłączeniu uczeń znika ze wszystkich rankingów (także testów i Gwiazdy szkoły). |
| **Domyślne ustawienia** | **Nowe konta** mają od razu włączone udostępnianie wyników we wszystkich przedmiotach i udział w rankingach (można wyłączyć). Istniejące konta zachowują swoje dotychczasowe wybory udostępniania. |
| **Pomoc „?”** | Zawsze na pasku; w nim samouczki. Samouczki ucznia i nauczyciela pokazują nowe menu Ustawienia, profil, sklep i rankingi. |

## Nowości w wersji 0.5

| Co | Jak działa |
|---|---|
| **Profil ucznia** | Sklep → **Mój profil**: profilowe (25, w tym 9 animowanych premium), ramki (kocie i królicze uszy, złota z koroną, laurowy wieniec, słuchawki, gwiazdki, pikselowa; animowane premium: neon, tęczowa, orbita, ognista, **winyl**, **puszka „EDU FIZZ”**, **hulajnoga**), **tytuły** przy imieniu (np. „Jan Kossakowski 〈Mistrz hulajnogi〉”, formy żeńskie i męskie), **muzyka** (8 utworów – wolne i szybkie) oraz **efekt po teście** (konfetti, gwiazdki, serduszka, emoji, fajerwerki, złoty deszcz). Po kliknięciu czyjegoś imienia otwiera się jego profil i **gra jego muzyka**. Swoja muzyka gra w tle, gdy w ustawieniach dźwięku włączona jest „Muzyka w tle”. |
| **Pakiety administratora** | Administracja → Sklep → **Pakiety**: wybierasz przedmioty (np. utwory muzyczne) i cenę za całość. Uczeń, który ma już część pakietu, płaci proporcjonalnie mniej. Pakiet można ukryć albo usunąć. |
| **Ranking testu i Wygrani** | Na ekranie startowym testu jest jego ranking (najlepszy wynik każdej osoby; przy remisie wyżej ten, kto był pierwszy). **Pierwsza osoba ze 100% na 1. miejscu przechodzi na zawsze do „Wygranych”**, dostaje **nagrodę za ukończenie ×2** (drugie tyle punktów w skrzynce) i nie wraca już do rankingu tego testu – o 1. miejsce walczą dalej pozostali. |
| **Ranking ogólny** | Przycisk **Ranking** na górze. Cztery kategorie z ostatnich 30 dni: najaktywniejsi, najwięcej punktów, najlepsze oceny ze sprawdzianów, najwięcej wygranych testów. **Ponad 3 dni na 1. miejscu** → wyjątkowy tytuł dostępny tylko w ten sposób (Niezmordowany/a, Król/Królowa punktów, Prymus/ka, Pogromca/Pogromczyni testów) i **koło fortuny 100–750 pkt** w skrzynce. |
| **Gwiazda lekcji / Gwiazda szkoły** | Na koniec lekcji prowadzonej z klasą nauczyciel wybiera **Gwiazdę lekcji** – najaktywniejszą osobę (+100 pkt, gwiazdka w rankingu tygodnia; działa też dla uczniów bez konta). **W piątek o 16:00** osoba z największą liczbą gwiazdek (przy remisie – każda z nich) zostaje **Gwiazdą szkoły**: tytuł, punkty (domyślnie 300) i **×1,2 za wszystkie zdobywane punkty** do następnego piątku – potem tytuł znika, chyba że wygra znowu. Ranking gwiazdek zeruje się co tydzień. Wartości punktów zmienisz w Administracja → Punkty → Nagrody punktowe. |
| **Podgląd lekcji na żywo** | W edytorze lekcji w rogu ekranu jest małe okienko z bieżącym slajdem – odświeża się przy każdej zmianie. Można je przeciągnąć w dowolne miejsce (pozycja zostaje zapamiętana), zwinąć albo kliknąć, żeby zobaczyć slajd na pełnym ekranie (Esc zamyka). |
| **Szybkie dodawanie uczniów** | Administracja → Rejestr uczniów → **„Szybkie dodawanie całej klasy”**: wybierz klasę, wklej listę (każda osoba w osobnej linii albo po przecinku; spacja oddziela imię od nazwiska – ostatni wyraz to nazwisko), kliknij **„Zamień”**, popraw tabelę i **„Przenieś do rejestru”**. Osoby, które już są w rejestrze, zostaną pominięte. |
| **Samouczki** | Nowy rozdział ucznia „Twój profil, rankingi i gwiazdy”; w samouczkach nauczyciela i administratora – podgląd na żywo, Gwiazda lekcji, rankingi, pakiety i szybkie dodawanie uczniów. |

## Nowości w wersji 0.4.1

| Co | Jak działa |
|---|---|
| **Płeć – formy zwracania się** | EDUKRO pisze do dziewczyn „zrobiłaś”, „zdobyłaś nagrodę”, a do chłopaków „zrobiłeś”. Domyślnie odgaduje to z imienia. **Administrator** zmienia to przełącznikiem **on / ona** przy koncie (Konta → Uczniowie / Nauczyciele). Każdy może też sam wybrać formę: uczeń w **Mój profil → Ustawienia**, nauczyciel w **Ustawienia → Ustawienia ogólne**. |
| **Samouczek tworzenia lekcji** | Prowadzi przez **każdy rodzaj slajdu po kolei**: dodaj slajd → wybierz rodzaj (z wyjaśnieniem, do czego służy) → wskazówki, jak zrobić go dobrze. Każdy slajd możesz wypełnić sam(a) albo kliknąć **„Wpisz za mnie”** – jeśli zawsze klikniesz, powstanie taka sama lekcja jak „Lekcja przykładowa – wszystkie typy slajdów”. Dymek ze wskazówkami jest w rogu (strona zostaje dostępna) i można go zwinąć strzałką. |
| **Samouczek tworzenia testu** | Test z **wszystkimi 14 rodzajami pytań** – przy każdym: czym jest i jak zrobić go dobrze, plus „Wpisz za mnie”. |
| **Lekcja i test z samouczka** | Mają oznaczenie **„Z samouczka – nie do publikacji”**. Można je prowadzić na próbę, **usunąć albo skopiować**. **Kopię można opublikować dopiero po wprowadzeniu zmian w treści** (choćby jednego słowa – sama zmiana nazwy nie wystarczy). |
| **Usuwanie** | Lekcje i testy mają przyciski **Kopiuj** i **Usuń** (na liście i w ustawieniach lekcji/testu). **Nauczyciel usuwa tylko materiały, które sam utworzył**; materiały administratora i innych nauczycieli może skopiować, ale nie usunąć. Administrator usuwa wszystko. |
| **Odejmowanie punktów** | Administrator → **Punkty → „Odejmij punkty”** (albo przełącznik w oknie przyznawania). Saldo nie spada poniżej zera; uczeń dostaje wiadomość z powodem. |
| **Nagrody punktowe** | Administrator → **Punkty → Nagrody punktowe**: punkty za każdą ocenę ze sprawdzianu (np. za szóstkę), za dobrą odpowiedź przy kole fortuny, za wygraną i remis w grze oraz domyślne punkty dla nowych testów. „Przywróć domyślne” wraca do ustawień fabrycznych. |
| **Fiszki** | Po odwróceniu fiszki tekst z przodu nie prześwituje już w lustrzanym odbiciu. |

## Nowości w wersji 0.4

| Co | Jak działa |
|---|---|
| **Samouczek** | Przy pierwszym logowaniu nauczyciel (i administrator) dostaje propozycję samouczka. Strzałki i podświetlenie pokazują, co kliknąć, a lektor czyta podpowiedzi (głos przeglądarki, po polsku). Nauczyciel buduje w nim **lekcję z każdym rodzajem slajdu** i **test z każdym rodzajem pytania** (szczegóły w 0.4.1). U góry jest **„Pomiń samouczek”**. Uczeń dostaje krótki, minutowy przewodnik. Samouczki uruchomisz ponownie: **„?” → Samouczki** albo przycisk **Samouczki** w panelu. |
| **Tryb pomocy „?”** | Przycisk ze znakiem zapytania jest zawsze na górze (i w każdym oknie). Kliknij go, a potem dowolny przycisk – pojawi się opis, co robi (z czytaniem na głos). Esc kończy tryb pomocy. |
| **Dźwięki** | Ikona głośnika na górze: głośność, kliknięcia, efekty (dobra/zła odpowiedź, punkty, nagrody), **kreda przy pisaniu logo** na ekranie głównym, spokojna **muzyka w tle** (domyślnie wyłączona) i lektor. Dźwięki są generowane w przeglądarce – nie ma plików audio. Przeglądarka włącza dźwięk dopiero po pierwszym kliknięciu – wtedy pod logo pojawia się „Posłuchaj, jak piszę kredą”. |
| **Skrzynka** | Dzwonek na górze. Uczeń dostaje: zatwierdzenie konta, nowe testy i sprawdziany („Joanna Hyżorek dodała…”), nowe lekcje swojej klasy, promocje, przypomnienia o kończących się testach tymczasowych, decyzje o pochwale. **Punkty z lekcji, punkty od nauczyciela/administratora i nagrody za testy trzeba odebrać** przyciskiem „Odbierz” (albo „Odbierz wszystko”). Nauczyciel i administrator dostają prośby o pochwałę, nowe konta do zatwierdzenia i zgłoszenia. |
| **Przyznawanie punktów** | Zakładka **Punkty** (nauczyciel) i sekcja **Punkty** (administrator), a także przycisk „Punkty” przy koncie ucznia. **Administrator – bez limitu. Nauczyciel – raz dziennie, łącznie do 100 pkt** (np. jednemu uczniowi 100 albo czterem po 25). |
| **Ceny i promocje** | Administrator → **Sklep**: zmiana ceny każdego przedmiotu (i przywrócenie domyślnej) oraz **promocje na 1 godz., 3 godz., 1 dzień, 3 dni, tydzień, 2 tygodnie albo do wybranego terminu** – na jeden przedmiot albo cały sklep. Uczniowie dostają powiadomienie. Promocje się nie sumują (liczy się największa zniżka). Promocję tygodnia można wyłączyć. |
| **Nagroda za test** | Ustawienia testu → **Nagroda za test**: przedmiot ze sklepu (kolor, kolor tekstu, czcionka) albo **osobista promocja** na wybrany produkt (np. −50% na Złoty przez 24 godz.). Za ukończenie testu nauczającego, zaliczenie egzaminu albo ocenę ze sprawdzianu (próg do wyboru). Nagroda trafia do skrzynki, raz na ucznia. |
| **Test tymczasowy** | Ustawienia testu → **Test tymczasowy** (nauczający i egzaminacyjny): test znika z listy po wybranym czasie (za godzinę, dzień, tydzień albo w wybranym momencie). Uczniowie widzą go w **specjalnej ramce z odliczaniem**, a gdy zostaje mało czasu, dostają przypomnienie w skrzynce. Wyniki zostają. |
| **Lekcje dla klas** | Lekcja nie ma już klasy w ustawieniach – **jedna lekcja służy wszystkim klasom**. **Prowadź** pyta, z którą klasą prowadzisz (z niej koło fortuny i drużyny). **Gdy dojdziesz do końca lekcji, lekcja sama pojawi się uczniom tej klasy** (i dostaną powiadomienie) – uczniowie innych klas jej nie widzą. **Opublikuj dla…** pozwala wybrać klasy ręcznie (albo „Wszyscy uczniowie”) lub ukryć lekcję przed klasą. |
| **Sklep** | Przycisk **„Wyjdź ze sklepu”** (u góry i na dole) wraca tam, skąd przyszedłeś. Po teście zamiast „sklep już wkrótce” jest przycisk do sklepu. |

Aktualizacja z 0.3: dotychczasowe punkty z lekcji zostają doliczone (nie trzeba ich odbierać), a opublikowane
lekcje z klasą w ustawieniach są automatycznie opublikowane dla tej klasy.

## Uruchomienie

Potrzebny jest **Node.js 22.13 lub nowszy** (https://nodejs.org – wersja LTS). Nie trzeba instalować żadnych pakietów.

**Windows – najprościej:** kliknij dwukrotnie plik `URUCHOM-EDUKRO.bat`. Otworzy się okno serwera,
a po chwili przeglądarka z EDUKRO. Zamknięcie okna zatrzymuje aplikację.

Albo w terminalu:

```bash
cd edukro
npm start
```

Otwórz http://localhost:3000. Przy pierwszym uruchomieniu powstaje plik `.env` (kopia `.env.example`)
oraz baza danych `data/edukro.db`.

**Aktualizacja z poprzedniej wersji:** rozpakuj nową wersję w to samo miejsce (albo skopiuj do niej swój
folder `data/` i plik `.env`). Baza zostanie uzupełniona automatycznie – konta, testy i punkty zostają.

Testy automatyczne: `npm test`

## Pierwsze kroki

| Kto | Jak wejść | Kod początkowy |
|---|---|---|
| Nauczycielka Joanna Hyżorek | „Jestem nauczycielem” | z `.env`: `EDUKRO_INIT_TEACHER_CODE` (1111) |
| Administrator | ukryta sekwencja na ekranie głównym (patrz niżej) | z `.env`: `EDUKRO_INIT_ADMIN_CODE` (0907) |
| Uczeń | najpierw administrator dodaje go do rejestru (z klasą), potem uczeń zakłada konto | własny 4-cyfrowy kod |

Kody początkowe są zapisywane w bazie wyłącznie jako hasz i nie występują w kodzie strony.
Po pierwszym logowaniu zmień je w aplikacji i usuń z pliku `.env`.
W trybie `EDUKRO_ENV=production` zmiana kodu początkowego jest wymuszana.

**Wejście do panelu administratora:** stuknij/kliknij 5 razy w logo EDUKRO w ciągu 3 sekund
albo wpisz na klawiaturze `edukro`. Sekwencję zmienisz w `public/js/config.js` (`ADMIN_GESTURE`).
Gest tylko otwiera ekran kodu – uprawnienia nadaje serwer.

## Testy

Nauczyciel (zakładka **Testy** w panelu) i administrator (sekcja **Testy**) klikają **Stwórz test**,
wybierają rodzaj testu i liczbę pytań, a potem uzupełniają pytania po kolei. Wszystko zapisuje się samo;
szkic może być niekompletny, ale nie da się go opublikować, dopóki „Sprawdź test” pokazuje braki
(każdy brak ma przycisk „Przejdź do pytania” / „Przejdź do komórki”). **Podgląd ucznia** pozwala
rozwiązać test bez zapisywania wyników.

| | Test nauczający | Test egzaminacyjny |
|---|---|---|
| Czas | bez zegara | zegar na każde pytanie (domyślny lub własny) |
| Błąd | od razu poprawna odpowiedź + wyjaśnienie nauczyciela; pytanie wraca na końcu do skutku | liczy się do limitu; po przekroczeniu – przegrana |
| Powtarzanie | bez ograniczeń | po przegranej za 20 min, po zaliczeniu za 7 dni |
| Wynik u nauczyciela | gdy uczeń udostępnia wyniki | pierwsze zaliczenie – zawsze; powtórki – nie |
| Punkty | tylko za pierwsze ukończenie | dużo za pierwsze zaliczenie, trochę za każdą powtórkę |

| | Sprawdzian |
|---|---|
| Pytania | co najmniej 20; każde przypisane do kategorii (działu) z ustawień sprawdzianu |
| W trakcie | bez podpowiedzi i bez sprawdzania – uczeń widzi wynik dopiero na końcu |
| Wynik | ocena 1–6 (progi procentowe w ustawieniach) widoczna tylko dla ucznia + działy do powtórki |
| Podejścia | najwyżej 3 razy, do terminu (deadline) ustawionego przez nauczyciela |
| Punkty | za ocenę: 1 → 1 pkt, 2 → 5, 3 → 12, 4 → 22, 5 → 35, 6 → 50; poprawa oceny dopłaca różnicę, punktów się nie traci |

**Losowe pytania:** w ustawieniach każdego testu i sprawdzianu można wpisać, ile pytań ma dostać uczeń
(np. 10 z 20). Przy każdym podejściu serwer losuje inny zestaw z całej puli.

**Wyodrębnij pytania:** przy tworzeniu testu (albo w edytorze) przycisk „Wyodrębnij z innych materiałów”
kopiuje wybrane albo wszystkie pytania z innych testów, sprawdzianów i lekcji. Skopiowane pytania można
dowolnie zmieniać. W teście egzaminacyjnym liczba dozwolonych błędów ustawia się na liczbę pytań ÷ 5
(w dół).

**Odpowiedź pisemna:** nauczyciel podaje minimalną (i opcjonalnie maksymalną) liczbę słów oraz do 5 serii
słów, np. `ser / białko / mleko` i `miska / kubek / talerz`. Odpowiedź jest zaliczona, gdy zawiera
słowo z **każdej** serii (w dowolnej kolejności i odmianie: „kubka”, „mleko”) i ma odpowiednią długość.
Uczeń nigdy nie widzi serii ani informacji, że takie słowa są sprawdzane – po błędzie dostaje tylko
przykładową odpowiedź nauczyciela.

Rodzaje pytań: jedna poprawna (A–D), wszystkie poprawne, prawda/fałsz (3–5 zdań), odpowiedź pisemna
(serie słów, minimalna/maksymalna liczba słów), liczbowa, połącz w pary (do 6), ułóż zdanie (ze zbędnymi słowami),
ułóż w kolejności, uzupełnij zdanie – wpisz, uzupełnij zdanie – wybierz, uzupełnij tabelę (luki,
usuwanie okienek, grupy w dowolnej kolejności, kłódki), przeciągnij do kategorii, podpisz obrazek,
przeczytaj i odpowiedz. Do każdego pytania można dodać obrazek, podpowiedź, wyjaśnienie i czas.

**Komendy w edytorze** (edytor od razu potwierdza „Komenda napisana poprawnie” albo opisuje błąd):

| Komenda | Przykład | Znaczenie |
|---|---|---|
| luka do wpisania | `Drzewo to (roślina).` | uczeń wpisuje słowo z nawiasu |
| kilka poprawnych | `Dom z (drewna/cegieł/metalu).` | zaliczona każda z odpowiedzi |
| luka do wyboru | `W nocy jest [ciemno/jasno].` | pierwsza odpowiedź jest poprawna, uczeń widzi je pomieszane |
| słowa w kategorii / w komórce | `brzoza / dąb / jabłoń` | ukośnik oddziela elementy lub alternatywy |
| czas | `2` · `2.30` · `0.45` | 2 min · 2 min 30 s · 45 s |
| zwykły nawias | `\(` `\)` | nawias, który nie jest luką |

**Ortografio-zaliczacz** (domyślnie włączony, wyłączany w ustawieniach testu): brak polskich znaków nie jest
błędem (s = ś, o = ó), a słowo różniące się 1–2 literami jest zaliczane (krótkie słowa: 1 litera); liczby
muszą być dokładne. Wszystko oceniane jest na serwerze – poprawne odpowiedzi nie trafiają do przeglądarki
ucznia przed odpowiedzią, a zegar egzaminu działa po stronie serwera.

W trybie deweloperskim przy pierwszym uruchomieniu powstają **przykładowe materiały**: trzy testy,
sprawdzian „Atomy i pierwiastki” (20 losowych pytań z 24), lekcja „Budowa atomu” oraz przykładowa klasa 7a
(12 wymyślonych uczniów w rejestrze – usuniesz ich jednym przyciskiem w Rejestrze uczniów).
Administrator może w sekcji Testy utworzyć **konto testowe ucznia** („Uczeń Testowy”), aby sprawdzić testy
z punktami i przerwami.

## Lekcje

Nauczyciel (zakładka **Lekcje**) i administrator tworzą lekcję jak prezentację. Lekcja jest wspólna dla
wszystkich klas: klasę (np. 7a) wybiera się po kliknięciu **Prowadź** – z rejestru tej klasy losowani są
uczniowie do koła fortuny i gier, a po dojściu do końca lekcji uczniowie tej klasy widzą ją u siebie.

| Slajd | Co robi |
|---|---|
| Informacyjny | tytuł, punkty, tabela, zdjęcie (powiększanie i obracanie); słowa w `{klamrach}` są zasłonięte do kliknięcia, elementy mogą pojawiać się po czasie |
| Do przepisania | jak informacyjny + pasek czasu u góry; nauczyciel uruchamia odliczanie kliknięciem |
| Pytanie | dowolne pytanie z testów (z natychmiastowym sprawdzeniem) |
| Fiszki | karty do odwracania – pojęcie i wyjaśnienie |
| Burza mózgów | pytanie dla klasy, odpowiedzi zapisywane na tablicy |
| Koło fortuny | losuje ucznia klasy; nauczyciel zadaje pytanie ustnie, „Dobrze” = **+10 pkt** |
| Gra klasowa | Czerwoni vs Niebiescy, Kółko i krzyżyk, Va banque – wygrana drużyna **+5 pkt** dla każdego |

**Czerwoni vs Niebiescy:** losowanie równych drużyn, zaznaczanie nieobecnych (gdy różnica drużyn
przekroczy 2 – ponowne losowanie bez nieobecnych), z każdej drużyny losowana jest jedna osoba, po 3 s
pojawia się pytanie, nauczyciel klika, kto pierwszy odpowiedział dobrze. Liczba pytań: nieparzysta, min. 5.

Uczniowie bez konta też dostają punkty – czekają przy ich nazwisku w rejestrze i pojawią się w skrzynce po
założeniu konta (do odebrania). Lekcję opublikowaną dla klasy jej uczniowie mogą przejrzeć sami (koło fortuny
i gry działają tylko na lekcji).
Prowadzenie: przycisk **Prowadź** (pełny ekran, strzałki ←/→).

## Konta uczniów

1. Administrator dodaje ucznia do **Rejestru uczniów** (imię, nazwisko, klasa i oddział).
2. Uczeń zakłada konto: imię i nazwisko → własny 4-cyfrowy kod (EDUKRO nie używa adresów e-mail).
3. Konto od razu działa: uczeń rozwiązuje testy, sprawdziany i lekcje oraz zbiera punkty,
   ale **nie może ich wydawać**, dopóki administrator nie zatwierdzi konta (sekcja **Konta**).
4. **Odrzucenie** usuwa konto razem ze wszystkimi punktami i wynikami zdobytymi na nim. Wpis w rejestrze
   zostaje (prawdziwy uczeń może założyć konto ponownie), a punkty z lekcji należą do ucznia z rejestru.

## Sklep

Uczeń wydaje punkty w **Sklepie** (duży przycisk na dole strony „Mój profil”; działy sklepu się rozwijają):

- **Kolory** tła, akcentu (przyciski) i kart pytań – każdą część wybiera się osobno; premium:
  złoty i srebrny (metaliczny połysk) oraz tęczowy (kolory przelewają się jak ciecz).
- **Kolor tekstu** (także neonowe i złoty) i **czcionki**. **Anty-niszczenie:** nie da się ustawić tekstu
  w kolorze zbyt podobnym do tła – sprawdza to przeglądarka i serwer.
- **Koło ratunkowe:** tabela i kolejność – 75% wypełnione i zablokowane; A–D – 50 na 50; pytanie pisemne
  (najwyżej 3 słowa, jedna seria) – wpisuje jedno poprawne słowo; przy innych pytaniach wyświetla się
  informacja, że koła nie da się użyć (nic nie znika). W sprawdzianie – tylko raz.
- **Pochwała od wychowawcy** – bardzo droga; prośba trafia do wychowawcy klasy ucznia (ustawianego w sekcji
  Nauczyciele) albo do administratora. Odrzucenie zwraca punkty.
- **Przeceny:** pakiety (np. 3 koła ratunkowe −20%, 5 kół −30%, komplety kolorów) i cotygodniowa promocja.
- **Profil (od 0.5):** profilowe, ramki, tytuły, muzyka i efekty po teście – ustawiane w „Mój profil”
  (tam też wygląd aplikacji z kupionych kolorów i czcionek);
  pakiety tworzone przez administratora.

## Konto Jana Kossakowskiego i materiały testowe

`URUCHOM-PRZYKLAD-JAN.bat` (można uruchamiać wielokrotnie, niczego nie dubluje) zakłada konto ucznia
**Jan Kossakowski** (kod **6712**, klasa 7a, konto zatwierdzone), lekcję ze wszystkimi rodzajami slajdów,
test egzaminacyjny z pytań wyodrębnionych z testu „wszystkie rodzaje pytań”, sprawdzian z 20 banalnych
pytań oraz 2800 punktów. Kupuje też kolor tła „Szmaragd” i ustawia go na koncie – pochwałę (2500 pkt)
możesz kupić sam. Od wersji 0.4 dodaje też nowości do wypróbowania: w skrzynce Jana czekają **100 pkt od
administratora** i **+10 pkt z koła fortuny**, jest **test tymczasowy z nagrodą** (kolor „Rubin”, znika po
tygodniu) i **promocja** w sklepie (Złoty −50% przez tydzień). Lekcja przykładowa jest opublikowana dla klasy 7a.
Od wersji 0.5 Jan ma też profil **rakieta + ramka „Hulajnoga” + tytuł „Mistrz hulajnogi” + muzyka „Automat 8-bit”**,
2200 dodatkowych punktów na nowości, **gwiazdkę lekcji** (jest w rankingu tygodnia), a w skrzynce
**koło fortuny do wypróbowania**. W sklepie pojawia się pakiet administratora „Pakiet muzyczny”.

## Zdjęcie szkoły

Umieść zdjęcie jako `public/assets/szkola.jpg` i odśwież stronę – bez zmian w kodzie.
Fragment, który ma być zawsze widoczny: `SCHOOL_PHOTO_FOCUS=50% 45%` w `.env`.

## Poczta

EDUKRO nie używa adresów e-mail – nie trzeba konfigurować poczty. Ustawienia `SMTP_*` w `.env` można pominąć.

## Ważne ustawienia `.env`

| Zmienna | Znaczenie |
|---|---|
| `PIN_LENGTH` | długość kodu ucznia, nauczyciela i administratora (4–8, domyślnie 4) |
| `HOST` | `0.0.0.0`, aby aplikacja była dostępna z innych urządzeń w sieci |
| `EDUKRO_ENV` | `production` na serwerze szkolnym (ciasteczka Secure – wymaga HTTPS) |
| `TRUST_PROXY` | `true`, jeśli przed EDUKRO stoi serwer proxy (np. nginx) |

## Bezpieczeństwo (w skrócie)

- Kody dostępu: scrypt z solą; kody resetu: HMAC z sekretem serwera; nic nie jest zapisywane jawnie.
- Kody uczniów: zakazane są proste kody (jedna cyfra, ciąg kolejnych cyfr); limity prób logowania
  (5 / 15 min na konto, 30 / 15 min na adres IP) i rejestracji (20 / 15 min na adres IP).
- Punkty, oceny, koła ratunkowe i zakupy liczy wyłącznie serwer; konto niezatwierdzone nie może wydawać punktów.
- Sesje tylko w ciasteczkach HttpOnly + SameSite=Strict; rola zawsze odczytywana z bazy po stronie serwera.
- Ochrona CSRF (nagłówek aplikacji + sprawdzenie Origin), nagłówki CSP, X-Frame-Options itd.
- Operacje nieodwracalne (usunięcie konta, reset dostępu) wymagają ponownego podania kodu administratora.
- Nauczyciel widzi tylko wyniki z przypisanych przedmiotów i tylko te, które uczeń zgodził się udostępnić.

Przed użyciem w szkole skonsultuj wdrożenie z osobą odpowiedzialną za systemy szkolne i ochronę danych (RODO).

## Struktura

```
server/            serwer (Node.js, wbudowany SQLite, bez zależności)
  routes/          public.js (gość, logowanie), register.js, members.js (uczeń, nauczyciel), admin.js,
                   tests.js (testy, sprawdziany, wyodrębnianie), lessons.js (lekcje, klasy), shop.js (sklep, pochwały,
                   wygląd, profil, ceny, promocje i pakiety), inbox.js (skrzynka, przyznawanie punktów, stan samouczka),
                   fun.js (profil osoby, rankingi, „puls” ucznia)
  quiz/            engine.js (ocenianie, koło ratunkowe), attempts.js (przebieg, czas, oceny, punkty), schema.js, demo.js
  lessons/         schema.js – slajdy lekcji
  points.js        punkty ucznia (także punkty z lekcji czekające w rejestrze)
  notify.js        skrzynka: powiadomienia, odbieranie punktów i nagród, przypomnienia o testach tymczasowych
  shop/pricing.js  ceny (domyślne i zmienione), promocje czasowe i osobiste
  pointrules.js    nagrody punktowe ustawiane przez administratora (oceny, lekcje, nowe testy)
  ownership.js     lekcje/testy z samouczka (bez publikacji, kopia po zmianach) i prawo do usuwania
  profile.js       profil ucznia (awatar, ramka, tytuł, muzyka, efekt) i karta osoby
  rankings.js      ranking testu (Wygrani ×2), ranking ogólny, liderzy > 3 dni (tytuł + koło fortuny)
  stars.js         Gwiazda lekcji i Gwiazda szkoły (piątek 16:00, ×1,2 punktów); clock.js – czas szkoły
public/            interfejs (HTML, CSS, moduły JS – bez kroku budowania)
  js/shared/       reguły wspólne dla przeglądarki i serwera: quiz-rules.js, lesson-rules.js, shop.js, classes.js,
                   gender.js (formy „zrobiłeś” / „zrobiłaś”)
  js/sound.js      dźwięki generowane w przeglądarce (efekty, kreda, muzyka) i lektor (mowa przeglądarki)
  js/tour.js       silnik samouczka; js/tutorials.js – rozdziały samouczków; js/help.js – tryb pomocy „?”
  js/avatar.js     profilowe i ramki (SVG, animacje); js/celebrate.js – efekty po teście; js/fun.js – „puls” ucznia
  js/views/live-preview.js  podgląd lekcji na żywo w edytorze
  fonts/           czcionki do kupienia w sklepie
  assets/logo.svg  logo z danymi animacji (generowane: npm run logo, wymaga Pythona i fontu TeX Gyre Chorus)
test/              testy automatyczne (API, testy i sprawdziany, lekcje, sklep, skrzynka, promocje, klient SMTP)
```

Kroje pisma: TeX Gyre Chorus, Pagella, Schola, Adventor i Cursor (GUST Font License), Inter, Lora i Poppins (SIL OFL).
