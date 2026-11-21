import assert from 'node:assert/strict';
import { build } from 'esbuild';

const handlers = new Map();
globalThis.relayTestSocket = { on: (event, handler) => handlers.set(event, handler) };
const bundled = await build({
  entryPoints: ['src/lib/webrtc.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'test-socket', setup(builder) {
    builder.onResolve({ filter: /^\.\/socket$/ }, () => ({ path: 'socket', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
      contents: 'export const getSocket = () => globalThis.relayTestSocket;',
    }));
  } }],
});
const { PeerManager } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const router = PeerManager.router;
let classicPeer = 'peer-b';
const received = [];
const signals = [];
const pm = Object.assign(Object.create(PeerManager.prototype), {
  destroyed: false,
  resolveRelayPeer: () => classicPeer,
  acceptRelay: data => received.push(data),
  acceptSignal: data => signals.push(data),
});
router.registerFallback(pm);
const binary = new Uint8Array([1, 2, 3]).buffer;
const relay = (data = binary, from) => handlers.get('relay_message')({ data, from });
const signal = from => handlers.get('signal')({ from, signal: { type: 'offer', sdp: 'test' } });
relay();
assert.equal(received.length, 1, 'unbound classic link receives unaddressed binary');
console.log('PASS: unbound classic binary route');
pm.attach('peer-b');
assert.equal(router.fallback, null);
relay();
assert.equal(received.length, 2, 'bound classic link still receives unaddressed binary');
console.log('PASS: bound classic binary route');
signal('stranger');
signal(undefined);
relay('unaddressed text');
assert.equal(signals.length, 0, 'unaddressed binary routing must not relax signal routing');
assert.equal(received.length, 2, 'bound link must not receive unaddressed text');
console.log('PASS: strict signaling and text routing preserved');
classicPeer = null;
relay();
assert.equal(received.length, 2, 'growth to three must disable unaddressed binary even with only one link');
relay(binary, 'peer-b');
assert.equal(received.length, 3, 'addressed relay continues working after growth');
router.fallback = pm;
relay();
assert.equal(received.length, 3, 'unbound fallback cannot bypass authoritative membership');
router.fallback = null;
console.log('PASS: room growth disables unaddressed binary, preserves addressed relay');
classicPeer = 'different-peer';
relay();
assert.equal(received.length, 3, 'stale binding must not receive another pair’s binary');
classicPeer = 'peer-b';
pm.destroyed = true;
relay();
assert.equal(received.length, 3, 'destroyed link must not receive binary');
console.log('PASS: stale and destroyed links rejected');
delete globalThis.relayTestSocket;
