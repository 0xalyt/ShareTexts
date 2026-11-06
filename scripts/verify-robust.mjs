/**
 * verify-robust — the ref low checks that survive a real reader.
 *
 * The Preservation-First UI guide asks for robustness under narrow width and
 * enlarged text, and it asks for evidence rather than assertion. This gate is
 * that evidence, kept: it loads the landing at 320px and again at 390px with
 * the root type size doubled (200% text, WCAG 1.4.4) and fails if
 *
 *   1. the document scrolls sideways, or
 *   2. a visible control is painted past the right edge of the viewport,
 *      where a reader cannot reach it.
 *
 * Both failures are real ones this page has had: the header's rem padding
 * doubled at 200% text while its 44px controls stayed fixed, pushing the
 * theme toggle 7px out of reach. Fixed by pinning that padding to 20px.
 *
 * Deliberately NOT asserted here: none. /docs at 200% text used to overflow by
 * 138px (docs/redesign/bugs.md B38); that is now fixed and asserted below, the
 * same way /about is — and the assertion is a real pan test, not a scrollWidth
 * comparison, because body has `overflow-x: clip` and an inflated scrollWidth
 * can be a number no reader can ever scroll to. B39 (/about "45px spill") was
 * exactly that phantom and is recorded as retracted.
 *
 *   URL=http://localhost:3390 node scripts/verify-robust.mjs
 */
import { launchBrowser, URL as BASE } from './lib.mjs';

const CASES = [
  { w: 320, h: 700, zoom: 1, label: '320px' },
  { w: 390, h: 844, zoom: 1, label: '390px' },
  { w: 390, h: 844, zoom: 2, label: '390px + 200% text' },
];

const browser = await launchBrowser();
let failures = 0;
const out = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if (c.zoom !== 1) {
    await page.evaluate((z) => {
      document.documentElement.style.fontSize = `${16 * z}px`;
    }, c.zoom);
    await page.waitForTimeout(300);
  }
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const past = [];
    for (const el of document.querySelectorAll('header *, header')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (box.right > vw + 1) {
        past.push({
          over: Math.round(box.right - vw),
          what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
        });
      }
    }
    return { vw, docScrollW: document.documentElement.scrollWidth, past };
  });
  out(r.docScrollW <= r.vw + 1, `landing ${c.label}: no horizontal page scroll`,
    `${r.docScrollW} vs ${r.vw}`);
  out(r.past.length === 0, `landing ${c.label}: header controls within the viewport`,
    r.past.length ? JSON.stringify(r.past.slice(0, 3)) : 'all inside');
  await ctx.close();
}

// The long-form pages, at 200% text — the case that produced B34. A reader can
// only lose content if the page actually pans, so this measures window.scrollX
// after a deliberate scroll attempt.
for (const path of ['/docs', '/about']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    window.scrollTo(600, 0);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const panned = window.scrollX;
    window.scrollTo(0, 0);
    return { vw: document.documentElement.clientWidth, panned };
  });
  out(r.panned === 0, `${path} + 200% text: page does not pan sideways`,
    r.panned === 0 ? 'scrollX stays 0' : `panned ${r.panned}px of ${r.vw}`);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nverify-robust: GREEN' : `\nverify-robust: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
