import { chromium } from 'playwright';
import { pairDevices } from './lib/flow.mjs';
const BASE = 'http://localhost:3390';
const b = await chromium.launch();
const c1 = await b.newContext({ viewport: { width: 1440, height: 900 } });
const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const A = await c1.newPage(); const B = await c2.newPage();
await pairDevices(A, B, BASE);
await A.waitForTimeout(600);
const count = async () => A.evaluate(() => {
  const ds = [...document.querySelectorAll('[role="dialog"]')].filter((d) => {
    const r = d.getBoundingClientRect(); const cs = getComputedStyle(d);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !d.closest('[aria-hidden="true"]');
  });
  return ds.length;
});
console.log('before escape, dialogs =', await count());
await A.keyboard.press('Escape');
await A.waitForTimeout(500);
console.log('after escape, dialogs =', await count());
await b.close();
