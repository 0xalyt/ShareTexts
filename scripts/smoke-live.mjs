// smoke-live.mjs — the live-production smoke (DESIGN.md §verification 1d).
//
// Run after every push, once the live page shows the build marker:
//   node scripts/smoke-live.mjs                      # https://sharetexts.online
//   node scripts/smoke-live.mjs --base https://preview.example.com
//   node scripts/smoke-live.mjs --expect <marker>    # fail if marker differs
//
// Checks, in order (any FAIL → exit 1):
//   1. base answers 200.
//   2. <meta name="sharetexts-build"> present. Until STEP 8c ships the
//      marker this is a WARN, not a failure — the smoke still proves the
//      product works. With --expect it becomes a strict comparison.
//   2b. The share card (title, og:title, og:image → a real 1200x630 PNG,
//      twitter:card) — the link preview is invisible from inside the app.
//   3. Two devices pair over the REAL live signaling path (A creates a
//      room, B joins by code) — the verified flow in scripts/lib/flow.mjs.
//   4. A text message arrives at B within 15 s and A sees its own echo.
//   5. Neither page logged console errors during the run (warnings pass
//      through to stdout but don't fail the smoke).
import { chromium } from 'playwright';
import { pairDevices, sendMessage, waitForText, watchConsole, IDS } from './lib/flow.mjs';
import { launchBrowser } from './lib.mjs';

const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('--base', 'https://sharetexts.online').replace(/\/$/, '');
const EXPECT = arg('--expect', null);

let failures = 0;
const results = [];
function out(ok, label, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  results.push(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
}
function warn(label, detail = '') {
  results.push(`WARN  ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await launchBrowser();
try {
  // ── 1. base answers ─────────────────────────────────────────────────────
  let reachable = false;
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(15000) });
    reachable = res.ok;
    out(res.ok, `${BASE} answers 200`, `got ${res.status}`);
  } catch (e) {
    out(false, `${BASE} answers 200`, e.message);
  }
  if (!reachable) throw new Error('base unreachable — nothing else to smoke');

  // ── 2. build marker ─────────────────────────────────────────────────────
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const consoleSink = [];
  watchConsole(A, consoleSink, 'A');
  watchConsole(B, consoleSink, 'B');

  await A.goto(BASE, { waitUntil: 'domcontentloaded' });
  const marker = await A.evaluate(() =>
    document.querySelector('meta[name="sharetexts-build"]')?.getAttribute('content') ?? null);
  if (EXPECT) {
    out(marker === EXPECT, `build marker === ${EXPECT}`, `got ${marker ?? 'absent'}`);
  } else if (marker === null) {
    warn('build marker absent (STEP 8c adds <meta name="sharetexts-build">)');
  } else {
    out(true, 'build marker present', marker);
  }

  // ── 2b. the share card the whole internet reads ───────────────────────
  // A link preview is the first thing anyone sees of this product on X,
  // WhatsApp, Slack or Discord — and it is invisible from the app itself,
  // so nothing else in the battery would catch a blank card, a relative
  // URL, or a title that drifted back to an SEO string. Fetch the real
  // HTML and the real image, and measure both.
  {
    let ok = true;
    try {
      const html = await (await fetch(BASE, { signal: AbortSignal.timeout(15000) })).text();
      const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1] ?? '';
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      const ogImage = meta('property', 'og:image');
      out(/^AirDrop for everyone — ShareTexts$/.test(title), 'share title is the brand line', title);
      out(/^AirDrop for everyone — ShareTexts$/.test(meta('property', 'og:title')), 'og:title is the brand line', meta('property', 'og:title'));
      out(ogImage.startsWith('https://'), 'og:image is absolute', ogImage || 'absent');
      out(/\?v=\d+/.test(ogImage), 'og:image carries a cache-buster', ogImage || 'absent');
      out(meta('name', 'twitter:card') === 'summary_large_image', 'twitter card is summary_large_image');
      out(meta('property', 'og:image:width') === '1200' && meta('property', 'og:image:height') === '630', 'og:image declares 1200x630');
      if (ogImage.startsWith('https://')) {
        const img = await fetch(ogImage, { signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await img.arrayBuffer());
        const isPng = bytes.length > 24 && bytes.toString('ascii', 1, 4) === 'PNG';
        const w = isPng ? bytes.readUInt32BE(16) : 0;
        const h = isPng ? bytes.readUInt32BE(20) : 0;
        out(img.ok && isPng && w === 1200 && h === 630,
          'og:image serves as a real 1200x630 PNG',
          `${img.status} ${img.headers.get('content-type')} ${w}x${h} ${Math.round(bytes.length / 1024)}KB`);
      } else {
        out(false, 'og:image serves as a real 1200x630 PNG', 'no absolute url');
      }
    } catch (e) {
      ok = false;
      out(false, 'share card is complete and reachable', e.message);
    }
    void ok;
  }

  // ── 3. two devices pair over live signaling ────────────────────────────
  const t0 = Date.now();
  let paired = false;
  try {
    const { code, msToConnected } = await pairDevices(A, B, BASE);
    paired = true;
    out(true, `two devices paired (code …${code.slice(-3)})`,
      `${msToConnected} ms to connected, room up in ${Date.now() - t0} ms`);
  } catch (e) {
    out(false, 'two devices paired', e.message);
  }

  // ── 4. message arrives both ways ───────────────────────────────────────
  if (paired) {
    const TEXT = `live smoke ${Date.now()}`;
    try {
      await sendMessage(A, TEXT);
      const ms = await waitForText(B, TEXT, 15000);
      out(ms !== null, 'message A → B arrived within 15 s',
        ms === null ? 'timed out' : `${ms} ms`);
      const echoed = await waitForText(A, TEXT, 5000);
      out(echoed !== null, 'sender sees its own message', echoed === null ? 'missing' : 'ok');
    } catch (e) {
      out(false, 'message A → B arrived within 15 s', e.message);
    }
  } else {
    out(false, 'message A → B arrived within 15 s', 'skipped — pairing failed');
    out(false, 'sender sees its own message', 'skipped — pairing failed');
  }

  // ── 5. console cleanliness ─────────────────────────────────────────────
  const errors = consoleSink.filter((l) => l.includes(' error: ') || l.includes('pageerror'));
  const warnings = consoleSink.filter((l) => !errors.includes(l));
  if (warnings.length) console.log(`note: ${warnings.length} console warning(s):\n` + warnings.join('\n'));
  out(errors.length === 0, 'no console errors during smoke',
    errors.length ? errors.slice(0, 3).join(' | ') : '');

  await ctxA.close();
  await ctxB.close();
} finally {
  await browser.close();
}

console.log(`\n[smoke-live] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
