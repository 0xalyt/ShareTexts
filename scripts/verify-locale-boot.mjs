/** Reviewed-language launch gate: legacy saved choices and the device's
 * language must not expose draft translations or fetch their chunks. */
import assert from 'node:assert/strict';
import { launchBrowser, URL } from './lib.mjs';
const args = process.argv.slice(2);
const index = args.indexOf('--base');
const base = index >= 0 ? args[index + 1] : process.env.BASE_URL || URL;
const browser = await launchBrowser();
try {
  for (const code of ['ar', 'hi', 'es', 'pt', 'zh', 'zh-HK']) {
    for (const saved of [false, true]) {
      const context = await browser.newContext({ locale: code, viewport: { width: 390, height: 844 } });
      try {
        if (saved) await context.addInitScript(code => localStorage.setItem('sharetext.locale', code), code);
        const page = await context.newPage();
        const chunks = [];
        page.on('request', request => { if (/\/(ar|hi|es|pt-BR|pt-PT|zh-Hans|zh-Hant)-[^/]+\.js/.test(request.url())) chunks.push(request.url()); });
        await page.goto(base);
        await page.getByTestId('home-send').waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'), 'en', `${code}: English launch`);
        assert.equal(await page.locator('html').getAttribute('dir'), 'ltr', `${code}: direction matches English`);
        assert.deepEqual(chunks, [], `${code}: draft dictionaries are not downloaded`);
        console.log(`PASS ${code}/${saved ? 'saved' : 'device'}: reviewed English, no draft chunk`);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
