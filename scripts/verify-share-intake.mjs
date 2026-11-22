/** Phone-share lifecycle regressions. Run against an app pinned to a private
 * local Worker: BASE_URL=http://localhost:3010 node scripts/verify-share-intake.mjs.
 * Cache/IndexedDB records are fixtures; room creation and rendered UI are real. */
import assert from 'node:assert/strict';
import { launchBrowser, gotoPage } from './lib.mjs';

const BASE = (process.env.BASE_URL || 'http://localhost:3010').replace(/\/$/, '');
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE), 'Use a private local app');
const browser = await launchBrowser();
let failures = 0;
const only = process.argv[2];

async function seed(page, { expired = false, draftCount = 0, sharedCount = 1 } = {}) {
  return page.evaluate(async ({ expired, draftCount, sharedCount }) => {
    if (expired) localStorage.setItem('sharetext.session.v1', JSON.stringify({
      roomId: crypto.randomUUID(), secret: 'a'.repeat(64), isCreator: true,
    }));
    const stored = JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null');
    if (draftCount) {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('sharetext-drafts', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('drafts');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({ text: 'saved draft', updatedAt: Date.now(), attachments:
          Array.from({ length: draftCount }, (_, i) => ({
            id: crypto.randomUUID(), name: `saved-${i}.txt`, type: 'file', size: 1,
            mimeType: 'text/plain', status: 'draft', file: new File(['x'], `saved-${i}.txt`, { type: 'text/plain' }),
          })),
        }, `draft:${stored.roomId}`);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
    const id = crypto.randomUUID();
    const cache = await caches.open('sharetexts-share-inbox-v1');
    const prefix = `${location.origin}/__share/${id}/`;
    const files = Array.from({ length: sharedCount }, (_, i) => ({ name: `shared-${i}.txt`, type: 'text/plain' }));
    await cache.put(prefix + 'meta', new Response(JSON.stringify({ at: Date.now(), text: 'shared text', files })));
    await Promise.all(files.map((_, i) => cache.put(prefix + i, new Response(`shared bytes ${i}`))));
    return id;
  }, { expired, draftCount, sharedCount });
}

async function storedRoom(page) {
  await gotoPage(page, BASE);
  await page.getByTestId('home-send').click();
  await page.getByTestId('pairing-code').waitFor({ timeout: 25000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  await gotoPage(page, BASE + '/launch/index.html');
  // A remembered partner makes this a previously linked room on refresh.
  await page.evaluate(stored => localStorage.setItem('sharetext.session.v1', JSON.stringify({ ...stored, partnerName: 'Other device' })), stored);
}

const cases = {
  async retry(page, context) {
    await context.addInitScript(() => {
      const send = WebSocket.prototype.send;
      let rejectNext = true;
      WebSocket.prototype.send = function (data) {
        let frame; try { frame = JSON.parse(data); } catch { /* binary */ }
        if (rejectNext && frame?.event === 'create_room') {
          rejectNext = false;
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'ack', id: frame.id, ok: false, code: 'RATE_LIMITED' }) })));
          return;
        }
        return send.call(this, data);
      };
    });
    const id = await seed(page);
    await gotoPage(page, `${BASE}/?share_id=${id}`);
    await page.getByTestId('create-retry').waitFor({ timeout: 25000 });
    assert.deepEqual(await page.evaluate(() => ({ files: window.__stHomeDropFiles?.length, text: window.__stPendingIntentText })), { files: 1, text: 'shared text' });
    await page.getByTestId('create-retry').click();
    await page.getByTestId('pairing-code').waitFor({ timeout: 25000 });
    assert.equal(await page.evaluate(() => window.__stHomeDropFiles?.length), 1, 'Retry retains the reviewable files');
    await page.getByTestId('task-back').click();
    assert.equal(await page.evaluate(() => window.__stHomeDropFiles), undefined, 'Cancel still discards the handoff');
  },
  async expired(page, context, linked = false) {
    // Make Cache Storage win the race: a slow restoration verdict must not
    // strand a share that was already staged beside the old credentials.
    await context.routeWebSocket(/\/ws\?/, socket => {
      const server = socket.connectToServer();
      let resumeId;
      socket.onMessage(data => {
        const frame = JSON.parse(String(data));
        if (frame.event === 'resume_room') resumeId = frame.id;
        server.send(data);
      });
      server.onMessage(async data => {
        const frame = JSON.parse(String(data));
        if (frame.type === 'ack' && frame.id === resumeId) {
          await page.waitForFunction(() => window.__stHomeDropFiles?.length === 1);
        }
        socket.send(data);
      });
    });
    const id = await seed(page, { expired: true });
    if (linked) await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('sharetext.session.v1'));
      stored.partnerName = 'Other phone';
      localStorage.setItem('sharetext.session.v1', JSON.stringify(stored));
    });
    const oldRoom = await page.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')).roomId);
    await gotoPage(page, `${BASE}/?share_id=${id}`);
    await page.waitForFunction(() => !location.search && window.__stHomeDropFiles?.length === 1);
    await page.waitForFunction(oldRoom => {
      const stored = JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null');
      return stored?.roomId && stored.roomId !== oldRoom;
    }, oldRoom, { timeout: 10000 });
    await page.getByTestId('pairing-code').waitFor({ timeout: 25000 });
    assert.equal(await page.evaluate(() => window.__stPendingIntentText), 'shared text');
  },
  async expiredLinked(page, context) { await cases.expired(page, context, true); },
  async largeDrop(page) {
    await storedRoom(page);
    await gotoPage(page, BASE);
    await page.getByTestId('composer').waitFor({ timeout: 25000 });
    // The home-drop handoff has no 20-file intake limit, unlike the phone
    // share target. Exercise its exact parked-file contract at pickup.
    await page.evaluate(() => {
      window.__stHomeDropFiles = Array.from({ length: 25 }, (_, i) => new File(['x'], `drop-${i}.txt`, { type: 'text/plain' }));
      window.dispatchEvent(new Event('sharetext:composer-intent'));
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="staged-attachment"]').length === 20, null, { timeout: 10000 });
    assert.match(await page.getByTestId('error-message').textContent(), /Not added/);
  },
  async disconnect(page) {
    await storedRoom(page);
    const id = await seed(page, { draftCount: 20, sharedCount: 1 });
    await gotoPage(page, `${BASE}/?share_id=${id}`);
    await page.getByTestId('error-message').waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('sharetext.session.v1') || 'null')?.roomId);
    assert.equal(await page.evaluate(() => window.__stHomeDropFiles?.length || 0), 0, 'Disconnect cannot carry waiting files into another room');
    assert.equal(await page.evaluate(() => window.__stPendingIntentText || ''), '', 'The waiting caption is also discarded');
  },
  async lateDisconnect(page, context) {
    await storedRoom(page);
    const id = await seed(page);
    await context.addInitScript(() => {
      const match = Cache.prototype.match;
      Cache.prototype.match = async function (request, options) {
        const response = await match.call(this, request, options);
        if (String(request?.url || request).includes('/__share/')) {
          window.__readingShare = true;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return response;
      };
    });
    await gotoPage(page, `${BASE}/?share_id=${id}`);
    await page.waitForFunction(() => window.__readingShare);
    await page.getByTestId('composer').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.waitForFunction(async () => (await (await caches.open('sharetexts-share-inbox-v1')).keys()).length === 0);
    assert.equal(await page.evaluate(() => window.__stHomeDropFiles?.length || 0), 0, 'A late cache read cannot resurrect a closed room handoff');
    assert.equal(await page.evaluate(() => window.__stPendingIntentText || ''), '');
  },
  async fullDraft(page) {
    await storedRoom(page);
    const id = await seed(page, { draftCount: 19, sharedCount: 2 });
    await gotoPage(page, `${BASE}/?share_id=${id}`);
    await page.getByTestId('composer').waitFor({ timeout: 25000 });
    await page.getByTestId('error-message').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('staged-attachment').count(), 19, 'A shared batch is not partly added');
    assert.equal(await page.getByTestId('composer').inputValue(), 'saved draft', 'The waiting caption must not send with the old draft');
    await page.getByRole('button', { name: 'Remove attachment', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="staged-attachment"]').length === 20 && !window.__stHomeDropFiles);
    assert(await page.getByTestId('composer').inputValue().then(value => value.includes('saved draft') && value.includes('shared text')));
    await page.getByTestId('error-message').waitFor({ state: 'hidden' });
  },
  async rejection(page) {
    await storedRoom(page);
    await gotoPage(page, `${BASE}/?share_error=1`);
    await page.getByTestId('composer').waitFor({ timeout: 25000 });
    await page.getByTestId('error-message').waitFor({ timeout: 10000 });
    assert.match(await page.getByTestId('error-message').textContent(), /Couldn’t open that share/);
  },
};

try {
  for (const [name, run] of Object.entries(cases)) {
    if (only && name !== only) continue;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route(/^https?:\/\/[^/]*\.workers\.dev\//, route => route.abort());
    await context.routeWebSocket(/\.workers\.dev\//, socket => socket.close());
    // Nearby discovery has its own gates; don't spend its socket quota here.
    await context.routeWebSocket(/\/lobby(?:\?|$)/, socket => socket.close());
    const page = await context.newPage();
    try {
      await gotoPage(page, BASE + '/launch/index.html');
      await run(page, context);
      console.log(`PASS share intake: ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL share intake: ${name}: ${error.message}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
assert.equal(failures, 0, `${failures} phone-share lifecycle regression(s)`);
