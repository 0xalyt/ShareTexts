import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser, URL, readLiveCode, showPairingCode, gotoPage } from './lib.mjs';
import { browserDiagnostics } from './browser-diagnostics.mjs';
import { tsImport } from 'tsx/esm/api';

const { generateTOTP } = await tsImport('../src/lib/totp.ts', import.meta.url);

const browser = await launchBrowser();
const diagnostics = browserDiagnostics(browser, 'relay-files');
const count = Number(process.env.DEVICES || 3);
const upstreamSockets = new Set();
assert.ok(count === 2 || count === 3);
const files = [1, 2, 3].map(number => ({ name: `relay-queue-${number}.bin`, mimeType: 'application/octet-stream', buffer: Buffer.alloc(600000 + number * 7919, number * 37) }));
try {
  const pages = [];
  const binaryReceived = Array(count).fill(0);
  let binarySent = 0;
  let maxBinaryBytes = 0;
  const observeBinary = payload => {
    if (typeof payload === 'string') return;
    binarySent++;
    maxBinaryBytes = Math.max(maxBinaryBytes, payload.byteLength);
  };
  for (let i = 0; i < count; i++) {
    const context = await diagnostics.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await context.route(/workers\.dev/, route => route.abort());
    await context.routeWebSocket(/workers\.dev/, route => route.close());
    if (process.env.WORKER_URL) {
      const worker = process.env.VITE_SIGNALING_URL || 'http://localhost:8787';
      await context.route(`${worker}/**`, async route => {
        const target = route.request().url().replace(worker, process.env.WORKER_URL);
        await route.fulfill({ response: await route.fetch({ url: target }) });
      });
      await context.routeWebSocket(`${worker.replace(/^http/, 'ws')}/**`, route => {
        const upstream = new WebSocket(route.url().replace(worker.replace(/^http/, 'ws'), process.env.WORKER_URL.replace(/^http/, 'ws')));
        upstream.binaryType = 'arraybuffer';
        upstreamSockets.add(upstream);
        const queued = [];
        route.onMessage(data => {
          if (i === 0) observeBinary(data);
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
          else queued.push(data);
        });
        upstream.onopen = () => queued.splice(0).forEach(data => upstream.send(data));
        upstream.onmessage = ({ data }) => route.send(typeof data === 'string' ? data : Buffer.from(data));
        upstream.onerror = () => route.close();
        upstream.onclose = () => route.close();
        route.onClose(() => upstream.close());
      });
    }
    await context.addInitScript(() => {
      window.RTCPeerConnection = class { constructor() { throw new DOMException('Forced relay regression', 'NotSupportedError'); } };
    });
    const page = await context.newPage();
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => { if (typeof payload !== 'string') binaryReceived[i]++; }));
    if (i === 0 && !process.env.WORKER_URL) page.on('websocket', socket => socket.on('framesent', ({ payload }) => observeBinary(payload)));
    pages.push(page);
    await gotoPage(page, i > 0 && process.env.RECEIVER_URL ? process.env.RECEIVER_URL : URL, { waitUntil: 'domcontentloaded' });
  }
  const [sender, ...receivers] = pages;
  await sender.getByTestId('home-send').click();
  await showPairingCode(sender);
  await sender.getByTestId('pairing-code').waitFor({ timeout: 45000 });
  const initialCode = await readLiveCode(sender);
  for (const receiver of receivers) {
    const stored = await sender.evaluate(() => localStorage.getItem('sharetext.session.v1'));
    const session = stored ? JSON.parse(stored) : null;
    const code = session?.secret ? generateTOTP(session.secret, session.createdAt) : initialCode;
    await receiver.getByTestId('home-receive').click();
    await receiver.getByTestId('join-code-input').locator('input').first().fill(code);
    await receiver.getByTestId('composer').first().waitFor({ timeout: 25000 });
  }
  await sender.getByTestId('composer').first().waitFor({ timeout: 25000 });
  // A text round-trip establishes that every new per-peer relay is installed.
  for (const [index, receiver] of receivers.entries()) {
    const text = `relay-ready-${index}`;
    await receiver.locator('textarea').first().fill(text);
    await receiver.getByRole('button', { name: 'Send', exact: true }).click();
    await sender.getByText(text, { exact: true }).waitFor({ timeout: 20000 });
  }
  await sender.locator('textarea').first().fill('relay-ready-sender');
  await sender.getByRole('button', { name: 'Send', exact: true }).click();
  for (const receiver of receivers) await receiver.getByText('relay-ready-sender', { exact: true }).waitFor({ timeout: 20000 });
  console.log('PASS forced-relay text in both directions');
  await sender.locator('input[multiple]:not([accept])').setInputFiles(files);
  await sender.getByText(files[2].name, { exact: true }).waitFor();
  await sender.getByRole('button', { name: 'Send', exact: true }).click();
  for (const [index, receiver] of receivers.entries()) {
    for (const file of files) {
      const row = receiver.locator('[class~="group/msg"]').filter({ has: receiver.getByText(file.name, { exact: true }) });
      await row.getByText('Verified', { exact: true }).waitFor({ timeout: 30000 });
      assert.equal(await row.count(), 1);
      const downloaded = receiver.waitForEvent('download');
      await row.getByTestId('transfer-download').click();
      const download = await downloaded;
      assert.equal(await download.failure(), null);
      assert.deepEqual(await readFile(await download.path()), file.buffer);
      console.log(`PASS ${String.fromCharCode(66 + index)} ${file.name}: Verified, bytes match (${file.buffer.length})`);
    }
  }
  if (count === 3 && !process.env.WORKER_URL) {
    const selectedId = await receivers[0].evaluate(() => Object.values(JSON.parse(localStorage.getItem('sharetext.deviceId') || '{}'))[0]);
    assert.equal(typeof selectedId, 'string');
    await sender.getByTestId('recipient-row').getByRole('button').first().click();
    await sender.locator(`[data-participant-id="${selectedId}"]`).click();
    await sender.getByRole('button', { name: 'Close', exact: true }).click();
    const excludedBefore = binaryReceived[2];
    const selectedFile = { name: 'relay-selected-only.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(607919, 91) };
    await sender.locator('input[multiple]:not([accept])').setInputFiles([selectedFile]);
    await sender.getByText(selectedFile.name, { exact: true }).waitFor();
    await sender.getByRole('button', { name: 'Send', exact: true }).click();
    const row = receivers[0].locator('[class~="group/msg"]').filter({ has: receivers[0].getByText(selectedFile.name, { exact: true }) });
    await row.getByText('Verified', { exact: true }).waitFor({ timeout: 30000 });
    const downloading = receivers[0].waitForEvent('download');
    await row.getByTestId('transfer-download').click();
    const download = await downloading;
    assert.equal(await download.failure(), null);
    assert.deepEqual(await readFile(await download.path()), selectedFile.buffer);
    assert.equal(await receivers[1].getByText(selectedFile.name, { exact: true }).count(), 0);
    assert.equal(binaryReceived[2], excludedBefore, 'unselected member must receive no ciphertext');
    console.log('PASS selected recipient: B verified byte-identical multi-chunk file; C received no metadata or binary');
  }
  assert.ok(binarySent >= files.length * receivers.length, 'forced relay must send binary chunks');
  assert.ok(maxBinaryBytes <= Number(process.env.MAX_BINARY_BYTES || 128 * 1024), `relay frame exceeds cap: ${maxBinaryBytes}`);
  console.log(`PASS ${count}-device forced-relay files: all receivers verified all 3 files; binarySent=${binarySent}; maxBinaryBytes=${maxBinaryBytes}`);
} catch (error) {
  await diagnostics.captureFailure(error);
  throw error;
} finally {
  for (const upstream of upstreamSockets) upstream.close();
  await browser.close();
}
