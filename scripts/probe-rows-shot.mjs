// One-off: two pages detect each other, dismiss the overlay, shoot the
// landing Nearby rows (browser sub-line) + the searching state.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:3010';
const b = await chromium.launch();

const mk = async (opts) => {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return p;
};

// Rows: two desktop pages, auto-connect OFF so no overlay interrupts.
const A = await mk({ viewport: { width: 1280, height: 900 } });
await A.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '0'));
const B = await mk({ viewport: { width: 1280, height: 900 } });
await B.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '0'));

// Wait for a device row to appear on A.
const row = A.locator('[aria-label^="Connect to"]').first();
const found = await row.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
console.log('A sees a device row:', found);
if (found) {
  await A.waitForTimeout(500);
  // Crop the nearby section: scroll it into view first.
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await A.screenshot({ path: '.audit-shots/rows-desktop.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
}

// Dark + mobile rows.
await A.evaluate(() => document.documentElement.classList.add('dark'));
await A.waitForTimeout(400);
await A.screenshot({ path: '.audit-shots/rows-dark.png' });

const C = await mk({ viewport: { width: 390, height: 844 } });
const D = await mk({ viewport: { width: 390, height: 844 } });
const crow = C.locator('[aria-label^="Connect to"]').first();
const cFound = await crow.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
console.log('C sees a device row:', cFound);
if (cFound) {
  await C.waitForTimeout(500);
  await crow.scrollIntoViewIfNeeded().catch(() => {});
  await C.screenshot({ path: '.audit-shots/rows-mobile.png' });
}

console.log('done');
await b.close();
