import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { launchBrowser, URL } from './lib.mjs';

export async function verifySpaceCreate(browser) {
  const context = await browser.newContext();
  try {
    await context.route(/https?:\/\/[^/]*\.workers\.dev\//, route => route.abort());
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-space').click();
    await page.getByTestId('space-sheet-create').click();
    // Leave the default reminder enabled: touching PushManager before
    // notification permission is granted can strand WebKit before navigation.
    const response = page.waitForResponse(r => /\/space\/[^/]+\/create$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByTestId('space-create-cta').click();
    assert.equal((await response).status(), 200);
    await page.waitForURL(/\/space\/[0-9a-f-]{36}(?:#|$)/, { timeout: 15000 });
    await page.getByTestId('space-composer').waitFor({ timeout: 15000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('space-composer').waitFor({ timeout: 15000 });
    console.log(`PASS ${browser.browserType().name()}: default Temporary Space creation navigates, renders and reloads`);
  } finally {
    await context.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await launchBrowser();
  try { await verifySpaceCreate(browser); }
  finally { await browser.close(); }
}
