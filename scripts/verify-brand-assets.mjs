// Verifies the shipped brand assets render as designed by sampling pixels
// off the live server (Playwright + canvas getImageData). No image files are
// touched — this is a read-only contract check.
//
// ICON CONTRACT: PWA/home-screen icons are the user's supplied glyph
// (public/brand/app-icon-glyph.png — orange mark, TRANSPARENT field)
// rendered by scripts/gen-icons-from-artwork.mjs — no recoloring, no
// redraw. purpose "any" icons keep the transparent field exactly as the
// user asked; maskable + apple-touch carry the SAME glyph on an opaque
// near-white (#ffffff) plate because those surfaces composite transparency
// onto black. The glyph's ink sits at ~0.41 of the canvas, inside the
// maskable safe zone. FAVICONS are the same glyph cropped to its ink bbox
// on a TRANSPARENT field (scripts/gen-favicons-from-glyph.mjs) —
// transparent so the tab icon reads on light and dark tab bars alike.
// Usage: node scripts/verify-brand-assets.mjs   (URL=http://localhost:3001 to override)
import { launchBrowser } from './lib.mjs';

const URL = process.env.URL || 'http://localhost:3010';

const b = await launchBrowser();
const page = await b.newPage();

async function sample(asset) {
  await page.goto(URL + asset, { waitUntil: 'load' });
  const r = await page.evaluate(() => {
    const img = new Image();
    img.src = location.href;
    return img.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
    });
  });
  return { w: r.w, h: r.h, data: new Uint8ClampedArray(r.data) };
}

// Tolerant predicates. Cream allows the designed warm glow tints (blue- or
// red-dominant but still light); ember stays strict.
const at = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
const count = (d, w, x0, y0, x1, y1, pred, step = 3) => {
  let n = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) if (pred(at(d, w, x, y))) n++;
  return n;
};
// The app-icon glyph's field: TRANSPARENT on the purpose "any" icons (the
// user asked for the PNG as-is); OPAQUE cream on maskable/apple-touch (the
// platform requirement — both composite transparency onto black).
const transparentField = (p) => p[3] === 0;
const creamPlate = (p) => p[3] === 255 && p[0] > 240 && p[1] > 235 && p[2] > 225;
// Ember field: warm orange — red dominant over blue, mid-high luminance.
const ember = (p) => p[0] > 150 && p[0] > p[2] + 60 && p[1] > p[2] && p[1] < p[0];

const checks = [];
const check = (name, cond) => checks.push([name, cond]);

// ── OG card 1200x630 — the canonical share image every page points at.
// Sampled from the path the meta tags actually serve, so this check cannot
// pass against a retired file while the real one is broken.
//
// Artwork contract (owner, 2026-11): the card is the owner's app tile —
// the orange gradient rounded square with the white signal mark, centred on a
// white field, with NOTHING added. An earlier phase replaced it with a
// designed card (headline, room sketch, lockup); the owner rejected that and
// the card was restored. These assertions therefore check for exactly the
// owner's artwork: a white field, one saturated tile in the middle, a light
// glyph inside it, and no ink anywhere — the moment a headline or a UI sketch
// reappears, this fails.
// ──
const og = await sample('/og/sharetext-og-icon-v1.png');
check('og is 1200x630', og.w === 1200 && og.h === 630);
{
  // The file checked above must be the file the head actually advertises —
  // otherwise this suite could pass against an asset no platform ever sees.
  const { readFileSync } = await import('node:fs');
  const head = readFileSync('index.html', 'utf8');
  check('og:image and twitter:image point at this card',
    head.includes('/og/sharetext-og-icon-v1.png?v=23') &&
    (head.match(/sharetext-og-icon-v1\.png\?v=23/g) || []).length >= 4);
}
{
  const light = (q) => q[0] > 200 && q[1] > 200 && q[2] > 200;
  // White field, including the corners — the tile sits in the middle only.
  check('og field is white at (4,4)', light(at(og.data, og.w, 4, 4)));
  check('og field is white at (40,300)', light(at(og.data, og.w, 40, 300)));
  check('og field is white at (1160,600)', light(at(og.data, og.w, 1160, 600)));
  check('og field is white left of the tile (450,315)', light(at(og.data, og.w, 450, 315)));
  check('og field is white right of the tile (750,315)', light(at(og.data, og.w, 750, 315)));

  // The tile: saturated brand orange at its centre, and enough of it to be the
  // subject of the card rather than a dot.
  const c = at(og.data, og.w, 520, 400);
  check(`og tile is the brand orange at centre (${c[0]},${c[1]},${c[2]})`, c[0] > 220 && c[1] > 70 && c[1] < 200 && c[2] < 90);
  const tilePx = count(og.data, og.w, 460, 175, 740, 455, ember, 4);
  check(`og tile covers its square (${tilePx} px)`, tilePx > 3000);

  // The white mark inside the tile — the glyph, not a blank orange block.
  let glyph = 0;
  for (let y = 200; y < 430; y += 2) for (let x = 480; x < 720; x += 2) {
    const p = at(og.data, og.w, x, y);
    if (p[0] > 225 && p[1] > 215 && p[2] > 200) glyph++;
  }
  check(`og white mark inside the tile (${glyph} px)`, glyph > 600);

  // No text: the card carries no headline, no lockup, no UI sketch.
  const ink = (q) => q[0] < 90 && q[1] < 90 && q[2] < 90;
  const dark = count(og.data, og.w, 0, 0, og.w, og.h, ink, 3);
  check(`og carries no added ink (${dark} px)`, dark < 200);
}

// ── Maskable icon: the glyph on an opaque near-white plate, inside the
//    central safe zone (the plate is a platform requirement, not a design
//    change; it matches the manifest background_color).
const mk = await sample('/icon-maskable-512.png');
check('maskable is 512x512', mk.w === 512 && mk.h === 512);
for (const [x, y] of [[8, 8], [504, 8], [8, 504], [504, 504]]) {
  check(`maskable corner (${x},${y}) opaque cream plate`, creamPlate(at(mk.data, mk.w, x, y)));
}
check('maskable ember glyph present', count(mk.data, mk.w, 0, 0, mk.w, mk.h, ember, 4) > 100);
check('maskable glyph inside safe zone', (() => {
  // Ink bbox must stay within the central 80% circle's bounding square.
  let minX = 512, minY = 512, maxX = -1, maxY = -1;
  for (let y = 0; y < 512; y += 2) for (let x = 0; x < 512; x += 2) {
    const p = at(mk.data, 512, x, y);
    if (p[3] >= 64 && !creamPlate(p)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return minX >= 51 && minY >= 51 && maxX <= 461 && maxY <= 461;
})());

// ── Home-screen icon (purpose any): the user's glyph as-is — transparent
//    field, ember mark.
const ic = await sample('/icon-512.png');
check('icon-512 is 512x512', ic.w === 512 && ic.h === 512);
check('icon-512 transparent field', transparentField(at(ic.data, ic.w, 8, 8)));
check('icon-512 ember glyph present', count(ic.data, ic.w, 0, 0, ic.w, ic.h, ember, 4) > 100);

// ── Apple touch icon: same glyph on the opaque near-white plate (iOS
//    renders transparency as black on the home screen).
const ap = await sample('/apple-touch-icon.png');
check('apple-touch-icon is 180x180', ap.w === 180 && ap.h === 180);
check('apple-touch-icon opaque plate', creamPlate(at(ap.data, ap.w, 4, 4)));
check('apple-touch-icon ember glyph', count(ap.data, ap.w, 0, 0, ap.w, ap.h, ember, 3) > 50);

// ── Favicon 16: the official glyph on transparency (opaque field
//    and the old ember redraw are both retired contracts) ──
const f16 = await sample('/favicon-16.png');
check('favicon-16 is 16x16', f16.w === 16 && f16.h === 16);
check('favicon-16 transparent field', at(f16.data, 16, 0, 0)[3] === 0);
check('favicon-16 ember glyph', count(f16.data, 16, 0, 0, 16, 16, ember, 1) > 0);

// ── OG cache-buster: every shipped og:image URL must carry ?v= so
//    platforms refetch instead of serving the retired card from cache. ──
const { readFileSync, readdirSync } = await import('node:fs');
const unversioned = [];
const ogRe = /sharetext-og\.jpg(?!\?v=)/g;
for (const f of ['index.html']) {
  if (ogRe.test(readFileSync(f, 'utf8'))) unversioned.push(f);
  ogRe.lastIndex = 0;
}
for (const f of readdirSync('public/guides')) {
  if (!f.endsWith('.html')) continue;
  const html = readFileSync(`public/guides/${f}`, 'utf8');
  if (html.includes('og:image') && ogRe.test(html)) unversioned.push(`public/guides/${f}`);
  ogRe.lastIndex = 0;
}
check(`every og:image URL carries ?v= cache-buster`, unversioned.length === 0);
if (unversioned.length) console.error('    unversioned:', unversioned.join(', '));

await b.close();

const failed = checks.filter(([, c]) => !c);
if (failed.length) {
  console.error(`\n${failed.length} BRAND CHECK(S) FAILED:`);
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`\nALL BRAND CHECKS GREEN (${checks.length})`);