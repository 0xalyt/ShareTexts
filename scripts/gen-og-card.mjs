// OG card generator — the 1200×630 link preview every social surface reads
// (X/Twitter, WhatsApp, LinkedIn, Slack, iMessage, Discord, Telegram, Facebook).
//
// OWNER'S ARTWORK, OWNER'S COMPOSITION. The card is the app tile, centred on a
// white field: no headline, no lockup, no UI sketch, no second colour, no
// shadow. This is the composition the owner supplied as the reference — it is
// pinned deliberately, and it must not be restyled, refilled or "improved"
// without an explicit instruction to do so.
//
// History, so nobody repeats it: v2/v3 filled the whole card with the tile's
// orange gradient and blew the mark up to 340px. That is a different picture
// from the one the owner wants, and it is what shipped while the preview kept
// looking wrong to them. v4 returns to the tile-on-white card and stays there.
//
// Nothing is redrawn: the tile file is the only artwork source, scaled and
// rounded here.
//
// Deterministic: same input, same pixels. Run:
//   node scripts/gen-og-card.mjs
// The file name carries the version (sharetext-og-icon-v5.jpg) and that name is
// the ONLY cache-buster: the shipped URLs have no query string, because
// WhatsApp's image scraper has a long history of dropping an og:image that
// carries `?v=` — the link then previews with the old card while the URL itself
// still answers 200. If this artwork ever needs to change, bump the number in
// the name across index.html, public/guides/*.html, public/sw.js and
// scripts/seo-harden.mjs together, then re-pin scripts/verify-brand-assets.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tilePath = path.join(root, 'public/brand/logo-tile-white-on-orange.jpg');
const out = path.join(root, 'public/og/sharetext-og-icon-v5.jpg');

const W = 1200;
const H = 630;
/** Tile edge on the card, in px — the size in the owner's reference. */
const TILE = 280;
/** Corner radius as a share of the tile edge (the reference reads ~21%). */
const RADIUS = '21.4%';
/** JPEG quality: high enough to keep the mark's edges clean, small enough for
 *  WhatsApp's fetcher (budget in verify-brand-assets is 150 KB). */
const QUALITY = 92;

const tile = fs.readFileSync(tilePath).toString('base64');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${W}px; height: ${H}px; background: #ffffff; }
  .card {
    width: ${W}px; height: ${H}px;
    display: flex; align-items: center; justify-content: center;
    background: #ffffff;
  }
  .tile {
    display: block; width: ${TILE}px; height: ${TILE}px;
    border-radius: ${RADIUS};
  }
</style></head>
<body><div class="card"><img class="tile" alt="" src="data:image/jpeg;base64,${tile}"></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(200);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({
  path: out,
  type: 'jpeg',
  quality: QUALITY,
  clip: { x: 0, y: 0, width: W, height: H },
});
await browser.close();

const { size } = fs.statSync(out);
console.log(`wrote ${path.relative(root, out)} — ${W}x${H}, ${size} bytes (${Math.round(size / 1024)} KB)`);
console.log(`tile ${TILE}px, radius ${RADIUS}, on white, JPEG q${QUALITY}`);
