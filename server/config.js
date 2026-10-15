// Konfiguracja EDUKRO. Wartości pochodzą z pliku .env (lub zmiennych środowiskowych).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile() {
  const envPath = process.env.EDUKRO_ENV_FILE || path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    const example = path.join(ROOT, '.env.example');
    if (!process.env.EDUKRO_ENV_FILE && fs.existsSync(example)) {
      fs.copyFileSync(example, envPath);
      console.log('[EDUKRO] Utworzono plik .env na podstawie .env.example');
    } else return;
  }
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

const env = process.env;
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|tak|yes)$/i.test(v));
const int = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : parseInt(v, 10));

const mode = (env.EDUKRO_ENV || 'development').toLowerCase();
const production = mode === 'production';

const dataDir = path.resolve(ROOT, env.EDUKRO_DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Sekret serwera (HMAC kodów e-mail itp.). Jeśli nie podano – generowany i zapisywany lokalnie.
function serverSecret() {
  if (env.EDUKRO_SECRET && env.EDUKRO_SECRET.length >= 32) return env.EDUKRO_SECRET;
  const f = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('base64'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

const emailCodeLength = int(env.EMAIL_CODE_LENGTH, 3);

export const config = {
  mode,
  production,
  port: int(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  dataDir,
  dbFile: path.join(dataDir, env.EDUKRO_DB_FILE || 'edukro.db'),
  secret: serverSecret(),
  trustProxy: bool(env.TRUST_PROXY, false),

  // Kody początkowe – używane WYŁĄCZNIE przy pierwszej inicjalizacji bazy.
  initTeacherCode: env.EDUKRO_INIT_TEACHER_CODE || '',
  initAdminCode: env.EDUKRO_INIT_ADMIN_CODE || '',
  forceInitialCodeChange: env.FORCE_INITIAL_CODE_CHANGE
    ? bool(env.FORCE_INITIAL_CODE_CHANGE)
    : production,

  // Kod weryfikacyjny e-mail: 3 cyfry (wymóg wstępny) albo 6 cyfr (zalecane przed wdrożeniem).
  emailCodeLength: [3, 4, 5, 6, 7, 8].includes(emailCodeLength) ? emailCodeLength : 3,
  emailCodeTtlMin: int(env.EMAIL_CODE_TTL_MIN, 10),
  emailCodeMaxAttempts: int(env.EMAIL_CODE_MAX_ATTEMPTS, 5),
  emailResendCooldownSec: int(env.EMAIL_RESEND_COOLDOWN_SEC, 60),
  emailMaxSendsPerHour: int(env.EMAIL_MAX_SENDS_PER_HOUR, 4),
  // Maks. liczba błędnych kodów dla jednej osoby z rejestru na dobę (chroni krótki kod 3-cyfrowy).
  emailMaxWrongPerPersonPerDay: int(env.EMAIL_MAX_WRONG_PER_PERSON_PER_DAY, 10),

  studentCodeMinLength: int(env.STUDENT_CODE_MIN_LENGTH, 6),
  // Długość kodu nauczyciela i administratora (wymóg początkowy: 4 cyfry; można zwiększyć do 8).
  pinLength: Math.min(8, Math.max(4, int(env.PIN_LENGTH, 4))),
  sessionHours: { student: 12, teacher: 8, admin: 2 },

  mail: {
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: bool(env.SMTP_SECURE, false),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || '',
    // Tryb deweloperski: wiadomość NIE jest wysyłana; treść trafia do konsoli serwera
    // i pliku data/dev-outbox.log. Niedostępny w trybie produkcyjnym.
    devOutbox: !production && bool(env.EDUKRO_DEV_MAIL, false),
  },

  schoolPhoto: env.SCHOOL_PHOTO || 'assets/szkola.jpg',
  schoolPhotoFocus: env.SCHOOL_PHOTO_FOCUS || '50% 45%',
  schoolName: env.SCHOOL_NAME || 'Samorządowa Szkoła Podstawowa im. Polskich Noblistów w Nowym Folwarku',
};

export function mailMode() {
  const m = config.mail;
  if (m.host && m.from) return 'smtp';
  if (m.devOutbox) return 'dev';
  return 'none';
}
