// gen-lockup-footer — render the display-size footer lockup from the
// OFFICIAL monoline lockup (public/brand/logo-lockup-monoline.png, the
// user's supplied artwork, byte-exact and never edited).
//
// The source is 2146x733 with transparency; the footer shows it at ~105px
// wide (≤315 physical at 3x DPR), so shipping 373KB to paint a footer
// signature is the exact first-byte cost the landing already refused once.
// This renders a 536px-wide delivery copy through progressive halving
// (2146 → 1073 → 536, each step ≤2x so the monoline strokes cannot alias)
// and verifies the delivered pixels: dimensions, aspect, transparent
// corners, ink bounding box ratio, and the ink color.
//
// Run: node scripts/gen-lockup-footer.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'public', 'brand');
const SRC = path.join(brand, 'logo-lockup-monoline.png');
const OUT = path.join(brand, 'logo-lockup-footer.png');
const TARGET_W = 536;

const dataUri = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

const r = await page.evaluate(async ({ src, targetW }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const aspect = img.naturalWidth / img.naturalHeight;
  const targetH = Math.round(targetW / aspect);

  // Progressive halving from natural width down to the step above target.
  let cur = document.createElement('canvas');
  cur.width = img.naturalWidth;
  cur.height = img.naturalHeight;
  cur.getContext('2d').drawImage(img, 0, 0);
  while (cur.width >= targetW * 2) {
    const halfW = Math.max(targetW, Math.round(cur.width / 2));
    const halfH = Math.round(halfW / aspect);
    const next = document.createElement('canvas');
    next.width = halfW;
    next.height = halfH;
    const nx = next.getContext('2d');
    nx.imageSmoothingEnabled = true;
    nx.imageSmoothingQuality = 'high';
    nx.drawImage(cur, 0, 0, halfW, halfH);
    cur = next;
  }
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ox = out.getContext('2d', { willReadFrequently: true });
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(cur, 0, 0, targetW, targetH);

  // ── Verify delivered pixels.
  const d = ox.getImageData(0, 0, targetW, targetH).data;
  const at = (x, y) => ((y * targetW + x) * 4);
  const errors = [];
  // Transparent corners (the lockup sits on the page canvas directly).
  const cornersClear = [[0, 0], [targetW - 1, 0], [0, targetW < targetH ? targetW - 1 : targetH - 1], [targetW - 1, targetH - 1]]
    .every(([x, y]) => d[at(x, y) + 3] < 64);
  if (!cornersClear) errors.push('corner not transparent');
  // Ink bbox (alpha ≥ 128) — ratios measured on the source: w 1744/2146,
  // h 364/733, ink color (22,22,22).
  let minX = targetW, minY = targetH, maxX = -1, maxY = -1;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const i = at(x, y);
      if (d[i + 3] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const wRatio = bw / targetW, hRatio = bh / targetH;
  if (Math.abs(wRatio - 1744 / 2146) > 0.01) errors.push(`ink w-ratio ${wRatio.toFixed(3)}`);
  if (Math.abs(hRatio - 364 / 733) > 0.01) errors.push(`ink h-ratio ${hRatio.toFixed(3)}`);
  const ink = n ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] : [0, 0, 0];
  if (n < 500) errors.push(`too few ink pixels (${n})`);
  if (Math.abs(ink[0] - 22) > 10 || Math.abs(ink[1] - 22) > 10 || Math.abs(ink[2] - 22) > 10) errors.push(`ink color ${ink}`);
  if (errors.length) return { error: errors.join('; ') };
  return { dataUrl: out.toDataURL('image/png'), targetW, targetH, ink, wRatio: +wRatio.toFixed(3), hRatio: +hRatio.toFixed(3) };
}, { src: dataUri, targetW: TARGET_W });

if (r.error) {
  console.error('FAIL logo-lockup-footer:', r.error);
  await browser.close();
  process.exit(1);
}
const bytes = Buffer.from(r.dataUrl.split(',')[1], 'base64');
fs.writeFileSync(OUT, bytes);
console.log(`logo-lockup-footer.png: ${r.targetW}x${r.targetH} ink w/h ${r.wRatio}/${r.hRatio} ink rgb(${r.ink}) ${Math.round(bytes.length / 1024)}KB`);

await browser.close();
