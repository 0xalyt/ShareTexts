/**
 * Saved Items E2E (REAL server + two real browsers).
 *
 * Covers the Saved Items spec end-to-end against the production build:
 *   Landing library   — header entry, overlay grammar, empty state, Esc/✕.
 *   Room saves        — text/link/attachment bookmarks from BOTH sides
 *                       (sender 'me' and 'partner'), settings entry.
 *   Dedupe            — a rapid double-tap must never create a twin record.
 *   Persistence       — library survives reload + room restore; bytes are
 *                       blobs in IndexedDB, not references.
 *   Library actions   — search, remove-one, clear-all (with confirm).
 *   Landing re-entry  — badge count and overlay after disconnecting.
 *   Local-only        — after a save, no request or websocket SENT frame on
 *                       the page carries the saved content anywhere.
 *
 * Self-contained: spawns the dev server (tsx server.ts) on its own port.
 * The dev server is deliberate: a production build bakes in
 * VITE_SIGNALING_URL (the Cloudflare worker, which 403s foreign origins),
 * while dev serves the frontend through Vite without .env.production, so
 * signaling stays same-origin on this Node server — the setup every other
 * verify-*.mjs targets on localhost:3010. Exit code is green only when
 * every check passes.
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolveChrome, readLiveCode, sleep } from './lib.mjs';

const PORT = 3591;
const URL = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log('  PASS', name); }
  else { failed++; console.error('  FAIL', name, extra ? String(extra).slice(0, 200) : ''); }
}

let server = null;
let browser = null;
let tmpPng = null;

// Dev mode: no NODE_ENV, so server.ts mounts Vite and the frontend talks to
// THIS server's socket.io instead of the production Cloudflare worker.
const DEV_ENV = { ...process.env, PORT: String(PORT) };
delete DEV_ENV.NODE_ENV;

try {
  /* ── server ──────────────────────────────────────────────────────── */
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: DEV_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
  let up = false;
  // Vite cold start is slower than a static server — allow ~30s.
  for (let i = 0; i < 120; i++) {
    try { await fetch(URL).then(r => { up = r.ok || r.status === 404; }); if (up) break; } catch { /* retry */ }
    await sleep(250);
  }
  if (!up) throw new Error('dev server did not come up on port ' + PORT);

  /* ── browser + pages ─────────────────────────────────────────────── */
  const exe = resolveChrome();
  browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  let pageErrors = 0;
  for (const p of [A, B]) p.on('pageerror', (e) => { pageErrors++; console.error('[pageerror]', e.message); });

  // Local-only ledger: every request B makes and every websocket frame B
  // SENDS, timestamped. Saved content appearing in either after its save
  // moment is an exfiltration the check will catch.
  const netlog = [];
  B.on('request', r => netlog.push({ t: Date.now(), dir: 'req', body: `${r.method()} ${r.url()} ${r.postData() || ''}` }));
  B.on('websocket', ws => {
    ws.on('framesent', f => netlog.push({ t: Date.now(), dir: 'send', body: String(f.payload ?? '') }));
  });

  /* ── A: create room, read pairing code ───────────────────────────── */
  // The landing does NOT auto-create a room — Send (home-send) starts it,
  // and the code tiles render only after the room exists (~5s), which is
  // longer than readLiveCode's settle-window retries. So: click, WAIT for
  // the testid, then read.
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(2000);
  if ((await A.getByTestId('pairing-code').count()) === 0) {
    await A.getByTestId('home-send').click();
  }
  await A.getByTestId('pairing-code').waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);
  check('A created a room with a live code', /^[0-9]{6}$/.test(code || ''), code);

  /* ── B on the LANDING (empty library) before joining ─────────────── */
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.locator('[data-testid="open-saved"]').first().waitFor({ timeout: 10000 });
  check('landing header has the Saved entry', (await B.locator('[data-testid="open-saved"]').count()) > 0);

  await B.locator('[data-testid="open-saved"]').first().click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  check('header entry opens the Saved overlay', await B.locator('[data-testid="saved-overlay"]').isVisible());

  await B.locator('[data-testid="saved-empty"]').waitFor({ timeout: 5000 });
  check('empty state shows for a fresh library', await B.locator('[data-testid="saved-empty"]').isVisible());
  // Empty state carries the local-only promise in its own body copy; the
  // footer's localNote only renders once items exist (checked later).
  check('empty state states the local-only promise',
    await B.getByText(/here on this device/i).first().isVisible().catch(() => false));

  // Escape is handled by useFocusTrap on the CONTAINER, and focus moves
  // inside on a 50ms tick — so press it from within the dialog, like a
  // user whose focus already landed there.
  await B.waitForTimeout(250);
  await B.locator('[data-testid="saved-overlay"]').press('Escape');
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 })
    .then(() => check('Escape closes the overlay', true))
    .catch(() => check('Escape closes the overlay', false, 'still open'));

  await B.locator('[data-testid="open-saved"]').first().click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  await B.locator('[data-testid="saved-close"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 })
    .then(() => check('✕ closes the overlay', true))
    .catch(() => check('✕ closes the overlay', false, 'still open'));

  /* ── B joins the room ────────────────────────────────────────────── */
  await B.locator('button', { hasText: 'Receive' }).first().click();
  await sleep(500);
  await B.locator('input[inputmode="numeric"]').first().fill(code);
  await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
  await A.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 }).catch(() => {});
  const aChat = (await A.locator('[data-testid="composer"]').count()) > 0;
  const bChat = (await B.locator('[data-testid="composer"]').count()) > 0;
  check('A in room', aChat);
  check('B in room', bChat);

  const composer = (page) => page.locator('[data-testid="composer"] textarea, textarea').first();
  const send = async (page, text) => {
    await composer(page).fill(text);
    await composer(page).press('Enter');
    await sleep(400);
  };

  const MARK1 = 'SAVED-MARKER-ONE-7391';
  // A link message renders a LinkCard (host + title), NOT the raw URL text —
  // so the marker must live in the HOSTNAME to be visible on screen.
  const MARK2 = 'https://saved-link-two-7392.example.com/path-7392';
  const MARK3 = 'SAVED-MARKER-THREE-7393';
  const saveTimes = {};

  /* ── text message: B saves a PARTNER message ─────────────────────── */
  await send(A, MARK1);
  await B.getByText(MARK1, { exact: true }).first().waitFor({ timeout: 15000 });
  await A.getByText(MARK1, { exact: true }).first().waitFor({ timeout: 15000 });
  check('B received the text message', true);

  let bm = B.locator('[data-testid="save-item"]');
  check('text bubble exposes exactly one bookmark control on B', (await bm.count()) === 1, `count=${await bm.count()}`);
  saveTimes.mark1 = Date.now();
  await bm.nth(0).click();
  await B.locator('[data-testid="save-item"][aria-pressed="true"]').first().waitFor({ timeout: 5000 })
    .then(() => check('B bookmark click flips aria-pressed', true))
    .catch(() => check('B bookmark click flips aria-pressed', false));
  check('accessible name flips to the remove action',
    ((await bm.nth(0).getAttribute('aria-label')) || '').includes('Remove from saved'),
    await bm.nth(0).getAttribute('aria-label'));

  /* ── link message on B, own message on A ─────────────────────────── */
  await send(A, MARK2);
  await B.getByText(/saved-link-two-7392\.example\.com/).first().waitFor({ timeout: 15000 });
  bm = B.locator('[data-testid="save-item"]');
  check('link bubble adds a second bookmark control', (await bm.count()) === 2, `count=${await bm.count()}`);
  saveTimes.mark2 = Date.now();
  await bm.nth(1).click();
  await B.locator('[data-testid="save-item"][aria-pressed="true"]').nth(1).waitFor({ timeout: 5000 })
    .then(() => check('B saved the link message', true))
    .catch(() => check('B saved the link message', false));

  const am = A.locator('[data-testid="save-item"]');
  check('own text bubble also exposes a bookmark control', (await am.count()) >= 1, `count=${await am.count()}`);
  await am.nth(0).click();
  await A.locator('[data-testid="save-item"][aria-pressed="true"]').first().waitFor({ timeout: 5000 })
    .then(() => check('A saved its OWN message (sender=me path)', true))
    .catch(() => check('A saved its OWN message (sender=me path)', false));

  /* ── rapid double-tap must not create a twin ─────────────────────── */
  await send(A, MARK3);
  await B.getByText(MARK3, { exact: true }).first().waitFor({ timeout: 15000 });
  bm = B.locator('[data-testid="save-item"]');
  check('third bookmark control on B', (await bm.count()) === 3, `count=${await bm.count()}`);
  saveTimes.mark3 = Date.now();
  // Two synchronous clicks in one tick — the ref guard must swallow the
  // second, and the library must end with exactly ONE record for this message.
  await bm.nth(2).evaluate(el => { el.click(); el.click(); });
  await sleep(1200);
  check('double-tap leaves the message saved (not toggled off)',
    (await bm.nth(2).getAttribute('aria-pressed')) === 'true');

  /* ── B opens the library from SETTINGS (same collection) ─────────── */
  await B.locator('[data-testid="open-settings"]').first().click();
  await B.locator('[data-testid="settings-open-saved"]').waitFor({ timeout: 5000 });
  const settingsLabel = (await B.locator('[data-testid="settings-open-saved"]').innerText().catch(() => '')) + ' ' +
    (await B.locator('[data-testid="settings-open-saved"]').locator('xpath=..').innerText().catch(() => ''));
  check('settings row shows the live count (3 items)',
    /3\s*items/i.test(settingsLabel), settingsLabel.replace(/\s+/g, ' ').slice(0, 120));
  await B.locator('[data-testid="settings-open-saved"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  await sleep(300);
  let rows = B.locator('[data-testid="saved-row"]');
  check('settings entry opens the SAME library (3 rows)', (await rows.count()) === 3, `rows=${await rows.count()}`);
  const kindOf = async (i) => rows.nth(i).getAttribute('data-kind');
  const kinds = [(await kindOf(0)), (await kindOf(1)), (await kindOf(2))];
  check('rows are newest-first: text, link, text', kinds.join(',') === 'text,link,text', kinds.join(','));
  check('exactly one row for the double-tapped message (no twin)',
    (await B.locator('[data-testid="saved-overlay"]').getByText(MARK3, { exact: true }).count()) === 1);
  check('footer states the local-only promise when items exist',
    await B.getByText(/only in this browser on this device/i).first().isVisible().catch(() => false));
  check('link row shows the host',
    (await rows.nth(1).innerText()).includes('saved-link-two-7392.example.com'),
    await rows.nth(1).innerText().catch(() => ''));
  await B.locator('[data-testid="saved-close"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 });

  /* ── attachment: send an image, B bookmarks it ───────────────────── */
  tmpPng = 'scripts/tmp-saved-e2e.png';
  writeFileSync(tmpPng, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  {
    const fcP = A.waitForEvent('filechooser', { timeout: 8000 });
    await A.locator('[data-testid="add-attachment"]').first().click();
    await sleep(250);
    await A.locator('button:has-text("File")').first().click();
    const fc = await fcP;
    await fc.setFiles(tmpPng);
    await sleep(300);
    await composer(A).press('Enter');
  }
  await B.locator('[data-testid="save-item-attachment"]').first().waitFor({ timeout: 30000 })
    .then(() => check('B received a byte-complete image', true))
    .catch(() => check('B received a byte-complete image', false, 'no attachment bookmark pill'));
  saveTimes.image = Date.now();
  await B.locator('[data-testid="save-item-attachment"]').first().click();
  await B.locator('[data-testid="save-item-attachment"][aria-pressed="true"]').first().waitFor({ timeout: 5000 })
    .then(() => check('B bookmarked the attachment', true))
    .catch(() => check('B bookmarked the attachment', false));

  // The persisted bytes are real Blobs in IndexedDB — not an object URL
  // reference that dies with the room.
  const idb = await B.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('sharetext-saved', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('items', 'readonly');
    const all = await new Promise((res) => { const q = tx.objectStore('items').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    return all.map(i => ({ kind: i.kind, blob: i.blob instanceof Blob, size: i.blob ? i.blob.size : 0 }));
  });
  check('library holds 4 committed records', idb.length === 4, JSON.stringify(idb));
  check('image record stores real bytes (Blob, >0)', idb.some(i => i.kind === 'image' && i.blob && i.size > 0), JSON.stringify(idb));

  /* ── RELOAD: room restores, bookmarks and library survive ────────── */
  await B.reload({ waitUntil: 'domcontentloaded' });
  await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 25000 }).catch(() => {});
  check('B session restored into the room after reload',
    (await B.locator('[data-testid="composer"]').count()) > 0);
  await B.getByText(MARK1, { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
  const pressed = async (idx) => (await B.locator('[data-testid="save-item"]').nth(idx).getAttribute('aria-pressed')) === 'true';
  check('text bookmark state restored after reload', await pressed(0));
  check('link bookmark state restored after reload', await pressed(1));
  check('double-tapped bookmark state restored after reload', await pressed(2));

  await B.locator('[data-testid="open-settings"]').first().click();
  await B.locator('[data-testid="settings-open-saved"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  await sleep(300);
  rows = B.locator('[data-testid="saved-row"]');
  check('all 4 rows survive reload', (await rows.count()) === 4, `rows=${await rows.count()}`);
  await B.locator('[data-testid="saved-close"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 });

  /* ── grow the library past the search threshold ─────────────────────
   * The search field is hidden until the list is longer than 8 (by
   * design — it earns its place), so save 5 more before testing it. */
  for (let i = 1; i <= 5; i++) {
    await send(A, `EXTRA-SAVE-${i}-7395`);
    await B.getByText(`EXTRA-SAVE-${i}-7395`, { exact: true }).first().waitFor({ timeout: 15000 });
  }
  bm = B.locator('[data-testid="save-item"]');
  check('5 extra bookmark controls (8 total)', (await bm.count()) === 8, `count=${await bm.count()}`);
  for (let i = 3; i < 8; i++) {
    await bm.nth(i).click();
    await B.locator('[data-testid="save-item"][aria-pressed="true"]').nth(i).waitFor({ timeout: 5000 })
      .then(() => check(`extra message ${i - 2} saved`, true))
      .catch(() => check(`extra message ${i - 2} saved`, false));
  }

  await B.locator('[data-testid="open-settings"]').first().click();
  await B.locator('[data-testid="settings-open-saved"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  await sleep(300);
  rows = B.locator('[data-testid="saved-row"]');
  check('library grew to 9 rows', (await rows.count()) === 9, `rows=${await rows.count()}`);

  /* ── search filters the library ──────────────────────────────────── */
  check('search field appears past the threshold',
    (await B.locator('[data-testid="saved-search"]').count()) === 1);
  await B.locator('[data-testid="saved-search"]').fill('MARKER-ONE');
  await sleep(400);
  check('search narrows to the matching row', (await rows.count()) === 1, `rows=${await rows.count()}`);
  check('the matching row is the right one', (await rows.nth(0).innerText()).includes('MARKER-ONE'));
  await B.locator('[data-testid="saved-search"]').fill('');
  await sleep(400);
  check('clearing search restores all rows', (await rows.count()) === 9, `rows=${await rows.count()}`);

  /* ── remove one row ──────────────────────────────────────────────── */
  const before = await rows.count();
  await rows.nth(0).locator('[data-testid="saved-remove"]').click();
  await sleep(600);
  check('remove deletes exactly one row', (await rows.count()) === before - 1, `rows=${await rows.count()}`);
  await B.locator('[data-testid="saved-close"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 });

  /* ── A's library is its own (per-device, sender=me) ──────────────── */
  const aIdb = await A.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('sharetext-saved', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('items', 'readonly');
    const all = await new Promise((res) => { const q = tx.objectStore('items').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    return all.map(i => i.sender);
  });
  check('A library has only its own save (per-device, no sync)', aIdb.length === 1 && aIdb[0] === 'me', JSON.stringify(aIdb));

  /* ── disconnect B → landing badge + overlay ──────────────────────── */
  await B.keyboard.press('Escape'); // connected mode: opens the disconnect confirm
  await B.getByRole('dialog', { name: /disconnect/i }).waitFor({ timeout: 5000 })
    .then(() => check('Escape in a room opens the disconnect confirm', true))
    .catch(() => check('Escape in a room opens the disconnect confirm', false));
  await B.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
  await B.locator('[data-testid="open-saved"]').first().waitFor({ timeout: 15000 })
    .then(() => check('B back on the landing after disconnect', true))
    .catch(() => check('B back on the landing after disconnect', false));
  const badge = await B.locator('[data-testid="open-saved"]').first().getAttribute('title').catch(() => '');
  const badgeText = await B.locator('[data-testid="open-saved"]').first().innerText().catch(() => '');
  check('landing header badge shows the surviving count (8)',
    /8/.test(badgeText) || /8\s*items/i.test(badge), `${badgeText} / ${badge}`);

  await B.locator('[data-testid="open-saved"]').first().click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ timeout: 5000 });
  await sleep(300);
  rows = B.locator('[data-testid="saved-row"]');
  check('library reachable from the landing with 8 rows', (await rows.count()) === 8, `rows=${await rows.count()}`);

  /* ── clear all (with confirmation) ───────────────────────────────── */
  await B.locator('[data-testid="saved-clear"]').click();
  await B.getByRole('dialog', { name: /clear all saved items/i }).waitFor({ timeout: 5000 });
  check('clear-all asks for confirmation', true);
  await B.getByRole('dialog', { name: /clear all saved items/i })
    .getByRole('button', { name: 'Clear all', exact: true }).click();
  await B.locator('[data-testid="saved-empty"]').waitFor({ timeout: 5000 })
    .then(() => check('confirmed clear empties the library', true))
    .catch(() => check('confirmed clear empties the library', false));
  await B.locator('[data-testid="saved-close"]').click();
  await B.locator('[data-testid="saved-overlay"]').waitFor({ state: 'detached', timeout: 3000 });
  const badgeAfter = await B.locator('[data-testid="open-saved"]').first().innerText().catch(() => '');
  check('badge numeral gone after clearing', !/\d/.test(badgeAfter), badgeAfter);

  const aIdbAfter = await A.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('sharetext-saved', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('items', 'readonly');
    const n = await new Promise((res) => { const q = tx.objectStore('items').count(); q.onsuccess = () => res(q.result); });
    db.close();
    return n;
  });
  check('clearing B\'s library did NOT touch A\'s (per-device)', aIdbAfter === 1, `A count=${aIdbAfter}`);

  /* ── local-only: saved content never left B after its save moment ── */
  await sleep(800);
  const leaks = [];
  for (const marker of [MARK1, MARK2, MARK3]) {
    const t = saveTimes[marker === MARK1 ? 'mark1' : marker === MARK2 ? 'mark2' : 'mark3'];
    for (const e of netlog) {
      if (e.t > t + 300 && e.body.includes(marker)) leaks.push(`${e.dir}: ${e.body.slice(0, 120)}`);
    }
  }
  check('no request or sent ws frame carried saved content after saving', leaks.length === 0, leaks.join(' | '));

  check('no page errors on either device', pageErrors === 0, `pageErrors=${pageErrors}`);

  /* ── A disconnects to leave no stray room ────────────────────────── */
  await A.keyboard.press('Escape');
  await A.getByRole('dialog').getByRole('button', { name: 'Disconnect', exact: true }).click().catch(() => {});
} catch (e) {
  failed++;
  console.error('FAIL (script aborted):', e && e.message);
} finally {
  if (tmpPng) { try { unlinkSync(tmpPng); } catch { /* already gone */ } }
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

console.log(`\nsaved-items e2e: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
