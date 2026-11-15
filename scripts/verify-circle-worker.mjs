// Circle mailbox gate — drives the REAL `Circle` Durable Object in Node.
//
// workerd can't run everywhere, so this bundles worker/src/circle.ts with
// esbuild against the same `cloudflare:workers` shim the room/space suites use
// and feeds it real signed requests:
//   create → auth failures (unsigned / stale / replay / non-member / forged) →
//   invite → code-join as a pending device → approval writes membership + wrap
//   → sealed chunk PUT/GET is byte-identical → oversize chunk refused → item
//   list carries no names → ack → owner-only delete → signed log append.
// It also times every route so the report can quote a number, not the word
// "fast".
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-circle-'));
const shimPath = path.join(root, 'worker', 'test', 'cf-shim.ts');
const out = await build({
  entryPoints: { circle: path.join(root, 'worker', 'src', 'circle.ts'), shim: shimPath },
  bundle: true, format: 'esm', platform: 'neutral',
  alias: { 'cloudflare:workers': shimPath }, outdir: tmp, write: false, logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);
const bust = '?t=' + Date.now();
const { FakeCtx } = await import(pathToFileURL(path.join(tmp, 'shim.js')).href + bust);
const { Circle } = await import(pathToFileURL(path.join(tmp, 'circle.js')).href + bust);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const enc = new TextEncoder();

async function newDevice() {
  const sign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const spki = await crypto.subtle.exportKey('spki', sign.publicKey);
  const dev = {
    deviceId: b64(await crypto.subtle.digest('SHA-256', spki)).replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase(),
    signPub: b64(spki),
    ecdhPub: b64(await crypto.subtle.exportKey('spki', ecdh.publicKey)),
    sign,
  };
  dev.signRequest = async (method, path, body, opts = {}) => {
    // Binary bodies are hashed as bytes: a signature covers what is sent.
    const raw = body instanceof Uint8Array ? body : enc.encode(body);
    const time = opts.time ?? Date.now();
    const nonce = opts.nonce ?? b64(crypto.getRandomValues(new Uint8Array(12)));
    const digest = Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw))).toString('hex');
    const msg = `${method}\n${path}\n${digest}\n${time}\n${nonce}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, dev.sign.privateKey, enc.encode(msg));
    return {
      'x-st-device': dev.deviceId, 'x-st-time': String(time), 'x-st-nonce': nonce,
      'x-st-sig': b64(sig), 'content-type': 'application/json',
    };
  };
  return dev;
}

const circleId = crypto.randomUUID();
const co = new Circle(new FakeCtx(), {});
const timings = [];
const quiet = { log: console.log };
async function call(method, tail, { headers = {}, body = '', label } = {}) {
  const url = `https://internal/circle/${circleId}${tail}`;
  const init = { method, headers, body: method === 'GET' || method === 'DELETE' ? undefined : body };
  const started = performance.now();
  const res = await co.fetch(new Request(url, init));
  timings.push({ label: label ?? `${method} ${tail}`, ms: performance.now() - started });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* binary or empty */ }
  return { status: res.status, body: parsed, text, res };
}
const sign = (dev, method, tail, body = '', opts) => dev.signRequest(method, `/circle/${circleId}${tail}`, body, opts);

const A = await newDevice();
const B = await newDevice();
const C = await newDevice();

// ── creation ────────────────────────────────────────────────────────────────
{
  const createBody = JSON.stringify({ deviceId: A.deviceId, signPub: A.signPub, ecdhPub: A.ecdhPub });
  const r = await call('POST', '/create', {
    headers: { 'content-type': 'application/json' }, body: createBody, label: 'POST /create',
  });
  check('create registers the first device', r.status === 200 && r.body?.epoch === 1);

  const again = await call('POST', '/create', { headers: { 'content-type': 'application/json' }, body: createBody });
  check('a second create is refused', again.status === 409);
}

// ── authentication ──────────────────────────────────────────────────────────
{
  const bare = await call('GET', '/members');
  check('an unsigned request is refused', bare.status === 401);

  const stale = await call('GET', '/members', { headers: await sign(A, 'GET', '/members', '', { time: Date.now() - 120_000 }) });
  check('a stale timestamp is refused', stale.status === 401);

  const signedOnce = await sign(A, 'GET', '/members');
  const ok = await call('GET', '/members', { headers: signedOnce, label: 'GET /members' });
  check('a signed member reads the circle', ok.status === 200 && ok.body?.members?.length === 1);

  // The SAME headers, replayed byte for byte.
  const replay = await call('GET', '/members', { headers: signedOnce });
  check('a replayed nonce is refused', replay.status === 409, `status ${replay.status}`);

  const outsider = await call('GET', '/members', { headers: await sign(C, 'GET', '/members') });
  check('a non-member is refused', outsider.status === 403);

  const forged = await sign(A, 'GET', '/members');
  forged['x-st-sig'] = b64(new Uint8Array(64));
  check('a forged signature is refused', (await call('GET', '/members', { headers: forged })).status === 401);
}

// ── invite and pending join ─────────────────────────────────────────────────
let invite;
{
  const r = await call('POST', '/invite', { headers: await sign(A, 'POST', '/invite', '{}'), body: '{}', label: 'POST /invite' });
  invite = r.body;
  check('invite mints a 64-hex id and an 8-char code',
    r.status === 200 && /^[0-9a-f]{64}$/.test(invite?.inviteId || '') && /^[A-Z2-9]{8}$/.test(invite?.code || ''),
    invite?.code);
  check('invite expires within ten minutes', !!invite && invite.expiresAt - Date.now() <= 10 * 60 * 1000 + 1000);
}

{
  const joinBody = JSON.stringify({
    inviteId: invite.inviteId, code: invite.code, deviceId: B.deviceId, signPub: B.signPub, ecdhPub: B.ecdhPub,
  });
  const r = await call('POST', '/join', { headers: await sign(B, 'POST', '/join', joinBody), body: joinBody, label: 'POST /join' });
  check('a joiner with the code becomes pending, not a member', r.status === 200 && r.body?.pending === true);
  check('the join relay carries a transcript hash, not keys', /^[0-9a-f]{64}$/.test(r.body?.transcript || ''));

  const members = await call('GET', '/members', { headers: await sign(A, 'GET', '/members') });
  check('a pending device is not in the member list', members.body?.members?.length === 1);

  const selfBody = JSON.stringify({ deviceId: B.deviceId, wrapped: 'x', sig: 'y' });
  const selfApprove = await call('POST', '/approve', { headers: await sign(B, 'POST', '/approve', selfBody), body: selfBody });
  check('a pending device cannot approve itself', selfApprove.status === 403);
}

// ── approval ────────────────────────────────────────────────────────────────
{
  const body = JSON.stringify({ deviceId: B.deviceId, wrapped: 'sealed-key-for-B', sig: 'sig-by-A' });
  const r = await call('POST', '/approve', { headers: await sign(A, 'POST', '/approve', body), body, label: 'POST /approve' });
  check('approval writes membership and a wrap', r.status === 200 && r.body?.ok === true);

  const members = await call('GET', '/members', { headers: await sign(A, 'GET', '/members') });
  check('the circle now has two devices', members.body?.members?.length === 2);
  check('the wrap is stored per device and epoch',
    members.body?.wraps?.some((w) => w.deviceId === B.deviceId && w.epoch === 1));

  const reuse = JSON.stringify({ inviteId: invite.inviteId, code: '', deviceId: C.deviceId, signPub: C.signPub, ecdhPub: C.ecdhPub });
  const rejoin = await call('POST', '/join', { headers: await sign(C, 'POST', '/join', reuse), body: reuse });
  check('an invite is not reusable once approved', rejoin.status === 410 || rejoin.status === 403);
}

// ── sealed chunks ───────────────────────────────────────────────────────────
const itemId = crypto.randomUUID();
const plaintext = crypto.getRandomValues(new Uint8Array(1024));
{
  const put = await call('PUT', `/item/${itemId}/chunk/0`, {
    headers: {
      ...(await sign(A, 'PUT', `/item/${itemId}/chunk/0`, plaintext)),
      'content-type': 'application/octet-stream',
      'x-st-chunks': '2', 'x-st-epoch': '1', 'x-st-size': String(plaintext.byteLength),
    },
    body: plaintext, label: 'PUT chunk',
  });
  check('a sealed chunk is accepted', put.status === 200 && put.body?.bytes === 1024);

  const get = await co.fetch(new Request(`https://internal/circle/${circleId}/item/${itemId}/chunk/0`, {
    method: 'GET', headers: await sign(B, 'GET', `/item/${itemId}/chunk/0`),
  }));
  const bytes = new Uint8Array(await get.arrayBuffer());
  check('the other device reads back identical bytes',
    get.status === 200 && bytes.length === plaintext.length && bytes.every((b, i) => b === plaintext[i]));
  check('the chunk response is not cacheable', get.headers.get('cache-control') === 'no-store');

  const oversize = await call('PUT', `/item/${itemId}/chunk/1`, {
    headers: {
      ...(await sign(A, 'PUT', `/item/${itemId}/chunk/1`, new Uint8Array(1024 * 1024 + 1))),
      'x-st-chunks': '2', 'content-type': 'application/octet-stream',
    },
    body: new Uint8Array(1024 * 1024 + 1), label: 'PUT oversize',
  });
  check('a chunk over 1 MiB is refused', oversize.status === 413);

  const items = await call('GET', '/items', { headers: await sign(A, 'GET', '/items'), label: 'GET /items' });
  const listed = items.body?.items?.[0];
  check('the item list has sizes and epochs but no names',
    items.status === 200 && listed?.itemId === itemId && listed?.chunks === 2 && !('name' in (listed ?? {})));
  check('the server knows the epoch the item was sealed under', listed?.epoch === 1);
}

// ── ack, ownership, delete ──────────────────────────────────────────────────
{
  const ackBody = JSON.stringify({ ack: true });
  const ack = await call('POST', `/item/${itemId}`, { headers: await sign(B, 'POST', `/item/${itemId}`, ackBody), body: ackBody, label: 'POST ack' });
  check('an ack is recorded', ack.status === 200);
  const items = await call('GET', '/items', { headers: await sign(A, 'GET', '/items') });
  check('the ack names the device that got it', items.body?.items?.[0]?.acked?.includes(B.deviceId) === true);

  const foreign = await call('DELETE', `/item/${itemId}`, { headers: await sign(B, 'DELETE', `/item/${itemId}`) });
  check('another device cannot delete your item', foreign.status === 403);

  const own = await call('DELETE', `/item/${itemId}`, { headers: await sign(A, 'DELETE', `/item/${itemId}`), label: 'DELETE item' });
  const after = await call('GET', '/items', { headers: await sign(A, 'GET', '/items') });
  check('the owner deletes it and it stops being listed', own.status === 200 && (after.body?.items?.length ?? -1) === 0);
}

// ── the membership log ──────────────────────────────────────────────────────
{
  const body = JSON.stringify({ kind: 'add_device', body: '{"device":"' + B.deviceId + '"}', sig: 'sig', ts: Date.now() });
  const append = await call('POST', '/log', { headers: await sign(A, 'POST', '/log', body), body, label: 'POST /log' });
  // Signatures bind the PATH, never the query string (ADR: METHOD/PATH/digest).
  const read = await call('GET', '/log?since=0', { headers: await sign(A, 'GET', '/log'), label: 'GET /log' });
  if (append.status !== 200) console.log('    log append status', append.status, JSON.stringify(append.body));
  check('a signed log entry is chained with a sequence number',
    append.status === 200 && append.body?.seq === 1 && read.body?.entries?.[0]?.signer === A.deviceId);
  check('the log records the signer, never a key', !('signPub' in (read.body?.entries?.[0] ?? {})));
}

rmSync(tmp, { recursive: true, force: true });
void quiet;

const sorted = timings.map((t) => t.ms).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`\n  routes timed: ${timings.length} · median ${median.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms (Node emulator wall time)`);

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
