#!/usr/bin/env node
/**
 * measure-frames.mjs — the RELATIVE motion gate (P4 STEP 2, replaces the
 * absolute P2 budget).
 *
 * Why relative: these numbers come from headless Chromium rasterising on the
 * CPU in software. The same phase moves by 8+ points between runs on this host
 * (F31 records 5.6% → 16.4% → 18.6% overall across phases), so an absolute
 * "≤5% of frames over 33 ms" gate only measures the machine's mood. What this
 * gate can prove is that a change did not make a phase worse: every phase runs
 * RUNS times, the median is used, and the gate fails only when a phase is more
 * than TOLERANCE worse than the committed baseline. The real check is the
 * owner's phone.
 *
 *   node scripts/measure-frames.mjs                 # compare to the baseline
 *   node scripts/measure-frames.mjs --write-baseline # record this host
 *   URL=http://localhost:3022 node scripts/measure-frames.mjs
 *
 * audit/frames-baseline.json is committed WITH host info, because a baseline
 * from another machine is not a baseline.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';

const URL_BASE = process.env.URL || 'http://localhost:3010';
const RUNS = Number(process.env.RUNS || 5);
const TOLERANCE = 1.25; // a phase may be up to 25% worse than its baseline
const BASELINE = 'audit/frames-baseline.json';
const WRITE = process.argv.includes('--write-baseline');

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
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

let phases = [];
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

async function sequence() {
  phases = [];

  await home();
  await phase('scroll Home', async () => {
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(35);
    }
    await page.mouse.wheel(0, -400);
  });

  await home();
  await phase('push Send', async () => {
    await page.getByTestId('home-send').click();
  });
  await page.waitForSelector('[data-testid="task-back"]');
  await phase('Back to Home', async () => {
    await page.getByTestId('task-back').click();
  });

  await home();
  await phase('push Receive', async () => {
    await page.getByTestId('home-receive').click();
  });
  await page.waitForSelector('[data-testid="task-back"]');
  await phase('Back from Receive', async () => {
    await page.goBack();
  });

  await home();
  await phase('open Nearby sheet', async () => {
    await page.getByTestId('home-nearby').click();
  });
  await page.waitForTimeout(400);
  await phase('close Nearby sheet', async () => {
    await page.keyboard.press('Escape');
  });

  return phases;
}

const samples = new Map(); // name -> [pctOver per run]
for (let run = 0; run < RUNS; run++) {
  const result = await sequence();
  for (const p of result) {
    if (!samples.has(p.name)) samples.set(p.name, []);
    samples.get(p.name).push(p.pctOver);
  }
  process.stdout.write(`run ${run + 1}/${RUNS}\r`);
}
console.log('');

const medians = [...samples.entries()].map(([name, values]) => ({
  name,
  median: round(median(values)),
  runs: values,
  spread: round(Math.max(...values) - Math.min(...values)),
}));
const overallMedian = round(median(medians.map((m) => m.median)));

const hostInfo = {
  chromium: browser.version(),
  platform: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()?.[0]?.model?.trim() ?? 'unknown',
  cores: os.cpus()?.length ?? 0,
  viewport: '390x844',
  throttle: '4x CPU',
};

if (WRITE) {
  const baseline = { writtenAt: new Date().toISOString(), url: URL_BASE, host: hostInfo, tolerance: TOLERANCE, runs: RUNS, phases: medians, overall: overallMedian };
  mkdirSync('audit', { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`baseline written: ${BASELINE}`);
}

let baseline = null;
if (existsSync(BASELINE)) {
  try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { baseline = null; }
}

const header = ['phase', 'median %>33ms', 'runs', 'spread', 'baseline', 'verdict'];
const rows = medians.map((m) => {
  const base = baseline?.phases?.find((p) => p.name === m.name)?.median ?? null;
  let verdict = baseline ? '— (new phase)' : 'no baseline';
  if (base !== null && base !== undefined) {
    // A zero baseline cannot be scaled; treat any regression above 2 points as
    // a fail only when the baseline was non-zero, otherwise print the delta.
    const limit = base > 0 ? base * TOLERANCE : base + 2;
    verdict = m.median <= limit ? 'ok' : `FAIL (>${Math.round(limit * 10) / 10})`;
  }
  return [m.name, `${m.median}%`, m.runs.join('/'), `${m.spread}pt`, base === null ? '—' : `${base}%`, verdict];
});
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
console.log(fmt(header));
console.log(fmt(widths.map((w) => '-'.repeat(w))));
for (const r of rows) console.log(fmt(r));
console.log(`\nabsolute overall median: ${overallMedian}% of frames above 33 ms — information only (software rasterisation).`);
console.log(`baseline: ${baseline ? `${baseline.writtenAt} on ${baseline.host?.cpu} (${baseline.host?.platform})` : 'none — run --write-baseline once'}`);
if (baseline && (baseline.host?.cpu !== hostInfo.cpu || baseline.host?.platform !== hostInfo.platform)) {
  console.log('WARNING: baseline was recorded on a different host; the comparison is informational.');
}

const failing = rows.filter((r) => r[5].startsWith('FAIL'));
if (errors.length) console.log(`\npage errors: ${errors.join(' · ')}`);
await browser.close();
process.exit(failing.length === 0 && errors.length === 0 ? 0 : 1);
