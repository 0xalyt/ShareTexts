import assert from 'node:assert/strict';
import { launchBrowser, URL } from './lib.mjs';

const browser = await launchBrowser();
try {
  for (const mode of ['stalled', 'rejected', 'unsupported', 'quick-success']) {
    const context = await browser.newContext();
    await context.addInitScript(mode => {
      Object.defineProperty(Notification, 'permission', { get: () => mode === 'unsupported' ? 'denied' : 'default' });
      Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => mode === 'quick-success' ? Promise.resolve({}) : new Promise(() => {}) });
      navigator.serviceWorker.register = async () => {
        if (mode === 'rejected') throw new Error('controlled registration failure');
        return { pushManager: { getSubscription: async () => ({ toJSON: () => ({ endpoint: 'https://push.example.test/reminder', keys: { p256dh: 'test-key', auth: 'test-auth' } }) }) } };
      };
      const fetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await fetch(...args);
        if (String(args[0]).endsWith('/subscribe') && response.ok) sessionStorage.setItem('reminderSignupCompleted', 'yes');
        return response;
      };
    }, mode);
    const page = await context.newPage();
    let signupRequested = false;
    await page.route('**/space/*/subscribe', async route => {
      signupRequested = true;
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
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
    assert.ok(navigated && elapsed < 3000, 'successful creation must navigate within 3 seconds');
    if (mode === 'quick-success') {
      const completed = await page.evaluate(() => sessionStorage.getItem('reminderSignupCompleted') === 'yes');
      console.log(`quick-success: signupRequested=${signupRequested}, completedBeforeNavigation=${completed}`);
      assert.ok(signupRequested && completed, 'quick reminder signup must complete before navigation');
    }
    await context.close();
  }
} finally {
  await browser.close();
}
