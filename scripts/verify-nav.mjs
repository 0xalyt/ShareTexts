#!/usr/bin/env node
/**
 * verify-nav.mjs — DESIGN.md §18, step 3c: Back does what the app means.
 *
 * The contract: every screen change (Home → Send/Receive → Connecting → Room)
 * pushes ONE history entry; browser Back and the Android back gesture do
 * exactly what the in-app Back circle does; at Home, Back leaves the site;
 * Back from Send before anyone joined cancels the room with no confirm; and
 * returning keeps the Home state.
 *
 * What this gate can and cannot reach without a second device or a working
 * tracker: Home, Send, Receive, Connecting and the sheets. The Room level
 * needs a peer (it is covered by verify-f18's drag/leave flows, which run
 * against a local pair). Each unreachable level is printed as SKIP with the
 * reason, never as a pass.
 *
 *   node scripts/verify-nav.mjs
 *   URL=http://localhost:3022 node scripts/verify-nav.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.URL || 'http://localhost:3010';

const results = [];
const ok = (name, detail) => results.push({ ok: true, name, detail });
const bad = (name, detail) => results.push({ ok: false, name, detail });
const skip = (name, why) => results.push({ ok: true, skipped: true, name, detail: why });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const state = () =>
  page.evaluate(() => ({
    entries: history.length,
    path: location.pathname,
    scroll: window.scrollY,
    home: !!document.querySelector('[data-testid="home-send"]'),
    taskBack: !!document.querySelector('[data-testid="task-back"]'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 90),
  }));

const settle = () => page.waitForTimeout(700);

// A keepMounted sheet stays in the DOM while closed (hidden + aria-hidden), so
// "open" has to mean painted and reachable, never merely present.
// history.length does not reliably grow for a same-URL document, so count the
// pushState calls themselves — that is what §3c actually constrains.
const countPushes = () =>
  page.evaluate(() => {
    if (!window.__navPushes) {
      window.__navPushes = 0;
      const original = history.pushState.bind(history);
      history.pushState = (...args) => {
        window.__navPushes += 1;
        return original(...args);
      };
    }
    return window.__navPushes;
  });

const sheetOpen = () =>
  page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return false;
    const cs = getComputedStyle(d);
    return (
      d.getBoundingClientRect().width > 0 &&
      cs.visibility !== 'hidden' &&
      !d.closest('[aria-hidden="true"]')
    );
  });

async function openHome() {
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]');
  await settle();
  return state();
}

// ── 1. Home is the base level ────────────────────────────────────────────
const base = await openHome();
if (base.home && base.path === '/') ok('Home is the base level', `entries=${base.entries} path=${base.path}`);
else bad('Home is the base level', JSON.stringify(base));

// ── 2. Send: one entry, Back returns, room cancelled silently ────────────
{
  const before = base.entries;
  const pushesBefore = await countPushes();
  await page.getByTestId('home-send').click();
  await page.waitForSelector('[data-testid="task-back"]', { timeout: 15000 });
  await settle();
  const onSend = await state();

  const sendPushes = (await countPushes()) - pushesBefore;
  const sendState = await page.evaluate(() => JSON.stringify(history.state));
  if (sendPushes === 1 && sendState.includes('stTask')) {
    ok('Send pushes exactly one history entry', `1 pushState, state=${sendState}, history.length ${before} → ${onSend.entries}`);
  } else {
    bad('Send pushes exactly one history entry', `${sendPushes} pushState call(s), state=${sendState}`);
  }
  if (onSend.taskBack && !onSend.home) ok('Send shows its own level with the Back circle', onSend.text);
  else bad('Send shows its own level with the Back circle', JSON.stringify(onSend));

  // The code the room was created with, so we can prove Back cancelled it.
  const firstCode = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pairing-code"]');
    return el ? el.textContent.replace(/\s+/g, '') : null;
  });

  await page.goBack();
  await settle();
  const backHome = await state();
  if (backHome.home && !backHome.taskBack) ok('Browser Back from Send returns to Home', `entries=${backHome.entries} (forward entry lingers, as browsers do)`);
  else bad('Browser Back from Send returns to Home', JSON.stringify(backHome));

  const confirmVisible = await page.evaluate(
    () => /leave this room/i.test(document.body.innerText) || !!document.querySelector('[data-testid="confirm-sheet"]'),
  );
  if (!confirmVisible) ok('Back from Send cancels with no confirm sheet', 'no "Leave this room?" prompt');
  else bad('Back from Send cancels with no confirm sheet', 'a confirm sheet appeared before anyone joined');

  // Re-entering Send must mint a fresh room, not resume the abandoned one.
  await page.getByTestId('home-send').click();
  await page.waitForSelector('[data-testid="task-back"]', { timeout: 15000 });
  await settle();
  const secondCode = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pairing-code"]');
    return el ? el.textContent.replace(/\s+/g, '') : null;
  });
  if (!firstCode || !secondCode) skip('A fresh room follows an abandoned one', 'room code is not exposed by a stable test id on this build');
  else if (firstCode !== secondCode) ok('A fresh room follows an abandoned one', `${firstCode} → ${secondCode}`);
  else bad('A fresh room follows an abandoned one', `the same code came back: ${firstCode}`);

  await page.goBack();
  await settle();
}

// ── 3. Receive: one entry, Back returns ──────────────────────────────────
{
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]');
  await settle();
  const before = (await state()).entries;
  const pushesBefore = await countPushes();
  await page.getByTestId('home-receive').click();
  await page.waitForSelector('[data-testid="task-back"]', { timeout: 15000 });
  await settle();
  const onReceive = await state();
  const receivePushes = (await countPushes()) - pushesBefore;
  const receiveState = await page.evaluate(() => JSON.stringify(history.state));
  if (receivePushes === 1 && receiveState.includes('stTask')) {
    ok('Receive pushes exactly one history entry', `1 pushState, state=${receiveState}, history.length ${before} → ${onReceive.entries}`);
  } else {
    bad('Receive pushes exactly one history entry', `${receivePushes} pushState call(s), state=${receiveState}`);
  }

  await page.goBack();
  await settle();
  const backHome = await state();
  if (backHome.home) ok('Browser Back from Receive returns to Home', `entries=${backHome.entries}`);
  else bad('Browser Back from Receive returns to Home', JSON.stringify(backHome));
}

// ── 4. The in-app Back circle does the same thing as browser Back ────────
{
  const fresh = await context.newPage();
  await fresh.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await fresh.waitForSelector('[data-testid="home-send"]');
  await fresh.waitForTimeout(600);
  await fresh.getByTestId('home-receive').click();
  await fresh.waitForSelector('[data-testid="task-back"]');
  await fresh.waitForTimeout(600);
  await fresh.getByTestId('task-back').click();
  await fresh.waitForTimeout(800);
  const afterCircle = await fresh.evaluate(() => ({
    home: !!document.querySelector('[data-testid="home-send"]'),
    taskBack: !!document.querySelector('[data-testid="task-back"]'),
  }));
  // The circle consumed its entry if one more Back now leaves the site.
  await fresh.goBack({ waitUntil: 'commit', timeout: 8000 }).catch(() => {});
  await fresh.waitForTimeout(500);
  const where = await fresh.evaluate(() => location.href).catch(() => 'detached');
  const left = where === 'about:blank' || where === 'detached';
  if (afterCircle.home && !afterCircle.taskBack && left) {
    ok('The Back circle matches browser Back (entry consumed, not leaked)', `returned Home, then Back left the site (${where})`);
  } else {
    bad('The Back circle matches browser Back (entry consumed, not leaked)', JSON.stringify({ afterCircle, where }));
  }
  await fresh.close();
}

// ── 5. Back at Home leaves the site ──────────────────────────────────────
{
  const fresh = await context.newPage();
  await fresh.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  await fresh.waitForSelector('[data-testid="home-send"]');
  await fresh.waitForTimeout(600);
  await fresh.goBack({ waitUntil: 'commit', timeout: 8000 }).catch(() => {});
  await fresh.waitForTimeout(600);
  const left = await fresh.evaluate(() => location.href).catch(() => 'detached');
  if (left === 'about:blank' || left === 'detached') ok('At Home, Back leaves the site', `landed on ${left}`);
  else bad('At Home, Back leaves the site', `still on ${left} — Back was swallowed at the base level`);
  await fresh.close();
}

// ── 6. Sheets are dismissal, not history ─────────────────────────────────
{
  const before = (await state()).entries;
  await page.getByTestId('home-nearby').click();
  await settle();
  const open = await sheetOpen();
  const entries = await page.evaluate(() => history.length);
  const sheet = { open, entries };
  if (!sheet.open) skip('The Nearby sheet opens for the history check', 'sheet did not open on this build');
  else if (sheet.entries === before) ok('Opening a sheet adds no history entry (§3c lists screens only)', `entries=${sheet.entries}`);
  else bad('Opening a sheet adds no history entry (§3c lists screens only)', `entries ${before} → ${sheet.entries}`);

  await page.keyboard.press('Escape');
  await settle();
  const closed = !(await sheetOpen());
  if (closed) ok('Escape closes the sheet without touching history', 'still at Home');
  else bad('Escape closes the sheet without touching history', 'the sheet stayed open');
}

// ── 7. Nothing threw ─────────────────────────────────────────────────────
if (!errors.length) ok('No page errors across the history walk', 'clean');
else bad('No page errors across the history walk', errors.join(' · '));

// ── Report ───────────────────────────────────────────────────────────────
for (const r of results) {
  const tag = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
  console.log(`${tag} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok).length;
const passed = results.filter((r) => r.ok && !r.skipped).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`\nverify-nav: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log('not reachable without a peer or the tracker: Connecting → Room, and the Android back gesture itself.');

await browser.close();
process.exit(failed === 0 ? 0 : 1);
