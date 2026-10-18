// One-off codemod: the looping 7-beat demo becomes a visitor-driven machine.
// Removed keys belong to the loop UX (scrubber, play/pause, reply beat) that
// no longer exists; the two added keys drive the Send/Restart controls.
import { readFileSync, writeFileSync } from 'node:fs';

const REMOVE = ['demo.h3', 'demo.s3', 'demo.h4', 'demo.s4', 'demo.reply', 'demo.rail', 'demo.play', 'demo.pause', 'demo.step'];

const RESTART = {
  en: 'Run it again', de: 'Nochmal zeigen', es: 'Ver otra vez', fr: 'Revoir',
  pt: 'Ver de novo', ar: 'إعادة العرض', hi: 'फिर से देखें', ja: 'もう一度', zh: '再看一次',
};
// demo.send mirrors each locale's own word for the composer's Send.
const SEND_SRC = { en: 'Send', de: 'Senden', es: 'Enviar', fr: 'Envoyer', pt: 'Enviar', ar: 'إرسال', hi: 'भेजें', ja: '送信', zh: '发送' };

for (const code of ['en', 'de', 'es', 'fr', 'pt', 'ar', 'hi', 'ja', 'zh']) {
  const path = `src/lib/messages/${code}.ts`;
  const raw = readFileSync(path, 'utf8');
  // Keep the file's own line ending style intact.
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  const out = [];
  for (const line of lines) {
    const keyMatch = line.match(/^\s*'(demo\.[a-z0-9]+)':/);
    if (keyMatch && REMOVE.includes(keyMatch[1])) continue;
    out.push(line);
    if (/^\s*'demo\.h1':/.test(line)) {
      out.push(`  'demo.send': '${SEND_SRC[code]}',`);
      out.push(`  'demo.restart': '${RESTART[code]}',`);
    }
  }

  const next = out.join(eol);
  if (next === raw) throw new Error(`${path}: no change`);
  writeFileSync(path, next);
  console.log('rewrote', path);
}
console.log('done');
