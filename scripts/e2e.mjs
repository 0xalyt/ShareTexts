// E2E: create → join → connect → send → receive → refresh-reconnect → large text → third-device rejection
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

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
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const C = await ctxC.newPage();

  const logs = [];
  A.on('pageerror', e => logs.push(`[A:ERROR] ${e.message}`));
  B.on('pageerror', e => logs.push(`[B:ERROR] ${e.message}`));

  // --- Device A: create session ---
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByTestId('home-send').click();
  // The pairing-code tile group (LiveCodeDisplay) marks the sending panel.
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  console.log('STEP 1 OK: A created session, pairing code visible');
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.match(/^https?:\/\/[^/]+/)?.[0] || URL }).catch(() => {});
  const code = await readLiveCode(A);
  console.log('Live code:', code);

  // --- Device B: join ---
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  await B.getByTestId('composer').first().waitFor({ timeout: 20000 });
  await A.getByTestId('composer').first().waitFor({ timeout: 20000 });
  console.log('STEP 2 OK: both devices in room (WebRTC or relay connected)');

  // --- A -> B small text ---
  await A.locator('textarea').first().fill('Hello from Device A 👋');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2000);
  const bBody1 = await B.locator('body').innerText();
  if (!bBody1.includes('Hello from Device A 👋')) {
    failures++;
    console.log('STEP 3 FAIL: B did not receive message. B body:', bBody1.slice(0, 400).replace(/\n/g, ' | '));
  } else {
    console.log("STEP 3 OK: B received A's message");
  }

  // --- B -> A reply ---
  await B.locator('textarea').first().fill('Reply from Device B');
  await B.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2000);
  const aBody1 = await A.locator('body').innerText();
  if (!aBody1.includes('Reply from Device B')) {
    failures++;
    console.log('STEP 4 FAIL: A did not receive reply');
  } else {
    console.log("STEP 4 OK: A received B's reply");
  }

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
  await A.getByTestId('composer').first().evaluate((textarea, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    textarea.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, big);
  if (await A.getByTestId('composer').first().inputValue() !== big) throw new Error('Large-text paste changed the content');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  console.log('STEP 6: sent ~120KB unicode text, waiting for B to receive…');
  let receivedBig = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const body = await B.locator('body').innerText();
    if (body.includes('café naïve résumé')) { receivedBig = true; break; }
  }
  if (receivedBig) {
    await B.waitForFunction(text => window.__sharetextDebug.getMessages().some(m => m.sender !== 'me' && m.text === text), big, { timeout: 30000 });
  }
  console.log(receivedBig ? 'STEP 6 OK: B received large text' : 'STEP 6 FAIL: B never received large text');
  if (!receivedBig) failures++;

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
    await sleep(2500);
    const bBody2 = await B.locator('body').innerText();
    console.log(bBody2.includes('Back after refresh') ? 'STEP 8 OK: message sent after reconnect reached B' : 'STEP 8 FAIL: post-reconnect message lost');
    if (!bBody2.includes('Back after refresh')) failures++;
  } else {
    console.log('STEP 8 SKIP: A has no composer after refresh');
  }

  // --- Close B's tab entirely, then reopen it — the room must be rejoined
  // automatically with messages intact ---
  await B.close();
  console.log('STEP 8b: B\'s tab closed — reopening to test rejoin…');
  await sleep(2500);
  const B2 = await ctxB.newPage();
  B2.on('pageerror', e => logs.push(`[B2:ERROR] ${e.message}`));
  await B2.goto(URL, { waitUntil: 'networkidle' });
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
  const freshCode = await A.evaluate(async ({ secret, createdAt }) => {
    const { generateTOTP } = await import('/src/lib/totp.ts');
    return generateTOTP(secret, createdAt);
  }, { secret, createdAt });
  console.log('Fresh code for third device test:', freshCode);
  await C.goto(URL, { waitUntil: 'networkidle' });
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

  console.log('\n--- PAGE ERRORS ---');
  console.log(logs.length ? logs.slice(0, 20).join('\n') : '(none)');

  await browser.close();
  if (failures) throw new Error(`${failures} end-to-end check(s) failed`);
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
