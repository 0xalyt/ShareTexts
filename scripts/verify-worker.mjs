// Emulator protocol test for the Cloudflare signaling worker.
//
// workerd can't run on every machine, so this bundles the REAL Room and
// Registry Durable Object classes with esbuild (aliasing `cloudflare:workers`
// to a small runtime shim) and drives them directly in Node:
//   create → lookup → code-join → peer_joined → signal → relay (text + binary)
//   → third-device rejection (ROOM_FULL) → wrong-code (INVALID_CODE) →
//   brute-force limit (RATE_LIMITED) → disconnect/resume → manual close, plus
//   the explicit state machine (WAITING→CONNECTED→TRANSFERRING→…→CLOSED),
//   live idle-timeout expiry, and Registry register/lookup.
// For a test against a real `wrangler dev` instance, see verify-worker-live.mjs.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import * as OTPAuth from 'otpauth';
import { tsImport } from 'tsx/esm/api';

const { encryptText, generateKey } = await tsImport('../src/lib/crypto.ts', import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

// ---- build the real classes against the shim ------------------------------
const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-worker-'));
const shimPath = path.join(root, 'worker', 'test', 'cf-shim.ts');
const out = await build({
  entryPoints: {
    index: path.join(root, 'worker', 'src', 'index.ts'),
    room: path.join(root, 'worker', 'src', 'room.ts'),
    registry: path.join(root, 'worker', 'src', 'registry.ts'),
    metrics: path.join(root, 'worker', 'src', 'metrics.ts'),
    lobby: path.join(root, 'worker', 'src', 'lobby.ts'),
    space: path.join(root, 'worker', 'src', 'space.ts'),
    shim: shimPath,
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { 'cloudflare:workers': shimPath },
  outdir: tmp,
  write: false,
  logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);

const cacheBust = '?t=' + Date.now();
const { FakeCtx } = await import(pathToFileURL(path.join(tmp, 'shim.js')).href + cacheBust);
const { Room, ROOM_TTL } = await import(pathToFileURL(path.join(tmp, 'room.js')).href + cacheBust);
const { Registry } = await import(pathToFileURL(path.join(tmp, 'registry.js')).href + cacheBust);
const { Metrics } = await import(pathToFileURL(path.join(tmp, 'metrics.js')).href + cacheBust);
const { Lobby } = await import(pathToFileURL(path.join(tmp, 'lobby.js')).href + cacheBust);
const { Space, SPACE_TTL_CAP } = await import(pathToFileURL(path.join(tmp, 'space.js')).href + cacheBust);
const { default: worker } = await import(pathToFileURL(path.join(tmp, 'index.js')).href + cacheBust);

// Capture the pair created inside each DO fetch.
let lastPair = null;
const OrigPair = globalThis.WebSocketPair;
globalThis.WebSocketPair = class extends OrigPair {
  constructor() {
    super();
    lastPair = this;
  }
};

// Node's Response rejects status 101; emulate the Workers upgrade response.
const RealResponse = globalThis.Response;
globalThis.Response = class extends RealResponse {
  constructor(body, init = {}) {
    if (init.status === 101 && init.webSocket) {
      return { status: 101, webSocket: init.webSocket };
    }
    super(body, init);
  }
};

// ---- driver ---------------------------------------------------------------
let seq = 0;
async function connect(room, roomId, forceCid) {
  const cid = forceCid ?? uuid();
  await room.fetch(new Request(`http://x/ws?room=${roomId}&cid=${cid}`, { headers: { Upgrade: 'websocket' } }));
  const client = lastPair.client;
  const server = lastPair.server;
  const inbox = [];
  const binary = [];
  const frames = [];
  client.onmessage = (ev) => {
    frames.push(ev.data);
    if (typeof ev.data === 'string') inbox.push(JSON.parse(ev.data));
    else binary.push(ev.data);
  };
  const send = async (event, payload) => {
    const id = `r${seq++}`;
    await room.webSocketMessage(server, JSON.stringify({ v: 1, id, event, payload }));
    const ack = inbox.find((m) => m.type === 'ack' && m.id === id);
    return ack ? (ack.ok ? { success: true, ...ack } : { success: false, code: ack.code, error: ack.message }) : { success: false, error: 'no ack' };
  };
  const waitFor = async (pred, timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = inbox.find(pred);
      if (hit) return hit.payload !== undefined ? hit.payload : hit;
      await sleep(25);
    }
    return null;
  };
  const close = () => {
    try { client.close(1000, 'test'); } catch { /* noop */ }
    try { room.webSocketClose(server); } catch { /* noop */ }
  };
  return { client, server, inbox, binary, frames, send, waitFor, cid, close };
}

const codeFor = (secret, createdAt = 0) => new OTPAuth.TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret }).generate({ timestamp: Date.now() - createdAt });
const roomState = (ctx) => ctx.storage.map.get('room')?.state ?? null;
const assertState = (ctx, expected) => check(`state = ${expected}`, roomState(ctx) === expected, `got ${roomState(ctx)}`);

function makeEnv() {
  return { REGISTRY: { get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true })) }), idFromName: () => ({}) } };
}

async function runRoomProtocol() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());

  // create → WAITING
  const SECOND_PID = 'pid-second-device-00000000';
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room', { pid: 'pid-creator-device-00000000' });
  check('Worker advertises binary targeting on every room connection', creator.server.sent.some(frame => typeof frame === 'string' && JSON.parse(frame).event === 'relay_capabilities'));
  check('create_room ack', created.success === true && created.roomId === roomId, `room ${String(created.roomId).slice(0, 8)}`);
  check('creator roster + stable pid in ack', created.myParticipantId === 'pid-creator-device-00000000' && created.roster?.participants?.length === 1);
  const secret = created.secret;
  assertState(ctx, 'WAITING');

  // join → CONNECTED + peer_joined (the delta now carries a stable participant
  // id, the roster snapshot, and the deterministic initiator pick)
  const code = codeFor(secret, created.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code, pid: SECOND_PID });
  check('join_with_code ack', joined.success === true && joined.roomId === roomId);
  const peerJoined = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_joined');
  check('creator receives peer_joined', !!peerJoined?.peerId, `peer ${String(peerJoined?.peerId).slice(0, 8)}`);
  const joinerCid = SECOND_PID; // the delta now speaks participant ids
  check('delta carries the stable participant id', peerJoined?.peerId === SECOND_PID);
  check('delta carries the roster snapshot + initiator', Array.isArray(peerJoined?.roster?.participants) && peerJoined.roster.participants.length === 2 && peerJoined.initiatorId === 'pid-creator-device-00000000');
  check('joiner ack carries the roster snapshot', joined.roster?.participants?.length === 2 && joined.myParticipantId === SECOND_PID);
  assertState(ctx, 'CONNECTED');

  const beforeHeartbeat = creator.inbox.length;
  for (let heartbeat = 0; heartbeat < 3; heartbeat++) {
    const refreshed = await joiner.send('resume_room', { roomId, secret, pid: SECOND_PID });
    check('same-cid heartbeat acknowledged', refreshed.success === true);
  }
  check('same-cid heartbeat emits no recovery or join', !creator.inbox.slice(beforeHeartbeat).some(m =>
    m.type === 'event' && (m.event === 'peer_recovered' || m.event === 'peer_joined')));
  const beforeReconnect = creator.inbox.length;
  await joiner.send('resume_room', { roomId, secret, pid: SECOND_PID, reconnect: true });
  check('explicit same-cid reconnect emits recovery', creator.inbox.slice(beforeReconnect).filter(m => m.event === 'peer_recovered').length === 1);
  creator.inbox.splice(beforeReconnect);

  // signal forwarding — addressed by PARTICIPANT id now (the modern wire form)
  const sigPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'signal');
  await joiner.send('signal', { to: SECOND_PID === 'pid-second-device-00000000' ? 'pid-creator-device-00000000' : SECOND_PID, signal: { type: 'offer', sdp: 'v=0 fake sdp' } });
  const sig = await sigPromise;
  check('signal forwarded to creator (pid-addressed)', sig?.from === SECOND_PID && sig?.signal?.type === 'offer');
  // Legacy addressing (raw cid) must still resolve — a stale client that
  // echoes socket ids must not silently lose signaling.
  const sig2Promise = joiner.waitFor((m) => m.type === 'event' && m.event === 'signal');
  await creator.send('signal', { to: joiner.cid, signal: { type: 'answer', sdp: 'v=0 fake answer' } });
  const sig2 = await sig2Promise;
  check('signal forwarded with legacy cid addressing', sig2?.from === 'pid-creator-device-00000000' && sig2?.signal?.type === 'answer');

  // relay text → TRANSFERRING. Payload must look like ciphertext (the OWASP
  // message-validation gate rejects non-base64 broadcast attempts).
  const relayPromise = joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message');
  await creator.send('relay_message', { data: 'enc:AAAA' });
  const relayed = await relayPromise;
  check('relay_message (text) forwarded', relayed?.data === 'enc:AAAA');
  // Non-ciphertext payloads (e.g. a plaintext JSON broadcast) are rejected.
  await creator.send('relay_message', { data: '{"hello":"world"}' });
  const rejected = await joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message' && m.payload?.data === '{"hello":"world"}', 300);
  check('malformed relay payload rejected', !rejected);
  // v2 chunk envelope — the app's text messages / hello / control packets all
  // travel as chunk envelopes. Keep legacy enc: coverage alongside real encryption.
  const envelope = JSON.stringify({ version: 1, type: 'chunk', transferId: '7e2b9c0a-1111-4222-8333-444455556666', sequence: 0, total: 1, payload: 'enc:QQ==' });
  const envPromise = joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message' && m.payload?.data === envelope);
  await creator.send('relay_message', { data: envelope });
  const envRelayed = await envPromise;
  check('relay_message (v2 chunk envelope) forwarded', envRelayed?.data === envelope);
  // A JSON string that only LOOKS like an envelope but carries a non-ciphertext
  // payload is still rejected (the gate keeps its teeth).
  await creator.send('relay_message', { data: JSON.stringify({ version: 1, type: 'chunk', payload: 'plaintext-not-allowed' }) });
  const envRejected = await joiner.waitFor((m) => m.type === 'event' && m.event === 'relay_message' && m.payload?.data?.includes?.('plaintext-not-allowed'), 300);
  check('envelope with non-ciphertext payload rejected', !envRejected);
  const encrypted = await encryptText('real client relay payload', await generateKey(secret));
  const encryptedEmpty = await encryptText('', await generateKey(secret));
  const wrap = payload => JSON.stringify({ version: 1, type: 'chunk', transferId: uuid(), sequence: 0, total: 1, payload });
  for (const [name, data] of [['raw encryptText output', encrypted], ['real encryptText chunk', wrap(encrypted)], ['empty encrypted message', wrap(encryptedEmpty)]]) {
    const before = joiner.inbox.length;
    await creator.send('relay_message', { data });
    check(`${name} forwarded intact`, joiner.inbox.slice(before).some(m => m.event === 'relay_message' && m.payload?.data === data));
  }
  const valid = JSON.parse(encrypted);
  const longEncrypted = await encryptText('long relay text '.repeat(20000), await generateKey(secret));
  const chunkSize = 128 * 1024;
  const total = Math.ceil(longEncrypted.length / chunkSize);
  check('real encrypted relay message spans multiple chunks', total > 2);
  const longChunks = Array.from({ length: total }, (_, sequence) => ({ version: 1, type: 'chunk', transferId: uuid(), sequence, total, payload: longEncrypted.slice(sequence * chunkSize, (sequence + 1) * chunkSize) }));
  for (const packet of longChunks) {
    const data = JSON.stringify(packet);
    const before = joiner.inbox.length;
    await creator.send('relay_message', { data });
    check(`encrypted fragment ${packet.sequence + 1}/${total} forwarded intact`, joiner.inbox.slice(before).some(m => m.event === 'relay_message' && m.payload?.data === data));
  }
  const padded = await encryptText('x'.repeat(98265), await generateKey(secret));
  check('real ciphertext padding crosses the client chunk boundary', padded[chunkSize - 1] === '=' && padded[chunkSize] === '=');
  for (let sequence = 0; sequence < 2; sequence++) {
    const data = JSON.stringify({ version: 1, type: 'chunk', transferId: uuid(), sequence, total: 2, payload: padded.slice(sequence * chunkSize, (sequence + 1) * chunkSize) });
    const before = joiner.inbox.length;
    await creator.send('relay_message', { data });
    check(`padding-split fragment ${sequence} forwarded intact`, joiner.inbox.slice(before).some(m => m.event === 'relay_message' && m.payload?.data === data));
  }
  for (const text of ['', 'x', 'xx']) {
    const ciphertext = await encryptText(text, await generateKey(secret));
    let allForwarded = true;
    for (let offset = 1; offset < ciphertext.length; offset++) {
      // A fresh wake keeps this exhaustive test independent of frame-rate limits.
      const wake = new Room(ctx, makeEnv());
      const transferId = uuid();
      for (const [sequence, payload] of [ciphertext.slice(0, offset), ciphertext.slice(offset)].entries()) {
        const data = JSON.stringify({ version: 1, type: 'chunk', transferId, sequence, total: 2, payload });
        const before = joiner.inbox.length;
        await wake.webSocketMessage(creator.server, JSON.stringify({ v: 1, event: 'relay_message', payload: { data } }));
        allForwarded &&= joiner.inbox.slice(before).some(m => m.event === 'relay_message' && m.payload?.data === data);
      }
    }
    check(`real encryptText output split at every offset (${text.length} plaintext bytes)`, allForwarded);
  }
  for (const [sequence, payload] of [[0, '{"i":"bad"'], [1, 'AAAA=AAAA'], [1, 'AAAA===' ], [1, 'AAAA"x}'], [1, 'A'.repeat(chunkSize + 1)]]) {
    const wake = new Room(ctx, makeEnv());
    const before = joiner.inbox.length;
    await wake.webSocketMessage(creator.server, JSON.stringify({ v: 1, event: 'relay_message', payload: { data: JSON.stringify({ version: 1, type: 'chunk', transferId: uuid(), sequence, total: 2, payload }) } }));
    check('invalid split ciphertext rejected', !joiner.inbox.slice(before).some(m => m.event === 'relay_message'));
  }
  for (const patch of [{ total: 1 }, { total: 1.5 }, { total: 2 ** 32 }, { sequence: -1 }, { sequence: total }, { sequence: 0.5 }, { transferId: '' }, { payload: '' }, { payload: longChunks[0].payload.slice(1) }, { payload: ' '.repeat(chunkSize) }]) {
    const before = joiner.inbox.length;
    await creator.send('relay_message', { data: JSON.stringify({ ...longChunks[0], ...patch }) });
    check('malformed encrypted fragment rejected', !joiner.inbox.slice(before).some(m => m.event === 'relay_message'));
  }
  const invalid = [
    ['empty payload', ''],
    ['malformed JSON', '{'],
    ['missing IV', JSON.stringify({ c: valid.c })],
    ['missing ciphertext', JSON.stringify({ i: valid.i })],
    ['extra field', JSON.stringify({ ...valid, plaintext: 'not allowed' })],
    ['invalid IV base64', JSON.stringify({ ...valid, i: '!'.repeat(16) })],
    ['wrong IV length', JSON.stringify({ ...valid, i: 'QUJDRA==' })],
    ['empty ciphertext', JSON.stringify({ ...valid, c: '' })],
    ['short ciphertext', JSON.stringify({ ...valid, c: 'QUJDRA==' })],
    ['invalid ciphertext base64', JSON.stringify({ ...valid, c: 'not base64!' })],
    ['noncanonical base64', JSON.stringify({ ...valid, c: 'A'.repeat(21) + 'B==' })],
    ['non-string field', JSON.stringify({ ...valid, c: 123 })],
    ['array instead of object', JSON.stringify([valid.i, valid.c])],
    ['null instead of object', ' null '],
    ['oversize payload', JSON.stringify({ ...valid, c: 'A'.repeat(512 * 1024) })],
  ];
  for (const [name, payload] of invalid) {
    for (const data of [payload, wrap(payload)]) {
      const before = joiner.inbox.length;
      await creator.send('relay_message', { data });
      check(`${name} rejected (${data === payload ? 'raw' : 'chunk'})`, !joiner.inbox.slice(before).some(m => m.event === 'relay_message'));
    }
  }
  assertState(ctx, 'TRANSFERRING');

  // relay binary
  const binPromise = new Promise((resolve) => {
    const t0 = Date.now();
    const poll = () => {
      if (joiner.binary.length) return resolve(joiner.binary.shift());
      if (Date.now() - t0 > 4000) return resolve(null);
      setTimeout(poll, 25);
    };
    poll();
  });
  const chunk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 99, 98]);
  await room.webSocketMessage(creator.server, chunk.buffer);
  const rb = await binPromise;
  check('relay_message (binary) forwarded intact', rb instanceof ArrayBuffer && new Uint8Array(rb)[21] === 98);
  const binaryIndex = joiner.frames.indexOf(rb);
  const label = JSON.parse(joiner.frames[binaryIndex - 1]);
  check('binary sender label immediately precedes unchanged legacy frame', label.event === 'relay_binary' && label.payload.from === 'pid-creator-device-00000000');
  const beforeLarge = joiner.binary.length;
  await room.webSocketMessage(creator.server, new ArrayBuffer(131120));
  await room.webSocketMessage(creator.server, new ArrayBuffer(132 * 1024));
  await room.webSocketMessage(creator.server, new ArrayBuffer(132 * 1024 + 1));
  await sleep(25);
  check('legacy full encrypted chunk and cap boundary pass; oversized binary is dropped', joiner.binary.length === beforeLarge + 2 && joiner.binary.at(-2).byteLength === 131120 && joiner.binary.at(-1).byteLength === 132 * 1024);

  // abuse control: text frames over the per-connection rate limit are dropped
  const before = joiner.inbox.length;
  for (let i = 0; i < 80; i++) await room.webSocketMessage(creator.server, JSON.stringify({ v: 1, id: `f${i}`, event: 'relay_message', payload: { data: 'enc:AAAA' } }));
  await sleep(120);
  const forwardedAfterFlood = joiner.inbox.length - before;
  check('frame flood throttled (≤60 forwarded of 80)', forwardedAfterFlood <= 61, `forwarded ${forwardedAfterFlood}`);

  // multi-device: a THIRD device joins the same room — the roster grows,
  // there is no product-level participant cap.
  const third = await connect(room, roomId);
  const thirdRes = await third.send('join_with_code', { code, pid: 'pid-third-device-00000000' });
  check('third device joins the same room (no product cap)', thirdRes.success === true && thirdRes.myParticipantId === 'pid-third-device-00000000', thirdRes.error);
  check('roster holds all three participants', (ctx.storage.map.get('room')?.participants?.length ?? 0) === 3);
  await third.send('signal', { to: 'pid-creator-device-00000000', signal: { type: 'answer', sdp: 'v=0 test' } });
  const binaryBefore = [joiner.binary.length, third.binary.length];
  await room.webSocketMessage(creator.server, chunk.buffer);
  await sleep(25);
  check('unaddressed binary reaches both peers despite unrelated targeted signal', joiner.binary.length === binaryBefore[0] + 1 && third.binary.length === binaryBefore[1] + 1);
  check('legacy raw-binary consumer receives original bytes with new Worker', new Uint8Array(third.binary.at(-1))[21] === 98);
  room.frameBuckets.clear();
  const beforeTarget = [joiner.binary.length, third.binary.length];
  const targeting = creator.send('relay_binary_target', { to: SECOND_PID });
  check('binary target is attached synchronously and survives hibernation', creator.server.deserializeAttachment()?.relayTo === SECOND_PID);
  await third.send('signal', { to: 'pid-creator-device-00000000', signal: { type: 'answer', sdp: 'v=0 interleaved' } });
  await Promise.all([targeting, new Room(ctx, makeEnv()).webSocketMessage(creator.server, chunk.buffer)]);
  check('binary target survives unrelated sender signaling; unselected peer receives no bytes', joiner.binary.length === beforeTarget[0] + 1 && third.binary.length === beforeTarget[1]);
  await creator.send('relay_binary_target', { to: 'not-a-member' });
  await room.webSocketMessage(creator.server, chunk.buffer);
  check('unknown binary recipient fails closed', joiner.binary.length === beforeTarget[0] + 1 && third.binary.length === beforeTarget[1]);
  const beforeText = [joiner.inbox.length, third.inbox.length];
  await creator.send('relay_message', { to: SECOND_PID, data: 'enc:AAAA' });
  check('targeted text reaches selected peer only', joiner.inbox.slice(beforeText[0]).some(m => m.event === 'relay_message') && !third.inbox.slice(beforeText[1]).some(m => m.event === 'relay_message'));
  await creator.send('relay_message', { to: 'not-a-member', data: 'enc:AAAA' });
  check('unknown text recipient fails closed', !third.inbox.slice(beforeText[1]).some(m => m.event === 'relay_message'));
  await room.webSocketMessage(creator.server, chunk.buffer);
  check('binary hint is one-shot; legacy broadcast still reaches all peers', joiner.binary.length === beforeTarget[0] + 2 && third.binary.length === beforeTarget[1] + 1);
  room.frameBuckets.clear();
  const beforeBurst = joiner.binary.length;
  const burstStart = Date.now();
  const burstFrames = [new ArrayBuffer(61476), new ArrayBuffer(61476), new ArrayBuffer(8256)];
  for (let i = 0; i < 720; i++) {
    await creator.send('relay_binary_target', { to: SECOND_PID });
    await room.webSocketMessage(creator.server, burstFrames[i % 3]);
  }
  check('30 MiB relay burst: 720 hinted fragments pass within one quota window', Date.now() - burstStart < 10000 && joiner.binary.length === beforeBurst + 720, `${joiner.binary.length - beforeBurst}/720`);
  check('paired target hints do not double-charge binary quota', room.frameBuckets.get(creator.cid)?.binCount === 720);
  for (let i = 0; i < 80; i++) await creator.send('relay_binary_target', { to: SECOND_PID });
  check('unpaired target hint flood is still metered', room.frameBuckets.get(creator.cid)?.binCount === 799);
  creator.server.serializeAttachment(null);
  room.frameBuckets.clear();
  // A FORGED roster claim — reusing another device's pid — is just a seat
  // reclaim (the room secret gates every action): the roster must not grow.
  const fourth = await connect(room, roomId);
  const fourthRes = await fourth.send('join_with_code', { code, pid: 'pid-third-device-00000000' });
  check('reused pid reclaims the seat (roster stays 3)', fourthRes.success === true && (ctx.storage.map.get('room')?.participants?.length ?? 0) === 3);
  third.close();
  fourth.close();

  // wrong code → INVALID_CODE; then brute-force → RATE_LIMITED
  const wrongCode = await connect(room, roomId);
  const bad = await wrongCode.send('join_with_code', { code: '000000' });
  check('wrong code → INVALID_CODE', bad.success === false && bad.code === 'INVALID_CODE', bad.error);
  let limited = null;
  for (let i = 0; i < 11; i++) {
    limited = await wrongCode.send('join_with_code', { code: '000000' });
  }
  check('brute-force limit → RATE_LIMITED', limited.success === false && limited.code === 'RATE_LIMITED', limited.error);
  wrongCode.close();

  // disconnect joiner → 60s disconnect grace: the seat is HELD (no scary
  // "disconnected" banner for a tab refresh or a network blip)
  const discPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'peer_disconnected', 400);
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  const early = await discPromise;
  check('no immediate peer_disconnected during grace', !early);
  // TRANSFERRING is a transient relay-activity marker — any join/resume
  // recompute from the live roster lands back on CONNECTED.
  assertState(ctx, 'CONNECTED');

  // resume with the same pid within the grace window → seat reclaimed
  // silently (peer_recovered, not peer_joined)
  const preSt = ctx.storage.map.get('room');
  console.log('  [dbg] pre-resume: members', preSt.participants?.length, 'grace keys', preSt.grace ? Object.keys(preSt.grace).length : 0);
  const rejoiner = await connect(room, roomId, joinerCid);
  const resumed = await rejoiner.send('resume_room', { roomId, secret, pid: SECOND_PID });
  check('resume_room ack', resumed.success === true);
  const recovered = await creator.waitFor((m) => m.type === 'event' && m.event === 'peer_recovered');
  check('creator sees peer_recovered (stable participant id)', recovered?.peerId === SECOND_PID);
  assertState(ctx, 'CONNECTED');
  check('seat reclaimed by the same participant id', ctx.storage.map.get('room')?.participants?.some((p) => p.pid === SECOND_PID && p.cid === rejoiner.cid));
  // waitFor re-scans the whole inbox — the initial peer_joined is still in
  // it, so look only at messages received AFTER the peer_recovered event.
  const recoveredIdx = creator.inbox.findIndex((m) => m.type === 'event' && m.event === 'peer_recovered');
  const noJoinNoise = creator.inbox.slice(recoveredIdx + 1).find((m) => m.type === 'event' && m.event === 'peer_joined');
  check('recovery does not emit a redundant peer_joined', !noJoinNoise);

  // A device WITHOUT the room secret cannot enter — grace or not, the
  // secret is the credential (there is no seat to "steal": membership is
  // pid-keyed, and the roster guard is the only cap).
  const intruder = await connect(room, roomId);
  const intruderRes = await intruder.send('resume_room', { roomId, secret: 'WRONG-SECRET-WRONG-SECRET-1' });
  check('stranger cannot enter without the secret', intruderRes.success === false, intruderRes.error);
  intruder.close();

  // manual close → room_closed to both; storage cleared
  const closeA = creator.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const closeB = rejoiner.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  await rejoiner.send('close_room');
  const [ca, cb] = [await closeA, await closeB];
  check('creator got room_closed', ca?.reason === 'manual_close');
  check('rejoiner got room_closed', cb?.reason === 'manual_close');
  check('storage cleared after close', ctx.storage.map.size === 0);

  // closed room rejects a fresh join
  const late = await connect(room, roomId);
  const lateRes = await late.send('join_with_code', { code });
  check('closed room rejects joins', lateRes.success === false, lateRes.error);
  late.close();
}

async function runRefreshCode() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const beforeAnchor = created.createdAt;

  const refreshed = await creator.send('refresh_code', { roomId, secret: created.secret });
  check('refresh_code ack', refreshed.success === true && typeof refreshed.createdAt === 'number');
  check('refresh_code re-anchors to a later time', refreshed.createdAt >= beforeAnchor);

  // The new anchor produces a fresh window; the OLD code is still accepted
  // within the ±1 validation grace, so a joiner mid-typing isn't cut off.
  const newCode = codeFor(created.secret, refreshed.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code: newCode });
  check('fresh code joins after refresh_code', joined.success === true, joined.error);
  const oldCode = codeFor(created.secret, beforeAnchor);
  if (oldCode !== newCode) {
    const graceJoiner = await connect(room, roomId);
    const joinedOld = await graceJoiner.send('join_with_code', { code: oldCode });
    check('old code still joins within the ±1 grace window', joinedOld.success === true, joinedOld.error);
    graceJoiner.close();
  } else {
    check('old code still joins within the ±1 grace window', true, 'same TOTP window — value identical');
  }
  joiner.close();
  creator.close();
}

async function runLiveIdleExpiry() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const code = codeFor(created.secret, created.createdAt);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code });
  if (!joined.success) { check('expiry: join', false, joined.error); return; }
  assertState(ctx, 'CONNECTED');

  // Simulate the idle TTL elapsing, then fire the alarm on a fresh instance.
  ctx.storage.map.set('room', { ...ctx.storage.map.get('room'), lastActive: Date.now() - ROOM_TTL - 1000 });
  const closeA = creator.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const closeB = joiner.waitFor((m) => m.type === 'event' && m.event === 'room_closed');
  const fresh = new Room(ctx, makeEnv());
  await fresh.alarm();
  const [ca, cb] = [await closeA, await closeB];
  check('live idle-timeout → room_closed(idle_timeout)', ca?.reason === 'idle_timeout' && cb?.reason === 'idle_timeout');
  check('expired room storage cleared', ctx.storage.map.size === 0);
}

async function runDisconnectedState() {
  const SECOND_PID = 'pid-second-device-00000000';
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const a = await connect(room, roomId);
  const created = await a.send('create_room', { pid: 'pid-creator-device-00000000' });
  const joiner = await connect(room, roomId);
  await joiner.send('join_with_code', { code: codeFor(created.secret, created.createdAt), pid: SECOND_PID });
  assertState(ctx, 'CONNECTED');

  // Grace: a closed seat is HELD for 60s (tab refresh / network blip must not
  // look like a disconnect), so the state stays CONNECTED after each close.
  a.client.close(1000, 'test');
  await room.webSocketClose(a.server);
  assertState(ctx, 'CONNECTED');
  check('creator seat grace-held', (ctx.storage.map.get('room')?.grace?.['pid-creator-device-00000000'] ?? 0) > Date.now());
  joiner.client.close(1000, 'test');
  await room.webSocketClose(joiner.server);
  assertState(ctx, 'CONNECTED');

  // Expire both grace deadlines → alarm confirms the evictions.
  const st = ctx.storage.map.get('room');
  ctx.storage.map.set('room', { ...st, grace: Object.fromEntries(Object.entries(st.grace ?? {}).map(([k, v]) => [k, Date.now() - 10])) });
  const fresh = new Room(ctx, makeEnv());
  await fresh.alarm();
  assertState(ctx, 'DISCONNECTED');
  check('evicted seats cleared', (ctx.storage.map.get('room')?.participants?.length ?? 1) === 0 && !ctx.storage.map.get('room')?.grace);

  // Empty room expires via alarm (no peers to notify) once past its TTL.
  // A fresh instance reads the back-dated state from storage — the cached
  // `fresh` object still holds the pre-eviction room in memory.
  ctx.storage.map.set('room', { ...ctx.storage.map.get('room'), lastActive: Date.now() - ROOM_TTL - 1000 });
  const fresh2 = new Room(ctx, makeEnv());
  await fresh2.alarm();
  check('empty room storage cleared by alarm', ctx.storage.map.size === 0);
}

async function runGraceHeartbeat() {
  const ctx = new FakeCtx();
  const roomId = uuid();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room', { pid: 'creator-device' });
  const survivor = await connect(room, roomId);
  await survivor.send('join_with_code', { code: codeFor(created.secret, created.createdAt), pid: 'survivor' });
  creator.client.close();
  await room.webSocketClose(creator.server);
  const deadline = ctx.storage.map.get('room').grace['creator-device'];
  const now = Date.now;
  try {
    Date.now = () => deadline - 1000;
    await survivor.send('resume_room', { roomId, secret: created.secret, pid: 'survivor' });
    const alarm = await ctx.storage.getAlarm();
    check('heartbeat preserves pending disconnect grace alarm', Number.isFinite(deadline) && alarm !== null && alarm <= deadline);
    Date.now = () => deadline + 1;
    await room.alarm();
    check('departed device evicted at grace deadline after heartbeat', ctx.storage.map.get('room').participants.length === 1 && ctx.storage.map.get('room').participants[0].pid === 'survivor');
  } finally {
    Date.now = now;
  }
}

async function runGraceReclaim() {
  const ctx = new FakeCtx();
  const roomId = uuid();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room', { pid: 'creator-device' });
  creator.client.close();
  await room.webSocketClose(creator.server);
  const deadline = ctx.storage.map.get('room').grace['creator-device'];
  const returning = await connect(room, roomId);
  check('grace reclaim uses a fresh cid', returning.cid !== creator.cid);
  const denied = await returning.send('resume_room', { roomId, secret: 'wrong-secret', pid: 'creator-device' });
  check('unauthorized resume preserves pending grace', !denied.success && ctx.storage.map.get('room').grace['creator-device'] === deadline);
  const resumed = await returning.send('resume_room', { roomId, secret: created.secret, pid: 'creator-device' });
  check('fresh cid resume cancels its seat grace', resumed.success && !ctx.storage.map.get('room').grace?.['creator-device']);
  const joiner = await connect(room, roomId);
  const joined = await joiner.send('join_with_code', { code: codeFor(created.secret, created.createdAt), pid: 'next-device' });
  check('next device pairs within reclaimed creator grace', joined.success);
  const now = Date.now;
  try {
    Date.now = () => deadline + 1;
    await room.alarm();
    check('old grace alarm keeps both reclaimed seats', ctx.storage.map.get('room').participants.length === 2);
    check('old grace alarm emits no disconnect after reclaim', [returning, joiner].every(peer => !peer.inbox.some(m => m.event === 'peer_disconnected')));
    const data = await encryptText('after reclaimed grace', await generateKey(created.secret));
    for (const [sender, receiver] of [[returning, joiner], [joiner, returning]]) {
      const before = receiver.inbox.length;
      await sender.send('relay_message', { data });
      check('reclaimed seat relays ciphertext after old grace', receiver.inbox.slice(before).some(m => m.event === 'relay_message' && m.payload?.data === data));
    }
  } finally {
    Date.now = now;
    returning.close();
    joiner.close();
  }
}

async function runConnectionReclaims() {
  const ctx = new FakeCtx();
  const roomId = uuid();
  const room = new Room(ctx, makeEnv());
  let current = await connect(room, roomId);
  const created = await current.send('create_room', { pid: 'creator-device' });
  let resumed = true;
  for (let i = 0; i < 12; i++) {
    current.client.close();
    await room.webSocketClose(current.server);
    current = await connect(room, roomId);
    const result = await current.send('resume_room', { roomId, secret: created.secret, pid: 'creator-device' });
    resumed &&= result.success === true;
  }
  check('twelve Worker fresh-cid reclaims succeed', resumed);
  check('Worker reclaim connection cache stays bounded', room.conns.size === 1);
  check('Worker reclaim durable connection records stay bounded', (await ctx.storage.list({ prefix: 'conn:' })).size === 1);
  current.close();
}

// Stay Connected: room-wide promise flips, BOTH peers get the echo, the
// state persists, and a non-member cannot flip someone else's room.
async function runStayConnected() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  await creator.send('create_room');
  const secret = ctx.storage.map.get('room').secret;
  const joiner = await connect(room, roomId);
  const codeRes = await creator.send('refresh_code', { roomId, secret });
  const code = codeFor(secret, ctx.storage.map.get('room').codeAnchor);
  const joined = await joiner.send('join_with_code', { code });
  check('stay: joiner seated', joined.success === true);

  const echoC = creator.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state');
  const echoJ = joiner.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state');
  const ack = await joiner.send('stay_connected_enable');
  const [ec, ej] = [await echoC, await echoJ];
  check('stay: enable acked', ack.success === true && ack.enabled === true, JSON.stringify(ack));
  check('stay: creator echoed enabled', ec?.enabled === true);
  check('stay: joiner echoed enabled', ej?.enabled === true);
  check('stay: persisted on room state', ctx.storage.map.get('room')?.stayConnected === true);

  const offC = creator.waitFor((m) => m.type === 'event' && m.event === 'stay_connected_state' && m.payload?.enabled === false);
  await joiner.send('stay_connected_disable');
  check('stay: disable echoed', (await offC)?.enabled === false);
  check('stay: disabled persisted', ctx.storage.map.get('room')?.stayConnected === false);

  // A socket that never joined cannot flip the room's promise.
  const stranger = await connect(room, roomId);
  const denied = await stranger.send('stay_connected_enable');
  check('stay: non-member rejected', denied.success === false, denied.error);
  stranger.close();
  creator.close();
  joiner.close();
}

// Stay Connected must outlive BOTH devices going away — that is the promise's
// entire point. The empty room keeps accepting a remembered member (or a
// fresh device holding the secret when no snapshot exists), never a stranger;
// only a member can close it in that phase.
async function runStayEmptySurvival() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;
  const joiner = await connect(room, roomId);
  const codeRes = await creator.send('refresh_code', { roomId, secret });
  const code = codeFor(secret, ctx.storage.map.get('room').codeAnchor);
  const joined = await joiner.send('join_with_code', { code });
  check('stay-empty: joiner seated', joined.success === true);
  await joiner.send('stay_connected_enable');

  // Both devices go away (the exact "closed both tabs" case).
  creator.close();
  joiner.close();
  await sleep(50);
  check('stay-empty: room survives both tabs closing', ctx.storage.map.get('room') != null);

  // A stranger (no secret knowledge, fresh cid) must NOT get the empty seat.
  const stranger = await connect(room, roomId);
  const strangerJoin = await stranger.send('resume_room', { roomId, secret: 'wrong-secret-xxxxxxxxxxxxxxx' });
  check('stay-empty: stranger rejected with bad secret', strangerJoin.success === false, strangerJoin.error);
  stranger.close();

  // The creator returns with the right secret — recognized via the persisted
  // membership snapshot even though its seat was freed.
  const returning = await connect(room, roomId);
  const resumed = await returning.send('resume_room', { roomId, secret });
  check('stay-empty: member re-enters empty room', resumed.success === true, resumed.error || '');
  check('stay-empty: promise still on', resumed.stayConnected === true);

  // A socket that never joined (fresh cid, no seat, no membership) cannot
  // close someone else's promise room even by sending close_room directly.
  const outside = await connect(room, roomId);
  await outside.send('close_room');
  check('stay-empty: outsider close did not destroy room', ctx.storage.map.get('room') != null);
  outside.close();

  // The member who IS part of the room can end it for everyone.
  await returning.send('close_room');
  check('stay-empty: member close ends the room', ctx.storage.map.get('room') == null);
  returning.close();
}

// Regression for the "rejoin doesn't always work" bug: a device whose
// connection id CHANGED (every real reconnect after the old socket dies)
// must be able to re-enter a room it holds the secret for — stay promise or
// not. The 128-bit secret is the room's credential; the old snapshot gate
// wrongly demanded a remembered cid and answered ROOM_FULL instead.
async function runFreshCidRejoin() {
  // Non-stay room: creator seats, both sockets die (seats freed), a brand-new
  // cid presents the correct secret — must be let back in, not ROOM_FULL.
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;
  creator.close();
  await sleep(50);
  check('rejoin: room survives creator leaving', ctx.storage.map.get('room') != null);
  const fresh = await connect(room, roomId);
  const resumed = await fresh.send('resume_room', { roomId, secret });
  check('rejoin: fresh cid + correct secret enters empty room', resumed.success === true, resumed.error || '');
  check('rejoin: room seated again', (ctx.storage.map.get('room')?.participants?.length ?? 0) >= 1);
  // ...and the security half: a WRONG secret still gets nothing.
  const intruder = await connect(room, roomId);
  const denied = await intruder.send('resume_room', { roomId, secret: 'WRONG-SECRET-WRONG-SECRET-1' });
  check('rejoin: wrong secret still rejected', denied.success === false, denied.error);
  intruder.close();
  await fresh.send('close_room');
  fresh.close();
}

async function runPush() {
  const roomId = uuid();
  const ctx = new FakeCtx();
  const room = new Room(ctx, makeEnv());
  const creator = await connect(room, roomId);
  const created = await creator.send('create_room');
  const secret = created.secret;

  // Unauthenticated / wrong-secret push → 401.
  const noAuth = await room.fetch(new Request('http://x/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId, text: 'hi' }) }));
  check('push without secret → 401', noAuth.status === 401);
  const badAuth = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer WRONG' },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  check('push with wrong secret → 401', badAuth.status === 401);

  // Text push → creator receives push_message(kind=text).
  const textPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'push_message');
  const textRes = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'Hello from an agent' }),
  }));
  check('text push → 200', textRes.status === 200);
  const textMsg = await textPromise;
  check('creator receives push_message text', textMsg?.kind === 'text' && textMsg?.text === 'Hello from an agent', textMsg?.text);

  // File push (multi-chunk) → creator receives every chunk intact, in order.
  const fileBytes = Buffer.from('\x00\x01 payload '.repeat(50) + '\xff\xfe', 'utf8'); // ~700 bytes → 1 chunk
  const big = Buffer.alloc(90 * 1024, 7); // 90KB → 2 chunks (45KB each)
  big.set(fileBytes, 0);
  const b64 = big.toString('base64');
  const chunkPromise = creator.waitFor((m) => m.type === 'event' && m.event === 'push_message' && m.payload?.kind === 'file' && m.payload?.chunkIndex === 1, 6000);
  const fileRes = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, name: 'payload.bin', mimeType: 'application/octet-stream', dataBase64: b64 }),
  }));
  check('file push → 200', fileRes.status === 200);
  const lastChunk = await chunkPromise;
  check('file push chunked (2 chunks)', lastChunk?.chunkCount === 2, `count ${lastChunk?.chunkCount}`);
  const fileEvents = creator.inbox.filter((m) => m.type === 'event' && m.event === 'push_message' && m.payload?.kind === 'file' && m.payload?.id === lastChunk?.id);
  const joined = Buffer.concat(fileEvents.map((e) => Buffer.from(e.payload.dataBase64, 'base64')));
  check('file push reassembles byte-identical', joined.length === big.length && joined.equals(big), `${joined.length} bytes`);

  // Push to a closed/missing room → 404.
  const gone = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  await creator.send('close_room');
  const afterClose = await room.fetch(new Request('http://x/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify({ roomId, text: 'hi' }),
  }));
  check('push before close ok, after close → 404', gone.status === 200 && afterClose.status === 404);
  creator.close();
}

async function runRegistry() {
  const ctx = new FakeCtx();
  const reg = new Registry(ctx, {});
  const roomId = uuid();
  const secret = 'AABBCCDDEEFFGGHHJJKKLLMMNNOOPPQQ';
  const createdAt = Date.now();
  await reg.fetch(new Request('http://x/register', { method: 'POST', body: JSON.stringify({ roomId, secret, createdAt, expiresAt: Date.now() + 3600e3 }) }));
  const code = codeFor(secret, createdAt);
  const ok = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code }) }));
  const found = await ok.json();
  check('registry lookup finds room by code', ok.status === 200 && found.roomId === roomId);
  const miss = await reg.fetch(new Request('http://x/lookup', { method: 'POST', body: JSON.stringify({ code: '000000' }) }));
  check('registry rejects a wrong code', miss.status === 404);

  // Stable short-code share links: /s/<8 chars> resolves to full credentials.
  const shortCode = roomId.replace(/-/g, '').slice(0, 8);
  const short = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: shortCode }) }));
  const shortFound = await short.json();
  check('registry resolves a short share code to the room', short.status === 200 && shortFound.roomId === roomId && shortFound.secret === secret && shortFound.createdAt === createdAt);
  const shortMiss = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: 'deadbeef' }) }));
  check('registry rejects an unknown short code', shortMiss.status === 404);
  const shortBad = await reg.fetch(new Request('http://x/resolve-short', { method: 'POST', body: JSON.stringify({ code: 'not-a-code' }) }));
  check('registry rejects a malformed short code', shortBad.status === 404);

  // Edge-side abuse protection: the per-IP sliding window (lookup limit is
  // 20/60s in RATE_LIMITS) must 429 once exhausted and reset on the next
  // window. Shared networks aren't broken because real deployments always
  // present a client IP; unknown/absent IPs are deliberately not limited.
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const r = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: '203.0.113.7', scope: 'lookup' }) }));
    const out = await r.json();
    if (!out.ok) limited = true;
  }
  check('rate limit 429s after 20 lookups from one IP', limited);
  const fresh = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: '203.0.113.8', scope: 'lookup' }) }));
  check('rate limit is per-IP (fresh IP allowed)', (await fresh.json()).ok === true);
  const unknown = await reg.fetch(new Request('http://x/rate-check', { method: 'POST', body: JSON.stringify({ ip: 'unknown', scope: 'lookup' }) }));
  check('rate limit skips unknown IPs (dev/test)', (await unknown.json()).ok === true);

  // Leases come out of the same counter: however they are split, one IP
  // never gets more than the limit per window.
  let granted = 0;
  for (let i = 0; i < 10; i++) {
    const r = await reg.fetch(new Request('http://x/rate-lease', { method: 'POST', body: JSON.stringify({ ip: '203.0.113.9', scope: 'lookup', want: 99 }) }));
    const out = await r.json();
    granted += out.granted;
    if (i === 0) check('rate lease grants a share and a reset time', out.granted === 4 && out.resetAt > Date.now(), JSON.stringify(out));
  }
  check('rate leases never exceed the per-window limit', granted === 20, `got ${granted}`);
}

/** The router spends leased attempts locally: the 21st lookup from one IP
 *  still 429s, and the Registry is asked far less than once per request. */
async function runRateLease() {
  const registry = new Registry(new FakeCtx(), {});
  let leaseCalls = 0;
  const env = {
    REGISTRY: { idFromName: name => name, get: () => ({ fetch: (req) => {
      if (new URL(req.url).pathname === '/rate-lease') leaseCalls++;
      return registry.fetch(req);
    } }) },
  };
  const statuses = [];
  for (let i = 0; i < 30; i++) {
    const res = await worker.fetch(new Request('https://worker.test/lookup', {
      method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.20', 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    }), env);
    statuses.push(res.status);
  }
  const limited = statuses.filter((st) => st === 429).length;
  check('router allows exactly 20 lookups per IP per window, then 429s', limited === 10 && statuses.slice(0, 20).every((st) => st !== 429), statuses.join(','));
  check('router leases attempts instead of one Registry call per request', leaseCalls <= 10, `got ${leaseCalls}`);
  const other = await worker.fetch(new Request('https://worker.test/lookup', {
    method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.21', 'content-type': 'application/json' },
    body: JSON.stringify({ code: '123456' }),
  }), env);
  check('router rate limit stays per-IP', other.status !== 429, `got ${other.status}`);
}

/** Leases are per isolate and Cloudflare may spread one visitor's requests
 *  over several. A visitor whose requests scatter must not be refused before
 *  they have made at least half the limit, and across isolates the total
 *  allowed per window must never pass the limit. */
async function runRateLeaseIsolates() {
  const isolates = [];
  for (let i = 0; i < 8; i++) {
    isolates.push((await import(pathToFileURL(path.join(tmp, 'index.js')).href + cacheBust + '&isolate=' + i)).default);
  }
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let earliestRefusal = Infinity;
  let maxAllowed = 0;
  for (let trial = 0; trial < 60; trial++) {
    const registry = new Registry(new FakeCtx(), {});
    const env = { REGISTRY: { idFromName: name => name, get: () => registry } };
    const spread = 2 + (trial % 7);
    const ip = '198.51.100.' + (100 + trial);
    let allowed = 0;
    for (let i = 0; i < 40; i++) {
      const res = await isolates[rand(spread)].fetch(new Request('https://worker.test/lookup', {
        method: 'POST', headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
        body: JSON.stringify({ code: '123456' }),
      }), env);
      if (res.status === 429) earliestRefusal = Math.min(earliestRefusal, i);
      else allowed++;
    }
    maxAllowed = Math.max(maxAllowed, allowed);
  }
  check('a visitor spread over 2-8 isolates is never refused before half the limit', earliestRefusal >= 10, `first 429 at attempt ${earliestRefusal + 1}`);
  check('across isolates one IP never gets more than the limit', maxAllowed <= 20, `got ${maxAllowed}`);

  // An ordinary visit: make a room, join one, a couple of retries, every
  // request on a different isolate. Nothing is refused.
  const registry = new Registry(new FakeCtx(), {});
  const env = { REGISTRY: { idFromName: name => name, get: () => registry } };
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const res = await isolates[i].fetch(new Request('https://worker.test/lookup', {
      method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.250', 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    }), env);
    statuses.push(res.status);
  }
  check('an ordinary visit across 8 isolates is never refused', statuses.every((st) => st !== 429), statuses.join(','));
}

/**
 * The landing-page "rooms made" tracker counts real connections and nothing
 * else. It used to be floored at 113 — an invented number that made a fresh
 * deployment look busy. The floor is gone: a wiped counter reports 0, and the
 * only guarantee is that it grows by exactly one per counted room while the
 * storage survives.
 *
 * SEMANTICS: rooms.created is fired by Room.recomputeState when a room FIRST
 * holds two live peers — a real two-device connection — never at room
 * creation. These tests exercise the Metrics DO contract directly; the
 * Room-side "counted once per room" behavior is covered by the recomputeState
 * flag, verified in the room-flow test.
 */
async function runMetrics() {
  const metrics = new Metrics(new FakeCtx(), {});
  const post = (name) => metrics.fetch(new Request('http://x/event', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }));

  // First rooms.created on FRESH storage counts 1 — no seed, no floor.
  await post('rooms.created');
  let snap = await (await metrics.fetch(new Request('http://x/metrics'))).json();
  check('fresh storage counts the first room as 1', snap.lifetime_rooms_created === 1, `got ${snap.lifetime_rooms_created}`);

  // Each subsequent room grows it by exactly one.
  await post('rooms.created');
  await post('rooms.created');
  snap = await (await metrics.fetch(new Request('http://x/metrics'))).json();
  check('lifetime rooms counter grows monotonically', snap.lifetime_rooms_created === 3, `got ${snap.lifetime_rooms_created}`);

  // A metrics DO reset (redeploy/eviction) reports the truth: zero, not a
  // floor. The UI hides the number below 10, so an honest zero is invisible
  // rather than embarrassing.
  const fresh = new Metrics(new FakeCtx(), {});
  snap = await (await fresh.fetch(new Request('http://x/metrics'))).json();
  check('storage reset reports 0 (no invented floor)', snap.lifetime_rooms_created === 0, `got ${snap.lifetime_rooms_created}`);

  // A long run stays exact — no offset, no drift.
  const ahead = new Metrics(new FakeCtx(), {});
  for (let i = 0; i < 40; i++) await ahead.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ name: 'rooms.created' }) }));
  snap = await (await ahead.fetch(new Request('http://x/metrics'))).json();
  check('40 rooms counts exactly 40', snap.lifetime_rooms_created === 40, `got ${snap.lifetime_rooms_created}`);

  // Other metric names never touch the lifetime counter.
  const other = new Metrics(new FakeCtx(), {});
  await other.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ name: 'joins.succeeded' }) }));
  snap = await (await other.fetch(new Request('http://x/metrics'))).json();
  check('non-room metrics do not inflate the rooms counter', snap.lifetime_rooms_created === 0, `got ${snap.lifetime_rooms_created}`);

  // Rooms flush buffered counters as one batch.
  const batch = new Metrics(new FakeCtx(), {});
  const okBatch = await batch.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ counts: { 'rooms.created': 2, 'relay.binary_messages': 5 } }) }));
  snap = await (await batch.fetch(new Request('http://x/metrics'))).json();
  check('a batch adds every count once', okBatch.status === 200 && snap.lifetime_rooms_created === 2 && snap.totals['relay.binary_messages'] === 5, JSON.stringify(snap.totals));
  const badBatch = await batch.fetch(new Request('http://x/event', { method: 'POST', body: JSON.stringify({ counts: { 'rooms.created': -3 } }) }));
  check('a batch with a bad count is rejected whole', badBatch.status === 400);
}

// ── Temporary Space (F14) DO ──────────────────────────────────────────────
// Drives the REAL Space DO under the shim: create/join auth, per-device
// membership, text items, delete/close permissions, 410-on-valid-cred after
// close, and alarm-driven reminder + expiry + cleanup phases.
async function runSpace() {
  console.log('\n── Temporary Space DO ──');
  const uuid = () => crypto.randomUUID();
  const shaHex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const bearer = (t) => ({ authorization: `Bearer ${t}`, 'x-device-key': 'wk' + t.slice(0, 4), 'x-device-name': 'W ' + t.slice(0, 3) });

  // F21: create/join-code reach the Registry singleton for the space-code
  // index. Bind a REAL Registry DO (its own FakeCtx storage) through a
  // minimal stub of the binding API, so the harness exercises the same
  // register → lookup → unregister path production uses.
  const regDo = new Registry(new FakeCtx(), {});
  const REGISTRY = { idFromName: (n) => n, get: () => ({ fetch: (req) => regDo.fetch(req) }) };
  const env = { SPACE_TEST_CLOCK: '1', REGISTRY };
  const sid = uuid();
  const doFetch = (p, init) => space.fetch(new Request('https://internal/space/' + sid + p, init));
  const mk = () => new Space(new FakeCtx(), env);

  let space = mk();
  const now0 = Date.now();
  const H = (n) => new Request('https://internal/space/' + sid + '/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': 'wk' },
    body: JSON.stringify({ durationMs: 6 * 3600_000 }),
  });

  // create
  const cr = await space.fetch(H());
  const crj = await cr.json();
  check('DO create returns token + manageKey', cr.status === 200 && !!crj.token && !!crj.manageKey);
  const dur = 6 * 3600_000;
  check('DO expiry = now + duration (absolute)', crj.expiresAt - crj.createdAt === dur);
  check('DO 6h reminder = 5h after create', Math.round((crj.reminderAt - crj.createdAt) / 3.6e6) === 5);
  const reCr = await space.fetch(H());
  check('DO re-create is 409', reCr.status === 409);

  const T = crj.token, M = crj.manageKey;
  const join = (t) => space.fetch(new Request('https://internal/space/' + sid + '/join', { method: 'POST', headers: { ...bearer(t), 'content-type': 'application/json' }, body: '{}' }));
  const creatorJoin = await join(M);
  const creatorJ = await creatorJoin.json();
  check('DO creator joins once (manage key authorizes, token registers)', creatorJ.memberCount === 1, String(creatorJ.memberCount));
  const d1 = await join(T);
  const d1j = await d1.json();
  check('DO second device joins with own pid', d1j.memberCount === 2 && d1j.participantId !== creatorJ.participantId);

  // text item
  const addT = await space.fetch(new Request('https://internal/space/' + sid + '/items/text', { method: 'POST', headers: { ...bearer(T), 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hello from the DO' }) }));
  const addTj = await addT.json();
  check('DO text item READY with attribution', addT.status === 200 && addTj.item.state === 'READY' && addTj.item.addedByName.startsWith('W '));

  // delete permissions
  const delOther = await space.fetch(new Request('https://internal/space/' + sid + '/items/' + addTj.item.id, { method: 'DELETE', headers: bearer(M) }));
  check('DO creator removes any item', delOther.status === 200);

  // close + 410 shape
  const memberClose = await space.fetch(new Request('https://internal/space/' + sid + '/close', { method: 'POST', headers: { ...bearer(T), 'content-type': 'application/json' }, body: '{}' }));
  check('DO member cannot close', memberClose.status === 403);
  const closeRes = await space.fetch(new Request('https://internal/space/' + sid + '/close', { method: 'POST', headers: { ...bearer(M), 'content-type': 'application/json' }, body: '{}' }));
  check('DO creator closes early', closeRes.status === 200);
  const joinClosed = await join(T);
  const joinClosedJ = await joinClosed.json();
  check('DO join after close is 410 {closed}', joinClosed.status === 410 && joinClosedJ.closed === true);

  // expiry via test clock: create, then read with a future x-space-test-now
  const sid2 = uuid();
  const s2 = new Space(new FakeCtx(), { SPACE_TEST_CLOCK: '1', REGISTRY });
  const cr2 = await s2.fetch(new Request('https://internal/space/' + sid2 + '/create', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': 'wk' }, body: JSON.stringify({ durationMs: 6 * 3600_000 }) }));
  const cr2j = await cr2.json();
  const future = cr2j.expiresAt + 1000;
  const late = await s2.fetch(new Request('https://internal/space/' + sid2 + '/info', { headers: { ...bearer(cr2j.token), 'x-space-test-now': String(future) } }));
  check('DO test clock pushes space past expiry (410)', late.status === 410);
  // Cleanup phase: the alarm fires in REAL time (by design), so drive the
  // already-EXPIRED space (closed early above) through its cleanup alarm.
  await space.ctx.storage.setAlarm(Date.now() + 1);
  await space.alarm(); // Phase 3: state EXPIRED → runCleanup → deleteAll
  const afterClean = await join(T);
  check('DO cleanup wipes state after expiry', afterClean.status === 401 || afterClean.status === 404, String(afterClean.status));

  // alarm phase math on the live space: reminder set at create
  check('DO alarm scheduled at reminder time', (await space.ctx.storage.getAlarm()) !== null);
  void SPACE_TTL_CAP;
}

async function runSpaceHibernation() {
  const ctx = new FakeCtx();
  const registry = new Registry(new FakeCtx(), {});
  const env = { REGISTRY: { idFromName: name => name, get: () => ({ fetch: request => registry.fetch(request) }) } };
  let space = new Space(ctx, env);
  const sid = uuid();
  const request = (path, method, credential, body) => space.fetch(new Request(`https://internal/space/${sid}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-device-key': 'creator', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const { token, manageKey } = await (await request('/create', 'POST', null, { durationMs: 6 * 3600_000 })).json();
  const open = async (name, authorized = true) => {
    await space.fetch(new Request(`https://internal/space-ws?space=${sid}`, { headers: { Upgrade: 'websocket' } }));
    const { client, server } = lastPair;
    const frames = [];
    client.onmessage = event => frames.push(JSON.parse(event.data));
    if (authorized) await space.webSocketMessage(server, JSON.stringify({ v: 1, event: 'join_space', payload: { token, name, deviceKey: name } }));
    return { client, server, frames };
  };
  const a = await open('creator');
  const b = await open('joiner');
  const unauthorized = await open('unauthorized', false);
  const legacy = await open('legacy', false);
  legacy.server.serializeAttachment(null);
  const both = (event, predicate = () => true) => [a, b].every(peer => peer.frames.some(frame => frame.event === event && predicate(frame.payload)));
  check('Space sockets authorize and receive initial sync', both('space_sync'));
  const immediate = await (await request('/items/text', 'POST', token, { text: 'before hibernation' })).json();
  check('Space broadcasts before hibernation', both('item_added', payload => payload.item.id === immediate.item.id));

  space = new Space(ctx, env);
  const added = await request('/items/text', 'POST', token, { text: 'after hibernation' });
  const { item } = await added.json();
  check('Space REST wake persists the item', added.status === 200);
  check('Space REST wake broadcasts item_added to both original sockets', both('item_added', payload => payload.item.id === item.id));
  check('Space wake never authorizes an unjoined socket', unauthorized.frames.length === 0);
  check('Space legacy socket is asked to reauthorize without receiving content', legacy.frames.length === 1 && legacy.frames[0].event === 'space_auth_failed');
  check('Space socket attachments contain no raw credential', [a, b].every(peer => !JSON.stringify(peer.server.deserializeAttachment()).includes(token)));

  space = new Space(ctx, env);
  await space.webSocketMessage(b.server, JSON.stringify({ v: 1, event: 'heartbeat' }));
  check('Space WebSocket wake retains authorization without join_space', b.frames.some(frame => frame.event === 'heartbeat_ack'));
  await space.webSocketMessage(legacy.server, JSON.stringify({ v: 1, event: 'join_space', payload: { token, deviceKey: 'legacy' } }));
  check('Space legacy socket can reauthorize on the same transport', legacy.frames.some(frame => frame.event === 'space_sync'));
  space = new Space(ctx, env);
  const deleted = await request('/items/' + item.id, 'DELETE', manageKey);
  check('Space REST wake broadcasts item_deleted', deleted.status === 200 && both('item_deleted', payload => payload.itemId === item.id));

  await space.webSocketMessage(b.server, JSON.stringify({ v: 1, event: 'join_space', payload: { token: 'wrong' } }));
  check('Space invalid reauthorization closes the socket', b.client.closedCode === 4001);
  space = new Space(ctx, env);
  const last = await (await request('/items/text', 'POST', token, { text: 'only authorized sockets' })).json();
  check('Space wake excludes rejected and unjoined sockets', a.frames.some(frame => frame.event === 'item_added' && frame.payload.item.id === last.item.id)
    && !b.frames.some(frame => frame.event === 'item_added' && frame.payload.item.id === last.item.id) && unauthorized.frames.length === 0);

  space = new Space(ctx, env);
  await request('/close', 'POST', manageKey, {});
  check('Space close after wake broadcasts and closes surviving sockets', a.frames.some(frame => frame.event === 'space_closed') && a.client.closedCode === 1000 && unauthorized.client.closedCode === 1000);
}

async function runCorsPreflight() {
  const clients = [
    ['space', '/space/example/join', 'POST', ['content-type', 'authorization', 'x-device-key', 'x-device-name']],
    ['mailbox', '/circle/example/items/example/0', 'PUT', ['content-type', 'x-st-device', 'x-st-time', 'x-st-nonce', 'x-st-sig', 'x-st-chunks', 'x-st-epoch', 'x-st-size']],
    ['lookup', '/lookup', 'POST', ['content-type']],
  ];
  for (const origin of ['https://sharetexts.online', 'http://localhost:3311', 'http://127.0.0.1:49123']) {
    for (const [client, pathname, method, headers] of clients) {
      const res = await worker.fetch(new Request(`https://worker.test${pathname}`, {
        method: 'OPTIONS', headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': headers.join(', ') },
      }), {});
      const allowed = (res.headers.get('access-control-allow-headers') || '').toLowerCase().split(/,\s*/);
      check(`${client} preflight allows all client headers from ${origin}`, res.status === 204 && res.headers.get('access-control-allow-origin') === origin && headers.every(header => allowed.includes(header)));
    }
  }
  const empty = await worker.fetch(new Request('https://worker.test/lookup', { method: 'OPTIONS' }), {});
  check('originless preflight remains available', empty.status === 204);
  const denied = await worker.fetch(new Request('https://worker.test/lookup', { method: 'OPTIONS', headers: { origin: 'https://untrusted.example' } }), {});
  check('preflight still rejects untrusted origins', denied.status === 403 && !denied.headers.has('access-control-allow-origin'));
}

async function runSpaceCors() {
  const registry = new Registry(new FakeCtx(), {});
  const spaces = new Map();
  const env = {
    REGISTRY: { idFromName: name => name, get: () => registry },
    SPACES: { idFromName: name => name, get: id => {
      if (!spaces.has(id)) spaces.set(id, new Space(new FakeCtx(), env));
      return spaces.get(id);
    } },
  };
  const origin = 'https://sharetexts.online';
  const id = uuid();
  const post = (path, body, token) => worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-device-key': 'cors-device', 'x-device-name': 'Cors device', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }), env);
  const created = await post(`/space/${id}/create`, { durationMs: 21600000 });
  check('Space create response carries CORS through the router', created.status === 200 && created.headers.get('access-control-allow-origin') === origin);
  const { token, code } = await created.json();
  const joined = await post(`/space/${id}/join`, {}, token);
  check('Space authenticated join response carries CORS', joined.status === 200 && joined.headers.get('access-control-allow-origin') === origin);
  const denied = await post(`/space/${id}/join`, {}, 'wrong');
  check('Space authorization errors carry CORS', denied.status === 401 && denied.headers.get('access-control-allow-origin') === origin);
  const codeJoin = await post('/space/join-code', { code });
  check('Space code join exposes its credential header to the allowed frontend', codeJoin.status === 200 && codeJoin.headers.get('access-control-allow-origin') === origin && !!codeJoin.headers.get('x-space-token') && codeJoin.headers.get('access-control-expose-headers') === 'x-space-token');
}

async function runLobbyWithdrawal() {
  const ctx = new FakeCtx();
  const lobby = new Lobby(ctx, {});
  const peer = await connect(lobby, uuid());
  const deviceId = uuid();
  check('Lobby empty withdrawal is ACKed', (await peer.send('presence_withdraw')).success);
  check('Lobby initial announce is ACKed', (await peer.send('presence_announce', { deviceId, name: 'Nearby peer' })).success);
  await peer.waitFor(frame => frame.event === 'presence_list' && frame.payload.devices.some(device => device.name === 'Nearby peer'));
  peer.inbox.length = 0;
  check('Lobby withdrawal is ACKed', (await peer.send('presence_withdraw')).success);
  check('Lobby withdrawal removes membership but retains socket identity',
    !await ctx.storage.get('dev:' + deviceId) && (await ctx.storage.get('conn:' + peer.cid))?.deviceId === null);
  check('Lobby withdrawal broadcasts an empty list', !!await peer.waitFor(frame => frame.event === 'presence_list' && frame.payload.devices.length === 0));
  check('Lobby repeated withdrawal is ACKed', (await peer.send('presence_withdraw')).success);
  const wake = new Lobby(ctx, {});
  peer.inbox.length = 0;
  await wake.webSocketMessage(peer.server, JSON.stringify({ v: 1, id: 'reannounce', event: 'presence_announce', payload: { deviceId, name: 'Nearby again' } }));
  check('Lobby same-socket re-announce after wake is ACKed', peer.inbox.some(frame => frame.id === 'reannounce' && frame.ok && frame.success));
  check('Lobby same-socket re-announce is listed', !!await peer.waitFor(frame => frame.event === 'presence_list' && frame.payload.devices.some(device => device.name === 'Nearby again')));
  peer.server.close();
  await wake.webSocketClose(peer.server);
  check('Lobby announced socket close removes membership and identity',
    !await ctx.storage.get('dev:' + deviceId) && !await ctx.storage.get('conn:' + peer.cid));
  const withdrawn = await connect(wake, uuid());
  await withdrawn.send('presence_announce', { deviceId, name: 'Withdrawn peer' });
  await withdrawn.send('presence_withdraw');
  withdrawn.server.close();
  await wake.webSocketClose(withdrawn.server);
  check('Lobby withdrawn socket close removes retained identity', !await ctx.storage.get('conn:' + withdrawn.cid));
}

await runCorsPreflight();
await runSpaceCors();
await runRoomProtocol();
await runRefreshCode();
await runStayConnected();
await runStayEmptySurvival();
await runFreshCidRejoin();
await runPush();
await runLiveIdleExpiry();
await runDisconnectedState();
await runGraceHeartbeat();
await runGraceReclaim();
await runConnectionReclaims();
await runRegistry();
await runRateLease();
await runRateLeaseIsolates();
await runMetrics();
await runSpace();
await runSpaceHibernation();
await runLobbyWithdrawal();

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
