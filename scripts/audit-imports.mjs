// audit-imports.mjs — generates the component table for docs/redesign/APP-MAP.md §b.
// For every file in src/components and src/views: line count, how many distinct
// files import it, and a first-line role snippet. Verdict rules (mechanical):
//   DEAD   = zero importers outside its own file (and not referenced by testids/gates —
//            the gate note is appended so a human can flip it)
//   MERGE  = >0 importers and the file name matches a known duplicate pair
//   KEEP   = everything else
// Run: node scripts/audit-imports.mjs  (from repo root; writes markdown to stdout)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TARGET_DIRS = [join(SRC, 'components'), join(SRC, 'views')];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const allSrc = walk(SRC);
const targets = TARGET_DIRS.flatMap((d) => (existsSync(d) ? walk(d) : []));

// module specifier -> set of importing files (only for src-relative imports)
const importers = new Map();
for (const file of allSrc) {
  const text = readFileSync(file, 'utf8');
  // static `from '…'` AND dynamic `import('…')` (lazy routes) both count
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
    // resolve lazily by suffix match against known files
    if (!importers.has(spec)) importers.set(spec, new Set());
    importers.get(spec).add(relative(ROOT, file));
  }
}

const norm = (p) => p.replace(/\\/g, '/');
function resolveSpec(spec, fromFile) {
  // try extensions; compare normalized paths (Windows backslash fix)
  const base = fromFile.replace(/[\\/][^\\/]+$/, '');
  const joined = norm(join(base, spec));
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const cand = joined + ext;
    if (existsSync(cand)) return norm(cand);
  }
  return null;
}

function firstLineRole(text) {
  const m = text.match(/\/\*\*[\s\S]{0,400}?\*\//);
  if (m) {
    const line = m[0]
      .replace(/\/\*+|\*+\//g, '')
      .split('\n')
      .map((s) => s.replace(/^\s*\*?\s?/, ''))
      .join(' ')
      .trim();
    return line.slice(0, 110) + (line.length > 110 ? '…' : '');
  }
  const exp = text.match(/export\s+(default\s+)?(function|const)\s+(\w+)/);
  return exp ? `export ${exp[3]}` : '(no doc comment)';
}

const MERGE_HINTS = [
  ['LiveCodeInput', 'OtpInput'],
  ['OverlaySheet', 'ConfirmSheet'],
  ['IconButton3D', 'TactileButton'],
];

const rows = [];
for (const file of targets.sort()) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n').length;
  // count distinct importers: search all src files for imports resolving to this file
  let count = 0;
  for (const f of allSrc) {
    if (f === file) continue;
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const r = resolveSpec(m[1], f);
      if (r && r === norm(file)) { count++; break; }
    }
  }
  const name = basename(file).replace(/\.(tsx|ts)$/, '');
  let verdict = count === 0 ? 'DEAD' : 'KEEP';
  if (count > 0 && MERGE_HINTS.some(([a, b]) => (name.includes(a) && b) || (name.includes(b) && a))) {
    verdict = 'MERGE';
  }
  const gateRef = existsSync(join(ROOT, 'scripts'))
    ? readdirSync(join(ROOT, 'scripts'))
        .filter((s) => s.includes(name.toLowerCase()) || s.includes(name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()))
        .slice(0, 2)
    : [];
  rows.push(`| ${rel} | ${lines} | ${count} | ${firstLineRole(text)} | ${verdict}${gateRef.length ? ` (gate: ${gateRef.join(', ')})` : ''} |`);
}

console.log('| File | lines | imported by | role | verdict |');
console.log('|---|---:|---:|---|---|');
console.log(rows.join('\n'));
