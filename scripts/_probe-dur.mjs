// Probe: measure CommandBar backdrop opacity over time (landing only, no room).
// Hypothesis: `transition={{ duration: DUR.micro }}` passes MILLIseconds into
// motion/react's SECONDS field → a 120-second fade → backdrop nearly invisible
// and never unmounting. SettingsOverlay uses literal 0.18 (seconds) instead.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolveChrome, sleep } from './lib.mjs';

const PORT = 3594;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 120; i++) { try { await fetch(URL); break; } catch { await sleep(250); } }

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.getByTestId('open-saved').first().waitFor({ timeout: 20000 });

// Open the CommandBar via its header chip.
await page.locator('[data-testid="command-bar-chip"], button:has-text("Command")').first().click().catch(async () => {
  await page.keyboard.press('Control+k');
});
await page.waitForTimeout(300);
for (let i = 1; i <= 8; i++) {
  const op = await page.evaluate(() => {
    const bd = document.querySelector('[role="dialog"][aria-label]');
    if (!bd) return null;
    return getComputedStyle(bd).opacity;
  });
  console.log(`t=${(i * 0.25).toFixed(2)}s commandbar backdrop opacity:`, op);
  if (op && parseFloat(op) > 0.95) { console.log('→ reached full opacity'); break; }
  await sleep(250);
}
await browser.close();
server.kill();
