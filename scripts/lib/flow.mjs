// scripts/lib/flow.mjs — the verified two-device room flow, shared by
// capture-baseline.mjs, smoke-live.mjs and future suites.
//
// The flow (verified per the P0 brief and by existing suites):
//   A: open BASE → click [data-testid="home-send"] → wait for
//      [data-testid="pairing-code"] → read its 6 digits.
//   B: open BASE → click [data-testid="home-receive"] → focus the first of
//      the 6 <input> elements → type the digits → wait for
//      [data-testid="room-panel"] or [data-testid="send"].
//   A: type in the composer textarea → click [data-testid="send"].
//
// Reuses scripts/lib.mjs (readLiveCode/waitForChat/launchBrowser) — those
// carry the animation-settling logic the code reader needs.
import { readLiveCode, waitForChat, sleep } from '../lib.mjs';

export const IDS = {
  homeSend: 'home-send',
  homeReceive: 'home-receive',
  pairingCode: 'pairing-code',
  roomPanel: 'room-panel',
  send: 'send',
  composer: 'composer',
  joinInput: 'join-code-input',
};

/** A: create a room; resolves { code }. Throws if no stable code in 30s. */
export async function createRoom(page, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-testid="${IDS.homeSend}"]`, { timeout: 20000 });
  if ((await page.getByTestId(IDS.pairingCode).count()) === 0) {
    await page.getByTestId(IDS.homeSend).click();
  }
  await page.getByTestId(IDS.pairingCode).waitFor({ timeout: 20000 });
  const code = await readLiveCode(page);
  return { code };
}

/** B: join A's room by typing the 6 digits into the receive input. */
export async function joinRoom(page, base, code) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-testid="${IDS.homeReceive}"]`, { timeout: 20000 });
  await page.getByTestId(IDS.homeReceive).click();
  // The 6-cell input: focus the first <input> and type. Auto-submit on 6th.
  const inputs = page.locator('input[inputmode="numeric"], input[type="tel"], input');
  await inputs.first().waitFor({ timeout: 10000 });
  await inputs.first().click();
  await page.keyboard.type(code, { delay: 60 });
  // Either marker means the join took.
  await page.waitForSelector(
    `[data-testid="${IDS.roomPanel}"], [data-testid="${IDS.send}"]`,
    { timeout: 30000 }
  );
  return true;
}

/** A: send a text message from the composer. */
export async function sendMessage(page, text) {
  await page.getByTestId(IDS.composer).first().waitFor({ timeout: 20000 });
  await page.getByTestId(IDS.composer).first().fill(text);
  await page.getByTestId(IDS.send).first().click();
}

/** Full pair: returns { code, msToPairing, msToConnected }. */
export async function pairDevices(pageA, pageB, base) {
  const t0 = Date.now();
  const { code } = await createRoom(pageA, base);
  const msToPairing = Date.now() - t0;
  const t1 = Date.now();
  await joinRoom(pageB, base, code);
  await waitForChat(pageA, 'A');
  await waitForChat(pageB, 'B');
  const msToConnected = Date.now() - t1;
  return { code, msToPairing, msToConnected };
}

/**
 * Wait until `text` appears in page's body, polling. Returns ms waited or
 * null on timeout. Used for the 15s arrival check in smoke-live.
 */
export async function waitForText(page, text, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const hit = await page.evaluate((t) => document.body.textContent.includes(t), text)
      .catch(() => false);
    if (hit) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

/**
 * Collect console errors/warnings from a page. `sink` is an array to push
 * into, or a function to call with each line (capture-baseline passes its
 * label-aware logger). Accepting both avoids a push-on-function crash that
 * only fires once a page actually logs something.
 */
export function watchConsole(page, sink, label = '') {
  const emit = typeof sink === 'function' ? sink : (line) => sink.push(line);
  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error' || type === 'warning') {
      emit(`[${label}] ${type}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => emit(`[${label}] pageerror: ${e.message}`));
}
