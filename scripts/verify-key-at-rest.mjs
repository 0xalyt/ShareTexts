#!/usr/bin/env node
/**
 * verify-key-at-rest — a stolen IndexedDB dump must not be a stolen circle.
 *
 * OD-10: `store.ts` used to keep the raw 32 bytes of K beside the import. This
 * gate runs the real module in a real browser against a real IndexedDB, then
 * dumps every object store and looks for those bytes.
 *
 * It starts its own dev server (Vite middleware serves `/src/...`), so a clean
 * checkout can run it with one command:
 *
 *   node scripts/verify-key-at-rest.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, webkit } from 'playwright';
import { resolveChrome } from './lib.mjs';

// The shell exports PORT=0; this gate owns its port.
const PORT = process.env.KEY_AT_REST_PORT || '3101';
const BASE = `http://localhost:${PORT}`;
mkdirSync('audit/tmp', { recursive: true });
const logFd = openSync('audit/tmp/key-at-rest-server.log', 'a');

const server = spawn('npm', ['run', 'dev'], {
  shell: true,
  env: { ...process.env, PORT },
  stdio: ['ignore', logFd, logFd],
});

const stop = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-server.pid, 'SIGTERM');
  } catch { /* gone */ }
};

let up = false;
for (let i = 0; i < 90 && !up; i += 1) {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) });
    up = res.ok;
  } catch { /* not yet */ }
  if (!up) await sleep(1000);
}
if (!up) {
  console.error(`[key-at-rest] dev server never answered on ${BASE}`);
  stop();
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ executablePath: engine === chromium ? resolveChrome() : undefined });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const S = await import('/src/lib/circle/store.ts');
  const seal = await import('/src/lib/circle/seal.ts');

  const hexOf = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');

  const dump = async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('sharetext-circle');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const names = Array.from(db.objectStoreNames);
    const out = {};
    for (const n of names) {
      out[n] = await new Promise((res, rej) => {
        const t = db.transaction(n, 'readonly');
        const q = t.objectStore(n).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    db.close();
    return out;
  };

  // Serialise everything a dump would hand an attacker: bytes become hex, a
  // CryptoKey becomes its handle (type/algorithm/usages), never material.
  const flatten = (v) => {
    if (v == null) return '';
    if (v instanceof Uint8Array) return hexOf(v);
    if (v instanceof ArrayBuffer) return hexOf(new Uint8Array(v));
    if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) {
      return JSON.stringify({ type: v.type, extractable: v.extractable, alg: v.algorithm, usages: v.usages });
    }
    if (Array.isArray(v)) return v.map(flatten).join('|');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}=${flatten(x)}`).join(';');
    return String(v);
  };

  const K = crypto.getRandomValues(new Uint8Array(32));
  const keyK = hexOf(K);
  const wrap = await S.getWrapKey();
  const wrapExtractable = wrap.extractable;

  await S.saveCircle({ circleId: 'c-at-rest', epoch: 1, createdAt: Date.now(), key: await seal.importCircleKey(K), keyRaw: K });
  const afterSave = flatten(await dump());

  // A v1 record, exactly as the previous version wrote it.
  const K2 = crypto.getRandomValues(new Uint8Array(32));
  const k2 = hexOf(K2);
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('sharetext-circle');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const t = db.transaction('circles', 'readwrite');
    const q = t.objectStore('circles').put({
      circleId: 'c-v1', epoch: 3, createdAt: Date.now(), key: null, keyRaw: K2,
    });
    q.onsuccess = () => res();
    q.onerror = () => rej(q.error);
  });
  db.close();

  const beforeMigration = flatten(await dump());
  const migrated = await S.loadCircle('c-v1');
  const afterMigration = flatten(await dump());

  const reopened = await S.openStoredCircle('c-at-rest');
  const bytes = await S.withCircleKey('c-at-rest', async (b) => hexOf(new Uint8Array(b)));

  return {
    wrapExtractable,
    keyInSave: afterSave.includes(keyK),
    key2Before: beforeMigration.includes(k2),
    key2After: afterMigration.includes(k2),
    migratedHasRaw: !!migrated?.keyRaw,
    migratedSealed: !!migrated?.keySealed,
    openedOk: !!reopened && !!reopened.keySealed,
    keyRoundTrip: bytes === keyK,
    stores: Object.keys(await dump()),
  };
});

ok('the device wrap key is non-extractable', result.wrapExtractable === false);
ok('after saveCircle, K’s 32 bytes appear nowhere in IndexedDB', !result.keyInSave);
ok('a v1 record does hold raw K before migration (the test can see it)', result.key2Before);
ok('after the migration read, raw K is gone from IndexedDB', !result.key2After);
ok('the migrated record has no keyRaw field', result.migratedHasRaw === false);
ok('the migrated record carries keySealed', result.migratedSealed === true);
ok('openStoredCircle still opens a sealed circle', result.openedOk);
ok('withCircleKey still returns K’s exact bytes', result.keyRoundTrip);
ok('the database has both stores', result.stores.includes('circles') && result.stores.includes('device'),
  result.stores.join(', '));

await browser.close();
stop();
await sleep(300);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
