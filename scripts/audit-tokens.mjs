// audit-tokens.mjs — generates the token table for docs/redesign/APP-MAP.md §c.
// Parses src/index.css: every --color-*, --st-*, --radius-*, --shadow-* declared
// in @theme (light) and whether html.dark overrides it. Usage count = occurrences
// of var(--name) + Tailwind class names derived from the token (bg-/text-/border-
// + last segments) across src/. Duplicate values across names are grouped.
// Run: node scripts/audit-tokens.mjs  (markdown to stdout)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('src/index.css', 'utf8');

// split light (top-level @theme block) vs dark (html.dark { ... }) roughly
const darkIdx = css.indexOf('html.dark {');
const lightPart = darkIdx > -1 ? css.slice(0, darkIdx) : css;
const darkPart = darkIdx > -1 ? css.slice(darkIdx) : '';

function decls(text, prefix) {
  // prefix: light decls = first occurrence only (a var may re-declare later)
  const map = new Map();
  const re = /(--(?:color|st|radius|shadow|iso|ease|motion|font|gradient)-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (!prefix.some((p) => name.startsWith(p))) continue;
    if (!map.has(name)) map.set(name, m[2].trim());
  }
  return map;
}

const PREFIXES = ['--color-', '--st-', '--radius-', '--shadow-'];
const light = decls(lightPart, PREFIXES);
const dark = decls(darkPart, PREFIXES);

// usage counting across src/
const files = [];
function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|css)$/.test(n)) files.push(p);
  }
}
walk('src');
const corpus = files.map((f) => readFileSync(f, 'utf8'));

function usage(name) {
  const bare = name.replace(/^--/, '');
  let c = 0;
  for (const t of corpus) {
    c += (t.match(new RegExp(`var\\(\\${name}\\b`, 'g')) || []).length;
    // tailwind class form: color-apple-ink, bg-apple-ink, border-apple-divider …
    const tail = bare.replace(/^(color|st|radius|shadow)-/, '');
    c += (t.match(new RegExp(`(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration|divide|from|to|via)-${tail.replace(/[-/]/g, '\\$&')}\\b`, 'g')) || []).length;
  }
  return c;
}

function darkOverride(name) {
  for (const [k, v] of dark) if (k === name) return v;
  return null;
}

// group by identical light value (aliases that lie together)
const byValue = new Map();
for (const [n, v] of light) {
  const key = v.toLowerCase();
  if (!byValue.has(key)) byValue.set(key, []);
  byValue.get(key).push(n);
}

const rows = [];
for (const [name, lv] of light) {
  const dv = darkOverride(name);
  const dup = byValue.get(lv.toLowerCase()) || [];
  const aliases = dup.filter((n) => n !== name);
  const lying = /apple-blue|azure|ember|brand/.test(name) && /f06413|fb7a2e|d9560e|b3450b/i.test(lv);
  rows.push(
    `| ${name} | ${lv} | ${dv ?? '—'} | ${usage(name)} | ${aliases.length ? aliases.join(', ') : '—'}${lying ? ' | **NAME LIES**' : ''} |`
  );
}

console.log('| token | light | dark | uses | same value as |');
console.log('|---|---|---|---:|---|');
console.log(rows.join('\n'));
console.log(`\n_${light.size} light declarations, ${dark.size} dark overrides, counted across ${corpus.length} src files._`);
