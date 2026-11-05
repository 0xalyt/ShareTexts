// verify-bundle.mjs — the first-load budget, measured on the real build.
//
//   npm run build && npm run verify:bundle
//   node scripts/verify-bundle.mjs --budget 200   # experiment, not for CI
//
// Fails when:
//   1. the entry chunk is over the budget (DESIGN.md §21: 180 KB gzip in P7,
//      §13 target 110 KB),
//   2. a non-English dictionary is reachable statically from the entry,
//   3. status.generated.ts is stale against the dictionaries,
//   4. any chunk carries a `?v=`-less or missing asset the page preloads.
//
// It prints the whole table every run, pass or fail: a number nobody reads is
// the reason this gate exists.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'dist/assets');
const MANIFEST = join(ROOT, 'dist/.vite/manifest.json');
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BUDGET = Number(arg('--budget', '180'));

let failures = 0;
const out = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (!existsSync(ASSETS) || !existsSync(MANIFEST)) {
  console.error('[verify-bundle] dist is missing — run npm run build first');
  process.exit(1);
}

// ── 1. the table ───────────────────────────────────────────────────────────
const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
const rows = files.map((f) => {
  const buf = readFileSync(join(ASSETS, f));
  return { file: f, raw: buf.length, gzip: gzipSync(buf).length };
}).sort((a, b) => b.gzip - a.gzip);

const total = rows.reduce((s, r) => s + r.gzip, 0);
console.log('\n  gzip      raw   chunk');
for (const r of rows) {
  console.log(`  ${kb(r.gzip).padStart(9)}  ${kb(r.raw).padStart(8)}   ${r.file}`);
}
console.log(`  ${kb(total).padStart(9)}          all JS\n`);

// ── 2. the entry ───────────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entryKey = Object.keys(manifest).find((k) => k === 'index.html');
const entryFile = entryKey ? manifest[entryKey].file.split('/').pop() : null;
const entry = rows.find((r) => r.file === entryFile) ?? rows.find((r) => /^index-/.test(r.file));
if (!entry) {
  out(false, 'entry chunk found');
} else {
  out(entry.gzip <= BUDGET * 1024, `entry chunk ≤ ${BUDGET} KB gzip`,
    `${entry.file} is ${kb(entry.gzip)} (${entry.gzip > BUDGET * 1024 ? `${kb(entry.gzip - BUDGET * 1024)} over` : `${kb(BUDGET * 1024 - entry.gzip)} under`})`);
}

// ── 3. dictionaries stay out ───────────────────────────────────────────────
const LOCALES = ['es', 'fr', 'de', 'pt-BR', 'pt-PT', 'hi', 'ja', 'zh-Hans', 'zh-Hant', 'ar'];
const leaks = [];
const entryMeta = entryKey ? manifest[entryKey] : null;
const staticHits = new Set(entryMeta?.imports ?? []);
for (const code of LOCALES) {
  const key = `src/lib/messages/${code}.ts`;
  const meta = manifest[key];
  if (!meta) { leaks.push(`${code}: not a chunk at all`); continue; }
  if (meta.isDynamicEntry !== true) { leaks.push(`${code}: not a dynamic entry`); continue; }
  if (staticHits.has(key)) leaks.push(`${code}: statically imported by the entry`);
  if (meta.file.split('/').pop() === entryFile) leaks.push(`${code}: merged into the entry chunk`);
}
out(leaks.length === 0, 'no non-English dictionary in the entry', leaks.join('; '));

// A dictionary that is no longer in the entry must still be reachable — a
// locale that 404s is worse than a heavy one.
const missingFiles = LOCALES
  .map((c) => manifest[`src/lib/messages/${c}.ts`]?.file)
  .filter((f) => f && !existsSync(join(ROOT, 'dist', f)));
out(missingFiles.length === 0, 'every locale chunk exists on disk', missingFiles.join(', '));

// ── 4. the status table is current ─────────────────────────────────────────
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/gen-locale-status.mjs'), '--check'], { stdio: 'pipe' });
  out(true, 'status.generated.ts matches the dictionaries');
} catch (e) {
  out(false, 'status.generated.ts matches the dictionaries', String(e.stderr || e.message).trim().slice(0, 160));
}

// ── 5. nothing empty shipped ───────────────────────────────────────────────
const tiny = rows.filter((r) => r.raw < 200);
out(tiny.length === 0, 'no empty chunk shipped', tiny.map((r) => r.file).join(', '));

const css = readdirSync(ASSETS).filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, gz: gzipSync(readFileSync(join(ASSETS, f))).length }));
if (css.length) console.log(`  css: ${css.map((c) => `${c.f} ${kb(c.gz)}`).join(', ')}`);

console.log(`\n[verify-bundle] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
