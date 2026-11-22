#!/usr/bin/env node
/**
 * verify-hop — linked devices, through the real screens.
 *
 * Two browser profiles drive the shipped UI against the deployed mailbox:
 * link by code, compare the four emoji, send, receive on a device whose tab
 * was closed, queue while offline, send a file, copy, auto-copy, unlink.
 * Nothing here calls a module directly; if a person could not do it with
 * taps, this gate cannot do it either.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-hop.mjs
 */
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { launchBrowser, resolveEngine } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const SLOW = 240_000; // a cold dev server compiles the whole graph on first load

let failures = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return cond;
};
const sink = [];
/* Page assets (the landing film behind the sheet) that could not load while
   the test had the network off. Not Hop, and not something a person sees. */
const offlineAssets = [];
let offline = false;
const watch = (page, name) => {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const path = (m.location()?.url ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<id>');
    const line = `[${name}] ${m.text()} ${path}`;
    if (offline && /^Failed to load resource/.test(m.text()) && path.startsWith('/') && !path.startsWith('/circle/')) offlineAssets.push(line);
    sink.push(line);
  });
  page.on('pageerror', (e) => sink.push(`[${name}] pageerror ${e.message}`));
};

/** Poll until `fn` returns something truthy; resolves to that value or null. */
async function until(fn, timeoutMs = 30_000, every = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, every));
  }
  return null;
}

const view = (page) => page.locator('[data-hop-view]').getAttribute('data-hop-view').catch(() => null);
const emojiOf = (page) => page.getByTestId('hop-emoji').getAttribute('aria-label');
const texts = (page, testId) => page.getByTestId(testId).evaluateAll((els) => els.map((el) => el.querySelector('p, a')?.textContent ?? ''));
const stateOf = (page, text) => page.getByTestId('hop-out').evaluateAll(
  (els, t) => els.find((el) => el.textContent.includes(t))?.getAttribute('data-state') ?? null, text);

async function openLanding(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: SLOW });
  await page.getByTestId('home-hop').waitFor({ timeout: SLOW });
}
/* What is on the clipboard now. Chromium reads it with the permission granted
   below; Firefox and WebKit refuse a script's readText(), so there it is what
   a real paste into a text field gives. */
async function pasted(page) {
  if (ENGINE === 'chromium') return page.evaluate(() => navigator.clipboard.readText());
  return page.evaluate(() => {
    const ta = document.createElement('textarea');
    ta.id = '__hop_paste';
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    // Inside the open sheet, or its focus trap pulls focus straight back.
    const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]');
    (dialogs[dialogs.length - 1] ?? document.body).append(ta);
    ta.focus();
  }).then(() => page.keyboard.press('ControlOrMeta+V'))
    .then(() => page.evaluate(() => {
      const ta = document.getElementById('__hop_paste');
      const v = ta?.value ?? '';
      ta?.remove();
      return v;
    }));
}
async function send(page, text) {
  await page.getByTestId('hop-input').fill(text);
  await page.getByTestId('hop-send').click();
}

const ENGINE = resolveEngine().name;
const browser = await launchBrowser();
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en' });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en' });
  // Only Chromium knows these permission names; the others reject the call.
  if (ENGINE === 'chromium') await ctxB.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const c of [ctxA, ctxB]) c.setDefaultTimeout(60_000);
  const A = await ctxA.newPage();
  let B = await ctxB.newPage();
  watch(A, 'A');
  watch(B, 'B');

  /* ── link ─────────────────────────────────────────────────────────────── */
  await openLanding(A);
  ok((await A.getByTestId('home-hop').textContent()).includes('Link once'), 'an unlinked device is told what linking is for');
  await A.getByTestId('home-hop').click();
  const privacy = A.locator('.hop-privacy summary');
  await privacy.waitFor();
  await A.getByTestId('hop-scan').focus();
  await A.keyboard.press('Tab');
  const privacyFocused = await privacy.evaluate((el) => el === document.activeElement);
  ok(privacyFocused, 'Privacy is reachable in the sheet keyboard cycle');
  if (privacyFocused) {
    await A.keyboard.press('Space');
    ok(await A.locator('.hop-privacy').evaluate((el) => el.open), 'Space expands the privacy disclosure');
    await A.keyboard.press('Enter');
    ok(!(await A.locator('.hop-privacy').evaluate((el) => el.open)), 'Enter closes the privacy disclosure');
  }
  await A.getByTestId('hop-show-code').click();
  const qr = A.getByTestId('hop-qr');
  await qr.waitFor({ timeout: SLOW });
  const link = await qr.getAttribute('data-hop-link');
  ok(/#hop=[0-9a-f-]{36}\.[\w-]{43}\.[\w-]{87}$/.test(link ?? ''), 'the code is a link whose secret stays in the fragment', `${link?.length} chars`);

  await A.waitForTimeout(600); // the sheet's entrance must settle before a camera could read it
  const png = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
  ok(decoded === link, 'a camera reading the code gets exactly that link');

  const tJoin = Date.now();
  await B.goto(link, { waitUntil: 'domcontentloaded', timeout: SLOW });
  await B.getByTestId('hop-emoji').waitFor({ timeout: SLOW });
  ok(!(await B.evaluate(() => location.hash)), 'the secret is removed from the address bar once read');
  await A.getByTestId('hop-emoji').waitFor({ timeout: 30_000 });
  const [ea, eb] = [await emojiOf(A), await emojiOf(B)];
  ok(ea === eb && ea.split(' ').length === 4, 'both screens show the same four emoji', `${ea} | ${eb}`);
  ok((await view(B)) === 'joining', 'the scanning device is not linked before the other one confirms');

  await A.getByTestId('hop-match').click();
  ok(await until(async () => (await view(A)) === 'home'), 'the confirming device lands on My devices');
  ok(await until(async () => (await view(B)) === 'home'), 'the scanning device lands on My devices', `${Date.now() - tJoin} ms from opening the link`);
  ok(await B.getByTestId('hop-linked').isVisible(), 'linking is confirmed in words, not only by a screen change');

  const named = (page) => until(async () => {
    const t = (await page.getByTestId('hop-devices').textContent()) ?? '';
    return /Other device/.test(t) || !/\S/.test(t.replace('Link another', '')) ? null : t.replace('Link another', '').trim();
  }, 40_000);
  const [nameOnA, nameOnB] = [await named(A), await named(B)];
  ok(nameOnA && nameOnB, 'each device learns the other one\'s name', `A sees "${nameOnA}", B sees "${nameOnB}"`);

  /* ── both open ────────────────────────────────────────────────────────── */
  const T1 = `hop one ${Date.now()}`;
  const tSend = Date.now();
  await send(A, T1);
  ok(await until(async () => (await texts(A, 'hop-out')).includes(T1), 5_000), 'the sender sees its own item at once');
  ok(await until(async () => (await texts(B, 'hop-in')).includes(T1), 40_000), 'text reaches the other device while both are open', `${Date.now() - tSend} ms`);
  ok(await until(async () => (await stateOf(A, T1)) === 'delivered', 40_000), 'the sender is told Delivered only after the receipt');

  /* ── the other device is closed ───────────────────────────────────────── */
  await B.close();
  const T2 = `hop while closed ${Date.now()}`;
  const L2 = `https://example.com/hop-${Date.now()}`;
  await send(A, T2);
  await send(A, L2);
  ok(await until(async () => (await stateOf(A, T2)) === 'sent', 30_000), 'an item for a closed device says it is waiting, not delivered');
  const waitingWords = await A.getByTestId('hop-out').evaluateAll((els, t) => els.find((el) => el.textContent.includes(t))?.textContent ?? '', T2);
  ok(/Waiting for your other device/.test(waitingWords), 'the waiting state is a sentence', waitingWords.replace(T2, '').trim().slice(0, 60));

  B = await ctxB.newPage();
  watch(B, 'B');
  const tOpen = Date.now();
  await openLanding(B);
  ok(await until(async () => (await B.getByTestId('home-hop-new').count()) > 0, 40_000), 'reopening shows what arrived, on the landing, before any tap', `${Date.now() - tOpen} ms after the page opened`);
  await B.getByTestId('home-hop').click();
  ok(await until(async () => (await texts(B, 'hop-in')).includes(T2), 20_000), 'the text sent while it was closed is there');
  await until(async () => (await texts(B, 'hop-in')).includes(L2), 20_000);
  const order = await texts(B, 'hop-in');
  ok(order.indexOf(T1) < order.indexOf(T2) && order.indexOf(T2) < order.indexOf(L2), 'items arrive in the order they were sent');
  ok(await B.getByTestId('hop-in').locator(`a[href="${L2}"]`).count() === 1, 'a link arrives as a link');
  ok(await until(async () => (await stateOf(A, T2)) === 'delivered', 40_000), 'the sender learns it was delivered');

  /* ── copy, and the one-time auto-copy offer ───────────────────────────── */
  await B.getByTestId('hop-in').filter({ hasText: T2 }).getByTestId('hop-copy').click();
  ok((await pasted(B)) === T2, 'Copy puts the received text on the clipboard');
  ok(await B.getByTestId('hop-autocopy-ask').isVisible(), 'auto-copy is offered only after a person copied something');
  await B.getByTestId('hop-autocopy-yes').click();
  const T3 = `hop auto ${Date.now()}`;
  await send(A, T3);
  ok(await until(async () => (await texts(B, 'hop-in')).includes(T3), 40_000), 'the next text arrives');
  ok(await until(async () => (await pasted(B)) === T3, 10_000), 'with auto-copy on, new text is already on the clipboard');

  /* ── offline ──────────────────────────────────────────────────────────── */
  offline = true;
  await ctxA.setOffline(true);
  const T4 = `hop offline ${Date.now()}`;
  await send(A, T4);
  ok(await until(async () => (await stateOf(A, T4)) === 'queued', 10_000), 'offline, the item is kept and says it is waiting for a connection',
    `${await stateOf(A, T4)} | ${await A.getByTestId('hop-problem').textContent().catch(() => 'no problem shown')}`);
  await A.waitForTimeout(2500);
  ok((await stateOf(A, T4)) === 'queued', 'it does not pretend to have been sent');
  await ctxA.setOffline(false);
  offline = false;
  ok(await until(async () => (await texts(B, 'hop-in')).includes(T4), 60_000), 'it goes by itself when the connection returns');
  ok((await texts(B, 'hop-in')).filter((t) => t === T4).length === 1, 'and it arrives once');

  /* ── a file ───────────────────────────────────────────────────────────── */
  const bytes = Buffer.alloc(180 * 1024, 7);
  await A.getByTestId('hop-file').setInputFiles({ name: 'hop-report.bin', mimeType: 'application/octet-stream', buffer: bytes });
  ok(await until(async () => (await B.getByTestId('hop-save').count()) > 0, 60_000), 'a file arrives with a Save action');
  const [download] = await Promise.all([B.waitForEvent('download'), B.getByTestId('hop-save').first().click()]);
  const stream = await download.createReadStream();
  const got = [];
  for await (const chunk of stream) got.push(chunk);
  ok(download.suggestedFilename() === 'hop-report.bin' && Buffer.concat(got).equals(bytes), 'the saved file is the same bytes under the same name');

  await A.getByTestId('hop-file').setInputFiles({ name: 'too-big.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(26 * 1024 * 1024) });
  ok(await until(async () => /over 25 MB/.test((await A.getByTestId('hop-problem').textContent()) ?? ''), 10_000), 'an oversized file is refused in words, with the way that does work');

  /* ── text handed over by the OS share sheet ───────────────────────────── */
  const S = `shared from another app ${Date.now()}`;
  await A.goto(`${BASE}/?share_title=Note&share_text=${encodeURIComponent(S)}`, { waitUntil: 'domcontentloaded', timeout: SLOW });
  await A.getByTestId('hop-input').waitFor({ timeout: SLOW });
  ok((await A.getByTestId('hop-input').inputValue()) === `Note\n${S}`, 'shared text opens My devices with the text ready to send');
  ok(!(await A.evaluate(() => location.search)), 'and is removed from the address bar');

  /* ── it survives a reload, and unlink is local ────────────────────────── */
  await B.reload({ waitUntil: 'domcontentloaded', timeout: SLOW });
  await B.getByTestId('home-hop').waitFor({ timeout: SLOW });
  ok(!(await B.getByTestId('home-hop').textContent()).includes('Link once'), 'the link is still there after a reload');
  await B.getByTestId('home-hop').click();
  ok(await until(async () => (await texts(B, 'hop-in')).includes(T1), 20_000), 'and so is what was received');
  await B.getByTestId('hop-unlink').click();
  await B.getByTestId('hop-unlink-confirm').click();
  ok(await until(async () => (await view(B)) === 'intro'), 'unlinking returns this device to the start');
  ok(await B.evaluate(() => localStorage.getItem('sharetext.hop.v1') === null), 'and leaves no link behind on it');

  // A device whose clock is more than a minute off is told the time by a 401
  // and retries; the browser logs that response and nothing can silence it.
  // One per device is the protocol. A second one is a bug.
  const clock = sink.filter((l) => /status of 401/.test(l));
  // The device that scanned asks "am I in yet?" and the deployed mailbox can
  // only answer a device that is not in with 403. Expected on B, before
  // approval, on that one path. Removing it needs a Worker route for a
  // waiting device, which is a Worker deploy.
  const waiting = sink.filter((l) => l.startsWith('[B]') && /status of 403/.test(l) && /\/circle\/<id>\/members$/.test(l));
  // This gate cuts A's network itself; a request already in the air at that
  // moment fails, and that failure is the test's doing, not the product's.
  const cut = sink.filter((l) => l.startsWith('[A]') && /ERR_INTERNET_DISCONNECTED|\/circle\/.* due to access control checks/.test(l));
  ok(cut.length <= 1, 'going offline interrupts at most one request already in flight', `${cut.length}`);
  const others = sink.filter((l) => !clock.includes(l) && !waiting.includes(l) && !cut.includes(l) && !offlineAssets.includes(l));
  console.log(`note  ${waiting.length} "not linked yet" answer(s) while B waited for approval`);
  for (const name of ['A', 'B']) {
    const n = clock.filter((l) => l.startsWith(`[${name}]`)).length;
    ok(n <= 1, `device ${name} needed at most one clock correction`, `${n}`);
  }
  ok(others.length === 0, 'no console errors on either device', others.slice(0, 3).join(' | ').slice(0, 300));
} catch (err) {
  ok(false, 'the walk ran to completion', String(err?.message ?? err).split('\n')[0]);
  if (sink.length) console.log(sink.slice(0, 5).join('\n'));
} finally {
  await browser.close().catch(() => {});
}

console.log(`\n[verify-hop] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
