// 0.7: dwie przykładowe gry z chemii (Saper i Hammer Game) – od razu opublikowane, żeby było widać, jak działają.
// Dodawane raz (znacznik w tabeli meta). Nauczyciel może je edytować, skopiować albo usunąć.
import { one, run, now, tx } from '../db.js';
import { cleanGame } from './engine.js';
import { validateGame } from '../../public/js/shared/game-rules.js';
import { newId } from '../../public/js/shared/quiz-rules.js';

const cell = (t, s = 'show', extra = {}) => ({ t, s, lock: false, g: '', ...extra });
const tf = (text, answer) => ({ id: newId(), kind: 'tf', text, answer });
const ch = (prompt, options, correct = 0) => ({ id: newId(), kind: 'choice', prompt, options, correct });

export function saperDemo() {
  return {
    type: 'saper', time: 480, points: 30,
    events: [
      { id: newId(), kind: 'wire', prompt: 'Który pierwiastek ma symbol O?', options: ['tlen', 'osm', 'złoto', 'ołów'], correct: 0 },
      { id: newId(), kind: 'torch', question: { id: newId(), type: 'open', prompt: 'Jak nazywa się najmniejsza część pierwiastka, która zachowuje jego właściwości?',
        series: ['atom / atomy / atomu / atomem'], minWords: '', maxWords: '20', sample: 'Atom.', hint: '', explanation: '' } },
      { id: newId(), kind: 'trojan', question: { id: newId(), type: 'timeline', prompt: 'Ułóż pierwiastki od najlżejszego do najcięższego atomu.', items: ['wodór', 'hel', 'węgiel', 'tlen'] } },
      { id: newId(), kind: 'crossword', rows: 8, cols: 10,
        words: [
          { id: newId(), clue: 'Najlżejszy pierwiastek.', answer: 'WODÓR', cells: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]] },
          { id: newId(), clue: 'Gaz potrzebny do spalania.', answer: 'TLEN', cells: [[0, 7], [1, 7], [2, 7], [3, 7]] },
          { id: newId(), clue: 'Metal o symbolu Na.', answer: 'SÓD', cells: [[0, 4], [1, 4], [2, 4]] },
          { id: newId(), clue: 'Najmniejsza część pierwiastka (pola idą zakrętem!).', answer: 'ATOM', cells: [[4, 4], [4, 5], [5, 5], [6, 5]] },
        ],
        code: [[0, 4], [1, 2], [1, 3], [4, 4]], // S O D A
        tasks: [
          { id: newId(), type: 'open', prompt: 'Jak nazywa się przejście substancji ze stanu stałego w ciecz?', series: ['topnienie / topnieniem / topnienia / topnieje'], minWords: '', maxWords: '15', sample: 'Topnienie.' },
          { id: newId(), type: 'table', prompt: 'Uzupełnij symbole pierwiastków.', table: { rows: 4, cols: 2, headerRow: true, headerCol: false, groupRepeat: {},
            cells: [[cell('Pierwiastek'), cell('Symbol')], [cell('tlen'), cell('O')], [cell('żelazo'), cell('Fe', 'blank')], [cell('wapń'), cell('Ca', 'blank')]] } },
          { id: newId(), type: 'truefalse', prompt: 'Oceń, czy zdania są prawdziwe.', statements: [
            { text: 'Pod ciśnieniem normalnym woda wrze w 100°C.', answer: true }, { text: 'Hel jest metalem.', answer: false }, { text: 'Atom ma jądro.', answer: true }] },
        ] },
      { id: newId(), kind: 'files',
        questions: [{ prompt: 'Symbol żelaza', answer: 'Fe' }, { prompt: 'Symbol srebra', answer: 'Ag' }, { prompt: 'Symbol potasu', answer: 'K' }, { prompt: 'Symbol wapnia', answer: 'Ca' }],
        decoys: ['Ze', 'Zl', 'Sr', 'Si', 'P', 'Po', 'Au', 'Wa', 'Cl', 'Kr', 'Pb', 'Fl'] },
    ],
    katana: { questions: [
      tf('Złoto ma symbol Au.', true),
      ch('Ile protonów ma atom wodoru?', ['1', '2', '0', '4']),
      tf('Azot jest metalem.', false),
      ch('Który gaz wydychamy?', ['dwutlenek węgla', 'hel', 'neon', 'chlor']),
      tf('H₂O to wzór wody.', true),
      ch('Co oznacza symbol C?', ['węgiel', 'wapń', 'chlor', 'miedź']),
    ] },
  };
}

export function hammerDemo() {
  return {
    type: 'hammer', points: 30,
    stages: { cards: true, bugs: true, pairs: true, test: true, approve: true },
    cards: [
      tf('Tlen jest potrzebny do spalania.', true),
      tf('Woda to pierwiastek.', false),
      tf('Symbol sodu to Na.', true),
      ch('Który z nich jest metalem?', ['żelazo', 'tlen', 'azot', 'hel']),
      tf('Rtęć w temperaturze pokojowej jest cieczą.', true),
      tf('Atom składa się tylko z protonów.', false),
      tf('Złoto rdzewieje na powietrzu.', false),
      ch('Jaki jest wzór wody?', ['H₂O', 'CO₂', 'O₂', 'NaCl']),
      tf('Hel jest lżejszy od powietrza.', true),
      tf('Sól kuchenna to chlorek sodu.', true),
      ch('Który gaz jest szlachetny?', ['neon', 'tlen', 'wodór', 'chlor']),
      tf('Elektron ma ładunek dodatni.', false),
    ],
    bugs: {
      questions: [
        { id: newId(), prompt: 'Który pierwiastek ma symbol He?', answer: 'hel' },
        { id: newId(), prompt: 'Symbol H oznacza…', answer: 'wodór' },
        { id: newId(), prompt: 'Gaz, którym oddychamy:', answer: 'tlen' },
        { id: newId(), prompt: 'Metal szlachetny o symbolu Au:', answer: 'złoto' },
      ],
      decoys: ['żelazo', 'atom'],
    },
    pairs: [
      { id: newId(), left: 'Na', right: 'sód' }, { id: newId(), left: 'Fe', right: 'żelazo' },
      { id: newId(), left: 'Cu', right: 'miedź' }, { id: newId(), left: 'Cl', right: 'chlor' },
    ],
    test: [
      ch('Ile elektronów ma atom wodoru?', ['1', '2', '3', '0']),
      ch('Co jest związkiem chemicznym?', ['woda', 'tlen', 'żelazo', 'złoto']),
      ch('Który pierwiastek jest gazem?', ['azot', 'miedź', 'siarka', 'węgiel']),
      ch('Symbol Ag oznacza…', ['srebro', 'złoto', 'argon', 'glin']),
      ch('Jądro atomu tworzą…', ['protony i neutrony', 'tylko elektrony', 'elektrony i protony', 'tylko neutrony']),
      ch('W jakiej temperaturze zamarza woda?', ['0°C', '100°C', '−10°C', '4°C']),
    ],
    approve: [
      tf('Miedź dobrze przewodzi prąd.', true),
      tf('Tlen ma symbol T.', false),
      tf('Dwutlenek węgla gasi ogień.', true),
      tf('Woda wrze w 50°C pod ciśnieniem normalnym.', false),
      tf('Węgiel występuje w każdym organizmie.', true),
    ],
  };
}

export function seedDemoV7() {
  if (one("SELECT value FROM meta WHERE key = 'demo_v7'")) return false;
  const chem = one("SELECT id FROM subjects WHERE slug = 'chemia'");
  if (!chem) return false;
  const teacher = one("SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1");
  tx(() => {
    const t = now();
    const add = (title, summary, raw) => {
      const doc = cleanGame(raw);
      const ok = validateGame(doc).errors === 0;
      if (!ok) console.warn('[EDUKRO] Przykładowa gra ma błędy:', title, validateGame(doc).problems.filter((p) => p.level === 'error'));
      run(`INSERT INTO activities (subject_id, kind, title, summary, status, requires_account, content_json, created_by, updated_by, created_at, updated_at, published_at)
           VALUES (?, 'game', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`, chem.id, title, summary, ok ? 'published' : 'draft', JSON.stringify(doc), teacher?.id ?? null, teacher?.id ?? null, t, t, ok ? t : null);
    };
    add('Saper: bomba w laboratorium', 'Przykładowa gra: kabel, palnik, trojan, krzyżówka z kodem dostępu, usuwanie plików i katana. Jeden błąd = wybuch!', saperDemo());
    add('Hammer Game: chemia na szybko', 'Przykładowa gra: kartki TAK/NIE, żuki, pary, test młotkiem i APPROVED / DECLINED.', hammerDemo());
    run("INSERT INTO meta (key, value) VALUES ('demo_v7', ?)", String(t));
  });
  return true;
}
