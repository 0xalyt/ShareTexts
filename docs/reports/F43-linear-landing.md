# F43 — Linear landing and browser-logo marquee

## Request and boundaries

Heading → sharing actions → film at every width, not a desktop split. Gray browser logos without visible names. No visible film caption, watch or download links. Film content/assets/rendering, global typography/motion, supporting pages and sharing transport remain with their owners.

## Files changed

- `src/views/SingleScreenApp.tsx`: one hero/player placement in source order on phone and desktop.
- `src/components/landing/landing-page.css`: centered desktop hierarchy, 60/64px heading, 64px desktop actions, larger landing brand presentation, full-width film, browser ticker, static reduced-motion layout.
- `src/components/landing/BrowserCompatibility.tsx`: eight logo marks, accessible original set and two hidden repeats, pause/resume, offscreen/page-hidden suspension; copy/QR behavior retained.
- `src/components/HeroLaunchFilm.tsx` and `src/components/landing/hero-film.css`: remove visible footer/links and unused styles, retain hidden description, 16:9 frame and playback hooks.
- `src/lib/messages/*.ts`: browser heading localized in all eleven shipped dictionaries.
- `public/browsers/{opera,vivaldi}.svg` and `SOURCES.md`: two unmodified assets from the existing pinned Browser Logos source; XML parsed successfully.
- `scripts/verify-handoff.mjs`: hidden media description, logo-only compatibility, linear laptop geometry, version-independent light/dark media family checks; landing navigation waits for DOMContentLoaded plus actual mounted UI.
- `scripts/verify-basics.mjs`: count a contained marquee's clipping viewport rather than its intentionally off-canvas duplicate as phone overflow. Other element geometry checks remain.

## Decisions and references

- Fitts's law: desktop sharing actions are 64px high; marquee control is 44px. Film controls have a 48px desktop target, 44px phone target and a smaller visible disc.
- Hick's law / Von Restorff: Send stays the only filled orange primary action. Browser names are not extra text choices.
- Reading order is the visual order; one film instance rather than responsive duplicate players.
- No entrance animation. A constant-speed CSS transform moves the requested marquee; it stops manually, on hover, offscreen and with page visibility. Reduced motion removes animation and both repeated sets, showing every logo statically.
- The 24px edge blur is localized. The track, not the layout, animates. No per-frame React state or new runtime dependency.
- [Frame budget](https://preetsuthar.me/writing/every-frame-has-16ms): transform animation, no animated layout or full-surface blur.
- [Line wrapping](https://preetsuthar.me/writing/how-browsers-break-lines): balanced heading, readable line length.
- [Touch targets](https://preetsuthar.me/writing/bigger-touch-targets-that-look-the-same) and [optical icon sizing](https://preetsuthar.me/writing/icons-that-look-the-same-size): separate hit geometry from mark artwork.
- The project's Allo/font, Lucide, radius and no-entrance contracts override generic skill defaults; linear motion is intentional for the user-requested conveyor, not a UI transition.

## Proof

- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run verify:bundle`: passed, entry 178.7KiB gzip, below 180KiB hard gate (above 177KiB working target).
- `npm run verify:handoff` (Chromium): passed, including phone widths, locales, keyboard, QR decoding, clipboard failure, film play/pause, theme matrix and 1024px linear order.
- `npm run verify:layout`: passed after teaching the phone gate to measure the contained marquee viewport. Log: `audit/tmp/f43-layout.log`.
- Before current-main integration, Chromium final handoff passed (`audit/tmp/f43-handoff-chromium-final.log`), Firefox passed after changing the inert `/health` priming visit from default load to DOMContentLoaded (`audit/tmp/f43-handoff-firefox-retry.log`), and WebKit passed (`audit/tmp/f43-handoff-webkit.log`). Current integrated Firefox status is blocked as recorded below.
- Initial local UI testing caught a 240px uncovered lane at the desktop marquee boundary: one 896px group did not cover the 1136px viewport. Three sets, advancing exactly one-third, retain at least one full viewport after a cycle. Added a geometry regression. Fresh production-build UI retesting measured 0px uncovered and no position jump at the light and dark loop boundaries.
- Final annotated [UI recording](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=159ea190-0c59-42f4-a370-f61264341e00): passed 1440px, 1024×700, 390px, 320px, Arabic RTL, dark mode, static reduced-motion logos, keyboard reading order and pause controls, copy/QR focus return, Expired/restored duration. Screenshots: `/home/ubuntu/screenshots/linear-fixed-desktop-hero.png`, `linear-fixed-dark-hero.png`, `linear-fixed-en-US-390-hero.png`, `linear-fixed-en-US-320-hero.png`, `linear-fixed-desktop-marquee-before-wrap.png`, `linear-fixed-ar-320-marquee.png`.
- Pre-push bundle and layout hooks: passed without skips. [PR #19](https://github.com/0xalyt/ShareTexts/pull/19) is open and intentionally unmerged under Paul's explicit outage exception.
- First hosted [PR run](https://github.com/0xalyt/ShareTexts/actions/runs/44883823588): all three browser jobs fail the Composer geometry gate waiting 20 seconds for `pairing-code`, before the landing suite can run. Re-read the failed main run below: the same timeout occurs in all three jobs. Reliability received both run links; no sharing code changed here. Devin Review found no issues. Merge remains prohibited until Worker recovery and green required sharing checks.
- Live UI testing confirmed merged detail-fix build `dcc9c0d8d25d` at 390px: Expired restores 7 days; QR-hidden card ends with normal padding/border. Screenshots: `/home/ubuntu/screenshots/linear-live-pr15-en-390-space-expired.png`, `/home/ubuntu/screenshots/linear-live-pr15-en-390-browser-band.png`.
- Main post-merge [run](https://github.com/0xalyt/ShareTexts/actions/runs/44882504842): all three browser jobs stopped at the Composer geometry gate's pairing-code timeout during the Worker incident.
- `git diff --check`: passed.

## Current-main integration

### Local-only CI and centered reference follow-up

- Integrated current main `496202a`, including the design playbook, free skill pack, and [shared About/Docs reading shell PR #14](https://github.com/0xalyt/ShareTexts/pull/14). Reading-page/server/locale changes are inherited, not authored here. The preceding `8f025b0` integration added only the design playbook and agent instructions.
- Hosted Firefox on `b89e960` failed only the new geometry assertion at en/390. Local Firefox reproduced `picture.bottom=545.2833404541016` versus adjacent `button.top=545.2833251953125`: independent DOMRect rounding, a 0.0000153px difference, not a painted overlap. The assertion now tolerates .05px for this boundary only; the 44/48px target, 16:9, backdrop, containment and overflow checks remain. No production CSS changed. CI evidence: [failed job](https://github.com/0xalyt/ShareTexts/actions/runs/44889838681/job/136803075591), downloaded screenshot and trace in `audit/tmp/ci-44889838681-firefox/`.
- Vercel's status is `Deployment rate limited — retry in 24 hours` (`api-deployments-free-per-day`, >100), not a build failure. Paul authorized merging with only that quota status red after every other check/Review and an integrated local build pass. No empty/retrigger push or deployment retry; merges are not claimed live while the cap remains.
- Local Chromium and Firefox at 320/390px retain strict 44×44px targets with the corrected boundary test; deliberately moving the control 1px onto the picture is still rejected. The full Firefox handoff now passes on integrated main against a fresh local Worker (`audit/tmp/f43-final-main-firefox.log`). Earlier navigation-only timeouts did not recur. Production-build/entry-bundle pass at 179.5 KB gzip (`f43-final-main-build.log`, `f43-final-main-bundle.log`); TypeScript, Worker typecheck, all 195 Worker protocol tests, and claims/footer checks also pass. Fresh hosted Firefox is still required before merge.
- Integrated current main `6ac4163`, including [Allo typography PR #16](https://github.com/0xalyt/ShareTexts/pull/16) and [shared motion PR #17](https://github.com/0xalyt/ShareTexts/pull/17). Retained the scrolling logo-only compatibility layout while applying the typography owner's new browser-heading tracking. Global type/motion changes remain inherited, not authored here.
- Final [compact-phone UI retest](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=abb63f8a-3345-4d58-a166-abe287ba684f) passed on integrated `f93af35`: 320×844 and 390×844, light/dark, 44px target/28px disc, zero top gap, 12px side/bottom padding, no picture overlap or horizontal overflow. Pause/resume, Arabic RTL, keyboard reading order, and desktop1440 light/dark composition passed. The gray-logo marquee retained a continuous boundary without names or a gap. Screenshots sent: `/home/ubuntu/screenshots/pr19-compact-320-light-poster.png`, `pr19-compact-320-dark-poster.png`, `pr19-compact-390-light-poster.png`, `pr19-compact-390-dark-poster.png`. All are unscrolled reduced-motion poster views. The unchanged source's autoplay crop is deferred per Paul's direction, not represented as fixed.
- Integrated `npx tsc --noEmit`, `npm run verify:bundle` (178.8KiB gzip), `npm run verify:motion` (normal/reduced), and local-Worker `npm run verify:handoff` passed after the Allo/motion merge and compact controls (`audit/tmp/f43-compact-handoff.log`). Fresh hosted checks remain required before merge.
- Integrated main `3f35b03` / [PR #23](https://github.com/0xalyt/ShareTexts/pull/23), which runs sharing checks against a local Worker. Production signaling is blocked in this VM's hosts file; no live checks have been run during this follow-up.
- Garv's new centered reference is reflected in heading → Send/Receive → framed film → secondary command input. The duplicate trust line is removed. Compatibility now contains only its centered heading and gray logo marquee; homepage copy/QR is an independent card after the product stories and before FAQ. Both responsive landing branches use that order.
- The [centered-layout recording](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=6b155809-bc93-4314-a7a7-be65a52a7dac) passed functional checks but is superseded for visual approval: Paul rejected its white-on-white film field, first-viewport title card, and phone control overlap.
- The player now has a flat oat-colored field in light mode and a warm charcoal field in dark mode. Its actual picture remains 16:9; playback has a separate control lane, never over a device. The final phone lane is 44px high with no extra top margin, a 28px visible disc, and the same 12px bottom padding as the frame's sides; desktop retains a 48px target. Desktop hero spacing is tighter; display text is 64px at 1440px while Send/Receive remain 64px tall. Changes: `HeroLaunchFilm.tsx`, `hero-film.css`, `landing-page.css`, `SingleScreenApp.tsx`, `BrowserCompatibility.tsx`, `LandingSections.tsx`, `verify-handoff.mjs`.
- Phone device clipping is encoded in the old film's opening camera move, not responsive CSS: the source is 1440×810, the player uses `object-fit: contain`, and a direct source contact sheet shows the same cutoff (`audit/tmp/f43-source-film-timeline.jpg`). Film content remains with its owner; a complete-device replacement opening/poster is pending. No crop/zoom/filter workaround or edited film asset is included here.
- Current framed-player TypeScript/build/bundle and Chromium handoff passed (`audit/tmp/f43-framed-build.log`, `f43-framed-bundle.log`, `f43-framed-handoff.log`); entry is 178.8KiB gzip. Production-bundle two-device text/link smoke passed with the local Worker (`f43-framed-smoke.log`). No transport code was authored here.
- One concurrent layout run exhausted the local emulator's IP socket budget (`GET /ws` 429) after the handoff suite; restarting the emulator and running layout independently is the same reset used by CI. The independent final run passed desktop, sheets, no-flash, room-paint and basics (`audit/tmp/f43-framed-layout-final.log`); no gate or production limit was changed.
- Fresh local production-build [framing retest](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=35f92b32-d95c-41ad-acb8-7821de215c19) passed the distinct light/dark backdrop, 48px playback target below the picture, click/Space pause/resume, 320/390px fit including Arabic RTL, movie-denied poster fallback, and reduced-motion no-movie-request behavior. Four unscrolled reduced-motion **poster previews**, not autoplay approval: `/home/ubuntu/screenshots/pr19-backdrop-desktop-light-poster.png`, `pr19-backdrop-desktop-dark-poster.png` (1440×900); `pr19-backdrop-phone-light-poster.png`, `pr19-backdrop-phone-dark-poster.png` (390×844). The desktop shows both device screens before scrolling, with the laptop base/control lane below the fold; phone poster shows both complete devices and the control.
- Ordinary autoplay still reproduces the encoded cutoff in both themes at approximately 0.76s on the phone (`/home/ubuntu/screenshots/pr19-backdrop-phone-light-autoplay.png`, `pr19-backdrop-phone-dark-autoplay.png`). The source remains 16:9 and contained. Paul explicitly released the replacement-film hold after reviewing these previews: it is the same film already live, and the film owner will swap it separately. No claim that this PR fixes its source composition.
- Paul approved the desktop light/dark first-screen composition and requested the final compact 44px phone control lane plus 320/390px light/dark screenshots. Merge requires that check, current main, all hosted checks green, and clean Devin Review. No production Worker/site tests.

- Integrated main `bdfb21c` from [PR #20](https://github.com/0xalyt/ShareTexts/pull/20), including its browser diagnostics and bounded font/poster waits. Resolved the handoff harness by retaining both mounted-control waits and DOMContentLoaded navigation. Landing behavior and film assets are unchanged by this integration; Worker and sharing changes are inherited from main, not authored in this branch.
- Integrated TypeScript, build and bundle verification passed (`audit/tmp/f43-integrated-build.log`, `audit/tmp/f43-integrated-bundle.log`). Integrated Chromium and WebKit handoff passed (`audit/tmp/f43-integrated-chromium.log`, `audit/tmp/f43-integrated-webkit.log`).
- Integrated Firefox did not complete: one dev-server run timed out navigating to the landing, then a dev-server retry and a built-production-server run timed out on the inert `/health` priming visit after locale and partial theme checks. All use DOMContentLoaded. No assertion or timeout was weakened. Logs: `audit/tmp/f43-integrated-firefox.log`, `audit/tmp/f43-integrated-firefox-retry.log`, `audit/tmp/f43-integrated-firefox-production.log`.
- New failure diagnostics show no console/page errors or pending requests at timeout. The first failure had a complete rendered app document despite Playwright reporting an about:blank page URL; the production failure remained on about:blank with no requests recorded. Cause is NOT VERIFIED. Repeated navigation failures and diagnostic paths were sent to the reliability owner as requested.

## NOT VERIFIED / blockers (current)

- Old film sources still contain the encoded close-up and title-only segment. Paul explicitly deferred the replacement to the film owner and released that merge hold; the new film remains outside this PR's verification claim.
- Fresh hosted three-engine CI is required after the Firefox DOMRect assertion correction; Devin Review on `b89e960` found zero issues. Earlier production-dependent failures are historical, not a reason to spend the live allowance. Vercel deployment remains quota-limited under Paul's explicit exception above.
- Physical Android/iOS devices, native Safari and old-device frame pacing are not verified by desktop browser emulation.
- The latest framing run verified playback-button hover; marquee fine-pointer hover and background-tab pause remain unverified by UI testing. Offscreen/manual pause passed in the preceding marquee retest; both original hooks are retained. Save-Data was not independently exercised in the latest framing retest.
- No claim of transport compatibility is inferred from the browser logos.

## Owner questions

None. Paul approved the desktop composition and released the replacement-film hold. The compact-phone screenshots were sent; finish green CI under the Vercel-only quota exception. No production testing.

## Next

Finish local Firefox verification and the integrated build, batch the assertion correction with current main, and finish hosted three-engine CI and clean Review. Merge [PR #19](https://github.com/0xalyt/ShareTexts/pull/19) only after every non-Vercel check is green; the sole permitted red status is the confirmed Vercel daily quota. The film owner handles the source replacement separately. No live tests until authorized; do not call this release live while deployment is capped.
