// Probe: is an inflated documentElement.scrollWidth actually pannable?
// body has `overflow-x: clip`, so a large scrollWidth may never be reachable.
// Truth test = can window.scrollX move? Reports per path at 100% and 200% text.
import { launchBrowser } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3390';
const PATHS = ['/docs', '/about', '/'];

const browser = await launchBrowser();
const rows = [];
for (const path of PATHS) {
  for (const zoom of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (zoom !== 1) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
      await page.waitForTimeout(250);
    }
    const r = await page.evaluate(async () => {
      const de = document.documentElement;
      window.scrollTo(600, 0);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const pannedTo = window.scrollX;
      window.scrollTo(0, 0);
      return {
        scrollW: de.scrollWidth,
        clientW: de.clientWidth,
        pannedTo,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
      };
    });
    rows.push({ path, zoom, ...r });
    await ctx.close();
  }
}
await browser.close();

for (const r of rows) {
  const slack = r.scrollW - r.clientW;
  const verdict = r.pannedTo > 0 ? 'PANS' : 'no pan (clipped)';
  console.log(
    `${r.path} text=${r.zoom * 100}% scrollW=${r.scrollW} clientW=${r.clientW} slack=${slack} ` +
    `pannedTo=${r.pannedTo} body-overflow-x=${r.bodyOverflowX} -> ${verdict}`
  );
}
