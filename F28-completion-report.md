# F28 — apple-grade pass: tokens, type, landing structure, OG refresh, testid-proof nearby gate

Date: 2026-10-20 · Scope: Phases 0–5 of the apple-grade plan as committed, plus the OG artwork
refresh and the nearby E2E selector repair. Branch: `design/apple-grade` — 9 commits ahead of
`main`, pushed to https://github.com/0xalyt/ShareTexts.

## 0. Before / after

| Area | Before | After | Evidence |
|---|---|---|---|
| Colour | warm-tinted neutrals, mixed greys | pinned light/dark tokens (#fbfbfd/#181818 palettes), warmth gate in CI | commit `7fe0513`, `docs/design-tokens.md` |
| Type | multiple font stacks/ladders | self-hosted Inter 4 variable + system SF fallback, one type ladder, hero 56/64 | commit `af7911c`, `764ff7b` |
| Icons | lucide + @gravity-ui + Apple emoji art | lucide-react only, Unicode emoji | commit `af7911c` |
| Landing | short page, no tail | full scroll tail, copy in i18n dicts, feedback moved to settings | commit `261fe37` |
| Claims | overstated crypto/privacy wording | `docs/claims.md`: 6 TRUE / 6 OVERSTATED / 2 FALSE / 1 UNVERIFIED, all strings fixed to match | commit `5011be8` |
| OG card | 69 KB icon-grid card, `?v=20` | 18,334 B ember app-icon card, `?v=21` in all 49 refs, new alt text | commit `20fdab8`, `public/og/sharetext-og.jpg` |
| Nearby gate | selectors pinned to old "Nearby" copy — 0 rows matched, gate red | `data-testid` hooks + testid selectors, i18n-proof label assertion | commit `97a93a0`, 17/17 PASS |

## 1. Phase 0 — audit (no edits)

- Screenshot matrix: `docs/audits/shots-coreflow/` (light/dark, 390×844, 1440×900, reduced-motion still, RTL).
- Baselines: `docs/p0-baselines.md` — LCP 640 ms, CLS 0.000 @390, entry JS 276 KB gzip,
  `vendor-motion` 49 KB (static import in `main.tsx`), `vendor-icons` 6 KB. INP not instrumented.
- Slop inventory: `docs/slop-inventory.md` with KEEP/REPLACE/KILL verdicts per element.

## 2. Phase 1 — truth pass

- `docs/claims.md`: 15 claims audited — 6 TRUE, 6 OVERSTATED, 2 FALSE, 1 UNVERIFIED.
- Crypto wording corrected to what the code does (key derives from the server-issued room
  secret). Protocol/crypto untouched, per plan. The 1 UNVERIFIED item is listed for owner decision.
- Housekeeping done: `Alightttt` → `0xalyt` on all live surfaces (8 refs remain only in
  `dist/` build output — regenerated each build — and in F26/F27 archive reports, kept per
  `docs/claims.md` line 41). Package renamed `react-example` → `sharetexts`.
  Remote already points at `https://github.com/0xalyt/ShareTexts.git`.

## 3. Phases 2–5 — committed by this branch

- Phase 2 (`7fe0513`): apple-grade neutral tokens, ember ink AA on light, warmth gate.
- Phase 3 (`af7911c`): Inter 4 self-hosted (Latin woff2, `font-display: swap`), lucide-only,
  Unicode emoji (no `react-apple-emojis`).
- Phase 4 (`764ff7b`): one type ladder, hero display 56/64.
- Phase 5 (`261fe37`): full scroll tail, copy moved to i18n, feedback moved to settings.
- Worker (`b8ab804`): allow dev (3012) + prod-verify (3013) origins.

## 4. This pass — OG refresh + nearby gate repair (commits `20fdab8`, `97a93a0`)

- OG card replaced byte-exact (JPEG data despite the `.png` source name — kept the `.jpg`
  URL, 1200×630, `image/jpeg`): hash `7c2bab14…`, 18,334 B.
- `?v=20` → `?v=21` in 49 refs: `index.html` (og:image, twitter:image, JSON-LD
  `image` + `screenshot`), all 21 `public/guides/*.html`, `scripts/seo-harden.mjs` hub template.
  Zero `v=20` refs remain in source or `dist/`.
- Alt text (`og:image:alt` + `twitter:image:alt`) now describes the new card.
- Brand gate updated, not weakened: the `ink` (dark-pixel) assertion matched the OLD artwork
  (0 dark px on the new card, 3,396 ember px). Replaced with ember-glyph-present (>200 px) +
  horizontally-centered bbox checks; dead `ink` predicate removed. 22/22 green.
- Nearby E2E: root cause was copy drift (badge reworded to "Available"), not a product bug —
  the WS frames and list state were correct all along. Added `nearby-devices` /
  `nearby-device-row` testids and pinned all 5 row selectors; label assertion now checks
  device label + badge without asserting badge wording.
- Service-worker precache left as `/og/sharetext-og.jpg` (path-keyed, now serves new bytes).

## 5. Verification (this tree, exit codes captured)

| Check | Result |
|---|---|
| `npm run build` (+ seo-routes prerender) | ✓ exit 0 |
| `npx tsc --noEmit` | ✓ exit 0 |
| `verify-brand-assets` | ✓ 22/22 |
| `verify-seo` (production server) | ✓ 114/114 |
| `verify-quality` | ✓ 17/17 (`swPrecachesOg: true`) |
| `verify-nearby-browser` (2 live pairs + decline path) | ✓ 17/17, 0 console errors |
| `verify-mobile-ui` | ✓ all green |
| `verify-theme` | ✓ |
| `verify-landing-onescreen` (7 viewports) | ✓ 0 failing |
| `verify-visual-system` | ✓ (was 7/8 at F27; the raw-hex failure is gone) |
| `test:protocol` | ✓ 0 page errors |
| `worker:test` | ✓ 103/103 |

All run against the local production build on `:3010`.

## 6. Deliberately NOT done

- **Protocol/crypto**: untouched (stop condition (a)). The UNVERIFIED claim stays for the owner.
- **Phase 5 budgets not met**: entry JS is 276 KB gzip vs the 110 KB budget; `vendor-motion`
  is a static import (plan asks for lazy motion). No Lighthouse CI (`lighthouserc` absent),
  no Redmi 9 USB measurement (no device here), INP still not instrumented.
- **Phase 6 not started**: no new content pages, no SERP teardown, no Search Console data,
  no 3 title options, no robots.txt AI-crawler decision in this report.
- **Phase 7 additions absent**: no Playwright multi-browser screenshot matrix
  (CI has Chromium E2E + audit only), no `@axe-core/playwright`, no Lighthouse CI budgets,
  no contrast script beyond existing gates, no `npx license-checker --summary` run.
- **Maestro flows**: not run (no Android device/emulator in this environment).
- **Screenshots for this pass**: OG card verified visually via live browser against
  `:3010`; the committed Phase 0 matrix is in `docs/audits/shots-coreflow/`.
- Vercel preview URL: not obtainable from this machine (no Vercel auth here).

## 7. Open risks

1. 276 KB entry gzip > 110 KB budget — CI cannot fail on it yet (no Lighthouse CI).
2. All gate numbers are from the local production build; `https://sharetexts.online` re-run
   is pending merge + owner approval.
3. 8 `Alightttt` refs persist in `dist/` (regenerated) + 2 historical report archives.
4. 1 UNVERIFIED claim (crypto) awaits owner decision; wording currently honest but partial.
5. `vendor-motion` static import makes lazy-loading work unstarted.

## 8. Git

Branch `design/apple-grade`, 9 commits ahead of `main`, pushed to
`origin` (https://github.com/0xalyt/ShareTexts). PR creation link returned by the remote:
https://github.com/0xalyt/ShareTexts/pull/new/design/apple-grade. No push to `main`, no
production deploy — both await owner approval per plan.
