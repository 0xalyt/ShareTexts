/**
 * gen-favicon-ico.mjs — build public/favicon.ico from the existing PNG favicons.
 *
 * Why: /favicon.ico is the one icon URL crawlers probe by default.
 * sharetexts.online answered 404 for it, which is the usual reason a site's
 * icon never shows in search results — Google reads <link rel="icon", but a
 * missing /.ico fallback still costs it (plus older clients, bookmark bars
 * and Windows shortcuts) a reliable, query-string-free icon URL.
 *
 * The .ico container wraps the PNG files verbatim (PNG-compressed entries are
 * valid ICO since Vista) — no rasterizing, no new artwork, no drift from the
 * favicons the page already ships.
 *
 * Run: node scripts/gen-favicon-ico.mjs   (wired into `npm run build`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PUB = path.join(process.cwd(), 'public');
// Largest first: readers pick the entry they can use, and several fall back
// to the first.
const SOURCES = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-16.png', size: 16 },
];

const entries = SOURCES.map(({ file, size }) => ({
  size,
  png: readFileSync(path.join(PUB, file)),
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(entries.length, 4);

const dirSize = entries.length * 16;
const offset = 6 + dirSize;
const dir = Buffer.alloc(dirSize);
let cursor = offset;

entries.forEach((e, i) => {
  const at = i * 16;
  dir.writeUInt8(e.size === 256 ? 0 : e.size, at);       // width (0 = 256)
  dir.writeUInt8(e.size === 256 ? 0 : e.size, at + 1);   // height
  dir.writeUInt8(0, at + 2);                             // palette colours
  dir.writeUInt8(0, at + 3);                             // reserved
  dir.writeUInt16LE(1, at + 4);                          // colour planes
  dir.writeUInt16LE(32, at + 6);                         // bits per pixel
  dir.writeUInt32LE(e.png.length, at + 8);               // byte size
  dir.writeUInt32LE(cursor, at + 12);                    // data offset
  cursor += e.png.length;
});

const out = path.join(PUB, 'favicon.ico');
writeFileSync(out, Buffer.concat([header, dir, ...entries.map((e) => e.png)]));
console.log(
  `gen-favicon-ico: wrote public/favicon.ico (${cursor} bytes, ` +
  `${entries.map((e) => `${e.size}×${e.size}`).join(' + ')})`
);
