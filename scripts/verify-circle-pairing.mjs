// Circle pairing gate — the four moves, end to end, against a REAL Worker.
//
// Bundles the production `pairing.ts` (with its `api.ts` + `seal.ts`) and runs
// it against `wrangler dev` on 127.0.0.1:8787, so what is measured is the
// shipped code talking to the shipped Durable Object:
//   create → invite (client-owned secret) → join as pending → four emoji on both
//   sides → approve (wrap + signed chain entry) → the joiner unwraps K and can
//   read what the other device sealed → an invite is single use → a swapped key
//   changes the emoji → wrong code and non-member are refused.
//
// Start the Worker first:  npm run worker:dev
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-pairing-'));
const out = await build({
  entryPoints: {
    pairing: path.join(root, 'src', 'lib', 'circle', 'pairing.ts'),
    api: path.join(root, 'src', 'lib', 'circle', 'api.ts'),
    seal: path.join(root, 'src', 'lib', 'circle', 'seal.ts'),
  },
  bundle: true, format: 'esm', platform: 'neutral', outdir: tmp, write: false, logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);
const bust = '?t=' + Date.now();
const P = await import(pathToFileURL(path.join(tmp, 'pairing.js')).href + bust);
const A_ = await import(pathToFileURL(path.join(tmp, 'api.js')).href + bust);
const SEAL = await import(pathToFileURL(path.join(tmp, 'seal.js')).href + bust);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
const enc = new TextEncoder();

async function device() {
  const sign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const dh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const spki = await crypto.subtle.exportKey('spki', sign.publicKey);
  return {
    deviceId: b64(await crypto.subtle.digest('SHA-256', spki)).replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase(),
    signPub: b64(spki),
    dhPub: b64(await crypto.subtle.exportKey('spki', dh.publicKey)),
    // generateKey() returns PAIRS: the identity carries the private halves.
    sign: sign.privateKey,
    dh: dh.privateKey,
  };
}

const health = await fetch(`${BASE}/health`).catch(() => null);
if (!health || !health.ok) {
  console.log(`FAIL  the local Worker is not answering on ${BASE} — run \`npm run worker:dev\` first`);
  process.exit(1);
}

const A = await device();
const B = await device();
const C = await device();
const clientA = new A_.CircleClient(BASE, A);
const clientB = new A_.CircleClient(BASE, B);

// ── 1. create ───────────────────────────────────────────────────────────────
const material = await P.createCircle(clientA);
check('one device creates the circle and holds K', !!material.circleId && material.keyRaw.length === 32);

// ── 2. invite ───────────────────────────────────────────────────────────────
const invite = await P.startInvite(clientA, material.circleId);
check('an invite has a code, a client-owned secret and a fragment',
  /^[A-Z2-9]{8}$/.test(invite.code) && invite.joinSecret.length > 20 && invite.fragment.startsWith('#j='),
  invite.code);
check('the server never receives the join secret',
  !JSON.stringify(await clientA.readLog(material.circleId)).includes(invite.joinSecret));

const parsed = A_.parseInviteFragment(invite.fragment);
check('the fragment round-trips to (circleId, joinSecret)',
  parsed?.circleId === material.circleId && parsed?.joinSecret === invite.joinSecret);

// ── 3. join as pending ──────────────────────────────────────────────────────
const joined = await P.joinWithInvite(clientB, {
  circleId: material.circleId, inviteId: invite.inviteId, code: invite.code,
});
check('the joiner becomes pending with a transcript hash', /^[0-9a-f]{64}$/.test(joined.transcript));

const pending = await P.pendingJoiner(clientA, material.circleId);
check('the inviter sees exactly one pending device', pending?.deviceId === B.deviceId);

const membersBefore = await clientA.members(material.circleId);
check('a pending device is not a member yet', membersBefore.members.length === 1);

// ── 4a. the four emoji ──────────────────────────────────────────────────────
const sasA = await P.comparisonEmoji(A.dh, B.dhPub, invite.joinSecret, joined.transcript);
const sasB = await P.comparisonEmoji(B.dh, A.dhPub, invite.joinSecret, joined.transcript);
check('both devices show the same four emoji', sasA.join(' ') === sasB.join(' '), sasA.join(' '));

const sasEvil = await P.comparisonEmoji(C.dh, A.dhPub, invite.joinSecret, joined.transcript);
check('a swapped key produces different emoji', sasEvil.join(' ') !== sasA.join(' '), sasEvil.join(' '));

// ── 4b. approval ────────────────────────────────────────────────────────────
const approval = await P.approveJoiner({
  client: clientA, material, joiner: pending, myDh: A.dh,
});
check('approval wraps K for the joiner and records an epoch', !!approval.wrapped && approval.epoch === 1);

const opened = await P.unwrapFromInviter(B.dh, A.dhPub, approval.wrapped, material.circleId);
// K is an HKDF base key (ADR: never a raw bytes handle), so items are sealed
// with a per-item key derived from it — exactly what the app does.
const itemKeyA = await SEAL.deriveItemKey(material.key, 'item-1');
const itemKeyB = await SEAL.deriveItemKey(opened, 'item-1');
const iv = new Uint8Array(12);
const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, itemKeyA, enc.encode('hello other device'));
const clear = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, itemKeyB, sealed));
check('the joiner unwraps the same K and reads what the inviter sealed', clear === 'hello other device');

const membersAfter = await clientB.members(material.circleId);
check('the circle now lists two devices, and B can read it too',
  membersAfter.members.length === 2 && membersAfter.members.some((m) => m.deviceId === B.deviceId));
check('a wrap exists for the joiner at epoch 1',
  membersAfter.wraps.some((w) => w.deviceId === B.deviceId && w.epoch === 1));

// ── refusals ────────────────────────────────────────────────────────────────
let usedCode = '';
try {
  await P.joinWithInvite(await (async () => {
    const d = await device();
    return new A_.CircleClient(BASE, d);
  })(), { circleId: material.circleId, inviteId: invite.inviteId, code: '' });
} catch (err) { usedCode = err.code || err.message; }
check('a spent invite cannot link another device', usedCode === 'INVITE_USED', usedCode);

const wrongInvite = await P.startInvite(clientA, material.circleId);
let wrong = '';
try {
  await P.joinWithInvite(clientB, { circleId: material.circleId, inviteId: wrongInvite.inviteId, code: 'ZZZZZZZZ' });
} catch (err) { wrong = err.code || err.message; }
check('a wrong code is refused', wrong === 'BAD_CODE', wrong);

let outsider = '';
try {
  await new A_.CircleClient(BASE, C).members(material.circleId);
} catch (err) { outsider = err.code || err.message; }
check('a device outside the circle cannot read it', outsider === 'NOT_A_MEMBER', outsider);

let badId = '';
try {
  await new A_.CircleClient(BASE, B).invite(material.circleId, 'deadbeef');
} catch (err) { badId = err.code || err.message; }
check('the server rejects a malformed invite id', badId === 'BAD_INVITE', badId);

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
