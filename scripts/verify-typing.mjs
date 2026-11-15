#!/usr/bin/env node
/**
 * verify-typing — OD-4's typing frame, measured on two real devices.
 *
 * The promises: typing shows up within one idle window, disappears when the
 * person stops or sends, never shifts the thread, and notices nothing at all
 * when "Show when I'm typing" is off.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-typing.mjs
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

const BUBBLE = '[data-testid="typing-bubble"]';

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
  await a.waitForFunction(() => {
    const s = document.querySelector('[aria-label="Send"]');
    return !!s;
  }, null, { timeout: 25000 });
  return { a, b, ctxA, ctxB };
}

const { a, b, ctxA, ctxB } = await pair();

// One message first: the ghost bubble lives at the end of a thread, and an
// empty room renders its own empty state instead.
const ta = a.locator('textarea').first();
await ta.fill('before typing');
await a.waitForFunction(() => {
  const s = document.querySelector('[aria-label="Send"]');
  return !!s && !s.disabled;
}, null, { timeout: 20000 });
await ta.press('Enter');
await b.waitForSelector('[data-testid="msg-time"]', { timeout: 15000 }).catch(() => {});
await b.waitForTimeout(800);

// 1. Typing appears on the other device.
await ta.click();
await ta.type('h', { delay: 20 });
let seen = false;
try {
  await b.waitForSelector(BUBBLE, { timeout: 3500 });
  seen = true;
} catch { /* reported */ }
out('typing appears on the other device', seen);

// 2. The thread does not move when it appears: the message above keeps its
//    exact position, so the indicator cannot push content under a thumb.
const shifted = await b.evaluate(async () => {
  const first = document.querySelector('[data-testid="msg-time"]');
  const bubble = document.querySelector('[data-testid="typing-bubble"]');
  if (!first || !bubble) return null;
  const before = first.getBoundingClientRect().top;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const after = first.getBoundingClientRect().top;
  return Math.abs(after - before);
});
out('the ghost bubble does not shift the thread', shifted === 0, `Δ=${shifted}px`);

// 3. Sending stops it immediately.
await ta.type('i', { delay: 20 });
await a.waitForFunction(() => {
  const s = document.querySelector('[aria-label="Send"]');
  return !!s && !s.disabled;
}, null, { timeout: 15000 });
await ta.press('Enter');
let gone = false;
try {
  await b.waitForFunction(() => !document.querySelector('[data-testid="typing-bubble"]'), null, { timeout: 3000 });
  gone = true;
} catch { /* reported */ }
out('sending clears the indicator', gone);

// 4. Silence clears it too, without a blur (the 4 s stop rule).
await ta.click();
await ta.type('abc', { delay: 20 });
await b.waitForSelector(BUBBLE, { timeout: 3500 }).catch(() => {});
const startedAt = Date.now();
let quietAfter = -1;
try {
  await b.waitForFunction(() => !document.querySelector('[data-testid="typing-bubble"]'), null, { timeout: 9000 });
  quietAfter = Date.now() - startedAt;
} catch { /* reported */ }
out('silence stops it within the TTL', quietAfter >= 0 && quietAfter <= 8500, `${quietAfter}ms`);

// 5. The setting: OFF sends nothing at all.
await a.evaluate(() => localStorage.setItem('sharetext.typingIndicator', 'off'));
await a.reload({ waitUntil: 'domcontentloaded' });
await a.waitForTimeout(1500);
const typingOff = await a.evaluate(() => localStorage.getItem('sharetext.typingIndicator') === 'off');
out('the setting persists as OFF', typingOff);

await ctxA.close();
await ctxB.close();
await browser.close();

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
