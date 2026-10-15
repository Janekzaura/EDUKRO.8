// Formularze edycji poszczególnych rodzajów pytań. Każdy zmienia obiekt pytania „q” w miejscu
// i woła c.changed() (zapis + odświeżenie podpowiedzi) albo c.changed(true) (przerysowanie formularza).
import { h, icon, toast, dialog } from '../ui.js';
import { pickImage, mediaUrl, uploadFile } from '../media.js';
import { LIMITS, parseSlash, parseCloze, sentenceWords, cellName, colName, clean, SPEECH_LANGS } from '../shared/quiz-rules.js';
import * as sound from '../sound.js';
import { stepper } from './tests-list.js';

/* ---------- Drobne klocki ---------- */
export function txt(value, onInput, attrs = {}) {
  const el = h('input', { class: 'input', value: value ?? '', maxlength: LIMITS.text, ...attrs });
  el.addEventListener('input', () => onInput(el.value));
  return el;
}
export function area(value, onInput, attrs = {}) {
  const el = h('textarea', { class: 'textarea', rows: attrs.rows || 3, ...attrs });
  el.value = value ?? '';
  const grow = () => { el.style.height = 'auto'; el.style.height = `${Math.min(520, el.scrollHeight + 2)}px`; };
  el.addEventListener('input', () => { grow(); onInput(el.value); });
  requestAnimationFrame(grow);
  return el;
}
export function box(title, lead, ...children) {
  return h('section', { class: 'qe-box' }, title ? h('h3', { class: 'qe-box__title' }, title) : null, lead ? h('p', { class: 'qe-box__lead' }, lead) : null, ...children);
}
const labelled = (label, el, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), el, hint ? h('span', { class: 'field__hint' }, hint) : null);
function removeBtn(label, onClick, disabled) {
  return h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': label, title: label, disabled, onClick }, icon('trash'));
}
function addBtn(label, onClick, { count, max } = {}) {
  const full = max !== undefined && count >= max;
  return h('button', { class: 'btn btn--ghost btn--sm add-btn', type: 'button', disabled: full, onClick }, icon('plus'), label,
    max !== undefined ? h('span', { class: 'add-btn__count' }, `${count}/${max}`) : null);
}
const focusLast = (root, sel) => requestAnimationFrame(() => { const all = root.isConnected ? document.querySelectorAll(sel) : []; all[all.length - 1]?.focus(); });

/** Pole słów (chipsy) – Enter albo przecinek dodaje słowo. */
export function chipsInput(list, onChange, { max = LIMITS.keywords, placeholder = 'wpisz słowo i naciśnij Enter' } = {}) {
  const wrap = h('div', { class: 'chips-input' });
  const inp = h('input', { class: 'chips-input__field', placeholder, maxlength: 80, 'aria-label': 'Nowe słowo kluczowe' });
  const count = h('span', { class: 'chips-input__count' });
  const render = () => {
    wrap.replaceChildren(...list.map((k, i) => h('span', { class: 'kw' }, k,
      h('button', { type: 'button', 'aria-label': `Usuń słowo ${k}`, onClick: () => { list.splice(i, 1); render(); onChange(); } }, icon('x')))),
    inp, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: add, disabled: list.length >= max }, 'Dodaj'), count);
    count.textContent = `${list.length}/${max}`;
    inp.disabled = list.length >= max;
  };
  function add() {
    const parts = inp.value.split(/[,;]/).map(clean).filter(Boolean);
    let added = 0;
    for (const p of parts) {
      if (list.length >= max) { toast(`Najwyżej ${max} słów kluczowych.`, 'error'); break; }
      if (list.some((k) => k.toLocaleLowerCase('pl-PL') === p.toLocaleLowerCase('pl-PL'))) continue;
      list.push(p); added++;
    }
    inp.value = '';
    render();
    if (added) onChange();
    inp.focus();
  }
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
  inp.addEventListener('blur', () => { if (inp.value.trim()) add(); });
  render();
  return wrap;
}

/** Obrazek (opcjonalny lub wymagany): podgląd + zmień/usuń, albo pole „Dodaj obrazek”. */
export function imageField({ value, onChange, label = 'Dodaj obrazek', big = false }) {
  const el = h('div', { class: ['img-field', big && 'img-field--big'] });
  const render = (id) => {
    if (id) {
      el.replaceChildren(h('img', { src: mediaUrl(id), alt: 'Obrazek do pytania' }),
        h('div', { class: 'img-field__actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: choose }, icon('image'), 'Zmień'),
          h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => { render(null); onChange(null); } }, icon('trash'), 'Usuń')));
    } else {
      const drop = h('button', { class: 'img-drop', type: 'button', onClick: choose }, icon('image'), h('span', {}, label), h('small', {}, 'JPG, PNG lub WEBP – kliknij albo upuść plik tutaj'));
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', async (e) => {
        e.preventDefault(); drop.classList.remove('is-over');
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        el.classList.add('is-busy');
        try { const r = await uploadFile(f); render(r.id); onChange(r.id); } catch (ex) { toast(ex.message, 'error'); }
        el.classList.remove('is-busy');
      });
      el.replaceChildren(drop);
    }
  };
  async function choose() {
    el.classList.add('is-busy');
    const r = await pickImage();
    el.classList.remove('is-busy');
    if (r) { render(r.id); onChange(r.id); }
  }
  render(value);
  return el;
}

/* ====================================================================== */
export const EDITORS = {
  single(q, c) {
    const rows = q.options.map((o, i) => {
      const correct = q.correct === i;
      const mark = h('button', { class: ['mark', correct && 'is-on'], type: 'button', 'aria-pressed': String(correct) },
        icon('check'), h('span', {}, correct ? 'Poprawna' : 'Ustaw jako poprawną'));
      mark.addEventListener('click', () => { q.correct = i; c.changed(true); });
      return h('div', { class: ['opt-row', correct && 'is-correct'] }, h('span', { class: 'opt-letter' }, 'ABCD'[i]),
        txt(o, (v) => { q.options[i] = v; c.changed(); }, { placeholder: `Odpowiedź ${'ABCD'[i]}`, 'aria-label': `Odpowiedź ${'ABCD'[i]}` }), mark);
    });
    return box('Odpowiedzi', 'Wpisz cztery odpowiedzi i przy właściwej kliknij „Ustaw jako poprawną”. Uczeń zobaczy je w losowej kolejności (możesz to wyłączyć w ustawieniach testu).', ...rows);
  },

  multi(q, c) {
    const root = box('Odpowiedzi', 'Wpisz odpowiedzi i zaznacz WSZYSTKIE poprawne. Uczeń musi wskazać dokładnie te zaznaczone.');
    q.options.forEach((o, i) => {
      const mark = h('button', { class: ['mark', o.correct && 'is-on'], type: 'button', 'aria-pressed': String(o.correct) }, icon('check'), h('span', {}, o.correct ? 'Poprawna' : 'Błędna'));
      mark.addEventListener('click', () => { o.correct = !o.correct; c.changed(true); });
      root.append(h('div', { class: ['opt-row', o.correct && 'is-correct'] }, h('span', { class: 'opt-letter' }, String(i + 1)),
        txt(o.text, (v) => { o.text = v; c.changed(); }, { placeholder: `Odpowiedź ${i + 1}`, 'aria-label': `Odpowiedź ${i + 1}`, class: 'input opt-input' }), mark,
        removeBtn(`Usuń odpowiedź ${i + 1}`, () => { q.options.splice(i, 1); c.changed(true); }, q.options.length <= 2)));
    });
    root.append(addBtn('Dodaj odpowiedź', () => { q.options.push({ text: '', correct: false }); c.changed(true); focusLast(root, '.opt-input'); }, { count: q.options.length, max: LIMITS.options }));
    return root;
  },

  truefalse(q, c) {
    const root = box('Zdania', 'Wpisz od 3 do 5 zdań i przy każdym wybierz, czy jest prawdziwe, czy fałszywe.');
    q.statements.forEach((s, i) => {
      const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Zdanie ${i + 1}` },
        ...[[true, 'Prawda'], [false, 'Fałsz']].map(([v, l]) => {
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(s.answer === v), class: v ? 'seg--true' : 'seg--false' }, l);
          b.addEventListener('click', () => { s.answer = v; c.changed(true); });
          return b;
        }));
      root.append(h('div', { class: 'opt-row opt-row--tf' }, h('span', { class: 'opt-letter' }, String(i + 1)),
        txt(s.text, (v) => { s.text = v; c.changed(); }, { placeholder: 'np. Woda wrze w 100°C.', 'aria-label': `Zdanie ${i + 1}`, class: 'input tf-input' }), seg,
        removeBtn(`Usuń zdanie ${i + 1}`, () => { q.statements.splice(i, 1); c.changed(true); }, q.statements.length <= 3)));
    });
    root.append(addBtn('Dodaj zdanie', () => { q.statements.push({ text: '', answer: null }); c.changed(true); focusLast(root, '.tf-input'); }, { count: q.statements.length, max: LIMITS.statements }));
    return root;
  },

  open(q, c) {
    return openFields(q, c);
  },

  number(q, c) {
    return box('Poprawny wynik', 'Uczeń wpisze liczbę. Przecinek i kropka są traktowane tak samo (3,5 = 3.5).',
      h('div', { class: 'row-3' },
        labelled('Poprawna liczba', txt(q.value, (v) => { q.value = v; c.changed(); }, { inputmode: 'decimal', placeholder: 'np. 12' })),
        labelled('Dopuszczalny błąd ±', txt(q.tolerance, (v) => { q.tolerance = v; c.changed(); }, { inputmode: 'decimal', placeholder: 'np. 0,5 (opcjonalnie)' }), 'Puste = wynik musi być dokładny.'),
        labelled('Jednostka', txt(q.unit, (v) => { q.unit = v; c.changed(); }, { maxlength: 20, placeholder: 'np. g, cm³ (opcjonalnie)' }))));
  },

  match(q, c) {
    const root = box('Pary', `Wpisz pary, które do siebie pasują (od 2 do ${LIMITS.pairs}). Uczeń zobaczy prawą kolumnę pomieszaną i połączy je linią.`);
    root.append(h('div', { class: 'pair-head', 'aria-hidden': 'true' }, h('span', {}, 'Lewa kolumna'), h('span', {}), h('span', {}, 'Prawa kolumna (pasujący element)')));
    q.pairs.forEach((p, i) => {
      root.append(h('div', { class: 'pair-row' },
        txt(p.left, (v) => { p.left = v; c.changed(); }, { placeholder: 'np. dom', 'aria-label': `Para ${i + 1}, lewa strona`, class: 'input pair-left' }),
        h('span', { class: 'pair-link', 'aria-hidden': 'true' }, icon('arrowRight')),
        txt(p.right, (v) => { p.right = v; c.changed(); }, { placeholder: 'np. budynek', 'aria-label': `Para ${i + 1}, prawa strona` }),
        removeBtn(`Usuń parę ${i + 1}`, () => { q.pairs.splice(i, 1); c.changed(true); }, q.pairs.length <= 2)));
    });
    root.append(addBtn('Dodaj parę', () => { q.pairs.push({ left: '', right: '' }); c.changed(true); focusLast(root, '.pair-left'); }, { count: q.pairs.length, max: LIMITS.pairs }));
    return root;
  },

  order_words(q, c) {
    const preview = h('div', { class: 'tiles-preview' });
    const renderPreview = () => {
      const words = [...sentenceWords(q.sentence).map((w) => [w, false]), ...parseSlash(q.distractors).map((w) => [w, true])];
      preview.replaceChildren(...(words.length ? shuffledPreview(words).map(([w, extra]) => h('span', { class: ['tile-prev', extra && 'is-extra'] }, w)) : [h('span', { class: 'muted small' }, 'Tu pojawią się rozsypane słowa.')]));
    };
    renderPreview();
    c.onAnyChange(renderPreview);
    return box('Zdanie do ułożenia', null,
      labelled('Poprawne zdanie', txt(q.sentence, (v) => { q.sentence = v; c.changed(); }, { placeholder: 'np. Woda jest związkiem wodoru i tlenu.' }), 'Wpisz zdanie dokładnie tak, jak ma je ułożyć uczeń.'),
      labelled('Zbędne słowa (opcjonalnie)', txt(q.distractors, (v) => { q.distractors = v; c.changed(); }, { placeholder: 'np. azotu / pierwiastkiem' }), 'Słowa-pułapki, oddzielone ukośnikiem /. Ich liczbę wybierasz sam.'),
      c.cmd('distractors'),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Tak uczeń zobaczy rozsypane słowa (zbędne zaznaczone tu na czerwono):'), preview));
  },

  timeline(q, c) {
    const root = box('Elementy w poprawnej kolejności', 'Wpisz elementy w kolejności, która jest POPRAWNA. Uczeń zobaczy je pomieszane i będzie musiał je ułożyć. W treści pytania napisz, według czego układać (np. „od największej do najmniejszej”).');
    const list = h('ol', { class: 'tl-list' });
    q.items.forEach((it, i) => {
      const row = h('li', { class: 'tl-row' }, h('span', { class: 'opt-letter' }, String(i + 1)),
        txt(it, (v) => { q.items[i] = v; c.changed(); }, { placeholder: i === 0 ? 'pierwszy element' : `element ${i + 1}`, 'aria-label': `Element ${i + 1}`, class: 'input tl-input' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Przesuń element ${i + 1} w górę`, disabled: i === 0, onClick: () => move(i, -1) }, icon('up')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Przesuń element ${i + 1} w dół`, disabled: i === q.items.length - 1, onClick: () => move(i, 1) }, icon('down')),
        removeBtn(`Usuń element ${i + 1}`, () => { q.items.splice(i, 1); c.changed(true); }, q.items.length <= 2));
      list.append(row);
    });
    function move(i, d) { const [x] = q.items.splice(i, 1); q.items.splice(i + d, 0, x); c.changed(true); }
    root.append(list, addBtn('Dodaj element', () => { q.items.push(''); c.changed(true); focusLast(root, '.tl-input'); }, { count: q.items.length, max: LIMITS.timeline }));
    return root;
  },

  cloze(q, c) { return clozeEditor(q, c, 'open'); },
  cloze_choice(q, c) { return clozeEditor(q, c, 'choice'); },
  table: tableEditor,

  categorize(q, c) {
    const root = box('Kategorie', `Utwórz od 2 do ${LIMITS.categories} kategorii. W każdej wpisz słowa oddzielone ukośnikiem /, np. brzoza / dąb / jabłoń. Uczeń zobaczy wszystkie słowa pomieszane i przeciągnie je do właściwych kategorii.`);
    const grid = h('div', { class: 'cat-ed' });
    q.categories.forEach((cat, i) => {
      grid.append(h('div', { class: 'cat-ed__card' },
        h('div', { class: 'cat-ed__head' },
          txt(cat.name, (v) => { cat.name = v; c.changed(); }, { maxlength: 80, placeholder: `Nazwa kategorii ${i + 1}, np. Drzewa`, 'aria-label': `Nazwa kategorii ${i + 1}`, class: 'input cat-name' }),
          removeBtn(`Usuń kategorię ${i + 1}`, () => { q.categories.splice(i, 1); c.changed(true); }, q.categories.length <= 2)),
        area(cat.items, (v) => { cat.items = v; c.changed(); }, { rows: 2, maxlength: 1000, placeholder: 'brzoza / dąb / drzewo wiśniowe / jabłoń', 'aria-label': `Słowa w kategorii ${i + 1}` }),
        c.cmd(`cat${i}`)));
    });
    root.append(grid, addBtn('Dodaj kategorię', () => { q.categories.push({ name: '', items: '' }); c.changed(true); focusLast(root, '.cat-name'); }, { count: q.categories.length, max: LIMITS.categories }));
    return root;
  },

  image_labels: imageLabelsEditor,

  data(q, c) {
    const root = h('div', {});
    root.append(box('Tekst (dane) do przeczytania', 'Uczeń najpierw czyta ten tekst. Gdy kliknie „Dalej”, tekst zniknie i uczeń odpowie pisemnie na pytania poniżej.',
      area(q.passage, (v) => { q.passage = v; c.changed(); }, { rows: 6, maxlength: LIMITS.passage, placeholder: 'np. Woda (H₂O) wrze w temperaturze 100°C…' })));
    const subs = box('Pytania do tekstu', `Od 1 do ${LIMITS.subQuestions} pytań. Każde sprawdzane jest tak jak odpowiedź pisemna – seriami słów kluczowych, których uczeń nie widzi.`);
    q.questions.forEach((s, i) => {
      subs.append(h('div', { class: 'sub-q' },
        h('div', { class: 'sub-q__head' }, h('span', { class: 'opt-letter' }, String(i + 1)), h('strong', {}, `Pytanie ${i + 1}`),
          removeBtn(`Usuń pytanie ${i + 1}`, () => { q.questions.splice(i, 1); c.changed(true); }, q.questions.length <= 1)),
        area(s.prompt, (v) => { s.prompt = v; c.changed(); }, { rows: 2, maxlength: LIMITS.prompt, placeholder: 'np. W jakiej temperaturze wrze woda?', class: 'textarea sub-q-input' }),
        seriesEditor(s, c, { compact: true })));
    });
    subs.append(addBtn('Dodaj pytanie do tekstu', () => { q.questions.push({ prompt: '', series: [''], minWords: '', maxWords: '', sample: '' }); c.changed(true); focusLast(subs, '.sub-q-input'); }, { count: q.questions.length, max: LIMITS.subQuestions }));
    root.append(subs);
    return root;
  },

  listen(q, c) {
    const lang = h('select', { class: 'select', 'aria-label': 'Język lektora' }, ...SPEECH_LANGS.map(([id, name]) => h('option', { value: id, selected: id === q.lang }, name)));
    lang.addEventListener('change', () => { q.lang = lang.value; c.changed(); });
    const voice = h('select', { class: 'select', 'aria-label': 'Głos lektora' },
      ...[['', 'Głos wybrany przez ucznia'], ...sound.VOICES.map((v) => [v.id, `${v.name} – ${v.sub}`])].map(([id, name]) => h('option', { value: id, selected: id === (q.voice || '') }, name)));
    voice.addEventListener('change', () => { q.voice = voice.value; c.changed(); });
    const listen = (rate) => {
      if (!clean(q.phrase)) return;
      sound.speak(q.phrase, { force: true, lang: q.lang, voice: q.voice || null, rate });
    };
    const exact = h('input', { type: 'checkbox', checked: q.exact !== false });
    exact.addEventListener('change', () => { q.exact = exact.checked; c.changed(); });
    return box('Co powie lektor', 'Uczeń kliknie „Posłuchaj” (może słuchać ile razy chce, także wolniej) i zapisze, co usłyszał. Dobre do nauki wymowy i pisowni w językach obcych.',
      labelled('Słowo albo zdanie dla lektora', txt(q.phrase, (v) => { q.phrase = v; c.changed(); }, { placeholder: 'np. The weather is beautiful today.', 'data-field': 'phrase' }), 'Dokładnie to uczeń ma zapisać.'),
      h('div', { class: 'row-2' }, labelled('Język', lang), labelled('Głos', voice)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => listen() }, icon('play'), 'Posłuchaj'),
        h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => listen(0.65) }, icon('clock'), 'Wolniej')),
      labelled('Inne poprawne zapisy (opcjonalnie)', txt(q.accept, (v) => { q.accept = v; c.changed(); }, { placeholder: 'np. colour / color', 'data-field': 'accept' }), 'Oddziel ukośnikiem /. Wielkość liter, kropki i przecinki nie mają znaczenia.'),
      c.cmd('accept'),
      h('label', { class: 'check-row' }, exact, 'Wymagaj dokładnej pisowni (bez literówek)'));
  },
};

function shuffledPreview(arr) {
  // stałe „losowe” ułożenie, żeby podgląd nie skakał przy każdej literze
  return arr.map((x, i) => [x, ((i + 1) * 7919) % 101]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

/** Serie słów kluczowych + minimum/maksimum słów + przykładowa odpowiedź (pytanie pisemne i pytania do tekstu). */
function seriesEditor(q, c, { compact = false } = {}) {
  const wrap = h('div', { class: ['series-ed', compact && 'series-ed--compact'] });
  q.series ||= [''];
  q.series.forEach((sv, i) => {
    wrap.append(h('div', { class: 'series-row' },
      h('span', { class: 'series-row__label' }, `Seria ${i + 1}`),
      txt(sv, (v) => { q.series[i] = v; c.changed(); }, { maxlength: LIMITS.seriesText, placeholder: i === 0 ? 'np. ser / białko / mleko' : i === 1 ? 'np. miska / kubek / talerz' : 'słowa oddzielone ukośnikiem /', 'aria-label': `Seria słów kluczowych ${i + 1}`, class: 'input series-input' }),
      removeBtn(`Usuń serię ${i + 1}`, () => { q.series.splice(i, 1); c.changed(true); }, q.series.length <= 1)),
    compact ? null : c.cmd(`series${i}`));
  });
  wrap.append(addBtn('Dodaj serię', () => { q.series.push(''); c.changed(true); focusLast(wrap, '.series-input'); }, { count: q.series.length, max: LIMITS.series }),
    h('div', { class: 'row-2' },
      labelled('Minimum słów w odpowiedzi', txt(q.minWords, (v) => { q.minWords = v; c.changed(); }, { inputmode: 'numeric', maxlength: 3, placeholder: 'np. 10', 'data-field': compact ? null : 'minWords' }), 'Krótsza odpowiedź nie zostanie zaliczona. Uczeń widzi licznik słów.'),
      labelled('Maksimum słów (opcjonalnie)', txt(q.maxWords, (v) => { q.maxWords = v; c.changed(); }, { inputmode: 'numeric', maxlength: 3, placeholder: 'bez limitu', 'data-field': compact ? null : 'maxWords' }), 'Dłuższej odpowiedzi uczeń nie wyśle.')),
    labelled('Przykładowa dobra odpowiedź (opcjonalnie)', area(q.sample, (v) => { q.sample = v; c.changed(); }, { rows: 2, maxlength: LIMITS.sample, placeholder: 'np. Mleko piję z kubka, a ser kładę na talerzu.' }),
      'W teście nauczającym uczeń zobaczy ją po błędnej odpowiedzi – zamiast słów kluczowych, które pozostają tajemnicą.'));
  return wrap;
}

function openFields(q, c) {
  return box('Jak sprawdzić odpowiedź', null,
    h('div', { class: 'help-card' }, icon('info'), h('div', {},
      h('p', {}, 'Odpowiedź jest zaliczona, gdy uczeń użyje ', h('b', {}, 'co najmniej jednego słowa z każdej serii'), ' (w dowolnej kolejności) i napisze wymaganą liczbę słów.'),
      h('p', { class: 'small' }, 'Przykład: seria 1 „ser / białko / mleko”, seria 2 „miska / kubek / talerz” → „Mleko wlewam do kubka” jest dobrze, „Lubię mleko” – źle (brak słowa z serii 2).'),
      h('p', { class: 'small muted' }, 'Uczeń nigdy nie zobaczy słów kluczowych ani nie dowie się, że odpowiedź jest sprawdzana w ten sposób. EDUKRO rozpoznaje typowe końcówki (białko → białka, białkiem; kubek → kubka) – gdy forma bardzo się zmienia (pies → psa), dopisz ją do serii.'))),
    seriesEditor(q, c),
    c.spellingNote());
}

/* ---------- Luki w zdaniu ---------- */
function clozeEditor(q, c, mode) {
  const open = mode === 'open';
  const preview = h('div', { class: 'cloze-prev' });
  const renderPreview = () => {
    const r = parseCloze(q.text, mode);
    if (!clean(q.text)) { preview.replaceChildren(h('span', { class: 'muted small' }, 'Tu zobaczysz zdanie tak, jak zobaczy je uczeń.')); return; }
    preview.replaceChildren(...r.segments.map((s) => (s.t === 'text' ? s.v
      : open ? h('span', { class: 'gap-prev' }, ' '.repeat(Math.max(6, (s.answers[0] || '').length)))
        : h('span', { class: 'gap-prev gap-prev--choice' }, s.answers[0] || '?', icon('down')))));
  };
  renderPreview();
  c.onAnyChange(renderPreview);
  const help = open
    ? [h('p', {}, 'Słowo, które uczeń ma wpisać, umieść w ', h('b', {}, 'nawiasie okrągłym'), ':'),
      h('code', { class: 'example' }, 'Drzewo to (roślina).'),
      h('p', {}, 'Jeśli pasuje kilka słów, oddziel je ukośnikiem – zaliczone będzie każde z nich:'),
      h('code', { class: 'example' }, 'Dom może być wykonany z (drewna/cegieł/metalu).'),
      h('p', { class: 'small muted' }, 'Zwykły nawias (który nie jest luką) napisz tak: \\( … \\)')]
    : [h('p', {}, 'Odpowiedzi do wyboru umieść w ', h('b', {}, 'nawiasie kwadratowym'), ', oddzielone ukośnikiem. ', h('b', {}, 'Pierwsza jest poprawna'), ' – uczeń zobaczy je w losowej kolejności (od 2 do 4 odpowiedzi):'),
      h('code', { class: 'example' }, 'W nocy jest [ciemno/jasno].'),
      h('p', { class: 'small muted' }, 'Zwykły nawias kwadratowy (który nie jest luką) napisz tak: \\[ … \\]')];
  return box(open ? 'Zdanie z lukami do wpisania' : 'Zdanie z lukami do wybrania', null,
    h('div', { class: 'help-card' }, icon('info'), h('div', {}, ...help)),
    area(q.text, (v) => { q.text = v; c.changed(); }, { rows: 4, maxlength: LIMITS.clozeText, placeholder: open ? 'np. Najmniejsza część pierwiastka to (atom).' : 'np. W nocy jest [ciemno/jasno].', 'aria-label': 'Zdanie z lukami' }),
    c.cmd('text'),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Tak zobaczy to uczeń:'), preview),
    open ? c.spellingNote() : null);
}

/* ---------- Tabela ---------- */
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TOOLS = [
  { key: 'type', label: 'Wpisywanie', icon: 'type', hint: 'Klikaj w komórki i wpisuj treść. W luce wpisz poprawną odpowiedź (kilka możliwych – oddziel ukośnikiem /).' },
  { key: 'blank', label: 'Zostaw puste', icon: 'square', hint: 'Klikaj komórki, które uczeń ma uzupełnić – dostaną czerwoną ramkę. Ponowne kliknięcie przywraca zwykłą komórkę.' },
  { key: 'gone', label: 'Usuń okienko', icon: 'cut', hint: 'Klikaj komórki, których ma w ogóle nie być (np. gdy w jednym wierszu są 4 rzeczy, a w drugim 5). Ponowne kliknięcie przywraca okienko.' },
  { key: 'group', label: 'Grupa', icon: 'qCategorize', hint: 'Wybierz literę grupy i klikaj luki, które do niej należą. Odpowiedzi w grupie mogą być wpisane w dowolnej kolejności.' },
  { key: 'lock', label: 'Kłódka', icon: 'lock', hint: 'Klikaj luki, w których odpowiedź musi być dokładnie w tym miejscu (nie bierze udziału w grupie).' },
];

function resizeTable(tb, rows, cols) {
  tb.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => tb.cells[r]?.[c] || { t: '', s: 'show', lock: false, g: '' }));
  tb.rows = rows; tb.cols = cols;
}

function tableEditor(q, c) {
  const tb = q.table;
  const ui = c.ui;
  ui.tool ||= 'type'; ui.group ||= 'A';
  const root = box('Tabela', 'Najpierw przygotuj pełną, poprawnie wypełnioną tabelę. Potem przyciskiem „Zostaw puste” zaznacz komórki, które uczeń ma uzupełnić.');

  // wymiary
  const rows = stepper({ value: tb.rows, min: 1, max: LIMITS.tableDim, label: 'Liczba wierszy' });
  const cols = stepper({ value: tb.cols, min: 1, max: LIMITS.tableDim, label: 'Liczba kolumn' });
  const apply = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Zmień rozmiar tabeli');
  apply.addEventListener('click', () => {
    const R = rows.value(), C = cols.value();
    const lost = tb.cells.some((row, r) => row.some((x, cc) => (r >= R || cc >= C) && clean(x.t)));
    const go = () => { resizeTable(tb, R, C); c.changed(true); };
    if (lost) dialog({ iconName: 'warn', title: 'Zmniejszyć tabelę?', body: h('p', {}, 'Część wypełnionych komórek znajdzie się poza tabelą i zostanie usunięta.'), actions: [{ label: 'Anuluj', kind: 'quiet' }, { label: 'Zmniejsz tabelę', kind: 'danger', onClick: go }] });
    else go();
  });
  const sw = (label, key) => {
    const inp = h('input', { type: 'checkbox', checked: tb[key] });
    inp.addEventListener('change', () => { tb[key] = inp.checked; c.changed(true); });
    return h('label', { class: 'check-row' }, inp, label);
  };
  root.append(h('div', { class: 'tb-dims' },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Wysokość (wiersze)'), rows.el),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Szerokość (kolumny)'), cols.el),
    apply,
    h('div', { class: 'checks tb-heads' }, sw('Pierwszy wiersz to nagłówek', 'headerRow'), sw('Pierwsza kolumna to nagłówek', 'headerCol'))));

  // narzędzia
  const toolbar = h('div', { class: 'tb-tools', role: 'radiogroup', 'aria-label': 'Tryb pracy z tabelą' });
  const hint = h('p', { class: 'tb-hint' });
  const groupPick = h('div', { class: 'tb-groups', role: 'radiogroup', 'aria-label': 'Wybierz grupę' });
  const grid = h('div', { class: 'tb-wrap' });
  const legend = h('div', { class: 'tb-legend' });
  const renderTools = () => {
    toolbar.replaceChildren(...TOOLS.map((t) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(ui.tool === t.key), class: `tb-tool tb-tool--${t.key}` }, icon(t.icon), t.label);
      b.addEventListener('click', () => { ui.tool = t.key; renderTools(); renderGrid(); });
      return b;
    }));
    const t = TOOLS.find((x) => x.key === ui.tool);
    hint.replaceChildren(icon('info'), h('span', {}, t.hint));
    groupPick.hidden = ui.tool !== 'group';
    groupPick.replaceChildren(h('span', { class: 'small muted' }, 'Grupa:'), ...GROUPS.map((g) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(ui.group === g), class: `grp grp-${g}` }, g);
      b.addEventListener('click', () => { ui.group = g; renderTools(); });
      return b;
    }));
  };

  function onCell(r, cc) {
    const x = tb.cells[r][cc];
    const name = cellName(r, cc);
    switch (ui.tool) {
      case 'blank':
        if (x.s === 'gone') return toast(`Okienko ${name} jest usunięte – najpierw je przywróć („Usuń okienko”).`, 'error');
        x.s = x.s === 'blank' ? 'show' : 'blank';
        if (x.s === 'show') { x.g = ''; x.lock = false; }
        break;
      case 'gone':
        x.s = x.s === 'gone' ? 'show' : 'gone'; x.g = ''; x.lock = false;
        break;
      case 'group':
        if (x.s !== 'blank') return toast(`Komórka ${name} nie jest luką. Najpierw zaznacz ją przyciskiem „Zostaw puste”.`, 'error');
        x.g = x.g === ui.group ? '' : ui.group; if (x.g) x.lock = false;
        break;
      case 'lock':
        if (x.s !== 'blank') return toast(`Kłódkę można dodać tylko do luki. Najpierw zaznacz ${name} przyciskiem „Zostaw puste”.`, 'error');
        x.lock = !x.lock; if (x.lock) x.g = '';
        break;
      default: return;
    }
    c.changed();
    renderGrid();
  }

  function renderGrid() {
    const table = h('table', { class: ['tb-ed', `tool-${ui.tool}`] });
    table.append(h('tr', {}, h('th', { class: 'tb-corner' }), ...Array.from({ length: tb.cols }, (_, cc) => h('th', { class: 'tb-addr' }, colName(cc)))));
    tb.cells.forEach((row, r) => {
      const tr = h('tr', {}, h('th', { class: 'tb-addr' }, String(r + 1)));
      row.forEach((x, cc) => {
        const head = (tb.headerRow && r === 0) || (tb.headerCol && cc === 0);
        const inp = h('input', { class: 'tb-in', value: x.t, maxlength: LIMITS.text, readOnly: ui.tool !== 'type' || x.s === 'gone', tabindex: ui.tool !== 'type' || x.s === 'gone' ? '-1' : null,
          placeholder: x.s === 'blank' ? 'odpowiedź' : head ? 'nagłówek' : '', 'aria-label': `Komórka ${cellName(r, cc)}${x.s === 'blank' ? ' (luka)' : ''}` });
        inp.addEventListener('input', () => { x.t = inp.value; c.changed(); });
        const td = h('td', {
          class: ['tb-cell', `is-${x.s}`, head && 'is-head', x.g && `grp-${x.g}`, x.lock && 'is-lock', c.cellErrors.has(`${r},${cc}`) && 'has-error'],
          dataset: { cell: `${r},${cc}` },
          tabindex: ui.tool === 'type' ? null : '0',
          role: ui.tool === 'type' ? null : 'button',
          'aria-label': ui.tool === 'type' ? null : `${cellName(r, cc)}: ${TOOLS.find((t) => t.key === ui.tool).label}`,
        }, inp,
        x.s === 'blank' ? h('span', { class: 'tb-flag' }, x.lock ? icon('lock') : null, x.g ? h('b', {}, x.g) : null) : null,
        x.s === 'gone' ? h('span', { class: 'tb-gone' }, 'usunięte') : null);
        td.addEventListener('click', () => onCell(r, cc));
        td.addEventListener('keydown', (e) => { if (ui.tool !== 'type' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onCell(r, cc); } });
        tr.append(td);
      });
      table.append(tr);
    });
    grid.replaceChildren(table);
    renderLegend();
  }

  function renderLegend() {
    const used = [...new Set(tb.cells.flat().filter((x) => x.s === 'blank' && x.g).map((x) => x.g))].sort();
    legend.replaceChildren(
      h('span', { class: 'lg lg--blank' }, h('i', {}), 'luka do uzupełnienia'),
      h('span', { class: 'lg lg--gone' }, h('i', {}), 'usunięte okienko'),
      h('span', { class: 'lg' }, icon('lock'), 'kłódka – odpowiedź tylko w tym miejscu'),
      ...used.map((g) => {
        const inp = h('input', { type: 'checkbox', checked: tb.groupRepeat?.[g] === true });
        inp.addEventListener('change', () => { tb.groupRepeat ||= {}; if (inp.checked) tb.groupRepeat[g] = true; else delete tb.groupRepeat[g]; c.changed(); });
        return h('label', { class: `lg lg-group grp-${g}` }, h('b', {}, g), `grupa ${g} – dowolna kolejność.`, inp, 'odpowiedzi mogą się powtarzać');
      }));
  }

  renderTools();
  renderGrid();
  // po każdej zmianie tylko odświeżamy oznaczenia błędów (bez przerysowania – kursor zostaje w komórce)
  c.onProblems(() => grid.querySelectorAll('td[data-cell]').forEach((td) => td.classList.toggle('has-error', c.cellErrors.has(td.dataset.cell))));
  root.append(toolbar, groupPick, hint, grid, legend,
    h('p', { class: 'field__hint' }, 'Kilka poprawnych odpowiedzi w jednej luce: oddziel je ukośnikiem, np. drewno/cegła/metal. Ukośnik nie jest pokazywany uczniowi.'),
    c.cmd('table'));
  return root;
}

/* ---------- Obrazek z punktami ---------- */
function imageLabelsEditor(q, c) {
  const ui = c.ui;
  const root = box('Obrazek z punktami', 'Dodaj obrazek, kliknij „Zaznacz punkty” i klikaj miejsca na obrazku. Pierwszy kliknięty punkt to a), drugi b) i tak dalej. Potem podpisz każdy punkt – uczeń przeciągnie te nazwy do właściwych punktów.');
  if (!q.diagram) {
    root.append(imageField({ value: null, big: true, label: 'Dodaj obrazek (wymagany)', onChange: (id) => { q.diagram = id; c.changed(true); } }));
    return root;
  }
  const stage = h('div', { class: ['il-stage', ui.marking && 'is-marking'] }, h('img', { src: mediaUrl(q.diagram), alt: 'Obrazek do podpisania', draggable: false }));
  const letter = (i) => String.fromCharCode(97 + i);
  q.points.forEach((p, i) => {
    const m = h('button', { type: 'button', class: 'il-pin', style: { left: `${p.x}%`, top: `${p.y}%` }, 'aria-label': `Punkt ${letter(i)}) ${p.label || ''}` }, letter(i));
    // przesuwanie punktu
    m.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = stage.getBoundingClientRect();
      let moved = false;
      const mv = (ev) => {
        moved = true;
        p.x = Math.round(Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)) * 10) / 10;
        p.y = Math.round(Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)) * 10) / 10;
        m.style.left = `${p.x}%`; m.style.top = `${p.y}%`;
      };
      const upH = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upH); if (moved) c.changed(); else document.getElementById(`il-${q.id}-${i}`)?.focus(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', upH);
    });
    stage.append(m);
  });
  stage.addEventListener('click', (e) => {
    if (!ui.marking || e.target.closest('.il-pin')) return;
    if (q.points.length >= LIMITS.points) return toast(`Najwyżej ${LIMITS.points} punktów.`, 'error');
    const r = stage.getBoundingClientRect();
    q.points.push({ x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10, label: '' });
    c.changed(true);
    requestAnimationFrame(() => document.getElementById(`il-${q.id}-${q.points.length - 1}`)?.focus({ preventScroll: true }));
  });
  const markBtn = h('button', { class: ['btn btn--sm', ui.marking ? 'btn--primary' : 'btn--ghost'], type: 'button', 'aria-pressed': String(!!ui.marking) }, icon('target'), ui.marking ? 'Zaznaczanie włączone – klikaj w obrazek' : 'Zaznacz punkty');
  markBtn.addEventListener('click', () => { ui.marking = !ui.marking; c.changed(true); });
  const change = h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: async () => { const r = await pickImage(); if (r) { q.diagram = r.id; c.changed(true); } } }, icon('image'), 'Zmień obrazek');
  const list = h('div', { class: 'il-list' }, ...q.points.map((p, i) => h('div', { class: 'opt-row' },
    h('span', { class: 'opt-letter opt-letter--pin' }, `${letter(i)})`),
    txt(p.label, (v) => { p.label = v; c.changed(); }, { id: `il-${q.id}-${i}`, maxlength: 80, placeholder: 'np. jądro komórkowe', 'aria-label': `Nazwa punktu ${letter(i)}` }),
    removeBtn(`Usuń punkt ${letter(i)}`, () => { q.points.splice(i, 1); c.changed(true); }))));
  root.append(h('div', { class: 'actions' }, markBtn, change), stage,
    q.points.length ? list : h('p', { class: 'muted small' }, 'Nie ma jeszcze punktów. Kliknij „Zaznacz punkty”, a potem kliknij miejsce na obrazku.'),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Zbędne nazwy (opcjonalnie)'),
      txt(q.distractors, (v) => { q.distractors = v; c.changed(); }, { placeholder: 'np. ściana komórkowa / chloroplast' }),
      h('span', { class: 'field__hint' }, 'Dodatkowe, błędne nazwy oddzielone ukośnikiem / – utrudniają zadanie.')));
  return root;
}

