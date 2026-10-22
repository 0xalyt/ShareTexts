// One-off probe: is the pre-paint boot script blocked by CSP on the LIVE site?
// Evidence for bugs.md (S1 candidate). Prints console CSP errors, then whether
// html.dark lands pre-paint for a dark-forced visitor.
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('', { viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { localStorage.setItem('sharetext.theme', 'dark'); } catch {} });
const page = await ctx.newPage();
const csp = [];
page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) csp.push(m.text()); });
page.on('pageerror', (e) => { if (/Content Security Policy|CSP/i.test(e.message)) csp.push(e.message); });

await page.goto('https://sharetexts.online/', { waitUntil: 'domcontentloaded', timeout: 30000 });
const earlyDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
await page.waitForTimeout(1500);
const lateDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));

console.log(JSON.stringify({ cspViolations: csp.length, first: (csp[0] || '').slice(0, 220), earlyDark, lateDark }, null, 1));
await ctx.close();
