// WORKER_URL=http://localhost:8787 EXPECT_TARGETS=1 node scripts/verify-relay-burst.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { setTimeout as delay } from 'node:timers/promises';

const endpoint = process.env.WORKER_URL || 'http://localhost:8787';
assert.match(endpoint, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const result = await build({ entryPoints: ['src/lib/cloudflareSocket.ts'], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env.DEV': 'false' }, logLevel: 'silent' });
const { CloudflareSocket } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const sender = new CloudflareSocket(endpoint);
const receiver = new CloudflareSocket(endpoint);
try {
  const roomId = crypto.randomUUID();
  const created = await sender.request(roomId, 'create_room', { pid: crypto.randomUUID() });
  assert.equal(created.success, true);
  const joined = await receiver.request(roomId, 'join_with_link', { roomId, pid: crypto.randomUUID() });
  assert.equal(joined.success, true);
  const targeted = process.env.EXPECT_TARGETS !== '0';
  assert.equal(sender.binaryTargets, targeted);
  let binaryReceived = 0;
  let bytesReceived = 0;
  let metadataReceived = false;
  receiver.on('relay_message', ({ data }) => {
    if (data instanceof ArrayBuffer) { binaryReceived++; bytesReceived += data.byteLength; }
    else if (data === 'enc:AAAA') metadataReceived = true;
  });
  let textSent = 0;
  const ws = sender.ws;
  const send = ws.send.bind(ws);
  ws.send = data => { if (typeof data === 'string') textSent++; send(data); };
  const frames = [new ArrayBuffer(61476), new ArrayBuffer(61476), new ArrayBuffer(8256)];
  const started = Date.now();
  for (let i = 0; i < 720; i++) await sender.sendRelay({ roomId, to: joined.myParticipantId, data: frames[i % 3] });
  await sender.sendRelay({ roomId, to: joined.myParticipantId, data: 'enc:AAAA' });
  for (let i = 0; i < 1000 && (binaryReceived < 720 || !metadataReceived); i++) await delay(10);
  assert.equal(binaryReceived, 720);
  assert.equal(bytesReceived, 240 * (61476 + 61476 + 8256));
  assert.equal(metadataReceived, true, 'metadata after the burst must not hit the text quota');
  assert.equal(textSent, targeted ? 721 : 1);
  assert.ok(Date.now() - started < 10000, 'burst must stay within one quota window');
  console.log(`PASS 30 MiB relay burst: binaryReceived=${binaryReceived}; bytesReceived=${bytesReceived}; textSent=${textSent}; targeting=${targeted}; trailing metadata delivered`);
} finally {
  sender.destroy();
  receiver.destroy();
}
