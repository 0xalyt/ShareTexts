/**
 * verify-dna.mjs — the behavioural contracts from APPLE-DNA.md §6.4 / §7 and
 * INTERACTION-MOTION.md §D that a screenshot cannot prove:
 *
 *   1. Focus returns to the control that opened a sheet (B30).
 *   2. A sheet's drag tracks the finger 1:1.
 *   3. A short drag springs back; a drag past the threshold dismisses.
 *   4. Reduced motion does not break direct manipulation.
 *
 *   node scripts/verify-dna.mjs            (dev server on :3010)
 *   URL=http://localhost:3010 node scripts/verify-dna.mjs
 *
 * Exits 1 if any contract fails, so it can gate a commit.
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
let failures = 0;
const results = [];
const check = (name, ok, detail) => {
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

const browser = await chromium.launch();

/** Pair two pages so the room (and therefore the gear) exists. */
async function pair(page, host) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-receive"]');
  await page.getByTestId('home-receive').click();
  await page.waitForSelector('[data-testid="receive-screen"]', { timeout: 20000 });
  await page.waitForTimeout(600);

  await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await host.waitForSelector('[data-testid="home-send"]');
  await host.getByTestId('home-send').click();
  await host.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
  await host.waitForTimeout(800);
  const code = await host.evaluate(() =>
    [...document.querySelectorAll('[data-testid="pairing-code"] span[aria-hidden]')].map((s) => s.textContent).join(''),
  );
  await page.keyboard.type(code);
  await page.waitForSelector('[data-testid="open-settings"]', { timeout: 25000 });
  await page.waitForTimeout(700);
}

/** Current translateY of the sheet panel, in px. */
const panelY = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="settings-overlay"] > div');
    if (!el) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.round(m.m42);
  });

async function openSettings(page) {
  await page.getByTestId('open-settings').click();
  await page.waitForSelector('[data-testid="settings-overlay"]', { timeout: 10000 });
  await page.waitForTimeout(650); // let the open transition settle
}

async function dragHandle(page, delta, { steps = 8, stepDelay = 16 } = {}) {
  const box = await page.locator('[data-testid="settings-overlay"] div[aria-hidden]').first().boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  let last = 0;
  for (let i = 1; i <= steps; i++) {
    last = Math.round((delta * i) / steps);
    await page.mouse.move(x, y + last);
    await page.waitForTimeout(stepDelay);
  }
  return { x, y, reached: last };
}

// ── run 1: normal motion ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostCtx.newPage();
  await pair(page, host);

  // 1. focus returns to the gear
  await openSettings(page);
  const triggerFocus = await page.evaluate(() => ({
    inside: !!document.querySelector('[data-testid="settings-overlay"]')?.contains(document.activeElement),
    testid: document.activeElement?.getAttribute('data-testid'),
  }));
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="settings-overlay"]', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(200);
  const restored = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  check('focus enters the sheet', triggerFocus.inside, `active=${triggerFocus.testid}`);
  check('focus returns to the gear after Esc', restored === 'open-settings', `active=${restored}`);

  // 2. drag tracks 1:1
  await openSettings(page);
  await dragHandle(page, 60, { steps: 6 });
  const midDrag = await panelY(page);
  await page.mouse.up();
  await page.waitForTimeout(450);
  const snapped = await panelY(page);
  check('drag tracks the finger 1:1', Math.abs((midDrag ?? 0) - 60) <= 4, `pointer 60px → sheet ${midDrag}px`);
  check('short drag springs back', snapped === 0 && (await page.$('[data-testid="settings-overlay"]')) !== null, `settled at ${snapped}px, sheet open`);

  // 3. past the threshold dismisses
  await dragHandle(page, 140, { steps: 8 });
  const beforeRelease = await panelY(page);
  await page.mouse.up();
  const closed = await page
    .waitForSelector('[data-testid="settings-overlay"]', { state: 'detached', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  check('drag past 88px dismisses', closed, `released at ${beforeRelease}px → ${closed ? 'closed' : 'still open'}`);

  // 4. focus comes back after a drag-dismiss too
  await page.waitForTimeout(250);
  const restoredAfterDrag = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  check('focus returns after drag-dismiss', restoredAfterDrag === 'open-settings', `active=${restoredAfterDrag}`);

  // 5. focus follows the Language column in and back out
  await openSettings(page);
  await page.getByTestId('settings-language-row').click();
  await page.waitForSelector('[data-testid="settings-language-group"]', { timeout: 5000 });
  await page.waitForTimeout(200);
  const inList = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  await page.getByTestId('settings-language-back').click();
  await page.waitForTimeout(200);
  const backHome = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  check('Language opens with focus on Back', inList === 'settings-language-back', 'active=' + inList);
  check('Back returns focus to the Language row', backHome === 'settings-language-row', 'active=' + backHome);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="settings-overlay"]', { state: 'detached', timeout: 5000 });

  await ctx.close();
  await hostCtx.close();
}

// ── run 2: reduced motion must not break direct manipulation ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostCtx.newPage();
  await pair(page, host);
  await openSettings(page);

  await dragHandle(page, 60, { steps: 6 });
  const tracked = await panelY(page);
  await page.mouse.up();
  await page.waitForTimeout(450);
  const settled = await panelY(page);
  check('reduced motion still drags 1:1', Math.abs((tracked ?? 0) - 60) <= 4, `pointer 60px → sheet ${tracked}px`);
  check('reduced motion still springs back', settled === 0, `settled at ${settled}px`);

  // open/close must not translate under reduced motion (MotionConfig="user")
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="settings-overlay"]', { state: 'detached', timeout: 5000 });
  check('reduced motion restores focus', (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'open-settings', 'gear focused');

  await ctx.close();
  await hostCtx.close();
}

await browser.close();
console.log(`\n=== verify-dna: ${results.length - failures} passed, ${failures} failed ===`);
process.exit(failures ? 1 : 0);
