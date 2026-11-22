import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

mkdirSync('audit', { recursive: true });
const health = async () => {
  try { return (await fetch('http://localhost:8787/health', { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
};
if (process.argv.includes('--restart')) {
  const pid = Number(readFileSync('audit/worker.pid', 'utf8'));
  try { process.kill(-pid, 'SIGTERM'); }
  catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  for (let i = 0; i < 30 && await health(); i++) await delay(1000);
  if (await health()) throw new Error('Previous CI Worker did not stop');
}
const log = openSync('audit/worker.log', 'a');
const child = spawn('node_modules/.bin/wrangler', [
  'dev', '--config', 'worker/wrangler.toml', '--local', '--ip', '127.0.0.1', '--port', '8787',
  '--var', 'ALLOWED_ORIGINS:http://localhost:3311',
], { detached: true, stdio: ['ignore', log, log], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
writeFileSync('audit/worker.pid', String(child.pid));
child.unref();
for (let i = 0; i < 60; i++) {
  if (await health()) {
    console.log('PASS local signaling Worker ready on http://localhost:8787');
    process.exit(0);
  }
  await delay(1000);
}
console.error(readFileSync('audit/worker.log', 'utf8'));
throw new Error('Local signaling Worker failed readiness');
