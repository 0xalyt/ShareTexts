// bundle-report.mjs — what is actually inside the entry chunk, by module.
//
//   ANALYZE=1 npx vite build      # writes audit/bundle.json
//   node scripts/bundle-report.mjs            # table to stdout
//   node scripts/bundle-report.mjs --md      # same, as markdown rows
//
// Sizes are gzip on the module's rendered code, which is the honest unit for
// "what does this cost the first load". A module split across chunks is
// counted once per chunk it appears in.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'audit/bundle.json');
const MD = process.argv.includes('--md');
const LIMIT = 20;

if (!existsSync(FILE)) {
  console.error('[bundle-report] audit/bundle.json missing — run ANALYZE=1 npx vite build');
  process.exit(1);
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const parts = data.nodeParts ?? {};
const metas = data.nodeMetas ?? {};

/** Walk the tree and collect the entry chunk's module uids. */
function findEntry(node) {
  if (!node) return null;
  const kids = node.children ?? [];
  for (const kid of kids) {
    if (typeof kid.isEntry === 'boolean' && kid.isEntry) return kid;
    if (/(^|\/)index-[^/]*\.js$/.test(kid.name ?? '')) return kid;
  }
  for (const kid of kids) {
    const hit = findEntry(kid);
    if (hit) return hit;
  }
  return null;
}

const entry = findEntry(data.tree);
if (!entry) {
  console.error('[bundle-report] no entry chunk found');
  process.exit(1);
}

const rows = [];
const walk = (node) => {
  if (node.uid && parts[node.uid]) {
    const p = parts[node.uid];
    const id = metas[node.uid]?.id ?? node.name ?? node.uid;
    const gz = p.gzipLength ?? 0;
    if (gz > 0) rows.push({ id: id.replace(/^.*?node_modules\//, 'node_modules/').replace(/^.*?src\//, 'src/'), gz });
  }
  for (const kid of node.children ?? []) walk(kid);
};
walk(entry);

rows.sort((a, b) => b.gz - a.gz);
const top = rows.slice(0, LIMIT);
const kb = (n) => `${(n / 1024).toFixed(1)}`;

if (MD) {
  console.log('| # | module | gzip |');
  console.log('| --- | --- | --- |');
  top.forEach((r, i) => console.log(`| ${i + 1} | \`${r.id}\` | ${kb(r.gz)} KB |`));
} else {
  console.log(`entry chunk: ${entry.name} — ${kb(rows.reduce((s, r) => s + r.gz, 0))} KB gzip across ${rows.length} modules`);
  top.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${kb(r.gz).padStart(7)} KB  ${r.id}`));
}
