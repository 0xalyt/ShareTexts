/** Does the intent placeholder survive the narrowest phone in every locale? */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://127.0.0.1:3015';
const LANGS = ['en', 'es', 'fr', 'de', 'pt', 'hi', 'ja', 'zh', 'ar'];
const browser = await chromium.launch();
let bad = 0;
for (const lang of LANGS) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  await ctx.addInitScript((l) => {
    try { localStorage.setItem('sharetext.locale', l); } catch {}
  }, lang);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const input = page.locator('[data-testid="intent-input"]');
  await input.waitFor({ timeout: 20000 });
  const m = await page.evaluate(() => {
    const i = document.querySelector('[data-testid="intent-input"]');
    const cs = getComputedStyle(i);
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return { ph: Math.round(c.measureText(i.placeholder).width), avail: i.clientWidth, text: i.placeholder };
  });
  const fits = m.ph <= m.avail;
  if (!fits) bad++;
  console.log(`${fits ? 'PASS' : 'FAIL'} ${lang}: "${m.text}" ${m.ph}px in ${m.avail}px`);
  await ctx.close();
}
await browser.close();
console.log(bad === 0 ? '\nALL LOCALES FIT AT 320px' : `\n${bad} LOCALE(S) CLIP`);
process.exit(bad === 0 ? 0 : 1);
