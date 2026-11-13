/**
 * Auto-connect E2E (REAL server + two real browsers) — the MUTUAL CONFIRMED
 * flow. Auto-connect ON means: never connect silently — confirm on both.
 *  1. Both pages enable auto-connect (localStorage) BEFORE app scripts run.
 *  2. Both announce; each lands in the presence pool.
 *  3. Each side pops the detection overlay ("a nearby device detected").
 *  4. A arms ("Connect with this device?") then commits ("Yes") → an invite
 *     is sent; B's overlay shows "{name} wants to connect" → B taps "Yes".
 *  5. Both land in chat; text A→B works over the existing engine.
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  // Pre-seed auto-connect before any app script reads it.
  await ctx.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
  return page;
};
const A = await mkPage();
const B = await mkPage();
let errors = 0;
const fails = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails.push(name); };
for (const p of [A, B]) p.on('pageerror', () => errors++);

await A.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await B.goto('http://localhost:3010', { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(2500);

// 1. Detection is an INLINE suggestion, not a modal. The device that
//    discovers a peer gets a strip above its own row ("Device found" +
//    Connect); the modal is reserved for the INVITATION, because that is the
//    side that has a decision to make and no row to point at. This suite
//    asserted the old mutual-modal design and went red the day the strip
//    shipped — the app was fine, the test was describing a screen that no
//    longer exists.
const suggestOnA = await A.getByTestId('nearby-suggest').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
check('device found strip on A', suggestOnA);

// 2. The strip's button is a single Accept: pressing it sends the invitation
//    straight away. The confirmation step lives on the RECEIVING side (the
//    modal), which is where a decision is actually being made.
if (suggestOnA) {
  await A.getByTestId('nearby-suggest-connect').click();
}

// 3. A's commit sends the invite → B gets the modal → B confirms.
const inviteArrived = await B.getByRole('dialog').getByText(/wants to connect/i)
  .waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
check('B overlay shows incoming invite', inviteArrived);
await B.getByTestId('nearby-detect-primary').click().catch(() => {});
await A.waitForTimeout(500);

// 4. Zero-extra-tap fallback: either the confirmations above completed the
//    pairing, or (timing skew) trusted re-invites connect on their own.
await A.locator('textarea').first().waitFor({ timeout: 20000 }).catch(() => {});
await B.locator('textarea').first().waitFor({ timeout: 20000 }).catch(() => {});
const aChat = (await A.locator('textarea').count()) > 0;
const bChat = (await B.locator('textarea').count()) > 0;
check('A in chat', aChat);
check('B in chat', bChat);

// 5. Text A → B over the existing transfer engine.
if (aChat && bChat) {
  await A.locator('textarea').first().fill('auto-connect hello');
  await A.locator('textarea').first().press('Enter');
  await A.waitForTimeout(2500);
  check('A→B text arrived', (await B.locator('body').innerText()).includes('auto-connect hello'));
}
check('no page errors', errors === 0);
await browser.close();
process.exit(fails.length === 0 && errors === 0 ? 0 : 1);
