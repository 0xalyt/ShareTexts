// capture-baseline.mjs — the P0 screenshot matrix.
//
// Args:
//   --base  <url>   default http://localhost:3012 (auto-starts `npm run dev`
//                   with PORT set if a localhost base is unreachable)
//   --out   <dir>   default audit/baseline
//   --only  <screen> capture a single screen name (skips auto-start ordering)
// File name: <screen>-<viewport>-<theme>.png   viewport like 390x844.
// Also writes <out>/console.txt (errors+warnings per screen) and
// <out>/motion/<name>/frame-XX.png (6 s @ 12 fps sequences, once, at
// 1440x900 light — see docs/redesign/capture-noise.md).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRoom, joinRoom, watchConsole } from './lib/flow.mjs';
import { sleep, launchBrowser, waitForChat } from './lib.mjs';

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
let BASE = arg('--base', 'http://localhost:3012');
const OUT = resolve(arg('--out', 'audit/baseline'));
const ONLY = arg('--only', null);

const VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },   // phone portrait
  { label: '844x390', width: 844, height: 390 },   // phone landscape
  { label: '820x1180', width: 820, height: 1180 }, // tablet
  { label: '1440x900', width: 1440, height: 900 }, // desktop
];
const THEMES = ['light', 'dark'];

const consoleSink = [];
let currentLabel = '?';
const log = (msg) => { consoleSink.push(`[${currentLabel}] ${msg}`); };

// ── dev-server auto-start (localhost bases only) ──────────────────────────
async function ensureServer(url) {
  let up = false;
  try { up = (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok; } catch { up = false; }
  if (up) return null;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    throw new Error(`base ${url} unreachable and not localhost — refusing to start a server for it`);
  }
  const port = new URL(url).port || '3012';
  console.log(`[capture] ${url} down — starting dev server on PORT=${port}…`);
  const child = spawn('npm', ['run', 'dev'], {
    shell: true, detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: port },
  });
  child.unref();
  writeFileSync(join(OUT, 'devserver.pid'), String(child.pid));
  for (let i = 0; i < 60; i++) {
    await sleep(1500);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return child; } catch { /* retry */ }
  }
  throw new Error(`dev server did not come up on ${url} in 90s (pid ${child.pid})`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'motion'), { recursive: true });
await ensureServer(BASE);

// ── helpers ───────────────────────────────────────────────────────────────
const browser = await launchBrowser();

/** Fresh context with theme+locale pre-set and the colour scheme emulated. */
async function mkContext(vp, theme) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: theme,
    locale: 'en',
  });
  await ctx.addInitScript(([th]) => {
    try { localStorage.setItem('sharetext.theme', th); } catch { /* private mode */ }
    try { localStorage.setItem('sharetext.locale', 'en'); } catch { /* private mode */ }
  }, [theme]);
  return ctx;
}

const shots = [];
let onlyDone = false; // set once --only's target shot is written, so the
                      // caller can bail instead of walking postrequisite steps
async function shot(page, screen, vp, theme) {
  if (ONLY && ONLY !== screen) return;
  const file = `${screen}-${vp.label}-${theme}.png`;
  await page.screenshot({ path: join(OUT, file) });
  shots.push(file);
  onlyDone = ONLY !== null; // meaningful only in --only mode: without this
                            // guard a full run bails after its first room shot
  console.log(`  shot ${file}`);
}

/** networkidle + 800 ms per the brief, with a hard cap so a live socket
 *  (dev HMR /stats poll) can't stall the run forever. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await sleep(800);
}
async function gotoShot(page, path, screen, vp, theme) {
  if (ONLY && ONLY !== screen) return; // --only skips the whole step, not just the shot
  currentLabel = `${screen}@${vp.label}/${theme}`;
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await shot(page, screen, vp, theme);
}

/** In-app state: wait for trigger, settle frames, shoot. */
async function stateShot(page, fn, screen, vp, theme, settleMs = 600) {
  if (ONLY && ONLY !== screen) return;
  currentLabel = `${screen}@${vp.label}/${theme}`;
  await fn();
  await sleep(settleMs);
  await shot(page, screen, vp, theme);
}

const IMG = resolve('public/demo/photo-4x3.jpg'); // real repo image for the upload screen

const STATIC_SCREENS = ['landing', 'language-menu', 'docs', '404',
  'space-create', 'space-join', 'space-room', 'offline-banner'];
const ROOM_SCREENS = ['pairing', 'enter-code', 'connecting', 'empty-room',
  'room-with-messages', 'image-message', 'reaction-picker-open',
  'reaction-added', 'settings', 'room-ended'];
// --only gates whole GROUPS too: without this, --only landing would still
// walk the full two-device room flow for every viewport × theme (minutes of
// work whose screenshots are discarded).
const groupWant = (list) => !ONLY || list.includes(ONLY);

// ── the two screen groups ────────────────────────────────────────────────
/** Static screens — one page, no room needed. */
async function staticScreens(vp, theme) {
  if (!groupWant(STATIC_SCREENS)) return;
  onlyDone = false; // per-combo: a shot from the previous viewport×theme
                    // must not bail this one out early
  const ctx = await mkContext(vp, theme);
  const page = await ctx.newPage();
  watchConsole(page, log, 'static');

  await gotoShot(page, '/', 'landing', vp, theme);

  // language menu (header listbox)
  await stateShot(page, async () => {
    const btn = page.locator('[aria-haspopup="listbox"]').first();
    await btn.waitFor({ timeout: 8000 });
    await btn.click();
    await page.locator('[role="listbox"]').first().waitFor({ timeout: 5000 });
  }, 'language-menu', vp, theme);

  await gotoShot(page, '/docs', 'docs', vp, theme);
  await gotoShot(page, '/definitely-not-a-page', '404', vp, theme);

  // Temporary Space: create sheet, join sheet, then a real space room
  await gotoShot(page, '/space/create', 'space-create', vp, theme);
  await gotoShot(page, '/space/join', 'space-join', vp, theme);
  await stateShot(page, async () => {
    // The previous shot left us on /space/join — the create sheet's input
    // only exists on /space/create, so navigate back before waiting for it.
    await page.goto(BASE + '/space/create', { waitUntil: 'domcontentloaded' });
    // Valid space code: exactly 8 chars from the allowed alphabet —
    // no 0, O, 1, I, L, 5, S or B (probe: the CTA no-ops on anything else).
    // A random code can still collide (taken → 400, page stays put), so
    // retry with a fresh code up to 3 times before giving up.
    const ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ2346789'; // A-Z minus O,I,L,S,B; digits minus 0,1,5
    const genCode = () => Array.from({ length: 8 },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    await page.waitForSelector('[data-testid="space-code-input"]', { timeout: 10000 });
    let entered = false;
    for (let attempt = 0; attempt < 3 && !entered; attempt++) {
      await page.fill('[data-testid="space-code-input"]', genCode());
      await sleep(1200); // availability debounce + roundtrip
      await page.click('[data-testid="space-create-cta"]');
      entered = await page.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 8000 })
        .then(() => true).catch(() => false);
      if (!entered) await page.waitForSelector('[data-testid="space-code-input"]', { timeout: 5000 }).catch(() => {});
    }
    if (!entered) throw new Error('space create did not navigate after 3 codes');
    // The code chip is `hidden sm:inline-flex` — invisible below 640px — so
    // wait for a members/users chip that is visible at every viewport.
    await page.waitForSelector(
      '[data-testid="space-members"], [data-testid="space-devices"]',
      { timeout: 15000 });
  }, 'space-room', vp, theme);

  // offline banner (reuses this page: land, go offline, wait for the banner)
  if (!ONLY || ONLY === 'offline-banner') {
    await gotoShot(page, '/', 'offline-banner', vp, theme).catch(() => {});
    currentLabel = `offline-banner@${vp.label}/${theme}`;
    await ctx.setOffline(true);
    await page.locator('[data-testid="offline-banner"]').waitFor({ timeout: 8000 })
      .catch(() => log('WARN offline-banner not visible within 8s'));
    await shot(page, 'offline-banner', vp, theme);
    await ctx.setOffline(false);
  }

  await ctx.close();
}

/** Room screens — the verified two-device flow, walked state by state. */
async function roomScreens(vp, theme) {
  if (!groupWant(ROOM_SCREENS)) return;
  onlyDone = false; // per-combo (see staticScreens)
  const ctxA = await mkContext(vp, theme);
  const ctxB = await mkContext(vp, theme);
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  watchConsole(A, log, 'A');
  watchConsole(B, log, 'B');

  // pairing (sender)
  currentLabel = `pairing@${vp.label}/${theme}`;
  const { code } = await createRoom(A, BASE);
  await sleep(600);
  await shot(A, 'pairing', vp, theme);
  if (onlyDone) return; // --only pairing: done — no join, no message walk

  // enter code (receiver, empty)
  currentLabel = `enter-code@${vp.label}/${theme}`;
  await B.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(B);
  await B.waitForSelector('[data-testid="home-receive"]', { timeout: 20000 });
  await B.click('[data-testid="home-receive"]');
  await B.locator('input[inputmode="numeric"], input[type="tel"]').first().waitFor({ timeout: 8000 });
  await sleep(400);
  await shot(B, 'enter-code', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // connecting — type the code and try to catch the panel mid-handshake
  currentLabel = `connecting@${vp.label}/${theme}`;
  await B.locator('input').first().click();
  await B.keyboard.type(code, { delay: 60 });
  const caughtConnecting = await B.waitForSelector('[data-testid="connecting-panel"]', { timeout: 4000 })
    .then(() => true).catch(() => false);
  if (caughtConnecting) await shot(B, 'connecting', vp, theme);
  else log('WARN connecting-panel missed (transition faster than capture)');
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // empty room (connected, nothing sent yet)
  currentLabel = `empty-room@${vp.label}/${theme}`;
  await waitForChat(A, 'A');
  await waitForChat(B, 'B');
  await A.waitForSelector('[data-testid="composer"]', { timeout: 20000 });
  await sleep(800);
  await shot(A, 'empty-room', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // room with messages
  currentLabel = `room-with-messages@${vp.label}/${theme}`;
  await A.fill('[data-testid="composer"]', 'first message for the baseline');
  await A.keyboard.press('Enter');
  await B.waitForSelector('text=first message for the baseline', { timeout: 15000 });
  await A.fill('[data-testid="composer"]', 'second message, timestamps will be masked');
  await A.keyboard.press('Enter');
  await A.waitForSelector('text=second message, timestamps will be masked', { timeout: 15000 });
  await sleep(900);
  await shot(A, 'room-with-messages', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // image message (upload through the real file input)
  currentLabel = `image-message@${vp.label}/${theme}`;
  await A.locator('input[multiple]:not([accept])').setInputFiles(IMG);
  // wait until the transfer completes (image preview or Sent label)
  await A.waitForSelector('[data-testid="composer"]', { timeout: 5000 }).catch(() => {});
  await sleep(4000);
  await shot(A, 'image-message', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // reaction picker open → reaction added
  currentLabel = `reaction-picker-open@${vp.label}/${theme}`;
  const reactBtn = A.locator('button[aria-label="React"]').first();
  const haveReact = await reactBtn.waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
  if (haveReact) {
    await reactBtn.click();
    await sleep(500);
    await shot(A, 'reaction-picker-open', vp, theme);
    currentLabel = `reaction-added@${vp.label}/${theme}`;
    await A.locator('button[aria-label="React with ❤️"]').last().click().catch(() =>
      log('WARN could not click React with ❤️'));
    await A.waitForFunction(() => !!document.querySelector('[data-testid^="reaction-chip-"]'),
      null, { timeout: 8000 }).catch(() => log('WARN reaction chip did not appear'));
    await sleep(600);
    await shot(A, 'reaction-added', vp, theme);
    if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }
  } else {
    log('WARN React button not found — picker/added screens missed');
  }

  // settings (room header gear)
  currentLabel = `settings@${vp.label}/${theme}`;
  await A.locator('[data-testid="open-settings"]').first().click().catch(() =>
    log('WARN open-settings not found'));
  await A.locator('[data-testid="settings-overlay"]').waitFor({ timeout: 6000 })
    .catch(() => log('WARN settings overlay did not open'));
  await sleep(700);
  await shot(A, 'settings', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }
  await A.keyboard.press('Escape');
  await sleep(400);

  // room ended — Escape opens the disconnect confirm, confirm it, catch the toast.
  // KNOWN BUG (bugs.md B-double-sheet): on desktop-while-connected BOTH
  // SingleScreenApp and ChatView answer the same Escape and mount TWO stacked
  // ConfirmSheets at identical coords. The topmost (ChatView's) is the one a
  // real click lands on; the bottom one is covered, so a strict click on the
  // first match times out. Click the LAST dialog's Disconnect with force
  // (the sheet may still be animating in) — this mirrors where a human tap
  // actually goes until the double-mount is fixed.
  currentLabel = `room-ended@${vp.label}/${theme}`;
  await A.keyboard.press('Escape');
  await A.locator('div[role="dialog"]').first().waitFor({ timeout: 6000 })
    .catch(() => log('WARN disconnect confirm did not open on Escape'));
  await sleep(600); // let the sheet's entrance settle so the click is honest
  await A.locator('div[role="dialog"]').last().locator('button')
    .filter({ hasText: /disconnect|end|close/i }).last().click({ force: true })
    .catch(async () => { await A.locator('div[role="dialog"] button').last().click({ force: true }).catch(() => {}); });
  await A.locator('[data-testid="disconnect-toast"]').waitFor({ timeout: 8000 })
    .catch(() => log('WARN disconnect-toast not visible'));
  await sleep(500);
  await shot(A, 'room-ended', vp, theme);

  await ctxA.close();
  await ctxB.close();
}

// ── main matrix ───────────────────────────────────────────────────────────
// One failed combo must not throw away the rest of the baseline: each
// viewport × theme runs inside its own try/catch, failures are recorded in
// console.txt, and the process exits 1 at the end if anything failed.
const comboFailures = [];
for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    console.log(`[capture] ${vp.label} × ${theme}`);
    try {
      await staticScreens(vp, theme);
    } catch (e) {
      comboFailures.push(`static ${vp.label}×${theme}: ${e.message}`);
      log(`ERROR static ${vp.label}×${theme}: ${e.message}`);
      console.error(`  !! static ${vp.label} × ${theme} failed — ${e.message}`);
    }
    try {
      await roomScreens(vp, theme);
    } catch (e) {
      comboFailures.push(`room ${vp.label}×${theme}: ${e.message}`);
      log(`ERROR room ${vp.label}×${theme}: ${e.message}`);
      console.error(`  !! room ${vp.label} × ${theme} failed — ${e.message}`);
    }
  }
}

// ── motion sequences (once, 1440x900 light) ──────────────────────────────
async function motionFrames() {
  const vp = { label: '1440x900', width: 1440, height: 900 };
  const theme = 'light';
  const FPS = 12, DURATION = 6000, COUNT = (DURATION / 1000) * FPS; // 72 frames
  const capture = async (name, trigger) => {
    const dir = join(OUT, 'motion', name);
    mkdirSync(dir, { recursive: true });
    const ctx = await mkContext(vp, theme);
    const page = await ctx.newPage();
    currentLabel = `motion/${name}`;
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const t0 = Date.now();
    trigger(page).catch(() => {});
    for (let i = 0; i < COUNT; i++) {
      const due = t0 + i * (1000 / FPS);
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
      await page.screenshot({ path: join(dir, `frame-${String(i + 1).padStart(2, '0')}.png`) });
    }
    await ctx.close();
    console.log(`  motion ${name}: ${COUNT} frames`);
  };

  // the landing demo, started by its own Send control (never self-plays)
  await capture('landing-demo', async (page) => {
    await page.locator('[data-testid="demo-send"]').first().click({ timeout: 5000 });
  });
  // the moment two devices connect: frames start the instant B submits code
  await capture('connect', async (page) => {
    const ctxB = await mkContext(vp, theme);
    const B = await ctxB.newPage();
    const { code } = await createRoom(page, BASE);
    await B.goto(BASE, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[data-testid="home-receive"]', { timeout: 20000 });
    await B.click('[data-testid="home-receive"]');
    await B.locator('input').first().waitFor({ timeout: 8000 });
    await B.locator('input').first().click();
    await B.keyboard.type(code, { delay: 40 });
    await waitForChat(B, 'B').finally(() => ctxB.close());
  });
}
if (!ONLY) await motionFrames();

// ── report ────────────────────────────────────────────────────────────────
const report = consoleSink.length ? consoleSink.join('\n') + '\n'
  : 'no console errors or warnings captured\n';
writeFileSync(join(OUT, 'console.txt'), report);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(
  { base: BASE, count: shots.length, shots, comboFailures }, null, 1));
console.log(`[capture] done — ${shots.length} screenshots → ${OUT}`);
if (comboFailures.length) {
  console.error(`[capture] ${comboFailures.length} combo failure(s):\n  - ${comboFailures.join('\n  - ')}`);
}
await browser.close();
process.exit(comboFailures.length ? 1 : 0);
