import { chromium } from 'playwright';
import { pairDevices } from './lib/flow.mjs';
const BASE = 'http://localhost:3390';
const b = await chromium.launch();

async function audit(page, label) {
  const out = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = []; const spill = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const text = (el.textContent || '').trim();
      // Text that is cut off by its own box (the classic translated/zoomed clip)
      if (text && el.children.length === 0) {
        const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
        const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
        if (hidesX && el.scrollWidth > el.clientWidth + 2) clipped.push({ t: text.slice(0, 40), by: el.scrollWidth - el.clientWidth, el: el.className?.toString().slice(0, 60) });
        if (hidesY && el.scrollHeight > el.clientHeight + 2) clipped.push({ t: text.slice(0, 40), by: el.scrollHeight - el.clientHeight, el: el.className?.toString().slice(0, 60) });
      }
      // Anything painted past the right edge of the viewport
      if (r.right > vw + 1 && cs.position !== 'fixed') {
        const parentScrolls = el.closest('[style*="overflow-x: auto"], .overflow-x-auto, .room-scroll');
        if (!parentScrolls) spill.push({ t: text.slice(0, 40) || el.tagName, right: Math.round(r.right - vw), el: el.className?.toString().slice(0, 60) });
      }
    }
    return { vw, docScrollW: document.documentElement.scrollWidth, clipped: clipped.slice(0, 8), spill: spill.slice(0, 8) };
  });
  console.log(`\n--- ${label}: vw=${out.vw} docScrollW=${out.docScrollW}`);
  console.log('  clipped:', out.clipped.length ? JSON.stringify(out.clipped, null, 0) : 'none');
  console.log('  spill  :', out.spill.length ? JSON.stringify(out.spill, null, 0) : 'none');
  return out;
}

for (const [w, h, zoom, tag] of [[390, 844, 1, 'phone'], [320, 700, 1, '320px'], [390, 844, 2, 'phone + 200% text']]) {
  const c1 = await b.newContext({ viewport: { width: w, height: h } });
  const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await c1.newPage(); const B = await c2.newPage();
  await pairDevices(A, B, BASE);
  await A.waitForTimeout(600);
  if (zoom !== 1) await A.evaluate((z) => { document.documentElement.style.fontSize = `${16 * z}px`; }, zoom);
  await A.waitForTimeout(400);
  await audit(A, `room ${tag}`);
  await c1.close(); await c2.close();
}
await b.close();
