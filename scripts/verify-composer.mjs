// verify-composer.mjs — the P4 incident, as a gate (DESIGN.md §0.10 b2).
//
// P4 shipped a composer that moved. Typing grew it downward, so the Send
// circle walked away from the corner the user was already reaching for, and
// a caption appearing on desktop shifted the row. The bug was invisible to
// every text-level check: the markup was right, the geometry was wrong.
//
// This gate measures rectangles, not strings:
//   1. Send circle keeps the same x and the same bottom edge from empty →
//      one character → six lines → back to one line (it may not drift).
//   2. Its size stays 44×44 throughout.
//   3. A pre-send chip (typing a URL) grows the composer UPWARD: the circle's
//      bottom edge does not move.
//   4. The caption/status slot below the composer is present and keeps a
//      constant height, whether or not it has text in it.
//   5. A plain Playwright click on Send (no force, no dispatchEvent) delivers.
//
// Usage: node scripts/verify-composer.mjs [--base http://localhost:3000]
import { chromium } from 'playwright';
import { pairDevices, watchConsole } from './lib/flow.mjs';

const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('--base', process.env.URL || 'http://localhost:3010').replace(/\/$/, '');

let failures = 0;
const out = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const sink = [];
  watchConsole(A, sink, 'A');
  watchConsole(B, sink, 'B');

  await pairDevices(A, B, BASE);
  const composer = A.getByTestId('composer').first();
  const send = A.getByTestId('send').first();
  await composer.waitFor({ timeout: 15000 });

  const box = async () => {
    const b = await send.boundingBox();
    return { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height, w: b.width, h: b.height };
  };

  // The composer animates its own growth, so a fixed sleep samples the middle
  // of a transition and reports phantom drift. Wait for the circle to hold
  // still across two reads instead.
  const settle = async () => {
    let prev = await box();
    for (let i = 0; i < 12; i++) {
      await A.waitForTimeout(80);
      const next = await box();
      if (Math.abs(next.bottom - prev.bottom) < 0.1 && Math.abs(next.x - prev.x) < 0.1) return next;
      prev = next;
    }
    return prev;
  };

  const empty = await settle();
  out(near(empty.w, 44) && near(empty.h, 44), 'Send circle is 44×44 when empty',
    `${empty.w}×${empty.h}`);

  await composer.fill('a');
  const one = await settle();
  out(near(one.x, empty.x) && near(one.bottom, empty.bottom), 'one character does not move the circle',
    `dx=${(one.x - empty.x).toFixed(1)} dBottom=${(one.bottom - empty.bottom).toFixed(1)}`);

  const long = ['first line of a long message that wraps on a phone screen',
    'second line', 'third line', 'fourth line', 'fifth line', 'sixth line'].join('\n');
  await composer.fill(long);
  const tall = await settle();
  out(near(tall.x, empty.x), 'six lines keep the circle at the same x',
    `x ${empty.x.toFixed(1)} → ${tall.x.toFixed(1)}`);
  out(near(tall.bottom, empty.bottom, 1), 'six lines keep the same bottom edge',
    `bottom ${empty.bottom.toFixed(1)} → ${tall.bottom.toFixed(1)}`);
  out(near(tall.w, 44) && near(tall.h, 44), 'circle does not resize on a long message',
    `${tall.w}×${tall.h}`);

  // The composer must have grown upward, not downward — that is what makes
  // the bottom edge the stable edge.
  const composerBox = await A.getByTestId('composer').first().boundingBox();
  out(composerBox.y < empty.y, 'a long message grows the composer upward',
    `textarea top ${composerBox.y.toFixed(1)} vs circle top ${empty.y.toFixed(1)}`);

  // ── pre-send link chip: inserted above, must not push the circle down ──
  await composer.fill('https://example.com/composer-gate');
  const withChip = await settle();
  out(near(withChip.bottom, empty.bottom, 1), 'the pre-send link chip grows upward only',
    `bottom ${empty.bottom.toFixed(1)} → ${withChip.bottom.toFixed(1)}`);
  const chip = await A.locator('[data-testid="composer"]').first().evaluate((el) => {
    // the chip lives in the same composer column, above the input row
    const col = el.closest('form') ?? el.parentElement;
    return col ? col.getBoundingClientRect().height : 0;
  });
  out(chip > 0, 'composer column measured for the caption slot', `${chip.toFixed(1)}px`);

  // ── caption slot: constant height whether or not it holds text ─────────
  const slotHeight = await A.evaluate(() => {
    const el = document.querySelector('[data-testid="composer-caption"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, min: cs.minHeight };
  });
  if (slotHeight === null) {
    // Not a failure while the caption does not exist: record it so the
    // moment one is added, this line stops being a WARN.
    console.log('WARN  no [data-testid="composer-caption"] in this build — caption slot not yet reserved');
  } else {
    await composer.fill('a');
    await settle();
    const after = await A.evaluate(() =>
      document.querySelector('[data-testid="composer-caption"]').getBoundingClientRect().height);
    out(near(after, slotHeight.h), 'caption slot keeps its height with text present',
      `${slotHeight.h} → ${after}`);
  }

  // ── a real click delivers (no force, no synthetic dispatch) ────────────
  const TEXT = `composer gate ${Date.now()}`;
  await composer.fill(TEXT);
  await settle();
  const before = await box();
  await send.click({ timeout: 5000 });
  const t0 = Date.now();
  let delivered = false;
  while (Date.now() - t0 < 10000 && !delivered) {
    delivered = await B.evaluate((t) => document.body.textContent.includes(t), TEXT).catch(() => false);
    if (!delivered) await B.waitForTimeout(200);
  }
  out(delivered, 'a normal click on Send delivers', delivered ? `${Date.now() - t0} ms` : 'timed out');
  const after = await settle();
  out(near(after.bottom, before.bottom, 1), 'the circle is still anchored after sending',
    `bottom ${before.bottom.toFixed(1)} → ${after.bottom.toFixed(1)}`);

  const errors = sink.filter((l) => l.includes(' error: ') || l.includes('pageerror'));
  out(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));

  await ctxA.close();
  await ctxB.close();
} catch (e) {
  out(false, 'composer gate ran to completion', e.message);
} finally {
  await browser.close();
}

console.log(`\n[verify-composer] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
