// OG card generator — the 1200×630 link preview every social surface reads
// (X/Twitter, WhatsApp, LinkedIn, Slack, iMessage, Discord, Telegram).
//
// OWNER'S ARTWORK — the card is the owner's app tile and nothing else. No
// headline, no lockup, no UI sketch, no second colour, no decoration.
//
// Revision v2 fills the card with that artwork instead of floating it on a
// white field. v1 centred the tile at 280px inside 1200×630 of white; at feed
// size that is a small orange square lost in a mostly-white rectangle, which
// is the "shared links look broken" complaint all over again.
//
// Nothing is redrawn. Two things are taken from the tile file itself:
//
//   - the mark, as a transparent glyph cut out of the artwork by luminance, so
//     it can sit on the card at any size without dragging a rectangle of
//     slightly-different orange behind it;
//   - the field, sampled from the artwork's own corners, edges and centre, so
//     the card's colour is the tile's gradient and not a colour anyone picked.
//
// Deterministic: same input, same pixels. Run:
//   node scripts/gen-og-card.mjs
// The file name carries a version (sharetext-og-icon-v3.jpg) so X and friends
// refetch it instead of serving a cached copy of the retired artwork; bump the
// name and ?v= in index.html, public/guides/*.html, public/sw.js and
// scripts/seo-harden.mjs together.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tilePath = path.join(root, 'public/brand/logo-tile-white-on-orange.jpg');
const out = path.join(root, 'public/og/sharetext-og-icon-v3.jpg');

const W = 1200;
const H = 630;
/** Height of the mark on the card, in px. Big enough to read at feed size. */
const MARK_H = 340;

const tile = fs.readFileSync(tilePath).toString('base64');
const tileUrl = `data:image/jpeg;base64,${tile}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');

const art = await page.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const S = img.naturalWidth;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

  // 1. The mark, as alpha. The tile's orange never reaches the threshold, so
  //    this isolates the white signal mark with its anti-aliased edge intact.
  const glyph = ctx.createImageData(canvas.width, canvas.height);
  let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const a = Math.max(0, Math.min(1, (lum(i) - 186) / 54));
      glyph.data[i] = 255;
      glyph.data[i + 1] = 253;
      glyph.data[i + 2] = 246;
      glyph.data[i + 3] = Math.round(a * 255);
      if (a > 0.35) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const g = document.createElement('canvas');
  g.width = x1 - x0 + 1;
  g.height = y1 - y0 + 1;
  g.getContext('2d').putImageData(glyph, -x0, -y0);

  // 2. The field's colours: artwork corners and edges for the outside, a small
  //    patch off-centre for the glow behind the mark.
  const at = (x, y) => {
    const i = (Math.round(y) * canvas.width + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const avg = (pts) => {
    const sum = pts.reduce((acc, [x, y]) => {
      const c = at(x, y);
      return [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]];
    }, [0, 0, 0]);
    return sum.map((v) => Math.round(v / pts.length));
  };
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const p = Math.round(S * 0.04);
  const edge = avg([[p, p], [S - p, p], [p, S - p], [S - p, S - p], [S / 2, p], [p, S / 2], [S - p, S / 2], [S / 2, S - p]]);
  const glow = avg([[S * 0.5, S * 0.33], [S * 0.36, S * 0.38], [S * 0.64, S * 0.38], [S * 0.5, S * 0.2]]);

  return {
    glyph: g.toDataURL('image/png'),
    markW: g.width,
    markH: g.height,
    edge: hex(edge),
    glow: hex(glow),
    size: S,
  };
}, tileUrl);

if (!art.markW) throw new Error('could not find the mark in the tile — is the artwork right?');

const markH = MARK_H;
const markW = Math.round((art.markW / art.markH) * MARK_H);

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${W}px; height: ${H}px; background: ${art.edge}; }
  .card { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  /* The tile's own gradient: dark at the corners, warm in the middle. */
  .field {
    position: absolute; inset: 0;
    background:
      radial-gradient(72% 96% at 50% 42%, ${art.glow} 0%, rgba(0,0,0,0) 72%),
      linear-gradient(160deg, ${art.edge} 0%, ${art.edge} 100%);
  }
  .mark { position: absolute; top: 50%; left: 50%; width: ${markW}px; height: ${markH}px; transform: translate(-50%, -50%); }
  .mark img { display: block; width: 100%; height: 100%; }
</style></head>
<body><div class="card"><div class="field"></div><div class="mark"><img alt="" src="${art.glyph}"></div></div></body></html>`;

await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(250);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();

const { size } = fs.statSync(out);
console.log(`wrote ${path.relative(root, out)} — ${W}x${H}, ${Math.round(size / 1024)} KB`);
console.log(`mark ${art.markW}x${art.markH} of ${art.size} → ${markW}x${markH} on the card`);
console.log(`field edge ${art.edge}, glow ${art.glow}`);
