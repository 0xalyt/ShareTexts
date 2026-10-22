// Debug probe 3: what does room-panel show, and does a 3010 server differ?
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3010;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['dist/server.cjs'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
for (let i = 0; i < 40; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2000);
await page.getByTestId('home-send').click();
await sleep(5000);
const panel = page.getByTestId('room-panel');
console.log('room-panel count:', await panel.count());
if (await panel.count()) {
  const txt = (await panel.first().innerText()).replace(/\s+/g, ' ').slice(0, 300);
  console.log('room-panel text:', txt);
}
console.log('pairing-code count:', await page.getByTestId('pairing-code').count());
console.log('all testids:', JSON.stringify(await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll('[data-testid]')).map(e => e.getAttribute('data-testid')))])));
await browser.close();
server.kill();
