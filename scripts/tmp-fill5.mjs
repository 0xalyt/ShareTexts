import { readFileSync, writeFileSync } from 'fs';
const en = readFileSync('src/lib/messages/en.ts', 'utf8');
const keys = ['space.codeLabel','space.codeHint','space.codeGenerate','space.codeChecking','space.codeAvailable','space.codeTakenShort','space.codeTaken','space.codeInvalid','space.codeShareHint','space.codeDisplayLabel','space.copyCode','space.joinSub','space.joinCta','space.joining','space.joinBadCode','space.joinNotFound','space.joinRate','space.joinLinkFallback','space.shareLinkSecondary'];
const lines = [];
for (const k of keys) {
  const start = en.indexOf("  '" + k + "':");
  const valStart = start + ("  '" + k + "':").length;
  const comma = en.indexOf(",\n", valStart);
  lines.push("  '" + k + "': " + en.slice(valStart, comma).trim() + ",");
}
const block = '\n  // ── space codes (F21) — English strings; localized in a following pass ──\n' + lines.join('\n') + '\n';
for (const loc of ['ar','de','es','fr','hi','ja','pt','zh']) {
  const p = 'src/lib/messages/' + loc + '.ts';
  const src = readFileSync(p, 'utf8');
  if (src.includes("'space.codeLabel'")) { console.log(loc, 'already filled'); continue; }
  const anchor = src.indexOf('};\n');
  if (anchor < 0) { console.error(loc, 'no anchor'); process.exit(1); }
  writeFileSync(p, src.slice(0, anchor) + block + '\n' + src.slice(anchor));
  console.log(loc, 'filled', keys.length);
}
