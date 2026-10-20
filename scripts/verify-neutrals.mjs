// scripts/verify-neutrals.mjs — Phase 2 gate for design/apple-grade.
//
// Three duties (docs/design-tokens.md):
//  1. PIN the approved brief neutrals: every pinned token literal must be
//     present in the source of truth (no drift-by-edit).
//  2. WARM-CAST detector: scan every surface/chrome file for near-neutral
//     colors that carry a visible warm cast (OKLCH chroma 0.002–0.03 in the
//     red→yellow hue band) — the "cream / paper / brown tint" slop this
//     branch exists to remove. Saturated colors (C > 0.03) are the brand or
//     semantic families and are exempt; named semantic/brand tokens are
//     exempt even when they are light washes.
//  3. CONTRAST math: the derived light-mode ember ink and the light CTA
//     ramp must meet the brief's >= 4.5:1 white-label rule.
//
// Run: node scripts/verify-neutrals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '  ok ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

// ── color math ──────────────────────────────────────────────────────────
const hexToRgb = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const oklch = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
};
const ratio = (a, b) => {
  const lum = (h) => { const [r, g, bl] = hexToRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// ── 1. pinned brief literals ────────────────────────────────────────────
console.log('\n[1] pinned brief neutrals (docs/design-tokens.md)');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('src/index.css');
const indexHtml = read('index.html');
const manifest = read('public/manifest.json');
const themeTs = read('src/lib/theme.ts');
const guideCss = read('public/guides/_template.css');
const PIN = (hay, needle, label) => ok(hay.includes(needle), label, needle);
// light
PIN(css, '--color-bg: #fbfbfd;', 'light bg #fbfbfd');
PIN(css, '--color-bg-secondary: #f5f5f7;', 'light band #f5f5f7');
PIN(css, '--color-text: #1d1d1f;', 'light ink #1d1d1f');
PIN(css, '--color-text-secondary: #6e6e73;', 'light ink-2 #6e6e73');
PIN(css, '--color-border: rgb(0 0 0 / 0.08);', 'light line rgba(0,0,0,.08)');
PIN(css, '--color-ember-ink: #c04b09;', 'light ember-ink #c04b09');
// dark
PIN(css, '--color-bg: #181818;', 'dark bg #181818');
PIN(css, '--color-bg-secondary: #141414;', 'dark sunken #141414');
PIN(css, '--color-surface: #262626;', 'dark raised #262626');
PIN(css, '--color-border: #333333;', 'dark line #333333');
PIN(css, '--color-text: #e4e4e4;', 'dark ink #e4e4e4');
PIN(css, '--color-text-secondary: #888888;', 'dark ink-2 #888888');
// chrome surfaces
PIN(indexHtml, 'content="#fbfbfd" media="(prefers-color-scheme: light)"', 'theme-color light #fbfbfd');
PIN(indexHtml, 'content="#181818" media="(prefers-color-scheme: dark)"', 'theme-color dark #181818');
PIN(indexHtml, "meta.content = dark ? '#181818' : '#fbfbfd'", 'boot script colors');
PIN(manifest, '"background_color": "#fbfbfd"', 'manifest background #fbfbfd');
PIN(manifest, '"theme_color": "#fbfbfd"', 'manifest theme #fbfbfd');
PIN(themeTs, "'#181818' : '#fbfbfd'", 'theme.ts colors');
PIN(guideCss, '--bg: #fbfbfd;', 'guides light bg #fbfbfd');
PIN(guideCss, '--bg: #181818;', 'guides dark bg #181818');

// ── 2. warm-cast detector ───────────────────────────────────────────────
console.log('\n[2] warm-cast scan (near-neutrals must be truly neutral)');
const scanFiles = [
  'src/index.css',
  'index.html',
  'public/manifest.json',
  'public/guides/_template.css',
  ...fs.readdirSync(path.join(root, 'public/guides'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `public/guides/${f}`),
];
// Brand/semantic token names: even light washes of these carry meaning.
const NAME_EXEMPT = /(brand|ember|azure|peach|honey|gradient|status|success|warning|error|apple-blue|focus|iso-accent)/i;
const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const RGBA_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
let warmViolations = 0, colorsScanned = 0;
for (const rel of scanFiles) {
  // Strip comments first: a quoted OLD value in a history comment is not a
  // shipped color (history is allowed to name the slop it removed).
  const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.split('').map((c) => (c === '\n' ? '\n' : ' ')).join(''))
    .replace(/(^|\s)\/\/[^\r\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const text = strip(read(rel));
  for (const line of text.split('\n')) {
    // token context: nearest --name: before the color on this line
    const nameMatch = line.match(/(--[\w-]+)\s*:/);
    const tokenName = nameMatch ? nameMatch[1] : '';
    const candidates = [];
    for (const m of line.matchAll(HEX_RE)) candidates.push(m[0]);
    for (const m of line.matchAll(RGBA_RE)) {
      candidates.push('#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''));
    }
    for (const hexRaw of candidates) {
      const hex = hexRaw.toLowerCase();
      colorsScanned++;
      const { C, H } = oklch(hex);
      if (C > 0.03) continue;                                   // saturated brand/semantic
      if (C <= 0.002) continue;                                 // true neutral
      if (NAME_EXEMPT.test(tokenName)) continue;                // named brand/semantic wash
      const warm = H >= 10 && H <= 100;                         // red→yellow band
      if (warm) {
        warmViolations++;
        console.log(`  FAIL warm cast ${hex} (C=${C.toFixed(4)} hue=${H.toFixed(0)}°) ${tokenName || '(inline)'} in ${rel}`);
        console.log(`       ${line.trim().slice(0, 120)}`);
      }
    }
  }
}
ok(warmViolations === 0, `${colorsScanned} colors scanned, ${warmViolations} warm near-neutral casts`);
if (warmViolations) console.log('  (fix: pin the tint to the neutral ladder in docs/design-tokens.md §2/§3)');

// ── 3. contrast math for the derived ember ink + light CTA ramp ────────
console.log('\n[3] derived-ember contrast (>= 4.5:1)');
ok(ratio('c04b09', 'fbfbfd') >= 4.5, 'ember-ink as text on light', `${ratio('c04b09', 'fbfbfd').toFixed(2)}:1`);
ok(ratio('ffffff', 'c25310') >= 4.5, 'white on light CTA top stop #c25310', `${ratio('ffffff', 'c25310').toFixed(2)}:1`);
ok(ratio('ffffff', 'b84a0b') >= 4.5, 'white on light CTA mid stop #b84a0b', `${ratio('ffffff', 'b84a0b').toFixed(2)}:1`);
ok(ratio('ffffff', 'a94008') >= 4.5, 'white on light CTA bottom stop #a94008', `${ratio('ffffff', 'a94008').toFixed(2)}:1`);
ok(ratio('888888', '181818') >= 4.5, 'dark ink-2 on dark bg', `${ratio('888888', '181818').toFixed(2)}:1`);
ok(ratio('e4e4e4', '181818') >= 4.5, 'dark ink on dark bg', `${ratio('e4e4e4', '181818').toFixed(2)}:1`);
ok(ratio('6e6e73', 'fbfbfd') >= 4.5, 'light ink-2 on light bg', `${ratio('6e6e73', 'fbfbfd').toFixed(2)}:1`);
ok(ratio('f06413', '181818') >= 4.5, 'bright ember text on dark', `${ratio('f06413', '181818').toFixed(2)}:1`);

if (failures) {
  console.log(`\n${failures} NEUTRAL/CONTRAST CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nALL NEUTRAL CHECKS GREEN');
