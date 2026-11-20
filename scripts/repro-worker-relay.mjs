import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const worker = process.env.WORKER_URL || 'http://localhost:8787';
const canonical = 'https://sharetext-signaling.alighttt.workers.dev';
const sockets = new Set();
const errors = [];
let binaryFrames = 0;
let binarySent = 0;
const browser = await launchBrowser();
try {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const context of contexts) {
    // Production pins the canonical origin; proxy it locally without changing the client.
    await context.route(`${canonical}/**`, async route => {
      const source = new globalThis.URL(route.request().url());
      const request = route.request();
      const response = await fetch(`${worker}${source.pathname}${source.search}`, {
        method: request.method(),
        headers: { 'content-type': request.headers()['content-type'] || 'application/json', origin: new globalThis.URL(URL).origin },
        body: request.postDataBuffer() || undefined,
      });
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    await context.routeWebSocket(`${canonical.replace('https:', 'wss:')}/**`, route => {
      const source = new globalThis.URL(route.url());
      const upstream = new WebSocket(`${worker.replace(/^http/, 'ws')}${source.pathname}${source.search}`);
      upstream.binaryType = 'arraybuffer';
      sockets.add(upstream);
      const pending = [];
      route.onMessage(data => {
        if (typeof data !== 'string') binarySent++;
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
        else pending.push(data);
      });
      upstream.onopen = () => pending.splice(0).forEach(data => upstream.send(data));
      upstream.onmessage = ({ data }) => {
        if (typeof data !== 'string') binaryFrames++;
        route.send(typeof data === 'string' ? data : Buffer.from(data));
      };
      upstream.onerror = () => errors.push('local Worker WebSocket error');
      route.onClose(() => upstream.close());
    });
    await context.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      window.rejectedIceConstructors = 0;
      window.RTCPeerConnection = class extends Native {
        constructor() {
          window.rejectedIceConstructors++;
          throw new DOMException('Forced relay regression', 'NotSupportedError');
        }
      };
    });
  }
  const [A, B] = await Promise.all(contexts.map(context => context.newPage()));
  for (const [label, page] of [['A', A], ['B', B]]) {
    page.on('console', message => { if (message.type() === 'error') console.log(label, message.text()); });
    page.on('pageerror', error => console.log(label, error.message));
    page.on('response', response => { if (response.status() >= 400) console.log(label, 'HTTP', response.status(), response.url()); });
  }
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  for (const page of [A, B]) {
    await page.getByTestId('composer').first().waitFor({ timeout: 20000 }).catch(async error => {
      console.log('JOIN_STATE', await page.locator('body').innerText());
      throw error;
    });
  }
  const rejected = await Promise.all([A, B].map(page => page.evaluate(() => window.rejectedIceConstructors)));
  assert.ok(rejected.some(count => count > 0), 'WebRTC constructors must have been rejected');
  for (const [sender, receiver, text] of [[A, B, 'Worker relay A to B'], [B, A, 'Worker relay B to A']]) {
    await sender.locator('textarea').first().fill(text);
    await sender.getByRole('button', { name: 'Send', exact: true }).click();
    const row = receiver.locator('[class~="group/msg"]').filter({ has: receiver.getByText(text, { exact: true }) });
    await row.waitFor({ timeout: 15000 });
    assert.equal(await row.count(), 1);
    console.log(`PASS: forced relay ${text}`);
  }
  const name = 'local-worker-relay.bin';
  await A.locator('input[multiple]:not([accept])').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(32 * 1024, 7) });
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  const row = B.locator('[class~="group/msg"]').filter({ has: B.getByText(name, { exact: true }) });
  await row.waitFor({ timeout: 20000 });
  await row.scrollIntoViewIfNeeded();
  await row.getByText('Verified', { exact: true }).waitFor({ timeout: 20000 }).catch(async error => {
    console.log('FILE_STATE', await row.innerText(), 'binaryFrames', binaryFrames, 'binarySent', binarySent);
    console.log('SENDER_DIAG', await A.evaluate(() => window.__sharetextDiag?.snapshot()));
    console.log('DIAG', await B.evaluate(() => window.__sharetextDiag?.snapshot()));
    throw error;
  });
  assert.ok(binaryFrames > 0, 'file bytes must traverse the local Worker');
  assert.deepEqual(errors, []);
  console.log('PASS: forced relay 32768-byte file, receiver own row Verified; local Worker binary received');
} finally {
  await browser.close();
  for (const socket of sockets) socket.close();
}
