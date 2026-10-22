// Debug probe: does clicking Send on the landing produce the pairing code?
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2000);
console.log('before click: pairing-code =', await page.getByTestId('pairing-code').count());
console.log('visible Send buttons:', await page.locator('button:visible', { hasText: 'Send' }).count());
await page.locator('button:visible', { hasText: 'Send' }).first().click();
console.log('clicked Send');
for (let i = 0; i < 12; i++) {
  await sleep(1500);
  const n = await page.getByTestId('pairing-code').count();
  const digits = n ? await page.getByTestId('pairing-code').locator('span').allTextContents() : [];
  console.log(`t=${(i + 1) * 1.5}s code=${n} digits=${digits.join('')}`);
  if (n && digits.filter(d => /^\d$/.test(d)).length >= 6) break;
}
await browser.close();
server.kill();
