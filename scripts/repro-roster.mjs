import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const a = await browser.newContext();
  const b = await browser.newContext();
  await b.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.setInterval = (callback, ms, ...args) => {
      if (ms === 90000) window.reseatHeartbeat = () => callback(...args);
      return interval(callback, ms, ...args);
    };
  });
  const A = await a.newPage();
  const B = await b.newPage();
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  await B.getByTestId('composer').first().waitFor();
  await A.getByTestId('composer').first().waitFor();
  const check = async label => {
    await A.waitForTimeout(1000);
    const count = await A.getByText(/^\d+ devices$/).first().innerText();
    console.log(`${label}: ${count}`);
    assert.match(count, /^2\b/);
  };
  await check('initial');
  for (let i = 1; i <= 2; i++) {
    await B.goto(`${URL}/missing-roster-repro`);
    await B.getByRole('button', { name: /go home/i }).click();
    await B.getByTestId('composer').first().waitFor();
    await check(`404 return ${i}`);
  }
  await B.evaluate(() => {
    if (!window.reseatHeartbeat) throw new Error('heartbeat not installed');
    window.reseatHeartbeat();
  });
  await check('reseat heartbeat');
  console.log('PASS: roster remains two devices');
} finally {
  await browser.close();
}
