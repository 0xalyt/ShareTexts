import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const production = 'https://sharetext-signaling.alighttt.workers.dev';
async function resolve(flag, url, dev = false, socketUrl) {
  const result = await build({
    stdin: {
      contents: "export { SIGNALING_WORKER, signalingConfigIssue, signalingHttpBase, signalingTransportMode } from './src/lib/socket'; export { CIRCLE_ORIGIN } from './src/lib/circle/endpoint';",
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife', globalName: 'endpoint',
    define: { 'import.meta.env': JSON.stringify({ DEV: dev, VITE_CI_LOCAL_WORKER: flag, VITE_SIGNALING_URL: url, VITE_SOCKET_URL: socketUrl }) },
  });
  const context = {
    console: { debug() {}, info() {}, log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
    fetch() { throw new Error('Endpoint resolution must not access the network'); },
  };
  runInNewContext(result.outputFiles[0].text, context);
  return context.endpoint;
}

for (const [name, flag, url, expected, circle, mode = 'cloudflare', dev = false, socketUrl] of [
  ['default production', undefined, undefined, production, production],
  ['empty production', undefined, '', production, production],
  ['canonical production', undefined, production, production, production],
  ['stale production', undefined, 'https://sharetext-signaling.garv29devra.workers.dev', production, production],
  ['localhost refused without opt-in', undefined, 'http://localhost:8787', null, production, 'socketio'],
  ['production socket-only', undefined, undefined, 'https://socket.example', production, 'socketio', false, 'https://socket.example'],
  ['localhost socket refused', undefined, undefined, null, production, 'socketio', false, 'http://localhost:3012'],
  ['dev same-origin', undefined, undefined, null, production, 'socketio', true],
  ['dev configured worker', undefined, 'http://localhost:8787', 'http://localhost:8787', 'http://localhost:8787', 'cloudflare', true],
  ['local CI', '1', 'http://localhost:8787', 'http://localhost:8787', 'http://localhost:8787'],
  ['loopback CI', '1', 'http://127.0.0.1:8787/', 'http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
]) {
  const api = await resolve(flag, url, dev, socketUrl);
  assert.equal(api.SIGNALING_WORKER, production);
  assert.equal(api.signalingTransportMode(), mode);
  assert.equal(api.signalingHttpBase(), expected);
  assert.equal(api.signalingConfigIssue() === null, dev || expected !== null);
  assert.equal(api.CIRCLE_ORIGIN, circle);
  console.log(`PASS ${name}`);
}
for (const url of [undefined, '', production, 'http://localhost.evil:8787', 'http://localhost:8787/path']) {
  await assert.rejects(resolve('1', url), /requires a local HTTP/);
}
console.log('PASS invalid/empty CI endpoints rejected');
