// Kryptografia: haszowanie kodów dostępu (scrypt), tokeny sesji, kody jednorazowe.
import crypto from 'node:crypto';
import { config } from './config.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Hasz kodu dostępu – kodów nigdy nie zapisujemy jawnym tekstem. */
export function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(secret), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifySecret(secret, stored) {
  try {
    const [alg, N, r, p, salt, key] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(key, 'base64');
    const got = crypto.scryptSync(String(secret), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(expected, got);
  } catch { return false; }
}

// Stały hasz do porównań, gdy konto nie istnieje (wyrównuje czas odpowiedzi).
export const DUMMY_HASH = hashSecret(crypto.randomBytes(8).toString('hex'));

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const hmac = (s) => crypto.createHmac('sha256', config.secret).update(String(s)).digest('hex');

export function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10);
  return s;
}

/** Kod resetu dostępu do przekazania uczniowi (bez mylących znaków 0/O, 1/I/L). */
export function readableCode(len = 10) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
  return s.slice(0, 5) + '-' + s.slice(5);
}

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function maskEmail(email) {
  if (!email) return null;
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}`;
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
