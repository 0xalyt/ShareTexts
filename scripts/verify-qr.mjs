/**
 * verify-qr.mjs — does the designed QR still scan?
 *
 * A pretty QR is worthless if a camera cannot read it, and a screenshot cannot
 * tell you that. This renders each QR surface in the real app, rasterises the
 * SVG the app actually paints, and decodes those pixels with jsQR — a
 * clean-room QR decoder with no relationship to the encoder we ship.
 *
 *   node scripts/verify-qr.mjs            (dev server on :3010)
 *   URL=http://localhost:3010 node scripts/verify-qr.mjs
 *
 * Exits 1 on any decode failure.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';

const BASE = process.env.URL || 'http://localhost:3010';
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

/** Rasterise the first [data-testid="qr-art"] and decode it. */
async function decodeQrArt(page, scale = 2) {
  const pixels = await page.evaluate(async (scale) => {
    const svg = document.querySelector('[data-testid="qr-art"]');
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const w = Number(svg.getAttribute('width')) || 220;
    const px = Math.round(w * scale);
    clone.setAttribute('width', String(px));
    clone.setAttribute('height', String(px));
    const markup = new XMLSerializer().serializeToString(clone);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, px, px);
    c.drawImage(img, 0, 0, px, px);
    const data = c.getImageData(0, 0, px, px);
    return { width: px, height: px, data: Array.from(data.data) };
  }, scale);
  if (!pixels) return null;
  const result = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
  return { text: result?.data ?? null, size: pixels.width };
}

const expectedHost = new URL(BASE).host;
const browser = await chromium.launch();

/** Send screen → QR tab. */
async function sendSurface(colorScheme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]');
  await page.getByTestId('home-send').click();
  await page.waitForSelector('[data-testid="send-screen"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'QR' }).click();
  await page.waitForSelector('[data-testid="qr-art"]', { timeout: 10000 });
  await page.waitForTimeout(400);

  for (const scale of [1, 2, 3]) {
    const got = await decodeQrArt(page, scale);
    const ok = !!got?.text && got.text.includes(expectedHost);
    check(
      `Send QR (${colorScheme}) decodes at ${Math.round((got?.size ?? 0) / scale)}px @${scale}x`,
      ok,
      got?.text ?? 'no decode',
    );
  }
  await ctx.close();
}

/** Room screen → "Show QR" overlay, the surface you hold up to a camera. */
async function roomSurface() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  // __stOpenSendQr is only published while the home panel is idle: it creates
  // the room and then opens the overlay, which is exactly the real path.
  await page.waitForFunction(() => typeof window.__stOpenSendQr === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.__stOpenSendQr());
  await page.waitForSelector('[data-testid="qr-art"]', { timeout: 25000 });
  await page.waitForTimeout(400);

  for (const scale of [1, 2]) {
    const got = await decodeQrArt(page, scale);
    const ok = !!got?.text && got.text.includes(expectedHost) && got.text.includes('/s/');
    check(`Room QR overlay decodes at ${Math.round((got?.size ?? 0) / scale)}px @${scale}x`, ok, got?.text ?? 'no decode');
  }
  await ctx.close();
}

await sendSurface('light');
await sendSurface('dark');
await roomSurface();

await browser.close();
console.log(`\n=== verify-qr: ${failures === 0 ? 'GREEN' : failures + ' FAILURE(S)'} ===`);
process.exit(failures ? 1 : 0);
