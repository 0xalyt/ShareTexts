#!/usr/bin/env node
/**
 * verify-tabs — one indicator that travels, one panel at a time.
 *
 * The claim is about position and count, so it is measured on the live DOM:
 *
 *   · exactly one thumb element exists, and it sits under the selected tab
 *   · switching tabs MOVES that thumb (translateX changes) — it does not
 *     fade a second highlight in
 *   · the move is 150–250ms on an ease-in-out curve
 *   · exactly one tabpanel is mounted (no stacked half-visible panels), and
 *     it is labelled by the tab that opened it
 *   · ArrowLeft/Right/Home/End move selection AND focus; one tab in the tab order
 *   · under prefers-reduced-motion the thumb is placed with transition: none
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-tabs.mjs
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

const facts = (page) =>
  page.evaluate(() => {
    const list = document.querySelector('[role="tablist"]');
    if (!list) return null;
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const thumb = list.querySelector('.segmented-thumb');
    const panes = Array.from(document.querySelectorAll('[role="tabpanel"]'));
    const cs = thumb ? getComputedStyle(thumb) : null;
    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    // Position read as painted geometry, not as a matrix: this is where the
    // thumb actually is on screen, which is the thing the eye judges.
    const listRect = list.getBoundingClientRect();
    const thRect = thumb?.getBoundingClientRect();
    const selRect = selected?.getBoundingClientRect();
    return {
      orientation: list.getAttribute('aria-orientation'),
      tabs: tabs.length,
      selectedCount: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length,
      tabIndexZero: tabs.filter((t) => t.tabIndex === 0).length,
      selectedId: selected?.id ?? null,
      controls: tabs.map((t) => t.getAttribute('aria-controls')),
      thumbs: list.querySelectorAll('.segmented-thumb').length,
      thumbX: thRect ? Math.round(thRect.left - listRect.left) : null,
      thumbW: thRect ? Math.round(thRect.width) : null,
      tabOffset: selRect ? Math.round(selRect.left - listRect.left) : null,
      tabWidth: selRect ? Math.round(selRect.width) : null,
      duration: cs?.transitionDuration ?? null,
      curve: cs?.transitionTimingFunction ?? null,
      props: cs?.transitionProperty ?? null,
      paneCount: panes.length,
      paneIds: panes.map((p) => p.id),
      paneLabelledBy: panes.map((p) => p.getAttribute('aria-labelledby')),
      paneTransform: panes.map((p) => getComputedStyle(p).transform),
      focusId: document.activeElement?.id ?? null,
    };
  });

const openSend = async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^send$/i }).first().click();
  await page.getByTestId('send-segments').waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
};

/* ── the send screen's three tabs ───────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await openSend(page);

const first = await facts(page);
out('the control is a horizontal tablist', first?.orientation === 'horizontal', String(first?.orientation));
out('exactly one tab is selected, one is in the tab order',
  first?.selectedCount === 1 && first?.tabIndexZero === 1, `selected=${first?.selectedCount} tabbable=${first?.tabIndexZero}`);
out('the selected tab names the panel it controls (and it exists)',
  first?.controls?.filter(Boolean).length === 1 && first.paneIds.includes(first.controls.find(Boolean)),
  String(first?.controls));
out('exactly one panel is mounted (nothing stacked)', first?.paneCount === 1, `panes=${first?.paneCount}`);
out('the panel is labelled by its tab', first?.paneLabelledBy?.[0] === first?.selectedId,
  `${first?.paneLabelledBy?.[0]} ← ${first?.selectedId}`);
out('there is exactly one indicator element', first?.thumbs === 1, `thumbs=${first?.thumbs}`);
out('the indicator sits under the selected tab',
  Math.abs((first?.thumbX ?? 0) - (first?.tabOffset ?? -99)) <= 1 && first?.thumbW === first?.tabWidth,
  `x=${first?.thumbX} vs ${first?.tabOffset}, w=${first?.thumbW} vs ${first?.tabWidth}`);
const durMs = parseFloat(String(first?.duration ?? '0s').split(',')[0]) * 1000;
out('the travel is 150–250ms', durMs >= 150 && durMs <= 250, `${durMs}ms`);
out('the travel is ease-in-out', (first?.curve ?? '').includes('cubic-bezier(0.77, 0, 0.175, 1)'), String(first?.curve));

/* ── it travels, it does not crossfade ──────────────────────────────────── */
await page.getByRole('tab', { name: /link/i }).first().click();
await page.waitForTimeout(120); // mid-flight: the thumb must be BETWEEN the two
const mid = await facts(page);
await page.waitForTimeout(400);
const after = await facts(page);
out('switching tabs moves the same indicator', after?.thumbs === 1 && after?.thumbX !== first?.thumbX,
  `x ${first?.thumbX} → ${after?.thumbX}`);
out('mid-flight the indicator is between the tabs, not doubled',
  mid?.thumbs === 1 && mid.thumbX !== first.thumbX && mid.thumbX !== after.thumbX,
  `x ${mid?.thumbX} (from ${first?.thumbX} to ${after?.thumbX})`);
out('the new panel is mounted, the old one is gone, and the tab points at it',
  after?.paneCount === 1 && after?.controls?.find(Boolean) === after?.paneIds?.[0],
  `panel=${after?.paneIds?.[0]} controls=${after?.controls?.find(Boolean)}`);
out('the panel appears by opacity alone (no scale)',
  (after?.paneTransform ?? [''])[0] === 'none', String(after?.paneTransform));

/* ── keyboard ───────────────────────────────────────────────────────────── */
await page.getByRole('tab', { name: /link/i }).first().focus();
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(350);
const left = await facts(page);
out('ArrowLeft moves selection and focus together',
  left?.selectedId === left?.focusId && left?.selectedId !== after?.selectedId,
  `selected=${left?.selectedId} focus=${left?.focusId}`);
await page.keyboard.press('Home');
await page.waitForTimeout(350);
const home = await facts(page);
out('Home jumps to the first tab', home?.selectedId === first?.selectedId, String(home?.selectedId));
await page.keyboard.press('End');
await page.waitForTimeout(350);
const end = await facts(page);
out('End jumps to the last tab',
  end?.selectedId?.endsWith('-link') === true && end?.paneCount === 1, String(end?.selectedId));

/* ── reduced motion: placed, not flung ───────────────────────────────────── */
const calmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const calm = await calmCtx.newPage();
await openSend(calm);
const calmFacts = await facts(calm);
out('reduced motion switches the travel off',
  (calmFacts?.duration ?? '') === '0s' || calmFacts?.props === 'none',
  `duration=${calmFacts?.duration} props=${calmFacts?.props}`);
await calm.getByRole('tab', { name: /qr/i }).first().click();
await calm.waitForTimeout(120);
const calmAfter = await facts(calm);
out('reduced motion still lands the indicator on the new tab immediately',
  Math.abs((calmAfter?.thumbX ?? 0) - (calmAfter?.tabOffset ?? -99)) <= 1,
  `x=${calmAfter?.thumbX} vs ${calmAfter?.tabOffset}`);

await calmCtx.close();
await ctx.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
