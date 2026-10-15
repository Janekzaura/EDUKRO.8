// Sprawdzenie wersji Node.js przed startem (wbudowany SQLite wymaga ≥ 22.13).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\n[EDUKRO] Wymagany Node.js 22.13 lub nowszy (masz ${process.versions.node}).\n         Pobierz wersję LTS z https://nodejs.org i uruchom ponownie: npm start\n`);
  process.exit(1);
}
