// Which elements overflow horizontally at 390x844 (verify-f18's FAIL)?
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await p.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
await new Promise(r => setTimeout(r, 900));
const info = await p.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > W + 1 || r.left < -1) {
      out.push({
        tag: el.tagName, cls: (el.getAttribute('class') || '').slice(0, 90),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        parent: el.parentElement ? el.parentElement.tagName + '.' + (el.parentElement.getAttribute('class') || '').slice(0, 40) : '',
      });
    }
  }
  return { W, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 12) };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
