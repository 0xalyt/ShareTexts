// check-contrast.mjs — every visible text node, measured against the pixels
// it actually sits on (§2i).
//
//   node scripts/check-contrast.mjs                       # http://localhost:3010
//   URL=https://sharetexts.online node scripts/check-contrast.mjs
//
// Thresholds (WCAG 2.2 AA):
//   · normal text  — 4.5:1   (< 24px, or < 18.66px that is not bold/700)
//   · large text   — 3:1     (>= 24px, or >= 18.66px and bold)
//   · icons        — 3:1     (the run is a single non-text glyph)
//
// Colour vs EFFECTIVE background: the translucent stack above the element is
// composited down to the page canvas, because `text-white/45` on `white/70`
// on the canvas is a different pair of numbers than either one alone.
//
// Writes audit/p2/contrast.md — grouped by selector, failures first, so a fix
// can be made by changing which token a component uses (never by darkening
// the brand orange).
import { chromium } from 'playwright';
import { URL, sleep, launchBrowser } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'audit/p2/contrast.md';
/* Each surface carries its own viewport: the phone layout is a different
   composition (door captions, the "or" divider, the intent hint), and a
   1440px-only sweep scored none of it. */
const SCREENS = [
  { name: 'landing', path: '/', ready: () => document.querySelector('h1') },
  { name: 'home', path: '/', ready: () => document.querySelector('[data-testid="home-send"]') },
  { name: 'home@phone', path: '/', viewport: { width: 390, height: 844 }, ready: () => document.querySelector('[data-testid="home-send"]') },
  { name: 'settings', path: '/', open: 'settings' },
  { name: 'send@phone', path: '/', viewport: { width: 390, height: 844 }, open: 'send' },
];

// ── The probe, injected into the page ────────────────────────────────────
/* eslint-disable no-undef */
const PROBE = () => {
  /* Any CSS colour → {r,g,b,a}. Tailwind v4 emits oklab() with a slash
     alpha, so a plain rgba() regex silently skipped every translucent token —
     the gate read "0 failing" while axe flagged five real ones. Painting the
     colour onto a 1×1 canvas and reading that pixel resolves every syntax the
     engine understands (oklab, lch, color(), hsl, rgb). */
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (c) => {
    if (!c) return null;
    const m = c.match(/^rgba?(([^)]+))$/);
    if (m) {
      const p = m[1].split(/[,s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    try {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = c; // an engine that rejects it leaves black above
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch {
      return null;
    }
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const dark = document.documentElement.classList.contains('dark');
  const canvas = dark ? { r: 24, g: 24, b: 24, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };

  /** Composite every background from <html> down to (and including) el. */
  const effectiveBg = (el) => {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) stack.unshift(n);
    let bg = canvas;
    let hasImage = false;
    for (const n of stack) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') hasImage = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) bg = over(c, bg);
    }
    return { bg, hasImage };
  };

  const rows = [];
  const seen = new Set();
  let hiddenRuns = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes) continue;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    // The demo mockups are PICTURES of the product: their mini-UI text is
    // inside aria-hidden="true" (see HeroDeviceDemo's LaptopScreen comment),
    // so it is image content, not page text. Counted, never scored.
    if (el.closest('[aria-hidden="true"]')) { hiddenRuns++; continue; }
    const fg = parse(cs.color);
    if (!fg) continue;
    const { bg, hasImage } = effectiveBg(el);
    const composited = over(fg, bg);
    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const icon = own.length <= 2 && /[\u2190-\u2BFF\uE000-\uF8FF]/u.test(own);
    const need = icon || large ? 3 : 4.5;
    const value = +ratio(composited, bg).toFixed(2);
    const key = (el.tagName + '.' + el.className).slice(0, 90) + '|' + own.slice(0, 30) + '|' + value;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      tag: el.tagName.toLowerCase(),
      cls: el.className.toString().slice(0, 120),
      text: own.slice(0, 46),
      size: +size.toFixed(1),
      weight,
      color: cs.color,
      bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      value,
      need,
      large,
      icon,
      hasImage,
      ok: value >= need,
    });
  }
  return { rows, hiddenRuns };
};
/* eslint-enable no-undef */

const browser = await launchBrowser();
const all = [];
const skipped = [];
let failures = 0;
let hiddenTotal = 0;

for (const theme of ['light', 'dark']) {
  for (const screen of SCREENS) {
    const ctx = await browser.newContext({
      viewport: screen.viewport || { width: 1440, height: 900 },
      colorScheme: theme,
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    await page.addInitScript((th) => {
      try { localStorage.setItem('sharetext.theme', th); } catch { /* private */ }
    }, theme);
    await page.goto(URL + screen.path, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 20000 });
    await sleep(800);

    if (screen.open === 'send') {
      // P3's hand-over screen: created locally (the dev server hosts the
      // socket), so it is always reachable — no worker needed.
      await page.getByTestId('home-send').click({ timeout: 10000 });
      await page.waitForSelector('[data-testid="send-code-card"]', { timeout: 20000 });
      await sleep(600);
    }

    if (screen.open === 'settings') {
      // Settings is an overlay whose trigger only exists on a CONNECTED room
      // header (the mobile More sheet does not carry it). Pairing needs the
      // signaling worker, so when that is unreachable this screen is recorded
      // as skipped — never silently counted as passing.
      let opened = false;
      const direct = page.getByTestId('open-settings');
      try {
        if (await direct.count()) {
          await direct.first().click({ force: true, timeout: 4000 });
          opened = true;
        }
      } catch { opened = false; }
      if (!opened) {
        skipped.push(screen.name);
        console.log(`${theme.padEnd(5)} ${screen.name.padEnd(8)} SKIPPED — overlay needs a connected room (worker unreachable)`);
        await ctx.close();
        continue;
      }
      await page.waitForSelector('[data-testid="settings-overlay"]', { timeout: 10000 });
      await sleep(500);
    }

    const { rows, hiddenRuns } = await page.evaluate(PROBE);
    for (const r of rows) all.push({ ...r, screen: screen.name, theme });
    hiddenTotal += hiddenRuns;
    const bad = rows.filter((r) => !r.ok);
    failures += bad.length;
    console.log(`${theme.padEnd(5)} ${screen.name.padEnd(8)} ${rows.length} text runs, ${bad.length} below AA`);
    await ctx.close();
  }
}

await browser.close();

// ── Report ────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const line = (r) =>
  `| \`${r.tag}.${r.cls.split(' ').slice(0, 3).join('.')}\` | ${r.text.replace(/\|/g, '\\|')} | ${r.color} on ${r.bg} | ${r.value}:1 | ${r.need}:1 | ${r.large ? 'large' : r.icon ? 'icon' : 'normal'} |`;
const bySelector = new Map();
for (const r of all.filter((r) => !r.ok)) {
  const key = `${r.tag}.${r.cls.split(' ').slice(0, 3).join('.')}`;
  if (!bySelector.has(key)) bySelector.set(key, []);
  bySelector.get(key).push(r);
}

const md = [
  '# Contrast report (P2)',
  '',
  `Run against \`${URL}\`. Thresholds: 4.5:1 normal, 3:1 large text and icons.`,
  'Background = the composited stack above the text, down to the page canvas.',
  'Text over a background-image is skipped (see "Skipped" at the end).',
  '',
  `**${failures} failing runs** across ${all.length} measured.`,
  '',
  '## Failures, grouped by selector',
  '',
  bySelector.size === 0
    ? 'None — every visible text run meets AA in both themes.'
    : '| selector | text | colour on background | measured | required | kind |\n| --- | --- | --- | --- | --- | --- |\n' +
      [...bySelector.entries()].flatMap(([, rs]) => rs.map(line)).join('\n'),
  '',
  '## Per screen',
  '',
  '| theme | screen | runs | failing |',
  '| --- | --- | --- | --- |',
  ...['light', 'dark'].flatMap((theme) =>
    SCREENS.map((s) => {
      const rs = all.filter((r) => r.theme === theme && r.screen === s.name);
      return `| ${theme} | ${s.name} | ${rs.length} | ${rs.filter((r) => !r.ok).length} |`;
    })),
  '',
  '## Skipped',
  '',
  skipped.length
    ? `Screens not reached: ${[...new Set(skipped)].join(', ')} — the Settings overlay's trigger lives on a connected room header, and pairing needs the signaling worker.`
    : 'No screen was skipped.',
  '',
  all.filter((r) => r.hasImage).length
    ? `${all.filter((r) => r.hasImage).length} runs sit on a background-image and cannot be measured from computed style alone.`
    : 'Nothing — no measured run sat on a background-image.',
  '',
  `${hiddenTotal} runs inside aria-hidden="true" (the demo mockups) are pictures of the product, not page text — they are not scored against AA.`,
  '',
].join('\n');
fs.writeFileSync(OUT, md);

console.log(`\nwrote ${OUT}`);
if (failures) {
  console.log(`${failures} runs below AA:`);
  for (const [sel, rs] of bySelector) {
    console.log(`  ${sel} — ${rs[0].value}:1 (need ${rs[0].need}) "${rs[0].text}"`);
  }
  process.exit(1);
}
