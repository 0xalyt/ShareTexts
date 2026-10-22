// Probe 5: capture why createSession fails (createError UI + network).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3591;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['dist/server.cjs'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
for (let i = 0; i < 40; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0, 120), r.failure()?.errorText));
page.on('response', async r => {
  const u = r.url();
  if (/create|room|api|socket|ws/i.test(u)) console.log('[response]', r.status(), u.slice(0, 120));
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await sleep(2000);
await page.getByTestId('home-send').click();
for (let i = 0; i < 10; i++) {
  await sleep(1500);
  const code = await page.getByTestId('pairing-code').count();
  const panel = await page.getByTestId('room-panel').count();
  // any create-error / retry / error UI surfaced?
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const errish = body.match(/(couldn't|failed|error|retry|offline|try again)[^.]{0,60}/i);
  console.log(`t=${(i + 1) * 1.5}s code=${code} panel=${panel} err=${errish ? errish[0].slice(0, 80) : 'none'}`);
  if (code) break;
}
await browser.close();
server.kill();
