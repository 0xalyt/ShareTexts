#!/usr/bin/env node
/** Nested overlay keyboard regression. No room, Worker, or network mocks. */
import assert from 'node:assert/strict';
import { launchBrowser, resolveEngine } from './lib.mjs';

const browser = await launchBrowser();
try {
  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'en-US' });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.BASE_URL || process.env.URL || 'http://localhost:3010', { waitUntil: 'domcontentloaded' });
      const more = page.getByTestId('more-sheet');
      const language = page.getByTestId('language-sheet');
      const trigger = page.getByTestId('more-language').getByRole('button');
      const focusInside = id => page.waitForFunction(testId => {
        return document.querySelector(`[data-testid="${testId}"]`)?.contains(document.activeElement);
      }, id, { timeout: 5000 });
      const focused = locator => locator.evaluate(element => element === document.activeElement);

      await page.getByTestId('header-more').click();
      await focusInside('more-sheet');
      await trigger.click();
      await focusInside('language-sheet');

      // The parent must yield, even if something explicitly focuses its control.
      await trigger.focus();
      await focusInside('language-sheet');
      const buttons = language.getByRole('button');
      await buttons.first().focus();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await focused(buttons.last()), 'Shift+Tab wraps inside the child');
      await page.keyboard.press('Tab');
      assert.ok(await focused(buttons.first()), 'Tab wraps inside the child');

      await page.keyboard.press('Escape');
      await language.waitFor({ state: 'detached' });
      assert.ok(await more.isVisible(), 'first Escape leaves the parent open');
      await page.waitForFunction(() => document.querySelector('[data-testid="more-language"] button') === document.activeElement);
      await page.getByTestId('header-more').focus();
      await focusInside('more-sheet');

      // Escape must work before the delayed initial focus as well.
      await trigger.click();
      await page.keyboard.press('Escape');
      await language.waitFor({ state: 'detached' });
      assert.ok(await more.isVisible(), 'immediate Escape closes only the child');

      // A locale update rerenders both overlays and changes their callbacks.
      for (const locale of ['es', 'en', 'ja']) {
        await trigger.click();
        await focusInside('language-sheet');
        await language.locator(`button[lang="${locale}"]`).click();
        await language.waitFor({ state: 'detached' });
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
        assert.ok(await more.isVisible(), 'selecting a language keeps More open');
        await page.waitForFunction(() => document.querySelector('[data-testid="more-language"] button') === document.activeElement);
      }

      await page.keyboard.press('Escape');
      await more.waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.querySelector('[data-testid="header-more"]') === document.activeElement);
      assert.deepEqual(errors, [], 'opening and choosing languages must not throw');
      console.log(`PASS ${resolveEngine().name} ${width}px: nested focus, Tab, locale selection, one-layer Escape and focus return`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
