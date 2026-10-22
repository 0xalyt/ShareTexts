// Probe 2: instrument the close path precisely.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3593;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 120; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() !== 'debug' && m.type() !== 'log') console.log('[console.' + m.type() + ']', m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.getByTestId('open-saved').first().waitFor({ timeout: 20000 });
await page.getByTestId('open-saved').first().click();
await page.getByTestId('saved-overlay').waitFor({ timeout: 5000 });
await page.waitForTimeout(500);

// Tap-logging: did the close button's React onClick run? We can't see React
// state, but we CAN watch whether the click bubbles to document AND whether
// the overlay's host node goes away over time.
await page.evaluate(() => {
  window.__log = [];
  document.addEventListener('click', (e) => {
    const t = e.target;
    window.__log.push('doc click on ' + (t.closest?.('[data-testid]')?.getAttribute('data-testid') || t.tagName));
  }, true);
  window.__watch = setInterval(() => {
    const n = document.querySelectorAll('[data-testid="saved-overlay"]').length;
    const d = document.querySelectorAll('[role="dialog"][aria-label="Saved items"]').length;
    window.__log.push(`t overlay=${n} dialog=${d}`);
  }, 300);
});

await page.getByTestId('saved-close').click();
await page.waitForTimeout(3000);
const log = await page.evaluate(() => { clearInterval(window.__watch); return window.__log; });
console.log('log:', JSON.stringify(log));
console.log('activeElement after close:', await page.evaluate(() => document.activeElement?.tagName + '|' + (document.activeElement?.getAttribute('data-testid') || document.activeElement?.className?.slice(0, 30))));

await browser.close();
server.kill();
