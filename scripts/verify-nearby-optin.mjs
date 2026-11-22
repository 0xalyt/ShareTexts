import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './lib.mjs';

const base = process.env.BASE_URL || 'http://localhost:3311';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Nearby regression must use a local app');
const deadlineKey = 'sharetext.presenceVisibleUntil.v1';
const browser = await launchBrowser();
const errors = [];
const sent = [[], []];
const received = [[], []];
const contexts = [];
const pages = [];
async function until(check, message, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await delay(100); }
  assert.fail(message);
}
const count = (index, event) => sent[index].filter(e => e === event).length;
try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    contexts.push(context);
    await context.route(/workers\.dev/, route => route.abort());
    await context.routeWebSocket(/workers\.dev/, route => route.close());
    await context.addInitScript(({ index }) => {
      if (location.protocol !== 'http:') return;
      localStorage.setItem('sharetext.deviceName', `Optin ${index === 0 ? 'A' : 'B'}`);
    }, { index, deadlineKey });
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', ws => {
      assert(['localhost', '127.0.0.1'].includes(new URL(ws.url()).hostname), `unexpected socket ${ws.url()}`);
      ws.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return;
        try {
          const message = JSON.parse(payload.replace(/^42\d*/, ''));
          sent[index].push(Array.isArray(message) ? message[0] : message.event);
        } catch { /* transport heartbeat */ }
      });
      ws.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;
        try {
          const message = JSON.parse(payload.replace(/^42\d*/, ''));
          if (Array.isArray(message) ? message[0] === 'presence_list' : message.event === 'presence_list' || message.type === 'ack') received[index].push(Array.isArray(message) ? message[0] : message.event || message.type);
        } catch { /* transport heartbeat */ }
      });
    });
    await page.goto(base);
    await page.getByTestId('home-nearby').click();
    await page.getByTestId('nearby-visibility-toggle').waitFor({ state: 'visible' });
  }
  const [a, b] = pages;
  assert.equal(count(0, 'presence_announce'), 0, 'fresh A starts hidden');
  assert.equal(count(1, 'presence_announce'), 0, 'fresh B starts hidden');
  assert.equal(await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).count(), 0);
  assert.equal(await b.evaluate(key => sessionStorage.getItem(key), deadlineKey), null);
  await a.getByTestId('nearby-visibility-toggle').click();
  await b.getByTestId('nearby-visibility-toggle').click();
  await until(() => count(0, 'presence_announce') === 1, 'A opting in must announce');
  const deadline = await b.evaluate(key => Number(sessionStorage.getItem(key)), deadlineKey);
  assert(Math.abs(deadline - Date.now() - 600_000) < 5000, 'opt-in keeps the ten-minute absolute deadline');
  await until(() => count(1, 'presence_announce') === 1, 'B opting in must send presence_announce without reload');
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).waitFor({ state: 'visible', timeout: 10_000 });
  await b.getByTestId('nearby-device-row').filter({ hasText: 'Optin A' }).waitFor({ state: 'visible', timeout: 10_000 });
  console.log('PASS Nearby opt-in: B announces immediately and appears on A without reload');
  console.log('PASS Nearby ordering: both start hidden, A opts in before B, both list each other');
  await a.getByTestId('nearby-visibility-toggle').waitFor({ state: 'visible', timeout: 2000 });
  await b.getByTestId('nearby-visibility-toggle').waitFor({ state: 'visible', timeout: 2000 });
  console.log('PASS Nearby controls: both visibility switches remain available with a discovered peer');
  await delay(2200);
  assert.equal(count(1, 'presence_announce'), 1, 'countdown re-renders must not announce again');
  await b.reload();
  await b.getByTestId('home-nearby').click();
  await until(() => count(1, 'presence_announce') === 2, 'reload must announce exactly once');
  await delay(1500);
  assert.equal(count(1, 'presence_announce'), 2, 'reload must not double-announce');
  assert.equal(await b.evaluate(key => Number(sessionStorage.getItem(key)), deadlineKey), deadline, 'reload must not extend the deadline');
  console.log('PASS Nearby reload and re-render: one announce per load, deadline unchanged, no countdown spam');
  await b.getByTestId('nearby-visibility-toggle').waitFor({ state: 'visible', timeout: 10_000 });
  const withdrawals = count(1, 'presence_withdraw');
  await b.getByTestId('nearby-visibility-toggle').click();
  await until(() => count(1, 'presence_withdraw') > withdrawals, 'opting out must withdraw');
  assert.equal(await b.evaluate(key => sessionStorage.getItem(key), deadlineKey), null);
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).waitFor({ state: 'hidden', timeout: 10_000 });
  assert.equal(await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).count(), 0);
  console.log('PASS Nearby opt-out: immediate withdrawal and deadline removed');
  await b.getByTestId('nearby-visibility-toggle').click();
  await until(() => count(1, 'presence_announce') === 3, 'opting back in must announce');
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).waitFor({ state: 'visible', timeout: 10_000 });
  console.log('PASS Nearby re-opt-in: same open socket announces again and B reappears on A');
  const beforeExpiry = count(1, 'presence_withdraw');
  const renewedDeadline = await b.evaluate(key => Number(sessionStorage.getItem(key)), deadlineKey);
  await b.clock.setFixedTime(renewedDeadline + 1000);
  await until(() => count(1, 'presence_withdraw') > beforeExpiry, 'expired deadline must withdraw');
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).waitFor({ state: 'hidden', timeout: 10_000 });
  assert.equal(await b.evaluate(key => sessionStorage.getItem(key), deadlineKey), null);
  await delay(1500);
  assert.equal(count(1, 'presence_announce'), 3, 'expiry must not announce again');
  assert.deepEqual(errors, []);
  console.log('PASS Nearby expiry: elapsed deadline withdraws and stays hidden; no page errors');
  await b.clock.setFixedTime(Date.now());
  await b.getByTestId('nearby-visibility-toggle').click();
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).waitFor({ state: 'visible', timeout: 10_000 });
  await b.keyboard.press('Escape');
  await a.getByTestId('nearby-device-row').filter({ hasText: 'Optin B' }).click();
  await b.getByTestId('nearby-detect-primary').click();
  for (const page of [a, b]) {
    await page.getByTestId('nearby-sheet').waitFor({ state: 'hidden', timeout: 10_000 });
    assert.equal(await page.locator('#main-content').evaluate(el => el.closest('[inert]') === null), true, 'pairing must release the discovery sheet input lock');
  }
  console.log('PASS Nearby accepted handoff: both discovery sheets close and release input before the room takes over');
} finally {
  console.log(`Nearby sent events: ${JSON.stringify(sent)}`);
  console.log(`Nearby received: ${JSON.stringify(received)}`);
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
