// Item 8: on desktop does the LANDING scroll inside <main> or the window?
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await p.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
await new Promise(r => setTimeout(r, 800));
const r = await p.evaluate(() => {
  const m = document.querySelector('main');
  const mainScrolls = m ? (m.scrollHeight > m.clientHeight + 2) && getComputedStyle(m).overflowY !== 'visible' : false;
  // force overflow on main and see which container grows
  return {
    docScrollH: document.documentElement.scrollHeight, winH: window.innerHeight,
    bodyScrollH: document.body.scrollHeight,
    mainScrollH: m?.scrollHeight, mainClientH: m?.clientHeight,
    mainOverflowY: m ? getComputedStyle(m).overflowY : null,
    mainStyleH: m ? getComputedStyle(m).height : null,
    mainOverflows: mainScrolls,
  };
});
console.log(JSON.stringify(r, null, 1));
// scroll the wheel: where does scrollTop land?
await p.mouse.move(700, 450);
await p.mouse.wheel(0, 400);
await new Promise(res => setTimeout(res, 400));
const after = await p.evaluate(() => ({
  winScrollY: window.scrollY,
  mainScrollTop: document.querySelector('main')?.scrollTop,
}));
console.log('after wheel 400px:', JSON.stringify(after));
await b.close();
