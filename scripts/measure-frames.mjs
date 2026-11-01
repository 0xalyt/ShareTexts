#!/usr/bin/env node
/**
 * measure-frames.mjs — DESIGN.md §18 motion budget.
 *
 * Contract: at most 5% of frames may take longer than 33 ms (>2 frames at
 * 60 Hz) while the app is doing the things P2 added — scrolling Home, pushing
 * a screen and coming back, opening and closing a sheet. A painted transition
 * that cannot hold 60 fps on a mid phone is worse than no transition, so this
 * measures with the CPU throttled 4x, which is the usual stand-in for a
 * mid-range Android phone.
 *
 * Method: a requestAnimationFrame sampler records timestamps; the deltas are
 * frame times. p50/p95/p99 plus the over-33 ms share are printed per phase and
 * overall. Numbers land in audit/p2/frames.md.
 *
 *   node scripts/measure-frames.mjs
 *   URL=http://localhost:3022 node scripts/measure-frames.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL_BASE = process.env.URL || 'http://localhost:3010';
const BUDGET_PCT = 5;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const startSampling = () =>
  page.evaluate(() => {
    window.__frames = [];
    let last = 0;
    const tick = (t) => {
      if (last) window.__frames.push(t - last);
      last = t;
      window.__rafId = requestAnimationFrame(tick);
    };
    window.__rafId = requestAnimationFrame(tick);
  });

const stopSampling = () =>
  page.evaluate(() => {
    cancelAnimationFrame(window.__rafId);
    return window.__frames.slice(1); // the first delta spans the start of sampling
  });

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};
const round = (n) => Math.round(n * 10) / 10;

const phases = [];
async function phase(name, run, ms = 1300) {
  await startSampling();
  await run();
  await page.waitForTimeout(ms);
  const frames = await stopSampling();
  const over = frames.filter((f) => f > 33).length;
  phases.push({
    name,
    frames: frames.length,
    p50: round(pct(frames, 50)),
    p95: round(pct(frames, 95)),
    p99: round(pct(frames, 99)),
    max: round(Math.max(...frames, 0)),
    over,
    pctOver: frames.length ? round((over / frames.length) * 100) : 0,
  });
}

const home = async () => {
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]');
  await page.waitForTimeout(900);
};

await home();

// ── 1. Scrolling Home ────────────────────────────────────────────────────
await phase('scroll Home', async () => {
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(35);
  }
  await page.mouse.wheel(0, -400);
});

// ── 2. Push a screen and come back ───────────────────────────────────────
await home();
await phase('push Send', async () => {
  await page.getByTestId('home-send').click();
});
await page.waitForSelector('[data-testid="task-back"]');
await phase('Back to Home', async () => {
  await page.getByTestId('task-back').click();
});

// ── 3. Receive, the same way ─────────────────────────────────────────────
await home();
await phase('push Receive', async () => {
  await page.getByTestId('home-receive').click();
});
await page.waitForSelector('[data-testid="task-back"]');
await phase('Back from Receive', async () => {
  await page.goBack();
});

// ── 4. Sheet open and close ──────────────────────────────────────────────
await home();
await phase('open Nearby sheet', async () => {
  await page.getByTestId('home-nearby').click();
});
await page.waitForTimeout(400);
await phase('close Nearby sheet', async () => {
  await page.keyboard.press('Escape');
});

const totals = phases.flatMap((p) => [p]);
const allFrames = phases.reduce((n, p) => n + p.frames, 0);
const allOver = phases.reduce((n, p) => n + p.over, 0);
const overallPct = allFrames ? round((allOver / allFrames) * 100) : 0;
const failing = phases.filter((p) => p.pctOver > BUDGET_PCT);

const header = ['phase', 'frames', 'p50', 'p95', 'p99', 'max', '>33ms', '%>33ms'];
const rows = totals.map((p) => [p.name, p.frames, p.p50, p.p95, p.p99, p.max, p.over, `${p.pctOver}%`]);
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');

const lines = [
  '# Frame budget — P2 §18 (CPU throttle 4x, 390×844)',
  '',
  `URL: ${URL_BASE}  ·  Chromium ${browser.version()}  ·  budget: ≤${BUDGET_PCT}% of frames above 33 ms`,
  '',
  fmt(header),
  fmt(widths.map((w) => '-'.repeat(w))),
  ...rows.map(fmt),
  '',
  `overall: ${allFrames} frames, ${allOver} above 33 ms → ${overallPct}%  (budget ${BUDGET_PCT}%)`,
  `verdict: ${failing.length ? `FAIL — ${failing.map((p) => p.name).join(', ')}` : 'PASS — every phase inside budget'}`,
  '',
  'Note: 4x CPU throttle is a stand-in for a mid-range Android phone, not a',
  'measurement of one. Real-device numbers need a real device.',
  errors.length ? `\npage errors: ${errors.join(' · ')}` : '',
].filter(Boolean);

mkdirSync('audit/p2', { recursive: true });
writeFileSync('audit/p2/frames.md', lines.join('\n'));
console.log(lines.join('\n'));

await browser.close();
process.exit(failing.length === 0 && errors.length === 0 ? 0 : 1);
