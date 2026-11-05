# First load: before and after (P7 STEP 1)

Measured on a production build (`npm run build`), gzip per file, on this
machine. `npm run verify:bundle` reproduces the "after" table from `dist/`.

## Headline

| | before (`e1e2d47`) | after | change |
| --- | --- | --- | --- |
| entry chunk (`index-*.js`) | **306.1 KB** gzip | **213.5 KB** gzip | −92.6 KB (−30%) |
| chunks in `dist/assets` | 5 js | 20 js | +15 |
| total JS | 517 KB gzip | 520 KB gzip | +3 KB (nothing was deleted, only deferred) |
| dictionaries in the entry | 10 of 10 | 0 of 10 | — |
| `modulepreload` links | 4 | 4 | unchanged (see below) |
| first-load requests | 5 js | 6 js (entry + 4 vendor + the active locale) | +1 |

The total did not move: this step moved bytes off the critical path, it did
not delete any. The entry lost the ten non-English dictionaries (about 92 KB
gzip of code after minification) and the shell around them.

## Why the dictionaries were in the entry

`src/lib/i18n.tsx` imported all eleven dictionaries statically. Making those
imports dynamic was not enough, because `src/lib/messages/meta.ts` imported
every dictionary to read one string from each — its `STATUS`. Rollup keeps a
module that is both statically and dynamically imported in **both** graphs, so
the dictionaries stayed in the entry even after `i18n.tsx` stopped importing
them (measured: 1042.9 KB raw before the change, 1044.9 KB after — the change
had done nothing).

Fix: `scripts/gen-locale-status.mjs` reads each `STATUS` line at build time and
writes `src/lib/messages/status.generated.ts`. `meta.ts` imports that constant.
The rule from DESIGN §17 — a locale's status lives in the locale file — is
unchanged; only the reader moved. `verify:bundle` fails if the generated file
is stale, so the two cannot drift.

## What is inside the entry now (top 20 modules, gzip of module code)

Sum of per-module gzip over-counts the chunk (each module is gzipped alone);
use it for ranking, not for totals.

| # | module | gzip |
| --- | --- | --- |
| 1 | `cjs/react-dom-client.production.js` | 93.2 KB |
| 2 | `otpauth/dist/otpauth.esm.js` | 19.8 KB |
| 3 | `SingleScreenApp.tsx` | 18.3 KB |
| 4 | `tailwind-merge/dist/bundle-mjs.mjs` | 16.5 KB |
| 5 | `webrtc.ts` | 12.6 KB |
| 6 | `qrcode-generator/dist/qrcode.mjs` | 10.9 KB |
| 7 | `en.ts` | 10.8 KB |
| 8 | `SpaceView.tsx` | 10.6 KB |
| 9 | `SessionContext.tsx` | 8.4 KB |
| 10 | `messageEngine.ts` | 6.7 KB |
| 11 | `HeroDeviceDemo.tsx` | 6.6 KB |
| 12 | `NearbyDevices.tsx` | 6.1 KB |
| 13 | `CommandBar.tsx` | 6.0 KB |
| 14 | `SavedItemsOverlay.tsx` | 5.5 KB |
| 15 | `cloudflareSocket.ts` | 4.7 KB |
| 16 | `SettingsOverlay.tsx` | 4.7 KB |
| 17 | `NearbyDetectOverlay.tsx` | 4.0 KB |
| 18 | `nearby.ts` | 3.9 KB |
| 19 | `App.tsx` | 3.7 KB |
| 20 | `uploader.ts` | 3.4 KB |

## The five modules left, and what each one needs

1. **`react-dom-client` (93.2 KB)** — not removable, only movable. It is a
   separate `vendor-react` chunk today only for `react`, not `react-dom/client`,
   which lands in the entry. Splitting it makes the *number* look better
   without making the first load smaller, so it is deliberately not done.
2. **`otpauth` (19.8 KB)** — the TOTP engine. The landing hero shows a live
   pairing code, so this is genuinely first-paint work. Removing it from the
   entry means the demo shows a static code until the chunk lands, which is a
   design decision, not a bundling one.
3. **`SingleScreenApp.tsx` (18.3 KB)** — the app's own shell and landing. This
   is the code that is supposed to be here; the next cut is STEP 1c (the
   below-the-fold landing), not a library.
4. **`tailwind-merge` (16.5 KB)** — `cn()` merges Tailwind classes at runtime
   for 58 files. Replacing it means re-implementing conflict resolution for the
   utility set the app actually uses; a wrong merge is a visual bug that no
   gate here would catch. Not attempted blind.
5. **`webrtc.ts` (12.6 KB)** — the transfer engine, imported by
   `SessionContext` and `messageEngine`. Lazily loading it means the room's
   first byte waits for a second chunk; that is STEP 2 territory (the room
   rewrite), and it touches the transfer path this prompt protects.

## Not done in this step

- **1c below-the-fold landing chunk**: not started.
- **1d lazy overlays** (Settings 4.7, Saved 5.5, Nearby 6.1 + detect 4.0):
  not started. Each of those overlays is mounted permanently and driven by an
  `open` prop, so making them lazy needs conditional mounting and a
  replacement for their exit animation — a UX change that has to be looked at,
  not just measured.
- **1e vendor-motion (47.1 KB)**: it is already its own chunk and is on the
  landing's critical path (the hero demo). `LazyMotion` + `domAnimation` would
  cut it to roughly half, but it means converting `motion.*` to `m.*` across
  the landing files.
- **1f modulepreload**: the four preloads point at `vendor-react`,
  `vendor-motion`, `vendor-icons` and `vendor-socket`; all four are static
  imports of the entry, so removing a preload only delays a fetch that is
  already required. `vendor-socket` could become a lazy chunk — that is the
  signaling client, and the prompt puts signaling out of bounds.
- **The 180 KB budget is missed by 33.5 KB.** `npm run verify:bundle` prints
  FAIL with the exact number rather than passing a rounded one.
