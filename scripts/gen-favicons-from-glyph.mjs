// gen-favicons-from-glyph — browser-tab favicon set from the OFFICIAL
// app-icon glyph the user supplied (public/brand/app-icon-glyph.png, the
// same 1800px transparent RGBA art the PWA icons render).
//
// CONTRACT: orange glyph on a TRANSPARENT field (user-approved choice —
// reads on light and dark tab bars alike). No recoloring, no redraw: the
// glyph is CROPPED to its ink bounding box (the source carries ~57%
// transparent padding, which at 16px would shrink the mark to a dot) and
// only then resampled down through progressive halving steps.
// favicon.svg embeds a rendered 256px PNG of the same crop as a data URI
// (SVG favicons cannot reference external resources; the 1800px source
// would be a ~650KB base64 payload in every page load).
// The PWA / home-screen icon set is a SEPARATE pipeline
// (scripts/gen-icons-from-artwork.mjs from the same glyph, as-is).
//
// Run: node scripts/gen-favicons-from-glyph.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const glyphPath = path.join(pub, 'brand', 'app-icon-glyph.png');
const dataUri = 'data:image/png;base64,' + fs.readFileSync(glyphPath).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

// ── Crop the source to its ink bbox + a hair of breathing room, scaled to
//    a 0.78 fill on a transparent 512 canvas — the established favicon
//    geometry (ink ratio check below targets 0.72 ± 0.08).
const croppedUri = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const scan = document.createElement('canvas');
  scan.width = W; scan.height = H;
  const sx = scan.getContext('2d', { willReadFrequently: true });
  sx.drawImage(img, 0, 0);
  const d = sx.getImageData(0, 0, W, H).data;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const ink = Math.max(maxX - minX + 1, maxY - minY + 1);
  const out = 512;
  const draw = Math.round(out * 0.78);
  const off = Math.round((out - draw) / 2);
  const c = document.createElement('canvas');
  c.width = out; c.height = out;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, minX, minY, maxX - minX + 1, maxY - minY + 1, off, off, draw, draw);
  return c.toDataURL('image/png');
}, dataUri);
const croppedBytes = Buffer.from(croppedUri.split(',')[1], 'base64');
const croppedDataUri = croppedUri;

// ── Render the PNG favicons through progressive halving (a single 16× jump
//    would alias the arcs; each ≤2× step cannot).
const sizes = [48, 32, 16];
for (const size of sizes) {
  const out = await page.evaluate(async ({ src, size }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    let cur = document.createElement('canvas');
    cur.width = img.naturalWidth;
    cur.height = img.naturalHeight;
    const c0 = cur.getContext('2d');
    c0.drawImage(img, 0, 0);
    while (cur.width >= size * 2) {
      const half = Math.max(size, Math.round(cur.width / 2));
      const next = document.createElement('canvas');
      next.width = half;
      next.height = half;
      const nx = next.getContext('2d');
      nx.imageSmoothingEnabled = true;
      nx.imageSmoothingQuality = 'high';
      nx.drawImage(cur, 0, 0, half, half);
      cur = next;
    }
    const fin = document.createElement('canvas');
    fin.width = size;
    fin.height = size;
    const fx = fin.getContext('2d', { willReadFrequently: true });
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(cur, 0, 0, size, size);

    // Verify the delivered pixels: transparent corners, ember glyph present,
    // ink bbox at the 0.72 geometry ratio (± tolerance at small sizes).
    const d = fx.getImageData(0, 0, size, size).data;
    const at = (x, y) => ((y * size + x) * 4);
    const cornersClear = [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]
      .every(([x, y]) => d[at(x, y) + 3] < 64);
    // alpha ≥ 64: at 16px the arcs are ~1px wide and never reach full
    // coverage — a 160 cut would measure a shrunken bbox (0.56) and call
    // correct art wrong. Corners are asserted transparent separately.
    let ember = 0, minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = at(x, y);
        if (d[i + 3] >= 64) {
          if (d[i] > 150 && d[i] > d[i + 2] + 60 && d[i + 1] > d[i + 2] && d[i + 1] < d[i]) ember++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const ratio = maxX >= 0 ? (maxY - minY + 1) / size : 0;
    const errs = [];
    if (!cornersClear) errs.push('corner not transparent');
    if (ember < 4) errs.push(`ember pixels ${ember}`);
    if (Math.abs(ratio - 0.72) > 0.08) errs.push(`ink ratio ${ratio.toFixed(2)}`);
    if (errs.length) return { error: errs.join('; ') };
    return { dataUrl: fin.toDataURL('image/png'), ember, ratio: Number(ratio.toFixed(3)) };
  }, { src: croppedDataUri, size });

  if (out.error) {
    console.error(`FAIL favicon-${size}: ${out.error}`);
    await browser.close();
    process.exit(1);
  }
  fs.writeFileSync(path.join(pub, `favicon-${size}.png`), Buffer.from(out.dataUrl.split(',')[1], 'base64'));
  console.log(`favicon-${size}.png: ${size}x${size} transparent, ember px ${out.ember}, ink ratio ${out.ratio}`);
}

await browser.close();

// ── favicon.svg: self-contained wrapper around the cropped glyph rendered
//    at 256px (SVG favicons may not reference external resources; the
//    1800px source would balloon to ~650KB of base64 in the HTML head).
const svg256 = await chromium.launch().then(async (b2) => {
  const p2 = await b2.newPage();
  const r = await p2.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, 256, 256);
    return c.toDataURL('image/png');
  }, croppedDataUri);
  await b2.close();
  return Buffer.from(r.split(',')[1], 'base64');
});
const svg =
  `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">\n` +
  `  <!-- Official ShareTexts mark — the user's app-icon glyph (cropped to\n` +
  `       its ink bbox) rendered at 256px and embedded as-is.\n` +
  `       Source: public/brand/app-icon-glyph.png via gen-favicons-from-glyph.mjs. -->\n` +
  `  <image href="data:image/png;base64,${svg256.toString('base64')}" x="0" y="0" width="256" height="256"/>\n` +
  `</svg>\n`;
fs.writeFileSync(path.join(pub, 'favicon.svg'), svg);
console.log(`favicon.svg: embedded 256px glyph bytes ${svg256.length} (svg ${Math.round(svg.length / 1024)}KB)`);

// Sanity: the SVG must embed exactly the rendered bytes.
if (!svg.includes(svg256.toString('base64'))) {
  console.error('FAIL favicon.svg does not embed the rendered glyph bytes');
  process.exit(1);
}
