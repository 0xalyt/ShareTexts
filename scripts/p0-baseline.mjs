// p0-baseline — Phase 0 evidence for the apple-grade branch:
//   1. screenshot matrix: landing @ 360x780, 390x844, 768x1024, 1440x900
//      x light/dark (localStorage theme, prod build)
//   2. metrics on 390x844: LCP, CLS, JS response bytes (gzip as served)
//   3. one landing-demo recording (the hero loop, 14s)
// Run: node scripts/p0-baseline.mjs   (needs prod server on PORT=3013)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.URL || 'http://localhost:3013';
const OUT = path.join(root, 'docs', 'audit');
fs.mkdirSync(OUT, { recursive: true });

const OBSERVE = `
  window.__p0 = { lcp: 0, cls: 0 };
  new PerformanceObserver((l) => {
    const e = l.getEntries();
    const last = e[e.length - 1];
    if (last) window.__p0.lcp = Math.round(last.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__p0.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
`;

const VIEWPORTS = [
  [360, 780],
  [390, 844],
  [768, 1024],
  [1440, 900],
];
const THEMES = ['light', 'dark'];

const browser = await chromium.launch();
let jsBytes390 = 0;

for (const [w, h] of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(`localStorage.setItem('sharetext.theme', '${theme}')`);
    await ctx.addInitScript(OBSERVE);
    const page = await ctx.newPage();
    page.on('response', async (res) => {
      if (w === 390 && res.url().endsWith('.js')) {
        try {
          const headers = res.headers();
          jsBytes390 += Number(headers['content-length'] || 0);
        } catch {}
      }
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(700);
    const name = `p0-landing-${w}x${h}-${theme}.jpg`;
    await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 78 });
    let m = '';
    if (w === 390 && theme === 'light') {
      await page.waitForTimeout(1500);
      m = await page.evaluate(() => `LCP ${window.__p0.lcp}ms CLS ${window.__p0.cls.toFixed(3)}`);
    }
    console.log(`${name} ${m}`);
    await ctx.close();
  }
}

console.log(`JS transfer on / @390: ${Math.round(jsBytes390 / 1024)} KB (gzip as served)`);

// Landing demo recording: 14s covers >2 loop cycles of the hero demo.
const vctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
await vctx.addInitScript(`localStorage.setItem('sharetext.theme', 'light')`);
const vpage = await vctx.newPage();
await vpage.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await vpage.waitForTimeout(14000);
const video = await vpage.video().path();
await vctx.close();
fs.renameSync(video, path.join(OUT, 'p0-landing-demo.webm'));
console.log('p0-landing-demo.webm recorded (14s)');

await browser.close();
