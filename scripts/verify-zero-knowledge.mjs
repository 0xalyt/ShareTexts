// Zero-knowledge gate — what the SERVER is allowed to see, measured.
//
// This does not ask the Worker politely whether it can read your items. It
// seals an item on a real device, records every byte that leaves that device,
// uploads through the production client, pulls the ciphertext back, and then
// tries to read it with nothing but what the server holds.
//
// Runs against the DEPLOYED Worker by default (CIRCLE_URL), because the claim
// this gate unlocks is about the deployed product.
//
//   node scripts/verify-zero-knowledge.mjs
//   CIRCLE_URL=http://127.0.0.1:8787 node scripts/verify-zero-knowledge.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CIRCLE_URL || 'https://sharetext-signaling.alighttt.workers.dev';

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-zk-'));
const out = await build({
  entryPoints: {
    api: path.join(root, 'src', 'lib', 'circle', 'api.ts'),
    seal: path.join(root, 'src', 'lib', 'circle', 'seal.ts'),
  },
  bundle: true, format: 'esm', platform: 'neutral', outdir: tmp, write: false, logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);
const bust = '?t=' + Date.now();
const { CircleClient } = await import(pathToFileURL(path.join(tmp, 'api.js')).href + bust);
const SEAL = await import(pathToFileURL(path.join(tmp, 'seal.js')).href + bust);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
const enc = new TextEncoder();

// The plaintext a person would recognise. It must never appear on the wire.
const SENTENCE = 'Zero-knowledge proof: the server must never read this sentence.';
// A 4 KiB body: Shannon entropy over a handful of bytes is a bad measurement,
// not a security finding — 80 samples cannot exceed log2(80) = 6.3 bits/byte.
const PLAINTEXT = SENTENCE + ' ' + Array.from(
  crypto.getRandomValues(new Uint8Array(4096)),
).map((b) => String.fromCharCode(97 + (b % 26))).join('');

/** Every outbound byte, so the gate can assert what the server was given. */
const sent = [];
const recordingFetch = async (url, init = {}) => {
  const body = init.body instanceof Uint8Array
    ? init.body
    : typeof init.body === 'string' ? enc.encode(init.body) : new Uint8Array(0);
  sent.push({ url: String(url), method: init.method || 'GET', headers: { ...(init.headers || {}) }, body });
  return fetch(url, init);
};

async function device() {
  const sign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const dh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const spki = await crypto.subtle.exportKey('spki', sign.publicKey);
  return {
    deviceId: b64(await crypto.subtle.digest('SHA-256', spki)).replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase(),
    signPub: b64(spki),
    dhPub: b64(await crypto.subtle.exportKey('spki', dh.publicKey)),
    sign: sign.privateKey,
    dh: dh.privateKey,
  };
}

const contains = (haystack, needle) => {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/** Shannon entropy, bits per byte — 8.0 is indistinguishable from random. */
function entropy(bytes) {
  const counts = new Array(256).fill(0);
  for (const b of bytes) counts[b]++;
  let h = 0;
  for (const c of counts) if (c) { const p = c / bytes.length; h -= p * Math.log2(p); }
  return h;
}

const health = await fetch(`${BASE}/health`).catch(() => null);
if (!health || !health.ok) {
  console.log(`FAIL  ${BASE} is not answering — nothing to prove`);
  process.exit(1);
}
console.log(`  target: ${BASE}`);

const A = await device();
const client = new CircleClient(BASE, A, recordingFetch);
const circleId = crypto.randomUUID();
await client.create(circleId);

// K is generated here and, from this line on, never leaves this process.
const keyRaw = SEAL.randomBytes(32);
const K = await SEAL.importCircleKey(keyRaw);
check('K exists only on the device', keyRaw.length === 32 && !sent.some((r) => contains(r.body, keyRaw)));

// ── seal an item the way the app does ───────────────────────────────────────
const itemId = crypto.randomUUID();
const itemKey = await SEAL.deriveItemKey(K, itemId);
const iv = SEAL.randomBytes(12);
const aad = SEAL.buildAad({
  circleId, itemId, fromDeviceId: A.deviceId, epoch: 1, ts: Date.now(), chunkIndex: 0, chunkCount: 1,
});
const ct = new Uint8Array(await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, additionalData: aad }, itemKey, enc.encode(PLAINTEXT),
));
check('the ciphertext does not contain the plaintext', !contains(ct, enc.encode(PLAINTEXT)));

await client.putChunk(circleId, itemId, 0, ct, { chunks: 1, epoch: 1, size: PLAINTEXT.length });

// ── 1. what left the device ────────────────────────────────────────────────
const bodies = sent.map((r) => r.body);
const headers = enc.encode(sent.map((r) => JSON.stringify(r.headers)).join('\n'));
check('no request body ever contained the plaintext', !bodies.some((b) => contains(b, enc.encode(PLAINTEXT))));
check('no request header ever contained the plaintext', !contains(headers, enc.encode(PLAINTEXT)));
check('no request body or header ever contained K', !bodies.some((b) => contains(b, keyRaw)) && !contains(headers, keyRaw));
check('every request went to the mailbox, and only over the signed API',
  sent.every((r) => r.url.startsWith(BASE)), `${sent.length} requests`);

// ── 2. what the server gives back ──────────────────────────────────────────
const back = await client.getChunk(circleId, itemId, 0);
check('the file comes back byte-identical', back.length === ct.length && back.every((b, i) => b === ct[i]));
check('what is stored is indistinguishable from random', entropy(back) > 7.5, `${entropy(back).toFixed(2)} bits/byte`);
check('what is stored contains no plaintext', !contains(back, enc.encode(PLAINTEXT)));

// ── 3. what an attacker holding the server's view can do ───────────────────
const members = await client.members(circleId);
const serverView = JSON.stringify(members) + JSON.stringify(await client.items(circleId));
check('the member list carries public keys only',
  members.members.every((m) => Object.keys(m).sort().join(',') === 'deviceId,ecdhPub,joinedAt,signPub'),
  Object.keys(members.members[0] || {}).join(','));
check('the server view contains no K', !serverView.includes(b64(keyRaw)) && !serverView.includes(Buffer.from(keyRaw).toString('hex')));
check('the server view contains no plaintext', !serverView.includes(SENTENCE.slice(0, 24)));

// The only thing that can open it is K — which the server does not have.
let openedWithoutK = false;
try {
  const wrongK = await SEAL.importCircleKey(SEAL.randomBytes(32));
  const wrongItemKey = await SEAL.deriveItemKey(wrongK, itemId);
  await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, wrongItemKey, back);
  openedWithoutK = true;
} catch { /* expected: authentication tag fails */ }
check('a key the server could have made cannot open it', !openedWithoutK);

const openedWithK = new TextDecoder().decode(
  await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, itemKey, back),
);
check('the device that holds K reads it back exactly', openedWithK === PLAINTEXT);

// ── 4. no route hands out key material ─────────────────────────────────────
const probed = [];
// Through the real client, so a signature mistake cannot hide behind a 401:
// every one of these must answer with data, and none may carry key material.
for (const [tail, run] of [
  ['/members', () => client.members(circleId)],
  ['/items', () => client.items(circleId)],
  ['/log', () => client.readLog(circleId)],
  ['/pending', () => client.pending(circleId)],
]) {
  try {
    const text = JSON.stringify(await run());
    probed.push({ tail, ok: true, text });
  } catch (err) {
    probed.push({ tail, ok: false, text: String(err?.code ?? err) });
  }
}
check('every mailbox read answered with data and no key material',
  probed.every((p) => p.ok && !p.text.includes(b64(keyRaw))),
  probed.map((p) => `${p.tail}:${p.ok ? 'ok' : 'ERR'}`).join(' '));

// Clean up the item the way the app does; the circle stays (it holds ciphertext
// only, and expires).
await client.deleteItem?.(circleId, itemId);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
