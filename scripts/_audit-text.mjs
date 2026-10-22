// One-off text audit for APP-MAP §d (kept as a script so it can be re-run).
import { readFileSync, readdirSync } from 'node:fs';
const dir = 'src/lib/messages';
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

const KEY_RE = /^\s*'([^']+)'\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/gm;
const PH_RE = /\{[a-zA-Z0-9_]+\}/g;

const parse = (text) => {
  const map = new Map();
  for (const m of text.matchAll(KEY_RE)) map.set(m[1], m[0]);
  return map;
};

const en = parse(readFileSync(`${dir}/en.ts`, 'utf8'));
console.log('locale | keys | missing vs en | extra | placeholder mismatch');
let totalMissing = 0;
for (const f of files) {
  const keys = parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let miss = 0, extra = 0, ph = 0;
  for (const key of en.keys()) if (!keys.has(key)) miss++;
  for (const key of keys.keys()) if (!en.has(key)) extra++;
  for (const [key, val] of en) {
    if (!keys.has(key)) continue;
    const a = (val.match(PH_RE) || []).sort().join(',');
    const b = (keys.get(key).match(PH_RE) || []).sort().join(',');
    if (a !== b) ph++;
  }
  totalMissing += miss;
  console.log(`${f.replace('.ts', '')} | ${keys.size} | ${miss} | ${extra} | ${ph}`);
}
console.log(`TOTAL missing: ${totalMissing}`);
