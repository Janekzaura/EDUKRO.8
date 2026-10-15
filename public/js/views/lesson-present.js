// Prowadzenie lekcji na tablicy (nauczyciel) i samodzielna nauka (uczeń) – pełny ekran, slajd po slajdzie.
import { h, icon, notice, toast } from '../ui.js';
import { get, post, put } from '../api.js';
import { navigate, setCrumbs, state, leaveGuards, toolButtons } from '../app.js';
import { pickClassForLesson } from './lesson-classes.js';
import * as sound from '../sound.js';
import { renderSlide, paintBg } from './lesson-slides.js';
import { wheelSlide, gameSlide } from './lesson-games.js';
import { confetti } from './test-player.js';
import { SLIDE, AWARD, LOOK_FONTS, LOOK_COLORS, SLIDE_BGS, cleanLook, cleanSlideLook } from '../shared/lesson-rules.js';
import { lockedDialog } from './student.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const q0 = () => new URLSearchParams(location.search);
const runKey = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);

/* ---------- Nauczyciel: prowadzenie i podgląd ---------- */
export async function presentView({ base, id, preview = false }) {
  const isAdmin = base === '/administracja';
  const listHref = isAdmin ? '/administracja/lekcje' : '/nauczyciel/panel/lekcje';
  const q = new URLSearchParams(location.search);
  const back = q.get('z') === 'edytor' || preview ? `${base}/lekcja/${id}` : listHref;
  const toSlide = preview && q.get('z') === 'slajd'; // z podglądu na żywo: po wyjściu wracasz do edytora tego slajdu
  setCrumbs([{ label: isAdmin ? 'Administracja' : 'Panel nauczyciela', href: listHref }, { label: 'Lekcja' }]);
  const klasa = q.get('klasa');
  // prowadzenie bez wybranej klasy → najpierw wybór klasy (chyba że świadomie „tylko pokaz”)
  if (!preview && !klasa && q.get('bez-klasy') !== '1') {
    queueMicrotask(() => pickClassForLesson({ lessonId: id, base, fromEditor: q.get('z') === 'edytor' }));
    return h('div', { class: 'wrap wrap--narrow' }, h('div', { class: 'sheet' }, icon('present', 'dialog__icon'), h('h1', {}, 'Wybierz klasę'),
      h('p', { class: 'sheet__lead' }, 'Z którą klasą prowadzisz lekcję? Z niej losowani są uczniowie do koła fortuny i gier, a po skończeniu lekcji jej uczniowie zobaczą ją u siebie.'),
      h('div', { class: 'actions', style: { marginTop: '18px' } },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => pickClassForLesson({ lessonId: id, base, fromEditor: q.get('z') === 'edytor' }) }, icon('users'), 'Wybierz klasę'),
        h('a', { class: 'btn btn--ghost', href: back, 'data-link': '' }, icon('arrowLeft'), 'Wróć'))));
  }
  const data = await get(`/api/editor/lessons/${id}/present${klasa ? `?class=${encodeURIComponent(klasa)}` : ''}`);
  const start = Math.max(0, Number(q.get('slajd') || 1) - 1);
  const cls = data.lesson.classLabel;
  const award = (slide, outcome, registryIds) => {
    if (preview) return Promise.resolve({ preview: true, amount: 0 });
    const ids = registryIds.filter((x) => x > 0);
    if (!ids.length) return Promise.resolve({ count: 0, amount: 0, preview: true });
    return post(`/api/editor/lessons/${id}/award`, { slideId: slide.id, outcome, registryIds: ids, runKey: runKey(), classLabel: cls });
  };
  // koniec lekcji z klasą → lekcja od razu dostępna uczniom tej klasy
  const complete = !preview && cls ? async () => {
    try { return await post(`/api/editor/lessons/${id}/complete`, { classLabel: cls }); }
    catch (e) { toast(e.message, 'error'); return null; }
  } : null;
  const undo = cls ? async () => {
    const cur = (await get(`/api/editor/lessons/${id}`)).classes.filter((c) => c.published && c.label !== cls).map((c) => c.label);
    await post(`/api/editor/lessons/${id}/classes`, { classes: cur });
  } : null;
  // Gwiazda lekcji: na koniec nauczyciel wybiera najaktywniejszą osobę (+100 pkt, ranking tygodnia)
  const starKey = runKey();
  const star = !preview && cls && data.roster.length ? (registryId) => post(`/api/editor/lessons/${id}/star`, { classLabel: cls, registryId, runKey: starKey }) : null;
  return presentation(data, { mode: 'teacher', preview, lessonId: id, backHref: back, toSlide, checkUrl: `/api/editor/lessons/${id}/check`, award, startAt: start, complete, undo, star, keepQuery: klasa ? `klasa=${encodeURIComponent(klasa)}${q.get('z') === 'edytor' ? '&z=edytor' : ''}` : (q.get('bez-klasy') ? 'bez-klasy=1' : '') });
}

/* ---------- Uczeń: samodzielna nauka ---------- */
export async function studentLessonView({ params }) {
  if (state.user.role !== 'student') { navigate('/uczen/przedmioty', { replace: true }); setTimeout(lockedDialog, 200); return null; }
  let data;
  try { data = await get(`/api/lessons/${params[0]}`); }
  catch (e) { if (e.body?.needLogin) { navigate('/uczen/logowanie', { replace: true }); return null; } throw e; }
  const L = data.lesson;
  setCrumbs([{ label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: L.subject.name, href: `/uczen/przedmiot/${L.subject.slug}/lekcje` }, { label: L.title }]);
  return presentation({ ...data, lesson: { ...L, subject: L.subject.name, accent: L.subject.accent }, roster: [] }, {
    mode: 'student', backHref: `/uczen/przedmiot/${L.subject.slug}/lekcje`, checkUrl: `/api/lessons/${L.id}/check`, award: () => Promise.resolve({ preview: true }), startAt: 0,
  });
}

function presentation(data, opts) {
  const { lesson: L, slides } = data;
  const teacher = opts.mode === 'teacher';
  let index = Math.min(opts.startAt || 0, Math.max(0, slides.length - 1));
  const cache = new Map();
  const ctx = {
    checkUrl: opts.checkUrl,
    roster: data.roster || [],
    preview: !!opts.preview,
    className: L.className,
    award: opts.award,
    celebrate: (el) => { if (reduced() || !el) return; const r = el.getBoundingClientRect(); confetti({ count: 70, origin: [r.left + r.width / 2, r.top + Math.min(r.height / 2, 260)] }); },
    games: teacher ? { wheel: (s) => wheelSlide(s, ctx), game: (s) => gameSlide(s, ctx) } : null,
  };

  const stage = h('div', { class: 'present__stage' });
  const counter = h('span', { class: 'present__count' });
  const dots = h('div', { class: 'present__dots', role: 'tablist', 'aria-label': 'Slajdy' });
  const prevBtn = h('button', { class: 'present__arrow', type: 'button', 'aria-label': 'Poprzedni slajd', onClick: () => go(index - 1) }, icon('arrowLeft'));
  const nextBtn = h('button', { class: 'present__arrow present__arrow--next', type: 'button', 'aria-label': 'Następny slajd', onClick: () => advance() }, h('span', { class: 'present__next-label' }, 'Dalej'), icon('arrowRight'));
  const fsBtn = h('button', { class: 'present__btn', type: 'button', 'aria-label': 'Pełny ekran', title: 'Pełny ekran (F)', onClick: toggleFs }, icon('expand'));
  // przesunięty element nie może przewinąć tablicy w bok (overflow-x: hidden nadal pozwala na przewinięcie skryptem)
  stage.addEventListener('scroll', () => { if (stage.scrollLeft) stage.scrollLeft = 0; });
  const looks = teacher && opts.preview && opts.lessonId ? lookEditor() : null;
  const root = h('div', { class: `present acc-${L.accent || 'amber'}`, tabindex: '-1' },
    h('header', { class: 'present__top' },
      h('button', { class: ['present__btn present__close', opts.preview && 'present__close--exit'], type: 'button', onClick: () => exit(), 'data-help': opts.preview ? 'Wyjdź z podglądu i wróć do edytora lekcji.' : null },
        icon(opts.preview ? 'logout' : 'arrowLeft'), h('span', {}, opts.preview ? 'Wyjdź z podglądu' : teacher ? 'Zakończ' : 'Wyjdź')),
      h('div', { class: 'present__title' }, h('b', {}, L.title), h('span', {}, [L.subject, L.className || (teacher && !opts.preview ? 'pokaz bez klasy' : null)].filter(Boolean).join(' · '))),
      opts.preview ? h('span', { class: 'present__preview' }, icon('eye'), 'Podgląd – punkty nie są zapisywane') : null,
      looks ? looks.btn : null,
      counter, h('span', { class: 'present__tools' }, ...toolButtons()), fsBtn),
    stage,
    looks ? looks.bar : null,
    h('footer', { class: 'present__nav' }, prevBtn, dots, nextBtn));

  function slideObj(i) {
    if (!cache.has(i)) cache.set(i, renderSlide(slides[i], ctx));
    return cache.get(i);
  }
  let current = null;
  function go(i, dir = i > index ? 1 : -1) {
    if (i < 0) return;
    if (i >= slides.length) { if (looks?.isOn()) looks.toggle(); return endScreen(); }
    current?.leave?.();
    const same = i === index && dir === 0;
    index = i;
    const o = slideObj(i);
    const wrap = h('div', { class: ['present__slide', dir !== 0 && `slide-in-${dir > 0 ? 'next' : 'prev'}`, `type-${slides[i].type}`] }, o.el);
    const keep = stage.scrollTop;
    stage.replaceChildren(wrap);
    stage.scrollTop = same ? keep : 0;
    paintBg(stage, slides[i].look?.bg);
    looks?.afterRender();
    current = o;
    o.enter?.();
    counter.textContent = `${i + 1} / ${slides.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.querySelector('.present__next-label').textContent = i === slides.length - 1 ? 'Zakończ' : 'Dalej';
    dots.replaceChildren(...slides.map((s, k) => h('button', { type: 'button', class: ['present__dot', k === i && 'is-on', `dot-${s.type}`], 'aria-label': `Slajd ${k + 1}: ${SLIDE[s.type]?.label || ''}`, title: `${k + 1}. ${s.title || SLIDE[s.type]?.label || ''}`, onClick: () => go(k) })));
    if (!opts.preview && teacher) history.replaceState({}, '', `${location.pathname}?${opts.keepQuery ? `${opts.keepQuery}&` : ''}slajd=${i + 1}`);
  }
  function advance() {
    if (current?.next?.()) return;
    go(index + 1, 1);
  }
  let completed = false;
  function endScreen() {
    current?.leave?.();
    current = null;
    paintBg(stage, null);
    const info = h('div', { class: 'end-info', 'aria-live': 'polite' });
    stage.replaceChildren(h('div', { class: 'present__slide slide-in-next' }, h('div', { class: 'slide slide--end' },
      icon(teacher ? 'flag' : 'star', 'slide-big-icon'),
      h('h1', { class: 'slide-title slide-title--big' }, teacher ? 'Koniec lekcji' : 'Lekcja przerobiona!'),
      h('p', { class: 'slide-sub' }, teacher ? 'Dziękujemy za wspólną pracę.' : 'Świetna robota! Sprawdź się teraz w testach z tego tematu.'),
      info,
      teacher && opts.star ? starPicker() : null,
      h('div', { class: 'actions', style: { justifyContent: 'center' } },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => go(0, -1) }, icon('repeat'), 'Od początku'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => exit() }, teacher ? 'Wróć' : 'Wróć do przedmiotu', icon('arrowRight'))))));
    counter.textContent = `${slides.length} / ${slides.length}`;
    sound.play('fanfare');
    if (!teacher) confetti();
    if (teacher && opts.complete && !completed) {
      info.replaceChildren(h('p', { class: 'muted' }, 'Zapisuję…'));
      opts.complete().then((r) => {
        if (!r) { info.replaceChildren(); return; }
        completed = true;
        if (!r.published && r.locked) {
          info.replaceChildren(notice('info', h('strong', {}, `Lekcja przerobiona z ${L.className}. `), r.message));
          return;
        }
        if (!r.published) {
          info.replaceChildren(notice('warn', h('strong', {}, `Lekcja przerobiona z ${L.className}. `), `Uczniowie jeszcze jej nie zobaczą, bo ma ${r.errors} ${r.errors === 1 ? 'niekompletny element' : 'niekompletne elementy'} – popraw je w edytorze i kliknij „Opublikuj dla…”.`));
          return;
        }
        const undoBtn = opts.undo ? h('button', { class: 'linkish', type: 'button', onClick: async () => { await opts.undo(); completed = false; info.replaceChildren(notice('info', `Lekcja nie jest już widoczna dla: ${L.className}.`)); } }, 'Cofnij – nie pokazuj jej uczniom') : null;
        info.replaceChildren(notice('ok', h('strong', {}, `Lekcja jest teraz dostępna dla uczniów: ${L.className}. `), r.notified ? `Wysłano powiadomienia do skrzynek (${r.notified}).` : 'Mogą do niej wracać i ćwiczyć pytania ze slajdów.', ' ', undoBtn));
      });
    } else if (teacher && !opts.preview && !L.classLabel) info.replaceChildren(h('p', { class: 'muted small' }, 'To był pokaz bez klasy – lekcja nie została nikomu opublikowana.'));
  }
  let starChosen = null;
  function starPicker() {
    const box = h('section', { class: 'star-pick', 'data-help': 'Gwiazda lekcji: wybierz najaktywniejszą osobę. Dostaje +100 pkt i gwiazdkę – w piątek o 16:00 osoba z największą liczbą gwiazdek zostaje Gwiazdą szkoły.' });
    const done = (r) => box.replaceChildren(h('div', { class: 'star-pick__done' }, icon('star'),
      h('span', {}, h('b', {}, `Gwiazda lekcji: ${r.name}! `), `+${r.points} pkt${r.hasAccount ? ' czeka w skrzynce' : ' czeka na konto ucznia'} · gwiazdki w tym tygodniu: ${r.stars}.`)));
    if (starChosen) { done(starChosen); return box; }
    box.append(h('h2', {}, icon('star'), 'Gwiazda lekcji'),
      h('p', { class: 'muted' }, `Kto był dziś najaktywniejszy? Ta osoba dostanie +${AWARD.lessonStar} pkt i gwiazdkę w rankingu tygodnia (w piątek o 16:00 najlepsza osoba zostaje Gwiazdą szkoły). Możesz też pominąć.`),
      h('div', { class: 'star-pick__grid' }, ...ctx.roster.map((p) => h('button', { class: 'star-pick__btn', type: 'button', onClick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const r = await opts.star(p.id);
          starChosen = r;
          sound.play('fanfare');
          const rect = b.getBoundingClientRect();
          confetti({ count: 90, origin: [rect.left + rect.width / 2, rect.top], style: 'stars' });
          done(r);
        } catch (err) { toast(err.message, 'error'); b.disabled = false; }
      } }, icon('star'), h('span', {}, `${p.firstName} ${p.lastName}`, !p.hasAccount ? h('small', {}, 'bez konta – punkty poczekają') : null)))));
    return box;
  }
  /* ---------- Podgląd: „Wygląd” – zmiany zapisują się w lekcji ---------- */
  function lookEditor() {
    let on = false, doc = null, sel = null, timer = null, saving = null, crop = false;
    const state2 = h('span', { class: 'lk-bar__save', 'aria-live': 'polite' });
    const bar = h('div', { class: 'lk-bar', role: 'toolbar', 'aria-label': 'Wygląd slajdu', hidden: true });
    const btn = h('button', { class: 'present__btn lk-toggle', type: 'button', 'aria-pressed': 'false', onClick: () => toggle(),
      'data-help': 'Wygląd: kliknij element slajdu i zmień jego rozmiar, czcionkę, kolor, położenie (przeciągnij) albo kadr obrazka. Możesz też zmienić tło slajdu. Zmiany zapisują się w lekcji.' }, icon('palette'), h('span', {}, 'Wygląd'));
    const docSlide = () => doc?.slides.find((x) => x.id === slides[index]?.id);
    const parts = (sl) => {
      if (!sl) return null;
      return { get(key) { if (key.startsWith('b:')) return (sl.blocks || []).find((b) => b.id === key.slice(2))?.look || null; return sl.look?.[key] || null; },
        set(key, look) {
          if (key.startsWith('b:')) { const b = (sl.blocks || []).find((x) => x.id === key.slice(2)); if (!b) return; if (look) b.look = look; else delete b.look; return; }
          const L2 = { ...(sl.look || {}) }; if (look) L2[key] = look; else delete L2[key];
          const c = cleanSlideLook(L2); if (c) sl.look = c; else delete sl.look;
        },
        setBg(bg) { const c = cleanSlideLook({ ...(sl.look || {}), bg }); if (c) sl.look = c; else delete sl.look; } };
    };
    const editable = () => ['title', 'info', 'copy', 'flashcards'].includes(slides[index]?.type);
    function setStatus(t) { state2.textContent = t; }
    function schedule() {
      setStatus('Zmiany czekają na zapis…');
      clearTimeout(timer);
      timer = setTimeout(save, 600);
    }
    async function save() {
      clearTimeout(timer);
      if (!doc) return;
      if (saving) await saving;
      setStatus('Zapisywanie…');
      saving = put(`/api/editor/lessons/${opts.lessonId}`, { slides: doc.slides }).then(() => setStatus('Zapisano w lekcji')).catch((e) => { setStatus('Nie zapisano'); toast(e.message, 'error'); }).finally(() => { saving = null; });
      return saving;
    }
    leaveGuards.add(() => (timer ? save() : saving));
    function update(key, fn) {
      for (const sl of [slides[index], docSlide()]) {
        const p = parts(sl); if (!p) continue;
        p.set(key, cleanLook(fn({ ...(p.get(key) || {}) })));
      }
      rerender(); schedule();
    }
    function rerender() { cache.delete(index); go(index, 0); }
    function label(key) {
      if (key === 'title') return 'Tytuł'; if (key === 'sub') return 'Podtytuł'; if (key === 'img') return 'Obrazek';
      const bl = (slides[index].blocks || []); const i = bl.findIndex((b) => b.id === key.slice(2)); const b = bl[i];
      return `${{ text: 'Tekst', list: 'Punkty', table: 'Tabela', image: 'Obrazek' }[b?.kind] || 'Element'} ${i + 1}`;
    }
    const swatch = (hex, title, active, onClick, light) => h('button', { class: ['lk-sw', active && 'is-on', !hex && 'lk-sw--none', light && 'lk-sw--light'], type: 'button', title, 'aria-label': title, 'aria-pressed': String(!!active), style: hex ? { '--c': hex } : null, onClick });
    function renderBar() {
      if (!on) { bar.hidden = true; return; }
      bar.hidden = false;
      const sl = slides[index];
      const cur = sel ? parts(sl)?.get(sel) || {} : null;
      const kind = sel ? stage.querySelector(`[data-lk="${CSS.escape(sel)}"]`)?.dataset.lkKind : null;
      const size = cur?.size || 1;
      const elRow = !editable() ? h('p', { class: 'lk-bar__hint' }, 'Na tym slajdzie zmienisz tylko tło.')
        : !sel ? h('p', { class: 'lk-bar__hint' }, icon('target'), 'Kliknij napis albo obrazek na slajdzie, żeby go zmienić. Zaznaczony element przeciągnij, żeby go przesunąć.')
          : h('div', { class: 'lk-bar__row' },
            h('b', { class: 'lk-bar__what' }, label(sel)),
            h('div', { class: 'lk-grp', role: 'group', 'aria-label': 'Rozmiar' },
              h('button', { class: 'lk-btn', type: 'button', title: 'Mniejszy', 'aria-label': 'Mniejszy', onClick: () => update(sel, (l) => ({ ...l, size: Math.max(0.4, (l.size || 1) - 0.1) })) }, icon('zoomOut')),
              h('span', { class: 'lk-val' }, `${Math.round(size * 100)}%`),
              h('button', { class: 'lk-btn', type: 'button', title: 'Większy', 'aria-label': 'Większy', onClick: () => update(sel, (l) => ({ ...l, size: Math.min(3.5, (l.size || 1) + 0.1) })) }, icon('zoomIn'))),
            kind === 'img' ? h('div', { class: 'lk-grp', role: 'group', 'aria-label': 'Kadr' },
              h('button', { class: ['lk-btn lk-btn--wide', crop && 'is-on'], type: 'button', 'aria-pressed': String(crop), onClick: () => { crop = !crop; renderBar(); markSel(); } }, icon('cut'), crop ? 'Kadrowanie: przeciągnij obrazek' : 'Kadruj'),
              crop ? h('button', { class: 'lk-btn', type: 'button', title: 'Przybliż kadr', 'aria-label': 'Przybliż kadr', onClick: () => update(sel, (l) => ({ ...l, crop: { z: Math.min(5, (l.crop?.z || 1) + 0.2), x: l.crop?.x ?? 50, y: l.crop?.y ?? 50 } })) }, icon('plus')) : null,
              crop ? h('button', { class: 'lk-btn', type: 'button', title: 'Oddal kadr', 'aria-label': 'Oddal kadr', onClick: () => update(sel, (l) => ({ ...l, crop: { z: Math.max(1, (l.crop?.z || 1) - 0.2), x: l.crop?.x ?? 50, y: l.crop?.y ?? 50 } })) }, icon('minus')) : null) : null,
            kind !== 'img' ? (() => {
              const f = h('select', { class: 'select select--sm lk-font', 'aria-label': 'Czcionka' }, ...LOOK_FONTS.map(([id, name, css]) => h('option', { value: id, selected: (cur.font || '') === id, style: css ? { fontFamily: css } : null }, name)));
              f.addEventListener('change', () => update(sel, (l) => ({ ...l, font: f.value })));
              return h('label', { class: 'lk-grp' }, h('span', { class: 'lk-lbl' }, 'Czcionka'), f);
            })() : null,
            kind !== 'img' ? h('div', { class: 'lk-grp lk-colors', role: 'group', 'aria-label': 'Kolor napisu' }, h('span', { class: 'lk-lbl' }, 'Kolor'),
              ...LOOK_COLORS.map(([id, name, hex]) => swatch(hex, name, (cur.color || '') === id, () => update(sel, (l) => ({ ...l, color: id }))))) : null,
            h('button', { class: 'lk-btn lk-btn--wide', type: 'button', disabled: !(cur.dx || cur.dy), onClick: () => update(sel, (l) => ({ ...l, dx: 0, dy: 0 })) }, icon('target'), 'Na miejsce'),
            h('button', { class: 'lk-btn lk-btn--wide', type: 'button', disabled: !Object.keys(cur).length, onClick: () => update(sel, () => null) }, icon('repeat'), 'Przywróć'));
      bar.replaceChildren(
        h('div', { class: 'lk-bar__main' }, elRow),
        h('div', { class: 'lk-bar__side' },
          h('div', { class: 'lk-grp lk-colors', role: 'group', 'aria-label': 'Tło slajdu' }, h('span', { class: 'lk-lbl' }, 'Tło slajdu'),
            ...SLIDE_BGS.map(([id, name, hex, light]) => swatch(hex, name, (slides[index]?.look?.bg || '') === id, () => {
              for (const sl of [slides[index], docSlide()]) parts(sl)?.setBg(id);
              paintBg(stage, id); renderBar(); schedule();
            }, light))),
          state2,
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => toggle() }, icon('check'), 'Gotowe')));
    }
    function markSel() {
      stage.querySelectorAll('.lk.is-sel').forEach((x) => x.classList.remove('is-sel', 'is-crop'));
      if (!sel) return;
      const el = stage.querySelector(`[data-lk="${CSS.escape(sel)}"]`);
      if (!el) { sel = null; return; }
      el.classList.add('is-sel'); el.classList.toggle('is-crop', crop);
    }
    function select(key) { sel = key; crop = false; markSel(); renderBar(); }
    async function toggle() {
      if (!on) {
        try { doc = (await get(`/api/editor/lessons/${opts.lessonId}`)).lesson; } catch (e) { toast(e.message, 'error'); return; }
        on = true;
      } else { on = false; sel = null; crop = false; await save(); }
      root.classList.toggle('is-styling', on);
      btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-on', on);
      rerender(); renderBar();
      if (on) toast('Kliknij element na slajdzie, żeby zmienić jego wygląd.', 'info');
    }
    // w trybie „Wygląd” kliknięcie zaznacza element (nie odsłania, nie powiększa)
    stage.addEventListener('click', (e) => {
      if (!on || e.target.closest('.lk-bar')) return;
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - dragEnd < 350) return; // koniec przeciągania to nie kliknięcie
      const t = e.target.closest('[data-lk]');
      if (!editable()) return;
      select(t ? t.dataset.lk : null);
    }, true);
    let moved = false, dragEnd = 0;
    stage.addEventListener('pointerdown', (e) => {
      moved = false;
      if (!on || !sel || e.button !== 0) return;
      const el = e.target.closest('[data-lk]');
      if (!el || el.dataset.lk !== sel) return;
      e.preventDefault();
      const slideW = stage.querySelector('.present__slide')?.clientWidth || 1000;
      const cur = parts(slides[index]).get(sel) || {};
      const sx = e.clientX, sy = e.clientY;
      const img = el.querySelector('img');
      const startCrop = { z: cur.crop?.z || 1, x: cur.crop?.x ?? 50, y: cur.crop?.y ?? 50 };
      const dx0 = cur.dx || 0, dy0 = cur.dy || 0;
      let last = null;
      moved = false;
      const mv = (ev) => {
        const ddx = ev.clientX - sx, ddy = ev.clientY - sy;
        if (!moved && Math.hypot(ddx, ddy) < 4) return;
        moved = true;
        if (crop && img) {
          const r = img.getBoundingClientRect();
          const k = 100 / Math.max(1, startCrop.z - 1 || 1);
          last = { crop: { z: startCrop.z, x: Math.max(0, Math.min(100, startCrop.x - (ddx / r.width) * k)), y: Math.max(0, Math.min(100, startCrop.y - (ddy / r.height) * k)) } };
          img.style.transformOrigin = `${last.crop.x}% ${last.crop.y}%`;
          if (startCrop.z <= 1) img.style.transform = 'scale(1.6)';
        } else {
          last = { dx: dx0 + (ddx / slideW) * 100, dy: dy0 + (ddy / slideW) * 100 };
          el.classList.add('lk--moved');
          el.style.setProperty('--lk-dx', String(last.dx)); el.style.setProperty('--lk-dy', String(last.dy));
        }
      };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        if (moved) dragEnd = Date.now();
        if (moved && last) update(sel, (l) => ({ ...l, ...last, crop: last.crop ? { ...last.crop, z: Math.max(last.crop.z, startCrop.z > 1 ? startCrop.z : 1.6) } : l.crop }));
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    return {
      btn, bar, toggle, isOn: () => on,
      afterRender() {
        if (!on) return;
        // w trybie „Wygląd” wszystko widać od razu
        stage.querySelectorAll('.blk.is-hidden').forEach((x) => x.classList.remove('is-hidden'));
        stage.querySelectorAll('.slide-more').forEach((x) => { x.hidden = true; });
        markSel(); renderBar();
      },
    };
  }
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.().catch(() => toast('Przeglądarka nie pozwoliła włączyć pełnego ekranu.', 'info'));
  }
  function exit() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    navigate(opts.toSlide ? `${opts.backHref}?slajd=${Math.min(index, slides.length - 1) + 1}` : opts.backHref);
  }
  const onKey = (e) => {
    if (!root.isConnected) { removeEventListener('keydown', onKey); return; }
    if (document.querySelector('dialog[open], .iv')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.target.closest('button'))) { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
    else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFs(); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
  };
  addEventListener('keydown', onKey);
  document.body.classList.add('is-presenting');
  leaveGuards.add(() => { current?.leave?.(); removeEventListener('keydown', onKey); document.body.classList.remove('is-presenting'); if (document.fullscreenElement) document.exitFullscreen?.(); });

  if (looks && q0().get('wyglad') === '1') setTimeout(() => looks.toggle(), 300);
  if (!slides.length) {
    stage.replaceChildren(h('div', { class: 'present__slide' }, h('div', { class: 'slide' }, notice('info', 'Ta lekcja nie ma jeszcze slajdów.'))));
  } else queueMicrotask(() => go(index, 1));
  setTimeout(() => root.focus({ preventScroll: true }), 60);
  return h('div', { class: 'present-host' }, root);
}
