#!/usr/bin/env node
/**
 * verify-browser — the browser gates, in one command, with the server they
 * need.
 *
 * Every browser gate reads BASE_URL, and every one of them used to fail with
 * ERR_CONNECTION_REFUSED unless a dev server already happened to be running on
 * localhost:3010. That is a trap: the gates are only a gate if a clean checkout
 * can run them with one command.
 *
 * This starts the dev server itself, waits for a 200, runs the list below in
 * order, and always stops the server again.
 *
 *   node scripts/verify-browser.mjs               # all of them
 *   node scripts/verify-browser.mjs sheets,typing # a subset, by name
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// The pre-push hook calls this without shell configuration. A local app
// must never quietly fall back to production signaling.
const localWorker = process.env.VITE_SIGNALING_URL || 'http://localhost:8787';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(localWorker)) {
  throw new Error('verify:browser requires a private local Worker; run npm run worker:dev');
}
process.env.VITE_CI_LOCAL_WORKER = '1';
process.env.VITE_SIGNALING_URL = localWorker;

// Own an isolated port, rather than silently testing a stale dev server.
const PORT = process.env.VERIFY_BROWSER_PORT || await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(String(port)));
  });
});
const BASE = `http://localhost:${PORT}`;
const GATES = [
  ['overlay-focus', 'verify-overlay-focus.mjs'],
  ['handoff', 'verify-handoff.mjs'],
  ['typing', 'verify-typing.mjs'],
  ['sheets', 'verify-sheets.mjs'],
  ['desktop', 'verify-desktop.mjs'],
  ['room-feed', 'verify-room-feed.mjs'],
  ['no-flash', 'verify-no-flash.mjs'],
  ['room-paint', 'verify-room-paint.mjs'],
  ['basics', 'verify-basics.mjs'],
  ['chaos', 'verify-chaos.mjs'],
  ['key-at-rest', 'verify-key-at-rest.mjs'],
  ['hop', 'verify-hop.mjs'],
];

const only = (() => {
  const arg = process.argv[2];
  if (!arg) return null;
  return new Set(arg.split(',').map((s) => s.trim()));
})();

const logPath = 'audit/tmp/verify-browser-server.log';
try { mkdirSync('audit/tmp', { recursive: true }); } catch { /* exists */ }
const logFd = openSync(logPath, 'a');

const server = spawn('npm', ['run', 'dev'], {
  shell: process.platform === 'win32',
  env: { ...process.env, PORT },
  stdio: ['ignore', logFd, logFd],
  detached: process.platform !== 'win32',
});

let serverUp = false;
const isUp = async () => {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
};

for (let i = 0; i < 90 && !serverUp; i += 1) {
  if (server.exitCode !== null) break;
  serverUp = await isUp();
  if (!serverUp) await sleep(1000);
}

const stopServer = () => {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  } catch { /* already gone */ }
};

if (!serverUp) {
  console.error(`[verify-browser] the dev server never answered on ${BASE} — see ${logPath}`);
  stopServer();
  process.exit(1);
}
console.log(`[verify-browser] dev server up on ${BASE}; log: ${logPath}`);

const failed = [];
for (const [name, file] of GATES) {
  if (only && !only.has(name)) continue;
  console.log(`\n──── ${name} ────`);
  // Each independent gate simulates many devices on one loopback IP. Give
  // local suites fresh volatile quotas, not weaker production rate limits.
  if (process.env.VITE_CI_LOCAL_WORKER === '1') {
    const ready = await new Promise((resolve) => {
      const worker = spawn(process.execPath, ['scripts/start-ci-worker.mjs', '--restart'], { stdio: 'inherit' });
      worker.on('exit', (code) => resolve(code ?? 1));
    });
    if (ready !== 0) { failed.push(`${name} (local Worker setup)`); break; }
  }
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [`scripts/${file}`], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: BASE, URL: BASE },
    });
    child.on('exit', (c) => resolve(c ?? 1));
  });
  if (code !== 0) failed.push(name);
}

stopServer();
await sleep(500);

if (failed.length) {
  console.error(`\n[verify-browser] FAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\n[verify-browser] GREEN — every browser gate passed');
process.exit(0);
