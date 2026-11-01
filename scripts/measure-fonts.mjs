#!/usr/bin/env node
/**
 * measure-fonts.mjs — proof for DESIGN.md §18 step 2e (typography).
 *
 * The contract: SF first on Apple (html.apple-type), self-hosted Inter
 * everywhere else. "Inter everywhere else" is only true if the woff2 files
 * actually contain the Latin glyphs — and they did not: the two committed
 * subsets were swapped (inter-latin.woff2 held the latin-EXT face, whose
 * unicode-range excludes ASCII), so every page silently rendered Arial while
 * the CSS looked perfect. Computed font-family cannot see that; only the
 * fonts Chromium actually used can.
 *
 * So this script asks CDP CSS.getPlatformFontsForNode which face painted each
 * glyph, and fails if the H1, a button, or body text is not Inter.
 *
 *   node scripts/measure-fonts.mjs            (dev server on :3010)
 *   URL=http://localhost:3022 node scripts/measure-fonts.mjs
 *
 * Writes audit/p2/fonts.txt.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL_BASE = process.env.URL || 'http://localhost:3010';
const OUT = 'audit/p2/fonts.txt';

const shots = [
  ['H1', 'h1'],
  ['primary button label', '[data-testid="home-send"]'],
  ['body text', 'main p'],
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');

await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

// A control paints its label in a child span, so getPlatformFontsForNode on
// the button itself reports nothing. Mark the deepest element that owns a
// text node and measure that instead.
const families = async (selector) => {
  const marked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 && c.textContent.trim()) return n.nodeType === 1 ? n : n.parentElement;
        if (c.nodeType === 1) {
          const hit = walk(c);
          if (hit) return hit;
        }
      }
      return null;
    };
    const target = walk(el) || el;
    target.setAttribute('data-font-probe', '1');
    return true;
  }, selector);
  if (!marked) return null;

  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-font-probe="1"]' });
  const fonts = nodeId
    ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
    : [];
  await page.evaluate(() => document.querySelector('[data-font-probe="1"]')?.removeAttribute('data-font-probe'));
  return fonts.map((f) => ({ family: f.familyName, glyphs: f.glyphCount, custom: f.isCustomFont }));
};

const rows = [];
let failures = 0;
for (const [label, selector] of shots) {
  const fonts = await families(selector);
  if (!fonts || !fonts.length) {
    rows.push({ label, selector, fonts: [], ok: false, why: 'no node / no painted text' });
    failures++;
    continue;
  }
  const total = fonts.reduce((n, f) => n + f.glyphs, 0);
  const inter = fonts.filter((f) => f.custom && f.family === 'Inter').reduce((n, f) => n + f.glyphs, 0);
  const ok = total > 0 && inter === total;
  if (!ok) failures++;
  rows.push({ label, selector, fonts, ok, why: ok ? '' : `${inter}/${total} glyphs from Inter` });
}

// The Apple branch cannot be exercised on Windows/Linux Chromium, but we can
// still prove that the class reorders the token rather than being a no-op.
const appleBranch = await page.evaluate(() => {
  const root = document.documentElement;
  const before = getComputedStyle(root).getPropertyValue('--font-sans').trim();
  root.classList.add('apple-type');
  const after = getComputedStyle(root).getPropertyValue('--font-sans').trim();
  const family = getComputedStyle(document.querySelector('h1')).fontFamily;
  root.classList.remove('apple-type');
  const restored = getComputedStyle(root).getPropertyValue('--font-sans').trim();
  return { before, after, family, restored };
});
const appleOk =
  appleBranch.after.startsWith('-apple-system') &&
  appleBranch.family.startsWith('-apple-system') &&
  appleBranch.restored === appleBranch.before;
if (!appleOk) failures++;

// Font loading must not move anything.
const shift = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let total = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => resolve(total), 400);
    }),
);

const lines = [
  '# Platform fonts — P2 §18 step 2e',
  '',
  `URL: ${URL_BASE}  ·  engine: Chromium ${browser.version()}`,
  'Measured with CDP CSS.getPlatformFontsForNode — the face that actually',
  'painted each glyph, not the CSS that asked for it.',
  '',
];
for (const r of rows) {
  lines.push(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (${r.selector})`);
  if (!r.fonts.length) lines.push('      (nothing painted)');
  for (const f of r.fonts) {
    lines.push(`      ${f.family.padEnd(20)} glyphs=${String(f.glyphs).padStart(4)}  custom=${f.custom}`);
  }
  if (r.why) lines.push(`      → ${r.why}`);
  lines.push('');
}
lines.push(
  `${appleOk ? 'PASS' : 'FAIL'}  Apple branch: html.apple-type puts SF in front of the stack`,
  `      default  ${appleBranch.before}`,
  `      apple    ${appleBranch.after}`,
  `      h1       ${appleBranch.family}`,
  '',
  `Cumulative layout shift after first paint: ${shift.toFixed(4)}`,
  '',
  'Note: this run is a Windows/Linux Chromium. The Apple branch is proven to',
  'reorder the token, not to paint SF — that needs a real Apple device.',
);

mkdirSync('audit/p2', { recursive: true });
writeFileSync(OUT, lines.join('\n'));
console.log(lines.join('\n'));
console.log(failures === 0 ? `\nwrote ${OUT} — all font checks pass` : `\nwrote ${OUT} — ${failures} FAILED`);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
