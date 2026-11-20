import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const { generateTOTP } = await tsImport('../src/lib/totp.ts', import.meta.url);
const browser = await launchBrowser();
try {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ serviceWorkers: 'block' })));
  for (const context of contexts) context.setDefaultTimeout(20000);
  for (const context of contexts) await context.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...args) => {
      if (ms === 90000) window.reseatHeartbeat = () => fn(...args);
      return interval(fn, ms, ...args);
    };
    window.offers = 0;
    const offer = RTCPeerConnection.prototype.createOffer;
    RTCPeerConnection.prototype.createOffer = function (...args) {
      window.offers++;
      return offer.apply(this, args);
    };
  });
  const [A, B, C] = await Promise.all(contexts.map(context => context.newPage()));
  let recoveries = 0;
  for (const page of [A, B, C]) page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      if (typeof frame.payload === 'string' && frame.payload.includes('"peer_recovered"')) recoveries++;
    });
  });
  const reseat = (page, visibility = false) => page.evaluate(async visibility => {
    const { getSocket } = await import('/src/lib/socket.ts');
    const socket = getSocket();
    const emit = socket.emit;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('heartbeat did not resume')), 10000);
      socket.emit = function (event, payload, ack) {
        if (event !== 'resume_room') return emit.call(this, event, payload, ack);
        socket.emit = emit;
        return emit.call(this, event, payload, response => { clearTimeout(timer); ack?.(response); resolve({ response, reconnect: payload.reconnect === true }); });
      };
      if (visibility) document.dispatchEvent(new Event('visibilitychange'));
      else window.reseatHeartbeat();
    });
  }, visibility);
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  await A.waitForFunction(() => window.__sharetextDebug.session().roomId);
  const solo = await reseat(A, true);
  assert.equal(solo.response.success, true);
  assert.equal(solo.reconnect, false);
  assert.equal(await A.evaluate(() => window.offers), 0);
  console.log('PASS: returning to a room with no other device does not request a link');
  const join = async (page, code) => {
    await page.goto(URL);
    await page.getByTestId('home-receive').click();
    await page.getByTestId('join-code-input').locator('input').first().fill(code);
  };
  await join(B, await readLiveCode(A));
  for (const page of [A, B]) await page.waitForFunction(() => window.__sharetextDebug.peerManager()?.getDataChannel()?.readyState === 'open');
  const { secret, createdAt } = await A.evaluate(() => window.__sharetextDebug.session());
  await join(C, generateTOTP(secret, createdAt));
  for (const page of [A, B, C]) await page.waitForFunction(async () => (await import('/src/lib/roomRoster.ts')).roomRoster.size === 3);
  await C.waitForFunction(() => window.__sharetextDebug.pcmLinks().length === 2);
  assert.equal(await C.evaluate(() => window.__sharetextDebug.peerManager()), null, 'multi-device join intentionally has no classic link');
  const before = await Promise.all([A, B, C].map(page => page.evaluate(() => window.offers)));
  const initialRecoveries = recoveries;
  for (const visibility of [false, true]) {
    const result = await reseat(C, visibility);
    assert.equal(result.response.success, true);
    assert.equal(result.reconnect, false, 'a parked multi-device room must only refresh its seat');
  }
  await C.waitForTimeout(300);
  assert.equal(recoveries, initialRecoveries);
  assert.deepEqual(await Promise.all([A, B, C].map(page => page.evaluate(() => window.offers))), before);
  assert.equal(await C.evaluate(() => window.__sharetextDebug.peerManager()), null);
  console.log('PASS: three-device heartbeat and visibility without a classic link refresh the seat; no recovery, offers or classic manager');
} finally {
  await browser.close();
}
