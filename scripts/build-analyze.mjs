#!/usr/bin/env node
/**
 * build:analyze — `vite build` with the bundle treemap on.
 *
 * The old script was `ANALYZE=1 vite build`, which cmd.exe refuses: on Windows
 * `npm run build:analyze` died with "'ANALYZE' is not recognized". The size gate
 * is supposed to be checked by whoever spends headroom, so it cannot be a
 * command that only works on one OS.
 *
 * Writes audit/bundle.html and audit/bundle.json.
 */
import { spawn } from 'node:child_process';

const code = await new Promise((resolve) => {
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'build'],
    { stdio: 'inherit', env: { ...process.env, ANALYZE: '1' }, shell: process.platform === 'win32' });
  child.on('exit', (c) => resolve(c ?? 1));
});
process.exit(code);
