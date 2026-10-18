// F13 Phase J visual QA: screenshots of 2-device and 8-device rooms across
// desktop/mobile viewports and light/dark themes. Output goes to
// docs/audits/shots-f13-multidevice/ (untracked by convention).
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/audits/shots-f13-multidevice';
mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await launchBrowser();
  const logs = [];

  // --- Room 1: 2 devices (A creator, B joiner) ---------------------------
  const ctxA = await browser.newContext({ viewport: DESKTOP });
  const A = await ctxA.newPage();
  A.on('pageerror', (e) => logs.push(`[A] ${e.message}`));
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);

  // The joiner runs on a PHONE — the common real-world pairing (desktop
  // sender, phone receiver). Mobile viewport from context creation (a
  // post-hoc setViewportSize did not reflow the already-mounted room).
  const ctxB = await browser.newContext({ viewport: MOBILE });
  const B = await ctxB.newPage();
  B.on('pageerror', (e) => logs.push(`[B] ${e.message}`));
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(1500);

  // A light desktop 2-device room.
  await A.screenshot({ path: `${OUT}/2d-desktop-light.png` });
  // A dark desktop.
  await A.evaluate(() => document.documentElement.classList.add('dark'));
  await sleep(400);
  await A.screenshot({ path: `${OUT}/2d-desktop-dark.png` });
  await A.evaluate(() => document.documentElement.classList.remove('dark'));

  // Mobile view of B (joiner) light + dark.
  await sleep(800);
  await B.screenshot({ path: `${OUT}/2d-mobile-light.png` });
  await B.evaluate(() => document.documentElement.classList.add('dark'));
  await sleep(400);
  await B.screenshot({ path: `${OUT}/2d-mobile-dark.png` });

  // --- Room 2: 8 devices in one room (the scaling claim) -----------------
  // C is on a mobile viewport to exercise the picker's touch layout.
  const ctxC = await browser.newContext({ viewport: MOBILE });
  const C = await ctxC.newPage();
  C.on('pageerror', (e) => logs.push(`[C] ${e.message}`));
  await C.goto(URL, { waitUntil: 'networkidle' });
  await C.getByRole('button', { name: 'Receive' }).first().click();
  const { TOTP } = await import('otpauth');
  const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
  const { secret, createdAt } = JSON.parse(stored);
  const totp = new TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret });
  const freshCode = totp.generate({ timestamp: Date.now() - (createdAt || 0) });
  await C.locator('input[inputmode="numeric"]').fill(freshCode);
  await waitForChat(C, 'C');
  await sleep(2000);

  // D–H: five more desktop joiners, same fresh-code flow.
  for (let i = 4; i <= 8; i++) {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const P = await ctx.newPage();
    P.on('pageerror', (e) => logs.push(`[P${i}] ${e.message}`));
    await P.goto(URL, { waitUntil: 'networkidle' });
    await P.getByRole('button', { name: 'Receive' }).first().click();
    const st = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
    const s2 = JSON.parse(st);
    const c2 = totp.generate({ timestamp: Date.now() - (s2.createdAt || 0) });
    await P.locator('input[inputmode="numeric"]').fill(c2);
    await waitForChat(P, `P${i}`);
    await sleep(400);
  }
  await sleep(2500);

  // A now sees a room of 8. Header should read "8 devices".
  const roomBody = await bodyText(A);
  console.log('A header says 8 devices:', /8 devices/i.test(roomBody));
  // Device picker open (desktop light).
  await A.getByTestId('recipient-row').getByRole('button').first().click();
  await sleep(500);
  const opts = await A.getByRole('option').count();
  console.log('A picker rows:', opts);
  await A.screenshot({ path: `${OUT}/8d-desktop-light-picker.png` });
  await A.getByRole('button', { name: 'Close' }).click().catch(async () => {
    await A.getByTestId('recipient-row').getByRole('button').first().click();
  });
  await sleep(300);
  await A.screenshot({ path: `${OUT}/8d-desktop-light.png` });
  await A.evaluate(() => document.documentElement.classList.add('dark'));
  await sleep(400);
  await A.screenshot({ path: `${OUT}/8d-desktop-dark.png` });
  // Mobile picker (C) — light and dark.
  await C.getByTestId('recipient-row').getByRole('button').first().click();
  await sleep(500);
  await C.screenshot({ path: `${OUT}/8d-mobile-light-picker.png` });
  await C.evaluate(() => document.documentElement.classList.add('dark'));
  await sleep(400);
  await C.screenshot({ path: `${OUT}/8d-mobile-dark-picker.png` });

  // Recipient strip after a fan-out send to the whole room.
  await A.locator('textarea').first().fill('Phase J visual: fan-out to the whole room');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(6000);
  await A.screenshot({ path: `${OUT}/8d-desktop-light-fanout.png` });

  console.log('page errors:', logs.length ? logs.join(' | ') : '(none)');
  await browser.close();
  console.log(`shots written to ${OUT}/`);
}

main().catch((e) => { console.error('SHOTS FAILED', e); process.exit(1); });
