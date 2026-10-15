// Wysyłka e-mail. Trzy tryby:
//   smtp – prawdziwa wysyłka przez skonfigurowany serwer SMTP (STARTTLS / TLS, AUTH LOGIN),
//   dev  – tryb deweloperski: wiadomość NIE jest wysyłana, trafia do konsoli i data/dev-outbox.log,
//   none – poczta nieskonfigurowana: funkcje wymagające e-maila zwracają czytelny błąd.
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { config, mailMode } from './config.js';

export class MailNotConfiguredError extends Error {}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function buildMessage({ to, subject, text }) {
  const from = config.mail.from;
  const domain = (from.split('@')[1] || 'edukro.local').replace(/>.*$/, '');
  const body = b64(text).replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: ${encHeader('EDUKRO')} <${from.replace(/^.*<|>.*$/g, '')}>`,
    `To: <${to}>`,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

/** Minimalny, ale pełny klient SMTP (RFC 5321) bez zewnętrznych bibliotek. */
export async function smtpSend({ host, port, secure, user, pass, from }, { to, raw }, timeoutMs = 20000) {
  let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  let buf = '';
  let waiter = null;
  const onData = (d) => { buf += d.toString('utf8'); tryResolve(); };
  function tryResolve() {
    if (!waiter) return;
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const resp = lines.slice(0, i + 1);
        buf = lines.slice(i + 1).join('\r\n');
        const w = waiter; waiter = null;
        w.resolve({ code: +resp[i].slice(0, 3), lines: resp });
        return;
      }
    }
  }
  const read = () => new Promise((resolve, reject) => { waiter = { resolve, reject }; tryResolve(); });
  const timer = setTimeout(() => socket.destroy(new Error('Przekroczono czas połączenia SMTP')), timeoutMs);
  const fail = (e) => { if (waiter) { const w = waiter; waiter = null; w.reject(e); } };
  const attach = (s) => { s.on('data', onData); s.on('error', fail); s.on('close', () => fail(new Error('Połączenie SMTP zamknięte'))); };
  attach(socket);
  const cmd = async (line, ok) => {
    if (line !== null) socket.write(line + '\r\n');
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code} po poleceniu ${line ? line.split(' ')[0] : 'powitanie'}`);
    return r;
  };
  try {
    await cmd(null, [220]);
    const helo = `EHLO ${os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'edukro'}`;
    let ehlo = await cmd(helo, [250]);
    if (!secure && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await cmd('STARTTLS', [220]);
      socket.removeAllListeners('data');
      socket = tls.connect({ socket, servername: host });
      await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
      attach(socket);
      ehlo = await cmd(helo, [250]);
    } else if (!secure && user) {
      throw new Error('Serwer SMTP nie oferuje STARTTLS – odmowa wysłania hasła bez szyfrowania');
    }
    if (user) {
      await cmd('AUTH LOGIN', [334]);
      await cmd(b64(user), [334]);
      await cmd(b64(pass), [235]);
    }
    await cmd(`MAIL FROM:<${from.replace(/^.*<|>.*$/g, '')}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd('DATA', [354]);
    const data = raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await cmd(`${data}\r\n.`, [250]);
    socket.write('QUIT\r\n');
  } finally {
    clearTimeout(timer);
    setTimeout(() => socket.destroy(), 200);
  }
}

export async function sendMail({ to, subject, text }) {
  const mode = mailMode();
  if (mode === 'none') {
    throw new MailNotConfiguredError('Usługa e-mail nie jest skonfigurowana na serwerze.');
  }
  if (mode === 'dev') {
    const entry = `\n===== [TRYB DEWELOPERSKI – wiadomość NIE została wysłana] ${new Date().toISOString()}\n` +
      `Do: ${to}\nTemat: ${subject}\n\n${text}\n=====\n`;
    console.log(entry);
    fs.appendFileSync(path.join(config.dataDir, 'dev-outbox.log'), entry);
    return { mode };
  }
  const raw = buildMessage({ to, subject, text });
  await smtpSend(config.mail, { to, raw });
  return { mode };
}
