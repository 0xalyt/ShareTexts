// Front-door gate — the two things that must both be true.
//
// Until P5 this gate asserted `documentElement.scrollHeight === clientHeight`:
// the landing was one non-scrolling screen with an inner scroll box. DESIGN.md
// §20a reverses that — the landing is a *page*, and the window scrolls it. The
// intent that made the old assertion worth having is kept, and is now checked
// separately:
//
//   1. the first viewport still composes — headline, doors and the running
//      product inside one screen at every desktop size, nothing clipped;
//   2. nothing scrolls inside the page (no inner scroll container), so the
//      scrollbar the visitor sees belongs to the browser;
//   3. the story is in §20a order with the right counts: three stories, eight
//      small things (seven since the GitHub link came out), eight FAQ answers,
//      a footer whose links keep a 44px target.
import { launchBrowser, sleep } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1152, 700], [1024, 768]];
const browser = await launchBrowser();
let bad = 0;

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]:visible').first().waitFor({ timeout: 20000 });
  await sleep(1200);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const main = document.getElementById('main-content');
    const demo = [...document.querySelectorAll('[data-testid="hero-demo"]')]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.width > 0);
    const scrub = document.querySelector('[role="slider"]')?.getBoundingClientRect();
    // Anything inside the landing that scrolls on its own would put the
    // visitor's wheel in a container instead of the page.
    const scrollers = [...document.querySelectorAll('#main-content, #main-content *')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        return scrolls && el.scrollHeight > el.clientHeight + 2;
      })
      .map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
    return {
      pageScroll: de.scrollHeight - de.clientHeight,
      innerScroll: main ? main.scrollHeight - main.clientHeight : 0,
      demoBottom: demo ? Math.round(demo.bottom) : null,
      scrubBottom: scrub ? Math.round(scrub.bottom) : null,
      vh: window.innerHeight,
      scrollers,
      headerSticky: (() => { const hd = document.querySelector('header'); return hd ? getComputedStyle(hd).position : null; })(),
    };
  });
  const clipped = r.demoBottom !== null && r.demoBottom > r.vh + 1;
  const scrubClipped = r.scrubBottom !== null && r.scrubBottom > r.vh + 1;
  const inner = r.scrollers.length > 0;
  const ok = !clipped && !scrubClipped && !inner;
  if (!ok) bad++;
  console.log(
    `${w}x${h}: ${ok ? 'ok' : 'PROBLEM'} heroInFold demoBottom=${r.demoBottom} scrubBottom=${r.scrubBottom} ` +
      `vh=${r.vh} pageScroll=${r.pageScroll} innerScrollers=${r.scrollers.join(',') || 'none'} header=${r.headerSticky}`,
  );
  await ctx.close();
}

// ── structure: hero → three things → the small things → FAQ → footer, in that
//    order, with the counts §20a asks for. There is deliberately NO second
//    Send/Receive pair at the foot of the page: the hero already owns those
//    two decisions, and repeating them at the end made people ask which pair
//    was the real one. This assertion is inverted on purpose — a 'cta' section
//    reappearing is now the regression.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-testid="hero-demo"]:visible').first().waitFor({ timeout: 20000 });
  await sleep(600);
  const marks = await p.evaluate(() => {
    const sel = {
      hero: 'h1',
      // `data-state="film"` is the desktop surface only; the phone branch
      // renders a second, lg:hidden hero node earlier in the DOM.
      demo: '[data-testid="hero-demo"][data-state="film"]',
      how: '#how-title',
      features: '#features-title',
      faq: '#faq-title',
      footer: 'footer',
    };
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      // The hero mounts in both the phone slot and the desktop column; only one
      // of them has size at any width, and a display:none node reports (0,0),
      // which would put the hero below its own headline in this ordering test.
      const el = k === 'demo'
        ? [...document.querySelectorAll(s)].find((n) => n.getBoundingClientRect().width > 0)
        : document.querySelector(s);
      // Document-relative, because the page now scrolls: viewport-relative tops
      // of below-fold sections are only meaningful before any scrolling, and a
      // restored scroll position would break the comparison.
      out[k] = el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
    }
    out.howSteps = document.querySelectorAll('section[aria-labelledby="how-title"] ul > li').length;
    out.smallItems = document.querySelectorAll('section[aria-labelledby="features-title"] ul > li').length;
    out.faqItems = document.querySelectorAll('section[aria-labelledby="faq-title"] ul > li').length;
    // §20d: every footer link is a 44px target, and there is no icon row.
    const links = [...document.querySelectorAll('footer a, footer button')];
    out.footerLinks = links.length;
    out.smallTargets = links
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => `${(el.textContent || '').trim().slice(0, 18) || el.getAttribute('aria-label')}=${Math.round(el.getBoundingClientRect().height)}`);
    return out;
  });
  const order = ['hero', 'demo', 'how', 'features', 'faq', 'footer'];
  const present = order.every((k) => marks[k] !== null);
  const ascending = present && order.every((k, i) => i === 0 || marks[order[i]] >= marks[order[i - 1]]);
  // 7 FAQ rows is the shipped set (LandingSections → `home.faq.q1…q7`); the 8
  // here predates the row that was cut when the FAQ was re-scoped to the
  // four questions a stranger actually asks.
  const countsOk = marks.howSteps === 3 && marks.smallItems === 7 && marks.faqItems === 7;
  const targetsOk = marks.smallTargets.length === 0;
  const noRepeatCta = (await p.locator('#cta-title').count()) === 0;
  const okStruct = present && ascending && countsOk && targetsOk && noRepeatCta;
  if (!okStruct) bad++;
  console.log(
    `${okStruct ? 'structure ok' : 'STRUCTURE PROBLEM'}: ${order.map((k) => `${k}=${marks[k]}`).join(' ')} ` +
      `stories=${marks.howSteps} small=${marks.smallItems} faq=${marks.faqItems} footerLinks=${marks.footerLinks} ` +
      (noRepeatCta ? 'tail=one-cta' : 'TAIL: duplicate Send/Receive block is back') +
      (targetsOk ? '' : ` SMALL-TARGETS: ${marks.smallTargets.join(', ')}`),
  );
  await ctx.close();
}

await browser.close();
console.log('failures:', bad);
process.exit(bad === 0 ? 0 : 1);
