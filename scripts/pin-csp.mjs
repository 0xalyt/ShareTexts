// ---------------------------------------------------------------------------
// pin-csp.mjs — the ONE build-time gate for the inline-script CSP pins (B1).
//
// The bug this replaces: the Content-Security-Policy script-src hashes lived
// as hand-pinned literals in TWO places (vercel.json) and code (server.ts),
// and a stale hash blocked the app's own boot script in production. Now:
//
//   • vercel.json  — the header value; its script-src pins are verified
//                    against the built HTML every time `npm run build` runs.
//   • server.ts    — computes its pins at boot from dist/ (inlineScriptPins);
//                    --check verifies that computation covers every shipped
//                    page, and flags any hand-written literal pin.
//   • seo-routes.mjs re-pins vercel.json at build time by importing
//                    productHashes() from THIS file — one implementation,
//                    two callers — so the two writers cannot drift.
//
// Modes:
//   --check (default) : exit 1 with a clear diff if an inline-script hash is
//                       missing from a policy OR a pinned hash matches no
//                       shipped script. SKIP_CSP_CHECK=1 = loud escape hatch.
//   --write           : update vercel.json in place (server.ts is dynamic —
//                       if its coverage fails, --check explains that the code,
//                       not a value, must change).
//
// Scope note: product pages = dist/index.html, dist/404.html, dist/seo/*.html
// and dist/guides/*.html. Underscore-prefixed internals (_f23r-compare.html,
// _shots/view.html) are internal proof pages, never linked — pinning their
// scripts would put dead hashes in the policy, which --check rejects.
//
// Hashing follows the browser: the HTML parser normalizes CRLF → LF before
// hashing, so bodies are LF-normalized first (.gitattributes keeps every
// checkout LF, so file bytes and parser bytes agree on every platform).
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const norm = (s) => s.replace(/\r\n/g, '\n');

/** Executable inline <script> bodies of an HTML string, CRLF→LF normalized. */
export function inlineScriptBodies(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/i.test(attrs)) continue; // external script
    const type = (attrs.match(/\stype\s*=\s*["']([^"']*)["']/i)?.[1] || '').trim().toLowerCase();
    // Missing type = classic JS; `module` and JS MIME types are executable.
    // JSON-LD / importmap / speculationrules never execute, so no pin needed.
    if (type && !/^(?:(?:text|application)\/(?:java|ecma)script|module)$/.test(type)) continue;
    const body = norm(m[2] ?? '');
    if (!body.trim()) continue;
    out.push(body);
  }
  return out;
}

/** The browser-truth pin for one script body. */
export const sha256Pin = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

/** Every built product page (relative to dist/), internals excluded. */
export function productPages(distDir = DIST) {
  const pages = [];
  const add = (rel) => {
    const p = path.join(distDir, rel);
    if (existsSync(p)) pages.push(rel);
  };
  add('index.html');
  add('404.html');
  for (const d of ['seo', 'guides']) {
    const dir = path.join(distDir, d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.startsWith('_') && /\.html$/i.test(f)) add(path.posix.join(d, f));
    }
  }
  return pages;
}

/** Map of pin → [product pages shipping that script]. */
export function productHashes(distDir = DIST) {
  const map = new Map();
  for (const rel of productPages(distDir)) {
    const html = readFileSync(path.join(distDir, rel), 'utf8');
    for (const body of inlineScriptBodies(html)) {
      const pin = sha256Pin(body);
      if (!map.has(pin)) map.set(pin, []);
      if (!map.get(pin).includes(rel)) map.get(pin).push(rel);
    }
  }
  return map;
}

/** vercel.json → the script-src pin tokens of the Content-Security-Policy. */
export function vercelPins() {
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const hdrs = (cfg.headers ?? []).flatMap((h) => h.headers ?? []);
  const csp = hdrs.find((h) => String(h.key).toLowerCase() === 'content-security-policy')?.value ?? '';
  const src = csp.match(/script-src\s+([^;]*)/i)?.[1] ?? '';
  const pins = [...src.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
  return { cfg, csp, pins };
}

/** server.ts → its literal pins (should be none) and its dynamic coverage. */
export function serverPins() {
  const ts = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const literals = [...ts.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => `'${m[1]}'`);
  const relList = ts.match(/for\s*\(\s*const\s+rel\s*of\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? '';
  const files = [...relList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const hashes = new Set(literals);
  const covered = [];
  for (const rel of files) {
    const p = path.join(DIST, rel);
    if (!existsSync(p)) continue;
    covered.push(rel);
    for (const body of inlineScriptBodies(readFileSync(p, 'utf8'))) hashes.add(sha256Pin(body));
  }
  return { literals, files, covered, hashes: [...hashes] };
}

/** The check. Returns a list of human-readable failures (empty = pass). */
export function checkPins() {
  const errs = [];
  if (!existsSync(DIST)) return ['dist/ missing — run `npm run build` first'];

  const H = productHashes();
  if (H.size === 0) errs.push('no executable inline <script> found in dist product pages — probe broken?');

  // 1. every shipped inline script must be pinned in vercel.json
  const { pins: V } = vercelPins();
  for (const [pin, pages] of H) {
    if (!V.includes(pin)) errs.push(`vercel.json is MISSING ${pin} — ships on ${pages.join(', ')} (its script would be blocked)`);
  }
  // 2. no dead pins in vercel.json
  for (const pin of V) {
    if (!H.has(pin)) errs.push(`vercel.json pins ${pin} which matches NO shipped script (dead pin — remove it)`);
  }

  // 3. server.ts's dynamic pins must cover every shipped script
  const srv = serverPins();
  if (srv.literals.length) {
    errs.push(`server.ts contains ${srv.literals.length} hand-written literal pin(s) (${srv.literals.join(' ')}) — compute them from dist/ instead (inlineScriptPins)`);
  }
  if (srv.covered.length === 0 && srv.files.length) {
    errs.push(`server.ts declares pin sources [${srv.files.join(', ')}] but none exist in dist/`);
  }
  for (const [pin, pages] of H) {
    if (!srv.hashes.includes(pin)) errs.push(`server.ts does NOT cover ${pin} (ships on ${pages.join(', ')}) — add its page to inlineScriptPins()'s file list`);
  }
  return errs;
}

export function writeVercel() {
  const { cfg, csp } = vercelPins();
  const pins = [...productHashes().keys()].sort();
  const next = csp.replace(/script-src\s+[^;]*;/i, `script-src 'self' ${pins.join(' ')};`);
  if (next === csp) return { pins, changed: false };
  let found = false;
  for (const h of cfg.headers ?? []) {
    for (const x of h.headers ?? []) {
      if (String(x.key).toLowerCase() === 'content-security-policy') { x.value = next; found = true; }
    }
  }
  if (!found) throw new Error('vercel.json has no Content-Security-Policy header to update');
  writeFileSync(path.join(ROOT, 'vercel.json'), JSON.stringify(cfg, null, 2) + '\n');
  return { pins, changed: true };
}

// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';

  if (mode === 'check' && process.env.SKIP_CSP_CHECK === '1') {
    console.log('[pin-csp] SKIP_CSP_CHECK=1 set — skipping the CSP pin check (emergency escape; the policy may be stale!)');
    process.exit(0);
  }

  if (mode === 'write') {
    const { pins, changed } = writeVercel();
    console.log(`[pin-csp] vercel.json ${changed ? 'updated' : 'already current'} — script-src pins: ${pins.join(' ')}`);
    console.log('[pin-csp] server.ts uses dynamic inlineScriptPins() — nothing to write there; check verifies its coverage.');
  }

  const errs = checkPins();
  if (errs.length) {
    console.error(`[pin-csp] FAIL — ${errs.length} problem(s):`);
    for (const e of errs) console.error(`  • ${e}`);
    console.error(mode === 'write' ? '  (--write cannot repair server.ts — its file list must change)' : '  run `node scripts/pin-csp.mjs --write` (or npm run pin-csp) after the cause is fixed');
    process.exit(1);
  }
  const H = [...productHashes().keys()];
  console.log(`[pin-csp] OK — ${H.length} inline-script pin(s) consistent across dist HTML, vercel.json and server.ts`);
  process.exit(0);
}
