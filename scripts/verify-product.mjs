/** Byte-level share-target and real completion/install/funnel contracts.
 * No browser, server, network or production Worker is involved. */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

const origin = 'https://share.test';
const store = new Map();
const requests = [];
const target = new EventTarget();
globalThis.window = Object.assign(target, {
  location: { origin }, onbeforeinstallprompt: null,
  matchMedia: () => ({ matches: false }),
});
globalThis.location = window.location;
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Chromium', maxTouchPoints: 0 } });
globalThis.fetch = async (url, options) => { requests.push({ url, ...options }); return new Response(); };

class Cache {
  entries = new Map();
  async match(key) { return this.entries.get(typeof key === 'string' ? key : key.url)?.clone(); }
  async put(key, response) { this.entries.set(typeof key === 'string' ? key : key.url, response.clone()); }
  async keys() { return [...this.entries.keys()].map(key => new Request(key)); }
  async delete(key) { return this.entries.delete(typeof key === 'string' ? key : key.url); }
}
const inbox = new Cache();
globalThis.caches = { open: async () => inbox };
const temporary = mkdtempSync(path.join(tmpdir(), 'sharetexts-product-'));
try {
  const output = await build({
    stdin: { contents: `export * from './src/lib/pwaInstall'; export * from './src/lib/completedItems'; export * from './src/lib/shareTarget'; export * from './src/lib/telemetry';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'neutral', write: false,
    define: { 'import.meta.env.DEV': 'false' },
  });
  const file = path.join(temporary, 'product.mjs');
  writeFileSync(file, output.outputFiles[0].contents);
  const product = await import(pathToFileURL(file));
  product.initInstallCapture();
  const installable = new Event('beforeinstallprompt', { cancelable: true });
  installable.prompt = async () => {};
  window.dispatchEvent(installable);
  assert(installable.defaultPrevented, 'native unsolicited install prompt is suppressed');
  product.noteVisit(); product.noteVisit();
  assert.equal(product.shouldOfferInstall(true), false, 'visits/room creation are not success');
  product.noteCompletedItem('one', false, 'room-private-a');
  assert.equal(product.shouldOfferInstall(), false, 'one completed item is too early');
  product.noteCompletedItem('one', true, 'room-private-a');
  assert.equal(product.completedItemCount(), 1, 'duplicate receipts do not count');
  product.noteCompletedItem('two', true, 'room-private-a');
  assert.equal(product.shouldOfferInstall(), true, 'two completed items earn the offer');
  product.noteConnectedRoom('room-private-a');
  assert(!requests.some(r => r.body === 'product.second_session'), 'same-room reconnect is not a second session');
  product.noteConnectedRoom('room-private-b'); product.noteConnectedRoom('room-private-b');
  assert.equal(requests.filter(r => r.body === 'product.second_session').length, 1);
  product.productEvent('product.first_item_received');
  assert.equal(requests.filter(r => r.body === 'product.first_item_received').length, 1, 'receive funnel is once per load');
  assert(requests.every(r => !JSON.stringify(r).includes('room-private')), 'room ids never enter telemetry');
  product.silenceInstall(false);
  assert.equal(product.shouldOfferInstall(), false, 'snooze still wins');
  console.log('PASS completion: visits, dedupe, second-item timing, reconnect, funnel privacy and snooze');

  const listeners = {};
  const self = { location: { origin }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, crypto, Request, Response, URL, File, Set, Date, console, fetch: globalThis.fetch });
  const share = async form => {
    let pending;
    const request = new Request(origin + '/share-target', { method: 'POST', body: form });
    listeners.fetch({ request, respondWith: response => { pending = response; } });
    return pending;
  };
  const form = new FormData();
  form.set('share_text', 'hello from the share sheet');
  form.set('share_url', 'https://example.com/');
  form.append('files', new File([new Uint8Array([0, 255, 7, 8])], 'photo.png', { type: 'image/png' }));
  form.append('files', new File(['a note'], 'note.txt', { type: 'text/plain' }));
  const arrival = await share(form);
  assert.equal(arrival.status, 303);
  const id = new URL(arrival.headers.get('location')).searchParams.get('share_id');
  assert(id, 'successful share redirects with an opaque local handoff id');
  const first = product.takeSharedItems(id);
  assert.equal(product.takeSharedItems(id), first, 'StrictMode reads share a single promise');
  const items = await first;
  assert.equal(items.text, 'hello from the share sheet\nhttps://example.com/');
  assert.equal(items.files[0].name, 'photo.png');
  assert.equal(items.files[0].type, 'image/png');
  assert.deepEqual([...new Uint8Array(await items.files[0].arrayBuffer())], [0, 255, 7, 8]);
  assert.equal(items.files[1].size, 6);
  assert.equal((await inbox.keys()).length, 0, 'consumption clears temporary bytes');
  await assert.rejects(product.takeSharedItems(id), /expired/, 'completed reads release their file references');
  await assert.rejects(product.takeSharedItems('../bad-id'));

  const expiredId = crypto.randomUUID();
  const base = `${origin}/__share/${expiredId}/`;
  await inbox.put(base + 'meta', new Response(JSON.stringify({ at: Date.now() - 601_000, text: 'old', files: [] })));
  await assert.rejects(product.takeSharedItems(expiredId), /expired/);
  assert.equal((await inbox.keys()).length, 0);
  const excess = new FormData();
  for (let i = 0; i < 21; i++) excess.append('files', new File(['x'], `${i}.txt`));
  assert(new URL((await share(excess)).headers.get('location')).searchParams.has('share_error'));
  assert(new URL((await share(new FormData())).headers.get('location')).searchParams.has('share_error'));
  const emptyFile = new FormData();
  emptyFile.append('files', new File([], 'empty.txt', { type: 'text/plain' }));
  assert(new URL((await share(emptyFile)).headers.get('location')).searchParams.has('share_error'), 'empty files must not enter a transfer that cannot complete');
  assert.equal((await inbox.keys()).length, 0, 'rejected shares leave no files behind');
  const originalPut = inbox.put.bind(inbox);
  inbox.put = async (key, response) => {
    if (String(key).endsWith('/1')) throw new Error('Simulated quota failure');
    await new Promise(resolve => setTimeout(resolve, 10));
    return originalPut(key, response);
  };
  assert(new URL((await share(form)).headers.get('location')).searchParams.has('share_error'));
  assert.equal((await inbox.keys()).length, 0, 'quota failure waits for pending writes before cleanup');
  inbox.put = originalPut;
  console.log('PASS share target: POST, byte fidelity, MIME/name, text, empty files, consume-once cache, expiry, limits and failure cleanup');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
