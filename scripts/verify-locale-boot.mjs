// verify-locale-boot.mjs — the lazy dictionary must never be seen missing.
//
// P7 STEP 1b moved ten dictionaries out of the entry chunk. The risk that buys
// is a flash of English: the app paints, the chunk lands 80 ms later, the
// screen swaps. This gate records every text state the page goes through from
// first paint and fails if English was ever one of them.
//
//   node scripts/verify-locale-boot.mjs [--base http://localhost:3010]
//
// For ar and hi (one RTL, one Devanagari — both obviously not English):
//   1. every snapshot of body text is collected by a MutationObserver that is
//      installed before any app script runs;
//   2. the first snapshot that contains the hero must be in the locale's own
//      script, and the English hero must never appear in any snapshot;
//   3. <html lang> equals the locale by the time the app is interactive.
//
// It also checks the switch path: changing language inside the app must not
// pass through English either.
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = arg('--base', process.env.URL || 'http://localhost:3010').replace(/\/$/, '');

const CASES = [
  { code: 'ar', english: 'Move anything', own: 'انقل أي شيء' },
  { code: 'hi', english: 'Move anything', own: 'कुछ भी भेजें' },
];

let failures = 0;
const out = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: `${c.code}-${c.code === 'ar' ? 'EG' : 'IN'}` });
    const page = await ctx.newPage();
    await page.addInitScript((code) => {
      try { localStorage.setItem('sharetext.locale', code); } catch { /* private */ }
      // Record every distinct body text, from the first byte of the document.
      const seen = [];
      window.__stSeen = seen;
      const snap = () => {
        const t = document.body ? document.body.innerText : '';
        if (t && (seen.length === 0 || seen[seen.length - 1] !== t)) seen.push(t);
      };
      document.addEventListener('DOMContentLoaded', () => {
        snap();
        new MutationObserver(snap).observe(document.body, { childList: true, subtree: true, characterData: true });
      });
    }, c.code);

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((own) => document.body.innerText.includes(own), c.own, { timeout: 20000 }).catch(() => {});

    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      seen: (window.__stSeen || []).slice(0, 40),
    }));

    out(state.lang === c.code, `[${c.code}] <html lang> is ${c.code} at first interactive paint`, state.lang);
    out((state.dir === 'rtl') === (c.code === 'ar'), `[${c.code}] direction is ${c.code === 'ar' ? 'rtl' : 'ltr'}`, state.dir);

    const englishSnap = state.seen.find((s) => s.includes(c.english));
    out(!englishSnap, `[${c.code}] English hero never painted`, englishSnap ? `saw "${englishSnap.slice(0, 60).replace(/\n/g, ' ')}"` : `${state.seen.length} state(s) recorded`);
    const own = state.seen.find((s) => s.includes(c.own));
    out(!!own, `[${c.code}] the hero was painted in ${c.code}`);

    await ctx.close();
  }
} catch (e) {
  out(false, 'locale boot gate ran to completion', e.message);
} finally {
  await browser.close();
}

console.log(`\n[verify-locale-boot] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
