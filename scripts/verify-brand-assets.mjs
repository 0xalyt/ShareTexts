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
// Artwork contract (owner, 2026-11): the card is the owner's app tile mounted
// on a white field — tile centred, 280px, rounded, nothing else. No headline,
// no lockup, no UI sketch, no second colour, no shadow. The owner supplied
// this composition as the reference and asked for it to stay put.
//
// History that must not repeat: v2/v3 blew the tile up to fill the whole card
// (edge-to-edge orange, mark at 340px). That is a different picture, it shipped
// while the owner kept reporting the preview as wrong, and these assertions
// existed to pin it. They now pin the opposite: a white field, a centred tile,
// and no full-bleed orange. Filling the card again fails here.
// ──
const og = await sample('/og/sharetext-og-icon-v4.jpg');
check('og is 1200x630', og.w === 1200 && og.h === 630);
{
  // The file checked above must be the file the head actually advertises —
  // otherwise this suite could pass against an asset no platform ever sees.
  const { readFileSync } = await import('node:fs');
  const head = readFileSync('index.html', 'utf8');
  check('og:image and twitter:image point at this card',
    head.includes('/og/sharetext-og-icon-v4.jpg') &&
    (head.match(/twitter:image/g) || []).length >= 2);
  check('no page still advertises a retired og card', !/sharetext-og-icon-v[23]\.jpg/.test(head));
}
{
  const orange = (q) => q[0] > 200 && q[1] > 40 && q[1] < 200 && q[2] < 110;
  const white = (q) => q[0] > 244 && q[1] > 244 && q[2] > 244;

  // The field: white, including all four corners. A full-bleed card fails here.
  for (const [x, y] of [[4, 4], [1195, 4], [4, 625], [1195, 625], [120, 315], [1080, 315]]) {
    const p = at(og.data, og.w, x, y);
    check(`og field is white at (${x},${y}) — ${p[0]},${p[1]},${p[2]}`, white(p));
  }

  // The tile: 280px, centred, so orange is inside 460..740 x 175..455 and not
  // outside it. Both directions are asserted — a missing tile and a blown-up
  // one are different failures and both have happened.
  for (const [x, y] of [[500, 250], [700, 250], [600, 440]]) {
    const p = at(og.data, og.w, x, y);
    check(`og tile orange at (${x},${y}) — ${p[0]},${p[1]},${p[2]}`, orange(p));
  }
  check('og tile does not bleed to the edges',
    !orange(at(og.data, og.w, 300, 315)) && !orange(at(og.data, og.w, 900, 315)));

  // The mark, inside the tile: white pixels well beyond a bare tile.
  let glyph = 0;
  for (let y = 190; y < 445; y += 2) for (let x = 465; x < 735; x += 2) {
    const p = at(og.data, og.w, x, y);
    if (p[0] > 225 && p[1] > 215 && p[2] > 200) glyph++;
  }
  check(`og carries the white mark inside the tile (${glyph} px)`, glyph > 1200);

  // No text and no ink: the card carries no headline, no lockup, no sketch.
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

// ── OG URL hygiene: the card is versioned by FILENAME (…-v4.jpg) and never by
//    a query string. Filename versioning still busts every cache, and it is the
//    form the pickiest fetchers handle: WhatsApp's image scraper has a long
//    history of dropping an og:image that carries a `?v=` — the link then
//    previews with the *previous* card, or with none at all, while our own
//    curl of the same URL returns 200. So: version in the name, nothing after
//    the extension. ──
const { readFileSync, readdirSync } = await import('node:fs');
const badUrls = [];
const crossRefs = [];
const cardRe = /sharetext-og-icon-v4\.jpg/g;
const retiredRe = /sharetext-og-icon-v[23]\.(?:jpg|png)/g;
const pages = ['index.html', ...readdirSync('public/guides')
  .filter((f) => f.endsWith('.html'))
  .map((f) => `public/guides/${f}`)];
for (const f of pages) {
  const html = readFileSync(f, 'utf8');
  if (!html.includes('og:image')) continue;
  if (!cardRe.test(html)) crossRefs.push(f);
  cardRe.lastIndex = 0;
  if (/sharetext-og-icon-v4\.jpg\?/.test(html)) badUrls.push(f);
  if (retiredRe.test(html)) badUrls.push(`${f} (retired card)`);
  retiredRe.lastIndex = 0;
}
check(`every page advertises the current card (${pages.length} checked)`, crossRefs.length === 0);
if (crossRefs.length) console.error('    missing:', crossRefs.join(', '));
check('no og card URL carries a query string', badUrls.length === 0);
if (badUrls.length) console.error('    bad:', badUrls.join(', '));

await b.close();

const failed = checks.filter(([, c]) => !c);
if (failed.length) {
  console.error(`\n${failed.length} BRAND CHECK(S) FAILED:`);
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`\nALL BRAND CHECKS GREEN (${checks.length})`);