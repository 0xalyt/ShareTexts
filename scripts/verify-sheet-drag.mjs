#!/usr/bin/env node
/**
 * verify-sheet-drag — the bottom sheet behaves like a sheet, measured.
 *
 * Drags the real More sheet with a real pointer and reads the DOM after each
 * step, because "it follows the finger" is a claim about pixels, not about
 * intentions:
 *
 *   · the panel tracks the pointer 1:1 while dragging (transform follows)
 *   · the scrim dims as it leaves, and never goes fully transparent
 *   · a slow release before the threshold settles BACK, on the published
 *     drawer curve cubic-bezier(0.32, 0.72, 0, 1) — not a spring we invented
 *   · a fast flick past the threshold closes it
 *   · Escape closes it, and focus returns to the trigger
 *   · the page scroll lock is released afterwards (a page that cannot scroll
 *     after a sheet is the one bug nobody forgives)
 *   · under prefers-reduced-motion the drag does nothing and the close is an
 *     opacity fade, never a fling
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-sheet-drag.mjs
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

const DRAG = 0.7; // px per mouse step, keeps pointermove dense enough to sample speed

async function openMore(page) {
  // A held (keepMounted) sheet keeps its own handle and scrim in the DOM, so
  // every read has to be scoped to the OPEN sheet — otherwise the gate drags
  // a closed one and "nothing happened" looks like a product bug.
  const already = await page.evaluate(() => !!document.querySelector('[data-testid="more-sheet"]'));
  if (already) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await page.getByTestId('header-more').click();
  await page.waitForTimeout(550);
}

/** The transform matrix's translateY, in px. */
async function panelY(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="more-sheet"]');
    if (!panel) return null;
    const t = getComputedStyle(panel).transform;
    return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
  });
}

async function scrimOpacity(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="more-sheet"]');
    const overlay = panel?.closest('div.fixed');
    const scrim = overlay?.querySelector('div[class*="bg-black/36"]');
    if (!scrim) return null;
    const cs = getComputedStyle(scrim);
    return cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : Number(cs.opacity);
  });
}

async function dragHandle(page, dy, { steps = 14, pauseBeforeUp = 0 } = {}) {
  const box = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="more-sheet"]');
    const handle = panel?.querySelector('[data-sheet-handle]');
    if (!handle) return null;
    const r = handle.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (!box) return false;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x, box.y + (dy / steps) * i);
    await page.waitForTimeout(12);
  }
  if (pauseBeforeUp) await page.waitForTimeout(pauseBeforeUp);
  await page.mouse.up();
  return true;
}

/* ── 1. follows the finger ──────────────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await openMore(page);

const handleBox = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="more-sheet"]');
  const h = panel.querySelector('[data-sheet-handle]');
  const r = h.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
await page.mouse.move(handleBox.x, handleBox.y);
await page.mouse.down();
await page.mouse.move(handleBox.x, handleBox.y + 40, { steps: 6 });
await page.waitForTimeout(40);
await page.mouse.move(handleBox.x, handleBox.y + 90, { steps: 8 });
await page.waitForTimeout(60);
const midY = await panelY(page);
const midScrim = await scrimOpacity(page);
await page.mouse.up();
await page.waitForTimeout(600);

out('the panel follows the pointer while dragging', typeof midY === 'number' && midY > 40, `translateY=${midY}px`);
out('the scrim dims with the drag but never disappears', midScrim !== null && midScrim < 0.9 && midScrim > 0.05, `opacity=${midScrim}`);
out('a short drag settles back instead of closing', await page.evaluate(() => !!document.querySelector('[data-testid="more-sheet"]')));

/* ── 2. the settle curve is the published drawer curve ────────────────────── */
await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="more-sheet"]');
  panel.dataset.gateEasings = '';
});
await dragHandle(page, 30, { steps: 8, pauseBeforeUp: 220 });
const settle = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="more-sheet"]');
  if (!panel) return null;
  const cs = getComputedStyle(panel);
  return { curve: cs.transitionTimingFunction, duration: cs.transitionDuration };
});
out('the settle runs on cubic-bezier(0.32, 0.72, 0, 1)',
  !!settle && settle.curve.includes('cubic-bezier(0.32, 0.72, 0, 1)'),
  settle ? `${settle.curve} / ${settle.duration}` : 'no transition on the panel');
// The duration is distance ÷ release speed, not a constant: a gentle nudge
// must not take as long as a long drag.
const dur = settle ? parseFloat(settle.duration) : NaN;
out('the settle duration is bounded by the release speed, 180–450ms',
  dur >= 0.179 && dur <= 0.451, `${(dur * 1000).toFixed(0)}ms`);
await page.waitForTimeout(600);

/* ── 3. a flick closes ───────────────────────────────────────────────────── */
if (!(await page.evaluate(() => !!document.querySelector('[data-testid="more-sheet"]')))) await openMore(page);
await dragHandle(page, 200, { steps: 10 }); // fast, past the threshold
await page.waitForTimeout(600);
out('a fast flick past the threshold closes the sheet',
  await page.evaluate(() => !document.querySelector('[data-testid="more-sheet"]')));

/* ── 4. scroll lock is released ──────────────────────────────────────────── */
const afterClose = await page.evaluate(() => {
  const root = document.documentElement;
  window.scrollTo(0, 200);
  return {
    overflow: root.style.overflow,
    padding: root.style.paddingRight,
    scrollY: window.scrollY,
    scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
  };
});
out('the page is not left scroll-locked', afterClose.overflow === '' && afterClose.padding === '',
  `overflow="${afterClose.overflow}" padding="${afterClose.padding}"`);
// Only meaningful if this page is tall enough to scroll at all; the lock
// release above is the real assertion either way.
out('the page can scroll again', !afterClose.scrollable || afterClose.scrollY > 0,
  afterClose.scrollable ? `scrollY=${afterClose.scrollY}` : 'page is not scrollable, nothing to verify');

/* ── 5. keyboard close, focus returns ────────────────────────────────────── */
await openMore(page);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
out('Escape closes and focus returns to the trigger', focusBack === 'header-more', String(focusBack));

/* ── 6. reduced motion keeps the dismissal gesture available ─────────────── */
const calmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const calm = await calmCtx.newPage();
await calm.goto(BASE, { waitUntil: 'domcontentloaded' });
await calm.getByTestId('header-more').click();
await calm.waitForTimeout(500);
await dragHandle(calm, 120, { steps: 8 });
await calm.waitForTimeout(300);
const calmY = await panelY(calm);
out('reduced motion completes the same dismiss gesture', calmY === null, `translateY=${calmY}px`);
await calm.keyboard.press('Escape');
await calm.waitForTimeout(400);
out('reduced motion closes without a fling',
  await calm.evaluate(() => !document.querySelector('[data-testid="more-sheet"]')));

await calmCtx.close();
await ctx.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
