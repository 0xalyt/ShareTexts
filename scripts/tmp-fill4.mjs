import { readFileSync, writeFileSync } from 'fs';
const en = readFileSync('src/lib/messages/en.ts', 'utf8');
const keys = ['space.codeLabel','space.codeHint','space.codeGenerate','space.codeChecking','space.codeAvailable','space.codeTakenShort','space.codeTaken','space.codeInvalid','space.codeShareHint','space.codeDisplayLabel','space.copyCode','space.joinSub','space.joinCta','space.joining','space.joinBadCode','space.joinNotFound','space.joinRate','space.joinLinkFallback','space.shareLinkSecondary'];
const lines = [];
for (const k of keys) {
  const start = en.indexOf("  '" + k + "':");
  if (start < 0) { console.error('missing in en:', k); process.exit(1); }
  const valStart = start + ("  '" + k + "':").length;
  const comma = en.indexOf(",\n", valStart);
  const val = en.slice(valStart, comma).trim();
  lines.push("  '" + k + "': " + val + ",");
}
const block = '\n  // ── space codes (F21) — English strings; localized in a following pass ──\n' + lines.join('\n') + '\n';
for (const loc of ['ar','de','es','fr','hi','ja','pt','zh']) {
  const p = 'src/lib/messages/' + loc + '.ts';
  const src = readFileSync(p, 'utf8');
  if (src.includes("'space.codeLabel'")) { console.log(loc, 'already filled'); continue; }
  // Insert BEFORE the final "\n};\n\nexport default" — anchored, not lastIndexOf.
  const anchor = src.indexOf('\n};\n');
  if (anchor < 0) { console.error(loc, 'no anchor'); process.exit(1); }
  writeFileSync(p, src.slice(0, anchor) + '\n' + block + src.slice(anchor));
  console.log(loc, 'filled', keys.length);
}
