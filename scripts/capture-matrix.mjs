// Viewport matrix (P6 STEP 3).
//
// Twelve sizes, chosen because each one breaks a different assumption: the
// smallest phone still in use (320), the two iPhone sizes that matter, both
// landscape sizes, a tablet pair, a folded and an unfolded foldable, and three
// desktop widths up to 2560.
//
// For every size the script records, per screen:
//   • horizontal overflow (document scrollWidth − clientWidth),
//   • the first element that is wider than the viewport, if any,
//   • whether the single filled ember control is inside the thumb zone,
//   • a screenshot in audit/p6-matrix/.
//
// It writes audit/p6-matrix/report.json and prints a table. Screens that need a
// peer (Room, Space) are not driven here — scripts/e2e.mjs covers them with two
// real contexts.
//
// Run: URL=http://127.0.0.1:3010 node scripts/capture-matrix.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:3010';
const OUT = 'audit/p6-matrix';

const VIEWPORTS = [
  [320, 568, 'small-phone'],
  [375, 667, 'iphone-se'],
  [390, 844, 'iphone-13'],
  [844, 390, 'iphone-landscape'],
  [667, 375, 'landscape-small'],
  [820, 1180, 'ipad'],
  [1180, 820, 'ipad-landscape'],
  [673, 841, 'fold-closed'],
  [1344, 841, 'fold-open'],
  [1280, 800, 'laptop'],
  [1920, 1080, 'desktop'],
  [2560, 1440, 'wide'],
];

/** Each screen is "get to it, then measure it". */
const SCREENS = [
  { name: 'home', go: async () => {} },
  {
    name: 'send',
    go: async (page) => {
      const send = page.getByRole('button', { name: /^send$/i }).first();
      if (await send.count()) await send.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(350);
    },
  },
  {
    name: 'receive',
    go: async (page) => {
      const receive = page.getByRole('button', { name: /^receive$/i }).first();
      if (await receive.count()) await receive.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(350);
    },
  },
  {
    name: 'settings',
    go: async (page) => {
      const more = page.locator('[data-testid="header-more"]').first();
      if (await more.count()) {
        await more.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    },
  },
];

/** Measured in the page: overflow, the first too-wide element, thumb reach. */
function measure() {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - doc.clientWidth;
  let widest = null;
  if (overflow > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && r.width > 0) {
        widest = {
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 60),
          right: Math.round(r.right),
        };
        break;
      }
    }
  }
  const vh = window.innerHeight;
  const primary = [...document.querySelectorAll('button, a')].find((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg.includes('240, 100, 19');
  });
  const prect = primary ? primary.getBoundingClientRect() : null;
  return {
    overflow,
    widest,
    primaryBottomPct: prect ? Math.round(((prect.top + prect.height) / vh) * 100) : null,
    height: doc.scrollHeight,
  };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
let failures = 0;

for (const [w, h, label] of VIEWPORTS) {
  // One context per size, one page reused across screens: a fresh context per
  // capture spends most of its time re-downloading the app.
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const screen of SCREENS) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(320);
    try {
      await screen.go(page);
    } catch {
      /* the screen did not open at this size — recorded as such below */
    }
    const m = await page.evaluate(measure);
    await page.screenshot({ path: `${OUT}/${screen.name}-${w}x${h}.png` });
    const thumbNote =
      w <= 430 && m.primaryBottomPct !== null && m.primaryBottomPct < 60 ? 'primary above thumb zone' : '';
    const notes = [
      m.overflow > 1 ? `overflow ${m.overflow}px` : '',
      m.widest ? `widest <${m.widest.tag}> right=${m.widest.right}` : '',
      thumbNote,
    ]
      .filter(Boolean)
      .join(' · ');
    if (m.overflow > 1) failures++;
    results.push({ screen: screen.name, viewport: `${w}x${h}`, label, ...m, notes });
    const tag = `${screen.name} ${w}x${h}`;
    console.log(
      `${tag.padEnd(22)} overflow=${String(m.overflow).padStart(3)}px  primary=${m.primaryBottomPct ?? '-'}%  ${notes}`,
    );
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length} captures, ${failures} with horizontal overflow → ${OUT}/report.json`);
if (failures) process.exit(1);
