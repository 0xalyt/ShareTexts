// OG card generator — the 1200×630 link preview every social surface reads
// (X/Twitter, WhatsApp, LinkedIn, Slack, iMessage, Discord, Telegram).
//
// OWNER'S ARTWORK — DO NOT REDESIGN.
// The card is the owner's app tile exactly as supplied: the orange gradient
// rounded square with the white signal mark, centred on a white field, with
// nothing added — no headline, no lockup, no UI sketch, no decoration. An
// earlier revision replaced this with a designed card; that was a mistake and
// it is not to be repeated. If the artwork ever needs to change, it changes
// because the owner says so, not because a script or an agent prefers
// something else.
//
// The tile comes from the shipped brand asset (public/brand/logo-tile-white-
// on-orange.jpg) so the card can never disagree with the app icon.
//
// Deterministic: same input, same pixels. Run:
//   node scripts/gen-og-card.mjs
// The file name carries a version (sharetext-og-icon-v1.png) so X and friends
// refetch it instead of serving a cached copy of the retired artwork; bump the
// name and ?v= in index.html, public/guides/*.html, public/sw.js and
// scripts/seo-harden.mjs together.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tilePath = path.join(root, 'public/brand/logo-tile-white-on-orange.jpg');
const out = path.join(root, 'public/og/sharetext-og-icon-v1.png');

const W = 1200;
const H = 630;
const TILE = 280; // the square's side at card size
const RADIUS = 64; // iOS-style corner, ~23% of the side
const FIELD = '#ffffff';

const tile = fs.readFileSync(tilePath).toString('base64');
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${W}px; height: ${H}px; background: ${FIELD}; }
  .stage { width: ${W}px; height: ${H}px; display: flex; align-items: center; justify-content: center; }
  .tile {
    width: ${TILE}px; height: ${TILE}px; border-radius: ${RADIUS}px;
    overflow: hidden; -webkit-mask-image: -webkit-radial-gradient(white, black);
  }
  .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style></head>
<body><div class="stage"><div class="tile"><img alt="" src="data:image/jpeg;base64,${tile}"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(250);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();

const { size } = fs.statSync(out);
console.log(`wrote ${path.relative(root, out)} — ${W}x${H}, ${Math.round(size / 1024)} KB`);
