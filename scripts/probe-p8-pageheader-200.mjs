import { chromium } from 'playwright';
const b = await chromium.launch();
for (const path of ['/docs', '/about', '/guides']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await p.goto('http://localhost:3390' + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await p.waitForTimeout(300);
  console.log(path, await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const hits = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.right > vw + 1) hits.push({ over: Math.round(r.right - vw), cls: el.className?.toString().slice(0, 40) });
    }
    return JSON.stringify({ doc: document.documentElement.scrollWidth, hits: hits.slice(0, 3) });
  }));
  await c.close();
}
await b.close();
