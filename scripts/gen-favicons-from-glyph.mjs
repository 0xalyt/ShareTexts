// gen-favicons-from-glyph — browser-tab favicon set from the OFFICIAL
// ShareTexts glyph (public/brand/logo-glyph-orange.png, extracted from the
// user's supplied artwork by gen-logo-glyphs.mjs).
//
// CONTRACT: orange glyph on a TRANSPARENT field (user-approved choice —
// reads on light and dark tab bars alike). No recoloring, no redraw: the
// glyph PNG is only resampled down through progressive halving steps, and
// favicon.svg embeds the exact glyph bytes as a data URI (SVG favicons
// cannot reference external resources).
// The PWA / home-screen icon set is a SEPARATE pipeline
// (scripts/gen-icons-from-artwork.mjs from brand-logo-source.jpg).
//
// Run: node scripts/gen-favicons-from-glyph.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const glyphPath = path.join(pub, 'brand', 'logo-glyph-orange.png');
const glyphBytes = fs.readFileSync(glyphPath);
const dataUri = 'data:image/png;base64,' + glyphBytes.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

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
  }, { src: dataUri, size });

  if (out.error) {
    console.error(`FAIL favicon-${size}: ${out.error}`);
    await browser.close();
    process.exit(1);
  }
  fs.writeFileSync(path.join(pub, `favicon-${size}.png`), Buffer.from(out.dataUrl.split(',')[1], 'base64'));
  console.log(`favicon-${size}.png: ${size}x${size} transparent, ember px ${out.ember}, ink ratio ${out.ratio}`);
}

await browser.close();

// ── favicon.svg: self-contained wrapper around the exact glyph bytes
//    (SVG favicons may not reference external resources).
const svg =
  `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">\n` +
  `  <!-- Official ShareTexts mark — the exact glyph PNG embedded as-is\n` +
  `       (public/brand/logo-glyph-orange.png via gen-logo-glyphs.mjs).\n` +
  `       Must match src/components/ShareTextsLogo.tsx. -->\n` +
  `  <image href="data:image/png;base64,${glyphBytes.toString('base64')}" x="0" y="0" width="256" height="256"/>\n` +
  `</svg>\n`;
fs.writeFileSync(path.join(pub, 'favicon.svg'), svg);
console.log(`favicon.svg: embedded glyph bytes ${glyphBytes.length} (svg ${Math.round(svg.length / 1024)}KB)`);

// Sanity: the SVG must embed exactly the shipped glyph file.
if (!svg.includes(glyphBytes.toString('base64'))) {
  console.error('FAIL favicon.svg does not embed the exact glyph bytes');
  process.exit(1);
}
