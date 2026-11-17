#!/usr/bin/env node
/**
 * align-shots — the three rows, cropped, for a before and an after.
 *
 *   BASE_URL=http://localhost:3110 node scripts/align-shots.mjs after
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { readLiveCode } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const tag = process.argv[2] || 'run';
const out = 'audit/align';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const D = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await D.goto(BASE, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1000);
await D.getByTestId('home-send').click();
await D.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
const code = await readLiveCode(D);

const M = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await M.goto(BASE, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1000);
await M.getByRole('button', { name: 'Receive' }).click();
await M.waitForTimeout(400);
await M.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
await M.locator('[data-app-state="connected"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await D.waitForTimeout(1500);

// Row 1+2: the two name rows inside the rail column.
const rail = D.locator('[data-testid="room-rail"]');
await rail.screenshot({ path: `${out}/${tag}-row-names.png` }).catch(() => {});

const names = await D.evaluate(() => {
  const room = document.querySelector('[data-testid="rail-room"] span.truncate');
  const self = [...document.querySelectorAll('button span.truncate')][0];
  return {
    room: room ? +room.getBoundingClientRect().left.toFixed(1) : null,
    self: self ? +self.getBoundingClientRect().left.toFixed(1) : null,
  };
});

// Row 3: the settings card.
const card = D.locator('div.st-card', { hasText: 'Copy join link' }).first();
await card.screenshot({ path: `${out}/${tag}-row-settings.png` }).catch(() => {});

const settings = await D.evaluate(() => {
  const find = (t) => [...document.querySelectorAll('span')].find((e) => (e.textContent || '').trim() === t);
  const a = find('Stay connected');
  const b = find('Copy join link');
  return {
    stay: a ? +a.getBoundingClientRect().left.toFixed(1) : null,
    copy: b ? +b.getBoundingClientRect().left.toFixed(1) : null,
  };
});

console.log(tag, JSON.stringify({ names, settings }));
await browser.close();
