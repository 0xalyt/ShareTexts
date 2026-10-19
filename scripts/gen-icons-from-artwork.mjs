// gen-icons-from-artwork — PWA / home-screen icon set from the user's
// supplied glyph artwork (public/brand/app-icon-glyph.png, 1800x1800 RGBA,
// orange mark on a TRANSPARENT field). The user's instruction: the icon IS
// this image, as-is — no recoloring, no redraw, no recomposition.
//
// CONTRACT:
//   - purpose "any" (icon-192/512): the glyph PNG resampled straight down
//     through progressive halving, transparency preserved. The artwork's
//     own padding (ink ~43% of the canvas) is part of the art and stays.
//   - maskable + apple-touch-icon: SAME glyph geometry on an OPAQUE cream
//     field (#f7f4ee — the manifest's own background_color). These two
//     surfaces composite transparency onto BLACK (iOS home screen; several
//     Android launchers), which would ship a visibly broken icon; the cream
//     plate is the platform requirement, not a design change. The glyph's
//     max ink radius is ~43% of the half-canvas, inside the maskable safe
//     zone (80% diameter circle).
// Favicons are a SEPARATE pipeline (scripts/gen-favicons-from-glyph.mjs).
// Run: node scripts/gen-icons-from-artwork.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
// Inline as a data URI — headless Chromium will not fetch file:// subresources.
const dataUri = 'data:image/png;base64,' + fs.readFileSync(path.join(pub, 'brand', 'app-icon-glyph.png')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

// Render at `size`: progressive halving from the 1800px source (each step
// ≤2× cannot alias the arcs), then one exact fit. `plate` = opaque field
// painted under the glyph ('' keeps the transparent field as-is).
async function render(size, plate) {
  return page.evaluate(async ({ src, size, plate }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    let cur = document.createElement('canvas');
    cur.width = img.naturalWidth;
    cur.height = img.naturalHeight;
    cur.getContext('2d').drawImage(img, 0, 0);
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
    if (plate) {
      fx.fillStyle = plate;
      fx.fillRect(0, 0, size, size);
    }
    fx.drawImage(cur, 0, 0, size, size);

    // Verify delivered pixels: ember glyph present, ink bbox at the source
    // geometry (~0.43 of the canvas — alpha ≥ 64 so anti-aliased fringes at
    // small sizes don't shrink the measurement), corners matching the plate
    // contract (transparent = alpha 0, cream = opaque light).
    const d = fx.getImageData(0, 0, size, size).data;
    const at = (x, y) => (y * size + x) * 4;
    // With a plate, the plate itself is opaque and visible — ink is the
    // glyph: pixels that differ from the plate color. Without a plate the
    // transparent field handles it (alpha ≥ 64).
    const isPlate = (i) =>
      Math.abs(d[i] - 247) < 10 && Math.abs(d[i + 1] - 244) < 10 && Math.abs(d[i + 2] - 238) < 10;
    let ember = 0, minX = size, maxX = -1, minY = size, maxY = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = at(x, y);
        const visible = plate ? (d[i + 3] >= 64 && !isPlate(i)) : d[i + 3] >= 64;
        if (visible) {
          if (d[i] > 150 && d[i] > d[i + 2] + 60 && d[i + 1] > d[i + 2] && d[i + 1] < d[i]) ember++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const ratio = maxY >= 0 ? (maxY - minY + 1) / size : 0;
    const corner = at(2, 2);
    const errs = [];
    if (ember < 20) errs.push(`ember pixels ${ember}`);
    if (Math.abs(ratio - 0.43) > 0.05) errs.push(`ink ratio ${ratio.toFixed(2)} (want ~0.43 as-is)`);
    if (plate) {
      if (!(d[corner + 3] === 255 && d[corner] > 240 && d[corner + 1] > 235 && d[corner + 2] > 225)) {
        errs.push(`corner not opaque cream (${d[corner]},${d[corner + 1]},${d[corner + 2]},a${d[corner + 3]})`);
      }
      // Maskable safe zone: central circle at 80% diameter.
      const safe = size * 0.1;
      if (minX < safe || minY < safe || maxX > size - safe || maxY > size - safe) {
        errs.push(`ink escapes the maskable safe zone (bbox ${minX},${minY}-${maxX},${maxY})`);
      }
    } else if (d[corner + 3] !== 0) {
      errs.push(`corner not transparent (a=${d[corner + 3]})`);
    }
    if (errs.length) return { error: errs.join('; ') };
    return { dataUrl: fin.toDataURL('image/png'), ember, ratio: Number(ratio.toFixed(3)) };
  }, { src: dataUri, size, plate });
}

const CREAM = '#f7f4ee'; // manifest background_color
const targets = [
  ['icon-512.png', 512, ''],
  ['icon-192.png', 192, ''],
  ['icon-maskable-512.png', 512, CREAM],
  ['icon-maskable-192.png', 192, CREAM],
  ['apple-touch-icon.png', 180, CREAM],
];

for (const [out, size, plate] of targets) {
  const r = await render(size, plate);
  if (r.error) {
    console.error(`FAIL ${out}: ${r.error}`);
    await browser.close();
    process.exit(1);
  }
  fs.writeFileSync(path.join(pub, out), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
  console.log(`${out}: ${size}x${size} ${plate ? 'cream plate' : 'transparent'}, ember px ${r.ember}, ink ratio ${r.ratio}`);
}

await browser.close();
