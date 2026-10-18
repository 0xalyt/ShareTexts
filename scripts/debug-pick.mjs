import { chromium } from 'playwright';

const BASE = 'http://localhost:3010';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pa = await ctx.newPage();
await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
await pa.getByRole('button', { name: 'Send', exact: true }).click();
await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
const short = roomId.replace(/-/g, '').slice(0, 8);
const pb = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
await pb.waitForTimeout(1200);
await pb.evaluate((code) => { location.href = '/s/' + code; }, short);
await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
await pa.getByTestId('composer').fill('probe');
await pa.keyboard.press('Enter');
await pb.waitForSelector('text=probe', { timeout: 15000 });
await pa.waitForTimeout(500);

await pb.evaluate(() => { (window).__erlog = []; });
const trigger = pb.locator('button[aria-label="React"]').first();
const box = await trigger.boundingBox();
await pb.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await pb.mouse.down();
await pb.waitForTimeout(120);
await pb.mouse.up();
await pb.waitForTimeout(600);
console.log('post-up palette:', await pb.evaluate(() => !!document.querySelector('[role="menu"]')));
console.log(JSON.stringify(await pb.evaluate(() => (window).__erlog), null, 1));

await browser.close();
