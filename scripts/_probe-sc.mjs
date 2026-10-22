import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:3010/space/create', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  url: location.pathname,
  testids: [...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')).slice(0, 40),
  inputs: [...document.querySelectorAll('input')].map(e => ({ id: e.getAttribute('data-testid'), visible: !!(e.offsetWidth || e.offsetHeight) })),
}));
console.log(JSON.stringify(info, null, 1));
await b.close();
