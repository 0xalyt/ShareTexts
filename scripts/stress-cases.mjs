#!/usr/bin/env node
/**
 * stress-cases — the three worst content shapes, as pictures.
 *
 * stress-ui measures the whole room; this one isolates the cases so a before
 * and an after are the same crop: a 140-character URL, a 60-character word with
 * no spaces, and a 12-item list where the design was drawn for three.
 *
 *   BASE_URL=http://localhost:3110 node scripts/stress-cases.mjs before
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { readLiveCode } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const tag = process.argv[2] || 'run';
const out = 'audit/stress';
mkdirSync(out, { recursive: true });

const LONG_URL = 'https://example.com/' + 'x'.repeat(140);
const LONG_WORD = 'Donaudampfschifffahrtsgesellschaftskapitänsanwärterprüfungsordnung';
const SENTENCE = 'Photographs from the wedding in Kochi, the ones with the string lights and everybody standing in the doorway';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const M = await ctx.newPage();
await M.goto(BASE, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1000);
await M.getByTestId('home-send').click();
await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
const code = await readLiveCode(M);

const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const D = await dctx.newPage();
await D.goto(BASE, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1000);
await D.getByRole('button', { name: 'Receive' }).click();
await D.waitForTimeout(400);
await D.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
await D.locator('[data-app-state="connected"]').first().waitFor({ timeout: 15000 }).catch(() => {});
await M.getByTestId('composer').first().waitFor({ timeout: 15000 });

for (const text of [LONG_URL, LONG_WORD, SENTENCE]) {
  await M.getByTestId('composer').first().fill(text);
  await M.getByTestId('send').first().click();
  await M.waitForTimeout(500);
}

const report = await M.evaluate(() => {
  const vw = window.innerWidth;
  const rows = [];
  document.querySelectorAll('a[href^="https://example.com"], div').forEach((el) => {
    const t = (el.textContent || '');
    if (!t.includes('xxxx') && !t.includes('Donaudampf') && !t.includes('Photographs from the wedding')) return;
    const r = el.getBoundingClientRect();
    if (r.height < 20) return;
    rows.push({ tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), vw, over: Math.round(r.right - vw) });
  });
  return rows.slice(0, 8);
});
console.log(tag, 'measured:', JSON.stringify(report));

// Scroll the link card into view and shoot the three bubbles as elements, so
// "before" and "after" are the same crop rather than two scroll positions.
const card = M.locator('a[href^="https://example.com"]').first();
await card.scrollIntoViewIfNeeded().catch(() => {});
await M.waitForTimeout(400);
await M.screenshot({ path: `${out}/${tag}-390-viewport.png` });
await card.screenshot({ path: `${out}/${tag}-case-link.png` }).catch(() => {});

const word = M.getByText('Donaudampfschifffahrtsgesellschaftskapitänsanwärterprüfungsordnung').first();
await word.scrollIntoViewIfNeeded().catch(() => {});
await word.screenshot({ path: `${out}/${tag}-case-word.png` }).catch(() => {});

await M.evaluate(() => {
  const sc = document.querySelector('.room-scroll');
  if (sc) sc.scrollTop = 0;
});
await M.waitForTimeout(300);
await M.screenshot({ path: `${out}/${tag}-case-list-top.png` });

await browser.close();
console.log('shots in', out);
