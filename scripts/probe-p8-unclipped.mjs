// Probe: which elements stick out of the viewport *and* are not clipped by any
// ancestor? Those are the only ones that can actually push the page sideways;
// everything else is decoration inside a scroll or clip container.
//
//   URL=http://localhost:3390 node scripts/probe-p8-unclipped.mjs
import { launchBrowser } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3390';
const PATHS = ['/docs', '/about'];
const WIDTHS = [320, 390];

const browser = await launchBrowser();
for (const path of PATHS) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await page.waitForTimeout(300);

    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const clipperOf = (el) => {
        let n = el.parentElement;
        while (n && n !== document.body) {
          const cs = getComputedStyle(n);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return n;
          n = n.parentElement;
        }
        return null;
      };
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.right <= vw + 1) continue;
        if (clipperOf(el)) continue; // inside a scroll/clip container: contained
        offenders.push({
          over: Math.round(box.right - vw),
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 60),
          text: (el.textContent || '').trim().slice(0, 24),
        });
      }
      offenders.sort((a, b) => b.over - a.over);
      return {
        docScrollW: document.documentElement.scrollWidth,
        vw,
        offenders: offenders.slice(0, 5),
      };
    });

    const slack = report.docScrollW - report.vw;
    console.log(
      `${path} ${width}px + 200% text: docScrollW=${report.docScrollW} slack=${slack} ` +
      `unclipped=${report.offenders.length}`
    );
    for (const o of report.offenders) {
      console.log(`   +${o.over}px <${o.tag} class="${o.cls}"> "${o.text}"`);
    }
    await ctx.close();
  }
}
await browser.close();
