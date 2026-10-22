// Probe: why doesn't Escape close the Saved overlay?
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3593;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
for (let i = 0; i < 120; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => console.log('[console.' + m.type() + ']', m.text().slice(0, 160)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.getByTestId('open-saved').first().waitFor({ timeout: 20000 });
await page.getByTestId('open-saved').first().click();
await page.getByTestId('saved-overlay').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
console.log('activeElement:', await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className?.slice(0, 40)));

// Does a keydown on the container even reach a listener?
const info = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="saved-overlay"]');
  let fired = false;
  const h = () => { fired = true; };
  c.addEventListener('keydown', h);
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const reached = fired;
  c.removeEventListener('keydown', h);
  return { reached, tag: c.tagName, hasTrapHandlers: true };
});
console.log('container keydown reaches listener:', JSON.stringify(info));

await page.locator('[data-testid="saved-overlay"]').press('Escape');
await page.waitForTimeout(600);
console.log('overlay after press:', await page.locator('[data-testid="saved-overlay"]').count());

// try pressing the close button instead, then reopen and Escape again
await page.getByTestId('saved-close').click();
await page.waitForTimeout(400);
console.log('overlay after close click:', await page.locator('[data-testid="saved-overlay"]').count());

await browser.close();
server.kill();
