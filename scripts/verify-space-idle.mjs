import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base = new URL(process.env.WORKER_URL || 'http://localhost:8787');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Space idle regression must use a local Worker, never workers.dev');
assert.equal(base.protocol, 'http:');
const spaceId = crypto.randomUUID();
const peers = [];
let token;
let manageKey;

async function post(path, body, credential, device = 'idle-creator') {
  const response = await fetch(new URL(`/space/${spaceId}${path}`, base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', 'x-device-key': device, ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, `${path} must return 200`);
  return response.json();
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (!predicate() && Date.now() < deadline) await delay(25);
  assert(predicate(), label);
}

function authorize(peer) {
  peer.socket.send(JSON.stringify({ v: 1, event: 'join_space', payload: { token, deviceKey: peer.name, name: peer.name } }));
}

async function connect(name) {
  const url = new URL('/space-ws', base);
  url.protocol = 'ws:';
  url.searchParams.set('space', spaceId);
  const peer = { name, socket: new WebSocket(url), frames: [], closes: 0, errors: 0 };
  peers.push(peer);
  peer.socket.addEventListener('message', event => peer.frames.push(JSON.parse(String(event.data))));
  peer.socket.addEventListener('close', () => peer.closes++);
  peer.socket.addEventListener('error', () => peer.errors++);
  await waitFor(() => peer.socket.readyState === WebSocket.OPEN, `${name} socket opens`);
  authorize(peer);
  await waitFor(() => peer.frames.some(frame => frame.event === 'space_sync'), `${name} receives space_sync`);
  return peer;
}

async function addAndReceive(text) {
  const { item } = await post('/items/text', { text }, token);
  await waitFor(() => peers.every(peer => peer.frames.some(frame => frame.event === 'item_added' && frame.payload?.item.id === item.id)), `${text}: item_added must arrive on both original sockets`);
}

try {
  ({ token, manageKey } = await post('/create', { name: 'Idle broadcast regression', durationMs: 6 * 3_600_000 }));
  await connect('idle-creator');
  await connect('idle-joiner');
  await addAndReceive('Immediate note');
  console.log('PASS Space immediate broadcast: both sockets received space_sync and item_added');
  console.log('Waiting 40 seconds without HTTP, heartbeats or WebSocket traffic to the Space');
  await delay(40_000);
  try {
    await addAndReceive('Note after 40 seconds idle');
  } catch (error) {
    console.error('IDLE_FAILURE', JSON.stringify(peers.map(peer => ({ device: peer.name, readyState: peer.socket.readyState, closes: peer.closes, errors: peer.errors }))));
    for (const peer of peers) { peer.frames.length = 0; authorize(peer); }
    await waitFor(() => peers.every(peer => peer.frames.some(frame => frame.event === 'space_sync')), 'same sockets can reauthorize without reconnecting');
    await addAndReceive('Recovery note on the same sockets');
    console.error('CONTROL same open sockets deliver again after join_space; transport did not silently die');
    throw error;
  }
  for (const peer of peers) {
    assert.equal(peer.socket.readyState, WebSocket.OPEN);
    assert.equal(peer.closes, 0);
    assert.equal(peer.errors, 0);
  }
  console.log('PASS Space idle broadcast: HTTP 200 after 40s idle; item_added on both original sockets; no close, error, heartbeat, reload or reauthorization');
} finally {
  if (manageKey) await post('/close', {}, manageKey).catch(error => console.error('Space cleanup failed:', error.message));
  for (const peer of peers) peer.socket.close();
}
