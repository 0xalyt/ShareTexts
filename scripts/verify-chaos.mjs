#!/usr/bin/env node
/**
 * verify-chaos — the reliability matrix, measured instead of assumed.
 *
 * Each scenario drives a real browser against a running server and asserts the
 * user-visible promise, not an implementation detail. A scenario that cannot
 * run in this environment says so out loud (SKIP with a reason) rather than
 * quietly passing: a matrix full of green that never ran anything is worse
 * than a short honest one.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-chaos.mjs
 *   BASE_URL=... node scripts/verify-chaos.mjs --only S2,S12
 *
 * Results are printed and, with --write, saved to
 * docs/redesign/reliability-matrix.md.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? new Set(process.argv[i + 1].split(',').map((s) => s.trim())) : null;
})();
const write = process.argv.includes('--write');

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const results = [];

function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·';
  console.log(`${mark} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

const want = (id) => !only || only.has(id);

async function page(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { p.__errors = (p.__errors || 0) + 1; p.__lastError = e.message.slice(0, 160); });
  return p;
}

/** A and B in one room, via the pairing code. Returns { a, b, ctxA, ctxB }. */
async function pair() {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await page(ctxA);
  const b = await page(ctxB);
  await a.goto(BASE, { waitUntil: 'domcontentloaded' });
  await b.goto(BASE, { waitUntil: 'domcontentloaded' });
  await a.getByRole('button', { name: /^send$/i }).first().click();
  await b.getByRole('button', { name: /^receive$/i }).first().click();
  const code = await a.getByTestId('pairing-code').innerText();
  const digits = code.replace(/\D/g, '').slice(0, 6);
  // OTP-style field: the visible element is a slot wrapper, so the digits go
  // in as keystrokes after a click, exactly as a thumb would produce them.
  await b.getByTestId('join-code-input').click();
  await b.keyboard.type(digits, { delay: 30 });
  await b.getByTestId('receive-join').click().catch(() => {});
  await a.locator('textarea').first().waitFor({ timeout: 25000 });
  await b.locator('textarea').first().waitFor({ timeout: 25000 });
  return { a, b, ctxA, ctxB, code: digits };
}

/* ── S2 ─────────────────────────────────────────────────────────────────── *
 * Server unreachable: one clear failure the person can act on. Never an
 * endless spinner over an empty page. */
if (want('S2')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await page(ctx);
  // page.route() does NOT intercept WebSocket upgrades — blocking the HTTP
  // paths alone left a live socket and a real room, which made an earlier
  // version of this test assert against a healthy app. routeWebSocket closes
  // the transport itself, the way a dead server would.
  await p.routeWebSocket(/.*/, (ws) => ws.close());
  await p.route('**/api/**', (r) => r.abort());
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /^send$/i }).first().click();
  await p.waitForTimeout(18000);
  const state = await p.evaluate(() => {
    const text = document.body.textContent || '';
    const buttons = [...document.querySelectorAll('button, a')].map((b) => b.textContent?.trim() || '');
    return {
      blank: text.trim().length < 40,
      retry: buttons.some((t) => /try again|retry|reconnect/i.test(t)),
      honest: /offline|couldn.t reach|cannot reach|no connection|connection lost|check your connection|try again/i.test(text),
      // A code that no server has ever heard of is the worst outcome here: the
      // person reads it out loud and the other device can never join.
      phantomCode: !!document.querySelector('[data-testid="pairing-code"]'),
    };
  });
  const pass = !state.blank && !state.phantomCode && (state.retry || state.honest);
  record('S2', 'server unreachable shows a recoverable state', pass ? 'PASS' : 'FAIL',
    JSON.stringify(state));
  await ctx.close();
}

/* ── S11 ────────────────────────────────────────────────────────────────── *
 * Two tabs of the same device in the same room: one send must appear once. */
if (want('S11')) {
  const { a, ctxB, b } = await pair();
  const ctxA2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a2 = await page(ctxA2);
  await a2.goto(a.url(), { waitUntil: 'domcontentloaded' });
  await a2.locator('textarea').first().waitFor({ timeout: 25000 }).catch(() => {});
  await a.locator('textarea').first().fill('two-tabs-once');
  await a.waitForFunction(() => {
    const s = document.querySelector('[aria-label="Send"]');
    return !!s && !s.disabled;
  }, null, { timeout: 25000 });
  await a.locator('textarea').first().press('Enter');
  await b.waitForTimeout(3500);
  // textContent, not innerText: the chat list uses content-visibility:auto, so
  // off-screen bubbles report no innerText and a counting test would invent loss.
  const countB = await b.evaluate(() => (document.body.textContent.match(/two-tabs-once/g) || []).length);
  const countA2 = await a2.evaluate(() => (document.body.textContent.match(/two-tabs-once/g) || []).length);
  record('S11', 'same-device second tab does not duplicate the message',
    countB === 1 ? 'PASS' : 'FAIL', `B saw ${countB}, second tab saw ${countA2}`);
  await ctxA2.close(); await ctxB.close();
}

/* ── S12 ────────────────────────────────────────────────────────────────── *
 * Twenty-five sends as fast as the keyboard allows: none dropped, order kept,
 * none duplicated. */
if (want('S12')) {
  const { a, b, ctxA, ctxB } = await pair();
  const N = 25;
  for (let i = 0; i < N; i++) {
    const tag = `burst-${String(i).padStart(2, '0')}`;
    const ta = a.locator('textarea').first();
    // The composer is controlled state: fill() dispatches input and React
    // commits on the next render. Pressing Enter before that commit sends the
    // PREVIOUS, already-cleared value and drops the message — an earlier
    // version of this test measured exactly that race, its own, not the app's
    // (the sending tab itself only ever showed 18 of 25 bubbles). So: wait for
    // the value to come back from React, then keep the 60 ms cadence a person
    // sprinting on a keyboard would produce.
    await ta.fill(tag);
    // The Send control is enabled only when there is text AND the peer link is
    // up, so this waits for both: the text to have committed through React and
    // the room to be genuinely ready. Sending before the channel opens is
    // refused on purpose (draft kept, "Waiting for connection" shown), which
    // would otherwise make this test measure the join animation.
    await a.waitForFunction(() => {
      const s = document.querySelector('[aria-label="Send"]');
      return !!s && !s.disabled;
    }, null, { timeout: 25000 });
    await ta.press('Enter');
    await a.waitForTimeout(60);
  }
  await b.waitForTimeout(15000);
  const seen = await b.evaluate(() => {
    // textContent: content-visibility:auto hides off-screen bubbles from
    // innerText, which would report older sends as missing.
    const text = document.body.textContent || '';
    const found = [];
    for (let i = 0; i < 25; i++) {
      const tag = `burst-${String(i).padStart(2, '0')}`;
      const n = (text.match(new RegExp(tag, 'g')) || []).length;
      if (n) found.push({ i, n });
    }
    return found;
  });
  const received = seen.length;
  const dupes = seen.filter((s) => s.n > 1).length;
  const inOrder = seen.every((s, idx) => s.i === idx);
  record('S12', `${N} rapid sends arrive once, in order`,
    received === N && dupes === 0 && inOrder ? 'PASS' : 'FAIL',
    `${received}/${N} received, ${dupes} duplicated, order ${inOrder ? 'kept' : 'broken'}`);
  await ctxA.close(); await ctxB.close();
}

/* S3 runs LAST on purpose: it spends the join-with-code budget for this IP,
 * so any pairing scenario after it would fail for the wrong reason. */
/* ── S3 ─────────────────────────────────────────────────────────────────── *
 * Sameness of failure: eleven wrong codes must eventually be refused with a
 * rate limit rather than eleven identical guesses. Driven through the socket
 * because the point is the server's budget, not the keyboard. */
if (want('S3')) {
  const { io } = await import('socket.io-client');
  const sock = io(BASE, { transports: ['websocket'], reconnection: false });
  const errors = [];
  await new Promise((res) => sock.on('connect', res));
  for (let i = 0; i < 12; i++) {
    await new Promise((res) => {
      sock.emit('join_with_code', { code: '000000', pid: crypto.randomUUID() }, (r) => {
        errors.push(r?.error || 'ok');
        res();
      });
      setTimeout(res, 4000);
    });
  }
  sock.close();
  const limited = errors.some((e) => /too many|slow down|try again later|rate/i.test(e));
  record('S3', 'repeated wrong codes hit a rate limit', limited ? 'PASS' : 'FAIL',
    `${errors.length} attempts, last: "${errors[errors.length - 1]}"`);
}

await browser.close();

const failed = results.filter((r) => r.status === 'FAIL').length;
if (write) {
  const rows = results.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${r.detail.replace(/\|/g, '\\|')} |`).join('\n');
  writeFileSync('docs/redesign/reliability-matrix.md', `# Reliability matrix

Generated by \`node scripts/verify-chaos.mjs --write\` against ${BASE}.
Commit: \`${(await import('node:child_process')).execSync('git rev-parse --short HEAD').toString().trim()}\`.
Date: ${new Date().toISOString().slice(0, 10)}.

| id | scenario | result | evidence |
| --- | --- | --- | --- |
${rows}

Scenarios from the M1 plan that are **not** in this file yet (S1, S4–S10, S13–S15)
are unmeasured, not passing. They need CDP lifecycle and network priming that
belong in a longer run than this one.
`);
  console.log('\nwrote docs/redesign/reliability-matrix.md');
}

console.log(`\n[verify-chaos] ${results.length} scenario(s), ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
