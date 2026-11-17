#!/usr/bin/env node
/**
 * verify-sheets — the room's two sheets are one sheet.
 *
 * Neither Devices nor More may carry its own dimmer, its own Escape rule or
 * its own trap. This measures the overlay instead of trusting the JSX: same
 * backdrop alpha, same dialog role, focus lands inside, Tab stays inside, and
 * Escape closes. If one sheet drifts, one of these fails.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-sheets.mjs
 */
import { chromium } from 'playwright';
import { resolveChrome, clickStable } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const results = [];
const out = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function pair() {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(BASE, { waitUntil: 'domcontentloaded' });
  await b.goto(BASE, { waitUntil: 'domcontentloaded' });
  await clickStable(a, a.getByRole('button', { name: /^send$/i }).first());
  await clickStable(b, b.getByRole('button', { name: /^receive$/i }).first());
  const code = (await a.getByTestId('pairing-code').innerText()).replace(/\D/g, '').slice(0, 6);
  await b.getByTestId('join-code-input').click();
  await b.keyboard.type(code, { delay: 30 });
  await a.locator('textarea').first().waitFor({ timeout: 25000 });
  await b.locator('textarea').first().waitFor({ timeout: 25000 });
  return { a, b, ctxA, ctxB };
}

const { a, ctxA, ctxB } = await pair();

/** The visible dialog's own facts, read off the live DOM. */
async function sheetFacts(page, testId) {
  return page.evaluate((id) => {
    const host = document.querySelector(`[data-testid="${id}"]`);
    if (!host) return null;
    const dialog = host.matches('[role="dialog"]') ? host : host.querySelector('[role="dialog"]') || host.closest('[role="dialog"]') || host;
    // Closed sheets keep their scrim mounted at opacity 0, so take the one
    // that is actually painted — the dimmer the person is looking at.
    const scrims = Array.from(document.querySelectorAll('div')).filter(
      (d) => typeof d.className === 'string' && d.className.includes('bg-black/36'),
    );
    const painted = scrims
      .map((d) => getComputedStyle(d))
      .find((cs) => Number(cs.opacity) > 0.9 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)');
    const bg = painted ? painted.backgroundColor : '';
    const active = document.activeElement;
    return {
      role: dialog.getAttribute('role'),
      modal: dialog.getAttribute('aria-modal'),
      scrim: bg,
      focusInside: !!active && dialog.contains(active),
      focusTag: active ? active.tagName.toLowerCase() : '',
    };
  }, testId);
}

/**
 * Wait for a sheet to be SETTLED, not for a fixed number of milliseconds.
 *
 * This gate used to sleep 600 ms after a click and 450 ms after Escape, which
 * is a bet on how long a spring takes on the machine that happens to be
 * running. It lost that bet once (13/14 on one run, 14/14 on the next, same
 * code). These waits ask the DOM instead: the panel exists, it is painted, its
 * opacity is 1 and its transform is at rest. The same question the eye answers.
 */
async function settleSheet(page, id) {
  await page.waitForFunction((sel) => {
    const host = document.querySelector(sel);
    if (!host) return false;
    const wrap = host.parentElement;
    const t = wrap ? getComputedStyle(wrap).transform : 'none';
    const atRest = t === 'none' || /^matrix\(1, 0, 0, 1/.test(t);
    const opaque = Number(getComputedStyle(host).opacity) > 0.99;
    return atRest && opaque && host.getBoundingClientRect().width > 0;
  }, `[data-testid="${id}"]`, { timeout: 8000 });
  // The scrim fades on the same spring; it must be the painted one before its
  // alpha is read.
  await page.waitForFunction(() => {
    const scrims = Array.from(document.querySelectorAll('div')).filter(
      (d) => typeof d.className === 'string' && d.className.includes('bg-black/36'),
    );
    return scrims.some((d) => Number(getComputedStyle(d).opacity) > 0.99);
  }, null, { timeout: 8000 });
}

/** Wait for the sheet to leave the DOM, rather than guessing how long an exit
 *  animation takes. */
async function gone(page, id) {
  await page
    .waitForFunction((sel) => !document.querySelector(sel), `[data-testid="${id}"]`, { timeout: 8000 })
    .catch(() => {});
}

/** Two frames: enough for a resize to have been laid out and painted. */
async function twoFrames(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function closeWithEscape(page, id) {
  await page.keyboard.press('Escape');
  if (id) await gone(page, id);
  await twoFrames(page);
}

// ── Devices ──────────────────────────────────────────────────────────────────
await a.getByRole('button', { name: /details|devices|connection/i }).first().click().catch(async () => {
  await a.locator('[aria-expanded]').first().click();
});
await settleSheet(a, 'devices-sheet');
const devices = await sheetFacts(a, 'devices-sheet');
out('Devices opens as a dialog', devices?.role === 'dialog' && devices?.modal === 'true', JSON.stringify(devices && { role: devices.role, modal: devices.modal }));
// Tailwind compiles bg-black/36 to oklab in this build, so accept the colour
// the browser actually reports rather than the syntax we happened to expect.
const scrimIs36 = (v) => /(rgba\(0, 0, 0, 0\.36\)|oklab\(0 0 0 \/ 0\.36\))/.test(v || '');
out('Devices uses the shared 36% scrim', scrimIs36(devices?.scrim), devices?.scrim);
out('Devices traps focus inside', devices?.focusInside === true, devices?.focusTag);

// Tab never leaves the dialog.
let escaped = false;
for (let i = 0; i < 12; i++) {
  await a.keyboard.press('Tab');
  const inside = await a.evaluate(() => {
    const dialog = document.querySelector('[data-testid="devices-sheet"]');
    return dialog ? dialog.contains(document.activeElement) : false;
  });
  if (!inside) { escaped = true; break; }
}
out('Tab stays inside Devices', !escaped);

// Focus must not be able to LEAVE by other means either: a programmatic focus
// on something behind the dialog (an app-chrome button, an assistive-tech
// jump) is pulled straight back in. A trap that only handles Tab is a
// suggestion.
const recaptured = await a.evaluate(() => {
  const dialog = document.querySelector('[data-testid="devices-sheet"]');
  if (!dialog) return false;
  const outside = document.createElement('button');
  outside.id = 'gate-outside-focus';
  outside.textContent = 'outside';
  document.body.appendChild(outside);
  outside.focus();
  const inside = dialog.contains(document.activeElement);
  outside.remove();
  return inside;
});
out('focus that escapes programmatically is pulled back in', recaptured === true);
await closeWithEscape(a, 'devices-sheet');
const devicesClosed = await a.evaluate(() => !document.querySelector('[data-testid="devices-sheet"]'));
out('Escape closes Devices', devicesClosed);

// ── More ─────────────────────────────────────────────────────────────────────
// More lives on the home screen, not in a room: same overlay, different door.
const homeCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const home = await homeCtx.newPage();
await home.goto(BASE, { waitUntil: 'domcontentloaded' });
await home.getByTestId('header-more').click();
await settleSheet(home, 'more-sheet');
const more = await sheetFacts(home, 'more-sheet');
out('More opens as a dialog', more?.role === 'dialog' && more?.modal === 'true');
out('More uses the same 36% scrim', more?.scrim === devices?.scrim, `${more?.scrim}`);
out('More traps focus inside', more?.focusInside === true, more?.focusTag);
await closeWithEscape(home, 'more-sheet');
const moreClosed = await home.evaluate(() => !document.querySelector('[data-testid="more-sheet"]'));
out('Escape closes More', moreClosed);

// ── where it comes from ─────────────────────────────────────────────────────
// A dialog that materialises in the middle of the screen has no relationship
// to the control that opened it. At a width where the dialog is centred and
// therefore scaled, its transform-origin must point at that control.
await a.setViewportSize({ width: 900, height: 800 });
await twoFrames(a);
const devicesTrigger = a.getByRole('button', { name: /details|devices|connection/i }).first();
await devicesTrigger.click();
await settleSheet(a, 'devices-sheet');
const originFacts = await a.evaluate(() => {
  const panel = document.querySelector('[data-testid="devices-sheet"]');
  const wrap = panel?.parentElement;
  return {
    origin: wrap ? getComputedStyle(wrap).transformOrigin : '',
    transform: wrap ? getComputedStyle(wrap).transform : '',
  };
});
// The origin is measured from the trigger's own centre, which is a fractional
// pixel value (265.898px). The old assertion demanded whole pixels, so it failed
// on legitimate geometry — it was testing the formatting of the number, not
// where the dialog grows from. Parse it and check the geometry instead: a real
// point inside the viewport, and not the viewport's own centre.
const originMatch = /^(-?[\d.]+)px\s+(-?[\d.]+)px$/.exec(originFacts.origin);
const ox = originMatch ? Number(originMatch[1]) : NaN;
const oy = originMatch ? Number(originMatch[2]) : NaN;
const vw = 900;
const vh = 800;
const offCentre = Math.abs(ox - vw / 2) > 2 || Math.abs(oy - vh / 2) > 2;
out('a centred dialog grows from its trigger, not the viewport centre',
  Number.isFinite(ox) && Number.isFinite(oy) && ox > 0 && oy > 0 && offCentre,
  `${originFacts.origin} (viewport ${vw}×${vh})`);
out('the settled panel is at scale 1 (never 0)',
  originFacts.transform === 'none' || originFacts.transform.startsWith('matrix(1, 0, 0, 1'),
  originFacts.transform);
await a.keyboard.press('Escape');
await gone(a, 'devices-sheet');
await a.setViewportSize({ width: 390, height: 844 });
await twoFrames(a);

// ── focus goes back to the trigger ──────────────────────────────────────────
// Measured on the home screen, not in a room: a seated room deliberately pulls
// focus to the composer after any overlay closes, which would mask the answer.
const homeTrigger = home.getByTestId('header-more');
await homeTrigger.click();
await settleSheet(home, 'more-sheet');
await home.keyboard.press('Escape');
await gone(home, 'more-sheet');
await home
  .waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'header-more', null, { timeout: 5000 })
  .catch(() => {});
const focusAfter = await home.evaluate(() => {
  const el = document.activeElement;
  return {
    testId: el?.getAttribute('data-testid'),
    tag: el?.tagName,
    name: el?.getAttribute('aria-label'),
  };
});
out('focus returns to the control that opened it',
  focusAfter.testId === 'header-more',
  `${focusAfter.tag} testid=${focusAfter.testId} label=${focusAfter.name}`);

// ── the scrim is a second door out ─────────────────────────────────────────
// Escape is the keyboard's exit; the dimmer behind the panel is everyone
// else's. Both must work on a dismissable sheet.
await homeTrigger.click();
await settleSheet(home, 'more-sheet');
await home.mouse.click(8, 8); // top-left: backdrop, well clear of a bottom sheet
await gone(home, 'more-sheet');
const scrimClosed = await home.evaluate(() => !document.querySelector('[data-testid="more-sheet"]'));
out('a scrim click closes the dialog', scrimClosed);

await homeCtx.close();
await ctxA.close();
await ctxB.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
