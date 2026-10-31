/**
 * verify-intent-entry.mjs — the intent-first entry, end to end.
 *
 * The landing no longer begins with "Send or Receive?". It begins with one
 * field: type/paste the thing and the app opens a room with it staged, or
 * paste the six-digit code and the app walks into that room. This suite
 * proves BOTH halves against a real server, in two ISOLATED browser
 * contexts (two tabs of one profile share a device identity and the server
 * answers UNREACHABLE — that is not a valid way to test a join).
 *
 *   1. classification   — empty / text / 6-digit code drive the right label
 *   2. carry            — text typed on the landing is IN the composer of
 *                         the room it opened, before anything is sent
 *   3. intent join      — the code alone takes the other device into the room
 *   4. handoff          — the carried text sends and arrives
 *
 * Run: URL=http://localhost:3010 node scripts/verify-intent-entry.mjs
 */
import { chromium } from 'playwright';
import { readLiveCode, waitForChat } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const results = [];
const out = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const TYPE_MS = 40;

/** Type into the intent field the way a person does (real key events). */
async function typeIntent(page, text, submit = false) {
  const input = page.locator('[data-testid="intent-input"]');
  await input.waitFor({ timeout: 20000 });
  await input.click();
  await input.fill('');
  await input.type(text, { delay: TYPE_MS });
  if (submit) await page.keyboard.press('Enter');
}

async function intentLabel(page) {
  return (await page.locator('[data-testid="intent-submit"]').innerText()).trim();
}

/** The label swaps through a spring (AnimatePresence mode="wait"), so read
 *  it once it has SETTLED on the expected value rather than mid-transition. */
async function waitForLabel(page, expected, timeoutMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if ((await intentLabel(page)) === expected) return true;
    await new Promise(r => setTimeout(r, 60));
  }
  return false;
}

const browser = await chromium.launch();

// Two contexts = two devices. This is the only way the join path is real.
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

const errors = [];
for (const [tag, page] of [['A', pageA], ['B', pageB]]) {
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
}

try {
  await pageA.goto(BASE, { waitUntil: 'domcontentloaded' });

  // ── 1. classification ────────────────────────────────────────────────────
  await pageA.locator('[data-testid="intent-input"]').waitFor({ timeout: 20000 });
  const emptyLabel = await intentLabel(pageA);

  await typeIntent(pageA, 'a note for the other screen');
  await waitForLabel(pageA, 'Send this');
  const textLabel = await intentLabel(pageA);

  await typeIntent(pageA, '418203');
  const codeSettled = await waitForLabel(pageA, 'Join room');
  const codeLabel = await intentLabel(pageA);
  const hasEscape = (await pageA.locator('[data-testid="intent-as-text"]').count()) === 1;

  out(
    'intent: empty / text / code drive distinct labels',
    emptyLabel !== textLabel && codeSettled && codeLabel === 'Join room',
    `"${emptyLabel}" → "${textLabel}" → "${codeLabel}"`
  );
  out('intent: a code-shaped message can still be sent as text', hasEscape);

  // ── 2. carry ─────────────────────────────────────────────────────────────
  const payload = 'carried from the landing field';
  await typeIntent(pageA, payload, true);
  await pageA.getByTestId('pairing-code').waitFor({ timeout: 25000 });
  const code = await readLiveCode(pageA);
  out('intent: typing something opens a room', /^\d{6}$/.test(code), `code ${code}`);

  // ── 3. intent join ───────────────────────────────────────────────────────
  await pageB.goto(BASE, { waitUntil: 'domcontentloaded' });
  await typeIntent(pageB, code, true);
  await waitForChat(pageB, 'B');
  await waitForChat(pageA, 'A');
  out('intent: the code alone joins the room', true, `joined ${code}`);

  // The text typed on the landing must already be in the composer — the
  // whole point: you say WHAT you are moving before you pick a side.
  const composer = pageA.getByTestId('composer').first();
  await composer.waitFor({ timeout: 20000 });
  const inComposer = await composer.inputValue();
  out('intent: the typed text is waiting in the composer', inComposer === payload, JSON.stringify(inComposer));

  // ── 4. handoff ───────────────────────────────────────────────────────────
  await pageA.getByTestId('send').first().click();
  const arrived = await pageB
    .getByText(payload, { exact: false })
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  out('intent: one tap sends what was already there', arrived);

  out('intent: no page errors during the flow', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (e) {
  out('intent: flow completed without throwing', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
console.log(`\nverify-intent-entry: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
