import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gotoPage } from './lib.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'sharetexts-relay-'));
try {
  const stub = 'export const getSocket=()=>({on(){},off(){},emit:(...args)=>globalThis.__relayFrames?.push(args)}); export const diag=()=>{}; export const devLog=()=>{}; export const beginTransferRecord=()=>{}; export const finishTransferRecord=()=>{}; export const recordTransferProgress=()=>{}; export const setCurrentTransport=()=>{}; export const productEvent=()=>{}; export const setDataChannel=()=>{};';
  await build({
    entryPoints: ['src/lib/webrtc.ts', 'src/lib/cloudflareSocket.ts', 'src/lib/crypto.ts', 'src/lib/binaryUtils.ts', 'src/lib/relayBinary.ts'],
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
  const { PeerManager, clearTransferState, clearAllTransferState } = await load('webrtc');
  const { generateKey, encryptBinaryChunk } = await load('crypto');
  const { uuidToBytes } = await load('binaryUtils');
  const { relayBinaryFrames, RelayBinaryAssembler } = await load('relayBinary');
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
  const sent = [];
  transport.openRoom = async () => ({ send: data => sent.push(data) });
  await transport.sendRelay({ roomId: 'room', to: 'selected-peer', data: 'enc:AAAA' });
  assert.equal(JSON.parse(sent[0]).payload.to, 'selected-peer');
  await transport.sendRelay({ roomId: 'room', to: 'selected-peer', data: raw });
  assert.equal(sent.pop(), raw);
  assert.equal(sent.length, 1, 'old Worker receives no target hints');
  transport.handleMessage(JSON.stringify({ type: 'event', event: 'relay_capabilities', payload: { binaryTargets: true } }));
  await transport.sendRelay({ roomId: 'room', to: 'selected-peer', data: raw });
  assert.equal(JSON.parse(sent[1]).event, 'relay_binary_target');
  assert.equal(JSON.parse(sent[1]).payload.to, 'selected-peer');
  assert.equal(sent[2], raw);
  await transport.sendRelay({ roomId: 'room', data: raw });
  assert.equal(sent[3], raw);
  transport.closeWs();
  await transport.sendRelay({ roomId: 'room', to: 'selected-peer', data: raw });
  assert.equal(sent[4], raw);
  assert.equal(sent.length, 5, 'target capability must reset on reconnect');
  console.log('PASS relay recipient: targeted text, adjacent binary target hint, unchanged legacy bytes');

  const key = await generateKey('relay-regression-secret');
  const complete = [];
  let progress = 0;
  const peer = Object.assign(new PeerManager('relay-test', 'secret', false, key), {
    cryptoKey: key, onFileComplete: (id, blob) => complete.push({ id, blob }), onFileProgress: () => progress++,
  });
  const fullPacket = new Uint8Array(131120);
  fullPacket.set(uuidToBytes(crypto.randomUUID()));
  for (let i = 20; i < fullPacket.length; i++) fullPacket[i] = i % 251;
  const fragments = relayBinaryFrames(fullPacket.buffer);
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every(frame => frame.byteLength <= 126 * 1024));
  const assembly = new RelayBinaryAssembler();
  assert.equal(assembly.push(fragments[1]), null);
  assert.equal(assembly.push(fragments[1]), null);
  assert.equal(assembly.push(fragments[0]), null);
  assert.deepEqual(new Uint8Array(assembly.push(fragments[2])), fullPacket);
  assert.equal(assembly.push(raw), raw);
  assert.equal(assembly.push(new ArrayBuffer(0)).byteLength, 0);
  const malformed = fragments[0].slice(0);
  new DataView(malformed).setUint32(32, 1, true);
  assert.equal(assembly.push(malformed), null);
  new DataView(malformed).setUint32(28, 0xffffffff, true);
  assert.equal(assembly.push(malformed), null);
  assert.equal(assembly.push(fragments[0].slice(0, 12)), null);
  assembly.push(fragments[0]); assembly.clear();
  assert.equal(assembly.push(fragments[1]), null);
  assert.equal(assembly.push(fragments[2]), null);
  assert.throws(() => relayBinaryFrames(new ArrayBuffer(132 * 1024 + 1)), RangeError);
  peer.relayCapabilityWaiters = new Set();
  peer.routeControl({ type: 'hello', features: ['relay-fragments-v1'] });
  assert.equal(peer.peerRelayFragments, true);
  peer.routeControl({ type: 'hello', features: ['resume'] });
  assert.equal(peer.peerRelayFragments, false);
  globalThis.__relayFrames = [];
  await peer.sendRelayBinary(fullPacket.buffer);
  assert.equal(globalThis.__relayFrames.length, 1);
  assert.equal(globalThis.__relayFrames[0][1].data, fullPacket.buffer);
  globalThis.__relayFrames = [];
  peer.peerRelayFragments = null;
  const waitingForHello = peer.sendRelayBinary(fullPacket.buffer);
  assert.equal(globalThis.__relayFrames.length, 0);
  peer.routeControl({ type: 'hello', features: ['relay-fragments-v1'] });
  await waitingForHello;
  assert.equal(globalThis.__relayFrames.length, 3);
  assert.ok(globalThis.__relayFrames.every(([, frame]) => frame.data.byteLength <= 126 * 1024));
  delete globalThis.__relayFrames;
  console.log('PASS relay fragmentation: bounded frames, exact out-of-order reassembly, duplicates, empty/legacy, malformed bounds, reset, legacy capability fallback');
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
  const largeId = crypto.randomUUID();
  const largeBytes = new Uint8Array(128 * 1024).fill(73);
  const largeFrames = relayBinaryFrames(await packet(largeId, 0, largeBytes));
  peer.relayAssembly = new RelayBinaryAssembler();
  for (const frame of largeFrames.toReversed()) peer.acceptRelay(frame);
  await new Promise(resolve => setImmediate(resolve));
  peer.expectBinaryTransfer(largeId, 1);
  for (let i = 0; i < 100 && complete.length < 4; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(complete.length, 4);
  assert.deepEqual(new Uint8Array(await complete.at(-1).blob.arrayBuffer()), largeBytes);
  for (const frame of largeFrames) peer.acceptRelay(frame);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete.length, 4);
  const checksumId = crypto.randomUUID();
  const correct = new Uint8Array([10, 20, 30]);
  const digest = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expected = await digest(correct);
  peer.expectBinaryTransfer(checksumId, 1);
  await peer.handleIncomingData(await packet(checksumId, 0, new Uint8Array([10, 20, 31])));
  assert.equal(complete.length, 5);
  assert.notDeepEqual(await digest(await complete.at(-1).blob.arrayBuffer()), expected);
  clearTransferState(checksumId);
  peer.expectBinaryTransfer(checksumId, 1);
  await peer.handleIncomingData(await packet(checksumId, 0, correct));
  assert.equal(complete.length, 6);
  assert.deepEqual(await digest(await complete.at(-1).blob.arrayBuffer()), expected);
  peer.expectBinaryTransfer(checksumId, 1);
  await peer.handleIncomingData(await packet(checksumId, 0, correct));
  assert.equal(complete.length, 6);
  console.log('PASS checksum mismatch retry: clearTransferState reopens the same transfer ID, resend verifies once');
  peer.destroy();
  console.log('PASS full encrypted 128-KiB chunk: fragmented relay arrives before metadata, decrypts intact, completes once');
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
