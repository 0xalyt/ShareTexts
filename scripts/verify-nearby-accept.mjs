import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './lib.mjs';

const base = process.env.BASE_URL || 'http://localhost:3311';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await launchBrowser();
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const run = randomUUID().slice(0, 8);
    const contexts = [];
    const pages = [];
    const joins = [0, 0];
    const errors = [];
    try {
      for (let index = 0; index < 2; index++) {
        const context = await browser.newContext({ reducedMotion });
        contexts.push(context);
        await context.route(/workers\.dev/, route => route.abort());
        await context.routeWebSocket(/workers\.dev/, route => route.close());
        await context.addInitScript(({ index, run }) => {
          if (location.protocol !== 'http:') return;
          localStorage.setItem('sharetext.deviceName', `Accept ${index === 0 ? 'A' : 'B'} ${run}`);
          sessionStorage.setItem('sharetext.presenceVisibleUntil.v1', String(Date.now() + 600_000));
        }, { index, run });
        const page = await context.newPage();
        pages.push(page);
        page.on('pageerror', e => errors.push(e.message));
        page.on('websocket', ws => {
          assert(['localhost', '127.0.0.1'].includes(new URL(ws.url()).hostname));
          ws.on('framesent', ({ payload }) => {
            try { if (JSON.parse(payload).event === 'join_with_link') joins[index]++; } catch {}
          });
        });
        await page.goto(base);
        await page.getByTestId('home-nearby').click();
      }
      const [a, b] = pages;
      const row = a.getByTestId('nearby-device-row').filter({ hasText: `Accept B ${run}` });
      await row.waitFor({ state: 'visible' });
      assert.deepEqual(joins, [0, 0], 'discovery without acceptance must not join');
      await row.evaluate(el => el.click());
      await b.getByTestId('nearby-detect-decline').click();
      await a.getByTestId('nearby-failure-card').waitFor({ state: 'visible' });
      assert.deepEqual(joins, [0, 0], 'declining must not join');
      await a.getByTestId('nearby-failure-card').waitFor({ state: 'hidden', timeout: 15_000 });
      await row.evaluate(el => el.click());
      await b.getByTestId('nearby-detect-primary').click();
      for (const page of pages) {
        await page.getByTestId('nearby-sheet').waitFor({ state: 'hidden', timeout: 25_000 });
        const composer = page.getByTestId('composer').first();
        await composer.waitFor({ state: 'visible', timeout: 25_000 });
        assert.equal(await composer.evaluate(el => el.closest('[inert]') === null), true, 'accepted room composer must be released by discovery');
      }
      for (const [from, to, text] of [[a, b, 'Nearby A to B'], [b, a, 'Nearby B to A']]) {
        await from.getByTestId('composer').first().fill(text);
        await from.getByRole('button', { name: 'Send', exact: true }).click();
        await to.locator('[class~="group/msg"]').getByText(text, { exact: true }).waitFor({ timeout: 20_000 });
      }
      await delay(1500);
      console.log(`Nearby accept ${browser.browserType().name()} ${reducedMotion}: joins=${JSON.stringify(joins)}, two-way text delivered`);
      // The handoff must leave the next sheet's keyboard path usable too.
      await a.locator('[data-testid="open-settings"]:visible').first().click();
      await a.getByTestId('settings-language-row').click();
      await a.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'settings-language-back', null, { timeout: 5000 });
      await a.getByTestId('settings-language-back').click();
      await a.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'settings-language-row', null, { timeout: 5000 });
      await a.getByTestId('settings-language-row').click();
      await a.getByTestId('language-en').click();
      await a.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'settings-language-row', null, { timeout: 5000 });
      await a.keyboard.press('Escape');
      await a.getByTestId('settings-overlay').waitFor({ state: 'hidden' });

      assert.equal(joins[0], 1, 'one inviter join per acceptance');
      assert.equal(joins[1], 0, 'invitee creates rather than joins the room');
      assert.deepEqual(errors, []);
      console.log(`PASS Nearby accept ${browser.browserType().name()} ${reducedMotion}: decline never joins; composers usable, two-way delivery, one inviter join; Settings Language focus in/back/select`);
    } finally {
      console.log(`Nearby join counts: ${JSON.stringify(joins)}`);
      await Promise.all(contexts.map(context => context.close()));
    }
  }
} finally {
  await browser.close();
}
