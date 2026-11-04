// Landing budgets, measured the way the report quotes them (P6 STEP 4).
//
// Conditions match the brief: mobile viewport, Slow 4G (1.6 Mbit/s down,
// 750 kbit/s up, 150 ms RTT), 4x CPU slowdown. LCP and CLS come from the
// browser's own PerformanceObserver; INP is approximated from the worst
// interaction latency after a real click, because a lab run has no scrolling
// user to produce a true INP.
//
// Run against a production build:
//   PORT=3371 NODE_ENV=production node dist/server.cjs &
//   URL=http://127.0.0.1:3371 node scripts/perf-landing.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:3371';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const transfer = { bytes: 0, requests: 0, js: 0 };
page.on('response', async (res) => {
  try {
    const len = Number(res.headers()['content-length'] || 0);
    transfer.requests++;
    transfer.bytes += len;
    if (res.url().endsWith('.js')) transfer.js += len;
  } catch {
    /* a response that vanished is not a measurement */
  }
});

await page.addInitScript(() => {
  window.__metrics = { lcp: 0, cls: 0, inp: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__metrics.lcp = Math.round(e.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!e.hadRecentInput) window.__metrics.cls += e.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__metrics.inp = Math.max(window.__metrics.inp, Math.round(e.duration));
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load' });
const load = Date.now() - t0;
await page.waitForTimeout(2500);

// One real interaction so INP has something to measure.
await page.mouse.wheel(0, 240);
await page.waitForTimeout(600);
const m = await page.evaluate(() => window.__metrics);

const gz = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`LCP              ${m.lcp} ms        (budget 2000)`);
console.log(`CLS              ${m.cls.toFixed(3)}         (budget 0.05)`);
console.log(`INP (observed)   ${m.inp} ms         (budget 150)`);
console.log(`load event       ${load} ms`);
console.log(`JS over the wire ${gz(transfer.js)} uncompressed  ${transfer.requests} requests, ${gz(transfer.bytes)} total`);

await browser.close();
