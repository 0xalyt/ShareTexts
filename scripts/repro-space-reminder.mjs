import assert from 'node:assert/strict';
import { launchBrowser, URL } from './lib.mjs';

const browser = await launchBrowser();
try {
  for (const mode of ['stalled', 'rejected', 'unsupported']) {
    const context = await browser.newContext();
    await context.addInitScript(mode => {
      Object.defineProperty(Notification, 'permission', { get: () => mode === 'unsupported' ? 'denied' : 'default' });
      Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => new Promise(() => {}) });
      navigator.serviceWorker.register = async () => {
        if (mode === 'rejected') throw new Error('controlled registration failure');
        return {};
      };
    }, mode);
    const page = await context.newPage();
    await page.goto(`${URL}/space/create`);
    let createdAt;
    page.on('response', response => {
      if (response.request().method() === 'POST' && response.ok()) createdAt ??= Date.now();
    });
    const start = Date.now();
    await page.getByTestId('space-create-cta').click();
    await page.waitForURL(url => /^\/space\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 11000 }).catch(() => {});
    const elapsed = Date.now() - (createdAt ?? start);
    const navigated = /^\/space\/[0-9a-f-]{36}$/.test(new globalThis.URL(page.url()).pathname);
    console.log(`${mode}: navigation=${navigated}, elapsed=${elapsed}ms${navigated ? '' : ', CTA=' + await page.getByTestId('space-create-cta').innerText()}`);
    assert.ok(navigated && elapsed < 2000, 'successful creation must navigate within 2 seconds');
    await context.close();
  }
} finally {
  await browser.close();
}
