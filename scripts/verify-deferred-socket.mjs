import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/lib/deferredSocket.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { DeferredSocket } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const handlers = new Map();
const calls = [];
const transport = {
  connected: true,
  on(event, listener) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(listener); },
  off(event, listener) { if (listener) handlers.get(event)?.delete(listener); else handlers.delete(event); },
  emit(event, ...args) { calls.push([event, ...args]); },
  retarget(endpoint) { calls.push(['retarget', endpoint]); },
};
const fire = event => { for (const listener of [...handlers.get(event) ?? []]) listener(); };
let release;
const socket = new DeferredSocket(() => new Promise(resolve => { release = resolve; }));
assert.equal(socket.connected, false);
let connected = 0;
socket.once('connect', () => connected++);
const removed = () => assert.fail('removed listener fired');
socket.on('connect', removed).off('connect', removed);
socket.on('unused', removed).off('unused');
socket.emit('create_room', { queued: true });
socket.retarget('http://localhost:9999');
await tick();
release(() => { queueMicrotask(() => fire('connect')); return transport; });
await tick();
assert.equal(connected, 1, 'constructor connect microtask must not beat listener registration');
fire('connect');
assert.equal(connected, 1);
assert.equal(handlers.has('unused'), false);
assert.equal(socket.connected, true);
assert.deepEqual(calls, [['retarget', 'http://localhost:9999'], ['create_room', { queued: true }]]);
socket.emit('relay_message', 'first message');
socket.retarget('http://localhost:9998');
assert.deepEqual(calls.slice(-2), [['relay_message', 'first message'], ['retarget', 'http://localhost:9998']]);

const failure = new Error('chunk unavailable');
const failed = new DeferredSocket(async () => { throw failure; });
let errors = 0;
let ack;
failed.once('connect_error', error => { assert.equal(error, failure); errors++; });
failed.emit('create_room', {}, response => { ack = response; });
await tick();
assert.equal(failed.connected, false);
assert.equal(errors, 1);
assert.deepEqual(ack, { success: false, error: 'CONNECT_ERROR' });
failed.once('connect_error', () => errors++);
failed.on('connect_error', removed).off('connect_error', removed);
failed.emit('join_with_code', {}, response => { ack = response; });
await tick();
assert.equal(errors, 2);
assert.equal(ack.success, false);
const empty = new DeferredSocket(async () => () => transport);
await tick();
assert.equal(empty.connected, true);
const broken = new DeferredSocket(async () => () => { throw failure; });
broken.once('connect_error', error => assert.equal(error, failure));
await tick();
assert.equal(broken.connected, false);
console.log('PASS deferred signaling: queued/late events and retarget, constructor connect race, once/off, empty queue, chunk and constructor failure, failed acknowledgements');
