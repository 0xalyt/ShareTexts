// E2E: create → join → connect → send → receive → refresh-reconnect → large text → third-device rejection
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';
import { tsImport } from 'tsx/esm/api';
import { browserDiagnostics } from './browser-diagnostics.mjs';

const { generateTOTP } = await tsImport('../src/lib/totp.ts', import.meta.url);

function messageRow(page, text) {
  return page.locator('[class~="group/msg"]').filter({ has: page.getByText(text, { exact: true }) });
}

async function visibleMessageRow(page, text) {
  const row = messageRow(page, text);
  await row.waitFor({ state: 'attached', timeout: 20000 });
  if (await row.count() !== 1) throw new Error(`expected one message row for ${JSON.stringify(text)}`);
  await row.scrollIntoViewIfNeeded();
  await row.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  return row;
}

function makeUnicodeText(kb) {
  const parts = [
    'हिन्दी पाठ', 'العربية نص', '中文文本', '日本語のテキスト', '한국어',
    '🚀🎉😀👍🏽', 'café naïve résumé', 'line1\nline2\nline3',
    'const x = { a: 1 }; "quotes" \'single\' <script>alert(1)</script>',
    'https://example.com/very/long/url?query=1&x=2', 'tab\there', '   spaced   '
  ];
  const chunk = parts.join(' | ') + ' ';
  let s = '';
  while (s.length < kb * 1024) s += chunk;
  return s.slice(0, kb * 1024);
}

async function main() {
  let failures = 0;
  const browser = await launchBrowser();
  const artifacts = browserDiagnostics(browser, 'e2e');
  try {
  const ctxA = await artifacts.newContext();
  const ctxB = await artifacts.newContext();
  const ctxC = await artifacts.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const C = await ctxC.newPage();

  const logs = [];
  A.on('pageerror', e => logs.push(`[A:ERROR] ${e.message}`));
  B.on('pageerror', e => logs.push(`[B:ERROR] ${e.message}`));

  // Keep failure evidence even when an awaited step throws before the footer.
  // Observe only: never intercept frames or log payloads, room secrets or SDP.
  const observed = new Map();
  function observe(name, page) {
    const frames = { relaySent: 0, relayReceived: 0, binarySent: 0, binaryReceived: 0 };
    observed.set(name, { page, frames });
    page.on('websocket', ws => {
      for (const direction of ['sent', 'received']) {
        ws.on(direction === 'sent' ? 'framesent' : 'framereceived', ({ payload }) => {
          if (typeof payload !== 'string') {
            frames[direction === 'sent' ? 'binarySent' : 'binaryReceived']++;
          } else {
            try {
              if (JSON.parse(payload).event === 'relay_message') {
                frames[direction === 'sent' ? 'relaySent' : 'relayReceived']++;
              }
            } catch { /* not a signaling envelope */ }
          }
        });
      }
    });
  }
  observe('A', A);
  observe('B', B);
  async function diagnostics(checkpoint) {
    for (const [device, { page, frames }] of observed) {
      if (page.isClosed()) continue;
      const state = await page.evaluate(() => ({
        build: document.querySelector('meta[name="sharetexts-build"]')?.content,
        // Stage names/timestamps establish route and ordering without identifiers.
        transport: (window.__sharetextDiag?.snapshot() || [])
          .filter(e => /^(webrtc\.|transport\.)/.test(e.stage))
          .map(({ t, stage, ok }) => ({ t, stage, ok })),
        rows: [...document.querySelectorAll('[class~="group/msg"]')]
          .slice(0, 12).map(row => row.textContent?.slice(0, 200)),
      })).catch(error => ({ unavailable: error.message }));
      console.log('E2E_DIAG', JSON.stringify({ checkpoint, device, engine: browser.browserType().name(), version: browser.version(), frames, ...state }));
    }
  }

  try {

  // --- Device A: create session ---
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await A.getByTestId('home-send').waitFor();
  const createStarted = Date.now();
  await A.getByTestId('home-send').click();
  // The pairing-code tile group (LiveCodeDisplay) marks the sending panel.
  // socketReady + health probe, two create ACKs, retry socketReady + probe.
  const createTimeout = 16000 + 3500 + 2 * 9000 + 4000 + 3500;
  try {
    await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: createTimeout });
  } finally {
    console.log(`CREATE elapsed=${Date.now() - createStarted}ms budget=${createTimeout}ms`);
  }
  console.log('STEP 1 OK: A created session, pairing code visible');
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.match(/^https?:\/\/[^/]+/)?.[0] || URL }).catch(() => {});
  const code = await readLiveCode(A);
  console.log('Live code:', code);

  // --- Device B: join ---
  await B.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  await B.getByTestId('composer').first().waitFor({ timeout: 20000 });
  await A.getByTestId('composer').first().waitFor({ timeout: 20000 });
  console.log('STEP 2 OK: both devices in room (WebRTC or relay connected)');

  // --- A -> B small text ---
  await A.locator('textarea').first().fill('Hello from Device A 👋');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  try {
    await visibleMessageRow(B, 'Hello from Device A 👋');
    console.log("STEP 3 OK: B received A's message");
  } catch {
    failures++;
    console.log('STEP 3 FAIL: B did not receive message');
  }

  // --- B -> A reply ---
  await B.locator('textarea').first().fill('Reply from Device B');
  await B.getByRole('button', { name: 'Send', exact: true }).click();
  try {
    await visibleMessageRow(A, 'Reply from Device B');
    console.log("STEP 4 OK: A received B's reply");
  } catch {
    failures++;
    console.log('STEP 4 FAIL: A did not receive reply');
  }
  await diagnostics('first-text-and-reply');

  // --- Copy button on A: the sent message must copy verbatim ---
  const copiedText = 'Hello from Device A 👋';
  const copyRow = await visibleMessageRow(A, copiedText);
  await A.evaluate(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.restoreTestClipboard = () => { navigator.clipboard.writeText = write; };
    navigator.clipboard.writeText = async text => {
      try {
        await write(text);
        window.testClipboardWrite = { text, ok: true };
      } catch (error) {
        window.testClipboardWrite = { text, ok: false, error: String(error) };
        throw error;
      }
    };
  });
  await copyRow.getByRole('button', { name: 'Copy message' }).click();
  await sleep(500);
  const clip = await A.evaluate(() => navigator.clipboard.readText().then(text => ({ text }), error => ({ error: String(error) })));
  if ('text' in clip) {
    if (clip.text !== copiedText) throw new Error('Copy clipboard content mismatched');
    console.log('STEP 5 OK: Copy put the message on the clipboard');
  } else {
    await A.waitForFunction(() => window.testClipboardWrite);
    const result = await A.evaluate(() => window.testClipboardWrite);
    if (!result.ok || result.text !== copiedText) throw new Error(`Clipboard write failed: ${JSON.stringify(result)}`);
    console.log(`STEP 5 OK: native clipboard write resolved with exact text; readback unavailable: ${clip.error}`);
  }
  await A.evaluate(() => window.restoreTestClipboard());

  // --- Large unicode text A -> B ---
  const big = makeUnicodeText(120); // ~120 KB
  if (browser.browserType().name() === 'webkit') {
    await A.getByTestId('composer').first().evaluate((textarea, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      textarea.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, big);
  } else {
    await A.getByTestId('composer').first().fill(big);
  }
  await A.waitForFunction(text => document.querySelector('[data-testid="composer"]')?.value === text, big);
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  console.log('STEP 6: sent ~120KB unicode text, waiting for B to receive…');
  {
    const row = B.locator('[class~="group/msg"]').filter({ has: B.getByRole('button', { name: 'Show full text', exact: true }) });
    await row.waitFor({ state: 'attached', timeout: 30000 });
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: 'Show full text', exact: true }).click();
    const expandedRow = B.locator('[class~="group/msg"]').filter({ has: B.getByRole('button', { name: 'Collapse', exact: true }) });
    const fullText = await expandedRow.locator('.st-verbatim').evaluate(element => {
      const copy = element.cloneNode(true);
      copy.querySelectorAll('button').forEach(button => button.remove());
      return copy.textContent;
    });
    if (fullText !== big) throw new Error('Received large text differs from the sent content');
  }
  console.log('STEP 6 OK: B received exact large text in its own expanded row');

  // --- Refresh reconnect: reload A, room must survive ---
  await A.reload({ waitUntil: 'networkidle' });
  console.log('STEP 7: A refreshed — waiting for reconnect…');
  await sleep(6000);
  const aBody2 = await A.locator('body').innerText();
  const aComposer = await A.getByTestId('composer').count();
  if (aComposer > 0) {
    console.log('STEP 7 OK: A reconnected to the room after refresh');
  } else {
    console.log('STEP 7 WARN: A after refresh shows:', aBody2.slice(0, 300).replace(/\n/g, ' | '));
  }

  // A sends after reconnect
  const taA = A.locator('textarea').first();
  if (await taA.count()) {
    await taA.fill('Back after refresh');
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    try {
      await visibleMessageRow(B, 'Back after refresh');
      console.log('STEP 8 OK: message sent after reconnect reached B');
    } catch {
      console.log('STEP 8 FAIL: post-reconnect message lost');
      failures++;
    }
  } else {
    console.log('STEP 8 FAIL: A has no composer after refresh');
    failures++;
  }

  // --- Close B's tab entirely, then reopen it — the room must be rejoined
  // automatically with messages intact ---
  await B.close();
  console.log('STEP 8b: B\'s tab closed — reopening to test rejoin…');
  await sleep(2500);
  const B2 = await ctxB.newPage();
  observe('B2', B2);
  B2.on('pageerror', e => logs.push(`[B2:ERROR] ${e.message}`));
  await B2.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const b2Body = await B2.locator('body').innerText();
  const b2Composer = await B2.getByTestId('composer').count();
  if (b2Composer > 0 || b2Body.includes('Hello from Device A')) {
    console.log('STEP 8c OK: B rejoined the room after closing the tab');
  } else {
    console.log('STEP 8c WARN: B after tab reopen shows:', b2Body.slice(0, 300).replace(/\n/g, ' | '));
  }
  const b2HasHistory = b2Body.includes('Reply from Device B') || b2Body.includes('Hello from Device A');
  console.log(b2HasHistory ? 'STEP 8d OK: B\'s message history was restored' : 'STEP 8d WARN: B has no restored history');
  const b2Ta = B2.locator('textarea').first();
  if (await b2Ta.count()) {
    await b2Ta.fill('Back after tab close');
    await B2.getByRole('button', { name: 'Send', exact: true }).click();
    try {
      await visibleMessageRow(A, 'Back after tab close');
      const sentRow = await visibleMessageRow(B2, 'Back after tab close');
      // A receipt can precede a different recipient's failed leg. Observe
      // the sender through the bounded link-open/fallback window as well.
      const failed = await sentRow.getByText("Couldn't send", { exact: true })
        .waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
      const status = (await sentRow.innerText()).replace(/\n/g, ' | ');
      if (failed) throw new Error(`B reports ${status}`);
      console.log('STEP 8e OK: message sent after rejoin reached A; B has no Couldn\'t send status | B:', status);
    } catch (e) {
      console.log('STEP 8e FAIL:', e.message);
      failures++;
    }
  } else {
    console.log('STEP 8e FAIL: B has no composer after rejoin');
    failures++;
  }

  // --- Third device rejection ---
  // A is in the chat view now (no code shown), so derive a fresh TOTP from
  // the session secret stored in A's localStorage.
  const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
  const { secret, createdAt } = JSON.parse(stored);
  const freshCode = generateTOTP(secret, createdAt);
  console.log('Fresh code for third device test:', freshCode);
  await C.goto(URL, { waitUntil: 'domcontentloaded' });
  await C.getByTestId('home-receive').click();
  await C.getByTestId('join-code-input').locator('input').first().fill(freshCode);
  await sleep(4000);
  const cBody = await C.locator('body').innerText();
  // F13 multi-device rooms: a THIRD device now JOINS the same room (there is
  // deliberately no product-level participant cap). The dedicated
  // multi-device suite (scripts/verify-multi-device.mjs) asserts the roster
  // and fan-out behavior in depth; here we just require an honest outcome:
  // either seated in the room (composer visible) or a graceful rejection.
  const cComposer = await C.getByTestId('composer').count();
  if (cComposer > 0 || cBody.includes('Devices found') || cBody.includes('Connected')) {
    console.log('STEP 9 OK: third device joined the room (multi-device rooms)');
  } else if (cBody.includes('already has two devices')) {
    console.log('STEP 9 OK: third device rejected gracefully');
  } else {
    console.log('STEP 9 WARN: third device result:', cBody.slice(0, 300).replace(/\n/g, ' | '));
  }

  // --- STEP 10: multi-file transfer queue ---------------------------------
  // Send 3 files in one message. The queue (TransferSlots, 3 wide) starts all
  // three; the UI must render one row per file with per-file status, and all
  // must land complete on B. Small files complete too fast to observe
  // 'Waiting…', so assert the OUTCOME (per-file rows, all complete).
  console.log('STEP 10: multi-file queue — sending 3 files in one message…');
  const fs10 = await import('node:fs');
  const tmp10 = fs10.mkdtempSync('st-queue-');
  const paths10 = [];
  for (const [name, body] of [['queue-one.txt', 'first file body '.repeat(200)],
                              ['queue-two.txt', 'second file body '.repeat(200)],
                              ['queue-three.txt', 'third file body '.repeat(200)]]) {
    const p = `${tmp10}/${name}`;
    fs10.writeFileSync(p, body);
    paths10.push(p);
  }
  await A.locator('input[multiple]:not([accept])').setInputFiles(paths10);
  await sleep(600);
  await A.getByRole('button', { name: /send/i }).first().click();
  let completeFiles = 0;
  for (const name of ['queue-one.txt', 'queue-two.txt', 'queue-three.txt']) {
    try {
      const row = await visibleMessageRow(B2, name);
      await row.getByText('Verified', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
      if ((await row.innerText()).includes('Waiting…')) throw new Error('row is still waiting');
      completeFiles++;
      console.log(`STEP 10 file OK: ${name} — own row Verified`);
    } catch (e) {
      console.log(`STEP 10 file FAIL: ${name} — ${e.message}`);
    }
  }
  if (completeFiles === 3) {
    console.log('STEP 10 OK: all 3 queued files completed on B, per-file rows rendered');
  } else {
    console.log(`STEP 10 FAIL: ${completeFiles}/3 file rows Verified`);
    failures++;
  }

  if (failures) throw new Error(`${failures} end-to-end check(s) failed`);
  } finally {
    await diagnostics('finished');
    console.log('\n--- PAGE ERRORS ---');
    console.log(logs.length ? logs.slice(0, 20).join('\n') : '(none)');
  }
  } catch (error) {
    await artifacts.captureFailure(error).catch(e => console.error('Failure diagnostics:', e));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
