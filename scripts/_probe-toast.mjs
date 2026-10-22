// Does the disconnect toast appear when the confirm sheet's Disconnect is clicked?
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctxA = await b.newContext({ viewport: { width: 1280, height: 860 } });
const ctxB = await b.newContext({ viewport: { width: 1280, height: 860 } });
const A = await ctxA.newPage(), B = await ctxB.newPage();
await A.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await A.getByTestId('home-send').click();
await A.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
const { roomId } = await A.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
const short = roomId.replace(/-/g, '').slice(0, 8);
await B.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await B.waitForTimeout(1200);
await B.evaluate((c) => { location.href = '/s/' + c; }, short);
await A.getByTestId('composer').first().waitFor({ timeout: 30000 });
await A.keyboard.press('Escape');
const dlg = A.locator('div[role="dialog"]').first();
await dlg.waitFor({ timeout: 6000 });
const btns = await dlg.locator('button').allTextContents();
console.log('dialog buttons:', JSON.stringify(btns));
await dlg.locator('button').filter({ hasText: /disconnect|end|close/i }).first().click();
// watch for the toast appearing AND disappearing
const seen = await A.waitForSelector('[data-testid="disconnect-toast"]', { timeout: 8000 }).then(() => 'appeared').catch(() => 'never appeared');
console.log('toast:', seen);
if (seen === 'appeared') {
  await A.waitForTimeout(200);
  console.log('toast text:', await A.locator('[data-testid="disconnect-toast"]').textContent());
  await A.waitForTimeout(6000);
  console.log('still visible after 6s:', await A.locator('[data-testid="disconnect-toast"]').isVisible());
}
await b.close();
