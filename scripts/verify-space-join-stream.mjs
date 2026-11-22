import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

mkdirSync('audit', { recursive: true });
const directory = mkdtempSync(path.resolve('audit/space-join-stream-'));
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const base = `http://127.0.0.1:${port}`;
let output = '';
let exited = false;
const worker = spawn('node_modules/.bin/wrangler', [
  'dev', '--config', 'worker/wrangler.toml', '--local', '--ip', '127.0.0.1', '--port', String(port),
  '--inspector-port', '0', '--persist-to', path.join(directory, 'state'),
], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
worker.stdout.on('data', chunk => { output += chunk; });
worker.stderr.on('data', chunk => { output += chunk; });
worker.on('exit', code => { exited = true; console.log(`Local test Wrangler exited with code ${code}`); });
worker.on('error', error => { exited = true; output += String(error); });
const health = async () => {
  try { return (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000), redirect: 'error' })).ok; }
  catch { return false; }
};
const sid = crypto.randomUUID();
async function post(tail, body, token, device = 'creator') {
  const response = await fetch(`${base}/space/${sid}${tail}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', 'x-device-key': device, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true, `${tail} returned HTTP ${response.status}: ${text}`);
  return { status: response.status, body: JSON.parse(text) };
}
try {
  let ready = false;
  for (let i = 0; i < 60 && !exited; i++) {
    if (await health()) { ready = true; break; }
    await delay(1000);
  }
  assert(ready, 'isolated local Worker must start');
  const created = await post('/create', { durationMs: 6 * 3_600_000 });
  assert.equal(created.status, 200);
  const token = created.body.token;
  const first = await post('/join', {}, token, 'joiner');
  const second = await post('/join', {}, token, 'joiner');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.spaceId, sid);
  assert.equal(second.body.spaceId, sid);
  assert.equal(second.body.participantId, first.body.participantId);
  assert.equal(first.body.memberCount, 2);
  assert.equal(second.body.memberCount, 2);
  console.log('PASS double Space join: both responses 200, same participant and snapshot, two members');
  await delay(1500);
  assert(!exited, 'double join must not terminate Wrangler');
  assert(await health(), 'Worker must remain healthy after double join');
  assert(!/Can.t read from request stream|Uncaught|\[ERROR\]/i.test(output), 'double join must not log an asynchronous stream error');
  console.log('PASS double Space join: Worker stays alive and healthy; no asynchronous request-stream errors');
  const empty = await post('/join', undefined, token, 'joiner');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.participantId, first.body.participantId);
  const unauthorized = await post('/join', { ignored: true }, 'wrong-token', 'joiner');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, 'Unauthorized');
  await delay(1500);
  assert(!exited && await health(), 'empty and unauthorized joins must leave the Worker healthy');
  assert(!/Can.t read from request stream|Uncaught|\[ERROR\]/i.test(output), 'empty and unauthorized joins must not leave unread request streams');
  console.log('PASS empty-body join and unauthorized join: correct 200/401 responses, Worker healthy, no stream errors');
} catch (error) {
  await delay(1500);
  console.error(output);
  throw error;
} finally {
  writeFileSync(path.join(directory, 'worker.log'), output);
  console.log(`Worker evidence: ${directory}/worker.log`);
  try { process.kill(-worker.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
