import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const a = await browser.newContext({ serviceWorkers: 'block' });
  const b = await browser.newContext({ serviceWorkers: 'block' });
  const A = await a.newPage();
  const B = await b.newPage();
  let recoveries = 0;
  A.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload === 'string' && frame.payload.includes('"peer_recovered"')) recoveries++;
  }));
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  const connected = page => page.waitForFunction(() => window.__sharetextDebug.peerManager()?.getPeerConnection()?.connectionState === 'connected', null, { timeout: 20000 });
  await Promise.all([connected(A), connected(B)]);
  await A.evaluate(async () => {
    const { getSocket } = await import('/src/lib/socket.ts');
    window.allowReconnectOffer = false;
    getSocket().on('peer_recovered', () => { window.allowReconnectOffer = true; });
    const offer = RTCPeerConnection.prototype.createOffer;
    RTCPeerConnection.prototype.createOffer = function (...args) {
      if (!window.allowReconnectOffer) return new Promise(() => {});
      return offer.apply(this, args);
    };
  });
  for (const page of [A, B]) await page.evaluate(() => window.__sharetextDebug.peerManager().getPeerConnection().close());
  await B.evaluate(() => window.__sharetextDebug.requestReconnect());
  await Promise.all([connected(A), connected(B)]);
  assert.equal(recoveries, 1, 'explicit reconnect must trigger exactly one peer recovery');
  for (const [sender, receiver, text] of [[A, B, 'reconnected A to B'], [B, A, 'reconnected B to A']]) {
    await sender.locator('textarea').first().fill(text);
    await sender.getByRole('button', { name: 'Send', exact: true }).click();
    await receiver.getByText(text, { exact: true }).waitFor();
  }
  console.log('PASS: explicit reconnect restores direct WebRTC with live signaling; one recovery; text both ways');
} finally {
  await browser.close();
}
