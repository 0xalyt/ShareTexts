// Hard-coded string gate (DESIGN.md §17 row "Hard-coded aria-labels outside
// messages → contract wins, P6"; P6 STEP 1d).
//
// A user-visible string that lives in a component cannot be translated, cannot
// be caught by the voice gate, and silently ships in English to every locale.
// This gate finds them and holds the line at zero for everything except two
// documented exceptions.
//
// What counts as a hit (deliberately narrow, so the gate stays true):
//   • a JSX text node with a sentence in it:  >ShareTexts, back to home<
//   • aria-label / placeholder / title / alt with a literal English value
// A string built from variables (`{count}`, `{name}`) is not a literal and is
// not flagged — that is what translation looks like.
//
// The exceptions, each with the reason it is allowed:
//   src/views/Legal.tsx · src/views/Docs.tsx
//       English-only long-form content pages. They render inside an app that
//       may be in any language, so their prose container carries lang="en";
//       translating policy and technical documentation needs a lawyer and a
//       writer, not a script. Recorded as a decision, not an oversight.
//   src/App.tsx (ErrorFallback only)
//       Rendered by the class error boundary, which sits ABOVE the i18n
//       provider: a crash means the dictionary itself may be what broke. The
//       recovery copy is deliberately static English.
//
// Run: node scripts/lint-hardcoded.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_FILES = new Set([
  'src/views/Legal.tsx',
  'src/views/Docs.tsx',
  // The command-bar diagnostics panel prints protocol state names (RTT,
  // DataChannel, route) — a developer tool surfaced in the command bar, not
  // user copy. Its one user-facing sentence is translated.
  'src/components/CommandBar.tsx',
]);

// Dev-only pages (/__kit), never in the production bundle.
const SKIP_DIRS = ['src/dev/'];

// Brand tokens are words in every language.
const BRAND = /^(ShareTexts|GitHub|Docs|About|QR)$/;

// A code pattern is a format, not a word: ABCD-72QK reads the same everywhere.
const CODE_PATTERN = /^[A-Z0-9]{3,4}[- ][A-Z0-9]{3,4}$/;

// App.tsx is scanned line-by-line, except the error fallback's own range,
// which is bounded by the comments that describe it.
const APP_FILE = 'src/App.tsx';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).split('\\').join('/');
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.tsx') && !p.includes('/messages/')) files.push(p);
  }
})('src');

const JSX_TEXT = />\s*([A-Z][A-Za-z0-9'’,.!?:; -]{6,})\s*</;
const ATTR = /\b(aria-label|aria-description|placeholder|title|alt)=("([A-Z][^"]{5,})"|\{['"]([A-Z][^'"]{5,})['"]\})/;

const hits = [];
for (const file of files) {
  if (SKIP_FILES.has(file)) continue;
  if (SKIP_DIRS.some((d) => file.startsWith(d))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inErrorFallback = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (file === APP_FILE) {
      if (/^function ErrorFallback\b/.test(line)) inErrorFallback = true;
      else if (inErrorFallback && /^}\s*$/.test(line)) inErrorFallback = false;
      if (inErrorFallback) return;
    }
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
    if (line.includes('=>')) return; // a type or a callback, not JSX text
    const text = line.match(JSX_TEXT);
    if (text && !BRAND.test(text[1])) hits.push(`${file}:${i + 1}  text   "${text[1]}"`);
    const attr = ATTR.exec(line);
    if (attr && !CODE_PATTERN.test(attr[3] || attr[4] || '')) hits.push(`${file}:${i + 1}  ${attr[1].padEnd(6)} "${attr[3] || attr[4]}"`);
  });
}

if (hits.length) {
  console.error(`lint-hardcoded: ${hits.length} user-visible string(s) outside the dictionary\n`);
  for (const h of hits) console.error(`  ${h}`);
  console.error('\nMove each one into src/lib/messages/en.ts and read it through t().');
  process.exit(1);
}

console.log(
  `lint-hardcoded: 0 hard-coded UI strings across ${files.length} components ` +
  `(${SKIP_FILES.size + 1} documented exceptions)`,
);
