#!/usr/bin/env node
/**
 * Before-shots for M2 (STEP 0). Pairs two devices, sends one message, and
 * photographs the room at the six viewports the milestone asks for.
 *
 * The room is the subject because the room is the milestone; a landing shot
 * would prove nothing about §19.
 *
 *   BASE_URL=http://localhost:3010 node scripts/shots-m2-before.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const OUT = 'docs/redesign/shots/m2-before';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['320x568', 320, 568],
  ['390x844', 390, 844],
  ['844x390', 844, 390],
  ['768x1024', 768, 1024],
  ['1440x900', 1440, 900],
  ['2560x1080', 2560, 1080],
];

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

// Pairing is done once on a phone viewport, then each viewport reloads the same
// room URL — the room is the same object, only the frame around it changes.
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

await a.locator('textarea').first().fill('A message in the room.');
await a.waitForFunction(() => {
  const s = document.querySelector('[aria-label="Send"]');
  return !!s && !s.disabled;
}, null, { timeout: 25000 });
await a.locator('textarea').first().press('Enter');
await b.waitForTimeout(1500);
const roomUrl = b.url();

for (const [name, width, height] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(roomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
  await ctx.close();
}

await browser.close();
console.log(`[shots-m2-before] ${VIEWS.length} screenshots in ${OUT}`);
