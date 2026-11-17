#!/usr/bin/env node
/**
 * verify-details — the micro-UX pass, checked rather than asserted.
 *
 *   BASE_URL=http://localhost:3110 node scripts/verify-details.mjs
 *
 * Covers: the code's lifecycle bar drains in real time; the receive label
 * focuses the first cell; a rejected code shakes the field; horizontal scrollers
 * stop the browser's swipe-back gesture.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });

await page.getByTestId('home-send').click();
await page.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });

const bar = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="code-lifecycle"] > div');
  return el ? { width: el.style.width, parent: !!el.closest('[data-testid="code-lifecycle"]') } : null;
});
check('lifecycle bar renders with a width', !!bar && /%/.test(bar.width), bar?.width);

// The bar must agree with the caption, not merely move: the caption is the
// number a person reads, the bar is the same number as a length. A room can
// re-anchor its code window, so "it only shrinks" would be a false test.
const agreement = await page.evaluate(() => {
  const fill = document.querySelector('[data-testid="code-lifecycle"] > div');
  const caption = document.querySelector('[data-testid="code-validity"]')?.textContent || '';
  const m = caption.match(/(\d+):(\d\d)/);
  if (!fill || !m) return null;
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  return { width: parseFloat(fill.style.width), implied: (seconds / 90) * 100 };
});
const delta = Math.abs(agreement.width - agreement.implied);
check('bar agrees with the caption it illustrates', delta < 1.5, `${agreement.width.toFixed(1)}% vs ${agreement.implied.toFixed(1)}% implied`);

const first = parseFloat(bar.width);
await page.waitForTimeout(1400);
const second = parseFloat(await page.evaluate(() => document.querySelector('[data-testid="code-lifecycle"] > div')?.style.width || '0'));
check('bar moves with the clock', first !== second, `${first.toFixed(1)}% → ${second.toFixed(1)}%`);

// Receive side: label focus + rejection shake.
const peerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const peer = await peerCtx.newPage();
await peer.goto(BASE, { waitUntil: 'networkidle' });
await peer.getByRole('button', { name: 'Receive' }).click();
await peer.waitForTimeout(500);

await peer.locator('#receive-code-label').click();
const focused = await peer.evaluate(() => document.activeElement?.getAttribute('inputmode') === 'numeric');
check('clicking the label focuses the first cell', focused);

await peer.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill('111111');
await peer.waitForTimeout(4000);
const shake = await peer.evaluate(() => !!document.querySelector('.st-shake'));
check('a rejected code shakes the field', shake);

const scrollers = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return /auto|scroll/.test(cs.overflowX) && el.clientWidth > 0;
  });
  return all.map((el) => getComputedStyle(el).overscrollBehaviorX);
});
check('horizontal scrollers contain the gesture', scrollers.every((v) => v === 'contain'), `${scrollers.length} scroller(s): ${[...new Set(scrollers)].join(', ')}`);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? 'GREEN' : 'RED'} — ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
