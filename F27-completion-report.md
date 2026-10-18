# F27 — OG image rollout, "AirDrop for everyone" landing title, larger header logo

Date: 2026-10-18 · Scope: link-preview artwork everywhere, landing tab title, header lockup size.

## 1. OG image — installed everywhere

- **New artwork**: the supplied 1200×630 image (faded grid of OS/browser/phone-brand icons,
  orange ShareTexts app icon centered, "ShareTexts" wordmark below) is installed byte-exact as
  `public/og/sharetext-og.jpg` (69 KB — the file was JPEG data despite its `.png` name, so it
  keeps the existing `.jpg` URL and `image/jpeg` type; dimensions match the OG spec exactly).
- **Every reference now serves the new art with a fresh cache-buster**: `?v=18` → `?v=19` in
  `index.html` (og:image, twitter:image, twitter:image:src, JSON-LD `image` + `screenshot`),
  all 21 `public/guides/*.html` pages, and the `scripts/seo-harden.mjs` hub template. The
  guides had shipped the old `?v=18` everywhere — link previews on all of them now flip to the
  new artwork when this deploys.
- **Alt text updated** (`og:image:alt` + `twitter:image:alt`): now describes the actual image —
  "The ShareTexts app icon among the phones, laptops, and browsers it works with."
- **Prerendered routes inherit it**: `scripts/seo-routes.mjs` derives `/docs`, `/privacy`,
  `/terms`, `/404` heads from `dist/index.html`; verified the built shells carry `?v=19` with
  their own per-route titles intact.

## 2. Landing page title — "AirDrop for everyone"

- `<title>` on the main landing URL is now **`AirDrop for everyone — ShareTexts`**
  (the brand suffix keeps the SEO/title contracts that require the product name in the tab).
  `og:title` and `twitter:title` on the landing match, so shared links say it too.
- **Only the landing changed.** Verified in the production build:
  `/docs` → "ShareTexts Docs — How Device Sharing Works", `/privacy`, `/terms`, `/404` keep
  their own titles; guide pages keep theirs; room tabs keep the live-state titles
  (`roomBadge` fully replaces the title in-room and restores the landing title on exit).
- `scripts/verify-toggle-desktop.mjs`'s title contract was updated to pin the new landing
  title exactly (it previously pinned "Between Devices"; the new assertion is equally strict).

## 3. Header logo — increased

- The landing header lockup (`BrandLockup`, full size) stepped up: **mark 30→34 px, wordmark
  27→31 px** on `sm+` (mobile: 25→28 / 23→26). Ink heights of mark and word stay equal within
  the component's measured 0.6 px contract; the geometry docstring was updated to the new
  numbers.
- Header band height is unchanged (the 40 px tap-floor still dominates), so no layout shift —
  confirmed by the one-screen landing suite at all 7 viewports.
- Docs / Legal / 404 headers use the `compact` variant (18 px mark) and are intentionally
  untouched.

## 4. Logo & PWA icon status (no change needed this pass)

- Favicons (16/32/48 + `favicon.svg`), `apple-touch-icon.png`, `icon-192/512.png`,
  `icon-maskable-192/512.png` and `manifest.json` already ship the orange monoline glyph from
  the earlier artwork-icon pass, referenced with `?v=19`/`?v=20` cache-busters.
  The OG image was the last stale piece of brand artwork; it is now aligned with the same icon.

## 5. UI/UX pass

- Header verified in **light + dark** and at **desktop (1600 px) and mobile (390 px)** widths:
  lockup reads at the new size, no overlap with the header controls, no height change,
  gap rhythm intact (`desktop-header-gaps-tight` PASS).
- Console: no errors. Only the pre-existing dev-server font-preload warning (Geist woff2),
  which predates this work and does not appear in production bundles.
- Bug fixed along the way: the 21 guide pages still pointed previews at the old OG artwork
  under `?v=18` — all bumped to `?v=19`.

## 6. Verification

| Check | Result |
|---|---|
| `npm run build` (+ seo-routes prerender) | ✓ |
| `npx tsc --noEmit` | ✓ |
| `verify-brand-assets` | ✓ 17/17 |
| `verify-toggle-desktop` (incl. new title pin) | ✓ all PASS |
| `verify-landing-onescreen` (7 viewports) | ✓ 0 failing |
| `verify-theme` | ✓ |
| `verify-mobile-ui` | ✓ |
| `verify-seo` vs production server (dist) | ✓ 114/114 |
| `verify-visual-system` | 7/8 — the one failure is the pre-existing raw hex in `NearbyDetectOverlay.tsx` (in-flight Nearby work, unrelated to this pass) |

## 7. Git

Everything in the workspace (this pass plus the previously pending brand/verification work)
is committed and pushed to `origin/main` (https://github.com/Alightttt/ShareTexts).
