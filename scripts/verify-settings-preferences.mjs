#!/usr/bin/env node
/** Preferences must survive switching between the real mobile/desktop Settings. */
import assert from 'node:assert/strict';
import { launchBrowser, readLiveCode, URL } from './lib.mjs';

const browser = await launchBrowser();
try {
  const owner = await browser.newContext({ viewport: { width: 320, height: 844 }, locale: 'en-US' });
  const peer = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const a = await owner.newPage();
  const b = await peer.newPage();
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  await a.goto(URL, { waitUntil: 'domcontentloaded' });
  await a.getByTestId('home-send').click();
  await a.getByTestId('pairing-code').waitFor();
  const code = await readLiveCode(a);
  await b.goto(URL, { waitUntil: 'domcontentloaded' });
  await b.getByTestId('home-receive').click();
  await b.getByTestId('join-code-input').click();
  await b.keyboard.type(code, { delay: 30 });
  await a.locator('textarea').first().waitFor({ timeout: 25000 });
  await b.locator('textarea').first().waitFor({ timeout: 25000 });

  const prefs = [
    ['settings-haptics', false],
    ['settings-typing', false],
    ['settings-no-glass', true],
    ['settings-auto-connect', true],
    ['settings-nearby-visible', true],
  ];
  const open = async () => {
    await a.locator('[data-testid="open-settings"]:visible').first().click();
    await a.getByTestId('settings-overlay').waitFor();
  };
  const close = async () => {
    await a.keyboard.press('Escape');
    await a.getByTestId('settings-overlay').waitFor({ state: 'detached' });
  };
  await open();
  for (const [id, on] of prefs) {
    const control = a.getByTestId(id);
    if (await control.getAttribute('aria-checked') !== String(on)) await control.click();
    assert.equal(await control.getAttribute('aria-checked'), String(on), `mobile sets ${id}`);
  }
  await close();

  // Both layouts were mounted before these preferences changed. Neither may
  // display stale defaults or overwrite the preference on the next click.
  for (const width of [1440, 390]) {
    await a.setViewportSize({ width, height: 900 });
    await open();
    for (const [id, on] of prefs) {
      assert.equal(await a.getByTestId(id).getAttribute('aria-checked'), String(on), `${width}px restores ${id}`);
      await a.getByTestId(id).click();
    }
    for (const pref of prefs) pref[1] = !pref[1];
    await close();
  }
  assert.deepEqual(errors, [], 'responsive preference changes do not throw');
  console.log('PASS five Settings preferences survive mobile → desktop → mobile changes');
} finally {
  await browser.close();
}
