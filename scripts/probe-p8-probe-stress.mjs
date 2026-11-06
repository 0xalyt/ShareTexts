import { chromium } from 'playwright';
import { pairDevices } from './lib/flow.mjs';
const BASE = 'http://localhost:3390';
const b = await chromium.launch();

const spillScan = () => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right > vw + 1 && !el.closest('.room-scroll, .overflow-x-auto, [style*="overflow-x: auto"]')) {
      bad.push({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 24), over: Math.round(r.right - vw), cls: el.className?.toString().slice(0, 50) });
    }
  }
  return { vw, docScrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 6) };
};

// 1) an unbroken 300-char string, the classic bubble-breaker
for (const [w, h] of [[390, 844], [320, 700]]) {
  const c1 = await b.newContext({ viewport: { width: w, height: h } });
  const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await c1.newPage(); const B = await c2.newPage();
  await pairDevices(A, B, BASE);
  await A.waitForTimeout(500);
  const long = 'https://example.com/' + 'a'.repeat(260);
  const box = A.locator('textarea').last();
  await box.fill(long);
  await box.press('Enter');
  await A.waitForTimeout(900);
  const s = await A.evaluate(spillScan);
  const bubble = await A.evaluate(() => {
    const el = [...document.querySelectorAll('.room-scroll *')].find((n) => (n.textContent || '').includes('aaaaaaaaaa'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), scrollW: el.scrollWidth, clientW: el.clientWidth, right: Math.round(r.right), wrap: getComputedStyle(el).wordBreak + '|' + getComputedStyle(el).overflowWrap };
  });
  console.log(`\n--- unbroken string @${w}: docScrollW=${s.docScrollW} spill=${s.bad.length ? JSON.stringify(s.bad) : 'none'}`);
  console.log('    bubble:', JSON.stringify(bubble));
  await c1.close(); await c2.close();
}

// 2) landing at 320 and at 200% text
for (const [w, h, zoom, tag] of [[320, 700, 1, 'landing 320'], [390, 844, 2, 'landing 200% text']]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(700);
  if (zoom !== 1) await p.evaluate((z) => { document.documentElement.style.fontSize = `${16 * z}px`; }, zoom);
  await p.waitForTimeout(500);
  const s = await p.evaluate(spillScan);
  console.log(`\n--- ${tag}: docScrollW=${s.docScrollW} spill=${s.bad.length ? JSON.stringify(s.bad) : 'none'}`);
  await c.close();
}
await b.close();
