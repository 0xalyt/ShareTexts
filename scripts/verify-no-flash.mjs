#!/usr/bin/env node
/**
 * verify-no-flash — the screen never blinks.
 *
 * Two failures this exists to catch, both of which shipped once:
 *
 *  1. Landing → Room showed a white frame. The app paints dark, the transition
 *     unmounted the shell for a frame, and the browser filled the gap with the
 *     default canvas. At 60 Hz that is 16 ms of flash, which reads as a fault.
 *  2. A new service worker took over mid-session (skipWaiting), so an open tab
 *     switched builds underneath the person. That one cannot be measured from
 *     the page; it is checked statically, because the fix is the absence of a
 *     call.
 *
 * The measurement is a requestAnimationFrame sampler installed BEFORE the
 * interaction: each frame records the painted background and how much text is
 * on screen. A frame with no text, or a background that jumps to white and
 * back, is a flash.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-no-flash.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const failures = [];

/** Installs the sampler. Called before every interaction. */
const SAMPLER = () => {
  window.__stSamples = [];
  const bgOf = (el) => (el ? getComputedStyle(el).backgroundColor : '');
  const tick = () => {
    const body = document.body;
    const textLen = (body?.innerText || '').trim().length;
    window.__stSamples.push({
      t: performance.now(),
      bg: bgOf(document.documentElement) + '|' + bgOf(body),
      textLen,
    });
    if (window.__stSamples.length < 900) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** "White" in any notation: #fff, rgb(255,255,255), rgba(255,255,255,1). */
const isWhite = (s) => /#fff\b|255,\s*255,\s*255/.test(s);

async function analyse(page, label) {
  const samples = await page.evaluate(() => window.__stSamples || []);
  if (samples.length < 10) {
    failures.push(`${label}: sampler produced ${samples.length} frames — not measured`);
    return;
  }
  // A blank frame is one with no text at all. Allowed for the very first frames
  // (before the shell mounts) and nothing else.
  // Everything before the first painted frame is legitimately blank — the
  // document has not mounted yet. Only gaps AFTER first paint are flashes.
  const firstPaint = samples.findIndex((s) => s.textLen > 0);
  let blankRun = 0;
  let worstBlank = 0;
  for (let i = Math.max(2, firstPaint); i < samples.length; i++) {
    if (samples[i].textLen === 0) {
      blankRun++;
      worstBlank = Math.max(worstBlank, blankRun * (samples[i].t - samples[i - 1].t));
    } else blankRun = 0;
  }
  // A white flash is a white frame between two non-white ones.
  let whiteFlashes = 0;
  for (let i = Math.max(1, firstPaint + 1); i < samples.length - 1; i++) {
    if (isWhite(samples[i].bg) && !isWhite(samples[i - 1].bg) && !isWhite(samples[i + 1].bg)) whiteFlashes++;
  }
  const detail = `${samples.length} frames, ${Math.round(worstBlank)} ms blank, ${whiteFlashes} white flash(es)`;
  if (worstBlank > 48) failures.push(`${label}: ${Math.round(worstBlank)} ms with no text on screen (> 48 ms)`);
  if (whiteFlashes > 0) failures.push(`${label}: ${whiteFlashes} white frame(s) between painted ones`);
  console.log(`  ${label}: ${detail}`);
  return { worstBlank, whiteFlashes };
}

/* ── 1. Static: the worker must not take over a live page ───────────────── */
const sw = readFileSync('public/sw.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
if (/\bskipWaiting\s*\(/.test(sw)) {
  failures.push('public/sw.js calls skipWaiting() — a new build can activate under an open page');
} else {
  console.log('  service worker: no skipWaiting() call');
}

/* ── 2. Landing → Room ──────────────────────────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(SAMPLER);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^send$/i }).first().click();
  await page.waitForTimeout(2200);
  await analyse(page, 'landing → room');
  await ctx.close();
}

/* ── 3. Reload straight into a dark shell ───────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => localStorage.setItem('sharetexts-theme', 'dark'));
  await ctx.addInitScript(SAMPLER);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await analyse(page, 'cold load (dark)');
  await ctx.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n[verify-no-flash] ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n[verify-no-flash] clean — no blank gap, no white frame, no mid-session takeover');
