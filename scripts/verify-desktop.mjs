#!/usr/bin/env node
/**
 * verify-desktop — the rail is a real pane, not a drawing.
 *
 * At ≥1024px the room gets a 320px master pane on the left and the thread
 * keeps its own width. This measures the geometry at 1024, 1440 and 2560 (and
 * proves the rail is gone at 900), then saves the three shots the report
 * cites. Numbers first, pictures second: a screenshot can look right while
 * the layout overlaps.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-desktop.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const SHOTS = 'docs/redesign/shots';
const RAIL_PX = 320;
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const results = [];
const out = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

// Pair once at phone size, then resize the same room: the rail must appear
// because the window changed, not because the room was re-created.
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

const ta = a.locator('textarea').first();
await ta.fill('Desktop, measured.');
await a.waitForFunction(() => {
  const s = document.querySelector('[aria-label="Send"]');
  return !!s && !s.disabled;
}, null, { timeout: 20000 });
await ta.press('Enter');
await a.waitForTimeout(800);

mkdirSync(SHOTS, { recursive: true });

for (const width of [1024, 1440, 2560]) {
  await a.setViewportSize({ width, height: 900 });
  await a.waitForTimeout(500);
  const facts = await a.evaluate(() => {
    const rail = document.querySelector('[data-testid="room-rail"]');
    const log = document.querySelector('[role="log"]');
    const composer = document.querySelector('textarea');
    const rr = rail?.getBoundingClientRect();
    const lr = log?.getBoundingClientRect();
    const cr = composer?.getBoundingClientRect();
    return {
      railVisible: !!rail && getComputedStyle(rail).display !== 'none',
      railRight: rr ? Math.round(rr.right) : -1,
      railTop: rr ? Math.round(rr.top) : -1,
      logLeft: lr ? Math.round(lr.left) : -1,
      composerLeft: cr ? Math.round(cr.left) : -1,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rooms: document.querySelectorAll('[data-testid="rail-room"]').length,
      newRoom: !!document.querySelector('[data-testid="rail-new-room"]'),
    };
  });
  // The master pane is on the left; the thread must begin to the RIGHT of the
  // rail's own right edge (which is what a squeezed layout violates).
  const clear = facts.logLeft >= facts.railRight && facts.composerLeft >= facts.railRight;
  out(`${width}px — the rail is on screen`, facts.railVisible, `top y=${facts.railTop}`);
  out(`${width}px — the thread clears the rail`, clear, `rail right=${facts.railRight}, log x=${facts.logLeft}, composer x=${facts.composerLeft}`);
  out(`${width}px — no horizontal overflow`, facts.overflowX <= 0, `${facts.overflowX}px`);
  out(`${width}px — the rail lists the room`, facts.rooms === 1, `${facts.rooms} room(s)`);
  out(`${width}px — one way out of the room`, facts.newRoom);
  await a.screenshot({ path: `${SHOTS}/m2-desktop-${width}.png`, fullPage: false });
}

// Below the breakpoint the phone layout is the right one: no rail at all.
await a.setViewportSize({ width: 900, height: 900 });
await a.waitForTimeout(400);
const hidden = await a.evaluate(() => {
  const rail = document.querySelector('[data-testid="room-rail"]');
  return !rail || getComputedStyle(rail).display === 'none';
});
out('900px — the rail is gone', hidden);

await ctxA.close();
await ctxB.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
