#!/usr/bin/env node
/**
 * stress-ui — the room, fed the content nobody types on purpose.
 *
 * A layout that holds with "hello" is not evidence. This pairs two browsers,
 * then sends the things that actually break interfaces: one character, a word
 * with no spaces, a paragraph, a huge number, zero, and twelve items where the
 * design was drawn for three — then measures overflow and screenshots both
 * widths.
 *
 *   BASE_URL=http://localhost:3110 node scripts/stress-ui.mjs before
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { readLiveCode, waitForChat } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const tag = process.argv[2] || 'run';
const outDir = 'audit/stress';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const D = await desktop.newPage();
await D.goto(BASE, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1200);
await D.getByTestId('home-send').click();
await D.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
const code = await readLiveCode(D);

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const M = await mobile.newPage();
await M.goto(BASE, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1200);
await M.getByRole('button', { name: 'Receive' }).click();
await M.waitForTimeout(500);
await M.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
await M.locator('[data-app-state="connected"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await waitForChat(D, 'desktop');

const SAMPLES = [
  'a',
  'https://example.com/' + 'x'.repeat(140),
  'Photographs from the wedding in Kochi, the ones with the string lights and everybody standing in the doorway because the hall was too small for the group shot',
  '1234567890123',
  '0',
  '₹ 1,23,45,678',
  'नमस्ते — यह एक लंबा वाक्य है जो शायद रैप नहीं होगा',
  '🏝️🏝️🏝️🏝️🏝️🏝️🏝️🏝️',
];

for (const text of SAMPLES) {
  const box = D.getByTestId('composer').first();
  await box.fill(text);
  await D.getByTestId('send').first().click();
  await D.waitForTimeout(450);
}

// Twelve items where the design was drawn for three.
for (let i = 1; i <= 12; i += 1) {
  const box = D.getByTestId('composer').first();
  await box.fill(`item ${i}`);
  await D.getByTestId('send').first().click();
  await D.waitForTimeout(220);
}
await M.waitForTimeout(1500);

const measure = async (page, label) => {
  const info = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wide = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > vw + 1 || r.left < -1) {
        const t = (el.textContent || '').trim().slice(0, 40);
        wide.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), w: Math.round(r.width), right: Math.round(r.right), t });
      }
    });
    const clipped = [];
    document.querySelectorAll('p, span, div[dir], h1, h2, h3, button, a').forEach((el) => {
      if (el.children.length) return;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        clipped.push({ t: (el.textContent || '').trim().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    const small = [];
    document.querySelectorAll('button, a, input, [role="button"], [role="switch"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28);
        small.push({ name, w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    const composer = document.querySelector('[data-testid="composer"]')?.closest('div');
    const cr = composer?.getBoundingClientRect();
    return {
      pageScrollW: document.documentElement.scrollWidth,
      vw,
      wide: wide.slice(0, 12),
      clipped: clipped.slice(0, 12),
      small: small.slice(0, 12),
      composerBottomGap: cr ? Math.round(vh - cr.bottom) : null,
    };
  });
  console.log(`\n── ${label} ──`);
  console.log('page scrollWidth', info.pageScrollW, 'vw', info.vw);
  console.log('over the right edge:', info.wide.length, JSON.stringify(info.wide.slice(0, 6)));
  console.log('clipped text:', info.clipped.length, JSON.stringify(info.clipped.slice(0, 6)));
  console.log('targets under 44:', info.small.length, JSON.stringify(info.small.slice(0, 8)));
  console.log('composer bottom gap:', info.composerBottomGap);
  return info;
};

await M.screenshot({ path: `${outDir}/${tag}-room-390.png`, fullPage: true });
await D.screenshot({ path: `${outDir}/${tag}-room-1440.png`, fullPage: true });
const m = await measure(M, 'mobile 390');
const d = await measure(D, 'desktop 1440');

// The pair sheet, where a device name has to survive being 40 characters.
await M.evaluate(() => window.scrollTo(0, 0));
await browser.close();
console.log(`\nshots: ${outDir}/${tag}-room-390.png , ${outDir}/${tag}-room-1440.png`);
console.log(JSON.stringify({ mobile: m, desktop: d }, null, 1).slice(0, 1500));
