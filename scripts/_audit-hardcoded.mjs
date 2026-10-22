// One-off scan for APP-MAP §d: hard-coded user-visible strings outside messages.
// Heuristic: JSX text nodes, aria-label / placeholder / title / aria-description
// attributes with literal English strings that are not passed through t().
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const files = [];
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.tsx')) files.push(p);
  }
}
walk('src');

const hits = [];
for (const f of files) {
  if (f.includes('messages')) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const s = line.trim();
    if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
    // JSX text: >Some words</  or >{"Some words"}
    const text = s.match(/>\s*([A-Z][A-Za-z0-9'’,.!?:; -]{6,})\s*</);
    if (text) hits.push({ f, i: i + 1, kind: 'text', v: text[1] });
    // attributes with literal strings
    const attr = s.match(/\b(aria-label|placeholder|title|aria-description|alt)="([A-Z][^"]{6,})"|(aria-label|placeholder|title)=\{['"]([A-Z][^'"]{6,})['"]\}/);
    if (attr) hits.push({ f, i: i + 1, kind: attr[1] || attr[3], v: attr[2] || attr[4] });
  });
}

// Rank: longer strings first (worst = long visible prose), dedupe per file+v
const seen = new Set();
const worst = hits
  .filter((h) => {
    const k = h.f + h.v;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => b.v.length - a.v.length)
  .slice(0, 40);

console.log('| file:line | kind | string |');
console.log('|---|---|---|');
for (const h of worst) console.log(`| ${relative(process.cwd(), h.f).replace(/\\/g, '/')}:${h.i} | ${h.kind} | ${h.v.replace(/\|/g, '\\|').slice(0, 90)} |`);
console.log(`\n_total raw hits: ${hits.length}_`);
