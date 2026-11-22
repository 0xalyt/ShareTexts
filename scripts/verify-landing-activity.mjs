import assert from 'node:assert/strict';

/** The landing must reuse the endpoint probe, never add counter traffic. */
export async function verifyLandingActivity(browser, base) {
  for (const [name, value, visible] of [
    ['total', 12345678, true], ['zero', 0, true],
    ['negative', -4, false], ['fractional', 2.5, false],
    ['missing', undefined, false], ['invalid', '123', false],
    ['unavailable', null, false],
  ]) {
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      // Stub the probe even if the local backend is unavailable. Nothing in
      // this test is allowed to reach a production service.
      await context.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        return ['localhost', '127.0.0.1', '[::1]'].includes(host) ? route.continue() : route.abort();
      });
      let requests = 0;
      await context.route('**/stats', route => {
        requests++;
        return route.fulfill({
          status: name === 'unavailable' ? 503 : 200,
          json: { users: 0, roomsCreated: value },
          headers: { 'access-control-allow-origin': '*' },
        });
      });
      await context.addInitScript(() => localStorage.setItem('sharetext.locale', 'en'));
      const page = await context.newPage();
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('home-send').waitFor();
      const activity = page.getByTestId('landing-activity');
      if (visible) {
        await activity.waitFor();
        assert.equal(await activity.locator('strong').innerText(), new Intl.NumberFormat('en').format(value));
        assert.match(await activity.innerText(), /rooms created/);
        assert.equal(requests, 1, 'the total reuses the single boot probe');
      } else {
        // Invalid/missing probes can trigger the transport's existing retry.
        // Allow it to settle before observing that no placeholder is shown.
        await page.waitForTimeout(200);
        assert.equal(await activity.count(), 0, `${name}: no invented total`);
      }
      if (name === 'total') {
        await page.setViewportSize({ width: 320, height: 800 });
        await activity.waitFor();
        await page.setViewportSize({ width: 1440, height: 900 });
        await activity.waitFor();
        await page.clock.install();
        await page.clock.fastForward(65_000);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        assert.equal(requests, 1, 'no resize, timer or visibility polling');
        assert.equal(await activity.locator('strong').innerText(), '12,345,678', 'remount keeps the server snapshot');
      }
      console.log(`PASS room activity: ${name}`);
    } finally {
      await context.close();
    }
  }
}
