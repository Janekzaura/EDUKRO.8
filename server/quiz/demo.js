// Przykładowe testy (tylko tryb deweloperski, tylko raz) – pokazują wszystkie rodzaje pytań.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { one, all, run, now, tx, nameKey } from '../db.js';
import { config } from '../config.js';
import { cleanSettings, cleanQuestions } from './schema.js';
import { validateTest, newId } from '../../public/js/shared/quiz-rules.js';
import { validateLesson } from '../../public/js/shared/lesson-rules.js';
import { cleanSlides } from '../lessons/schema.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function addImage(file) {
  const id = crypto.randomBytes(12).toString('hex');
  const dir = path.join(config.dataDir, 'media');
  fs.mkdirSync(dir, { recursive: true });
  const buf = fs.readFileSync(path.join(HERE, 'demo-assets', file));
  fs.writeFileSync(path.join(dir, `${id}.png`), buf);
  run('INSERT INTO media (id, owner_id, mime, bytes, created_at) VALUES (?,?,?,?,?)', id, null, 'image/png', buf.length, now());
  return id;
}

const cell = (t, s = 'show', extra = {}) => ({ t, s, lock: false, g: '', ...extra });

function chemistryAll(atom) {
  return [
    { type: 'single', prompt: 'Jaki jest symbol chemiczny sodu?', options: ['Na', 'S', 'So', 'N'], correct: 0,
      hint: 'Symbol pochodzi od łacińskiej nazwy pierwiastka.', explanation: 'Symbol Na pochodzi od łacińskiej nazwy natrium. S to siarka, a N – azot.' },
    { type: 'multi', prompt: 'Które z poniższych substancji są pierwiastkami?',
      options: [{ text: 'tlen', correct: true }, { text: 'woda', correct: false }, { text: 'żelazo', correct: true }, { text: 'sól kuchenna', correct: false }, { text: 'złoto', correct: true }],
      explanation: 'Woda (H₂O) i sól kuchenna (NaCl) to związki chemiczne – zbudowane z atomów różnych pierwiastków.' },
    { type: 'truefalse', prompt: 'Oceń, czy zdania są prawdziwe.', statements: [
      { text: 'Pod ciśnieniem normalnym woda wrze w temperaturze 100°C.', answer: true },
      { text: 'Atom składa się wyłącznie z protonów.', answer: false },
      { text: 'Tlen jest potrzebny do spalania.', answer: true },
      { text: 'Rtęć w temperaturze pokojowej jest ciałem stałym.', answer: false }],
    explanation: 'Atom ma też neutrony i elektrony. Rtęć to jedyny metal, który w temperaturze pokojowej jest cieczą.' },
    { type: 'open', prompt: 'Wyjaśnij krótko własnymi słowami, czym jest pierwiastek chemiczny.',
      series: ['atom / atomy / atomów / atomu', 'jednego / jednakowych / tego samego / takich samych / tej samej / jeden'], minWords: '5', maxWords: '40',
      sample: 'Pierwiastek to substancja zbudowana z atomów jednego rodzaju.',
      explanation: 'Pierwiastek to substancja zbudowana z atomów jednego rodzaju – o tej samej liczbie protonów w jądrze.' },
    { type: 'number', prompt: 'Ile atomów wodoru zawiera jedna cząsteczka wody (H₂O)?', value: '2', tolerance: '', unit: '' },
    { type: 'match', prompt: 'Połącz pierwiastek z jego symbolem.', pairs: [
      { left: 'Wodór', right: 'H' }, { left: 'Węgiel', right: 'C' }, { left: 'Tlen', right: 'O' }, { left: 'Żelazo', right: 'Fe' }, { left: 'Miedź', right: 'Cu' }] },
    { type: 'order_words', prompt: 'Ułóż zdanie z rozsypanych słów. Uwaga – dwa słowa są zbędne!', sentence: 'Woda jest związkiem wodoru i tlenu.', distractors: 'azotu / pierwiastkiem' },
    { type: 'timeline', prompt: 'Ułóż pierwiastki od najlżejszego do najcięższego atomu.', items: ['wodór', 'hel', 'węgiel', 'tlen', 'żelazo'],
      explanation: 'Masy atomowe: wodór 1 u, hel 4 u, węgiel 12 u, tlen 16 u, żelazo 56 u.' },
    { type: 'cloze', prompt: 'Uzupełnij luki.', text: 'Najmniejsza część pierwiastka to (atom). W jądrze atomu znajdują się protony i (neutrony). Wokół jądra krążą (elektrony).' },
    { type: 'cloze_choice', prompt: 'Wybierz właściwe słowa.', text: 'W temperaturze pokojowej tlen jest [gazem/cieczą/ciałem stałym]. Woda zamarza w temperaturze [0/100/-10] °C.' },
    { type: 'table', prompt: 'Uzupełnij tabelę.', table: {
      rows: 4, cols: 3, headerRow: true, headerCol: true, groupRepeat: {},
      cells: [
        [cell('Substancja'), cell('Stan skupienia (20°C)'), cell('Wzór lub symbol')],
        [cell('Woda'), cell('ciecz', 'blank', { lock: true }), cell('H₂O')],
        [cell('Tlen'), cell('gaz'), cell('O2/O₂', 'blank')],
        [cell('Żelazo'), cell('ciało stałe/stałe', 'blank', { lock: true }), cell('Fe')],
      ],
    } },
    { type: 'categorize', prompt: 'Przeciągnij substancje do właściwych kategorii.', categories: [
      { name: 'Pierwiastki', items: 'tlen / żelazo / miedź / wodór' },
      { name: 'Związki chemiczne', items: 'woda / sól kuchenna / dwutlenek węgla' },
      { name: 'Mieszaniny', items: 'powietrze / mleko / woda morska' }] },
    { type: 'image_labels', prompt: 'Przeciągnij nazwy do właściwych miejsc na rysunku atomu.', diagram: atom,
      points: [{ x: 50, y: 50, label: 'jądro atomowe' }, { x: 65.8, y: 31.3, label: 'elektron' }, { x: 83.3, y: 50, label: 'powłoka elektronowa' }],
      distractors: 'cząsteczka' },
    { type: 'data', prompt: 'Przeczytaj uważnie tekst. Po kliknięciu „Dalej” zniknie i odpowiesz na pytania.',
      passage: 'Woda (H₂O) to związek chemiczny zbudowany z dwóch atomów wodoru i jednego atomu tlenu. Pod ciśnieniem normalnym wrze w temperaturze 100°C, a zamarza w 0°C. Woda pokrywa około 71% powierzchni Ziemi.',
      questions: [
        { prompt: 'W jakiej temperaturze wrze woda?', series: ['100'], sample: 'W temperaturze 100°C.' },
        { prompt: 'Jaką część powierzchni Ziemi pokrywa woda?', series: ['71'], sample: 'Około 71% powierzchni Ziemi.' },
        { prompt: 'Z atomów jakich pierwiastków zbudowana jest woda?', series: ['wodór / wodoru', 'tlen / tlenu'], sample: 'Z atomów wodoru i tlenu.' }] },
    { type: 'listen', prompt: 'Posłuchaj lektora i zapisz po angielsku nazwę tego pierwiastka.', phrase: 'oxygen', lang: 'en-GB', voice: '', accept: '', exact: true,
      hint: 'To gaz, którym oddychamy.', explanation: 'Oxygen to po angielsku tlen (symbol O).' },
  ];
}

function chemistryExam() {
  return [
    { type: 'single', prompt: 'Który pierwiastek ma symbol Fe?', options: ['fluor', 'żelazo', 'fosfor', 'frans'], correct: 1 },
    { type: 'truefalse', prompt: 'Oceń, czy zdania są prawdziwe.', statements: [
      { text: 'Powietrze jest mieszaniną gazów.', answer: true },
      { text: 'Woda jest pierwiastkiem.', answer: false },
      { text: 'Złoto jest metalem.', answer: true }] },
    { type: 'number', prompt: 'Jaka jest liczba atomowa tlenu?', value: '8', tolerance: '', unit: '', time: '0.30' },
    { type: 'match', prompt: 'Połącz substancję z jej stanem skupienia w temperaturze pokojowej.', pairs: [
      { left: 'Tlen', right: 'gaz' }, { left: 'Rtęć', right: 'ciecz' }, { left: 'Miedź', right: 'ciało stałe' }], time: '1.00' },
    { type: 'cloze_choice', prompt: 'Wybierz właściwe słowa.', text: 'Najmniejsza część pierwiastka to [atom/cząsteczka/jon]. Związek chemiczny powstaje z atomów [różnych/tych samych] pierwiastków.' },
    { type: 'cloze', prompt: 'Uzupełnij lukę.', text: 'Symbol chemiczny wodoru to (H).' },
  ];
}

function biology(cellImg) {
  return [
    { type: 'image_labels', prompt: 'Przeciągnij nazwy do właściwych miejsc na rysunku komórki zwierzęcej.', diagram: cellImg,
      points: [{ x: 89, y: 50, label: 'błona komórkowa' }, { x: 58.3, y: 75, label: 'cytoplazma' }, { x: 43.3, y: 41.3, label: 'jądro komórkowe' }, { x: 71.7, y: 35, label: 'mitochondrium' }],
      distractors: 'ściana komórkowa / chloroplast',
      explanation: 'Komórka zwierzęca nie ma ściany komórkowej ani chloroplastów – te występują w komórkach roślinnych.' },
    { type: 'categorize', prompt: 'Przeciągnij organizmy do właściwych królestw.', categories: [
      { name: 'Rośliny', items: 'dąb / brzoza / jabłoń' },
      { name: 'Zwierzęta', items: 'pies / wróbel / żaba' },
      { name: 'Grzyby', items: 'pieczarka / borowik / drożdże' }] },
    { type: 'table', prompt: 'Wpisz przykłady zwierząt (w dowolnej kolejności).', table: {
      rows: 3, cols: 4, headerRow: true, headerCol: true, groupRepeat: {},
      cells: [
        [cell('Gromada'), cell('Przykład 1'), cell('Przykład 2'), cell('Przykład 3')],
        [cell('Ssaki'), cell('pies/kot/koń/krowa/lew/słoń/mysz/wilk/człowiek/świnia/owca/koza/zając/lis', 'blank', { g: 'A' }), cell('pies/kot/koń/krowa/lew/słoń/mysz/wilk/człowiek/świnia/owca/koza/zając/lis', 'blank', { g: 'A' }), cell('pies/kot/koń/krowa/lew/słoń/mysz/wilk/człowiek/świnia/owca/koza/zając/lis', 'blank', { g: 'A' })],
        [cell('Ptaki'), cell('wróbel/bocian/kura/sowa/orzeł/gołąb/kruk/sikorka/łabędź', 'blank', { g: 'B' }), cell('wróbel/bocian/kura/sowa/orzeł/gołąb/kruk/sikorka/łabędź', 'blank', { g: 'B' }), cell('', 'gone')],
      ],
    } },
    { type: 'single', prompt: 'W których częściach komórki roślinnej zachodzi fotosynteza?', options: ['w mitochondriach', 'w chloroplastach', 'w jądrze komórkowym', 'w wakuoli'], correct: 1,
      explanation: 'Chloroplasty zawierają zielony barwnik – chlorofil – i to w nich zachodzi fotosynteza.' },
  ];
}

/* ---------- Sprawdzian: 24 pytania z trzech działów ---------- */
function chemistryQuiz(cat) {
  const S = (prompt, options, correct, c) => ({ type: 'single', prompt, options, correct, cat: cat[c] });
  const TF = (prompt, statements, c) => ({ type: 'truefalse', prompt, statements: statements.map(([text, answer]) => ({ text, answer })), cat: cat[c] });
  const N = (prompt, value, c, unit = '') => ({ type: 'number', prompt, value, tolerance: '', unit, cat: cat[c] });
  const C = (text, c) => ({ type: 'cloze_choice', prompt: 'Wybierz właściwe słowa.', text, cat: cat[c] });
  return [
    S('Z czego zbudowane jest jądro atomu?', ['z protonów i neutronów', 'z elektronów', 'z protonów i elektronów', 'tylko z neutronów'], 0, 0),
    S('Jaki ładunek ma elektron?', ['ujemny', 'dodatni', 'obojętny', 'zależy od pierwiastka'], 0, 0),
    S('Co oznacza liczba atomowa Z?', ['liczbę protonów w jądrze', 'liczbę neutronów', 'masę atomu', 'liczbę powłok'], 0, 0),
    N('Ile protonów ma atom węgla (Z = 6)?', '6', 0),
    N('Ile elektronów ma obojętny atom tlenu (Z = 8)?', '8', 0),
    TF('Oceń, czy zdania o budowie atomu są prawdziwe.', [['Neutron nie ma ładunku.', true], ['Elektrony znajdują się w jądrze.', false], ['Proton ma ładunek dodatni.', true]], 0),
    C('Najmniejsza część pierwiastka to [atom/cząsteczka/kryształ]. W jądrze są protony i [neutrony/elektrony].', 0),
    { type: 'match', prompt: 'Połącz cząstkę z jej ładunkiem.', pairs: [{ left: 'proton', right: 'dodatni' }, { left: 'elektron', right: 'ujemny' }, { left: 'neutron', right: 'obojętny' }], cat: cat[0] },
    S('Który pierwiastek jest metalem?', ['sód', 'siarka', 'chlor', 'azot'], 0, 1),
    S('Gdzie w układzie okresowym są gazy szlachetne?', ['w 18. grupie', 'w 1. grupie', 'w 2. okresie', 'w środku tablicy'], 0, 1),
    S('Jaki symbol ma potas?', ['K', 'P', 'Po', 'Pt'], 0, 1),
    S('Który pierwiastek jest gazem szlachetnym?', ['neon', 'tlen', 'wodór', 'fluor'], 0, 1),
    N('W której grupie układu okresowego leży sód?', '1', 1),
    TF('Oceń zdania o układzie okresowym.', [['Pierwiastki w tej samej grupie mają podobne właściwości.', true], ['Okresy to kolumny tablicy.', false], ['Mendelejew ułożył pierwszą tablicę okresową.', true]], 1),
    C('Metale dobrze przewodzą [prąd/dźwięk]. Niemetale są zwykle [kruche/kowalne].', 1),
    { type: 'match', prompt: 'Połącz symbol z nazwą pierwiastka.', pairs: [{ left: 'Na', right: 'sód' }, { left: 'Cl', right: 'chlor' }, { left: 'Ca', right: 'wapń' }, { left: 'Mg', right: 'magnez' }], cat: cat[1] },
    S('Co to jest związek chemiczny?', ['substancja z atomów różnych pierwiastków', 'mieszanina dwóch substancji', 'substancja z atomów jednego rodzaju', 'roztwór soli w wodzie'], 0, 2),
    S('Który wzór oznacza wodę?', ['H₂O', 'CO₂', 'O₂', 'NaCl'], 0, 2),
    S('Jaki wzór ma dwutlenek węgla?', ['CO₂', 'CO', 'C₂O', 'O₂C₂'], 0, 2),
    N('Ile atomów tlenu jest w cząsteczce CO₂?', '2', 2),
    N('Ile wszystkich atomów jest w cząsteczce H₂O?', '3', 2),
    TF('Oceń zdania o związkach chemicznych.', [['Sól kuchenna to NaCl.', true], ['Tlen O₂ jest związkiem chemicznym.', false], ['Woda składa się z wodoru i tlenu.', true]], 2),
    C('Wzór [H₂O/HO₂/H₂O₂] to woda. Związek powstaje z atomów [różnych/tych samych] pierwiastków.', 2),
    { type: 'order_words', prompt: 'Ułóż zdanie.', sentence: 'Woda jest związkiem chemicznym.', distractors: 'pierwiastkiem', cat: cat[2] },
  ];
}

/* ---------- Lekcja z każdym rodzajem slajdu ---------- */
function demoLesson(atom) {
  const QA = (q, a) => ({ q, a });
  const blk = (kind, extra) => ({ id: newId(), kind, style: 'normal', appear: 'now', delay: '', ...extra });
  return [
    { type: 'title', title: 'Budowa atomu', subtitle: 'Chemia · klasa 7 – z czego zbudowana jest cała materia?', image: atom },
    { type: 'info', title: 'Z czego zbudowany jest atom?', blocks: [
      blk('text', { text: 'Atom składa się z {jądra atomowego} i krążących wokół niego {elektronów}. Kliknij zasłonięte słowa, żeby je odsłonić.' }),
      blk('list', { items: ['proton – ładunek {dodatni}', 'neutron – {brak ładunku}', 'elektron – ładunek {ujemny}'], appear: 'click' }),
      blk('text', { style: 'important', text: 'W obojętnym atomie liczba protonów jest równa liczbie elektronów.', appear: 'click' }),
      blk('image', { image: atom, caption: 'Model atomu – kliknij, aby powiększyć i obrócić', appear: 'click' }),
      blk('text', { style: 'example', text: 'Atom wodoru ma 1 proton i 1 elektron – to najprostszy atom.', appear: 'delay', delay: '0.20' }),
    ] },
    { type: 'copy', title: 'Notatka do zeszytu', time: '3', blocks: [
      blk('table', { table: { rows: 4, cols: 3, header: true, cells: [['Cząstka', 'Gdzie jest?', 'Ładunek'], ['proton', 'w jądrze', '+'], ['neutron', 'w jądrze', '0'], ['elektron', 'wokół jądra', '–']] } }),
      blk('text', { style: 'definition', text: 'Liczba atomowa Z – liczba protonów w jądrze atomu.' }),
    ] },
    { type: 'flashcards', title: 'Powtórka pojęć', cards: [
      { front: 'Proton', back: 'cząstka o ładunku dodatnim, w jądrze atomu' },
      { front: 'Neutron', back: 'cząstka bez ładunku, w jądrze atomu' },
      { front: 'Elektron', back: 'cząstka o ładunku ujemnym, krąży wokół jądra' },
      { front: 'Liczba atomowa', back: 'liczba protonów w jądrze' }] },
    { type: 'question', title: 'Sprawdź się!', question: { type: 'single', prompt: 'Jaki ładunek ma neutron?', options: ['nie ma ładunku', 'dodatni', 'ujemny', 'zmienny'], correct: 0, explanation: 'Neutron jest obojętny elektrycznie.' } },
    { type: 'question', title: 'Ułóż w kolejności', question: { type: 'timeline', prompt: 'Ułóż od najmniejszego do największego.', items: ['elektron', 'atom', 'cząsteczka wody', 'kropla wody'] } },
    { type: 'brainstorm', title: 'Burza mózgów', prompt: 'Gdzie w codziennym życiu spotykamy pierwiastki chemiczne?' },
    { type: 'wheel', title: 'Kto odpowie?', removePicked: true, questions: [
      QA('Jak nazywa się cząstka o ładunku ujemnym?', 'elektron'), QA('Co znajduje się w jądrze atomu?', 'protony i neutrony'),
      QA('Co oznacza liczba atomowa?', 'liczbę protonów'), QA('Ile elektronów ma atom wodoru?', 'jeden')] },
    { type: 'game', title: 'Pojedynek: czerwoni kontra niebiescy', game: 'duel', questions: [
      QA('Symbol chemiczny tlenu?', 'O'), QA('Ile protonów ma atom helu (Z = 2)?', '2'), QA('Jak nazywa się środek atomu?', 'jądro atomowe'),
      QA('Jaki ładunek ma proton?', 'dodatni'), QA('Symbol chemiczny sodu?', 'Na')] },
    { type: 'game', title: 'Kółko i krzyżyk', game: 'tictactoe', questions: [
      QA('Symbol żelaza?', 'Fe'), QA('Symbol miedzi?', 'Cu'), QA('Symbol złota?', 'Au'), QA('Symbol srebra?', 'Ag'), QA('Symbol węgla?', 'C'),
      QA('Symbol azotu?', 'N'), QA('Symbol wapnia?', 'Ca'), QA('Symbol potasu?', 'K'), QA('Symbol chloru?', 'Cl'), QA('Symbol siarki?', 'S'),
      QA('Symbol magnezu?', 'Mg'), QA('Symbol fosforu?', 'P')] },
    { type: 'game', title: 'Va banque – chemia', game: 'vabanque', board: [
      { name: 'Atom', questions: [QA('Cząstka o ładunku ujemnym?', 'elektron'), QA('Cząstka bez ładunku?', 'neutron'), QA('Co oznacza liczba atomowa?', 'liczbę protonów')] },
      { name: 'Symbole', questions: [QA('H to…?', 'wodór'), QA('Fe to…?', 'żelazo'), QA('Hg to…?', 'rtęć')] },
      { name: 'Substancje', questions: [QA('Wzór wody?', 'H₂O'), QA('Sól kuchenna – wzór?', 'NaCl'), QA('Gaz, którym oddychamy?', 'tlen')] }] },
  ].map((x) => ({ id: newId(), title: '', ...x }));
}

const DEMO_CLASS = ['Ania', 'Bartek', 'Celina', 'Damian', 'Ela', 'Filip', 'Gosia', 'Hubert', 'Iga', 'Jan', 'Kasia', 'Leon'];

/** Etap 3 (lekcje, sprawdziany, klasa 7a) – dodawane raz, także do istniejącej bazy z etapu 2. */
export function seedDemoV3() {
  if (one("SELECT value FROM meta WHERE key = 'demo_v3'")) return false;
  const chem = one("SELECT id FROM subjects WHERE slug = 'chemia'");
  if (!chem) return false;
  const teacher = one("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1");
  tx(() => {
    const atom = addImage('atom.png');
    const t = now();
    // przykładowa klasa 7a – do koła fortuny i gier (administrator może ją usunąć w Rejestrze uczniów)
    for (const f of DEMO_CLASS) {
      const last = /a$/.test(f) ? 'Przykładowa' : 'Przykładowy';
      if (!one('SELECT 1 FROM registry WHERE name_key = ?', nameKey(f, last))) {
        run('INSERT INTO registry (first_name, last_name, name_key, class_label, approved_email, created_at, updated_at) VALUES (?,?,?,?,NULL,?,?)', f, last, nameKey(f, last), '7a', t, t);
      }
    }
    const cats = [{ id: newId(), name: 'Budowa atomu' }, { id: newId(), name: 'Układ okresowy' }, { id: newId(), name: 'Związki chemiczne' }];
    const qdoc = { settings: cleanSettings({ categories: cats, deadline: t + 21 * 86400e3, drawCount: 20, shuffleQuestions: true }), questions: cleanQuestions(chemistryQuiz(cats.map((c) => c.id))) };
    const qok = validateTest({ title: 'Sprawdzian: atomy i pierwiastki', kind: 'quiz', ...qdoc }).errors === 0;
    run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at)
         VALUES (?, 'quiz', ?, ?, ?, 1, ?, ?, ?, ?, ?)`, chem.id, 'Sprawdzian: atomy i pierwiastki', 'Przykładowy sprawdzian – 20 losowych pytań z 24, trzy działy. Ocena 1–6 na końcu.', qok ? 'published' : 'draft', JSON.stringify(qdoc), teacher?.id ?? null, teacher?.id ?? null, t, t);
    const ldoc = { settings: { grade: '7', section: 'a' }, slides: cleanSlides(demoLesson(atom)) };
    const lok = validateLesson({ title: 'Budowa atomu', ...ldoc }).errors === 0;
    const lid = run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at)
         VALUES (?, 'lesson', ?, ?, ?, 1, ?, ?, ?, ?, ?)`, chem.id, 'Budowa atomu', 'Przykładowa lekcja: wszystkie rodzaje slajdów, koło fortuny i trzy gry klasowe.', lok ? 'published' : 'draft', JSON.stringify(ldoc), teacher?.id ?? null, teacher?.id ?? null, t, t).lastInsertRowid;
    // lekcja jest wspólna dla wszystkich klas – przykładowo opublikowana dla klasy 7a
    if (lok) run('INSERT OR IGNORE INTO lesson_classes (lesson_id, class_label, published, published_at, by_user) VALUES (?,?,1,?,?)', lid, '7a', t, teacher?.id ?? null);
    run("INSERT INTO meta (key, value) VALUES ('demo_v3', ?)", String(t));
  });
  void all;
  return true;
}

export function seedDemo() {
  if (one("SELECT value FROM meta WHERE key = 'demo_tests'")) return false;
  const chem = one("SELECT id FROM subjects WHERE slug = 'chemia'");
  const bio = one("SELECT id FROM subjects WHERE slug = 'biologia'");
  const teacher = one("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1");
  if (!chem || !bio) return false;
  tx(() => {
    const atom = addImage('atom.png');
    const cellImg = addImage('komorka.png');
    const add = (subjectId, kind, title, summary, questions, settings = {}) => {
      const doc = { settings: cleanSettings(settings), questions: cleanQuestions(questions) };
      const ok = validateTest({ title, kind, ...doc }).errors === 0;
      const t = now();
      run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at)
           VALUES (?,?,?,?,?,1,?,?,?,?,?)`, subjectId, kind, title, summary, ok ? 'published' : 'draft', JSON.stringify(doc), teacher?.id ?? null, teacher?.id ?? null, t, t);
    };
    add(chem.id, 'teaching_test', 'Przykład: wszystkie rodzaje pytań', 'Pokaz 15 rodzajów pytań EDUKRO – pierwiastki, związki i budowa atomu.', chemistryAll(atom));
    add(chem.id, 'exam_test', 'Egzamin próbny: pierwiastki i związki', 'Krótki egzamin – 6 pytań na czas, możesz pomylić się 2 razy.', chemistryExam(), { maxMistakes: 2, defaultTime: '0.45' });
    add(bio.id, 'teaching_test', 'Budowa komórki i królestwa', 'Podpisz komórkę, rozdziel organizmy i uzupełnij tabelę.', biology(cellImg));
    run("INSERT INTO meta (key, value) VALUES ('demo_tests', ?)", String(now()));
  });
  return true;
}
/** 0.6: przykładowe dzienne pytania z chemii i biologii (nauczyciel może je edytować, wyłączyć albo usunąć). */
export function seedDemoV6() {
  if (one("SELECT value FROM meta WHERE key = 'demo_v6'")) return false;
  const chem = one("SELECT id FROM subjects WHERE slug = 'chemia'");
  const bio = one("SELECT id FROM subjects WHERE slug = 'biologia'");
  if (!chem || !bio) return false;
  const teacher = one("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1");
  const S = (prompt, options, correct, explanation = '') => ({ type: 'single', prompt, options, correct, explanation });
  const bank = [
    [chem.id, S('Jaki jest symbol chemiczny złota?', ['Ag', 'Au', 'Zn', 'Al'], 1, 'Au – od łacińskiego aurum.')],
    [chem.id, S('Który gaz jest potrzebny do spalania?', ['azot', 'hel', 'tlen', 'neon'], 2, 'Bez tlenu nie ma spalania.')],
    [chem.id, { type: 'truefalse', prompt: 'Oceń, czy zdania są prawdziwe.', statements: [{ text: 'Woda to pierwiastek.', answer: false }, { text: 'Sól kuchenna to chlorek sodu.', answer: true }, { text: 'Rtęć jest metalem.', answer: true }] }],
    [chem.id, { type: 'number', prompt: 'Ile protonów ma atom węgla?', value: '6', tolerance: '', unit: '' }],
    [chem.id, { type: 'cloze', prompt: 'Uzupełnij lukę.', text: 'Wzór chemiczny wody to (H2O/H₂O).' }],
    [chem.id, { type: 'listen', prompt: 'Posłuchaj i zapisz po angielsku nazwę pierwiastka.', phrase: 'hydrogen', lang: 'en-GB', voice: '', accept: '', exact: true, explanation: 'Hydrogen to po angielsku wodór.' }],
    [bio.id, S('Która część komórki zawiera DNA?', ['jądro', 'błona', 'wakuola', 'ściana'], 0, 'Materiał genetyczny jest w jądrze komórkowym.')],
    [bio.id, S('Rośliny wytwarzają pokarm w procesie…', ['oddychania', 'fotosyntezy', 'trawienia', 'krążenia'], 1)],
    [bio.id, { type: 'match', prompt: 'Połącz zwierzę z gromadą.', pairs: [{ left: 'żaba', right: 'płazy' }, { left: 'orzeł', right: 'ptaki' }, { left: 'rekin', right: 'ryby' }] }],
    [bio.id, S('Ile komór ma serce człowieka?', ['2', '3', '4', '5'], 2, 'Dwa przedsionki i dwie komory – razem cztery jamy, w tym dwie komory.')],
  ];
  tx(() => {
    const t = now();
    for (const [sid, q] of bank) run('INSERT INTO daily_questions (subject_id, question_json, active, created_by, created_at, updated_at) VALUES (?,?,1,?,?,?)', sid, JSON.stringify(cleanQuestions([q])[0]), teacher?.id ?? null, t, t);
    run("INSERT INTO meta (key, value) VALUES ('demo_v6', ?)", String(t));
  });
  return true;
}
export { demoLesson, addImage, chemistryAll };
