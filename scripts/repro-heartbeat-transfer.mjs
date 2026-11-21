import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const a = await browser.newContext();
  const b = await browser.newContext();
  for (const context of [a, b]) await context.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.setInterval = (callback, ms, ...args) => {
      if (ms === 90000) window.reseatHeartbeat = () => callback(...args);
      return interval(callback, ms, ...args);
    };
    window.blockReads = false;
    window.pendingReads = [];
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      if (window.blockReads && this.size > 0 && this.size <= 128 * 1024) {
        await new Promise(resolve => window.pendingReads.push(resolve));
      }
      return read.call(this);
    };
  });
  const A = await a.newPage();
  const B = await b.newPage();
  let recovered = 0;
  let heartbeats = 0;
  for (const page of [A, B]) page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      if (typeof frame.payload === 'string' && frame.payload.includes('"peer_recovered"')) recovered++;
    });
    socket.on('framesent', frame => {
      if (typeof frame.payload === 'string' && frame.payload.includes('"resume_room"')) heartbeats++;
    });
  });
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  for (const page of [A, B]) await page.getByTestId('composer').first().waitFor();
  const sendFile = async name => {
    await A.evaluate(() => { window.blockReads = true; });
    await A.locator('input[multiple]:not([accept])').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(4 * 1024 * 1024, 7) });
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await A.waitForFunction(() => window.pendingReads.length > 0);
  };
  const sendables = () => A.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('sharetext-transfers');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('sendables').objectStore('sendables').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
  const release = () => A.evaluate(() => {
    window.blockReads = false;
    window.pendingReads.splice(0).forEach(resolve => resolve());
  });
  const verified = async name => {
    const row = B.locator('[class~="group/msg"]').filter({ has: B.getByText(name, { exact: true }) });
    await row.waitFor({ timeout: 30000 });
    await row.scrollIntoViewIfNeeded();
    await row.getByText('Verified', { exact: true }).waitFor({ timeout: 30000 });
  };
  await sendFile('heartbeat-file.bin');
  assert.equal(await sendables(), 1, 'in-flight bytes must be durable');
  const before = recovered;
  const sentBefore = heartbeats;
  for (let tick = 0; tick < 3; tick++) {
    for (const page of [A, B]) await page.evaluate(() => window.reseatHeartbeat());
    await A.waitForTimeout(250);
  }
  assert.equal(heartbeats - sentBefore, 6, 'six actual resume heartbeats must be exercised');
  assert.equal(recovered, before, 'healthy heartbeats must not emit peer_recovered');
  await release();
  await verified('heartbeat-file.bin');
  console.log('PASS: six heartbeats during an in-flight file; no peer_recovered; receiver Verified');

  await sendFile('recovered-file.bin');
  const oldReaders = await A.evaluate(() => window.pendingReads.length);
  await B.reload();
  await B.getByTestId('composer').first().waitFor({ timeout: 30000 });
  assert.ok(recovered > before, 'real reload must emit peer_recovered');
  await A.evaluate(count => window.pendingReads.splice(0, count).forEach(resolve => resolve()), oldReaders);
  await A.waitForTimeout(500);
  assert.equal(await sendables(), 1, 'involuntary teardown must retain sender bytes');
  await release();
  await verified('recovered-file.bin');
  assert.equal(await sendables(), 0, 'successful recovery must clean sender bytes');
  console.log('PASS: real reload recovers in-flight file, retains sendable until completion; receiver Verified');

  await sendFile('cancelled-file.bin');
  const cancelledRow = A.locator('[class~="group/msg"]').filter({ has: A.getByText('cancelled-file.bin', { exact: true }) });
  await cancelledRow.getByTestId('cancel-transfer').click();
  await release();
  await cancelledRow.getByText('Cancelled', { exact: true }).waitFor();
  await A.waitForFunction(async () => {
    const db = await new Promise(resolve => {
      const request = indexedDB.open('sharetext-transfers');
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise(resolve => {
      const request = db.transaction('sendables').objectStore('sendables').count();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return count === 0;
  });
  console.log('PASS: explicit user cancellation remains final and deletes sender bytes');
} finally {
  await browser.close();
}
