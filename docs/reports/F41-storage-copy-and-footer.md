# F41 — Storage copy and footer consistency

## Scope

The shared footer and static About footer now use the same navigation, blurb,
platform line and storage-neutral promise: “No app · No account · Your devices.”
The footer language control reuses the existing viewport-safe language sheet,
rather than opening a dropdown below the bottom of a 320px screen.
At narrow widths the home-linked brand replaces the redundant back arrow,
leaving the complete localized page label visible without an ellipsis. The
theme glyph is 20px at the prescribed 1.5 stroke, inside its 44px touch target.

The audit covers the app, all 11 locale dictionaries, Docs, static guides,
search-page generators, SEO metadata, `llms.txt`, and legacy film source text.
The visible landing FAQ now includes the localized privacy/storage answer.
Legacy `/docs#security` links select the current Privacy & Security chapter.
The landing film binary and storage behavior are unchanged by this follow-up.

## Copy model

| Mode | Accurate distinction |
| --- | --- |
| Live rooms | Encrypted in transit, direct when possible, with encrypted relay fallback. The service issues the room secret: not zero knowledge. Live-room content is not stored server-side. |
| Temporary Spaces | Text and links are stored server-side until closed or expired, for a chosen lifetime of 6 hours to 7 days. |
| Saved items | Browser-local until removed or site data is cleared; no cross-device sync. |
| Service metadata | Room state and connection metadata are distinct from content storage. |

Competitor-specific statements remain when they describe that competitor, not
ShareTexts. The audit does not change the product's data handling or promise
stronger encryption than the implementation provides.

## Regression protection

- Expanded forbidden storage-claim variants and audited source scopes.
- Added representative positive and negative claim fixtures: 23 checks pass,
  including the stale Traditional Chinese “close the tab, everything vanishes” claim.
- Added `verify-footer.mjs` to `npm run verify:claims` for shared/About parity,
  explicit audited locale keys, static guide promises and footer language mode.
- Deliberate blurb, navigation, guide-promise and locale-key drift fixtures were
  rejected by the parity gate before being restored.

## Verification

Passed after integrating the latest main:

- `npm run lint`
- `npm run verify:claims`
- `node scripts/verify-locales.mjs`
- `npm run smoke:local` (includes production build and transfer smoke)
- `npm run verify:bundle`
- `npm run verify:layout`
- `git diff --check`

## Recorded browser checks

[Final all-locale 320px recording](https://app.devin.ai/sessions/dda0462d4ad34518b63018a709ec3ae1?testRecording=68d99929-feb3-4add-af31-39db1a4a7d2a).

All 22 Docs header states (11 locales, light/dark) passed at verified 320 CSS px:
full page labels without ellipsis or clipping, no root overflow, 44px theme
targets, settled 20px glyphs, and working theme changes. Footer language-sheet
Escape/focus return and the Traditional Chinese three-mode FAQ also passed.

Earlier focused runs verified Docs/About footer parity at 1440, 768, 390 and
320px in both themes, Privacy/Terms shared footer, all 11 locale promises, static
guide claims, all internal About footer links and About without JavaScript.
The initial clipped language dropdown and duplicated label were replaced/fixed
before the final approval. Generated audit screenshots are not committed.

CI and production rollout are tracked on [PR #11](https://github.com/0xalyt/ShareTexts/pull/11).
Native Safari/iOS and translation review by native speakers remain unverified.
