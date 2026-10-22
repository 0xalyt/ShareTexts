// Debug probe 2: dump DOM state after clicking Send.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3592;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['dist/server.cjs'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
for (let i = 0; i < 40; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2000);

// Which Send buttons exist and where?
const sends = await page.locator('button:visible', { hasText: 'Send' }).evaluateAll(els =>
  els.map(el => ({ text: el.textContent.trim().slice(0, 30), testid: el.getAttribute('data-testid'), rect: el.getBoundingClientRect().toJSON() })));
console.log('Send buttons:', JSON.stringify(sends));

await page.locator('button:visible', { hasText: 'Send' }).first().click();
await sleep(4000);
const testids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map(e => e.getAttribute('data-testid')));
console.log('testids after click:', JSON.stringify([...new Set(testids)]));
await browser.close();
server.kill();
