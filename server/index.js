// EDUKRO – serwer aplikacji (Node.js ≥ 22.13, bez zewnętrznych zależności).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT, mailMode } from './config.js';
import { seed, cleanup } from './db.js';
import { Router, HttpError, readJson, send, clientIp } from './http.js';
import { loadSession } from './auth.js';
import * as publicRoutes from './routes/public.js';
import * as registerRoutes from './routes/register.js';
import * as memberRoutes from './routes/members.js';
import * as adminRoutes from './routes/admin.js';
import * as testRoutes from './routes/tests.js';
import * as lessonRoutes from './routes/lessons.js';
import * as shopRoutes from './routes/shop.js';
import * as inboxRoutes from './routes/inbox.js';
import * as funRoutes from './routes/fun.js';
import * as dailyRoutes from './routes/daily.js';
import * as templateRoutes from './routes/templates.js';
import * as gameRoutes from './routes/games.js';
import { seedDemoV7 } from './games/demo.js';
import { awardSchoolStars } from './stars.js';
import { maybeCheckLeaders } from './rankings.js';
import { seedDemo, seedDemoV3, seedDemoV6 } from './quiz/demo.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export function createApp() {
  const router = new Router();
  for (const m of [publicRoutes, registerRoutes, memberRoutes, adminRoutes, testRoutes, lessonRoutes, shopRoutes, inboxRoutes, funRoutes, dailyRoutes, templateRoutes, gameRoutes]) m.register(router);

  async function handleApi(req, res, url) {
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'Nie znaleziono.');
    if (found.methodNotAllowed) throw new HttpError(405, 'Niedozwolona metoda.');
    // Ochrona przed CSRF: żądania zmieniające stan muszą pochodzić z aplikacji EDUKRO.
    if (req.method !== 'GET') {
      if (req.headers['x-edukro'] !== '1') throw new HttpError(403, 'Żądanie odrzucone.');
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Żądanie odrzucone.');
    }
    const fns = found.route.handlers.filter((h) => typeof h === 'function');
    const opts = Object.assign({}, ...found.route.handlers.filter((h) => typeof h === 'object'));
    const [handler, ...guards] = fns;
    const ctx = {
      req, res, params: found.params, query: Object.fromEntries(url.searchParams),
      ip: clientIp(req), user: loadSession(req), allowMustChange: !!opts.allowMustChange,
    };
    for (const g of guards) g(ctx); // uprawnienia sprawdzane przed odczytem danych
    ctx.body = await readJson(req, opts.bodyLimit);
    const result = await handler(ctx);
    if (!res.headersSent) send(res, 200, result);
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.includes('\0')) throw new HttpError(400, 'Nieprawidłowa ścieżka.');
    let file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) throw new HttpError(403, 'Brak dostępu.');
    const isAsset = path.extname(rel) !== '';
    if (!isAsset || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (isAsset) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nie znaleziono'); }
      file = path.join(PUBLIC, 'index.html'); // aplikacja jednostronicowa
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    headers['Cache-Control'] = ext === '.html' ? 'no-cache' : /\.(woff2?|svg)$/.test(ext) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
      else throw new HttpError(405, 'Niedozwolona metoda.');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      // Nie ujawniamy szczegółów błędów; w logu bez danych z żądania.
      console.error('[EDUKRO] Błąd serwera:', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
      if (!res.headersSent) send(res, 500, { error: 'Wystąpił błąd serwera. Spróbuj ponownie.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const s = seed();
    if (s.seeded) console.log('[EDUKRO] Zainicjowano bazę: przedmioty klas 4–8, konto Joanny Hyżorek (chemia, biologia), konto administratora.');
    if (!config.production && seedDemo()) console.log('[EDUKRO] Dodano przykładowe testy (Chemia i Biologia) – możesz je edytować albo usunąć.');
    if (!config.production && seedDemoV3()) console.log('[EDUKRO] Dodano przykładową lekcję, sprawdzian i klasę 7a (12 przykładowych uczniów w rejestrze).');
    if (!config.production && seedDemoV6()) console.log('[EDUKRO] Dodano przykładowe dzienne pytania (Chemia i Biologia).');
    if (!config.production && seedDemoV7()) console.log('[EDUKRO] Dodano dwie przykładowe gry z chemii: Saper i Hammer Game.');
  } catch (e) {
    console.error('[EDUKRO]', e.message);
    process.exit(1);
  }
  cleanup();
  setInterval(cleanup, 3600e3).unref();
  // co 5 minut: Gwiazda szkoły (piątek 16:00), liderzy rankingu (ponad 3 dni)
  const periodic = () => {
    try { awardSchoolStars(); } catch (e) { console.error('[EDUKRO] Gwiazdy:', e.message); }
    maybeCheckLeaders(true);
  };
  periodic();
  setInterval(periodic, 5 * 60e3).unref();
  const server = createApp();
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n  [EDUKRO] Port ${config.port} jest zajęty – prawdopodobnie działa jeszcze STARA wersja EDUKRO.`);
      console.error('  Zamknij jej okno (albo uruchom URUCHOM-EDUKRO.bat, który robi to sam) i spróbuj ponownie.\n');
      process.exit(3);
    }
    throw e;
  });
  server.listen(config.port, config.host, () => {
    const mm = mailMode();
    console.log(`\n  EDUKRO działa:  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`  Tryb: ${config.production ? 'produkcyjny' : 'deweloperski'}`);
    console.log(`  Konta uczniów: uczeń z rejestru zakłada konto sam, a administrator je zatwierdza`);
    void mm;
    const photo = path.join(PUBLIC, config.schoolPhoto);
    if (!fs.existsSync(photo)) console.log(`  Zdjęcie szkoły: brak pliku public/${config.schoolPhoto} – wgraj zdjęcie, aby pojawiło się w tle`);
    console.log('');
  });
}
