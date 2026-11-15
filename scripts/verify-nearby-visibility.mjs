// Nearby visibility gate — AirDrop's "Everyone for 10 minutes", with OFF as
// the default for strangers.
//
// Runs the REAL src/lib/nearby.ts in Node against a fake sessionStorage, a fake
// socket and a controllable clock, because the interesting behaviour is all in
// the guards: what happens before the window opens, when it closes, and after
// the tab has been asleep.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-vis-'));
// The two modules nearby.ts imports for logging are noise in a gate; socket is
// a type-only import and disappears at build time.
writeFileSync(path.join(tmp, 'stub.ts'), 'export const devLog = () => {};\nexport const diag = () => {};\n');
const out = await build({
  entryPoints: { nearby: path.join(root, 'src', 'lib', 'nearby.ts') },
  bundle: true, format: 'esm', platform: 'neutral', outdir: tmp, write: false, logLevel: 'silent',
  plugins: [{
    name: 'stub-logging',
    setup(b) {
      b.onResolve({ filter: /(devlog|diag)$/ }, () => ({ path: path.join(tmp, 'stub.ts') }));
    },
  }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);

// ── fake browser ───────────────────────────────────────────────────────────
let fakeNow = Date.UTC(2026, 10, 15, 12, 0, 0);
const realNow = Date.now;
Date.now = () => fakeNow;

const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
// Node 21+ defines navigator as a getter-only global, so redefine it.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36' },
  configurable: true,
});

const nearby = await import(pathToFileURL(path.join(tmp, 'nearby.js')).href + '?t=' + realNow());

function fakeSocket() {
  const sent = [];
  return {
    sent,
    connected: true,
    on() {}, off() {},
    emit(event, payload, cb) {
      sent.push({ event, payload });
      if (event === 'presence_announce') cb?.({ success: true, token: 'a'.repeat(32) });
      else cb?.({ success: true });
    },
  };
}

console.log('nearby visibility gate — 10-minute window');
console.log('  target: src/lib/nearby.ts (real module, fake storage/socket/clock)\n');

// ── 1. OFF by default ──────────────────────────────────────────────────────
check('a fresh device is NOT visible', nearby.isPresenceVisible() === false);
check('the old "hidden" accessor agrees', nearby.isPresenceHidden() === true);
check('the window is ten minutes', nearby.NEARBY_VISIBLE_MS === 600_000);

const offSocket = fakeSocket();
nearby.nearbyPresence.attach(offSocket, 'Garv’s laptop');
await new Promise((r) => setTimeout(r, 20));
const offAnnounces = offSocket.sent.filter((m) => m.event === 'presence_announce');
check('while Off, nothing is announced', offAnnounces.length === 0,
  offSocket.sent.map((m) => m.event).join(',') || 'no frames at all');
check('while Off there is no presence token', nearby.nearbyPresence.getSelfToken() === null);
nearby.nearbyPresence.stop(offSocket);

// ── 2. turning it on ───────────────────────────────────────────────────────
const deadline = nearby.startVisibleFor();
check('turning it on sets a deadline ten minutes out', deadline === fakeNow + 600_000);
check('the deadline is what the UI reads', nearby.visibleUntil() === deadline);
check('and the device is now visible', nearby.isPresenceVisible() === true);

const onSocket = fakeSocket();
nearby.nearbyPresence.attach(onSocket, 'Garv’s laptop');
await new Promise((r) => setTimeout(r, 20));
const announce = onSocket.sent.find((m) => m.event === 'presence_announce');
check('now it announces', !!announce);
check('the announce carries no GPU hint',
  !!announce && !('gpu' in (announce.payload || {})),
  announce ? Object.keys(announce.payload).sort().join(',') : '');
check('the announce keeps the coarse display hints',
  !!announce && ['kind', 'browser', 'model'].every((k) => k in announce.payload));
check('the server token is adopted', nearby.nearbyPresence.getSelfToken() === 'a'.repeat(32));

// ── 3. the window closes by itself ─────────────────────────────────────────
fakeNow = deadline + 1;
check('past the deadline the device is not visible', nearby.isPresenceVisible() === false);
check('visibleUntil() clears the expired deadline', nearby.visibleUntil() === 0 && !store.has('sharetext.presenceVisibleUntil.v1'));
nearby.nearbyPresence.stop(onSocket);

// The next keepalive (45s) is what notices a closed window in the wild; here
// we trigger the same code path directly instead of waiting 45 real seconds.
const afterWindow = fakeSocket();
await new Promise((resolve) => {
  nearby.nearbyPresence.attach(afterWindow, 'Garv’s laptop');
  setTimeout(resolve, 30);
});
check('after the window it withdraws instead of re-announcing',
  afterWindow.sent.some((m) => m.event === 'presence_withdraw')
  && !afterWindow.sent.some((m) => m.event === 'presence_announce'),
  afterWindow.sent.map((m) => m.event).join(',') || 'no frames');
nearby.nearbyPresence.stop(afterWindow);

// And the timer itself: a window short enough to watch close.
store.clear();
nearby.startVisibleFor(80);
const shortSocket = fakeSocket();
nearby.nearbyPresence.attach(shortSocket, 'Garv’s laptop');
await new Promise((r) => setTimeout(r, 30));
const announcedInWindow = shortSocket.sent.some((m) => m.event === 'presence_announce');
await new Promise((r) => setTimeout(r, 400));
check('a window that closes while open withdraws on its own timer',
  announcedInWindow && shortSocket.sent.some((m) => m.event === 'presence_withdraw'),
  shortSocket.sent.map((m) => m.event).join(','));
nearby.nearbyPresence.stop(shortSocket);

// ── 4. token rotation between sessions ─────────────────────────────────────
store.clear();
nearby.startVisibleFor();
const firstId = nearby.getOrCreateDeviceId();
nearby.stopVisible();
check('turning it off drops the session device id', !store.has('sharetext.deviceId.v1'));
nearby.startVisibleFor();
const secondId = nearby.getOrCreateDeviceId();
check('a new visibility session is a new presence id', firstId !== secondId,
  `${firstId.slice(0, 8)}… → ${secondId.slice(0, 8)}…`);

// ── 5. the deadline survives a reload ──────────────────────────────────────
const stored = Number(store.get('sharetext.presenceVisibleUntil.v1'));
check('the deadline is stored, not a countdown', stored > fakeNow && stored === fakeNow + 600_000);
fakeNow += 4 * 60_000;
check('four minutes later, six remain', nearby.visibleUntil() - fakeNow === 360_000);

// ── 6. a tab that slept through the window ─────────────────────────────────
fakeNow += 7 * 60_000; // total 11 minutes: window closed while asleep
check('a tab that slept past the deadline reports Off', nearby.isPresenceVisible() === false);

Date.now = realNow;
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
