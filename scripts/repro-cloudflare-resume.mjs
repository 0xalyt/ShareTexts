import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/lib/cloudflareSocket.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
});
const { CloudflareSocket } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const socket = new CloudflareSocket('https://worker.example');
const requests = [];
socket.request = async (...args) => { requests.push(args); return { success: true }; };
const resume = payload => new Promise(resolve => socket.emit('resume_room', payload, resolve));
const credentials = { roomId: 'room', secret: 'secret' };
assert.equal((await resume({ ...credentials, reconnect: true })).success, true);
assert.deepEqual(requests.pop(), ['room', 'resume_room', { ...credentials, reconnect: true }]);
console.log('PASS: Cloudflare explicit reconnect reaches the Worker request');
for (const reconnect of [undefined, false, 'true']) {
  await resume({ ...credentials, reconnect });
  assert.deepEqual(requests.pop(), ['room', 'resume_room', credentials]);
}
console.log('PASS: heartbeat resumes do not request peer recovery');
assert.equal((await resume({ roomId: 'room' })).success, false);
assert.equal(requests.length, 0);
socket.request = async () => { throw new Error('offline'); };
assert.equal((await resume(credentials)).success, false);
console.log('PASS: missing credentials and request failures return unsuccessful acknowledgements');
