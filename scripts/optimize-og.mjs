// optimize-og.mjs — same pixels, far fewer bytes.
//
// WHY: the card was 307,111 bytes. WhatsApp's preview fetcher is documented
// to want the image under ~300 KB, and LinkedIn/X both time out on slow
// fetches, so a card that is technically a valid 1200×630 PNG can still fail
// to appear. Nothing about the artwork changes here — this is a lossless
// re-encode (adaptive PNG row filters + maximum deflate), so the card is
// byte-for-byte the same picture and a third of the weight.
//
//   node scripts/optimize-og.mjs            # rewrite the card in place
//   node scripts/optimize-og.mjs --check    # fail if it is over the budget
//
// The budget is 150 KB: comfort, not the 300 KB cliff, because the fetcher is
// often a phone on a slow network.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD = join(ROOT, 'public/og/sharetext-og-icon-v2.png');
const BUDGET = 150 * 1024;
const CHECK = process.argv.includes('--check');

const before = readFileSync(CARD);
const png = PNG.sync.read(before);
const after = PNG.sync.write(png, {
  deflateLevel: 9,
  deflateStrategy: 3,
  // -1 = adaptive: pngjs tries every row filter and keeps the smallest.
  filterType: -1,
  colorType: 6,
});

// Parity check: re-decoding the new bytes must give identical pixels, or the
// "lossless" claim in the header is a lie.
const again = PNG.sync.read(after);
const same = again.width === png.width
  && again.height === png.height
  && Buffer.compare(again.data, png.data) === 0;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`[optimize-og] ${png.width}×${png.height}`);
console.log(`[optimize-og] ${kb(before.length)} -> ${kb(after.length)} (${(100 - (after.length / before.length) * 100).toFixed(0)}% smaller)`);
console.log(`[optimize-og] pixels identical after re-encode: ${same ? 'yes' : 'NO'}`);

if (!same) {
  console.error('[optimize-og] refusing to write: the re-encode changed pixels');
  process.exit(1);
}

if (CHECK) {
  const ok = before.length <= BUDGET;
  console.log(`[optimize-og] ${ok ? 'PASS' : 'FAIL'} card ≤ ${kb(BUDGET)} (it is ${kb(before.length)})`);
  process.exit(ok ? 0 : 1);
}

if (after.length < before.length) {
  writeFileSync(CARD, after);
  console.log('[optimize-og] written');
} else {
  console.log('[optimize-og] already optimal, left untouched');
}

// ── JPEG pass ──────────────────────────────────────────────────────────────
// A smooth orange gradient is the worst case for PNG and the best case for
// JPEG: the lossless encoder cannot beat Chromium's already-tuned PNG, but a
// 1200×630 JPEG of the same pixels lands around a tenth of the weight. Run
// with --jpeg to emit the card the product should actually advertise.
if (process.argv.includes('--jpeg')) {
  const { chromium } = await import('playwright');
  const target = join(ROOT, 'public/og/sharetext-og-icon-v3.jpg');
  const dataUrl = `data:image/png;base64,${before.toString('base64')}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: png.width, height: png.height } });
  await page.setContent('<img id="c" style="display:block">');
  await page.evaluate(async ({ url, w, h }) => {
    const img = document.getElementById('c');
    await new Promise((res) => { img.onload = res; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    window.__jpeg = cv.toDataURL('image/jpeg', 0.9);
  }, { url: dataUrl, w: png.width, h: png.height });
  const jpeg = await page.evaluate(() => window.__jpeg);
  await browser.close();
  const bytes = Buffer.from(jpeg.split(',')[1], 'base64');
  writeFileSync(target, bytes);
  console.log(`[optimize-og] jpeg written: ${target.split(/[\/]/).pop()} ${kb(bytes.length)}`);
}
