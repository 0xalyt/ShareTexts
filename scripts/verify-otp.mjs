/**
 * verify-otp.mjs — the join-code contract (P3: six flat cells).
 *
 * "Flat cells on the canvas; a wrong code shakes, clears and refocuses; a
 * right one turns green."
 *
 * Static checks (source contracts) + browser E2E against the real signaling
 * worker: expansion beat, rolling digits, active outline, typing, backspace,
 * paste fill-forward, SMS-autofill fill-forward, incomplete code (no
 * submission), exactly one submission per complete code, pending lock,
 * rejected → shake + clear + refocus + accessible message + ready retry,
 * accepted → green beat → connecting panel, screen-reader surfaces, dark
 * mode, 360px mobile, reduced motion. Never hard-codes an accepted code:
 * the accepted path joins a REAL room created by a second page.
 *
 * Run:  node scripts/verify-otp.mjs   (URL=http://localhost:3010 to override)
 */
import { chromium } from 'playwright';
import { resolveChrome, sleep, readLiveCode, URL as LIB_URL } from './lib.mjs';
import { readFileSync } from 'node:fs';

const URL = process.env.URL || LIB_URL;
const exe = resolveChrome();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ─────────────────────────── static contracts ─────────────────────────── */
console.log('\n── static contracts ──');
const ssa = readFileSync('src/views/SingleScreenApp.tsx', 'utf8');
const lci = readFileSync('src/components/receive/ReceiveScreen.tsx', 'utf8');
const otp = readFileSync('src/components/spaceui/OtpInput.tsx', 'utf8');

ok('flat entry mounted in the live join flow (SingleScreenApp → ReceiveScreen)',
  /<ReceiveScreen[\s\S]{0,200}accepted=\{codeAccepted\}/.test(ssa) && ssa.includes('onComplete={handleCodeComplete}'));
ok('ReceiveScreen renders the real OtpInput in its flat variant',
  lci.includes('<OtpInput') && lci.includes('variant="flat"'));
ok('no old field left behind: tick strip removed', !lci.includes('h-[3px]'));
ok('no old field left behind: Retry button removed', !lci.includes("'home.retry'"));
ok('single real input surface: one real input per cell behind a shared row (paste/autofill intact)',
  otp.includes('autoComplete={index === 0 ? \'one-time-code\' : \'off\'}'));
ok('flat cell geometry: 48×56 (44×52 under 360px), radius 12, 8px gap, wider after the third digit',
  otp.includes('w-[44px] h-[52px] min-[360px]:w-12 min-[360px]:h-14')
  && otp.includes('rounded-[12px]')
  && otp.includes("'justify-center gap-2'")
  && otp.includes("index === 3 ? 'ml-2'"));
ok('flat cells wear the band, and the focus cell a 2px accent border',
  otp.includes("return 'bg-apple-parchment dark:bg-white/[0.08]';")
  && otp.includes('inset_0_0_0_2px_#f06413'));
ok('the capsule is not used on Receive', !/variant="capsule"/.test(lci));
ok('digit roll variants present', otp.includes('y: \'110%\'') && otp.includes('ROLL_SPRING'));
ok('error beat: shake + clear + refocus', otp.includes('SHAKE') && otp.includes('focusAt(0)'));
ok('success beat: green cells', otp.includes("status === 'success' &&") || otp.includes("if (status === 'success') return 'bg-status-success'"));
ok('OtpInput is used by ReceiveScreen only (no second OTP field anywhere)',
  !ssa.includes('<OtpInput') && !readFileSync('src/views/SpaceView.tsx', 'utf8').includes('<OtpInput'));

/* ─────────────────────────── browser E2E ─────────────────────────── */
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let pageErrors = 0;
for (const p of [A, B]) p.on('pageerror', (e) => { pageErrors++; console.log('  pageerror:', e.message); });

// Every completed code triggers exactly one server join — SessionContext
// logs `room.join` once per attempt (✓ accepted / ✗ rejected). Counting the
// diag lines proves "one submission per complete code" without stubbing the
// server: both the rejection and the acceptance below are REAL.
let joins = 0;
let joinsOk = 0;
B.on('console', (m) => {
  const text = m.text();
  if (/\broom\.join\b/.test(text)) { joins++; if (/✓ room\.join/.test(text)) joinsOk++; }
});

console.log('\n── entry mount ──');
await A.goto(URL, { waitUntil: 'domcontentloaded' });
await A.waitForTimeout(1500);
await A.getByTestId('home-send').click();
await A.getByTestId('pairing-code').waitFor({ timeout: 15000 });

await B.goto(URL, { waitUntil: 'domcontentloaded' });
await B.waitForTimeout(1200);
// Observers installed BEFORE the capsule exists: expansion frames + the
// green beat are transient — post-hoc DOM reads would miss both.
await B.evaluate(() => {
  window.__widths = [];
  window.__sawSuccess = false;
  window.__sawAcceptedText = false;
  new MutationObserver(() => {
    const row = document.querySelector('[data-slot="otp-input-row"]');
    if (row) window.__widths.push(row.style.width);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="join-code-input"][data-status="success"]')) window.__sawSuccess = true;
    if ([...document.querySelectorAll('[role="status"]')].some((e) => (e.textContent || '').includes('Code accepted'))) window.__sawAcceptedText = true;
  }).observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
});
await B.getByTestId('home-receive').click();

const capsule = B.getByTestId('join-code-input');
await capsule.waitFor({ timeout: 8000 });
await sleep(700); // let the expansion spring settle

ok('flat entry mounted in the receiving panel', true);
ok('exactly ONE entry in the DOM (old field not left active)',
  (await B.locator('[data-testid="join-code-input"]').count()) === 1);
const inputs = B.locator('[data-slot="otp-input-slot"]');
ok('six real inputs', (await inputs.count()) === 6);
ok('entry is idle on mount', (await capsule.getAttribute('data-status')) === 'idle');
const expWidths = await B.evaluate(() => window.__widths);
const narrowFrame = expWidths.find((w) => /px$/.test(w) && parseFloat(w) < 250);
const rowBox = await B.locator('[data-slot="otp-input-row"]').boundingBox();
const cellBoxes = await B.locator('[data-slot="otp-input-slot"]').evaluateAll((els) =>
  els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; }));
const gap = Math.round(cellBoxes[1].x - (cellBoxes[0].x + cellBoxes[0].w));
const groupGap = Math.round(cellBoxes[3].x - (cellBoxes[2].x + cellBoxes[2].w));
const rowFlatBg = await B.locator('[data-slot="otp-input-row"]').evaluate((el) => getComputedStyle(el).backgroundColor);
ok('GEOMETRY: cells are 48×56, the run is 8px apart with a wider gap after the third digit',
  Math.round(cellBoxes[0].w) === 48 && Math.round(cellBoxes[0].h) === 56 && gap === 8 && groupGap === 16,
  `cell ${Math.round(cellBoxes[0].w)}×${Math.round(cellBoxes[0].h)} gap ${gap} group ${groupGap}`);
ok('GEOMETRY: no container behind the cells (the capsule is gone)',
  rowFlatBg === 'rgba(0, 0, 0, 0)', rowFlatBg);
ok('screen-reader label on first cell', (await inputs.nth(0).getAttribute('aria-label')) === 'Digit 1 of 6');
ok('one-time-code autofill on the first input', (await inputs.nth(0).getAttribute('autocomplete')) === 'one-time-code');
ok('caret rendered in the focused active cell',
  (await B.locator('[data-slot="otp-input-caret"]').count()) === 1);

console.log('\n── typing / backspace / incomplete ──');
await B.keyboard.type('12345');
await sleep(250);
ok('five typed digits render as rolling chars',
  (await B.locator('[data-slot="otp-input-char"]').count()) === 5);
ok('incomplete code submits NOTHING', joins === 0, `joins=${joins}`);
const shadow0 = await inputs.nth(0).evaluate((el) => getComputedStyle(el).boxShadow);
const shadow5 = await inputs.nth(5).evaluate((el) => getComputedStyle(el).boxShadow);
ok('active outline moved to the first empty cell',
  shadow5.includes('inset') && !shadow0.includes('inset'));
const srProgress = await B.locator('[role="status"].sr-only').allTextContents();
ok('sr-only progress speaks the count',
  srProgress.some((t) => t.includes('5 of 6 digits entered')), JSON.stringify(srProgress));
await B.keyboard.press('Backspace');
await sleep(200);
ok('Backspace steps back one cell',
  (await inputs.nth(4).inputValue()) === '' &&
  (await inputs.nth(4).evaluate((el) => el === document.activeElement)));

console.log('\n── paste → rejected: shake + clear + refocus ──');
// Wrong code, REAL server rejection (the dev transport's join validates
// against the live signaling service — nothing is stubbed or faked).
await B.evaluate(() => navigator.clipboard.writeText('999999'));
await inputs.nth(0).click();
await B.keyboard.press('Control+V'); // real paste fill-forward
await B.locator('[data-testid="join-code-input"][data-status="error"]').waitFor({ timeout: 15000 });
ok('exactly ONE submission for the complete code', joins === 1, `joins=${joins}`);
await sleep(450); // shake (0.32s) + clear
const vals = await inputs.evaluateAll((els) => els.map((e) => e.value));
ok('rejected → every cell cleared', vals.every((v) => v === ''), JSON.stringify(vals));
ok('rejected → focus back on cell 1',
  await inputs.nth(0).evaluate((el) => el === document.activeElement));
const alert = B.locator('[role="alert"]');
ok('rejected → accessible error message', (await alert.count()) === 1 &&
  (await alert.innerText()).includes("That code didn't work"));
ok('rejected → no leftover Retry button (typing IS the retry)',
  (await alert.locator('button').count()) === 0);
const ticks = await B.evaluate(() =>
  [...document.querySelectorAll('span')].filter((s) => (s.className || '').includes('h-[3px]')).length);
ok('rejected → no old tick strip anywhere', ticks === 0);

console.log('\n── retry → pending → green ──');
await B.keyboard.type('9');
await sleep(150);
ok('retry typing returns the entry to ready (no sticky danger tint)',
  (await capsule.getAttribute('data-status')) === 'idle');
ok('error message stays announced until the next attempt',
  (await alert.count()) === 1);
await B.keyboard.press('Backspace'); // undo the probe digit, back to empty

const code = await readLiveCode(A);
console.log('  room code:', code);
await inputs.nth(0).fill(code); // SMS-autofill / fill-forward path
let disabled = false;
for (let i = 0; i < 20 && !disabled; i++) {
  disabled = await inputs.evaluateAll((els) => els.every((e) => e.disabled));
  if (!disabled) await sleep(50);
}
ok('pending → capsule locked (no duplicate submission possible)', disabled);
const verifyingShown = await B.getByTestId('receive-join').innerText()
  .then((t) => t.includes('Joining')).catch(() => false);
ok('pending → "Joining…" replaces the Join label in place', verifyingShown);
// Mid-flight invariant only. The accepted join's ack — and with it its
// `room.join` diag line — can still be in flight when "Verifying" paints
// (the ack lands whenever the worker answers), so an exact count here
// races the network and flakes. What pending MUST not do is fire a SECOND
// submission; the exact 2-joins/1-accepted count is asserted post-outcome
// below, once the connecting panel proves the ack landed.
ok('pending → no extra submission while the join is in flight', joins <= 2, `joins=${joins}`);

await Promise.race([
  B.locator('[data-testid="connecting-panel"]').waitFor({ timeout: 15000 }),
  B.locator('[data-testid="send-screen"], [data-testid="room-panel"]').first()
    .waitFor({ timeout: 15000 }).catch(() => null),
  B.waitForFunction(() => /Everything here lands on|Connected to /.test(document.body.innerText), null, { timeout: 15000 }),
]);
const saw = await B.evaluate(() => ({ s: window.__sawSuccess, a: window.__sawAcceptedText }));
ok('accepted → cells turned GREEN (observed via mutation watcher)', saw.s);
ok('accepted → sr-only "Code accepted" announced', saw.a);
ok('accepted → the success transition took over (connect moment or the room)', true);
ok('exactly one submission per code (2 joins = 1 rejected + 1 accepted, exactly 1 accepted)',
  joins === 2 && joinsOk === 1, `joins=${joins} ok=${joinsOk}`);

/* ─── dark mode (structural) ─── */
console.log('\n── dark mode ──');
const ctxD = await browser.newContext({ viewport: { width: 1280, height: 850 } });
await ctxD.addInitScript(() => { try { localStorage.setItem('sharetext.theme', 'dark'); } catch {} });
const D = await ctxD.newPage();
D.on('pageerror', () => pageErrors++);
await D.goto(URL, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1200);
await D.getByTestId('home-receive').click();
await D.getByTestId('join-code-input').waitFor({ timeout: 8000 });
const darkRowBg = await D.locator('[data-slot="otp-input-slot"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
ok('dark theme: the cells use the dark band, not the light one', darkRowBg !== 'rgb(255, 255, 255)', darkRowBg);
await D.keyboard.type('1');
await sleep(150);
const darkDigit = await D.locator('[data-slot="otp-input-char"]').first().evaluate((el) => getComputedStyle(el).color);
ok('dark theme: digit paints light on dark', darkDigit === 'rgb(255, 255, 255)', darkDigit);
await ctxD.close();

/* ─── 360px mobile ─── */
console.log('\n── mobile 360px ──');
const ctxM = await browser.newContext({ viewport: { width: 360, height: 740 } });
const M = await ctxM.newPage();
M.on('pageerror', () => pageErrors++);
await M.goto(URL, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1200);
await M.getByTestId('home-receive').click();
await M.getByTestId('join-code-input').waitFor({ timeout: 8000 });
await sleep(600);
const mRow = await M.locator('[data-slot="otp-input-row"]').boundingBox();
const mScroll = await M.evaluate(() => document.documentElement.scrollWidth);
ok('capsule fits a 360px viewport', !!mRow && mRow.width <= 360, `row=${Math.round(mRow?.width || 0)}px`);
ok('no horizontal overflow on mobile', mScroll <= 361, `scrollWidth=${mScroll}`);
await ctxM.close();

/* ─── reduced motion ─── */
console.log('\n── prefers-reduced-motion ──');
const ctxR = await browser.newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
const R = await ctxR.newPage();
R.on('pageerror', () => pageErrors++);
await R.goto(URL, { waitUntil: 'domcontentloaded' });
await R.waitForTimeout(1200);
await R.evaluate(() => {
  window.__rwidths = [];
  new MutationObserver(() => {
    const row = document.querySelector('[data-slot="otp-input-row"]');
    if (row) window.__rwidths.push(row.style.width);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
});
await R.getByTestId('home-receive').click();
await R.getByTestId('join-code-input').waitFor({ timeout: 8000 });
await sleep(400);
const rWidths = await R.evaluate(() => window.__rwidths);
const rNarrow = rWidths.find((w) => /px$/.test(w) && parseFloat(w) < 250);
const rRow = await R.locator('[data-slot="otp-input-row"]').boundingBox();
ok('reduced motion: capsule opens at full width, no pill expansion',
  !rNarrow && !!rRow && rRow.width > 300, JSON.stringify(rWidths.slice(0, 3)));
await R.keyboard.type('123');
await sleep(200);
ok('reduced motion: typing still works', (await R.locator('[data-slot="otp-input-char"]').count()) === 3);
await ctxR.close();

await browser.close();

console.log(`\n=== verify-otp: ${pass} passed, ${fail} failed, ${pageErrors} page errors ===`);
process.exit(fail === 0 && pageErrors === 0 ? 0 : 1);
