import { chromium } from 'playwright';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
await p.goto('http://localhost:3390/docs', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(500);
await p.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
await p.waitForTimeout(300);
console.log(await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.right > vw + 1 && !el.parentElement?.className?.toString().includes('min-w-max'))
      hits.push({ over: Math.round(r.right - vw), tag: el.tagName, html: el.outerHTML.slice(0, 260) });
  }
  const doc = document.documentElement;
  return `docScrollW=${doc.scrollWidth} clientW=${doc.clientWidth}\n` + hits.slice(0, 2).map((h) => `over=${h.over} <${h.tag}>\n${h.html}`).join('\n\n');
}));
await c.close(); await b.close();
