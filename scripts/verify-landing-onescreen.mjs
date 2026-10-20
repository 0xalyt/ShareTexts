// One-screen landing check across desktop sizes: the document must not
// scroll, and the demo + caption + scrubber must be fully inside the fold.
import { launchBrowser, sleep } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1152, 700], [1024, 768]];
const browser = await launchBrowser();
let bad = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await sleep(1200);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const main = document.getElementById('main-content');
    const demo = document.querySelector('[data-testid="hero-demo"]')?.getBoundingClientRect();
    const scrub = document.querySelector('[role="slider"]')?.getBoundingClientRect();
    return {
      pageScroll: de.scrollHeight - de.clientHeight,
      innerScroll: main ? main.scrollHeight - main.clientHeight : 0,
      demoBottom: demo ? Math.round(demo.bottom) : null,
      scrubBottom: scrub ? Math.round(scrub.bottom) : null,
      vh: window.innerHeight,
      headerSticky: (() => { const hd = document.querySelector('header'); return hd ? getComputedStyle(hd).position : null; })(),
    };
  });
  const clipped = r.demoBottom !== null && r.demoBottom > r.vh + 1;
  const scrubClipped = r.scrubBottom !== null && r.scrubBottom > r.vh + 1;
  const ok = r.pageScroll === 0 && !clipped && !scrubClipped;
  if (!ok) bad++;
  console.log(`${w}x${h}: ${ok ? 'ok' : 'PROBLEM'} pageScroll=${r.pageScroll} innerScroll=${r.innerScroll} demoBottom=${r.demoBottom} scrubBottom=${r.scrubBottom} vh=${r.vh} header=${r.headerSticky}`);
  await ctx.close();
}
console.log('sizes failing one-screen:', bad, 'of', SIZES.length);

// ── Phase 5 structure: hero → demo → how (01/02/03) → features (6) →
//    FAQ (5) → final CTA → footer, in that scroll order, all present.
//    Added deliberately with the landing restructure — the gate now pins
//    the order so a future edit can't silently reorder the story.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]').first().waitFor({ timeout: 20000 });
  await sleep(600);
  const marks = await p.evaluate(() => {
    const sel = {
      hero: 'h1',
      demo: '[data-testid="hero-demo"]',
      how: '#how-title',
      features: '#features-title',
      faq: '#faq-title',
      cta: '#cta-title',
      footer: 'footer',
    };
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      out[k] = el ? Math.round(el.getBoundingClientRect().top) : null;
    }
    out.howSteps = document.querySelectorAll('section[aria-labelledby="how-title"] ol li').length;
    out.faqItems = document.querySelectorAll('section[aria-labelledby="faq-title"] ul > li').length;
    return out;
  });
  const order = ['hero', 'demo', 'how', 'features', 'faq', 'cta', 'footer'];
  const present = order.every((k) => marks[k] !== null);
  const ascending =
    present && order.every((k, i) => i === 0 || marks[order[i]] >= marks[order[i - 1]]);
  const countsOk = marks.howSteps === 3 && marks.faqItems === 5;
  const okStruct = present && ascending && countsOk;
  if (!okStruct) bad++;
  console.log(
    `${okStruct ? 'structure ok' : 'STRUCTURE PROBLEM'}: ${order
      .map((k) => `${k}=${marks[k]}`)
      .join(' ')} howSteps=${marks.howSteps} faqItems=${marks.faqItems}`,
  );
  await ctx.close();
}

await browser.close();
process.exit(bad === 0 ? 0 : 1);
