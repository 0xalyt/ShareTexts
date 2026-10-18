// F11 Pass 2 inspection matrix — renders every major surface in a real
// browser at desktop + mobile widths in light + dark, capturing screenshots
// plus a small JSON state snapshot per shot for later comparison.
// Usage: node scripts/inspect-surfaces.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const OUT = process.argv[2] || 'docs/audits/shots-f11-pass2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

async function shot(page, name, viewport, theme) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const state = await page.evaluate(() => {
    const btn = document.querySelector('button:not([disabled]), a[href]');
    const h1 = document.querySelector('h1,h2');
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      h: h1?.textContent?.slice(0, 60) ?? null,
      overflowX,
      buttons: document.querySelectorAll('button').length,
      focused: document.activeElement?.tagName ?? null,
      errors: window.__pageErrors?.length ?? 0,
    };
  });
  results.push({ name, viewport, theme, file, state });
  console.log(`shot: ${name}  h1="${state.h}" overflowX=${state.overflowX}`);
}

// ── Pairing: QR + code surfaces, and the connected room ─────────────────
for (const [vpName, vp] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`PAGEERROR ${vpName}/${theme}:`, e.message.slice(0, 140)));

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await shot(page, `home-${vpName}-${theme}`, vpName, theme);

    // Send entry (creator lobby) via the hero CTA.
    const sendBtn = page.getByRole('button', { name: 'Send', exact: true });
    if (await sendBtn.count()) {
      await sendBtn.click();
      await page.waitForTimeout(1600);
      await shot(page, `send-lobby-${vpName}-${theme}`, vpName, theme);
    }

    // Receive entry (code form).
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const recvBtn = page.getByRole('button', { name: 'Receive', exact: true });
    if (await recvBtn.count()) {
      await recvBtn.click();
      await page.waitForTimeout(900);
      await shot(page, `receive-entry-${vpName}-${theme}`, vpName, theme);
    }

    // Command bar (⌘K / mobile equivalent).
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const kbd = page.keyboard;
    await kbd.press('Control+k');
    await page.waitForTimeout(700);
    const cmdVisible = await page.locator('[role="dialog"], input[type="search"]').count();
    if (cmdVisible) {
      await kbd.type('file');
      await page.waitForTimeout(500);
      await shot(page, `cmdk-${vpName}-${theme}`, vpName, theme);
      await kbd.press('Escape');
    } else {
      console.log(`cmdk: not openable at ${vpName}/${theme}`);
    }

    for (const route of ['docs', 'privacy', 'terms', 'about']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await shot(page, `${route}-${vpName}-${theme}`, vpName, theme);
    }

    await ctx.close();
  }
}

// ── Pairing: QR + code surfaces, and the connected room ─────────────────
async function pairAndInspect() {
  for (const [vpName, vp] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    for (const theme of ['light', 'dark']) {
      const ctxA = await browser.newContext({ viewport: vp, colorScheme: theme });
      const ctxB = await browser.newContext({ viewport: vp, colorScheme: theme });
      const pa = await ctxA.newPage();
      const pb = await ctxB.newPage();

      await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
      await pa.getByRole('button', { name: 'Send', exact: true }).click();
      await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
      const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
      const short = roomId.replace(/-/g, '').slice(0, 8);
      await shot(pa, `pairing-code-${vpName}-${theme}`, vpName, theme);

      // QR overlay if exposed.
      const qrBtn = pa.getByRole('button', { name: /qr|scan/i }).first();
      if (await qrBtn.count()) {
        await qrBtn.click().catch(() => {});
        await pa.waitForTimeout(700);
        await shot(pa, `qr-overlay-${vpName}-${theme}`, vpName, theme);
        await pa.keyboard.press('Escape');
      }

      await pb.goto(`${BASE}/s/${short}`, { waitUntil: 'domcontentloaded' });
      await pa.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
      await pb.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
      await pb.waitForTimeout(2600);
      await shot(pa, `room-filled-${vpName}-${theme}`, vpName, theme);

      // Empty room on the joiner before traffic.
      await shot(pb, `room-empty-${vpName}-${theme}`, vpName, theme);

      // Composer with text.
      await pa.getByTestId('composer').fill('Quick check — does this transfer?');
      await shot(pa, `composer-text-${vpName}-${theme}`, vpName, theme);

      await ctxA.close();
      await ctxB.close();
    }
  }
}
await pairAndInspect();

writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} shots -> ${OUT}/results.json`);
await browser.close();
