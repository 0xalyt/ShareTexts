import { launchBrowser, URL } from './lib.mjs';

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(URL);
  const results = await page.evaluate(async () => {
    const results = [];
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    let previousDb;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('sharetext-transfers', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('sendables', { keyPath: 'transferId' });
        request.result.createObjectStore('states', { keyPath: 'transferId' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('states', 'readwrite');
        tx.objectStore('states').put({ transferId: 'existing-send', status: 'interrupted', ackedChunks: 7, totalChunks: 10 });
        tx.oncomplete = () => { previousDb = db; resolve(); };
        tx.onabort = () => reject(tx.error);
      };
    });
    const store = await import('/src/lib/transferStore.ts');
    check(await store.saveReceivedFile('room-a', 'blocked', 'checksum', new Blob(['blocked'])) === false, 'blocked upgrade did not decline');
    previousDb.close();
    results.push('PASS: an older tab blocking the upgrade does not stall verification');
    check((await store.getTransferState('existing-send'))?.ackedChunks === 7, 'v1 resume floor lost during upgrade');
    results.push('PASS: database upgrade retains existing resume state');

    const blob = new Blob(['verified bytes'], { type: 'application/octet-stream' });
    check(await store.saveReceivedFile('room-a', 'file', 'checksum', blob), 'save failed');
    check(await (await store.getReceivedFile('room-a', 'file', 'checksum', blob.size))?.text() === 'verified bytes', 'bytes changed');
    check(await store.getReceivedFile('room-b', 'file', 'checksum', blob.size) === null, 'cross-room read');
    check(await store.getReceivedFile('room-a', 'file', 'other', blob.size) === null, 'checksum mismatch accepted');
    check(await store.getReceivedFile('room-a', 'file', 'checksum', 1) === null, 'size mismatch accepted');
    check(await store.getReceivedFile('room-a', 'missing', 'checksum', 0) === null, 'missing file accepted');
    results.push('PASS: committed bytes round-trip; room, checksum, size and missing-file isolation');

    check(await store.saveReceivedFile('room-a', 'empty', 'empty-checksum', new Blob([])), 'empty save failed');
    check((await store.getReceivedFile('room-a', 'empty', 'empty-checksum', 0))?.size === 0, 'empty read failed');
    results.push('PASS: empty received bytes survive storage');

    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'received' && args[0].blob) throw new DOMException('Blob storage unavailable', 'UnknownError');
      return put.apply(this, args);
    };
    try {
      check(await store.saveReceivedFile('room-a', 'buffer', 'checksum', blob), 'buffer fallback failed');
      check(await (await store.getReceivedFile('room-a', 'buffer', 'checksum', blob.size))?.text() === 'verified bytes', 'buffer fallback changed bytes');
      const oversized = new class extends Blob { get size() { return 64 * 1024 * 1024 + 1; } }([]);
      check(await store.saveReceivedFile('room-a', 'large', 'checksum', oversized) === false, 'oversized memory fallback accepted');
      check(await store.saveReceivedFile('room-a', 'cancelled', 'checksum', blob, () => false) === false, 'obsolete fallback saved bytes');
    } finally { IDBObjectStore.prototype.put = put; }
    results.push('PASS: Blob-unavailable fallback preserves bytes; oversized and obsolete writes decline honestly');

    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'received') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try {
      check(await store.saveReceivedFile('room-a', 'quota', 'checksum', blob) === false, 'quota failure hidden');
    } finally { IDBObjectStore.prototype.put = put; }
    check(await store.getReceivedFile('room-a', 'quota', 'checksum', blob.size) === null, 'failed write persisted');
    results.push('PASS: quota failure leaves an honest local miss');

    await store.saveReceivedFile('room-b', 'file', 'checksum', blob);
    await store.pruneReceivedFiles('room-a', ['file']);
    check(await store.getReceivedFile('room-a', 'empty', 'empty-checksum', 0) === null, 'pruned history retained bytes');
    check(await store.getReceivedFile('room-b', 'file', 'checksum', blob.size) !== null, 'prune crossed rooms');
    results.push('PASS: bounded-history pruning preserves other rooms');

    const { saveStoredSession, saveLastStayRoom } = await import('/src/lib/session/persistence.ts');
    const history = { roomId: 'room-a', secret: 'test', isCreator: false, messages: [{ id: 'message', attachment: { id: 'file' } }] };
    saveLastStayRoom(history);
    saveStoredSession(history);
    saveStoredSession(null);
    check(await store.getReceivedFile('room-a', 'file', 'checksum', blob.size) !== null, 'leave deleted retained history');
    saveLastStayRoom(null);
    for (let attempt = 0; attempt < 50 && await store.getReceivedFile('room-a', 'file', 'checksum', blob.size) !== null; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    check(await store.getReceivedFile('room-a', 'file', 'checksum', blob.size) === null, 'forgotten room retained bytes');
    check(await store.getReceivedFile('room-b', 'file', 'checksum', blob.size) !== null, 'forget crossed rooms');
    await store.deleteReceivedFile('room-b', 'file');
    check(await store.getReceivedFile('room-b', 'file', 'checksum', blob.size) === null, 'message deletion retained bytes');
    results.push('PASS: leave retains rejoin history; forgetting history and deleting messages remove bytes');
    return results;
  });
  results.forEach(result => console.log(result));
} finally {
  await browser.close();
}
