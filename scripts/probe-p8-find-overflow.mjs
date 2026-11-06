import { chromium } from 'playwright';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
await p.goto('http://localhost:3390/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(700);
await p.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
await p.waitForTimeout(400);
console.log(await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.right <= vw + 1) continue;
    hits.push({ over: Math.round(r.right - vw), html: el.outerHTML.slice(0, 320) });
  }
  return `vw=${vw}\n` + hits.slice(0, 3).map((h) => `over=${h.over}\n${h.html}`).join('\n\n');
}));
await c.close(); await b.close();
