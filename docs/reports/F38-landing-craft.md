# F38 — Landing craft and command-label rendering

## Scope and decisions

The landing keeps the existing handoff media component. The hero-film replacement is a separate change. No transport, signaling, crypto, worker or storage behavior changed. The only task-screen change makes the Temporary Space empty-state hint follow the existing upload capability.

- Send is the primary filled action; Receive is secondary. Header, hero, utility field and scroll sections share alignment and spacing rules.
- Below-fold illustrations explain code pairing, received content and an expiring shelf. They are illustrations, not fake controls or live session state.
- Browser names and licensed marks form a static list, not a moving marquee. The asset source and MIT notice ship alongside the SVGs.
- Title suffix, screen-reader heading and story copy use the existing locale dictionaries. Illustrative pairing digits stay left-to-right in Arabic.
- Command labels update synchronously. They do not exit, fade or interpolate their foreground/background while the user types. Hover colors retain small-text contrast.
- Theme switches on the landing flip the existing root snapshots without blur/crossfade, keeping functional labels readable. Task-screen theme motion is unchanged.
- Existing Allo/system typography, brand orange, glossy action treatment and hero-media behavior are retained.

## Changed files

| Files | Change |
|---|---|
| `src/components/landing/landing-page.css` | Landing hierarchy, surfaces, responsive layout, theme overrides, action contrast and snapshot rules. |
| `src/views/SingleScreenApp.tsx` | Landing-only header and brand hooks; existing media rendering preserved. |
| `src/components/ShuffleHeading.tsx` | Localized visible suffix and stable screen-reader heading. |
| `src/components/IntentField.tsx` | Synchronous glyph/label/hint rendering; logical input padding. |
| `src/components/landing/ProductDetails.tsx` | Pairing, transfer and Temporary Space illustrations. |
| `src/components/landing/BrowserCompatibility.tsx` | Named static browser list. |
| `src/components/marketing/LandingSections.tsx` | Product illustrations, Space story and FAQ layout. |
| `src/lib/messages/{en,es,fr,de,pt-BR,hi,ja,zh-Hans,ar}.ts` | New story/title keys and localized copy. |
| `src/views/SpaceView.tsx` | Capability-aware text-only empty-state hint. |
| `public/browsers/{chrome,safari,firefox,edge,brave,samsung-internet}.svg` | Browser marks. |
| `public/browsers/{LICENSE.txt,SOURCES.md}` | License, pinned upstream source and trademark attribution. |
| `scripts/verify-handoff.mjs` | Light/dark command-name agreement, label bounds and composed contrast sampled over 12 animation frames per input/hover state. |

Generated layout-gate screenshots are not part of the change.

## Proof

[Replacement recorded walkthrough](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=79ed82b6-853e-40a9-a997-157492b31048).

The recorded Chromium walkthrough verifies fresh dark empty input, text/code/clear in both themes, theme switching, return from Send/Receive, real room-code generation, Space creation, six browser marks, keyboard FAQ, mobile source order, Arabic digits and reduced-motion playback. Captured input-transition frames measured at least 5.24:1; composited theme-switch frames kept the empty label visible, at least 11.14:1. The final hover adjustment is additionally covered by the automated matrix.

Current full-viewport captures (also attached to the review handoff):

- `/home/ubuntu/screenshots/sharetexts-release-craft-light-1440.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-dark-1440.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-mobile-390.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-mobile-320.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-story-1440.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-rtl-story-1440.png`
- `/home/ubuntu/screenshots/sharetexts-release-craft-space-empty-1440.png`

Shell verification logs are retained in the session:

| Check | Proof |
|---|---|
| TypeScript | `npm run lint` and post-commit `npx tsc --noEmit`. |
| Handoff matrix | `/home/ubuntu/craft-handoff-final.log`, `/home/ubuntu/craft-handoff-firefox.log`, `/home/ubuntu/craft-handoff-webkit.log`. |
| Production build, pairing, text and link transfer | `npm run smoke:local`; `/home/ubuntu/craft-smoke-final.log`. |
| Privacy/product claims | `npm run verify:claims`; `/home/ubuntu/craft-claims-final.log`. |
| Worker regression | `npm run worker:typecheck`; `npm run worker:test`: 103 passed, zero failed; `/home/ubuntu/craft-worker-final.log`. |
| Entry budget and layout | Unskipped `.githooks/pre-push` runs `verify:bundle` and `verify:layout` (desktop, sheets, no-flash, room-paint, basics); `/home/ubuntu/craft-push-final.log`. |

## Pre-existing sharing failures

The unchanged baseline `b95112c74079ff836271060810c2e91c67dfb4a3` reproduced Firefox post-rejoin message delivery/file-queue completion failures and WebKit pairing timeout before the composer. Proof from the earlier baseline comparison: `/home/ubuntu/e2e-firefox-baseline.log`, `/home/ubuntu/e2e-webkit-baseline.log`. These were disclosed in [the preceding rebuild PR](https://github.com/0xalyt/ShareTexts/pull/2). They are not repaired here; sharing fixes are a separate workstream. No merge-gate bypass is requested.

## NOT VERIFIED

- Production rollout of this review branch; it is not merged.
- Native Safari/iOS, physical-device transfers and low-end-device performance. Linux WebKit is not a native Safari result.
- Screen-reader audio, all translated copy with native speakers, Save-Data and hidden-tab suppression.
- Full sharing failure/recovery matrix beyond the local two-profile pairing/text/link smoke.
- Theme animation on task screens; only the landing override was retested.

## Owner questions

None blocking. Review and merge only after accepting this craft pass; keep the hero-film replacement separate.

## Next

Reconcile the separate hero-film change at review/merge time without restoring the old layout. Validate native devices and the remaining sharing/recovery cases in their own scope.
