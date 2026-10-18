// One-off: clip-shot the radar region at full scale to see what paints.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:3010';
const b = await chromium.launch();
const mk = async () => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 850 } });
  const p = await ctx.newPage();
  await ctx.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return p;
};
const A = await mk();
const B = await mk();

const seen = await A.getByTestId('nearby-detect-overlay').waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
console.log('overlay:', seen);
if (seen) {
  await A.waitForTimeout(1600);
  // Radar box: probe geometry inline, then clip exactly it.
  const box = await A.evaluate(() => {
    const dialog = document.querySelector('[data-testid="nearby-detect-overlay"]')?.closest('[role="dialog"]');
    const el = dialog?.querySelector('.aspect-square');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x) - 10, y: Math.round(r.y) - 10, width: Math.round(r.width) + 20, height: Math.round(r.height) + 20 };
  });
  console.log('clip:', JSON.stringify(box));
  if (box) await A.screenshot({ path: '.audit-shots/radar-clip.png', clip: box });

  // Computed opacity of the bubble wrapper (motion may have left it at 0):
  const bubbleState = await A.evaluate(() => {
    const dialog = document.querySelector('[data-testid="nearby-detect-overlay"]')?.closest('[role="dialog"]');
    const box = dialog?.querySelector('.aspect-square');
    const bubbleWrap = box?.querySelector('div[style*="left"]') || null;
    const all = [...(box?.children ?? [])].map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `${el.tagName} @( ${Math.round(r.x)},${Math.round(r.y)} ) ${Math.round(r.width)}x${Math.round(r.height)} op=${cs.opacity} tf=${cs.transform.slice(0, 50)}`;
    });
    return all;
  });
  console.log(bubbleState.join('\n'));
}
await b.close();
