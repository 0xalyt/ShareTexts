// Probe 4: after invoking the ✕ button's React onClick, sample the backdrop's
// computed opacity/transform over time. Distinguishes:
//   (a) state never flipped  → opacity stays 1
//   (b) exit started, node lingers → opacity reaches 0 but node never unmounts
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.getByTestId('open-saved').first().waitFor({ timeout: 20000 });
await page.getByTestId('open-saved').first().click();
await page.getByTestId('saved-overlay').waitFor({ timeout: 5000 });
await page.waitForTimeout(500);

// Sample style state now and after fiber-invoking onClose, every 200ms.
const sample = () => page.evaluate(() => {
  const bd = document.querySelector('[role="dialog"][aria-label="Saved items"]');
  if (!bd) return { gone: true };
  const cs = getComputedStyle(bd);
  return { opacity: cs.opacity, display: cs.display, transform: cs.transform.slice(0, 40), pe: cs.pointerEvents };
});
console.log('before:', JSON.stringify(await sample()));
await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="saved-close"]');
  const key = Object.keys(btn).find(k => k.startsWith('__reactFiber$'));
  let f = btn[key];
  while (f && !(f.memoizedProps && typeof f.memoizedProps.onClick === 'function')) f = f.return;
  f.memoizedProps.onClick();
});
for (let i = 1; i <= 12; i++) {
  await sleep(250);
  console.log(`t=${(i * 0.25).toFixed(2)}s`, JSON.stringify(await sample()));
}
await browser.close();
server.kill();
