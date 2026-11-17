#!/usr/bin/env node
/**
 * verify-seo-run — start the production build and run the SEO/AEO/GEO gate.
 *
 * `scripts/verify-seo.mjs` has existed for a while and asserts what crawlers
 * get (raw HTML, no JS) and what people get (the same URLs in a browser). It
 * was never wired to an npm script, so in practice it ran when someone
 * remembered to start `dist/server.cjs` by hand — which is the same as not
 * having it. This wrapper is the missing half: build, serve, gate, stop.
 *
 *   npm run verify:seo
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.VERIFY_SEO_PORT || '3013';
const BASE = `http://localhost:${PORT}`;
const logPath = 'audit/tmp/verify-seo-server.log';
try { mkdirSync('audit/tmp', { recursive: true }); } catch { /* exists */ }

// No shell for node itself: on Windows process.execPath contains a space
// ("C:/Program Files/nodejs/node.exe"), and quoting that through cmd.exe
// is how a runner dies with "C:/Program is not recognized". Only npm
// needs a shell.
const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: cmd === 'npm', ...opts });
    child.on('exit', (c) => resolve(c ?? 1));
  });

console.log('[verify:seo] npm run build');
const built = await run('npm', ['run', 'build'], { stdio: 'inherit' });
if (built !== 0) {
  console.error('[verify:seo] the build failed — the gate needs dist/');
  process.exit(built);
}

const logFd = openSync(logPath, 'a');
const server = spawn(process.execPath, ['dist/server.cjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT },
  stdio: ['ignore', logFd, logFd],
});

const stopServer = () => {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  } catch { /* already gone */ }
};

let up = false;
for (let i = 0; i < 60 && !up; i += 1) {
  if (server.exitCode !== null) break;
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    up = res.ok;
  } catch { up = false; }
  if (!up) await sleep(500);
}

if (!up) {
  console.error(`[verify:seo] the production server never answered on ${BASE} — see ${logPath}`);
  stopServer();
  process.exit(1);
}
console.log(`[verify:seo] production server up on ${BASE}; log: ${logPath}`);

const code = await run(process.execPath, ['scripts/verify-seo.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, URL: BASE, BASE_URL: BASE },
});

stopServer();
await sleep(400);
process.exit(code);
