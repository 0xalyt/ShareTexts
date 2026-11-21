# F42 — One reading shell and honest language availability

## Diagnosis

Docs was not missing a locale bundle. Its chapter labels, prose, steps and code feedback are hard-coded English in every locale. Only the surrounding application controls were translated. About also used a separate static header/footer implementation, so matching copy did not produce matching geometry or controls.

## Changes

| Before | After | Why |
| --- | --- | --- |
| Static About footer with its own CSS and credit | The actual `SiteFooter`, shared with Docs and Legal | Typography, platform dot, spacing, language sheet and maker avatar cannot drift independently |
| Separate About header/theme implementation | `PageHeader` in the existing app shell | Same brand, locale, theme persistence and accessible controls |
| Translated Docs label above unexplained English prose | Explicit English-only notice in each of the 11 locales | Disclose availability instead of suggesting a translated guide |
| English guide navigation inherited Arabic direction | Entire guide declares `lang="en" dir="ltr"` | Correct reading order and screen-reader voice while chrome stays localized |
| Simplified header/footer strings inherited in Traditional Chinese | Explicit Traditional Chinese navigation/footer overrides | Match the selected script without translating legal prose |

About copy lives once in `src/views/about-content.html`, imported by the React view and the build-time crawlable shell. The old static HTML/CSS/theme script are removed. The legacy `/guides/about.html` URL redirects permanently to `/about`; Vercel and the Node server serve the new SEO shell at the canonical URL. The About shell retains one hero, one H1, a canonical URL and AboutPage structured data without JavaScript.

`verify-footer` requires the actual shared footer on About, the canonical routing/redirect, explicit locale notices and Traditional Chinese navigation overrides. Server CSP pin discovery now reads the surviving guides index rather than the deleted About HTML; no CSP policy is weakened.

Review caught the transfer capability gate blocking the newly app-rendered About when WebRTC is disabled. Reading routes now bypass that transfer-only gate, while the landing/transfer flow still explains unsupported browsers. The handoff regression suite reproduces the blocked About before the fix and checks all four reading routes plus the retained transfer gate in each CI browser engine.

## Evidence

- `npm run lint`, `npm run verify:claims` (23 claim fixtures), `node scripts/verify-locales.mjs`, `npm run build`, CSP pin check and `npm run verify:bundle` passed.
- `npm run smoke:local` passed pairing, text/link handoff, share-card and console checks.
- Fresh local production-mode Chromium: matching 1440px English Docs/About footers in both themes, including computed typography, grid/row spacing, horizontal positions and 446.39px height.
- All 22 Docs states (11 locales × light/dark) passed at 320 CSS px: complete labels, no root overflow, 44px theme targets and settled 20px glyphs.
- pt-PT disclosure/header, Traditional Chinese labels/footer, Arabic RTL chrome with English LTR prose, About language sheet pointer/Escape/focus return, theme persistence, keyboard skip, direct/link entry, legacy redirect and no-JS shell passed.
- [Recorded verification](https://app.devin.ai/sessions/dda0462d4ad34518b63018a709ec3ae1?testRecording=d4ed533f-c62f-49dd-8a1a-66d6e6311b34).

## Not verified

Native Safari/iOS and native-speaker translation review. Full Docs translation remains unimplemented and is now disclosed; legal meaning and legal-page prose are unchanged. CI, merge and production confirmation are pending at report creation.

## Questions and next step

No owner decision is required. Merge after CI and layout checks, then confirm the canonical About route, exact footer parity and language disclosure on production. Generated layout screenshots are excluded from the commit.
