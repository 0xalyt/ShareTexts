import { readFileSync, writeFileSync } from 'fs';
const en = readFileSync('src/lib/messages/en.ts', 'utf8');
const s = en.indexOf('// ── space codes (F21)');
const seg = en.slice(s, en.indexOf('\n\n', en.indexOf("space.shareLinkSecondary")));
const keys = [...seg.matchAll(/'(space\.[a-zA-Z]+)':/g)].map(m => m[1]);
const lines = [];
for (const k of keys) {
  const re = new RegExp("  '" + k.replace(/\./g, '\.') + "': ([\s\S]*?),\n");
  const m = en.match(re);
  if (!m) { console.error('no match for', k); process.exit(1); }
  lines.push("  '" + k + "': " + m[1] + ",");
}
const block = '\n\n  // ── space codes (F21) — English strings; localized in a following pass ──\n' + lines.join('\n') + '\n';
for (const loc of ['ar','de','es','fr','hi','ja','pt','zh']) {
  const p = 'src/lib/messages/' + loc + '.ts';
  let src = readFileSync(p, 'utf8');
  if (src.includes("'space.codeLabel'")) { console.log(loc, 'already filled'); continue; }
  const close = src.lastIndexOf('\n};');
  writeFileSync(p, src.slice(0, close) + block + src.slice(close));
  console.log(loc, 'filled', keys.length);
}
