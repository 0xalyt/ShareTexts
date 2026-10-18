// One-off design probe: two pages, autoConnect seeded, screenshot the
// AirDrop-style radar overlay in light + dark once it pops. Not shipped.
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3010';
const b = await chromium.launch();
const shots = [];

const ctxA = await b.newContext({ viewport: { width: 1280, height: 850 } });
const A = await ctxA.newPage();
await ctxA.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
A.on('pageerror', (e) => console.log('[A] PAGEERROR', String(e).slice(0, 200)));
await A.goto(URL, { waitUntil: 'domcontentloaded' });

const ctxB = await b.newContext({ viewport: { width: 1280, height: 850 } });
const B = await ctxB.newPage();
await ctxB.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
await B.goto(URL, { waitUntil: 'domcontentloaded' });

// Wait for the overlay on A (mutual detection).
const seen = await A.getByTestId('nearby-detect-overlay').waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
console.log('overlay on A:', seen);
if (seen) {
  await A.waitForTimeout(900); // let entrance springs settle
  await A.screenshot({ path: '.audit-shots/radar-light.png' });
  shots.push('.audit-shots/radar-light.png');

  // Arm the two-step confirm and shoot the armed state.
  const primary = A.getByTestId('nearby-detect-primary');
  const before = (await primary.innerText()).trim();
  await primary.click();
  await A.waitForTimeout(450);
  const after = (await primary.innerText()).trim();
  console.log('two-step label:', JSON.stringify(before), '->', JSON.stringify(after));
  await A.screenshot({ path: '.audit-shots/radar-light-armed.png' });
  shots.push('.audit-shots/radar-light-armed.png');

  // Incoming mode on B?
  const onB = await B.getByTestId('nearby-detect-overlay').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  console.log('overlay on B:', onB);
  if (onB) {
    await B.waitForTimeout(700);
    await B.screenshot({ path: '.audit-shots/radar-incoming.png' });
    shots.push('.audit-shots/radar-incoming.png');
    const bText = await B.getByRole('dialog').innerText();
    console.log('B dialog text (pre-commit):', JSON.stringify(bText.replace(/\n+/g, ' | ').slice(0, 300)));
  }

  // COMMIT (second press) → A's invite crosses → B flips to its incoming
  // form; screenshot that true state — the single-step "Yes" card.
  await primary.click(); // commit: "Yes"
  const bIncoming = await B.getByText(/wants to connect/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  console.log('B flipped to incoming:', bIncoming);
  if (bIncoming) {
    await B.waitForTimeout(700);
    await B.screenshot({ path: '.audit-shots/radar-incoming.png' });
    const bText2 = await B.getByRole('dialog').innerText();
    console.log('B incoming text:', JSON.stringify(bText2.replace(/\n+/g, ' | ').slice(0, 300)));
  }
} else {
  // No live peer — force the overlay through React state is not exposed;
  // screenshot the landing's nearby section anyway.
  await A.screenshot({ path: '.audit-shots/landing-nearby.png' });
  shots.push('.audit-shots/landing-nearby.png');
}

// Dark mode shot of whatever is up.
await ctxA.addInitScript(() => localStorage.setItem('sharetext.theme', 'dark'));
await A.evaluate(() => document.documentElement.classList.add('dark'));
await A.waitForTimeout(400);
await A.screenshot({ path: '.audit-shots/radar-dark.png' });
shots.push('.audit-shots/radar-dark.png');

console.log('shots:', shots.join(', '));

// MOBILE — the card docks at the bottom (thumb reach) and the radar sits
// in the upper third. Fresh pair so detection happens again naturally.
const mCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
const M = await mCtx.newPage();
await mCtx.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
await M.goto(URL, { waitUntil: 'domcontentloaded' });
const mCtx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const M2 = await mCtx2.newPage();
await mCtx2.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
await M2.goto(URL, { waitUntil: 'domcontentloaded' });
const mSeen = await M.getByTestId('nearby-detect-overlay').waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
console.log('mobile overlay:', mSeen);
if (mSeen) {
  await M.waitForTimeout(900);
  await M.screenshot({ path: '.audit-shots/radar-mobile.png' });
  console.log('shots: .audit-shots/radar-mobile.png');
}
await b.close();
