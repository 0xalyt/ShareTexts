import assert from 'node:assert/strict';
import { launchBrowser, URL } from './lib.mjs';

const browser = await launchBrowser();
const modes = (process.env.MODES || 'stalled,stalled-signup,rejected,unsupported,quick-success,native,off').split(',');

function configureReminder(mode) {
  if (mode === 'native' || mode === 'off') return;
  Object.defineProperty(Notification, 'permission', { get: () => mode === 'unsupported' ? 'denied' : 'default' });
  Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => mode === 'quick-success' || mode === 'stalled-signup' ? Promise.resolve({}) : new Promise(() => {}) });
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
}

async function waitForSpace(page, timeout = 120000) {
  await page.getByTestId('space-members').waitFor({ timeout });
  await page.getByTestId('space-empty').waitFor();
  await page.getByTestId('space-composer').waitFor();
  assert.equal(await page.getByTestId('space-loading').count(), 0, 'the snapshot, not just the route shell, must render');
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the rendered page must remain SW-controlled');
}

try {
  for (const mode of modes) {
    const context = await browser.newContext();
    if (process.env.SPACE_API_PROXY) {
      console.log(`${mode}: production space REST proxy=${process.env.SPACE_API_PROXY} (not deployed Worker coverage)`);
      await context.route('https://sharetext-signaling.alighttt.workers.dev/space/**', async route => {
        const request = route.request();
        const source = new globalThis.URL(request.url());
        const response = await fetch(`${process.env.SPACE_API_PROXY}${source.pathname}${source.search}`, {
          method: request.method(),
          headers: { 'content-type': 'application/json', authorization: request.headers().authorization || '' },
          body: request.postDataBuffer() || undefined,
        });
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
      console.log(`${mode}: pageError=${error.message}`);
    });
    page.on('requestfailed', request => {
      if (/\/space\/[^/]+\/(create|join)$/.test(new globalThis.URL(request.url()).pathname)) {
        console.log(`${mode}: space API failed ${request.failure()?.errorText}`);
      }
    });
    page.on('console', message => {
      if (/vite.*(failed|error)|does not provide an export|Failed to fetch dynamically imported module/i.test(message.text())) {
        console.log(`${mode}: diagnostic=${message.text()}`);
      }
    });
    page.on('response', response => {
      if (!response.ok() && /\/space\/[^/]+\/(create|join)$/.test(new globalThis.URL(response.url()).pathname)) {
        console.log(`${mode}: space API ${response.request().method()} ${new globalThis.URL(response.url()).origin} status=${response.status()}`);
      }
    });
    await page.goto(`${URL}/space/create`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // Boot once through the actual worker before mocking only reminder APIs.
    await page.reload();
    console.log(`${mode}: controller=${await page.evaluate(() => new globalThis.URL(navigator.serviceWorker.controller.scriptURL).pathname)}`);
    await context.addInitScript(configureReminder, mode);
    await page.reload();
    let signupRequested = false;
    await page.route('**/space/*/subscribe', async route => {
      signupRequested = true;
      if (mode === 'stalled-signup') return;
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    if (mode === 'off') {
      await page.getByTestId('space-create-optional').evaluate(el => { el.open = true; });
      await page.locator('input[type="checkbox"]').uncheck();
    }
    await page.getByTestId('space-create-cta').waitFor();
    const reminderChecked = await page.locator('input[type="checkbox"]').isChecked();
    if (mode === 'native') {
      console.log(`native: permission=${await page.evaluate(() => Notification.permission)}, reminderChecked=${reminderChecked}`);
    } else {
      assert.equal(reminderChecked, mode !== 'off' && mode !== 'unsupported');
    }
    let createdAt;
    page.on('response', response => {
      if (response.request().method() === 'POST' && response.ok() && response.url().endsWith('/create')) createdAt ??= Date.now();
    });
    const start = Date.now();
    await page.getByTestId('space-create-cta').click();
    await page.waitForURL(url => /^\/space\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 11000 }).catch(() => {});
    const elapsed = Date.now() - (createdAt ?? start);
    const navigated = /^\/space\/[0-9a-f-]{36}$/.test(new globalThis.URL(page.url()).pathname);
    console.log(`${mode}: navigation=${navigated}, elapsed=${elapsed}ms${navigated ? '' : ', CTA=' + await page.getByTestId('space-create-cta').innerText()}`);
    assert.ok(navigated && elapsed < 3000, 'successful creation must navigate within 3 seconds');
    await waitForSpace(page);
    const rendered = Date.now() - (createdAt ?? start);
    const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
    console.log(`${mode}: rendered=${rendered}ms, afterNavigation=${rendered - elapsed}ms, FCP=${paint}ms, skeleton=false`);
    assert.ok(rendered - elapsed < 10000, 'space content must render within 10 seconds of navigation');
    if (mode === 'stalled-signup') {
      assert.ok(signupRequested, 'the pending signup must actually start before navigation');
      console.log('stalled-signup: PASS pending subscription request does not block space rendering');
    }
    if (mode === 'quick-success') {
      const completed = await page.evaluate(() => sessionStorage.getItem('reminderSignupCompleted') === 'yes');
      console.log(`quick-success: signupRequested=${signupRequested}, completedBeforeNavigation=${completed}`);
      assert.ok(signupRequested && completed, 'quick reminder signup must complete before navigation');
    }
    if (process.env.CACHE_PROBE === '1') {
      const poisoned = await page.evaluate(async () => {
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const key of await cache.keys()) {
            if (new globalThis.URL(key.url).pathname !== '/src/lib/transferStore.ts') continue;
            const response = await cache.match(key);
            const source = await response.text();
            if (!source.includes('export async function deleteReceivedFile(')) continue;
            await cache.put(key, new Response(source.replace('export async function deleteReceivedFile(', 'async function deleteReceivedFile('), { headers: { 'content-type': 'application/javascript' } }));
            return { name, url: key.url };
          }
        }
        return null;
      });
      assert.ok(poisoned, 'probe needs a real cached dev module, not a production asset');
      await page.reload();
      await page.waitForFunction(() => !document.querySelector('[data-testid="space-members"]'));
      assert.ok(errors.some(error => error.includes('deleteReceivedFile')), 'stale module must reproduce the missing-export error');
      console.log(`${mode}: PASS controlled stale dev cache reproduces missing export deleteReceivedFile and prevents space render`);
      await page.evaluate(async ({ name, url }) => {
        await (await caches.open(name)).delete(url);
      }, poisoned);
      await page.reload();
      await waitForSpace(page, 15000);
      console.log(`${mode}: PASS evicting only the stale module restores content with the SW still controlling; no route or backend change`);
      await context.close();
      continue;
    }
    await page.reload();
    await waitForSpace(page);
    console.log(`${mode}: PASS actual space content and reload, pageErrors=${errors.length}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
