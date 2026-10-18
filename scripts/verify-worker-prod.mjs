/**
 * F26 — PRODUCTION contract verification for the Cloudflare signaling worker.
 *
 * Deliberately separate from the local suites: a locally green verify-worker /
 * verify-space-code / verify-nearby run says NOTHING about what is deployed.
 * This script only reads public, non-destructive endpoints of the deployed
 * worker — it never creates a Space, never uploads, never mutates state.
 * (The single POST /api/event probe writes one anonymous, whitelisted
 * telemetry counter — the designed-harmless contract used to date the
 * deployed build.)
 *
 * It FAILS when any Temporary-Space route falls through to the worker's
 * generic index JSON (the stale-deployment signature that broke F24), and
 * names the failure mode explicitly.
 *
 * Usage:
 *   node scripts/verify-worker-prod.mjs                       # default URL
 *   WORKER_URL=https://... node scripts/verify-worker-prod.mjs
 */
import crypto from 'node:crypto';

const BASE = (process.env.WORKER_URL || 'https://sharetext-signaling.alighttt.workers.dev').replace(/\/+$/, '');
const ALPHA = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const freshCode = () => Array.from(crypto.randomBytes(8)).map(b => ALPHA[b % ALPHA.length]).join('');

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

/** The generic fallback every unknown path hits on an OLD build. */
const isFallback = (body) => !!body && body.name === 'sharetext-signaling' && Array.isArray(body.endpoints);
let sawFallback = false;

async function probe(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(e => ({ status: 0, json: async () => ({ error: String(e) }), text: async () => String(e) }));
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  if (isFallback(json)) sawFallback = true;
  return { status: res.status, json };
}

console.log(`Production contract check — ${BASE}\n`);

/* 1. Health is present on every build — a canary that we can reach the worker at all. */
const health = await probe('/health');
check('GET /health → 200 { ok: true }', health.status === 200 && health.json?.ok === true, `status=${health.status}`);

/* 2. THE F24 CONTRACT: the code-availability check must answer with the API
 *    schema { available: boolean, suggestion? }, never the generic index. */
const free = await probe(`/space-code/check?code=${freshCode()}`);
check(
  'GET /space-code/check (fresh code) → { available: true }',
  free.status === 200 && free.json?.available === true,
  free.status === 200 && isFallback(free.json)
    ? 'STALE DEPLOYMENT — route fell through to the generic index JSON (F24 signature)'
    : `status=${free.status} body=${JSON.stringify(free.json || {}).slice(0, 80)}`,
);

/* 3. Invalid code shape → honest invalid answer, not a crash or fallback. */
const bad = await probe('/space-code/check?code=!!!!');
check(
  'GET /space-code/check (invalid shape) → { available: false, reason: invalid }',
  bad.status === 200 && bad.json?.available === false && bad.json?.reason === 'invalid',
  `status=${bad.status} body=${JSON.stringify(bad.json || {}).slice(0, 80)}`,
);

/* 4. Join-by-code route exists: an unknown code is a read-only lookup that
 *    must answer the no-oracle 404 — the generic index answers 200 instead. */
const join = await probe('/space/join-code', { method: 'POST', body: { code: freshCode() } });
check(
  'POST /space/join-code (unknown code) → 404 no-oracle',
  join.status === 404 && typeof join.json?.error === 'string',
  join.status === 200 && isFallback(join.json)
    ? 'STALE DEPLOYMENT — route fell through to the generic index JSON'
    : `status=${join.status} body=${JSON.stringify(join.json || {}).slice(0, 80)}`,
);

/* 5. Per-space routing exists: an unauthorized info probe on a random UUID
 *    must reach the Space DO and be refused (401/404) — never the index 200. */
const uuid = crypto.randomUUID();
const info = await probe(`/space/${uuid}/info`);
check(
  'GET /space/<uuid>/info (no auth) → 401/404 (route reaches the Space DO)',
  (info.status === 401 || info.status === 404) && !isFallback(info.json),
  info.status === 200 && isFallback(info.json)
    ? 'STALE DEPLOYMENT — route fell through to the generic index JSON'
    : `status=${info.status} body=${JSON.stringify(info.json || {}).slice(0, 80)}`,
);

/* 6. Space telemetry era marker: the deployed /api/event whitelist gained the
 *    space_* events in the same era as the Space routes (cf735ba). 204 = the
 *    whitelist includes space_created (current source); 400 = deployed build
 *    predates it. One anonymous counter increment — non-destructive by
 *    design (same contract as any landing-page view). */
// Raw text body (not JSON) — the route takes the event name as the body.
const evRaw = await fetch(BASE + '/api/event', { method: 'POST', body: 'product.space_created' }).catch(() => null);
check(
  'POST /api/event product.space_created → 204 (whitelist includes space events)',
  evRaw?.status === 204,
  evRaw?.status === 400
    ? 'STALE DEPLOYMENT — deployed whitelist predates the space events (build ≈ 2026-09-21 era)'
    : `status=${evRaw?.status}`,
);

/* 7. Legacy signaling routes must keep working (they do today — guard the contract). */
const lookup = await probe('/lookup', { method: 'POST', body: { room: uuid } });
check('POST /lookup (unknown room) → 404 (route present)', lookup.status === 404, `status=${lookup.status}`);
const push = await probe('/api/push', { method: 'POST', body: {} });
check('POST /api/push (bad body) → 400 (route present)', push.status === 400, `status=${push.status}`);
const stats = await probe('/stats');
check('GET /stats → 200 with roomsCreated number', stats.status === 200 && typeof stats.json?.roomsCreated === 'number', `status=${stats.status}`);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0 && sawFallback) {
  console.log('\nDEPLOYMENT REQUIRED: one or more routes answered with the generic');
  console.log('index JSON — the deployed worker build predates the current source.');
  console.log('Deploy with:  npm run worker:deploy   (see F26 report for the checklist)');
}
process.exit(failed === 0 ? 0 : 1);
