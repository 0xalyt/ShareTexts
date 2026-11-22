/** Film source capture, never production traffic. Run local Worker + app. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.FILM_UI_BASE_URL || 'http://localhost:3044';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Film capture must use the local app/Worker');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const theme of ['light', 'dark']) {
    const out = path.resolve(`film/out/reference-pairing-${theme}`);
    mkdirSync(out, { recursive: true });
    const clients = [];
    for (const name of ['My phone', 'My laptop']) {
      const context = await browser.newContext({ viewport: { width: 510, height: 630 }, deviceScaleFactor: 2, colorScheme: theme });
      await context.route('**/sharetext-signaling.alighttt.workers.dev/**', route => route.abort());
      await context.addInitScript(({ theme, name }) => {
        localStorage.setItem('sharetext.theme', theme);
        localStorage.setItem('sharetext.locale', 'en');
        localStorage.setItem('sharetext.deviceName', name);
      }, { theme, name });
      const page = await context.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      clients.push({ context, page });
    }
    const [source, receiver] = clients.map(c => c.page);
    await source.getByTestId('home-send').click();
    const group = source.getByRole('group', { name: 'Pairing code' });
    await group.waitFor();
    const code = (await group.innerText()).replace(/\D/g, '');
    await receiver.getByTestId('home-receive').click();
    await receiver.getByTestId('join-code-input').waitFor();
    await source.waitForTimeout(600);
    await source.screenshot({ path: path.join(out, 'send.jpg'), type: 'jpeg', quality: 97 });
    await receiver.screenshot({ path: path.join(out, 'receive.jpg'), type: 'jpeg', quality: 97 });
    // Five real digits hold long enough for the viewer to follow; the sixth
    // triggers the app's normal join immediately, as it does in the product.
    await receiver.getByTestId('join-code-input').locator('input').first().fill(code.slice(0, 5));
    await receiver.screenshot({ path: path.join(out, 'filled.jpg'), type: 'jpeg', quality: 97 });
    await receiver.getByTestId('join-code-input').locator('input').first().fill(code);
    await Promise.all(clients.map(({ page }) => page.getByTestId('composer').waitFor()));
    await source.waitForTimeout(450);
    await source.screenshot({ path: path.join(out, 'connected-send.jpg'), type: 'jpeg', quality: 97 });
    await receiver.screenshot({ path: path.join(out, 'connected-receive.jpg'), type: 'jpeg', quality: 97 });
    writeFileSync(path.join(out, 'pairing.json'), JSON.stringify({ code, theme, local: true, paired: true }));
    await Promise.all(clients.map(({ context }) => context.close()));
    console.log(`Captured native ${theme} pairing panels`);
  }
} finally { await browser.close(); }
