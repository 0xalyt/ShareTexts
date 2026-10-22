// Probe 3: does React's own onClick on saved-close fire, and does calling
// onClose directly close the overlay? Distinguishes "event not delivered"
// from "state not applied".
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

// 1) Can React handlers fire at all inside this portal? Click the ✕ through
//    a real Playwright click on the element's center, after removing any
//    pointer-events overlays? First: does the NATIVE click reach React?
const fired = await page.evaluate(() => new Promise((res) => {
  const btn = document.querySelector('[data-testid="saved-close"]');
  const orig = btn.onclick; // React uses root delegation, onclick is null — expected
  // Spy via capture listener on the portal container (document.body):
  document.body.addEventListener('click', () => res('body-clicked'), true);
  btn.click(); // sync native click
  setTimeout(() => res('no-body-click'), 500);
}));
console.log('native btn.click():', fired);
await page.waitForTimeout(1500);
console.log('overlay after native click:', await page.locator('[data-testid="saved-overlay"]').count());

// 2) Invoke the React props onClick straight from the fiber.
const invoked = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="saved-close"]');
  const key = Object.keys(btn).find(k => k.startsWith('__reactFiber$'));
  if (!key) return 'no-fiber';
  let f = btn[key];
  let hops = 0;
  while (f && hops++ < 30) {
    if (f.memoizedProps && typeof f.memoizedProps.onClick === 'function') {
      f.memoizedProps.onClick();
      return 'invoked-onclick hop=' + hops;
    }
    f = f.return;
  }
  return 'no-onclick-found hops=' + hops;
});
console.log('fiber invoke:', invoked);
await page.waitForTimeout(1500);
console.log('overlay after fiber invoke:', await page.locator('[data-testid="saved-overlay"]').count());

// 3) Does the SettingsOverlay close via its ✕ (same portal pattern)?
await page.keyboard.press('Escape').catch(() => {});
await browser.close();
server.kill();
