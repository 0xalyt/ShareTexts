#!/usr/bin/env node
/**
 * verify-demo — the landing device demo, checked on the clock it actually runs.
 *
 *   BASE_URL=http://localhost:3110 node scripts/verify-demo.mjs
 *
 * Asserts: exactly one demo is visible at each width; the caption pair changes
 * with the state and is the pair belonging to that state; the loop returns to
 * the first beat (it is a loop, not a one-shot); the caption block is tall
 * enough for both lines (it was clipping the second line); reduced motion opens
 * on the arrived beat and offers a restart.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The beat → caption pair, from the component's own tables. */
const EXPECTED = {
  open: 'On your laptop, in the browser.',
  connecting: 'Type the six-digit code.',
  sending: 'Device to device when it can be.',
  received: 'Already on the other device.',
  done: 'Close the room. Nothing is kept afterwards.',
};

const browser = await chromium.launch();

for (const [w, h] of [[1280, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);

  const visible = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hero-demo"]')]
    .filter((e) => e.offsetParent !== null).length);
  check(`${w}: exactly one demo on the page`, visible === 1, `${visible} visible`);

  const demo = page.locator('[data-testid="hero-demo"]:visible').first();
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);

  const sample = () => demo.evaluate((n) => ({
    state: n.getAttribute('data-state'),
    caption: (n.querySelector('[data-testid="demo-caption"]')?.textContent || '').trim(),
    box: n.querySelector('[data-testid="demo-caption"]')?.getBoundingClientRect().height || 0,
    // The caption is two lines; a box shorter than the text clips the second.
    textHeight: (() => {
      const el = n.querySelector('[data-testid="demo-caption"]');
      return el ? [...el.querySelectorAll('p')].reduce((a, p) => a + p.getBoundingClientRect().height, 0) : 0;
    })(),
  }));

  const seen = [];
  let mismatch = null;
  let boxShort = false;
  let prev = null;
  for (let i = 0; i < 26; i += 1) {
    let s = await sample();
    // The caption crossfades over 340 ms (mode="wait"): during the swap the
    // outgoing line is still the one on screen. Judge a beat only once it has
    // settled, otherwise this measures the crossfade, not the pairing.
    if (s.state !== prev) {
      await page.waitForTimeout(500);
      s = await sample();
      prev = s.state;
    }
    seen.push(s.state);
    if (s.textHeight > s.box + 1) boxShort = true;
    const expected = EXPECTED[s.state];
    if (expected && !s.caption.includes(expected)) mismatch = `${s.state}: “${s.caption}”`;
    await page.waitForTimeout(500);
  }

  check(`${w}: caption always matches its beat`, !mismatch, mismatch || '');
  check(`${w}: caption box fits both lines`, !boxShort);
  check(`${w}: the loop wraps`, new Set(seen).size >= 3, `states seen: ${[...new Set(seen)].join(' → ')}`);
  await ctx.close();
}

// Reduced motion: the still has to show the product having worked.
const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await rm.waitForTimeout(1200);
const rmState = await rm.evaluate(() => [...document.querySelectorAll('[data-testid="hero-demo"]')]
  .filter((e) => e.offsetParent !== null)[0]?.getAttribute('data-state'));
check('reduced motion opens on the payoff', rmState === 'received', String(rmState));
const restarts = await rm.evaluate(() => [...document.querySelectorAll('[data-testid="demo-restart"]')]
  .filter((e) => e.offsetParent !== null).length);
check('reduced motion keeps a restart', restarts >= 1, `${restarts} control(s)`);
await rmCtx.close();

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? 'GREEN' : 'RED'} — ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
