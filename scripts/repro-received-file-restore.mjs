import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
const name = 'received-durable.bin';
const bytes = Buffer.from(Array.from({ length: 32768 }, (_, i) => i % 251));
try {
  const a = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const b = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  if (process.env.STORE_FAILURE) await b.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'received') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  const A = await a.newPage();
  const B = await b.newPage();
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  for (const page of [A, B]) await page.getByTestId('composer').first().waitFor();
  await A.locator('input[multiple]:not([accept])').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes });
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  const check = async label => {
    const row = B.locator('[class~="group/msg"]').filter({ has: B.getByText(name, { exact: true }) });
    await row.getByText('Verified', { exact: true }).waitFor({ timeout: 15000 }).catch(async error => {
      console.log('RESTORE_STATE', label, await row.allTextContents());
      console.log('RECEIVED_STORE', await B.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open('sharetext-transfers');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('received', 'readonly');
          const request = tx.objectStore('received').getAll();
          request.onsuccess = () => resolve(request.result.map(r => ({ size: r.blob?.size, type: r.blob?.type })));
          tx.oncomplete = () => db.close();
        };
      })));
      throw error;
    });
    const downloadPromise = B.waitForEvent('download');
    await row.getByTestId('transfer-download').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), name);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    console.log(`PASS: ${label}; own row Verified, downloaded bytes identical`);
  };
  await check('initial receive');
  await B.waitForFunction(name => JSON.parse(localStorage.getItem('sharetext.session.v1'))?.messages?.some(m => m.attachment?.name === name && m.attachment.verified), name);
  await A.reload();
  await A.getByTestId('composer').first().waitFor();
  const confirmConnection = async text => {
    await A.locator('textarea').first().fill(text);
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await B.getByText(text, { exact: true }).waitFor({ timeout: 15000 });
  };
  if (process.env.STORE_FAILURE) await confirmConnection('sender recovered before quota restore');
  await check('sender reload preserves receiver file');
  await B.goto(`${URL}/404`);
  await B.getByRole('button', { name: /go home/i }).click();
  await B.getByTestId('composer').first().waitFor();
  if (process.env.STORE_FAILURE) {
    await confirmConnection('receiver recovered after quota restore');
    await B.getByText(/The other device no longer has this file/).waitFor().catch(async error => {
      console.log('QUOTA_RESTORE_STATE', await B.locator('[class~="group/msg"]').filter({ has: B.getByText(name, { exact: true }) }).allTextContents());
      throw error;
    });
    console.log('PASS: quota failure preserves honest resend/unavailable behavior after navigation');
  } else {
    await check('receiver 404 → Go home → room');
    await B.reload();
    await B.getByTestId('composer').first().waitFor();
    await check('receiver reload');
    const row = B.locator('[class~="group/msg"]').filter({ has: B.getByText(name, { exact: true }) });
    await row.click({ button: 'right' });
    await B.getByTestId('action-delete').click();
    await row.waitFor({ state: 'detached' });
    await B.waitForFunction(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('sharetext-transfers');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('received', 'readonly');
        const count = tx.objectStore('received').count();
        count.onsuccess = () => resolve(count.result === 0);
        tx.oncomplete = () => db.close();
      };
    }));
    console.log('PASS: deleting the local message deletes its durable bytes');
  }
} finally {
  await browser.close();
}
