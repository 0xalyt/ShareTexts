#!/usr/bin/env node
/**
 * verify-landing-motion — the page does not perform itself.
 *
 * Scroll reveals are the generated default: every section fades and slides up
 * as it enters. This gate makes the absence measurable:
 *
 *   · at load, every section and list row is already at its final state —
 *     opacity 1, no transform, no running animation
 *   · after scrolling the whole page in steps, still nothing animates
 *   · hovering the brand does not move it
 *   · a click still shows what changed: opening an FAQ answer reveals it
 *   · reduced motion: same visible page, and the answer opens without a slide
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-landing-motion.mjs
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const results = [];
const out = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

/** Every section / list row: is it resting, or mid-performance? */
const resting = (page) =>
  page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('section, section ul > li, main ul > li'));
    const bad = [];
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      const anims = el.getAnimations().length;
      if (Number(cs.opacity) < 0.99 || (cs.transform && cs.transform !== 'none') || anims > 0) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 28),
          opacity: cs.opacity,
          transform: cs.transform,
          anims,
        });
      }
    }
    return { count: nodes.length, bad: bad.slice(0, 4) };
  });

async function scrollWhole(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  let worst = { count: 0, bad: [] };
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(90);
    const r = await resting(page);
    if (r.bad.length) worst = r;
  }
  return worst;
}

/* ── 1. the landing, as delivered ───────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const atLoad = await resting(page);
out('every section is at its final state on first paint',
  atLoad.bad.length === 0 && atLoad.count > 3,
  `${atLoad.count} nodes, ${JSON.stringify(atLoad.bad)}`);

const onScroll = await scrollWhole(page);
out('scrolling reveals nothing (no fade-and-slide-up)', onScroll.bad.length === 0, JSON.stringify(onScroll.bad));
await page.evaluate(() => window.scrollTo(0, 0));

/* ── 2. hover does not travel ───────────────────────────────────────────── */
const brand = page.locator('header a[aria-label]').first();
const brandBefore = await brand.evaluate((el) => getComputedStyle(el.firstElementChild).transform);
await brand.hover();
await page.waitForTimeout(280);
const brandAfter = await brand.evaluate((el) => getComputedStyle(el.firstElementChild).transform);
out('hovering the brand does not move it', brandBefore === brandAfter && brandAfter === 'none',
  `${brandBefore} → ${brandAfter}`);

/* ── 3. a click still shows what changed ────────────────────────────────── */
const second = page.getByTestId('faq-1');
await second.scrollIntoViewIfNeeded();
const closedHeight = await page.evaluate(() => {
  const p = document.getElementById('faq-panel-1');
  return p ? p.getBoundingClientRect().height : 0;
});
await second.click();
await page.waitForTimeout(420);
const openHeight = await page.evaluate(() => {
  const p = document.getElementById('faq-panel-1');
  return p ? p.getBoundingClientRect().height : 0;
});
out('opening an answer reveals it (motion that explains the click)',
  closedHeight === 0 && openHeight > 20, `${closedHeight}px → ${Math.round(openHeight)}px`);

/* ── 4. reduced motion ──────────────────────────────────────────────────── */
const calmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const calm = await calmCtx.newPage();
await calm.goto(BASE, { waitUntil: 'domcontentloaded' });
await calm.waitForTimeout(500);
const calmLoad = await resting(calm);
out('reduced motion: the same page, still fully visible', calmLoad.bad.length === 0, JSON.stringify(calmLoad.bad));
const calmSecond = calm.getByTestId('faq-1');
await calmSecond.scrollIntoViewIfNeeded();
await calmSecond.click();
await calm.waitForTimeout(120);
const calmOpen = await calm.evaluate(() => {
  const p = document.getElementById('faq-panel-1');
  return p ? Math.round(p.getBoundingClientRect().height) : 0;
});
out('reduced motion: the answer opens without a slide', calmOpen > 20, `${calmOpen}px`);

await calmCtx.close();
await ctx.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
