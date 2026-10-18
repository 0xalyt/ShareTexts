// One-shot: render the PWA (home-screen) icon set from the user's supplied
// artwork (public/brand-logo-source.jpg) — the exact image, edge to edge, no
// recoloring, no regeneration. Screenshot-rendered via headless Chromium.
// Favicons are NOT this script's job any more: they come from the official
// glyph artwork via scripts/gen-favicons-from-glyph.mjs — do not add them
// back here.
// Run: node scripts/gen-icons-from-artwork.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
// Inline as a data URI — headless Chromium will not fetch file:// subresources.
const dataUri = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(pub, 'brand-logo-source.jpg')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

async function write(out, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0}body{width:${w}px;height:${h}px;overflow:hidden}` +
    `img{width:${w}px;height:${h}px;object-fit:cover;display:block}</style></head>` +
    `<body><img src='${dataUri}'></body></html>`,
    { waitUntil: 'load' }
  );
  await page.screenshot({ path: path.join(pub, out), clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
}

await write('icon-512.png', 512, 512);
await write('icon-192.png', 192, 192);
await write('apple-touch-icon.png', 180, 180);
await write('icon-maskable-512.png', 512, 512);
await write('icon-maskable-192.png', 192, 192);

await browser.close();

const png = (p) => { const b = fs.readFileSync(path.join(pub, p)); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)} ${Math.round(b.length / 1024)}KB`; };
for (const p of ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png', 'icon-maskable-512.png', 'icon-maskable-192.png']) {
  console.log(`${p}: ${png(p)}`);
}
