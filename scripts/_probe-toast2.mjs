// Is the Disconnect button covered by a twin? Count dialogs, force-click, watch toast.
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctxA = await b.newContext({ viewport: { width: 1280, height: 860 } });
const ctxB = await b.newContext({ viewport: { width: 1280, height: 860 } });
const A = await ctxA.newPage(), B = await ctxB.newPage();
await A.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await A.getByTestId('home-send').click();
await A.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
const { roomId } = await A.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
await B.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await B.waitForTimeout(1200);
await B.evaluate((c) => { location.href = '/s/' + c; }, roomId.replace(/-/g, '').slice(0, 8));
await A.getByTestId('composer').first().waitFor({ timeout: 30000 });
await A.keyboard.press('Escape');
await A.locator('div[role="dialog"]').first().waitFor({ timeout: 6000 });
await A.waitForTimeout(800);
const st = await A.evaluate(() => {
  const dialogs = [...document.querySelectorAll('div[role="dialog"]')];
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Disconnect');
  return {
    dialogs: dialogs.length,
    btns: btns.length,
    rects: btns.map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }),
    topAtBtn: (() => { if (!btns.length) return null; const r = btns[btns.length-1].getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
      return el ? el.tagName + '|' + el.textContent.trim().slice(0,20) + '|' + (el.className||'').slice(0,50) : null; })(),
  };
});
console.log(JSON.stringify(st, null, 1));
await A.locator('div[role="dialog"] button').last().click({ force: true });
await A.waitForTimeout(1500);
const toast = await A.locator('[data-testid="disconnect-toast"]').count();
console.log('toast count after 1.5s:', toast, toast ? await A.locator('[data-testid="disconnect-toast"]').textContent() : '');
await A.waitForTimeout(5000);
console.log('toast after 6.5s:', await A.locator('[data-testid="disconnect-toast"]').count());
console.log('back on landing:', await A.getByTestId('home-send').count());
await b.close();
