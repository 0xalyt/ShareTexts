import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gotoPage } from './lib.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'sharetexts-relay-'));
try {
  const stub = 'export const getSocket=()=>({on(){},off(){}}); export const diag=()=>{}; export const devLog=()=>{}; export const beginTransferRecord=()=>{}; export const finishTransferRecord=()=>{}; export const recordTransferProgress=()=>{}; export const setCurrentTransport=()=>{}; export const productEvent=()=>{}; export const setDataChannel=()=>{};';
  await build({
    entryPoints: ['src/lib/webrtc.ts', 'src/lib/cloudflareSocket.ts', 'src/lib/crypto.ts', 'src/lib/binaryUtils.ts'],
    bundle: true, platform: 'node', format: 'esm', outdir: directory,
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
    plugins: [{ name: 'browser-services', setup(builder) {
      builder.onResolve({ filter: /^\.\/(socket|diag|devlog|transferMetrics|telemetry|netStats)$/ }, args => ({ path: args.path, namespace: 'stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub }));
    } }],
  });
  writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  const load = name => import(pathToFileURL(path.join(directory, `${name}.js`)).href);
  const { CloudflareSocket } = await load('cloudflareSocket');
  const { PeerManager, clearAllTransferState } = await load('webrtc');
  const { generateKey, encryptBinaryChunk } = await load('crypto');
  const { uuidToBytes } = await load('binaryUtils');
  const transport = new CloudflareSocket('http://localhost:8787');
  const received = [];
  transport.on('relay_message', frame => received.push(frame));
  const label = from => transport.handleMessage(JSON.stringify({ type: 'event', event: 'relay_binary', payload: { from } }));
  const raw = new Uint8Array(20).buffer;
  transport.handleMessage(raw);
  assert.equal(received.at(-1).from, undefined);
  label('sender-a'); transport.handleMessage(raw);
  assert.equal(received.at(-1).from, 'sender-a');
  transport.handleMessage(raw);
  assert.equal(received.at(-1).from, undefined);
  label(null); transport.handleMessage(raw);
  assert.equal(received.at(-1).from, undefined);
  let unrelated = 0;
  transport.on('other_event', () => unrelated++);
  label('preserved');
  transport.handleMessage('malformed JSON');
  transport.handleMessage(JSON.stringify({ type: 'event', event: 'other_event', payload: {} }));
  transport.handleMessage(raw);
  assert.equal(unrelated, 1);
  assert.equal(received.at(-1).from, 'preserved');
  label('stale'); transport.closeWs(); transport.handleMessage(raw);
  assert.equal(received.at(-1).from, undefined);
  label('blob-sender'); transport.handleMessage(new Blob([raw]));
  label('next-sender'); transport.handleMessage(raw);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(received.at(-1).from, 'blob-sender');
  assert.equal(received.at(-2).from, 'next-sender');
  console.log('PASS relay labels: attributed, legacy raw, malformed, one-shot, reconnect reset, asynchronous Blob');

  const key = await generateKey('relay-regression-secret');
  const complete = [];
  let progress = 0;
  const peer = Object.assign(Object.create(PeerManager.prototype), {
    cryptoKey: key, onFileComplete: (id, blob) => complete.push({ id, blob }), onFileProgress: () => progress++,
  });
  async function packet(id, sequence, bytes) {
    const encrypted = await encryptBinaryChunk(bytes.buffer, key);
    const result = new Uint8Array(20 + encrypted.byteLength);
    result.set(uuidToBytes(id)); new DataView(result.buffer).setUint32(16, sequence, true);
    result.set(new Uint8Array(encrypted), 20);
    return result.buffer;
  }
  const id = crypto.randomUUID();
  const first = await packet(id, 0, new Uint8Array([1, 2]));
  const second = await packet(id, 1, new Uint8Array([3, 4]));
  peer.expectBinaryTransfer(id, 2);
  const otherCopy = await packet(id, 0, new Uint8Array([1, 2]));
  assert.notDeepEqual(new Uint8Array(first), new Uint8Array(otherCopy));
  await Promise.all([peer.handleIncomingData(first), peer.handleIncomingData(otherCopy)]);
  await Promise.all([peer.handleIncomingData(second), peer.handleIncomingData(await packet(id, 1, new Uint8Array([3, 4])))]);
  peer.expectBinaryTransfer(id, 2);
  await peer.handleIncomingData(first); await peer.handleIncomingData(second);
  assert.equal(complete.length, 1); assert.equal(progress, 2);
  assert.deepEqual(new Uint8Array(await complete[0].blob.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  const earlyId = crypto.randomUUID();
  const early = await packet(earlyId, 0, new Uint8Array([5]));
  await peer.handleIncomingData(early); await peer.handleIncomingData(early);
  peer.expectBinaryTransfer(earlyId, 1);
  for (let i = 0; i < 100 && complete.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(complete.length, 2);
  const emptyId = crypto.randomUUID(); peer.expectBinaryTransfer(emptyId, 0);
  await peer.handleIncomingData(new ArrayBuffer(0));
  assert.equal(complete.length, 2);
  const retryId = crypto.randomUUID(); peer.expectBinaryTransfer(retryId, 1);
  const retry = await packet(retryId, 0, new Uint8Array([9]));
  const damaged = retry.slice(0); new Uint8Array(damaged)[20] ^= 255;
  const originalError = console.error;
  try { console.error = () => {}; await peer.handleIncomingData(damaged); } finally { console.error = originalError; }
  await peer.handleIncomingData(new ArrayBuffer(0));
  await peer.handleIncomingData(await packet(retryId, 2, new Uint8Array([8])));
  await peer.handleIncomingData(retry);
  assert.equal(complete.length, 3);
  assert.deepEqual(new Uint8Array(await complete.at(-1).blob.arrayBuffer()), new Uint8Array([9]));
  clearAllTransferState();
  console.log('PASS binary receive: concurrent/late duplicates complete once, early metadata race, empty frame, malformed/decryption retry');

  const timeout = Object.assign(new Error('navigation timeout'), { name: 'TimeoutError' });
  for (const scenario of ['success', 'recover', 'chromium', 'real-url', 'wrong-document', 'incomplete', 'non-timeout', 'retry-fails']) {
    let calls = 0;
    const page = {
      goto: async () => { calls++; if (scenario === 'success') return 'ok'; if (calls === 1) throw scenario === 'non-timeout' ? new Error('fatal') : timeout; if (scenario === 'retry-fails') throw timeout; return 'ok'; },
      context: () => ({ browser: () => ({ browserType: () => ({ name: () => scenario === 'chromium' ? 'chromium' : 'firefox' }) }) }),
      url: () => scenario === 'real-url' ? 'http://localhost:3311/' : 'about:blank',
      evaluate: async (fn, target) => {
        globalThis.location = { href: scenario === 'wrong-document' ? 'http://localhost:3311/other' : target };
        globalThis.document = { readyState: scenario === 'incomplete' ? 'loading' : 'complete' };
        try { return fn(target); } finally { delete globalThis.location; delete globalThis.document; }
      },
    };
    if (['success', 'recover'].includes(scenario)) assert.equal(await gotoPage(page, 'http://localhost:3311/'), 'ok');
    else await assert.rejects(gotoPage(page, 'http://localhost:3311/'));
    assert.equal(calls, ['recover', 'retry-fails'].includes(scenario) ? 2 : 1, scenario);
  }
  console.log('PASS Firefox navigation: all recovery guards, successful navigation, fatal errors, exactly one retry');
} finally { rmSync(directory, { recursive: true, force: true }); }
