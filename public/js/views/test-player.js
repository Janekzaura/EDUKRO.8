// Rozwiązywanie testu przez ucznia (oraz podgląd nauczyciela). Stan i ocena – wyłącznie na serwerze.
import { h, icon, notice, dialog, toast, withBusy, plural } from '../ui.js';
import { get, post } from '../api.js';
import { navigate, setCrumbs, state, leaveGuards, setPointsChip, refreshInboxBadge } from '../app.js';
import { WIDGETS } from './qplay.js';
import { RULES, GRADE_NAMES } from '../shared/quiz-rules.js';
import { lockedDialog, leftText } from './student.js';
import * as sound from '../sound.js';
import { g } from '../g.js';
import { celebrate } from '../celebrate.js';
import { avatarEl } from '../avatar.js';
import { rankRow } from './ranking.js';
import { openProfile } from './profile-card.js';

const KIND_SLUG = { teaching_test: 'testy-nauczajace', exam_test: 'testy-egzaminacyjne', quiz: 'sprawdziany' };
export const fmtDate = (ms) => new Date(ms).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PRAISE = ['Świetnie!', 'Brawo!', 'Dokładnie tak!', 'Super!', 'Tak trzymaj!', 'Rewelacja!', 'Znakomicie!', 'Bezbłędnie!'];
const OOPS = ['Prawie!', 'Nie tym razem', 'Ups, to nie to', 'Blisko!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function fmtWait(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const d = new Date(Date.now() + ms);
  return d.toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
/** Czas do terminu: „3 dni 5 godz.”, „2 godz. 14 min”, „12:05”. */
function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
  if (d) return `${d} ${d === 1 ? 'dzień' : 'dni'} ${hh} godz.`;
  if (hh) return `${hh} godz. ${mm} min`;
  return `${mm}:${String(s % 60).padStart(2, '0')}`;
}
/** Odliczanie na żywo („za 14:52”), aktualizowane co sekundę. */
function countdown(until, render, done) {
  const el = h('span', { class: 'countdown' });
  const tick = () => {
    const left = until - Date.now();
    if (left <= 0) { clearInterval(t); el.replaceChildren(); done && done(); return; }
    el.replaceChildren(render(left));
  };
  const t = setInterval(() => { if (!el.isConnected && document.readyState === 'complete') { clearInterval(t); return; } tick(); }, 1000);
  tick();
  return el;
}

/* ---------- Konfetti (albo efekt wybrany w sklepie: gwiazdki, serduszka, emoji, fajerwerki, złoty deszcz) ---------- */
export function confetti({ count = 140, origin, style } = {}) {
  celebrate({ count, origin, style: style || (state.user.role === 'student' ? state.user.card?.cele : null) || 'confetti' });
}
function sparkle(el) {
  if (reduced() || !el) return;
  const r = el.getBoundingClientRect();
  confetti({ count: 36, origin: [r.left + r.width / 2, r.top + r.height / 2] });
}

/** Ramka „Nagroda czeka w skrzynce” na ekranie wyniku. */
function rewardBox(r) {
  return h('a', { class: 'reward-box pop-in', href: '/skrzynka', 'data-link': '' }, icon('gift'),
    h('span', {}, h('b', {}, `${g('Zdobyłeś', 'Zdobyłaś')} nagrodę! `), r.label, h('small', {}, 'Czeka w Twojej skrzynce – kliknij, żeby ją odebrać.')), icon('arrowRight'));
}

/** Ramka „Trafiasz do Wygranych” (100% i 1. miejsce w rankingu testu). */
function winnerBox() {
  return h('a', { class: 'winner-box pop-in', href: '/skrzynka', 'data-link': '' }, icon('trophy'),
    h('span', {}, h('b', {}, `1. miejsce i 100% – ${g('trafiłeś', 'trafiłaś')} na zawsze do Wygranych tego testu! `), h('small', {}, 'Nagroda za ukończenie ×2 – drugie tyle punktów czeka w skrzynce.')));
}

/* ---------- Ekran startowy testu (uczeń) ---------- */
export async function playView({ params }) {
  const id = params[0];
  if (state.user.role !== 'student') { navigate('/uczen/przedmioty', { replace: true }); setTimeout(lockedDialog, 200); return null; }
  let data;
  try { data = await get(`/api/tests/${id}`); }
  catch (e) {
    if (e.body?.needLogin) { navigate('/uczen/logowanie', { replace: true }); return null; }
    throw e;
  }
  const { test: t, status: st } = data;
  const exam = t.kind === 'exam_test';
  const quiz = t.kind === 'quiz';
  const backHref = `/uczen/przedmiot/${t.subject.slug}/${KIND_SLUG[t.kind]}`;
  setCrumbs([{ label: 'Przedmioty', href: '/uczen/przedmioty' }, { label: t.subject.name, href: backHref }, { label: t.title }]);

  const rule = (ic, title, sub) => h('li', { class: 'rule pop-in' }, h('span', { class: 'rule__icon' }, icon(ic)), h('span', {}, h('b', {}, title), h('small', {}, sub)));
  const rules = quiz
    ? [rule('list', `${t.questionCount} ${plural(t.questionCount, ['pytanie', 'pytania', 'pytań'])}`, t.categories?.length ? `z działów: ${t.categories.join(', ')}` : 'z całego działu'),
      rule('flag', 'Sprawdzane na końcu', 'bez podpowiedzi i bez informacji po drodze'),
      rule('repeat', `Najwyżej ${t.maxAttempts} podejścia`, st.attemptsLeft !== undefined ? `zostało Ci: ${st.attemptsLeft}` : ''),
      rule('star', `Maksymalnie ${t.points.byGrade[5]} pkt`, 'za szóstkę · im lepsza ocena, tym więcej punktów')]
    : exam
    ? [rule('list', `${t.questionCount} ${plural(t.questionCount, ['pytanie', 'pytania', 'pytań'])}`, 'odpowiadasz po kolei'),
      rule('clock', 'Czas na każde pytanie', 'zegar odlicza w prawym górnym rogu'),
      rule('heart', t.maxMistakes ? `Możesz pomylić się ${t.maxMistakes} ${plural(t.maxMistakes, ['raz', 'razy', 'razy'])}` : 'Bez pomyłek!', 'kolejny błąd kończy egzamin'),
      rule('star', `+${t.points.first} pkt`, `za pierwsze zaliczenie · powtórka co ${RULES.examRepeatDays} dni: +${t.points.repeat} pkt`)]
    : [rule('list', `${t.questionCount} ${plural(t.questionCount, ['pytanie', 'pytania', 'pytań'])}`, 'bez pośpiechu – nie ma zegara'),
      rule('bulb', 'Uczysz się na błędach', 'po pomyłce pokażemy poprawną odpowiedź'),
      rule('repeat', 'Powtórka do skutku', 'błędne pytania wrócą na końcu'),
      rule('star', t.points.first ? `+${t.points.first} pkt` : 'Trening', t.points.first ? 'za pierwsze ukończenie' : 'możesz powtarzać ile chcesz')];
  if (t.reward) rules.push(rule('gift', `Nagroda: ${t.reward.label}`, t.reward.got ? g('już ją zdobyłeś', 'już ją zdobyłaś') : quiz ? `za ocenę ${t.reward.minGrade} lub wyższą · trafi do skrzynki` : exam ? 'za zaliczenie egzaminu · trafi do skrzynki' : 'za ukończenie testu · trafi do skrzynki'));
  rules.forEach((r, i) => r.style.setProperty('--i', i));

  const rankBox = h('section', { class: 'test-rank', 'data-help': 'Ranking tego testu. Pierwsza osoba ze 100% na 1. miejscu przechodzi do Wygranych i dostaje nagrodę za ukończenie ×2.' });
  const startBtn = h('button', { class: 'btn btn--primary btn--xl', type: 'button' }, icon('play'), st.activeAttemptId ? (quiz ? 'Kontynuuj sprawdzian' : 'Kontynuuj test') : 'Zaczynamy!');
  const status = h('div', { class: 'intro-status' });
  if (t.expiresAt) status.append(h('div', { class: 'temp-banner' }, icon('hourglass'), h('span', {}, h('b', {}, 'Test tymczasowy. '), 'Zniknie za ', countdown(t.expiresAt, (ms) => leftText(ms), () => navigate(backHref)), ' – rozwiąż go, zanim zniknie!')));
  if (quiz) {
    if (t.deadline) status.append(notice(t.deadline > Date.now() ? 'info' : 'warn', h('strong', {}, 'Termin: '), fmtDate(t.deadline), t.deadline > Date.now() ? ['. Zostało: ', countdown(t.deadline, (ms) => fmtLeft(ms), () => navigate(location.pathname, { replace: true })), '.'] : ' – minął.'));
    if (st.bestGrade) status.append(notice('ok', h('strong', {}, `Twoja najlepsza ocena: ${st.bestGrade} (${GRADE_NAMES[st.bestGrade - 1]}). `), st.attemptsLeft ? `Możesz spróbować jeszcze ${st.attemptsLeft} ${plural(st.attemptsLeft, ['raz', 'razy', 'razy'])} – za lepszą ocenę dostaniesz dodatkowe punkty.` : g('Wykorzystałeś wszystkie podejścia.', 'Wykorzystałaś wszystkie podejścia.')));
    if (st.activeAttemptId) status.append(notice('info', `Masz rozpoczęty sprawdzian – kontynuujesz od miejsca, w którym ${g('skończyłeś', 'skończyłaś')}.`));
    else if (!st.canStart) {
      startBtn.disabled = true;
      status.append(notice('warn', st.reason === 'no_attempts' ? `${g('Wykorzystałeś', 'Wykorzystałaś')} wszystkie ${t.maxAttempts} podejścia do tego sprawdzianu.` : 'Termin tego sprawdzianu już minął.'));
    }
  } else if (!st.canStart && st.retryAt) {
    startBtn.disabled = true;
    const done = () => navigate(location.pathname, { replace: true });
    status.append(st.reason === 'failed'
      ? notice('warn', h('strong', {}, 'Ostatnia próba się nie udała. '), 'Następna będzie możliwa za ', countdown(st.retryAt, (ms) => fmtWait(ms), done), '. W międzyczasie możesz poćwiczyć w testach nauczających.')
      : notice('ok', h('strong', {}, 'Egzamin zaliczony! '), `Powtórka (+${t.points.repeat} pkt) będzie możliwa: `, h('b', {}, new Date(st.retryAt).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })), '.'));
  } else if (st.activeAttemptId) status.append(notice('info', exam ? 'Masz rozpoczęty egzamin – zegar bieżącego pytania wciąż płynie.' : `Masz rozpoczęty test – kontynuujesz od miejsca, w którym ${g('skończyłeś', 'skończyłaś')}.`));
  else if (st.passedCount) status.append(notice('ok', exam ? `${g('Zaliczyłeś', 'Zaliczyłaś')} ten egzamin ${st.passedCount} ${plural(st.passedCount, ['raz', 'razy', 'razy'])}.` : `${g('Ukończyłeś', 'Ukończyłaś')} ten test ${st.passedCount} ${plural(st.passedCount, ['raz', 'razy', 'razy'])} – kolejne podejście to świetny trening (bez punktów).`));

  startBtn.addEventListener('click', () => withBusy(startBtn, async () => {
    try {
      const r = await post(`/api/tests/${t.id}/attempts`);
      await runAttempt(root, r.attemptId, { backHref, accent: t.subject.accent });
    } catch (e) { toast(e.message, 'error'); }
  }));

  const root = h('div', { class: `play-root acc-${t.subject.accent}` },
    h('div', { class: 'intro' },
      h('button', { class: 'back', type: 'button', onClick: () => navigate(backHref) }, icon('arrowLeft'), t.subject.name),
      h('span', { class: `kind-chip kind-chip--${t.kind}` }, icon(quiz ? 'quiz' : exam ? 'exam' : 'teaching'), quiz ? 'Sprawdzian' : exam ? 'Test egzaminacyjny' : 'Test nauczający'),
      h('h1', { class: 'intro__title' }, t.title),
      t.summary ? h('p', { class: 'intro__lead' }, t.summary) : null,
      h('ul', { class: 'rules' }, ...rules),
      exam ? h('p', { class: 'intro__note' }, icon('info'), `Wynik pierwszego zaliczenia trafi do nauczyciela. Przerwanie egzaminu liczy się jak przegrana (${RULES.examFailCooldownMin} min przerwy).`) : null,
      quiz ? h('p', { class: 'intro__note' }, icon('info'), 'Ocena jest tylko dla Ciebie (nie trafia do dziennika). Przerwanie sprawdzianu zużywa podejście – ocenimy odpowiedzi, których udzieliłeś. Koło ratunkowe możesz użyć tylko raz.') : null,
      status,
      h('div', { class: 'intro__go' }, startBtn),
      rankBox));
  loadTestRanking(t.id, rankBox);
  return root;
}

/** Ranking testu: Wygrani (100% i 1. miejsce – na zawsze, nagroda ×2) i pozostali. */
async function loadTestRanking(testId, box) {
  let r;
  try { r = await get(`/api/tests/${testId}/ranking?limit=5`); } catch { box.remove(); return; }
  const rows = r.rows.map((x) => rankRow({ ...x, valueText: `${x.pct}%`, me: x.card.id === state.user.id }));
  box.replaceChildren(
    h('h3', {}, icon('trophy'), 'Ranking tego testu'),
    h('p', { class: 'test-rank__rule' }, 'Kto pierwszy zdobędzie 100% na 1. miejscu, trafia na zawsze do Wygranych i dostaje nagrodę za ukończenie ×2. Wtedy o 1. miejsce walczą dalej pozostali.'),
    r.winners.length ? h('div', {}, h('b', { class: 'small' }, `Wygrani (${r.winners.length})`), h('div', { class: 'test-rank__winners' }, ...r.winners.slice(0, 12).map((w) =>
      h('button', { class: 'win-chip', type: 'button', onClick: () => openProfile(w.card.id), title: `${w.card.firstName} ${w.card.lastName}` }, avatarEl(w.card, { size: 26, frame: false }), h('b', {}, `${w.place}.`), `${w.card.firstName} ${w.card.lastName[0]}.`)))) : null,
    rows.length ? h('ol', { class: 'rk-list' }, ...rows) : h('p', { class: 'muted small' }, r.winners.length ? 'Pierwsze miejsce jest wolne – zdobądź 100%!' : 'Nikt jeszcze nie ukończył tego testu – możesz być pierwszy!'),
    r.me ? h('p', { class: 'rk-me' }, r.me.winner ? `Jesteś w Wygranych tego testu!` : [`Twoje miejsce: `, h('b', {}, `${r.me.rank}.`), ` (${r.me.pct}%)`]) : null);
}

/* ---------- Podgląd nauczyciela ---------- */
export async function previewView({ base, id }) {
  const isAdmin = base === '/administracja';
  const back = `${base}/test/${id}`;
  setCrumbs([{ label: isAdmin ? 'Administracja' : 'Panel nauczyciela', href: isAdmin ? '/administracja/testy' : '/nauczyciel/panel/testy' }, { label: 'Edytor', href: back }, { label: 'Podgląd ucznia' }]);
  const root = h('div', { class: 'play-root acc-amber' });
  try {
    const r = await post(`/api/editor/tests/${id}/preview`);
    queueMicrotask(() => runAttempt(root, r.attemptId, { backHref: back, preview: true, base, testId: id }));
  } catch (e) {
    root.append(h('div', { class: 'wrap wrap--narrow' }, notice('warn', e.message), h('div', { class: 'actions', style: { marginTop: '18px' } }, h('a', { class: 'btn btn--ghost', href: back, 'data-link': '' }, icon('arrowLeft'), 'Wróć do edytora'))));
  }
  return root;
}

/* ---------- Przebieg ---------- */
async function runAttempt(root, attemptId, opts) {
  let streak = 0;
  let timerRaf = null;
  let submitting = false;
  const hud = h('div', { class: 'hud' });
  const stage = h('div', { class: 'q-stage' });
  const bar = h('div', { class: 'act-bar' });
  root.replaceChildren(h('div', { class: 'play' }, opts.preview ? h('div', { class: 'preview-banner' }, icon('eye'), 'Podgląd ucznia – wyniki i punkty nie są zapisywane') : null, hud, stage));
  // pasek „Sprawdź” przyklejony do dołu ekranu – poza animowanym widokiem, żeby zawsze był przy krawędzi
  document.querySelectorAll('body > .act-bar').forEach((x) => x.remove());
  document.body.append(bar);
  document.body.classList.add('is-playing');
  const stopTimer = () => { cancelAnimationFrame(timerRaf); timerRaf = null; };
  const cleanup = () => { stopTimer(); bar.remove(); document.body.classList.remove('is-playing'); };
  leaveGuards.add(cleanup);

  const quit = () => {
    const exam = cur?.attempt.mode === 'exam' && !opts.preview;
    const quiz = cur?.attempt.mode === 'quiz' && !opts.preview;
    dialog({
      iconName: exam || quiz ? 'warn' : 'info', title: exam ? 'Przerwać egzamin?' : quiz ? 'Przerwać sprawdzian?' : 'Zakończyć test?',
      body: h('p', {}, exam ? `Przerwanie liczy się jak przegrana – następna próba będzie możliwa za ${RULES.examFailCooldownMin} minut.`
        : quiz ? `Sprawdzian zostanie oceniony na podstawie odpowiedzi, których już ${g('udzieliłeś', 'udzieliłaś')} (pozostałe liczą się jako błędne), i zużyje jedno podejście.`
          : 'Postęp w tym podejściu nie zostanie zapisany. Możesz zacząć od nowa w każdej chwili.'),
      actions: [{ label: exam ? 'Wracam do testu' : quiz ? 'Wracam do sprawdzianu' : 'Wracam do testu', kind: 'primary' }, { label: exam ? 'Przerwij egzamin' : quiz ? 'Przerwij i oceń' : 'Zakończ', kind: 'danger', onClick: async () => {
        stopTimer();
        const r = await post(`/api/attempts/${attemptId}/abandon`);
        if (r.summary.status === 'abandoned') { cleanup(); navigate(opts.backHref); } else showSummary(r.summary);
      } }],
    });
  };

  let cur = null;
  async function load() {
    stopTimer();
    try { cur = await get(`/api/attempts/${attemptId}`); }
    catch (e) { toast(e.message, 'error'); return; }
    if (cur.summary) return showSummary(cur.summary, cur.notice);
    renderHud();
    renderQuestion();
  }

  function renderHud() {
    const p = cur.progress;
    const exam = cur.attempt.mode === 'exam';
    const pct = Math.round((p.done / p.total) * 100);
    const hearts = exam ? h('div', { class: 'hearts', 'aria-label': `Pozostałe pomyłki: ${Math.max(0, cur.maxMistakes - cur.mistakes)} z ${cur.maxMistakes}` },
      ...(cur.maxMistakes ? Array.from({ length: cur.maxMistakes }, (_, i) => h('span', { class: ['heart', i >= cur.maxMistakes - cur.mistakes && 'is-lost'] }, icon('heart')))
        : [h('span', { class: 'no-mistakes' }, icon('shield'), 'bez pomyłek')])) : null;
    const timer = cur.timer ? h('div', { class: 'timer', role: 'timer', 'aria-label': 'Pozostały czas' },
      h('svg', { svg: true, viewBox: '0 0 44 44', class: 'timer__ring' }, h('circle', { svg: true, cx: '22', cy: '22', r: '19', class: 'timer__bg' }), h('circle', { svg: true, cx: '22', cy: '22', r: '19', class: 'timer__fg' })),
      h('span', { class: 'timer__txt' })) : null;
    hud.replaceChildren(
      h('button', { class: 'hud__close', type: 'button', 'aria-label': 'Zakończ test', onClick: quit }, icon('x')),
      h('div', { class: 'hud__prog' },
        h('div', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.total), 'aria-valuenow': String(p.done) }, h('span', { class: 'prog__fill', style: { width: `${pct}%` } })),
        h('span', { class: 'prog__label' }, exam || cur.attempt.mode === 'quiz' ? `Pytanie ${cur.question.number} z ${p.total}` : `Opanowane: ${p.done} z ${p.total}`,
          cur.question.isRepeat ? h('span', { class: 'chip-repeat' }, icon('repeat'), 'Powtórka') : null,
          streak >= 2 && cur.attempt.mode !== 'quiz' ? h('span', { class: 'chip-streak' }, icon('flame'), `${streak} z rzędu`) : null)),
      hearts || '', timer || '');
    if (timer) startTimer(timer);
  }

  function startTimer(el) {
    const total = cur.timer.totalMs;
    const endAt = performance.now() + cur.timer.remainingMs;
    const fg = el.querySelector('.timer__fg'), txt = el.querySelector('.timer__txt');
    const C = 2 * Math.PI * 19;
    fg.style.strokeDasharray = `${C}`;
    let lastSec = -1;
    const frame = () => {
      const left = Math.max(0, endAt - performance.now());
      fg.style.strokeDashoffset = `${C * (1 - left / total)}`;
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        txt.textContent = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
        el.classList.toggle('is-low', sec <= 10);
      }
      if (left <= 0) { timerRaf = null; submit({ timeout: true }); return; }
      timerRaf = requestAnimationFrame(frame);
    };
    timerRaf = requestAnimationFrame(frame);
  }

  let widget = null;
  function renderQuestion() {
    const q = cur.question;
    const quiz = cur.attempt.mode === 'quiz';
    const last = cur.progress.remaining <= 1;
    const check = h('button', { class: 'btn btn--primary btn--xl check-btn', type: 'button', disabled: true }, quiz ? (last ? 'Zakończ i sprawdź' : 'Zapisz i dalej') : 'Sprawdź');
    const onChange = () => { check.disabled = !widget.ready(); check.hidden = !!widget.hidesSubmit?.(); };
    widget = WIDGETS[q.type](q, { onChange, serve: q.serve });
    check.addEventListener('click', () => submit({}));
    const hint = q.hint ? h('button', { class: 'btn btn--quiet hint-btn', type: 'button' }, icon('bulb'), 'Podpowiedź') : null;
    const hintBox = h('div', { class: 'hint-box', hidden: true }, icon('bulb'), h('span', {}, q.hint || ''));
    hint?.addEventListener('click', () => { hintBox.hidden = false; hint.remove(); });
    const img = q.image ? h('button', { class: 'q-img', type: 'button', 'aria-label': 'Powiększ obrazek', onClick: () => zoom(q.image) }, h('img', { src: q.image, alt: 'Obrazek do pytania' })) : null;
    const card = h('article', { class: ['q-card-play', `q-type-${q.type}`] },
      cur.notice ? h('div', { class: 'q-notice' }, notice('warn', cur.notice)) : null,
      h('p', { class: 'q-num' }, q.isRepeat ? 'Spróbuj jeszcze raz' : `Pytanie ${q.number}`),
      h('h2', { class: 'q-prompt' }, q.prompt), img, hintBox, h('div', { class: 'q-answer' }, widget.el));
    stage.replaceChildren(card);
    const ll = lifelineButton();
    bar.replaceChildren(h('div', { class: 'act-bar__in' }, h('div', { class: 'act-bar__left' }, hint, ll), check));
    onChange();
    if (cur.assist) applyAssist(cur.assist.data, cur.assist.note, false);
    const first = card.querySelector('.q-answer input, .q-answer textarea');
    if (first && matchMedia('(hover: hover)').matches) setTimeout(() => first.focus({ preventScroll: true }), 420);
  }

  /* ---------- Koło ratunkowe ---------- */
  function lifelineButton() {
    const L = cur.lifelines;
    if (!L || cur.assist) return null;
    if (!L.preview && !L.count) return null;
    if (!L.allowed) return null;
    const b = h('button', { class: 'btn btn--quiet lifeline-btn', type: 'button', title: 'Koło ratunkowe – duża podpowiedź albo od razu część odpowiedzi' },
      icon('lifebuoy'), 'Koło ratunkowe', L.preview ? null : h('span', { class: 'll-count' }, String(L.count)));
    b.addEventListener('click', () => {
      dialog({
        iconName: 'lifebuoy', title: 'Użyć koła ratunkowego?',
        body: [h('p', {}, 'Koło ratunkowe wypełni za Ciebie dużą część odpowiedzi (albo usunie błędne odpowiedzi).'),
          cur.attempt.mode === 'quiz' ? h('p', { class: 'small' }, 'W sprawdzianie możesz go użyć tylko raz.') : null,
          L.preview ? h('p', { class: 'small' }, 'Podgląd nauczyciela – koło nie zużywa się.') : h('p', { class: 'small' }, `Masz ${L.count} ${plural(L.count, ['koło', 'koła', 'kół'])}.`)],
        actions: [{ label: 'Nie teraz', kind: 'quiet' }, { label: 'Użyj koła', kind: 'primary', onClick: async () => {
          try {
            const r = await post(`/api/attempts/${attemptId}/lifeline`);
            cur.assist = { data: r.assist, note: r.note };
            if (cur.lifelines && r.left !== null && r.left !== undefined) cur.lifelines.count = r.left;
            if (state.user.role === 'student' && r.left !== null) state.user.lifelines = r.left;
            b.remove();
            applyAssist(r.assist, r.note, true);
          } catch (e) {
            toast(e.message, e.body?.notUsable ? 'info' : 'error');
            if (e.body?.notUsable || e.body?.noLifeline) b.remove();
          }
        } }],
      });
    });
    return b;
  }
  function applyAssist(data, note, animate) {
    widget.assist?.(data);
    const ans = stage.querySelector('.q-answer');
    if (ans && !stage.querySelector('.assist-note')) ans.after(h('div', { class: ['assist-note', animate && 'pop-in'] }, icon('lifebuoy'), h('span', {}, note || 'Użyto koła ratunkowego.')));
    if (animate) sparkle(ans);
  }

  async function submit({ timeout = false }) {
    if (submitting || !cur?.question) return;
    submitting = true;
    stopTimer();
    widget.lock();
    const btn = bar.querySelector('.check-btn');
    btn?.classList.add('is-busy');
    let r;
    try { r = await post(`/api/attempts/${attemptId}/answer`, { serve: cur.question.serve, answer: timeout ? {} : widget.answer(), timeout }); }
    catch (e) {
      submitting = false;
      if (e.status === 409) return load();
      toast(e.message, 'error'); btn?.classList.remove('is-busy'); return;
    }
    submitting = false;
    if (cur.attempt.mode === 'quiz') {
      // sprawdzian: bez informacji, czy odpowiedź była dobra – od razu następne pytanie albo wynik
      if (r.finished) return showSummary(r.summary, r.notice);
      const card = stage.querySelector('.q-card-play');
      card?.classList.add('is-saved');
      setTimeout(load, reduced() ? 0 : 260);
      return;
    }
    widget.reveal(r);
    streak = r.correct ? streak + 1 : 0;
    sound.play(r.correct ? 'success' : 'error');
    const card = stage.querySelector('.q-card-play');
    card.classList.add(r.correct ? 'is-correct' : 'is-incorrect');
    if (r.correct) sparkle(card.querySelector('.q-answer'));
    if (!r.correct && cur.attempt.mode === 'exam') {
      const hearts = hud.querySelectorAll('.heart:not(.is-lost)');
      hearts[hearts.length - 1]?.classList.add('is-lost', 'is-breaking');
    }
    showFeedback(r, timeout);
  }

  function showFeedback(r, timeout) {
    const exam = cur.attempt.mode === 'exam';
    const next = h('button', { class: 'btn btn--xl fb__next', type: 'button' }, r.finished ? 'Zobacz wynik' : 'Dalej', icon('arrowRight'));
    next.addEventListener('click', () => (r.finished ? showSummary(r.summary) : load()));
    const title = r.correct ? pick(PRAISE) : timeout || r.timeout ? 'Czas minął!' : pick(OOPS);
    let sub = '';
    if (r.correct) sub = streak >= 3 ? `${streak} poprawne z rzędu – jesteś w formie!` : 'Poprawna odpowiedź.';
    else if (exam) sub = r.maxMistakes - r.mistakes >= 0 ? `To liczy się jako błąd. Możesz pomylić się jeszcze ${r.maxMistakes - r.mistakes} ${plural(r.maxMistakes - r.mistakes, ['raz', 'razy', 'razy'])}.` : 'Limit błędów został przekroczony.';
    else sub = 'Sprawdź poprawną odpowiedź powyżej. To pytanie wróci na końcu testu.';
    const fb = h('div', { class: ['fb', r.correct ? 'fb--ok' : 'fb--bad'], role: 'status' },
      h('div', { class: 'fb__in' },
        h('span', { class: 'fb__icon' }, icon(r.correct ? 'check' : timeout || r.timeout ? 'clock' : 'x')),
        h('div', { class: 'fb__text' }, h('strong', {}, title), h('span', {}, sub)),
        next));
    if (r.explanation) stage.querySelector('.q-answer').after(h('div', { class: 'explain pop-in' }, icon('bulb'), h('div', {}, h('b', {}, 'Wyjaśnienie: '), r.explanation)));
    bar.replaceChildren(fb);
    if (!r.correct && !reduced()) stage.querySelector('.q-card-play')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 380 });
    setTimeout(() => next.focus({ preventScroll: true }), 80);
    if (!r.correct) setTimeout(() => stage.querySelector('.sol-box, .explain, .is-solution, .gap-sol, .cell-sol, .il-sol, .tile-sol, .sol-tag')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
  }

  function showSummary(s, noticeText) {
    if (s.mode === 'quiz') return showQuizSummary(s, noticeText);
    cleanup();
    const exam = s.mode === 'exam';
    const pass = s.status === 'passed' || s.status === 'completed';
    const pct = s.total ? Math.round(((s.score || 0) / s.total) * 100) : 0;
    const C = 2 * Math.PI * 54;
    const ring = h('div', { class: ['res-ring', pass ? 'is-pass' : 'is-fail'] },
      h('svg', { svg: true, viewBox: '0 0 120 120' }, h('circle', { svg: true, cx: '60', cy: '60', r: '54', class: 'res-ring__bg' }),
        h('circle', { svg: true, cx: '60', cy: '60', r: '54', class: 'res-ring__fg', style: `stroke-dasharray:${C};stroke-dashoffset:${C}` })),
      h('div', { class: 'res-ring__txt' }, h('b', {}, `${s.score ?? 0}/${s.total}`), h('small', {}, 'za pierwszym razem')));
    const pts = h('b', { class: 'pts__num' }, '0');
    const title = s.preview ? 'Koniec podglądu' : exam ? (pass ? 'Egzamin zaliczony!' : 'Tym razem się nie udało') : 'Brawo – wszystko opanowane!';
    const lead = s.preview ? 'Tak wygląda zakończenie testu dla ucznia. Wynik i punkty nie zostały zapisane.'
      : exam ? (pass ? `${g('Popełniłeś', 'Popełniłaś')} ${s.mistakes} ${plural(s.mistakes, ['błąd', 'błędy', 'błędów'])} z ${s.maxMistakes} dozwolonych.` : (s.status === 'failed' && s.mistakes <= s.maxMistakes ? 'Egzamin został przerwany.' : `Limit błędów (${s.maxMistakes}) został przekroczony.`))
        : `Każde pytanie ostatecznie ${g('rozwiązałeś', 'rozwiązałaś')} poprawnie. Błędów po drodze: ${s.mistakes}.`;
    const facts = [];
    if (!s.preview && s.points > 0) facts.push(h('div', { class: 'pts pop-in' }, icon('star'), h('span', {}, '+', pts, ' pkt'), s.balance !== null ? h('small', {}, `Masz już ${s.balance} pkt – wydaj je w sklepie EDUKRO!`) : null));
    if (s.rankingWinner) facts.push(winnerBox());
    if (s.starBonus) facts.push(h('p', { class: 'muted small' }, `W tym +${s.starBonus} pkt bonusu Gwiazdy szkoły (×1,2).`));
    if (s.reward?.waiting) facts.push(rewardBox(s.reward));
    if (!s.preview && pass && !s.points && !exam) facts.push(h('p', { class: 'muted' }, 'Punkty dostaje się za pierwsze ukończenie testu – to był świetny trening.'));
    if (s.sentToTeacher) facts.push(notice('ok', h('strong', {}, 'Wynik wysłany do nauczyciela. '), 'To było Twoje pierwsze zaliczenie tego egzaminu.'));
    if (!s.preview && exam && s.retryAt) {
      facts.push(pass
        ? notice('info', 'Powtórkę zrobisz za tydzień – ', h('b', {}, new Date(s.retryAt).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })), `. Za powtórkę też są punkty.`)
        : notice('warn', 'Następna próba za ', countdown(s.retryAt, (ms) => fmtWait(ms)), '. Możesz w tym czasie poćwiczyć w testach nauczających.'));
    }
    const again = !exam || s.preview ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (s.preview ? navigate(`${opts.base}/test/${opts.testId}/podglad`, { replace: true }) : navigate(location.pathname, { replace: true })) }, icon('repeat'), s.preview ? 'Jeszcze raz' : 'Rozwiąż jeszcze raz') : null;
    root.replaceChildren(h('div', { class: ['summary', pass ? 'is-pass' : 'is-fail'] },
      noticeText ? notice('warn', noticeText) : null,
      ring,
      h('h1', { class: 'summary__title' }, title),
      h('p', { class: 'summary__lead' }, lead),
      ...facts,
      h('div', { class: 'actions summary__actions' }, again,
        !s.preview && state.user.role === 'student' ? h('a', { class: 'btn btn--ghost', href: '/uczen/sklep', 'data-link': '' }, icon('bag'), 'Sklep') : null,
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate(opts.backHref) }, s.preview ? 'Wróć do edytora' : 'Wróć do przedmiotu', icon('arrowRight')))));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fg = root.querySelector('.res-ring__fg');
      if (fg) fg.style.strokeDashoffset = `${C * (1 - pct / 100)}`;
    }));
    if (pass && !s.preview) setTimeout(() => { confetti(); sound.play('fanfare'); }, 250);
    else if (!pass && !s.preview) sound.play('error');
    if (s.points > 0) {
      setTimeout(() => sound.play('coin'), 900);
      const t0 = performance.now(), dur = reduced() ? 0 : 1200;
      const step = (t) => { const k = dur ? Math.min(1, (t - t0) / dur) : 1; pts.textContent = String(Math.round(s.points * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    if (state.user.role === 'student' && s.balance !== null && s.balance !== undefined) { setTimeout(() => setPointsChip(s.balance), 1100); refreshInboxBadge(); }
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showQuizSummary(s, noticeText) {
    cleanup();
    const g = s.grade || 1;
    const good = g >= 3;
    const pts = h('b', { class: 'pts__num' }, '0');
    const gradeEl = h('div', { class: ['grade-badge', `grade-${g}`] }, h('span', { class: 'grade-badge__num' }, String(g)), h('span', { class: 'grade-badge__name' }, s.gradeName || GRADE_NAMES[g - 1]));
    const cats = (s.categories || []).map((c, i) => h('li', { class: ['cat-bar', c.pct < RULES.weakCategoryPct && 'is-weak'], style: { '--i': i } },
      h('span', { class: 'cat-bar__name' }, c.name), h('span', { class: 'cat-bar__track' }, h('span', { class: 'cat-bar__fill', style: { '--w': `${c.pct}%` } })),
      h('span', { class: 'cat-bar__val' }, `${c.correct}/${c.total}`)));
    const facts = [];
    if (s.preview) facts.push(notice('info', 'Podgląd nauczyciela – ocena i punkty nie zostały zapisane.'));
    if (s.abandoned) facts.push(notice('warn', 'Sprawdzian został przerwany – pytania bez odpowiedzi liczą się jako błędne.'));
    if (!s.preview && s.points > 0) facts.push(h('div', { class: 'pts pop-in' }, icon('star'), h('span', {}, '+', pts, ' pkt'), h('small', {}, `Masz już ${s.balance} pkt – wydaj je w sklepie EDUKRO!`)));
    if (s.rankingWinner) facts.push(winnerBox());
    if (s.reward?.waiting) facts.push(rewardBox(s.reward));
    else if (!s.preview) facts.push(h('p', { class: 'muted' }, s.bestGrade && s.bestGrade > g ? `Masz już punkty za lepszą ocenę (${s.bestGrade}) – zostają u Ciebie. Za tę próbę nie ma nowych punktów.` : 'Za tę ocenę masz już punkty z poprzedniego podejścia. Popraw ocenę, żeby dostać więcej.'));
    if (s.weak?.length) facts.push(h('div', { class: 'advice pop-in' }, icon('bulb'), h('div', {}, h('b', {}, 'Powtórz koniecznie: '), s.weak.join(', '), '. ', h('span', { class: 'muted' }, 'W tych działach poszło Ci najsłabiej – wróć do lekcji i testów nauczających z tych tematów.'))));
    else if (cats.length) facts.push(notice('ok', 'Wszystkie działy opanowane na dobrym poziomie – brawo!'));
    if (!s.preview && s.attemptsLeft !== undefined) facts.push(h('p', { class: 'muted small' }, s.attemptsLeft ? `Pozostałe podejścia: ${s.attemptsLeft} z ${RULES.quizMaxAttempts}.${s.deadline ? ` Termin: ${fmtDate(s.deadline)}.` : ''}` : 'To było Twoje ostatnie podejście do tego sprawdzianu.'));
    const review = h('details', { class: 'review' }, h('summary', {}, `Twoje odpowiedzi (${s.score}/${s.total} poprawnych)`),
      h('ol', { class: 'review__list' }, ...(s.review || []).map((x) => h('li', { class: x.correct ? 'is-right' : 'is-wrong' }, icon(x.correct ? 'check' : 'x'),
        h('span', {}, x.prompt || 'Pytanie', x.cat ? h('small', {}, x.cat) : null, !x.answered ? h('small', {}, 'bez odpowiedzi') : null)))));
    root.replaceChildren(h('div', { class: ['summary', 'summary--quiz', good ? 'is-pass' : 'is-fail'] },
      noticeText ? notice('warn', noticeText) : null,
      gradeEl,
      h('h1', { class: 'summary__title' }, s.preview ? 'Koniec podglądu sprawdzianu' : good ? 'Sprawdzian zaliczony!' : 'Sprawdzian za Tobą'),
      h('p', { class: 'summary__lead' }, `Poprawnie: ${s.score} z ${s.total} (${s.pct}%).`),
      cats.length ? h('ul', { class: 'cat-bars' }, ...cats) : null,
      ...facts, review,
      h('div', { class: 'actions summary__actions' },
        s.preview ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate(`${opts.base}/test/${opts.testId}/podglad`, { replace: true }) }, icon('repeat'), 'Jeszcze raz') : null,
        !s.preview && state.user.role === 'student' ? h('a', { class: 'btn btn--ghost', href: '/uczen/sklep', 'data-link': '' }, icon('bag'), 'Sklep') : null,
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate(opts.backHref) }, s.preview ? 'Wróć do edytora' : 'Wróć do przedmiotu', icon('arrowRight')))));
    if (good && !s.preview) setTimeout(() => { confetti({ count: 60 + g * 25 }); sound.play('fanfare'); }, 250);
    if (s.points > 0) setTimeout(() => sound.play('coin'), 900);
    if (s.points > 0) {
      const t0 = performance.now(), dur = reduced() ? 0 : 1200;
      const step = (t) => { const k = dur ? Math.min(1, (t - t0) / dur) : 1; pts.textContent = String(Math.round(s.points * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    if (state.user.role === 'student' && s.balance !== null && s.balance !== undefined) { setTimeout(() => setPointsChip(s.balance), 1100); refreshInboxBadge(); }
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function zoom(src) {
    dialog({ title: 'Obrazek', body: h('img', { src, alt: 'Obrazek do pytania', class: 'zoom-img' }), actions: [{ label: 'Zamknij', kind: 'primary' }] });
  }

  addEventListener('keydown', function onKey(e) {
    if (!root.isConnected) return removeEventListener('keydown', onKey);
    if (e.key === 'Enter' && !e.target.closest('textarea, .gap-menu')) {
      const next = bar.querySelector('.fb__next');
      if (next) { e.preventDefault(); next.click(); return; }
      const chk = bar.querySelector('.check-btn');
      if (chk && !chk.disabled && !chk.hidden && e.target.closest('input')) { e.preventDefault(); chk.click(); }
    }
  });
  await load();
}
