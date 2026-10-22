// Probe 4: does attaching a 'websocket' listener to B break A's room creation?
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3591;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['dist/server.cjs'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 40; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();

const withWsListener = process.argv.includes('--ws');
if (withWsListener) {
  B.on('websocket', ws => ws.on('framesent', () => {}));
  console.log('attached websocket listener to B');
}

await A.goto(URL, { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2000);
if ((await A.getByTestId('pairing-code').count()) === 0) {
  console.log('clicking home-send; visible =', await A.getByTestId('home-send').isVisible());
  await A.getByTestId('home-send').click();
}
const ok = await A.getByTestId('pairing-code').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
console.log('pairing-code appeared:', ok);
await browser.close();
server.kill();
