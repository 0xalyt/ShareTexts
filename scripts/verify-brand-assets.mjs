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
// red-dominant but still light); ember and ink stay strict.
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
const ink = (p) => p[0] < 130 && p[1] < 130 && p[2] < 130;
// Ember field: warm orange — red dominant over blue, mid-high luminance.
const ember = (p) => p[0] > 150 && p[0] > p[2] + 60 && p[1] > p[2] && p[1] < p[0];

const checks = [];
const check = (name, cond) => checks.push([name, cond]);

// ── OG card 1200x630 — the canonical share image every page points at.
// Sampled from the path the meta tags actually serve, so this check cannot
// pass against a retired file while the real one is broken. Artwork: logo +
// wordmark above, laptop + phone product shot below, light background.
// ──
const og = await sample('/og/sharetext-og.jpg');
check('og is 1200x630', og.w === 1200 && og.h === 630);
{
  // The card's background is the light field the text sits on; the product
  // shot (laptop + phone) occupies roughly the right half, so the sample
  // point has to be a real background pixel. (40,300) is the left margin,
  // clear of the wordmark block and the device artwork — verified pure white
  // (255,255,255) against the current card. The old (600,315) point landed on
  // the laptop's dark screen once the artwork changed, so the assertion was
  // measuring the product shot, not the background it was written to check.
  const p = at(og.data, og.w, 40, 300);
  check(`og background margin (40,300) light`, p[0] > 200 && p[1] > 200 && p[2] > 200);
  const anyInk = count(og.data, og.w, 0, 0, og.w, og.h, ink, 6);
  check(`og ink artwork present (${anyInk} px)`, anyInk > 50);
  const anyEmber = count(og.data, og.w, 0, 0, og.w, og.h, ember, 4);
  check(`og ember brand glyph present (${anyEmber} px)`, anyEmber > 20);
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