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
 *   · a slow release before the threshold springs back without closing
 *   · a fast flick past the threshold closes it
 *   · Escape closes it, and focus returns to the trigger
 *   · the page scroll lock is released afterwards (a page that cannot scroll
 *     after a sheet is the one bug nobody forgives)
 *   · under prefers-reduced-motion dragging stays usable, but release settles
 *     immediately and dismissal never flings
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

/* ── 2. a spring settles and can be caught without a jump ────────────────── */
await dragHandle(page, 45, { steps: 8, pauseBeforeUp: 220 });
await page.waitForTimeout(25);
const springY = await panelY(page);
out('a released sheet starts from its painted position', typeof springY === 'number' && springY > 0 && springY < 46, `translateY=${springY}px`);
const handle = page.locator('[data-testid="more-sheet"] [data-sheet-handle]');
const catchBox = await handle.boundingBox();
if (catchBox) {
  await page.mouse.move(catchBox.x + catchBox.width / 2, catchBox.y + catchBox.height / 2);
  const beforeCatch = await panelY(page);
  await page.mouse.down();
  const afterCatch = await panelY(page);
  out('catching a moving sheet preserves its position', typeof beforeCatch === 'number' && typeof afterCatch === 'number' && Math.abs(afterCatch - beforeCatch) < 12, `${beforeCatch}px → ${afterCatch}px`);
  await page.waitForTimeout(120);
  const heldY = await panelY(page);
  out('a caught sheet stays under the held pointer', typeof afterCatch === 'number' && typeof heldY === 'number' && Math.abs(heldY - afterCatch) < 1, `${afterCatch}px → ${heldY}px`);
  // A small intentional nudge claims the drag and then releases the caught panel.
  await page.mouse.move(catchBox.x + catchBox.width / 2, catchBox.y + catchBox.height / 2 + 12, { steps: 5 });
  await page.waitForTimeout(180);
  await page.mouse.up();
} else out('a released sheet remains available to catch', false);
await page.waitForTimeout(650);
const restingY = await panelY(page);
out('the sheet settles at rest without a layout transition', typeof restingY === 'number' && Math.abs(restingY) < 1, `translateY=${restingY}px`);

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
await dragHandle(calm, 35, { steps: 8, pauseBeforeUp: 180 });
const calmY = await panelY(calm);
out('reduced motion settles immediately after a short drag', calmY === 0, `translateY=${calmY}px`);
await dragHandle(calm, 220, { steps: 12, pauseBeforeUp: 180 });
out('reduced motion completes the same dismiss gesture', await panelY(calm) === null);
await openMore(calm);
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
