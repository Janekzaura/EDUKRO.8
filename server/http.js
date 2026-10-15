// Mały router HTTP bez zależności.
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAgeSec, path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Strict'];
  if (config.production) parts.push('Secure');
  if (maxAgeSec !== undefined) parts.push(`Max-Age=${maxAgeSec}`);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), parts.join('; ')]);
}
export const clearCookie = (res, name) => setCookie(res, name, '', { maxAgeSec: 0 });

export function clientIp(req) {
  if (config.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export async function readJson(req, limit = 32 * 1024) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const ct = req.headers['content-type'] || '';
  if (!ct.startsWith('application/json')) throw new HttpError(415, 'Nieprawidłowy format danych.');
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Zbyt duże dane.');
    chunks.push(c);
  }
  if (!size) return {};
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; }
  catch { throw new HttpError(400, 'Nieprawidłowe dane JSON.'); }
}

export function send(res, status, body) {
  const json = JSON.stringify(body ?? {});
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

/** Pomocnicze walidatory danych wejściowych. */
export function str(v, { max = 200, min = 0, field = 'Pole' } = {}) {
  const s = typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (s.length < min) throw new HttpError(400, `${field}: to pole jest wymagane.`);
  if (s.length > max) throw new HttpError(400, `${field}: maksymalnie ${max} znaków.`);
  return s;
}
export function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Nieprawidłowy identyfikator.');
  return n;
}
