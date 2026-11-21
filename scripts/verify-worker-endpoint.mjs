import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const production = 'https://sharetext-signaling.alighttt.workers.dev';
async function resolve(flag, url, dev = false) {
  const result = await build({
    stdin: {
      contents: "export { signalingHttpBase, signalingTransportMode } from './src/lib/socket'; export { CIRCLE_ORIGIN } from './src/lib/circle/endpoint';",
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife', globalName: 'endpoint',
    define: { 'import.meta.env': JSON.stringify({ DEV: dev, VITE_CI_LOCAL_WORKER: flag, VITE_SIGNALING_URL: url }) },
  });
  const context = { console: { debug() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
  runInNewContext(result.outputFiles[0].text, context);
  return context.endpoint;
}

for (const [name, flag, url, expected, circle] of [
  ['default production', undefined, production, production, production],
  ['canonical production', undefined, 'https://retired.example', production, production],
  ['localhost refused without opt-in', undefined, 'http://localhost:8787', null, production],
  ['empty environment unchanged', undefined, undefined, null, production],
  ['local CI', '1', 'http://localhost:8787', 'http://localhost:8787', 'http://localhost:8787'],
  ['loopback CI', '1', 'http://127.0.0.1:8787/', 'http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
]) {
  const api = await resolve(flag, url);
  assert.equal(api.signalingHttpBase(), expected);
  assert.equal(api.CIRCLE_ORIGIN, circle);
  console.log(`PASS ${name}`);
}
for (const url of [undefined, '', production, 'http://localhost.evil:8787', 'http://localhost:8787/path']) {
  await assert.rejects(resolve('1', url), /requires a local HTTP/);
}
console.log('PASS invalid/empty CI endpoints rejected');
