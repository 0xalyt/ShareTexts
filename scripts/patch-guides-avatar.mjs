#!/usr/bin/env node
/**
 * Put the maker's real portrait into the STATIC guide pages' footers.
 *
 * The guides are hand-written HTML (not React), so they never picked up the
 * XProfileLink component: 24 pages still showed a "@" monogram and a bare
 * "@0xalyt" text link while the app's own footers showed the face. Idempotent:
 * re-running it rewrites the same markup, and it skips pages already patched.
 *
 *   node scripts/patch-guides-avatar.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = 'public/guides';
const SRC = '/brand/maker-garv.webp?v=2';

const AVATAR = (size, ring) =>
  `<img src="${SRC}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" ` +
  `style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;flex:0 0 auto;` +
  `box-shadow:0 0 0 1px ${ring}" />`;

// The card glyph: <span style="…">@</span>
const CARD_GLYPH = /<span style="width:44px;height:44px;border-radius:999px;background:var\(--bg-secondary\)[^"]*">@<\/span>/g;

// The footer bottom link: <a href="https://x.com/0xalyt" …>@0xalyt</a>
const FOOTER_LINK = /<a href="https:\/\/x\.com\/0xalyt" target="_blank" rel="noopener noreferrer">@0xalyt<\/a>/g;

let changed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
  const path = `${DIR}/${file}`;
  const before = readFileSync(path, 'utf8');
  let after = before;

  after = after.replace(
    CARD_GLYPH,
    AVATAR(44, 'rgba(0,0,0,0.10)'),
  );

  after = after.replace(
    FOOTER_LINK,
    `<a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer" title="Maker: Garv — @0xalyt" ` +
      `style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:inherit;min-height:32px">` +
      `${AVATAR(24, 'rgba(0,0,0,0.10)')}<span>@0xalyt</span></a>`,
  );

  if (after !== before) {
    writeFileSync(path, after);
    changed++;
  }
}
console.log(`[guides-avatar] ${changed} page(s) updated`);
