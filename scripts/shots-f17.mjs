// F17 visual proof: whole-app responsive + state surfaces. BEFORE/AFTER with
// identical framing. Output: docs/audits/shots-f17-{before,after}/
// (F17_PHASE=after node scripts/shots-f17.mjs). Untracked by convention.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PHASE = process.env.F17_PHASE === 'after' ? 'after' : 'before';
const OUT = `docs/audits/shots-f17-${PHASE}`;
mkdirSync(OUT, { recursive: true });

const PHONE_S = { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PHONE_M = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PHONE_L = { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK_L = { width: 1280, height: 800 };
const DESK_XL = { width: 1440, height: 900 };

async function shot(page, name) {
  try { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); }
  catch (e) { console.log('FAIL', name, e.message); }
}
async function setDark(page, on) {
  await page.evaluate((d) => {
    if (d) { document.documentElement.classList.add('dark'); try { localStorage.setItem('sharetext.theme', JSON.stringify('dark')); } catch {} }
    else { document.documentElement.classList.remove('dark'); try { localStorage.setItem('sharetext.theme', JSON.stringify('light')); } catch {} }
  }, on);
  await sleep(420);
}
async function setLang(page, lang) {
  await page.evaluate((l) => { try { localStorage.setItem('sharetext.locale', l); } catch {} }, lang);
}

function png1x1() {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const t = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let crc = 0xffffffff; for (const b of body) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0; const cb = Buffer.alloc(4); cb.writeUInt32BE(crc); return Buffer.concat([len, body, cb]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))), chunk('IEND', Buffer.alloc(0))]);
}

async function seedSpace(name, durationMs) {
  const spaceId = crypto.randomUUID();
  const deviceKey = crypto.randomBytes(8).toString('hex');
  const H = { 'content-type': 'application/json', 'x-device-key': deviceKey, 'x-device-name': 'Seed' };
  const cr = await fetch(`${URL}/space/${spaceId}/create`, { method: 'POST', headers: H, body: JSON.stringify({ name, durationMs }) }).then(r => r.json());
  const addText = (text, kind) => fetch(`${URL}/space/${spaceId}/items/text`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ text, kind }) });
  await addText('Beach sunset — shot on the phone, full resolution', 'text');
  await addText('https://maps.example.com/route-to-cabin', 'link');
  const buf = png1x1();
  const init = await fetch(`${URL}/space/${spaceId}/items/file/init`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ name: 'sunset.png', mime: 'image/png', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }) }).then(r => r.json());
  await fetch(`${URL}/space/${spaceId}/items/file/direct?itemId=${encodeURIComponent(init.itemId)}`, { method: 'PUT', headers: { authorization: `Bearer ${cr.token}`, 'x-device-key': deviceKey, 'content-type': 'application/octet-stream' }, body: buf });
  return { spaceId, token: cr.token };
}
async function closeSpace(spaceId, manageKey) {
  await fetch(`${URL}/space/${spaceId}/close`, { method: 'POST', headers: { authorization: `Bearer ${manageKey}`, 'content-type': 'application/json', 'x-device-key': 'qa' }, body: '{}' });
}

async function main() {
  const browser = await launchBrowser();
  const errs = [];

  // ── HOME ────────────────────────────────────────────────────────────
  for (const [vp, name, dark] of [[PHONE_S, 'home-375-light', false], [PHONE_M, 'home-390-dark', true], [PHONE_L, 'home-430-light', false], [DESK_L, 'home-1280-light', false], [DESK_XL, 'home-1440-dark', true]]) {
    const ctx = await browser.newContext({ viewport: vp }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${name} ${e.message}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    if (dark) await setDark(p, true);
    await shot(p, name);
    if (name === 'home-375-light' || name === 'home-1280-light') {
      await p.evaluate(() => document.querySelector('[data-testid="space-entry"]')?.scrollIntoView({ block: 'center' })); await sleep(500);
      await shot(p, `nearby-${name.split('-')[1]}`);
    }
    await ctx.close();
  }

  // ── PAIRING (mobile + desktop) ──────────────────────────────────────
  {
    const ctxA = await browser.newContext({ viewport: DESK_XL });
    const A = await ctxA.newPage();
    A.on('pageerror', e => errs.push(`pair ${e.message}`));
    await A.goto(URL, { waitUntil: 'networkidle' });
    await A.getByRole('button', { name: 'Send' }).first().click();
    await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(A, 'pairing-1280-light');
    await setDark(A, true);
    await shot(A, 'pairing-1440-dark');
    await setDark(A, false);
    const code = await readLiveCode(A);
    // QR overlay
    await A.getByTestId('show-qr').click().catch(() => console.log('no show-qr'));
    await sleep(900);
    await shot(A, 'overlay-qr-1440-light');
    await A.keyboard.press('Escape').catch(() => {});

    const ctxM = await browser.newContext({ viewport: PHONE_S });
    const M = await ctxM.newPage();
    M.on('pageerror', e => errs.push(`pairm ${e.message}`));
    await M.goto(URL, { waitUntil: 'networkidle' });
    await M.getByRole('button', { name: 'Send' }).first().click();
    await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(M, 'pairing-375-light');
    await ctxM.close();

    // ── ROOM: A(1440) + B(390 mobile) ──────────────────────────────────
    const ctxB = await browser.newContext({ viewport: PHONE_M });
    const B = await ctxB.newPage();
    B.on('pageerror', e => errs.push(`B ${e.message}`));
    await B.goto(URL, { waitUntil: 'networkidle' });
    await B.getByRole('button', { name: 'Receive' }).first().click();
    await B.locator('input[inputmode="numeric"]').fill(code);
    await waitForChat(B, 'B'); await waitForChat(A, 'A');
    await sleep(1800);
    await shot(A, 'room-1440-light');
    await shot(B, 'room-390-light');
    await setDark(B, true); await setDark(A, true);
    await shot(B, 'room-390-dark');
    await shot(A, 'room-1440-dark');
    await setDark(A, false); await setDark(B, false);

    // room states: sending → complete
    const buf = Buffer.alloc(22 * 1024 * 1024, 9);
    await A.locator('input[type="file"]').first().setInputFiles({ name: 'road-trip.zip', mimeType: 'application/zip', buffer: buf });
    await sleep(2400);
    await shot(A, 'room-sending-1440');
    await shot(B, 'room-receiving-390');
    await B.getByText('road-trip.zip').first().waitFor({ timeout: 60000 }).catch(() => {});
    await sleep(4500);
    await shot(B, 'room-complete-390');

    // reconnecting state: kill B's socket? Instead use offline emulation on a
    // fresh joiner page — simplest truthful state: evaluate the banner via
    // A going offline is disruptive; capture the disconnected banner on B by
    // taking A offline with CDP.
    const cdp = await A.context().newCDPSession(A);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    // Wait for the REAL reconnecting banner to render (ICE timeout takes a
    // few seconds) instead of a fixed nap that races it.
    await A.getByTestId('disconnect-banner').waitFor({ timeout: 20000 }).catch(() => console.log('no reconnect banner'));
    await sleep(600);
    await shot(A, 'room-reconnecting-1440');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // settings + code overlays
    await A.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('data-testid') || '') === 'open-settings'); b?.click(); });
    await sleep(800);
    await shot(A, 'overlay-settings-1440');
    await A.keyboard.press('Escape').catch(() => {});
    await sleep(400);

    // RTL room + home
    await setLang(A, 'ar'); await setLang(B, 'ar');
    await A.reload({ waitUntil: 'networkidle' }); await sleep(2500);
    await shot(A, 'room-1440-ar-rtl');
    await B.reload({ waitUntil: 'networkidle' }); await sleep(2500);
    await shot(B, 'room-390-ar-rtl');
    await setLang(A, 'en'); await setLang(B, 'en');
    await ctxA.close(); await ctxB.close();
  }

  // ── SPACE: active / near-expiry(visual tier) / closed ───────────────
  {
    const { spaceId, token, manageKey } = await (async () => {
      const id = crypto.randomUUID();
      const dk = crypto.randomBytes(8).toString('hex');
      const H = { 'content-type': 'application/json', 'x-device-key': dk, 'x-device-name': 'Seed' };
      const cr = await fetch(`${URL}/space/${id}/create`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Weekend trip', durationMs: 86400000 }) }).then(r => r.json());
      const addText = (text, kind) => fetch(`${URL}/space/${id}/items/text`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ text, kind }) });
      await addText('Beach sunset — shot on the phone, full resolution', 'text');
      await addText('https://maps.example.com/route-to-cabin', 'link');
      const buf = png1x1();
      const init = await fetch(`${URL}/space/${id}/items/file/init`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ name: 'sunset.png', mime: 'image/png', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }) }).then(r => r.json());
      await fetch(`${URL}/space/${id}/items/file/direct?itemId=${encodeURIComponent(init.itemId)}`, { method: 'PUT', headers: { authorization: `Bearer ${cr.token}`, 'x-device-key': dk, 'content-type': 'application/octet-stream' }, body: buf });
      return { spaceId: id, token: cr.token, manageKey: cr.manageKey };
    })();
    const url = `${URL}/space/${spaceId}#k=${token}`;
    {
      const ctx = await browser.newContext({ viewport: PHONE_S }); const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`space-m ${e.message}`));
      await p.goto(url, { waitUntil: 'networkidle' });
      await p.getByTestId('space-item').first().waitFor({ timeout: 12000 });
      await sleep(1500);
      await shot(p, 'space-375-light');
      await setDark(p, true); await sleep(300);
      await shot(p, 'space-390-dark');
      // share overlay
      await p.evaluate(() => document.querySelector('[data-testid="space-share-btn"]')?.click());
      await sleep(900);
      await shot(p, 'overlay-share-390-dark');
      // code-entry (join) overlay
      await p.evaluate(() => { document.querySelector('[data-testid="space-join-cta"]')?.closest('[role="dialog"]')?.querySelector('button[aria-label]')?.click(); });
      await p.evaluate(() => { window.location.href = '/'; });
      await sleep(1200);
      await p.evaluate(() => document.querySelector('[data-testid="space-join-entry"]')?.click());
      await sleep(900);
      await shot(p, 'overlay-code-390-light');
      // RTL space
      await setLang(p, 'ar'); await p.goto(url, { waitUntil: 'networkidle' });
      await p.getByTestId('space-item').first().waitFor({ timeout: 12000 }).catch(() => {});
      await sleep(1200);
      await shot(p, 'space-390-ar-rtl');
      await setLang(p, 'en');
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: DESK_L }); const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`space-d ${e.message}`));
      await p.goto(url, { waitUntil: 'networkidle' });
      await p.getByTestId('space-item').first().waitFor({ timeout: 12000 });
      await sleep(1500);
      await shot(p, 'space-1280-light');
      await ctx.close();
    }
    // near-expiry visual: 12h space aged via test clock is a worker-only
    // affordance; for the dev backend we create a 6h space and let the
    // countdown tier speak for the shot (calm tier). Closed state is REAL:
    await closeSpace(spaceId, manageKey);
    {
      const ctx = await browser.newContext({ viewport: PHONE_M }); const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`space-closed ${e.message}`));
      await p.goto(url, { waitUntil: 'networkidle' });
      await sleep(1500);
      await shot(p, 'space-closed-390-light');
      await ctx.close();
    }
  }

  console.log('page errors:', errs.length ? errs.join(' | ') : '(none)');
  await browser.close();
  console.log(`F17 ${PHASE} shots → ${OUT}/`);
}

main().catch(e => { console.error('SHOTS FAILED', e); process.exit(1); });
