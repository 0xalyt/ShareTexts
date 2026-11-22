import assert from 'node:assert/strict';
import { launchBrowser, URL, gotoPage, readLiveCode } from './lib.mjs';

assert.match(URL, /^http:\/\/(localhost|127\.0\.0\.1):\d+/);
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route(/workers\.dev/, route => route.abort());
  await context.routeWebSocket(/workers\.dev/, route => route.close());
  const page = await context.newPage();
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let requestId;
  let refreshed;
  let resolveRefresh;
  const acknowledgement = new Promise(resolve => { resolveRefresh = resolve; });
  page.on('websocket', socket => {
    assert.match(socket.url(), /^ws:\/\/(localhost|127\.0\.0\.1):\d+/);
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const frame = JSON.parse(payload);
      if (frame.event === 'refresh_code') requestId = frame.id;
    });
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const frame = JSON.parse(payload);
      if (requestId && frame.id === requestId) {
        refreshed = frame;
        resolveRefresh(frame);
      }
    });
  });
  await gotoPage(page, URL, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-send').click();
  await page.getByTestId('pairing-code').waitFor({ timeout: 45000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  assert.ok(before.secret && before.createdAt);
  await page.clock.pauseAt(new Date(before.createdAt + 89_000));
  await page.clock.runFor(850);
  await page.clock.resume();
  let timeout;
  try {
    await Promise.race([acknowledgement, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('refresh_code acknowledgement missing')), 10000); })]);
  } catch (error) {
    console.error('Refresh diagnostics', { requestSent: !!requestId, ackOk: refreshed?.ok, errors });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  assert.ok(requestId, 'expiry sends refresh_code through the lazy transport');
  assert.equal(refreshed?.ok, true);
  assert.ok(refreshed.createdAt > before.createdAt);
  await page.clock.setSystemTime(refreshed.createdAt + 30_000);
  await page.clock.pauseAt(new Date(refreshed.createdAt + 31_000));
  const progress = await page.getByTestId('code-lifecycle').locator('div').evaluate(element => parseFloat(element.style.width));
  assert.ok(Math.abs(progress - 65.55555556) < 0.01, 'countdown uses the Worker refresh anchor');
  await page.clock.setSystemTime(Date.now());
  await page.clock.runFor(300);
  await page.clock.resume();
  const code = await readLiveCode(page);
  const receiverContext = await browser.newContext({ serviceWorkers: 'block' });
  await receiverContext.route(/workers\.dev/, route => route.abort());
  await receiverContext.routeWebSocket(/workers\.dev/, route => route.close());
  const receiver = await receiverContext.newPage();
  await gotoPage(receiver, URL, { waitUntil: 'domcontentloaded' });
  await receiver.getByTestId('home-receive').click();
  await receiver.getByTestId('join-code-input').locator('input').first().fill(code);
  await receiver.getByTestId('composer').first().waitFor({ timeout: 25000 });
  assert.deepEqual(errors, []);
  console.log('PASS pairing-code refresh: UI expiry sends refresh_code, Worker acknowledges a newer anchor, countdown uses it, second browser joins with refreshed code; no page errors');
} finally {
  await browser.close();
}
