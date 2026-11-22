// Counts Durable Object invocations per ordinary-use flow against a real local
// `wrangler dev` (workerd), using worker/test/measure-entry.ts, which logs one
// `[do-meter] <Class> <kind> <ms>` line per DO entry-point call. Clients send
// cf-connecting-ip like Cloudflare does, so per-IP rate limiting is exercised.
//
//   node scripts/measure-do-usage.mjs [--json out.json]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as OTPAuth from 'otpauth';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.MEASURE_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const IP = '203.0.113.7';
const ORIGIN = 'http://localhost:3010';
const HDR = { 'cf-connecting-ip': IP, origin: ORIGIN };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

// ---- local Worker with the metering entry --------------------------------
const cfgDir = path.join(root, 'worker');
const cfgPath = path.join(cfgDir, '.measure.wrangler.toml');
const persist = mkdtempSync(path.join(os.tmpdir(), 'st-measure-'));
writeFileSync(cfgPath, readFileSync(path.join(cfgDir, 'wrangler.toml'), 'utf8')
  .replace(/^main\s*=.*$/m, 'main = "test/measure-entry.ts"'));

let log = '';
const wr = spawn('npx', ['wrangler', 'dev', '--config', cfgPath, '--port', String(PORT), '--ip', '127.0.0.1', '--inspector-port', String(PORT + 1000), '--persist-to', persist, '--show-interactive-dev-session=false'], { cwd: root, detached: true, env: { ...process.env, CI: '1' } });
wr.stdout.on('data', (d) => { log += d; });
wr.stderr.on('data', (d) => { log += d; });
const stop = () => { try { process.kill(-wr.pid, 'SIGKILL'); } catch {} rmSync(cfgPath, { force: true }); };
process.on('exit', stop);
const fail = (e) => { console.error(log.split('\n').slice(-40).join('\n')); console.error(e); process.exit(1); };
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

for (let i = 0; ; i++) {
  try { if ((await fetch(BASE + '/health')).ok) break; } catch {}
  if (i > 120) { console.error(log); throw new Error('wrangler dev did not start'); }
  await sleep(500);
}

const meterLines = () => log.split('\n').filter((l) => l.includes('[do-meter]'));
async function measure(name, fn) {
  await sleep(1500);
  const start = meterLines().length;
  await fn();
  await sleep(2500); // let waitUntil / alarms / close handlers land
  const lines = meterLines().slice(start).map((l) => l.slice(l.indexOf('[do-meter]') + 11).trim().split(/\s+/));
  const byKey = {};
  let ms = 0, wsMsgs = 0, other = 0;
  for (const [cls, kind, t] of lines) {
    byKey[`${cls}.${kind}`] = (byKey[`${cls}.${kind}`] || 0) + 1;
    ms += Number(t) || 0;
    if (kind === 'webSocketMessage') wsMsgs++; else if (kind !== 'webSocketClose' && kind !== 'webSocketError') other++;
  }
  // Cloudflare bills HTTP/RPC/alarm invocations as 1 request, incoming WS
  // messages at 20:1; close events are not requests.
  return { flow: name, invocations: lines.length, requests: other, wsMessages: wsMsgs, billable: +(other + wsMsgs / 20).toFixed(2), handlerMs: ms, byKey };
}

// ---- clients --------------------------------------------------------------
class Client {
  constructor() { this.waiters = []; this.seq = 0; }
  open(p) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(BASE.replace('http', 'ws') + p, { headers: HDR });
      ws.binaryType = 'arraybuffer';
      ws.on('open', () => { this.ws = ws; resolve(); });
      ws.on('error', reject);
      ws.on('message', (data, isBinary) => {
        if (isBinary) { this.fire('__binary', data); return; }
        let m; try { m = JSON.parse(String(data)); } catch { return; }
        if (m.type === 'ack') this.fire('ack:' + m.id, m);
        else if (m.type === 'event') this.fire(m.event, m.payload);
      });
    });
  }
  fire(ev, v) { for (const w of this.waiters.filter((w) => w.ev === ev)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(v); } }
  waitFor(ev, ms = 8000) { return new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); this.waiters.push({ ev, resolve: (v) => { clearTimeout(t); resolve(v); } }); }); }
  send(event, payload) { const id = 'm' + this.seq++; const p = this.waitFor('ack:' + id); this.ws.send(JSON.stringify({ v: 1, id, event, payload })); return p; }
  close() { try { this.ws.close(); } catch {} }
}
const req = (p, init = {}) => fetch(BASE + p, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
const codeFor = (secret, anchor) => new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 40, secret }).generate({ timestamp: Date.now() - anchor });
function must(cond, what) { if (!cond) throw new Error('flow step failed: ' + what); }

// ---- flows ----------------------------------------------------------------
const results = [];
let A, B, roomId;

results.push(await measure('open site (health + page_view + first /stats)', async () => {
  must((await req('/health')).ok, 'health');
  must((await req('/api/event', { method: 'POST', body: 'product.page_view' })).status === 204, 'event');
  must((await req('/stats')).ok, 'stats');
}));

results.push(await measure('landing open 1 min (6 more /stats polls, 10s apart)', async () => {
  for (let i = 0; i < 6; i++) { await sleep(10_000); must((await req('/stats')).ok, 'stats poll'); }
}));

results.push(await measure('3 visitors on the landing for 30s (3 polls each, 10s apart)', async () => {
  for (let i = 0; i < 3; i++) {
    await sleep(10_000);
    await Promise.all([1, 2, 3].map(async (n) => must((await req('/stats', { headers: { 'cf-connecting-ip': '198.51.100.' + n } })).ok, 'stats')));
  }
}));

results.push(await measure('make and join a room (create, lookup, join, 4 signals)', async () => {
  A = new Client(); B = new Client(); roomId = uuid();
  await A.open(`/ws?room=${roomId}&cid=${uuid()}`);
  const c = await A.send('create_room', { pid: uuid() });
  must(c?.ok, 'create');
  const code = codeFor(c.secret, c.createdAt);
  const lk = await (await req('/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  must(lk.roomId === roomId, 'lookup');
  await B.open(`/ws?room=${roomId}&cid=${uuid()}`);
  const j = await B.send('join_with_code', { code, pid: uuid() });
  must(j?.ok, 'join');
  const aPid = c.participantId, bPid = j.participantId;
  await A.send('signal', { to: bPid, signal: { type: 'offer', sdp: 'v=0' } });
  await B.send('signal', { to: aPid, signal: { type: 'answer', sdp: 'v=0' } });
  await A.send('signal', { to: bPid, signal: { type: 'candidate', candidate: 'c' } });
  await B.send('signal', { to: aPid, signal: { type: 'candidate', candidate: 'c' } });
}));

results.push(await measure('relay 10 text messages', async () => {
  for (let i = 0; i < 10; i++) { A.ws.send(JSON.stringify({ v: 1, event: 'relay_message', payload: { data: 'enc:AAAA' + i } })); await sleep(20); }
}));

results.push(await measure('relay a 1 MiB file (16 x 64 KiB binary chunks)', async () => {
  A.ws.send(JSON.stringify({ v: 1, event: 'relay_message', payload: { data: 'enc:HDR' } }));
  const chunk = new Uint8Array(64 * 1024);
  let got = 0; const done = new Promise((r) => { const h = () => { if (++got === 16) r(); else B.waiters.push({ ev: '__binary', resolve: h }); }; B.waiters.push({ ev: '__binary', resolve: h }); });
  for (let i = 0; i < 16; i++) A.ws.send(chunk);
  await Promise.race([done, sleep(8000)]);
  must(got === 16, 'binary delivered ' + got);
}));

results.push(await measure('leave the room (both close)', async () => { A.close(); B.close(); }));

results.push(await measure('load /stats once', async () => { must((await req('/stats')).ok, 'stats'); }));

results.push(await measure('Temporary Space (create, join, 2 text items, list, live ws + 2 heartbeats, close)', async () => {
  const spaceId = uuid();
  const cr = await (await req(`/space/${spaceId}/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'm', durationMs: 6 * 3600_000 }) })).json();
  must(cr.token, 'space create');
  const auth = { authorization: 'Bearer ' + cr.token, 'content-type': 'application/json' };
  must((await req(`/space/${spaceId}/join`, { method: 'POST', headers: { ...auth, 'x-device-name': 'B' }, body: '{}' })).ok, 'join');
  const L = new Client();
  await L.open(`/space-ws?space=${spaceId}&cid=${uuid()}`);
  const sync = L.waitFor('space_sync');
  L.ws.send(JSON.stringify({ v: 1, event: 'join_space', payload: { token: cr.token } }));
  must(await sync, 'space_sync');
  for (const t of ['one', 'two']) must((await req(`/space/${spaceId}/items/text`, { method: 'POST', headers: auth, body: JSON.stringify({ text: t }) })).ok, 'item');
  must((await req(`/space/${spaceId}/items`, { headers: auth })).ok, 'list');
  for (let i = 0; i < 2; i++) { const a = L.waitFor('heartbeat_ack'); L.ws.send(JSON.stringify({ v: 1, event: 'heartbeat' })); must(await a, 'hb'); }
  L.close();
}));

results.push(await measure('idle 70s with nothing open (alarms only)', async () => { await sleep(70_000); }));

stop();
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('flow', 82) + pad('DO req', 8) + pad('WS msg', 8) + pad('billable', 10) + 'handler ms');
for (const r of results) console.log(pad(r.flow, 82) + pad(r.requests, 8) + pad(r.wsMessages, 8) + pad(r.billable, 10) + r.handlerMs);
for (const r of results) console.log('  ' + r.flow + ': ' + JSON.stringify(r.byKey));
const outIdx = process.argv.indexOf('--json');
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify(results, null, 2));
process.exit(0);
