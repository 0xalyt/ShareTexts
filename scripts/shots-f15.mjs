// F15 visual proof: BEFORE/AFTER screenshots of every major surface, same
// framing both rounds. Output: docs/audits/shots-f15-before/ or -after/
// (F15_PHASE=after node scripts/shots-f15.mjs). Untracked by convention.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';

const PHASE = process.env.F15_PHASE === 'after' ? 'after' : 'before';
const OUT = `docs/audits/shots-f15-${PHASE}`;
mkdirSync(OUT, { recursive: true });

const PHONE_S = { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PHONE_M = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
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

// ── seed a space with text + link + tiny image (dev API) ────────────────
async function seedSpace() {
  const spaceId = crypto.randomUUID();
  const deviceKey = crypto.randomBytes(8).toString('hex');
  const H = { 'content-type': 'application/json', 'x-device-key': deviceKey, 'x-device-name': 'Seed' };
  const cr = await fetch(`${URL}/space/${spaceId}/create`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Weekend trip', durationMs: 86400000 }) }).then(r => r.json());
  const addText = (text, kind) => fetch(`${URL}/space/${spaceId}/items/text`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ text, kind }) });
  await addText('Beach sunset — shot on the phone, full resolution', 'text');
  await addText('https://maps.example.com/route-to-cabin', 'link');
  // 1x1 red PNG
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const t = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let crc = 0xffffffff; for (const b of body) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0; const cb = Buffer.alloc(4); cb.writeUInt32BE(crc); return Buffer.concat([len, body, cb]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', (await import('node:zlib')).deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))), chunk('IEND', Buffer.alloc(0))]);
  const init = await fetch(`${URL}/space/${spaceId}/items/file/init`, { method: 'POST', headers: { ...H, authorization: `Bearer ${cr.token}` }, body: JSON.stringify({ name: 'sunset.png', mime: 'image/png', size: png.length, sha256: crypto.createHash('sha256').update(png).digest('hex') }) }).then(r => r.json());
  await fetch(`${URL}/space/${spaceId}/items/file/direct?itemId=${encodeURIComponent(init.itemId)}`, { method: 'PUT', headers: { authorization: `Bearer ${cr.token}`, 'x-device-key': deviceKey, 'content-type': 'application/octet-stream' }, body: png });
  return { spaceId, token: cr.token };
}

async function main() {
  const browser = await launchBrowser();
  const errs = [];

  // ── HOME ────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: PHONE_S }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`home375 ${e.message}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await shot(p, 'home-375-light');
    await p.evaluate(() => document.querySelector('[data-testid="space-entry"]')?.scrollIntoView({ block: 'center' })); await sleep(500);
    await shot(p, 'home-375-light-nearby');
    await setDark(p, true);
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
    await shot(p, 'home-375-light-dark');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: PHONE_M }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`home390 ${e.message}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await shot(p, 'home-390-dark');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: DESK_L }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`home1280 ${e.message}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await shot(p, 'home-1280-light');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: DESK_XL }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`home1440 ${e.message}`));
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
    await shot(p, 'home-1440-dark');
    await ctx.close();
  }

  // ── ROOM + TRANSFER (desktop sender A, phone receiver B) ───────────
  let roomReady = false;
  {
    const ctxA = await browser.newContext({ viewport: DESK_XL });
    const A = await ctxA.newPage();
    A.on('pageerror', e => errs.push(`A ${e.message}`));
    await A.goto(URL, { waitUntil: 'networkidle' });
    await A.getByRole('button', { name: 'Send' }).first().click();
    await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
    await sleep(700);
    await shot(A, 'pairing-desktop-light');
    await setDark(A, true);
    await shot(A, 'pairing-desktop-dark');
    await setDark(A, false);
    // QR overlay
    await A.getByRole('button', { name: 'Show QR' }).click().catch(() => console.log('no Show QR btn'));
    await sleep(900);
    await shot(A, 'overlay-qr-desktop');
    await A.keyboard.press('Escape').catch(() => {});
    const code = await readLiveCode(A);

    const ctxB = await browser.newContext({ viewport: PHONE_M });
    const B = await ctxB.newPage();
    B.on('pageerror', e => errs.push(`B ${e.message}`));
    await B.goto(URL, { waitUntil: 'networkidle' });
    await B.getByRole('button', { name: 'Receive' }).first().click();
    await sleep(600);
    await shot(B, 'code-entry-mobile');
    await B.locator('input[inputmode="numeric"]').fill(code);
    await waitForChat(B, 'B'); await waitForChat(A, 'A');
    await sleep(1800);
    roomReady = true;
    await shot(A, 'room-1440-light');
    await shot(B, 'room-390-light');
    await setDark(B, true); await setDark(A, true);
    await shot(B, 'room-390-dark');
    await shot(A, 'room-1440-dark');
    await setDark(A, false); await setDark(B, false);

    // transfer active: a real file big enough to catch mid-flight
    const chunkBuf = Buffer.alloc(28 * 1024 * 1024, 7);
    await A.locator('input[type="file"]').first().setInputFiles({ name: 'holiday-photos.zip', mimeType: 'application/zip', buffer: chunkBuf });
    await sleep(2600);
    await shot(A, 'transfer-active-desktop');
    await shot(B, 'transfer-active-mobile');
    // wait for completion on B
    await B.getByText('holiday-photos.zip').first().waitFor({ timeout: 60000 }).catch(() => {});
    await sleep(4500);
    await shot(B, 'transfer-complete-mobile');
    await shot(A, 'transfer-complete-desktop');

    // settings overlay (desktop, room behind it)
    await A.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('ettings') || (x.getAttribute('title') || '').includes('ettings')); b?.click(); });
    await sleep(800);
    await shot(A, 'overlay-settings-desktop');
    await A.keyboard.press('Escape').catch(() => {});

    // Arabic RTL room
    await setLang(A, 'ar'); await setLang(B, 'ar');
    await A.reload({ waitUntil: 'networkidle' }); await sleep(2500);
    await shot(A, 'room-1440-ar-rtl');
    await B.reload({ waitUntil: 'networkidle' }); await sleep(2500);
    await shot(B, 'room-390-ar-rtl');
    await setLang(A, 'en'); await setLang(B, 'en');
    await ctxA.close(); await ctxB.close();
  }

  // ── SPACE ───────────────────────────────────────────────────────────
  if (true) {
    const { spaceId, token } = await seedSpace();
    const url = `${URL}/space/${spaceId}#k=${token}`;
    {
      const ctx = await browser.newContext({ viewport: PHONE_M }); const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(`space-m ${e.message}`));
      await p.goto(url, { waitUntil: 'networkidle' });
      await p.getByTestId('space-item').first().waitFor({ timeout: 12000 });
      await sleep(1500);
      await shot(p, 'space-390-light');
      await setDark(p, true); await sleep(300);
      await shot(p, 'space-390-dark');
      // share sheet overlay
      await p.evaluate(() => { document.querySelector('[data-testid="space-share-btn"]')?.click(); });
      await sleep(900);
      await shot(p, 'overlay-space-share-mobile');
      await setLang(p, 'ar'); await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('space-item').first().waitFor({ timeout: 12000 }).catch(() => {});
      await sleep(1200);
      await shot(p, 'space-390-ar-rtl');
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
  }

  // ── Arabic home ─────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: PHONE_M }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`home-ar ${e.message}`));
    await setLang(p, 'ar');
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1200);
    await shot(p, 'home-390-ar-rtl');
    await ctx.close();
  }

  console.log('roomReady:', roomReady);
  console.log('page errors:', errs.length ? errs.join(' | ') : '(none)');
  await browser.close();
  console.log(`F15 ${PHASE} shots → ${OUT}/`);
}

main().catch(e => { console.error('SHOTS FAILED', e); process.exit(1); });
