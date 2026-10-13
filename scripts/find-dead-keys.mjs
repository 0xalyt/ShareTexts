// Lists en.ts keys that never appear in src/ code (dead keys) and
// vice versa: t('...') calls whose key is missing from en.ts.
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const enSrc = readFileSync(path.join(root, 'src/lib/messages/en.ts'), 'utf8');
// Keys may be single- OR double-quoted (double when the value contains an
// apostrophe) — the backreference keeps the pair honest. Matching only one
// quote style reported every double-quoted key as "missing from en.ts".
const keys = [...enSrc.matchAll(/(['"])([^'"]+)\1:/g)].map(m => m[2]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(f) && !p.includes('messages')) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(root, 'src')), path.join(root, 'index.html')];
const corpus = files.map(f => readFileSync(f, 'utf8')).join('\n');

const dead = keys.filter(k => !corpus.includes(`'${k}'`) && !corpus.includes(`"${k}"`));
console.log('DEAD KEYS (' + dead.length + '):');
for (const k of dead) console.log('  ' + k);

const used = [...corpus.matchAll(/\bt\(\s*'([^']+)'/g)].map(m => m[1]);
const missing = [...new Set(used)].filter(k => !keys.includes(k));
console.log('\nUSED BUT MISSING FROM en.ts (' + missing.length + '):');
for (const k of missing) console.log('  ' + k);
