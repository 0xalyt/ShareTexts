# F41 — Landing: the second browser and an expiring shelf

## Scope and file purposes

Landing only. No net changes against main to hero media/player, supporting pages, in-app screens, signaling, transport, crypto, Worker or offline caching.

| File | Purpose of this change |
| --- | --- |
| `src/components/landing/BrowserCompatibility.tsx` | Explain cross-browser use; copy the current origin; disclose a website QR on request. |
| `src/components/landing/ProductDetails.tsx` | Replace only the decorative Space illustration with an explicitly labelled expiry preview. |
| `src/components/marketing/LandingSections.tsx` | Disclose temporary server storage; retain the actual Space creation callback. |
| `src/components/landing/landing-page.css` | Layout, focus, press, disclosure and example-state styles. |
| `src/lib/messages/{en,es,fr,de,pt-BR,pt-PT,hi,ja,zh-Hans,zh-Hant,ar}.ts` | Translate the 13 new landing strings in every shipped locale. |
| `scripts/verify-handoff.mjs` | Extend regressions for copying, denial, QR decoding, focus and expiry preview. |

## Decisions

| Before | After | Why |
| --- | --- | --- |
| Six browser labels without a next step | Browser explanation and current-site copy/QR utility | Reduce the effort of opening the second device; never create a room as a side effect. |
| Decorative floating sheets and clock | A sample note and link; While open / After expiry controls | Let visitors inspect what expiry means before creating anything. |
| Up-to-seven-days copy alone | Temporary-server-storage disclosure and code-sharing guidance | Distinguish Spaces from a live room; avoid an implied no-storage guarantee. |
| Static placeholder | Reversible, pointer-triggered opacity transition | Explain the change in availability, not decorate scrolling. |
| QR disclosure kept its Show label | Localized Show / Hide action and Escape-to-trigger focus return | Keep the visible action consistent with the current state. |

The existing Send action remains the primary orange action. No typing into a pretend composer, fabricated rooms, automatic progress, countdown urgency, testimonials or usage claims were added.

## Design references and psychology

- [Laws of UX](https://www.userinterface.wiki/laws-of-ux): Fitts's Law informs 44px control targets; Hick's Law informs optional QR disclosure rather than another initial choice.
- [Detail](https://detail.design/) and [Preet Suthar](https://preetsuthar.me/) are craft references for the interaction/copy pass, not imported visual assets. This report does not claim an exhaustive audit of those sites.
- The shelf makes expiry inspectable without an irreversible action. It never requests or stores the visitor's content.
- Existing type, neutral surfaces, orange action hierarchy, 4px spacing and 8/12/16/24px radii are retained. There is no new first-load choreography or motion dependency.

## Proof

The release implementation is in `BrowserCompatibility.tsx:16–80`, `ProductDetails.tsx:43–72` and the Space block in `LandingSections.tsx`. The actual creation callback still comes from the unchanged parent. The shelf's only local state is `open`/`animate`; its sample layers are hidden from the accessibility tree, with labelled controls and a live status alternative.

| Check | Result / evidence |
| --- | --- |
| `npx tsc --noEmit` after each implementation/integration commit | Passed. |
| `npm run build` | Passed; `audit/tmp/landing-life-build.log`. |
| `npm run verify:bundle` | Passed; entry 176.5 KB gzip against 180 KB budget, below the 177 KB working target; `audit/tmp/landing-life-bundle.log`. |
| `npm run smoke:local` | Passed production-server pairing, text, link and origin checks; `audit/tmp/landing-life-smoke.log`. |
| `npm run verify:handoff` | Passed English, Spanish and Arabic at 320/360/390/1440px, plus existing guide, film, keyboard and settings regressions; `audit/tmp/landing-life-handoff.log`. |
| QR pixels | Regression decodes the rendered 144px website QR to the current origin, not a fabricated room. |
| `git diff --check` | Passed. |
| `node scripts/verify-locales.mjs` | Existing main failure: German `home.live` is `Live`, identical to English and absent from the English-copy allow-list. Both values are unchanged on main and this branch. All newly added keys are translated and the full dictionaries typecheck. |

The automated Space-CTA assertion now targets `landing-open-space` rather than an ambiguous button selector because the section gained two preview buttons. It still verifies that the real creation form opens; no assertion was removed.

The first pre-push layout gate caught the new browser section's 24px desktop heading below the 30px minimum. The desktop rule is corrected to 32px on the existing 4px scale; the 24px phone treatment remains. The gate is unchanged. Final re-run output is kept in `audit/tmp/landing-life-push.log`.

## Recorded production-build UI verification

[Replacement walkthrough](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=d3e2e8ac-6013-43f3-bb32-ef7a44071d44), on implementation `5f7d82a` in an isolated local production build. This is not a claim that this pass was live at recording time.

Fresh idle English desktop 1440px and phone 390px, plus Arabic RTL 320px, showed Send/Receive without an active room or overlay. The recording covers the Show/Hide correction, actual clipboard contents, browser-enforced clipboard denial, Escape/focus, reversible shelf, keyboard behavior and the real creation form. No room/Space creation requests came from the preview, copy or website QR.

The preceding full run additionally inspected 768/1024px, dark mode, reduced motion, guide keyboard selection and film pause/resume. No horizontal or inspected text overflow was observed. Screenshots: `/home/ubuntu/screenshots/life-fixed-desktop-qr.png`, `life-fixed-desktop-space-open.png`, `life-fixed-desktop-space-expired.png`, `life-fixed-en-390-hero.png`, `life-fixed-ar-320-qr.png`.

## QR loading finding

The QR is not mounted until requested. The shared renderer can still download before that: unchanged `SingleScreenApp.tsx:108–109,2381–2382` mounts the Space sheets, `SpaceView.tsx:23` imports `QrArt`, and `public/sw.js:51–78` precaches dynamic chunks. These files match main. Altering application startup or offline caching is outside this landing slice; no network-deferral claim is made.

## Setup-note plan

Keep dependency maintenance and the dev startup command unchanged. Add one production-QA knowledge entry to the existing repo blueprint: build first, then run `NODE_ENV=production PORT=3013 node dist/server.cjs` in the foreground, using a free port if occupied. This is documentation only, not an automatically started server.

## NOT VERIFIED

Physical Android/iOS devices, native Safari, screen-reader audio, physical-camera QR scans, physical-device performance, human review of every translation and real seven-day Space expiry. The preview is not a transfer/expiry integration test. Real local sharing smoke is separate.

## Owner questions and next step

No owner decision is required for this landing implementation. Finish PR checks, merge under the standing owner instruction, confirm the build marker and new interactions on production. Track the existing German `Live` allow-list failure and shared-chunk startup behavior separately; neither is changed here.
