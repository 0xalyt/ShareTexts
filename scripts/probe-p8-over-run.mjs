import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w, h, zoom] of [[390, 844, 1], [390, 844, 2], [400, 844, 1], [560, 800, 1], [320, 700, 1], [768, 900, 1]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  await p.goto('http://localhost:3390/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(600);
  if (zoom !== 1) { await p.evaluate((z) => { document.documentElement.style.fontSize = `${16 * z}px`; }, zoom); await p.waitForTimeout(300); }
  const res = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const hdr = document.querySelector('header');
    const cluster = hdr?.querySelector('div.flex.items-center.gap-2');
    const r = cluster?.getBoundingClientRect();
    return { vw, hdrW: hdr ? Math.round(hdr.getBoundingClientRect().width) : null, clusterRight: r ? Math.round(r.right) : null, over: r ? Math.round(Math.max(0, r.right - vw)) : null, pad: hdr ? getComputedStyle(hdr).paddingInline : null };
  });
  console.log(`${w}x${h} zoom=${zoom}:`, JSON.stringify(res));
  await c.close();
}
await b.close();
