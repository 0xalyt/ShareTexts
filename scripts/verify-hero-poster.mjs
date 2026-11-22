/** Visual continuity while real movie bytes are delayed; also runs in handoff CI. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { launchBrowser, gotoPage, resolveEngine } from './lib.mjs';

export async function verifyHeroPoster(browser, base) {
  mkdirSync('audit/tmp', { recursive: true });
  for (const [width, theme] of [[390, 'dark'], [1440, 'light']]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 }, colorScheme: theme,
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    await context.addInitScript(value => localStorage.setItem('sharetext.theme', value), theme);
    let release;
    const movieBytes = new Promise(resolve => { release = resolve; });
    // Delay delivery, not the media API: play() must really be pending at
    // HAVE_NOTHING. Continuing the request later uses the actual encoded film.
    await context.route('**/film/*.mp4', async route => {
      await movieBytes;
      await route.continue().catch(() => {}); // context may close after a failed assertion
    });
    try {
      const page = await context.newPage();
      await gotoPage(page, base, { waitUntil: 'domcontentloaded' });
      const picture = page.locator('.hero-film-picture');
      await picture.scrollIntoViewIfNeeded();
      await page.evaluate(async () => {
        await document.fonts.ready;
        const poster = new Image();
        poster.src = document.querySelector('.hero-film-picture video').poster;
        await poster.decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const prefix = `audit/tmp/hero-poster-${resolveEngine().name}-${width}-${theme}`;
      const before = PNG.sync.read(await picture.screenshot({ path: `${prefix}-before.png` }));
      const requested = page.waitForRequest(request => /\/film\/[^/]+\.mp4$/.test(request.url()));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await requested;
      await page.waitForFunction(() => {
        const video = document.querySelector('.hero-film-picture video');
        return !video.paused && video.readyState === 0;
      });
      const pending = PNG.sync.read(await picture.screenshot({ path: `${prefix}-pending.png` }));
      assert.equal(pending.width, before.width);
      assert.equal(pending.height, before.height);
      let difference = 0;
      for (let i = 0; i < before.data.length; i += 4) {
        for (let c = 0; c < 3; c++) difference += Math.abs(before.data[i + c] - pending.data[i + c]);
      }
      // Native posters and CSS artwork resample edges differently. Allow a
      // small mean RGB error (8/255), not the uniform field the bug produced.
      const meanError = difference / (before.width * before.height * 3);
      assert.ok(meanError < 8, `${width}/${theme}: pending playback lost the poster (mean RGB error ${meanError.toFixed(1)}/255)`);
      release();
      await page.waitForFunction(() => document.querySelector('.hero-film-picture video').currentTime > .2);
      console.log(`PASS ${width}/${theme}: real poster stays visible until movie data arrives`);
    } finally {
      release();
      await context.close();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await launchBrowser();
  try { await verifyHeroPoster(browser, process.env.BASE_URL || 'http://localhost:3010'); }
  finally { await browser.close(); }
}
