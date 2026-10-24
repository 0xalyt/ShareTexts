#!/usr/bin/env node
// ---------------------------------------------------------------------------
// verify-csp.mjs — the CSP gate as a test, with a live-header proof.
//
//   (1) always: runs `pin-csp.mjs --check` (the build gate) as a child
//       process and reports its result;
//   (2) --live: fetches the live product pages, hashes THEIR inline scripts,
//       reads the live `content-security-policy` header and applies the
//       same two rules — every shipped inline script is pinned in the
//       header, and every pin in the header matches a shipped script.
//
// URL=<origin> overrides the live origin (default https://sharetexts.online).
// Exit code is non-zero if any check fails, in either part.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScriptBodies, sha256Pin } from './pin-csp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes('--live');
const BASE = (process.env.URL || 'https://sharetexts.online').replace(/\/+$/, '');

let failures = 0;
const out = (ok, label, detail = '') => {
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? ` \u2014 ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── 1. the build-time check ────────────────────────────────────────────────
console.log('[verify-csp] pin-csp --check (dist vs vercel.json vs server.ts):');
const chk = spawnSync(process.execPath, [path.join(HERE, 'pin-csp.mjs'), '--check'], { stdio: 'inherit' });
out(chk.status === 0, 'pin-csp --check');

// ── 2. the live policy ─────────────────────────────────────────────────────
if (LIVE) {
  console.log(`[verify-csp] live policy on ${BASE}:`);
  // /about is the rewrite that serves dist/guides/about.html — it hosts the
  // second pin, so it must be fetched or "pin matches no script" can't be
  // decided. The SEO shells host the same boot hash as /.
  const paths = ['/', '/about', '/docs', '/privacy', '/terms'];
  const livePins = new Map(); // pin -> pages shipping it
  let header = null;

  for (const p of paths) {
    try {
      const res = await fetch(BASE + p, { redirect: 'follow' });
      const html = await res.text();
      const csp = res.headers.get('content-security-policy');
      out(res.ok, `GET ${p}`, `HTTP ${res.status}`);
      if (!csp) out(false, `CSP header on ${p}`, 'missing');
      else if (header === null) header = csp;
      else out(csp === header, `CSP header identical on ${p}`, csp === header ? '' : 'DIFFERS from /');
      for (const body of inlineScriptBodies(html)) {
        const pin = sha256Pin(body);
        if (!livePins.has(pin)) livePins.set(pin, []);
        if (!livePins.get(pin).includes(p)) livePins.get(pin).push(p);
      }
    } catch (e) {
      out(false, `GET ${p}`, e.message);
    }
  }

  if (!header) {
    out(false, 'live content-security-policy header', 'never seen');
  } else {
    const src = (header.match(/script-src\s+([^;]*)/i)?.[1] ?? '').trim();
    const pinned = [...src.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
    console.log(`  script-src pins: ${pinned.join(' ') || '(none)'}`);
    for (const [pin, pgs] of livePins) {
      out(pinned.includes(pin), `shipped script pinned (${pgs.join(', ')})`,
        pinned.includes(pin) ? pin : `NOT PINNED: ${pin} — browser would block it`);
    }
    for (const pin of pinned) {
      out(livePins.has(pin), 'pin matches a shipped script',
        livePins.has(pin) ? pin : `DEAD PIN: ${pin} matches nothing on the fetched pages`);
    }
  }
}

console.log(`\n[verify-csp] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`}${LIVE ? ` (local check + live ${BASE})` : ' (local check only — add --live for the deployed header)'}`);
process.exit(failures === 0 ? 0 : 1);
