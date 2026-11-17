#!/usr/bin/env node
/**
 * contrast-audit — measure the pairs, do not eyeball them.
 *
 * Walks every visible text node in the app, resolves the background that is
 * actually behind it (walking ancestors until an opaque colour, compositing
 * alpha over what is behind), and reports the pairs under 4.5:1 (normal text)
 * or 3:1 (large: ≥24 px, or ≥18.66 px bold). Runs light and dark.
 *
 *   BASE_URL=http://localhost:3110 node scripts/contrast-audit.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { readLiveCode } from './lib.mjs';

const ROOM = process.argv.includes('--room');

const BASE = process.env.BASE_URL || 'http://localhost:3010';
mkdirSync('audit/contrast', { recursive: true });

const browser = await chromium.launch();
const out = {};

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('sharetext.theme', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  if (ROOM) {
    // A live room, because the landing page is the surface that has already
    // been measured — the dense text lives in the thread and the rail.
    await page.getByTestId('home-send').click();
    await page.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
    const code = await readLiveCode(page);
    const peer = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await peer.goto(BASE, { waitUntil: 'domcontentloaded' });
    await peer.getByRole('button', { name: 'Receive' }).click();
    await peer.waitForTimeout(400);
    await peer.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
    await peer.waitForTimeout(1500);
    await page.getByTestId('composer').first().fill('A message long enough to sit in a bubble with meta under it');
    await page.getByTestId('send').first().click();
    await page.waitForTimeout(1200);
  }

  const rows = await page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((n) => parseFloat(n.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const bgOf = (el) => {
      let node = el;
      let acc = null;
      while (node && node !== document.documentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) acc = acc ? over(acc, c) : c;
        if (acc && acc.a === 1) return acc;
        node = node.parentElement;
      }
      return acc || { r: 255, g: 255, b: 255, a: 1 };
    };

    const found = [];
    document.querySelectorAll('p, span, a, button, li, h1, h2, h3, h4, label, div').forEach((el) => {
      if (el.children.length) return;
      const text = (el.textContent || '').trim();
      if (text.length < 2) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') return;
      const fg = parse(cs.color);
      if (!fg) return;
      const bg = bgOf(el);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const cr = ratio(over(fg, bg), bg);
      const need = large ? 3 : 4.5;
      if (cr < need) {
        found.push({
          text: text.slice(0, 34),
          color: cs.color,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          size: Math.round(size * 10) / 10,
          weight: cs.fontWeight,
          ratio: Math.round(cr * 100) / 100,
          need,
          cls: String(el.className).slice(0, 46),
        });
      }
    });
    return found;
  });

  out[theme] = rows;
  console.log(`\n── ${theme}: ${rows.length} pair(s) under the floor ──`);
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.color}|${r.bg}|${r.size}|${r.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${r.ratio}:1 (need ${r.need}) ${r.size}px ${r.color} on ${r.bg} — “${r.text}”`);
  }
  await page.screenshot({ path: `audit/contrast/${theme}.png` });
  await ctx.close();
}

writeFileSync('audit/contrast/report.json', JSON.stringify(out, null, 1));
await browser.close();
