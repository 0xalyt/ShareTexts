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
import { resolveChrome } from './lib.mjs';

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
  await a.getByRole('button', { name: /^send$/i }).first().click();
  await b.getByRole('button', { name: /^receive$/i }).first().click();
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

async function closeWithEscape(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
}

// ── Devices ──────────────────────────────────────────────────────────────────
await a.getByRole('button', { name: /details|devices|connection/i }).first().click().catch(async () => {
  await a.locator('[aria-expanded]').first().click();
});
await a.waitForTimeout(600);
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
await closeWithEscape(a);
const devicesClosed = await a.evaluate(() => !document.querySelector('[data-testid="devices-sheet"]'));
out('Escape closes Devices', devicesClosed);

// ── More ─────────────────────────────────────────────────────────────────────
// More lives on the home screen, not in a room: same overlay, different door.
const homeCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const home = await homeCtx.newPage();
await home.goto(BASE, { waitUntil: 'domcontentloaded' });
await home.getByTestId('header-more').click();
await home.waitForTimeout(600);
const more = await sheetFacts(home, 'more-sheet');
out('More opens as a dialog', more?.role === 'dialog' && more?.modal === 'true');
out('More uses the same 36% scrim', more?.scrim === devices?.scrim, `${more?.scrim}`);
out('More traps focus inside', more?.focusInside === true, more?.focusTag);
await closeWithEscape(home);
const moreClosed = await home.evaluate(() => !document.querySelector('[data-testid="more-sheet"]'));
out('Escape closes More', moreClosed);

// ── where it comes from ─────────────────────────────────────────────────────
// A dialog that materialises in the middle of the screen has no relationship
// to the control that opened it. At a width where the dialog is centred and
// therefore scaled, its transform-origin must point at that control.
await a.setViewportSize({ width: 900, height: 800 });
await a.waitForTimeout(300);
const devicesTrigger = a.getByRole('button', { name: /details|devices|connection/i }).first();
await devicesTrigger.click();
await a.waitForTimeout(600);
const originFacts = await a.evaluate(() => {
  const panel = document.querySelector('[data-testid="devices-sheet"]');
  const wrap = panel?.parentElement;
  return {
    origin: wrap ? getComputedStyle(wrap).transformOrigin : '',
    transform: wrap ? getComputedStyle(wrap).transform : '',
  };
});
out('a centred dialog grows from its trigger, not the viewport centre',
  /^[0-9]+px [0-9]+px$/.test(originFacts.origin) && originFacts.origin !== '50% 50%',
  originFacts.origin);
out('the settled panel is at scale 1 (never 0)',
  originFacts.transform === 'none' || originFacts.transform.startsWith('matrix(1, 0, 0, 1'),
  originFacts.transform);
await a.keyboard.press('Escape');
await a.waitForTimeout(300);
await a.setViewportSize({ width: 390, height: 844 });

// ── focus goes back to the trigger ──────────────────────────────────────────
// Measured on the home screen, not in a room: a seated room deliberately pulls
// focus to the composer after any overlay closes, which would mask the answer.
const homeTrigger = home.getByTestId('header-more');
await homeTrigger.click();
await home.waitForTimeout(400);
await home.keyboard.press('Escape');
await home.waitForTimeout(500);
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

await homeCtx.close();
await ctxA.close();
await ctxB.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
