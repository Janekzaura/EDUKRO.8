// Konfiguracja interfejsu EDUKRO (bez sekretów – wszystkie kody weryfikuje serwer).

/**
 * Ukryte wejście do panelu administratora na ekranie powitalnym.
 * Gest tylko otwiera ekran autoryzacji – sam w sobie nie daje żadnych uprawnień.
 *   taps     – liczba stuknięć/kliknięć w logo EDUKRO
 *   keys     – alternatywa z klawiatury: sekwencja klawiszy (KeyboardEvent.key)
 *   windowMs – w jakim czasie trzeba wykonać sekwencję
 */
export const ADMIN_GESTURE = {
  taps: 5,
  keys: ['e', 'd', 'u', 'k', 'r', 'o'],
  windowMs: 3000,
};

/** Czasy animacji logo (ms). */
export const LOGO_TIMING = {
  start: 450,          // opóźnienie po pojawieniu się tła
  letters: 2500,       // łączny czas pisania liter
  liftPause: 70,       // przerwa przy podniesieniu pióra wewnątrz litery
  letterPause: 120,    // przerwa między literami
  swash: 1050,         // końcowy zawijas
};
