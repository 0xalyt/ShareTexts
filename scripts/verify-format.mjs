#!/usr/bin/env node
// ---------------------------------------------------------------------------
// verify-format.mjs — B16 proof: the APP's active language drives the time
// string, never the machine's locale.
//
// For every app language × browser-context locale (en-US and de-DE):
//   1. fresh context with `sharetext.locale = <lang>` (init script) and
//      timezoneId 'UTC';
//   2. pair two real devices over the dev server's signaling (same flow as
//      verify-reactions), THEN freeze the sender's clock (page.clock —
//      freezes Date only, timers keep running, so pairing is unaffected);
//   3. send a message; the sender's meta strip renders
//      fmtTime(lang, FIXED_TS);
//   4. assert the rendered string ===
//      new Intl.DateTimeFormat(<mapped locale>, { hour:'2-digit',
//      minute:'2-digit', timeZone:'UTC' }).format(FIXED_TS)  — computed here
//      with Node's own Intl;
//   5. assert the output is IDENTICAL between the en-US and de-DE contexts.
//
// --shots additionally saves audit/p1a/format-<lang>.png (message meta strip,
// en and hi) — the STEP 3d proof.
//
// URL=<origin> overrides the dev origin (default http://localhost:3012).
// ---------------------------------------------------------------------------

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3012';
const SHOTS = process.argv.includes('--shots');

// Keep in sync with src/lib/format.ts LOCALES — the gate recomputes the
// expected string with Node's Intl, exactly as the check requires.
const LOCALES = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR',
  hi: 'hi-IN', ja: 'ja-JP', zh: 'zh-Hans-CN', ar: 'ar-EG',
};
const LANGS = Object.keys(LOCALES);
const CTX_LOCALES = ['en-US', 'de-DE'];

// 2026-10-22T10:00:00Z — a fixed instant so the expected string is known.
const FIXED = Date.parse('2026-10-22T10:00:00Z');
const expected = (lang) =>
  new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(FIXED);

let failures = 0;
const out = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// Reachability first — a dead dev server must not produce 18 confusing errors.
try {
  const probe = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (e) {
  console.error(`verify-format: ${BASE} is not answering (${e.message}). Start the dev server (.freebuff/start-preview.ps1) or pass URL=.`);
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const rendered = new Map(); // `${lang}/${ctxLocale}` -> meta time text

  for (const ctxLocale of CTX_LOCALES) {
    for (const lang of LANGS) {
      const key = `${lang}/${ctxLocale}`;
      // TWO contexts — one per device. A shared context would share
      // localStorage, so B would restore the creator's session instead of
      // joining as the second device and A would never leave the pairing
      // screen (composer never appears).
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: ctxLocale,
        timezoneId: 'UTC',
      });
      const ctxB = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: ctxLocale,
        timezoneId: 'UTC',
      });
      for (const c of [ctx, ctxB]) {
        await c.addInitScript((l) => {
          try { localStorage.setItem('sharetext.locale', l); } catch { /* private mode */ }
        }, lang);
      }
      const pageErrors = [];
      const pa = await ctx.newPage();
      const pb = await ctxB.newPage();
      pa.on('pageerror', (e) => pageErrors.push(`A: ${e.message}`));
      pb.on('pageerror', (e) => pageErrors.push(`B: ${e.message}`));

      try {
        // --- pair two devices (real clock) ---
        await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
        await pa.getByTestId('home-send').click();
        await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
        const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
        const short = roomId.replace(/-/g, '').slice(0, 8);

        await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
        await pb.waitForTimeout(1500);
        await pb.evaluate((code) => { location.href = '/s/' + code; }, short);

        await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
        await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });

        // --- freeze BOTH clocks (Date only), then send ---
        await pa.clock.setFixedTime(FIXED);
        await pb.clock.setFixedTime(FIXED);

        const text = `format probe ${lang} ${ctxLocale}`;
        await pa.getByTestId('composer').fill(text);
        await pa.keyboard.press('Enter');

        // Sender's own echo carries the meta strip (data-testid="msg-time").
        const got = await pa.locator('[data-testid="msg-time"]').first()
          .textContent({ timeout: 15000 }).catch(() => null);
        rendered.set(key, got);

        const want = expected(lang);
        out(got === want, `[${key}] meta-strip time === Intl(${LOCALES[lang]})`,
          `want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);

        if (SHOTS && (lang === 'en' || lang === 'hi')) {
          mkdirSync('audit/p1a', { recursive: true });
          // the meta strip = the parent span around the time chip
          await pa.locator('[data-testid="msg-time"]').first()
            .locator('xpath=ancestor::span[1]')
            .screenshot({ path: `audit/p1a/format-${lang}.png` });
          console.log(`  saved audit/p1a/format-${lang}.png`);
        }

        out(pageErrors.length === 0, `[${key}] no page errors`, pageErrors.slice(0, 2).join(' | '));
      } catch (e) {
        out(false, `[${key}] run`, e.message);
      } finally {
        await ctx.close();
        await ctxB.close();
      }
    }
  }

  // --- identical output across the two machine locales ---
  for (const lang of LANGS) {
    const a = rendered.get(`${lang}/en-US`);
    const b = rendered.get(`${lang}/de-DE`);
    out(a !== null && a === b, `[${lang}] output identical in en-US and de-DE contexts`,
      JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  }

  console.log(`\n${failures === 0 ? 'GREEN' : failures + ' FAILURE(S)'} — ${rendered.size} language/context runs`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await browser.close();
}