// Two-browser emoji reactions: a reaction dropped on one device must appear
// under the same message on the other, and the tally must keep "how many
// OTHER devices picked it" separate from "did I pick it" — a room where both
// sides tap the same emoji shows 1 + own-chip-lit on each device, never 2.
//
// Selector note: every "chip" lookup here targets [data-testid^="reaction-
// chip-"], not the generic `button[aria-pressed]` the suite originally used.
// The Saved Items bookmark toggle (save-item) is also aria-pressed, so a
// generic first() would resolve to it instead of a reaction chip and the
// "no chips yet" precondition would fail against a control that has nothing
// to do with reactions.
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
const CHIP = '[data-testid^="reaction-chip-"]';
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

// The chip's emoji is now Apple artwork (<img>), and an image's alt/label is
// an attribute — it never appears in textContent. So read the count from
// textContent and the emoji identity from the button's aria-label, which
// still names the reaction ("React with ❤️" / "Remove ❤️ reaction").
const chipText = async (page) => page.evaluate(() => {
  const chip = document.querySelector('[data-testid^="reaction-chip-"]');
  if (!chip) return null;
  const label = chip.getAttribute('aria-label') || '';
  return `${chip.textContent.trim()} ${label}`.trim();
});

const browser = await chromium.launch();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  // --- Creator: create a room ---
  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid]', { timeout: 20000 }).catch(() => {});
  await pa.getByTestId('home-send').click(); // exact-name 'Send' is ambiguous vs the hero demo's control
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);

  // --- Joiner: real /s/ link path ---
  await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1500);
  await pb.evaluate((code) => { location.href = '/s/' + code; }, short);

  await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  out('both devices in the room', true);

  // --- One message, so exactly one reaction bar exists on screen ---
  await pa.getByTestId('composer').fill('react to me');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=react to me', { timeout: 15000 });
  await pa.waitForTimeout(800);

  const noChipsYet = (await pa.locator(CHIP).count()) === 0
    && (await pb.locator(CHIP).count()) === 0;
  out('no reaction chips before anyone reacts', noChipsYet);

  // --- B reacts to A's message ---
  await pb.locator('button[aria-label="React"]').first().click();
  await pb.locator('button[aria-label="React with ❤️"]').last().click();
  await pa.waitForFunction(() => !!document.querySelector('[data-testid^="reaction-chip-"]'), null, { timeout: 10000 }).catch(() => {});
  await pa.waitForTimeout(600);

  const bChip = await pb.locator(CHIP).first().count();
  const bPressed = bChip ? await pb.locator(CHIP).first().getAttribute('aria-pressed') : null;
  out('reactor sees its own chip lit', bPressed === 'true', `pressed=${bPressed}`);

  const aChipCount = await pa.locator(CHIP).count();
  const aChipText = await chipText(pa);
  const aPressed = aChipCount ? await pa.locator(CHIP).first().getAttribute('aria-pressed') : null;
  out('other device sees the reaction arrive', aChipCount === 1 && (aChipText || '').includes('❤️'), `text=${aChipText}`);
  out('arriving reaction counts as the OTHER device\'s', (aChipText || '').includes('1') && aPressed === 'false', `text=${aChipText} pressed=${aPressed}`);

  // --- A taps the same emoji: both sides now hold it, each lit for itself ---
  await pa.locator('button[aria-label="React"]').first().click();
  await pa.locator('button[aria-label="React with ❤️"]').last().click();
  await pb.waitForTimeout(1200);
  const aText2 = await chipText(pa);
  const aPressed2 = await pa.locator(CHIP).first().getAttribute('aria-pressed');
  const bText2 = await chipText(pb);
  const bPressed2 = await pb.locator(CHIP).first().getAttribute('aria-pressed');
  out('both taps: each device lights its own chip', aPressed2 === 'true' && bPressed2 === 'true', `a=${aPressed2} b=${bPressed2}`);
  out('both taps: each counts the other once', (aText2 || '').includes('1') && (bText2 || '').includes('1'), `a=${aText2} b=${bText2}`);

  // --- A removes its own tap: the row survives on B's reaction alone ---
  await pa.locator(CHIP).first().click();
  await pb.waitForTimeout(900);
  const aAfterOwn = await chipText(pa);
  const aAfterOwnPressed = await pa.locator(CHIP).first().getAttribute('aria-pressed');
  out('removing my own tap keeps the other device\'s count', (aAfterOwn || '').includes('❤️') && aAfterOwnPressed === 'false', `text=${aAfterOwn} pressed=${aAfterOwnPressed}`);

  // --- B removes its tap too: nobody means it, so the row disappears ---
  await pb.locator(CHIP).first().click();
  let gone = false;
  try {
    await pa.waitForFunction(() => !document.querySelector('[data-testid^="reaction-chip-"]'), null, { timeout: 10000 });
    gone = true;
  } catch { /* reported below */ }
  const bGone = (await pb.locator(CHIP).count()) === 0;
  out('last reaction removed clears the row on both devices', gone && bGone, `a-cleared=${gone} b-cleared=${bGone}`);

  // ── Tapbacks (§19): a hold opens the strip; it no longer arms selection ──
  const ACTIONS = '[data-testid="message-actions"]';
  const bubbleBox = async (page) => page.evaluate(() => {
    const el = document.querySelector('[data-testid="msg-time"]')?.closest('.group\\/msg');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 };
  });

  // 1. Long-press (600 ms, well past the 500 ms threshold).
  const spot = await bubbleBox(pa);
  if (!spot) {
    out('long-press opens the tapback strip', false, 'no bubble found');
  } else {
    await pa.mouse.move(spot.x, spot.y);
    await pa.mouse.down();
    await pa.waitForTimeout(650);
    await pa.mouse.up();
    const opened = await pa.locator(ACTIONS).count();
    out('long-press opens the tapback strip', opened === 1, `panels=${opened}`);

    // 2. Escape closes it.
    await pa.keyboard.press('Escape');
    await pa.waitForTimeout(200);
    out('Escape closes the strip', (await pa.locator(ACTIONS).count()) === 0);

    // 3. A moving finger is a scroll, not a hold.
    await pa.mouse.move(spot.x, spot.y);
    await pa.mouse.down();
    await pa.mouse.move(spot.x, spot.y - 40, { steps: 6 });
    await pa.waitForTimeout(650);
    await pa.mouse.up();
    out('a moving finger cancels the strip (scrolling wins)', (await pa.locator(ACTIONS).count()) === 0);

    // 4. Right-click opens it on a pointer device, and the browser menu is
    //    suppressed (a native menu over our strip would be two menus).
    await pa.mouse.click(spot.x, spot.y, { button: 'right' });
    await pa.waitForTimeout(300);
    out('right-click opens the tapback strip', (await pa.locator(ACTIONS).count()) === 1);

    // 5. A tapback in the strip reacts, and the badge toggles it off again.
    const heart = pa.locator('[data-testid="tapback-❤️"]');
    if (await heart.count()) {
      await heart.first().click();
      await pa.waitForTimeout(800);
      const chipAfter = await pa.locator(CHIP).count();
      out('a tapback from the strip lands as a badge', chipAfter === 1, `chips=${chipAfter}`);
      await pa.locator(CHIP).first().click();
      await pa.waitForTimeout(700);
      out('tapping the badge toggles my reaction off', (await pa.locator(CHIP).count()) === 0);
    } else {
      out('a tapback from the strip lands as a badge', false, 'strip has no heart');
    }
  }

  // 6. Keyboard: the React control is reachable by Tab and carries a label.
  const reactReachable = await pb.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^React/.test(b.getAttribute('aria-label') || ''));
    if (!btn) return { found: false };
    btn.focus();
    return { found: true, focused: document.activeElement === btn, label: btn.getAttribute('aria-label') };
  });
  out('the React control is keyboard-reachable', reactReachable.found && reactReachable.focused, JSON.stringify(reactReachable));

  // A Motion press gesture synthesizes pointerdown for Enter. The native
  // keyboard click must still toggle once, not undo that same reaction.
  const reactTrigger = pb.getByTestId('add-reaction').first();
  await pb.setViewportSize({ width: 390, height: 844 });
  await pb.getByTestId('composer').focus();
  await pb.locator('[class~="group/msg"]').first().hover();
  const revealed = await pb.waitForFunction(() => {
    const trigger = document.querySelector('[data-testid="add-reaction"]');
    return trigger && getComputedStyle(trigger.parentElement.parentElement).opacity === '1';
  }, undefined, { timeout: 3000 }).then(() => true, () => false);
  out('hovering a message reveals its closed reaction control', revealed);
  await reactTrigger.click();
  await pb.getByTestId('reaction-emoji-thumbs-up').click();
  await pb.getByTestId('reaction-chip-👍').click();
  await pb.keyboard.press('Escape');
  await reactTrigger.focus();
  await reactTrigger.press('Enter');
  const reopened = await pb.getByTestId('reaction-emoji-thumbs-up').waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  out('first Enter reopens text picker after pointer reaction removal', reopened && await reactTrigger.getAttribute('aria-expanded') === 'true');
  await pb.keyboard.press('Escape');
  await pb.setViewportSize({ width: 320, height: 760 });
  for (const key of ['Enter', 'Space']) {
    await reactTrigger.focus();
    await reactTrigger.press('Enter');
    const heartOption = pb.getByTestId('reaction-emoji-red-heart');
    await heartOption.focus();
    await heartOption.press('ArrowRight');
    const thumbsUp = pb.getByTestId('reaction-emoji-thumbs-up');
    out(`${key}: arrows focus the named thumbs-up option`, await thumbsUp.evaluate(el => el === document.activeElement));
    await thumbsUp.press(key);
    const thumbChip = pb.getByTestId('reaction-chip-👍');
    const arrived = await pa.getByTestId('reaction-chip-👍').waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
    out(`${key}: one keyboard activation adds exactly one reaction on both peers`, arrived && await thumbChip.count() === 1 && await thumbChip.getAttribute('aria-pressed') === 'true');
    await pb.keyboard.press('Escape');
    if (await thumbChip.count()) {
      await thumbChip.press('Space');
      const cleared = await pa.getByTestId('reaction-chip-👍').waitFor({ state: 'detached', timeout: 4000 }).then(() => true, () => false);
      out(`${key}: keyboard chip activation removes the reaction on both peers`, cleared && await thumbChip.count() === 0);
    } else {
      out(`${key}: keyboard chip activation removes the reaction on both peers`, false, 'no chip to remove');
    }
  }

  // 7. Screenshot of strip + menu at 390×844, the review artefact §19 asks for.
  try {
    await pb.setViewportSize({ width: 390, height: 844 });
    const spot2 = await bubbleBox(pb);
    if (spot2) {
      await pb.mouse.move(spot2.x, spot2.y);
      await pb.mouse.down();
      await pb.waitForTimeout(650);
      await pb.mouse.up();
      await pb.waitForTimeout(250);
      await pb.screenshot({ path: 'docs/redesign/shots/m2-tapbacks-390x844.png' });
      out('strip + menu screenshot captured', true, 'docs/redesign/shots/m2-tapbacks-390x844.png');
    }
  } catch (e) {
    out('strip + menu screenshot captured', false, String(e).slice(0, 80));
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await browser.close();
}
