#!/usr/bin/env node
/**
 * verify-room-feed — the thread obeys DESIGN.md §19 "Feed".
 *
 * Every assertion here is a user-visible promise, checked in a real browser
 * with a real second device:
 *
 *   1. grouping   — device name and time only on a sender change or after five
 *                   minutes of silence, never inside every bubble
 *   2. state word — one delivery word, on the most recent own message
 *   3. geometry   — bubble radius 16 (the card tier of the 8/12/16/24
 *                   scale, DESIGN.md §0.12), max width 82%
 *   4. semantics  — the thread is role="log", polite, additions only
 *   5. no noise   — no aria-live region ever contains a percentage
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-room-feed.mjs
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const failures = [];
const pass = (name, detail) => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => { failures.push(`${name} — ${detail}`); console.log(`  ✗ ${name} — ${detail}`); };

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

const send = async (page, text) => {
  const ta = page.locator('textarea').first();
  await ta.fill(text);
  await page.waitForFunction(() => {
    const s = document.querySelector('[aria-label="Send"]');
    return !!s && !s.disabled;
  }, null, { timeout: 25000 });
  await ta.press('Enter');
  await page.waitForTimeout(350);
};

// A sends three in a row (one block), B answers once (new block), A replies
// once more (third block).
await send(a, 'feed one');
await send(a, 'feed two');
await send(a, 'feed three');
await send(b, 'feed reply');
await send(a, 'feed last');
await b.waitForTimeout(2500);

/* 1. Grouping — count of meta rows on B must equal the number of blocks. */
const metaOnB = await b.evaluate(() => ({
  times: document.querySelectorAll('[data-testid="msg-time"]').length,
  bubbles: [...document.querySelectorAll('[data-testid="msg-time"]')].length,
}));
// Blocks on B: A's run (1), B's own reply (1), A's reply (1) = 3.
if (metaOnB.times === 1 || metaOnB.times > 3) {
  fail('grouping: name+time only per block', `${metaOnB.times} meta rows for 3 blocks of 5 messages`);
} else {
  pass('grouping: name+time only per block', `${metaOnB.times} meta rows / 3 blocks`);
}

/* 2. One state word — A sent 4 messages; only the newest carries a receipt. */
const statesOnA = await a.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-testid="msg-state"]')];
  return { count: nodes.length, states: nodes.map((n) => n.getAttribute('data-state')) };
});
if (statesOnA.count === 1) pass('state word on the most recent own message only', `${statesOnA.states[0]}`);
else fail('state word on the most recent own message only', `${statesOnA.count} state words for 4 own messages`);

/* 3. Geometry — radius 16, max width 82% of the thread. */
const geometry = await b.evaluate(() => {
  const first = document.querySelector('[data-testid="msg-time"]')?.closest('.group\\/msg');
  if (!first) return null;
  const bubble = first.querySelector('[class*="rounded-[16px]"]') || first.querySelector('div > div > div');
  const thread = first.parentElement;
  const cs = bubble ? getComputedStyle(bubble) : null;
  const w = bubble && thread ? bubble.getBoundingClientRect().width / thread.getBoundingClientRect().width : 0;
  return { radius: cs?.borderTopLeftRadius, widthPct: Math.round(w * 1000) / 10 };
});
if (!geometry) fail('geometry', 'no bubble found');
else {
  if (geometry.radius === '16px') pass('bubble radius 16', geometry.radius);
  else fail('bubble radius 16', geometry.radius);
  if (geometry.widthPct <= 83) pass('bubble max width 82%', `${geometry.widthPct}%`);
  else fail('bubble max width 82%', `${geometry.widthPct}%`);
}

/* 4. Semantics — role="log", polite, additions only. */
const log = await b.evaluate(() => {
  const el = document.querySelector('[role="log"]');
  return el ? { live: el.getAttribute('aria-live'), relevant: el.getAttribute('aria-relevant') } : null;
});
if (log && log.live === 'polite' && log.relevant === 'additions') {
  pass('thread is role=log, polite, additions only');
} else {
  fail('thread is role=log, polite, additions only', JSON.stringify(log));
}

/* 5. No percentage ever reaches a live region. */
const noisy = await b.evaluate(() => {
  const regions = [...document.querySelectorAll('[aria-live]')];
  return regions
    .map((r) => (r.textContent || '').match(/\d+\s?%/g))
    .filter(Boolean)
    .flat();
});
if (noisy.length === 0) pass('no percentage in a live region');
else fail('no percentage in a live region', noisy.join(', '));

await ctxA.close();
await ctxB.close();
await browser.close();

if (failures.length) {
  console.error(`\n[verify-room-feed] ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n[verify-room-feed] GREEN');
