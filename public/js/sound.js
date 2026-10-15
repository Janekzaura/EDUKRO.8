// Dźwięki EDUKRO – syntezowane na żywo (Web Audio), bez plików audio:
// kliknięcia, dobra/zła odpowiedź, punkty, nagrody, powiadomienia, kreda przy pisaniu logo, spokojna muzyka w tle,
// a do tego lektor samouczka (mowa przeglądarki, po polsku). Ustawienia zapisują się na tym urządzeniu.

const KEY = 'edukro-sound';
export const DEFAULTS = { on: true, volume: 0.7, ui: true, fx: true, chalk: true, music: false, musicVolume: 0.4, voice: true, rate: 1, voiceKind: 'standard' };
let S = load();
function load() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...DEFAULTS }; }
}
export const settings = () => ({ ...S });
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function update(patch) {
  S = { ...S, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* prywatne okno */ }
  syncMusic();
  if (!S.on || !S.voice) stopSpeaking();
  listeners.forEach((f) => f(settings()));
}

/* ---------- Kontekst audio (odblokowany pierwszym kliknięciem – tak wymagają przeglądarki) ---------- */
let ctx = null, out = null, buses = {};
const stats = { played: {}, chalkMs: 0 };
window.__edukroSound = stats; // podgląd dla testów automatycznych
function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    out = ctx.createDynamicsCompressor();
    out.threshold.value = -14; out.ratio.value = 4;
    out.connect(ctx.destination);
    for (const b of ['ui', 'fx', 'chalk', 'music']) { buses[b] = ctx.createGain(); buses[b].connect(out); }
    applyGains();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
export const isUnlocked = () => !!ctx && ctx.state === 'running';
function applyGains() {
  if (!ctx) return;
  const v = S.on ? S.volume : 0;
  const set = (b, x) => buses[b].gain.setTargetAtTime(x, ctx.currentTime, 0.03);
  set('ui', S.ui ? v * 0.55 : 0);
  set('fx', S.fx ? v : 0);
  set('chalk', S.chalk ? v * 1.1 : 0);
  const forced = effective().force; // wywoływane dopiero po załadowaniu modułu
  set('music', S.music || forced ? v * Math.max(S.musicVolume, forced && !S.music ? 0.35 : 0) * 0.6 : 0);
}
const unlockEvents = ['pointerdown', 'keydown', 'touchstart'];
function unlock() {
  ensure();
  if (isUnlocked()) unlockEvents.forEach((e) => removeEventListener(e, unlock, true));
  syncMusic();
}
unlockEvents.forEach((e) => addEventListener(e, unlock, true));

/* ---------- Klocki syntezy ---------- */
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf; n.loop = true;
  return n;
}
function tone(bus, { f = 440, f2 = null, type = 'sine', at = 0, dur = 0.2, vol = 0.3, attack = 0.005, release = null, detune = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
  o.connect(g).connect(buses[bus]);
  o.start(t); o.stop(t + (release ?? dur) + 0.05);
}
function hiss(bus, { at = 0, dur = 0.05, vol = 0.2, freq = 3000, q = 1, type = 'bandpass', sweepTo = null }) {
  const t = ctx.currentTime + at;
  const n = noise();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(buses[bus]);
  n.start(t, Math.random()); n.stop(t + dur + 0.05);
}

const SOUNDS = {
  click() { tone('ui', { f: 1650, f2: 1200, type: 'triangle', dur: 0.045, vol: 0.16 }); hiss('ui', { dur: 0.018, vol: 0.05, freq: 5200, q: 2 }); },
  tab() { tone('ui', { f: 900, f2: 1300, type: 'sine', dur: 0.07, vol: 0.12 }); },
  success() { [784, 988, 1318].forEach((f, i) => tone('fx', { f, type: 'triangle', at: i * 0.075, dur: 0.32, vol: 0.2 })); tone('fx', { f: 2637, type: 'sine', at: 0.2, dur: 0.4, vol: 0.05 }); },
  error() { tone('fx', { f: 330, f2: 196, type: 'triangle', dur: 0.32, vol: 0.24 }); tone('fx', { f: 165, f2: 110, type: 'sine', at: 0.02, dur: 0.3, vol: 0.18 }); },
  coin() { tone('fx', { f: 988, type: 'square', dur: 0.08, vol: 0.06 }); tone('fx', { f: 1318, type: 'square', at: 0.08, dur: 0.28, vol: 0.06 }); tone('fx', { f: 2637, type: 'sine', at: 0.08, dur: 0.3, vol: 0.06 }); },
  claim() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('fx', { f, type: 'triangle', at: i * 0.06, dur: 0.4, vol: 0.14 })); hiss('fx', { at: 0.25, dur: 0.6, vol: 0.05, freq: 7000, q: 0.7, type: 'highpass' }); },
  notify() { tone('fx', { f: 1046, type: 'sine', dur: 0.6, vol: 0.13 }); tone('fx', { f: 1568, type: 'sine', at: 0.11, dur: 0.8, vol: 0.11 }); },
  fanfare() {
    [523, 659, 784].forEach((f, i) => tone('fx', { f, type: 'triangle', at: i * 0.11, dur: 0.18, vol: 0.18 }));
    [523, 659, 784, 1046].forEach((f) => tone('fx', { f, type: 'triangle', at: 0.36, dur: 0.9, vol: 0.11, attack: 0.02 }));
    tone('fx', { f: 2093, type: 'sine', at: 0.36, dur: 1, vol: 0.04 });
  },
  whoosh() { hiss('ui', { dur: 0.28, vol: 0.09, freq: 600, sweepTo: 3200, q: 0.8 }); },
  step() { tone('ui', { f: 660, type: 'sine', dur: 0.12, vol: 0.1 }); tone('ui', { f: 990, type: 'sine', at: 0.06, dur: 0.18, vol: 0.08 }); },
  tick() { tone('fx', { f: 2400, type: 'square', dur: 0.015, vol: 0.05 }); },
  pop() { tone('ui', { f: 420, f2: 880, type: 'sine', dur: 0.09, vol: 0.14 }); },
  /* ---------- 0.7: gry ---------- */
  boom() {
    hiss('fx', { dur: 1.6, vol: 0.5, freq: 900, sweepTo: 120, q: 0.5, type: 'lowpass' });
    hiss('fx', { dur: 0.35, vol: 0.35, freq: 3000, sweepTo: 600, q: 0.6 });
    tone('fx', { f: 120, f2: 30, type: 'sine', dur: 1.2, vol: 0.55 });
    tone('fx', { f: 70, f2: 25, type: 'triangle', at: 0.05, dur: 1.4, vol: 0.35 });
  },
  snip() { hiss('fx', { dur: 0.05, vol: 0.25, freq: 6000, q: 3 }); tone('fx', { f: 2400, f2: 1800, type: 'square', dur: 0.03, vol: 0.05 }); hiss('fx', { at: 0.06, dur: 0.04, vol: 0.18, freq: 4500, q: 4 }); },
  torch() { hiss('fx', { dur: 0.22, vol: 0.09, freq: 1800, q: 0.7 }); hiss('fx', { dur: 0.2, vol: 0.05, freq: 300, q: 0.5, type: 'lowpass' }); },
  clang() { [523, 1311, 2093, 3400].forEach((f, i) => tone('fx', { f, type: 'triangle', dur: 1.2 - i * 0.2, vol: 0.12 / (i + 1) })); hiss('fx', { dur: 0.06, vol: 0.2, freq: 5000, q: 1 }); },
  slash() { hiss('fx', { dur: 0.18, vol: 0.22, freq: 2500, sweepTo: 7000, q: 1.2 }); tone('fx', { f: 1800, f2: 400, type: 'sine', dur: 0.15, vol: 0.05 }); },
  thud() { tone('fx', { f: 160, f2: 45, type: 'sine', dur: 0.28, vol: 0.5 }); hiss('fx', { dur: 0.09, vol: 0.28, freq: 700, q: 0.7, type: 'lowpass' }); hiss('fx', { dur: 0.03, vol: 0.12, freq: 3500, q: 1 }); },
  stamp() { tone('fx', { f: 220, f2: 90, type: 'sine', dur: 0.16, vol: 0.4 }); hiss('fx', { dur: 0.08, vol: 0.2, freq: 1200, q: 0.6 }); hiss('fx', { at: 0.04, dur: 0.12, vol: 0.06, freq: 4000, q: 1 }); },
  buzz() { for (let i = 0; i < 6; i++) tone('fx', { f: 190 + (i % 2) * 30, type: 'sawtooth', at: i * 0.07, dur: 0.08, vol: 0.035 }); hiss('fx', { dur: 0.5, vol: 0.05, freq: 900, sweepTo: 2400, q: 2 }); },
  crack() { hiss('fx', { dur: 0.07, vol: 0.3, freq: 5500, q: 2 }); tone('fx', { f: 3200, f2: 900, type: 'square', dur: 0.05, vol: 0.04 }); },
  shatter() { for (let i = 0; i < 9; i++) hiss('fx', { at: i * 0.035 + Math.random() * 0.02, dur: 0.12, vol: 0.18 - i * 0.015, freq: 3000 + Math.random() * 5000, q: 3 }); tone('fx', { f: 90, f2: 40, type: 'sine', dur: 0.4, vol: 0.3 }); },
  beep() { tone('fx', { f: 1760, type: 'square', dur: 0.06, vol: 0.05 }); },
  type() { hiss('ui', { dur: 0.025, vol: 0.12, freq: 3000 + Math.random() * 1500, q: 2 }); },
  virus() { [880, 660, 990, 440, 1320, 330, 1760].forEach((f, i) => tone('fx', { f, type: 'square', at: i * 0.06, dur: 0.06, vol: 0.05 })); hiss('fx', { at: 0.42, dur: 0.3, vol: 0.08, freq: 2000, q: 0.5 }); },
  slowmo() { tone('fx', { f: 300, f2: 60, type: 'sawtooth', dur: 1.1, vol: 0.08 }); hiss('fx', { dur: 1.1, vol: 0.1, freq: 2000, sweepTo: 200, q: 0.8 }); },
  sad() { [[392, 0], [370, 0.5], [349, 1], [330, 1.5]].forEach(([f, at], i) => tone('fx', { f, f2: i === 3 ? 300 : null, type: 'sawtooth', at, dur: i === 3 ? 1.4 : 0.45, vol: 0.07, attack: 0.04 })); },
  happy() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone('fx', { f, type: 'triangle', at: i * 0.09, dur: 0.22, vol: 0.16 }));
    [523, 659, 784, 1046, 1318].forEach((f) => tone('fx', { f, type: 'triangle', at: 0.66, dur: 1.3, vol: 0.09, attack: 0.02 }));
    hiss('fx', { at: 0.66, dur: 0.9, vol: 0.05, freq: 8000, q: 0.7, type: 'highpass' });
  },
};
export function play(name) {
  if (!S.on || !SOUNDS[name]) return;
  if (!ensure() || ctx.state !== 'running') return;
  stats.played[name] = (stats.played[name] || 0) + 1;
  try { SOUNDS[name](); } catch { /* dźwięk nie jest niezbędny */ }
}

/* ---------- Kreda na tablicy (głos sterowany ruchem stalówki przy pisaniu logo) ---------- */
export function chalkVoice() {
  let nodes = null, timer = null, down = false, speed = 0, lastOn = 0;
  function build() {
    if (nodes || !ensure()) return;
    const n = noise();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.9;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1300; body.gain.value = 7; body.Q.value = 1.2;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const grain = ctx.createGain(); grain.gain.value = 0;
    const env = ctx.createGain(); env.gain.value = 0;
    n.connect(hp).connect(bp).connect(body).connect(grain).connect(env).connect(buses.chalk);
    n.start();
    nodes = { n, bp, grain, env };
    // ziarnistość kredy: nieregularne „zgrzyty” 20–60 razy na sekundę
    timer = setInterval(() => {
      if (!nodes || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const lvl = down ? 0.35 + Math.random() * 0.65 * Math.min(1, 0.4 + speed) : 0;
      nodes.grain.gain.setTargetAtTime(lvl, t, 0.006);
      nodes.bp.frequency.setTargetAtTime(2600 + Math.random() * 1900 + speed * 600, t, 0.02);
      if (down) stats.chalkMs += 25;
      if (down && Math.random() < 0.025) tone('chalk', { f: 2200 + Math.random() * 900, type: 'sine', dur: 0.06, vol: 0.025 }); // pisk kredy
    }, 25);
  }
  return {
    set(isDown, v = 0.5) {
      if (!S.on || !S.chalk) { if (nodes) this.stop(); return; }
      build();
      if (!nodes) return;
      speed = Math.max(0, Math.min(1.5, v));
      const t = ctx.currentTime;
      if (isDown && !down) {
        lastOn = t;
        nodes.env.gain.cancelScheduledValues(t);
        nodes.env.gain.setTargetAtTime(0.42, t, 0.008);
        hiss('chalk', { dur: 0.04, vol: 0.12, freq: 260, q: 0.8, type: 'lowpass' }); // stuknięcie kredy o tablicę
      } else if (!isDown && down) nodes.env.gain.setTargetAtTime(0, t, 0.02);
      down = isDown;
      void lastOn;
    },
    stop() {
      down = false;
      clearInterval(timer); timer = null;
      if (nodes) {
        const t = ctx.currentTime;
        nodes.env.gain.setTargetAtTime(0, t, 0.03);
        const n = nodes.n; setTimeout(() => { try { n.stop(); } catch { /* już zatrzymane */ } }, 200);
        nodes = null;
      }
    },
  };
}

/* ---------- Muzyka w tle: utwory generowane na żywo (nigdy nie brzmią dwa razy tak samo) ----------
   calm (spokojna, domyślna), lofi, kosmos, jazz, arcade, sprint, disco, epic – do wyboru w sklepie (profil). */
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
/** Instrumenty (każdy gra jedną nutę do wskazanego wyjścia). */
const INST = {
  pad(dest, m, t, len, v, det = [-7, 6]) {
    for (const d of det) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = d;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(1.4, len * 0.35)); g.gain.setTargetAtTime(0.0001, t + len * 0.8, len * 0.12);
      o.connect(g).connect(dest); o.start(t); o.stop(t + len + 1.5);
    }
  },
  pluck(dest, m, t, len, v, type = 'sine') {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = mtof(m);
    env(g, t, 0.008, v, Math.max(0.15, len));
    o.connect(g).connect(dest); o.start(t); o.stop(t + len + 0.3);
  },
  keys(dest, m, t, len, v) { // „elektryczne pianino”
    for (const [mul, vv, type] of [[1, v, 'triangle'], [2, v * 0.35, 'sine'], [3, v * 0.12, 'sine']]) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = mtof(m) * mul;
      env(g, t, 0.01, vv, Math.max(0.3, len));
      o.connect(g).connect(dest); o.start(t); o.stop(t + len + 0.5);
    }
  },
  bass(dest, m, t, len, v) {
    const o = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m);
    env(g, t, 0.01, v, Math.max(0.12, len), 0.0001);
    o.connect(g); o2.connect(g); g.connect(dest); o.start(t); o2.start(t); o.stop(t + len + 0.3); o2.stop(t + len + 0.3);
  },
  square(dest, m, t, len, v) { INST.pluck(dest, m, t, len, v, 'square'); },
  saw(dest, m, t, len, v, cutoff = 1800) {
    const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff * 1.6, t); f.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + len);
    env(g, t, 0.02, v, Math.max(0.15, len));
    o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + len + 0.4);
  },
  strings(dest, m, t, len, v) {
    for (const d of [-9, 0, 8]) {
      const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d; f.type = 'lowpass'; f.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.9, len * 0.4)); g.gain.setTargetAtTime(0.0001, t + len * 0.85, len * 0.1);
      o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + len + 1.2);
    }
  },
  kick(dest, t, v = 0.5) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.003, v, 0.22);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.3);
  },
  snare(dest, t, v = 0.25) {
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    env(g, t, 0.002, v, 0.16);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + 0.22);
    INST.pluck(dest, 52, t, 0.08, v * 0.4, 'triangle');
  },
  hat(dest, t, v = 0.08, open = false) {
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 7200;
    env(g, t, 0.001, v, open ? 0.22 : 0.045);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + (open ? 0.3 : 0.08));
  },
  ride(dest, t, v = 0.05) {
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 6500; f.Q.value = 1.5;
    env(g, t, 0.002, v, 0.4);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + 0.5);
  },
  timp(dest, t, v = 0.4, m = 38) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(mtof(m) * 1.4, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.08);
    env(g, t, 0.004, v, 0.9);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 1.1);
  },
  crackle(dest, t, v = 0.02) { hissTo(dest, t, 0.012, v * (0.5 + Math.random()), 2500 + Math.random() * 3000); },
};
function hissTo(dest, t, dur, vol, freq) {
  const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1;
  env(g, t, 0.001, vol, dur);
  n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + dur + 0.05);
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* Utwory: krok = ósemka albo szesnastka; prog = akordy (MIDI), jeden akord na takt. */
const TRACKS = {
  calm: { bpm: 50, div: 2, lp: 1400, delay: 0.42, fb: 0.32,
    prog: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [60, 64, 67, 72], [52, 55, 59, 64], [53, 57, 60, 65], [55, 59, 62, 65]],
    step(i, t, s, o) {
      const ch = this.prog[Math.floor(i / 8) % this.prog.length];
      if (i % 8 === 0) ch.forEach((m) => INST.pad(o, m - 12, t, s * 8, 0.045));
      const pat = [0, 2, 1, 3, 2, 1, 3, 2];
      if (Math.random() > 0.18) INST.pluck(o, ch[pat[i % 8]] + 12, t + (Math.random() - 0.5) * 0.03, 1.1, 0.03 + Math.random() * 0.025);
    } },
  lofi: { bpm: 76, div: 4, lp: 1700, delay: 0.3, fb: 0.22, swing: 0.14,
    prog: [[50, 53, 57, 60, 64], [55, 59, 62, 65], [48, 52, 55, 59, 62], [57, 60, 64, 67]],
    step(i, t, s, o) {
      const b = i % 16, ch = this.prog[Math.floor(i / 16) % 4];
      if (b === 0 || b === 10) ch.slice(1).forEach((m, k) => INST.keys(o, m, t + k * 0.012, s * (b ? 5 : 9), 0.028));
      if ([0, 7, 8].includes(b)) INST.bass(o, ch[0] - 12, t, s * 2.5, 0.12);
      if (b === 0 || b === 9) INST.kick(o, t, 0.32);
      if (b === 4 || b === 12) INST.snare(o, t, 0.12);
      if (b % 2 === 0) INST.hat(o, t, 0.02 + Math.random() * 0.02);
      if (Math.random() < 0.3) INST.crackle(o, t + Math.random() * s);
    } },
  kosmos: { bpm: 58, div: 2, lp: 2600, delay: 0.62, fb: 0.5,
    prog: [[57, 64, 69, 71], [53, 60, 65, 67], [55, 62, 67, 69], [52, 59, 64, 66]],
    step(i, t, s, o) {
      const ch = this.prog[Math.floor(i / 8) % 4];
      if (i % 8 === 0) { ch.forEach((m) => INST.pad(o, m - 12, t, s * 8, 0.035, [-12, 0, 11])); INST.bass(o, ch[0] - 24, t, s * 7, 0.07); }
      if (Math.random() > 0.35) INST.pluck(o, pick(ch) + 24, t, 1.8, 0.02 + Math.random() * 0.02);
      if (Math.random() < 0.06) INST.pluck(o, pick(ch) + 36, t, 2.5, 0.012);
    } },
  jazz: { bpm: 112, div: 2, lp: 3000, delay: 0.18, fb: 0.12, swing: 0.18,
    prog: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 61, 64, 67]],
    step(i, t, s, o) {
      const b = i % 8, ch = this.prog[Math.floor(i / 8) % 4], nxt = this.prog[(Math.floor(i / 8) + 1) % 4];
      if (b % 2 === 0) INST.bass(o, b === 6 ? nxt[0] - 13 + (Math.random() < 0.5 ? 0 : 2) : ch[[0, 1, 2, 3][b / 2]] - 12, t, s * 1.8, 0.13);
      if (b % 2 === 0) INST.ride(o, t, 0.035); else if (b === 3 || b === 7) INST.ride(o, t, 0.025);
      if (b === 2 || b === 5 || (b === 7 && Math.random() < 0.3)) ch.forEach((m, k) => INST.keys(o, m + 12, t + k * 0.008, s * 1.2, 0.022));
      if (b === 4) INST.hat(o, t, 0.03);
    } },
  arcade: { bpm: 140, div: 4, lp: 4200, delay: 0.21, fb: 0.2,
    prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
    step(i, t, s, o) {
      const b = i % 16, ch = this.prog[Math.floor(i / 16) % 4];
      INST.square(o, ch[b % 3] + 12 + (b >= 8 ? 12 : 0), t, s * 0.9, 0.022);
      if (b % 2 === 0) INST.square(o, ch[0] - 12, t, s * 1.6, 0.035);
      if (b % 4 === 0) INST.kick(o, t, 0.3);
      if (b % 4 === 2) INST.hat(o, t, 0.05);
      if (b === 4 || b === 12) INST.snare(o, t, 0.1);
    } },
  sprint: { bpm: 156, div: 4, lp: 3800, delay: 0.19, fb: 0.15,
    prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    riff: [0, 0, 12, 0, 7, 0, 12, 10, 0, 0, 12, 0, 7, 5, 3, 2],
    step(i, t, s, o) {
      const b = i % 16, ch = this.prog[Math.floor(i / 16) % 4];
      if (b % 2 === 0) INST.bass(o, ch[0] - 12, t, s * 1.2, 0.13);
      if (b % 4 === 0) INST.kick(o, t, 0.4);
      if (b === 4 || b === 12) INST.snare(o, t, 0.16);
      INST.hat(o, t, b % 2 ? 0.035 : 0.05);
      if (Math.floor(i / 64) % 2 === 1 && b % 2 === 0) INST.saw(o, ch[0] + 12 + this.riff[b], t, s * 1.6, 0.03, 2400);
      if (b === 0) ch.forEach((m) => INST.strings(o, m, t, s * 16, 0.012));
    } },
  disco: { bpm: 120, div: 4, lp: 3600, delay: 0.25, fb: 0.2,
    prog: [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59]],
    step(i, t, s, o) {
      const b = i % 16, ch = this.prog[Math.floor(i / 16) % 4];
      if (b % 2 === 0) INST.bass(o, ch[0] - (b % 4 === 0 ? 24 : 12), t, s * 1.4, 0.14);
      if (b % 4 === 0) INST.kick(o, t, 0.42);
      if (b % 4 === 2) INST.hat(o, t, 0.06, true);
      if (b === 4 || b === 12) INST.snare(o, t, 0.13);
      if (b === 0 || b === 6 || b === 10) ch.forEach((m) => INST.strings(o, m + 12, t, s * 1.3, 0.02));
      if (Math.random() < 0.25 && b % 2) INST.pluck(o, pick(ch) + 24, t, 0.25, 0.02, 'square');
    } },
  epic: { bpm: 84, div: 2, lp: 2200, delay: 0.36, fb: 0.28,
    prog: [[50, 57, 62, 65], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]],
    step(i, t, s, o) {
      const b = i % 8, ch = this.prog[Math.floor(i / 8) % 4];
      if (b === 0) { ch.forEach((m) => INST.strings(o, m - 12, t, s * 8, 0.03)); INST.bass(o, ch[0] - 24, t, s * 7, 0.12); }
      if (b === 0 || b === 5 || b === 6) INST.timp(o, t, b ? 0.22 : 0.36, ch[0] - 24);
      if (Math.floor(i / 8) % 2 === 1 && (b === 0 || b === 3)) ch.slice(1).forEach((m) => INST.saw(o, m, t, s * 2.5, 0.02, 1500));
      if (Math.floor(i / 32) % 2 === 1 && b % 2 === 0) INST.pluck(o, ch[(b / 2) % 4] + 12, t, s * 2, 0.03, 'triangle');
    } },
};
export const TRACK_IDS = Object.keys(TRACKS);

let music = null;            // { id, timer, out }
let baseTrack = 'calm';      // muzyka wybrana na profilu
const stack = [];            // czasowo: podgląd profilu kolegi, podgląd utworu w sklepie
const effective = () => stack.length ? stack[stack.length - 1] : { id: baseTrack, force: false };
const wanted = () => { const e = effective(); return S.on && (S.music || e.force) ? e.id : null; };
export const currentTrack = () => music?.id || null;

function startEngine(id) {
  const tr = TRACKS[id] || TRACKS.calm;
  const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, ctx.currentTime); out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tr.lp || 2000; lp.Q.value = 0.4;
  const delay = ctx.createDelay(1.5); delay.delayTime.value = tr.delay ?? 0.3;
  const fb = ctx.createGain(); fb.gain.value = tr.fb ?? 0.2;
  lp.connect(out); lp.connect(delay); delay.connect(fb).connect(delay); delay.connect(out);
  out.connect(buses.music);
  const s = 60 / tr.bpm / (tr.div || 2);
  let step = 0, next = ctx.currentTime + 0.12;
  const timer = setInterval(() => {
    if (ctx.state !== 'running') return;
    while (next < ctx.currentTime + 0.5) {
      const sw = tr.swing && step % 2 ? s * tr.swing : 0;
      try { tr.step(step, next + sw, s, lp); } catch { /* muzyka nie jest niezbędna */ }
      next += s; step++;
    }
  }, 90);
  music = { id, timer, out };
  stats.played.music = (stats.played.music || 0) + 1;
  stats.track = id;
}
function stopEngine() {
  if (!music) return;
  const m = music; music = null;
  clearInterval(m.timer);
  try { m.out.gain.cancelScheduledValues(ctx.currentTime); m.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); } catch { /* nic */ }
  setTimeout(() => { try { m.out.disconnect(); } catch { /* już odłączone */ } }, 700);
  stats.track = null;
}
/** Dopasowuje odtwarzany utwór do ustawień i stosu (podgląd profilu, podgląd w sklepie). */
function syncMusic() {
  const id = wanted();
  applyGains();
  if (!id) return stopEngine();
  if (!ensure() || ctx.state !== 'running') return;
  if (music?.id === id) return;
  stopEngine();
  startEngine(id);
}
export function startMusic() { syncMusic(); }
export function stopMusic() { stopEngine(); }
export const musicPlaying = () => !!music;
/** Muzyka wybrana na profilu ucznia (gra, gdy w ustawieniach dźwięku jest włączona muzyka w tle). */
export function setTrack(id) { baseTrack = TRACKS[id] ? id : 'calm'; syncMusic(); }
/** Czasowo inny utwór (np. profil kolegi, podgląd w sklepie). force = zagraj nawet przy wyłączonej muzyce w tle. */
export function pushTrack(id, { force = true } = {}) {
  const entry = { id: TRACKS[id] ? id : 'calm', force };
  stack.push(entry);
  syncMusic();
  return () => popTrack(entry);
}
export function popTrack(entry = null) {
  if (entry) { const i = stack.lastIndexOf(entry); if (i >= 0) stack.splice(i, 1); } else stack.pop();
  syncMusic();
}
/** Krótki podgląd utworu (np. w sklepie). */
export function previewTrack(id, ms = 9000) {
  const off = pushTrack(id, { force: true });
  const t = setTimeout(off, ms);
  return () => { clearTimeout(t); off(); };
}
/* ---------- Lektor (mowa przeglądarki) ----------
   Trzy głosy: „Lektor” (domyślny), „Lektorka” (kobiecy) i „Młody lektor” (wyższy, żywszy).
   Przeglądarka ma własne głosy systemowe – wybieramy najlepiej pasujący dla języka i rodzaju,
   a gdy go brak, zmieniamy wysokość i tempo głosu, który jest. Działa też dla innych języków
   (np. angielski w zadaniach na słuch i „Do wymowy”). */
export const VOICES = [
  { id: 'standard', name: 'Lektor', sub: 'domyślny głos' },
  { id: 'kobieta', name: 'Lektorka', sub: 'kobiecy głos' },
  { id: 'mlody', name: 'Młody lektor', sub: 'wyższy, żywszy głos' },
];
export const LANGS = [
  { id: 'pl-PL', name: 'polski' }, { id: 'en-GB', name: 'angielski (brytyjski)' }, { id: 'en-US', name: 'angielski (amerykański)' },
  { id: 'de-DE', name: 'niemiecki' }, { id: 'fr-FR', name: 'francuski' }, { id: 'es-ES', name: 'hiszpański' }, { id: 'it-IT', name: 'włoski' }, { id: 'ru-RU', name: 'rosyjski' },
];
const FEMALE = /female|kobiet|zofia|paulina|ewa|agnieszka|maja|zosia|aria|jenny|zira|hazel|susan|libby|sonia|emma|ava|allison|samantha|karen|moira|tessa|serena|katja|hedda|amala|anna|helena|elsa|denise|julie|hortense|elvira|laura|lucia|isabella|elsa|irina|svetlana|dariya|google (polski|us english|deutsch|français|español|italiano|русский)|uk english female/i;
const MALE = /\bmale\b|marek|adam|jacek|krzysztof|guy|david|mark|george|ryan|thomas|daniel|conrad|stefan|killian|henri|alvaro|diego|pablo|cosimo|pavel|dmitry|google uk english male/i;
let voicesCache = [];
function loadVoices() { try { voicesCache = speechSynthesis.getVoices(); } catch { voicesCache = []; } return voicesCache; }
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }
const sex = (v) => (MALE.test(v.name) && !/female/i.test(v.name) ? 'm' : FEMALE.test(v.name) ? 'f' : '?');
const quality = (v) => (/natural|online|neural|premium|enhanced/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
/** Dobór głosu przeglądarki i ustawień (wysokość, tempo) dla rodzaju lektora i języka. */
export function voiceFor(kind = 'standard', lang = 'pl-PL') {
  const list = voicesCache.length ? voicesCache : loadVoices();
  const base = String(lang).slice(0, 2).toLowerCase();
  let cand = list.filter((v) => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase());
  if (!cand.length) cand = list.filter((v) => v.lang?.toLowerCase().startsWith(base));
  cand = cand.slice().sort((a, b) => quality(b) - quality(a));
  const f = cand.find((v) => sex(v) === 'f'), m = cand.find((v) => sex(v) === 'm');
  const any = cand[0] || null;
  if (kind === 'kobieta') return f ? { voice: f, pitch: 1.05, rate: 1 } : { voice: any, pitch: 1.3, rate: 1 };
  if (kind === 'mlody') { const v = m || any; return { voice: v, pitch: v && sex(v) === 'f' ? 1.45 : 1.6, rate: 1.1 }; }
  return m ? { voice: m, pitch: 0.95, rate: 1 } : { voice: any, pitch: 0.85, rate: 0.98 };
}
export const canSpeak = () => 'speechSynthesis' in window;
/** Głos lektora wybrany na tym urządzeniu (Ustawienia → Dźwięk). */
export const defaultVoice = () => (VOICES.some((v) => v.id === S.voiceKind) ? S.voiceKind : 'standard');
/**
 * Czyta tekst na głos; zwraca obietnicę zakończoną po przeczytaniu (albo od razu, gdy lektor jest wyłączony).
 * force – czytaj mimo wyłączonego dźwięku (np. przycisk „Posłuchaj”); content – treść lekcji/zadania
 * (czyta, gdy dźwięk jest włączony, niezależnie od lektora podpowiedzi).
 */
export function speak(text, { force = false, content = false, lang = 'pl-PL', voice: kind = null, rate = null } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve(false);
    if (!force && (!S.on || (!content && !S.voice))) return resolve(false);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/[„”]/g, '"'));
      u.lang = lang;
      const pick = voiceFor(kind || defaultVoice(), lang);
      if (pick.voice) u.voice = pick.voice;
      u.pitch = pick.pitch;
      u.rate = (rate || S.rate || 1) * pick.rate;
      u.volume = Math.min(1, (S.volume || 0.7) + 0.2);
      u.onend = () => resolve(true); u.onerror = () => resolve(false);
      stats.played.voice = (stats.played.voice || 0) + 1;
      stats.lastSpeech = { text: String(text), lang, voice: kind || defaultVoice() };
      speechSynthesis.speak(u);
      setTimeout(() => resolve(false), Math.min(30000, 1500 + text.length * 90)); // zabezpieczenie, gdyby przeglądarka nie zgłosiła końca
    } catch { resolve(false); }
  });
}
export function stopSpeaking() { if (canSpeak()) try { speechSynthesis.cancel(); } catch { /* nic */ } }
export const speaking = () => canSpeak() && speechSynthesis.speaking;
