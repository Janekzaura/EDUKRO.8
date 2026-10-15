// Sprawdza protokół klienta SMTP na lokalnym, testowym serwerze (bez wysyłki na zewnątrz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edukro-smtp-'));
fs.writeFileSync(path.join(tmp, '.env'), `EDUKRO_DATA_DIR=${tmp}\n`);
process.env.EDUKRO_ENV_FILE = path.join(tmp, '.env');

test('klient SMTP przechodzi pełną rozmowę i dostarcza wiadomość', async () => {
  const { smtpSend } = await import('../server/mailer.js');
  const received = [];
  const server = net.createServer((sock) => {
    let data = false, buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') { data = false; sock.write('250 OK queued\r\n'); } else received.push(line);
          continue;
        }
        const cmd = line.split(' ')[0].toUpperCase();
        if (cmd === 'EHLO') sock.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd === 'MAIL' || cmd === 'RCPT') sock.write('250 OK\r\n');
        else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 ?\r\n');
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const raw = 'Subject: =?UTF-8?B?' + Buffer.from('Kod EDUKRO: 123').toString('base64') + '?=\r\n\r\nTreść';
  await smtpSend({ host: '127.0.0.1', port: server.address().port, secure: false, from: 'edukro@szkola.pl' },
    { to: 'uczen@example.com', raw });
  await new Promise((r) => setTimeout(r, 100));
  server.close();
  assert.ok(received.some((l) => l.includes('=?UTF-8?B?')));
  assert.ok(received.includes('Treść'));
});

test('klient SMTP odmawia wysłania hasła bez szyfrowania', async () => {
  const { smtpSend } = await import('../server/mailer.js');
  const server = net.createServer((sock) => {
    sock.write('220 test\r\n');
    sock.on('data', () => sock.write('250 test\r\n'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await assert.rejects(smtpSend({ host: '127.0.0.1', port: server.address().port, secure: false, user: 'a', pass: 'b', from: 'x@y.pl' },
    { to: 'z@y.pl', raw: 'x' }), /STARTTLS/);
  server.close();
});
