# F43 — Linear landing and browser-logo marquee

## Request and boundaries

Heading → sharing actions → film at every width, not a desktop split. Gray browser logos without visible names. No visible film caption, watch or download links. Film content/assets/rendering, global typography/motion, supporting pages and sharing transport remain with their owners.

## Files changed

- `src/views/SingleScreenApp.tsx`: one hero/player placement in source order on phone and desktop.
- `src/components/landing/landing-page.css`: centered desktop hierarchy, 60/72px heading, 64px desktop actions, larger landing brand presentation, full-width film, browser ticker, static reduced-motion layout.
- `src/components/landing/BrowserCompatibility.tsx`: eight logo marks, accessible original set and two hidden repeats, pause/resume, offscreen/page-hidden suspension; copy/QR behavior retained.
- `src/components/HeroLaunchFilm.tsx` and `src/components/landing/hero-film.css`: remove visible footer/links and unused styles, retain hidden description, 16:9 frame and playback hooks.
- `src/lib/messages/*.ts`: browser heading localized in all eleven shipped dictionaries.
- `public/browsers/{opera,vivaldi}.svg` and `SOURCES.md`: two unmodified assets from the existing pinned Browser Logos source; XML parsed successfully.
- `scripts/verify-handoff.mjs`: hidden media description, logo-only compatibility, linear laptop geometry, version-independent light/dark media family checks; landing navigation waits for DOMContentLoaded plus actual mounted UI.
- `scripts/verify-basics.mjs`: count a contained marquee's clipping viewport rather than its intentionally off-canvas duplicate as phone overflow. Other element geometry checks remain.

## Decisions and references

- Fitts's law: desktop sharing actions are 64px high; marquee control is 44px, film control remains 48px.
- Hick's law / Von Restorff: Send stays the only filled orange primary action. Browser names are not extra text choices.
- Reading order is the visual order; one film instance rather than responsive duplicate players.
- No entrance animation. A constant-speed CSS transform moves the requested marquee; it stops manually, on hover, offscreen and with page visibility. Reduced motion removes animation and the duplicate, showing every logo statically.
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
- Chromium final handoff: passed (`audit/tmp/f43-handoff-chromium-final.log`). Firefox passed after changing the inert `/health` priming visit from default load to DOMContentLoaded (`audit/tmp/f43-handoff-firefox-retry.log`). WebKit passed (`audit/tmp/f43-handoff-webkit.log`).
- Initial local UI testing caught a 240px uncovered lane at the desktop marquee boundary: one 896px group did not cover the 1136px viewport. Three sets, advancing exactly one-third, retain at least one full viewport after a cycle. Added a geometry regression. Fresh production-build UI retesting measured 0px uncovered and no position jump at the light and dark loop boundaries.
- Final annotated [UI recording](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=159ea190-0c59-42f4-a370-f61264341e00): passed 1440px, 1024×700, 390px, 320px, Arabic RTL, dark mode, static reduced-motion logos, keyboard reading order and pause controls, copy/QR focus return, Expired/restored duration. Screenshots: `/home/ubuntu/screenshots/linear-fixed-desktop-hero.png`, `linear-fixed-dark-hero.png`, `linear-fixed-en-US-390-hero.png`, `linear-fixed-en-US-320-hero.png`, `linear-fixed-desktop-marquee-before-wrap.png`, `linear-fixed-ar-320-marquee.png`.
- Pre-push gate and hosted CI: pending. Paul explicitly approved pushing the unmerged branch while smoke is blocked by the live outage; merge remains prohibited until recovery and green required sharing checks.
- Live UI testing confirmed merged detail-fix build `dcc9c0d8d25d` at 390px: Expired restores 7 days; QR-hidden card ends with normal padding/border. Screenshots: `/home/ubuntu/screenshots/linear-live-pr15-en-390-space-expired.png`, `/home/ubuntu/screenshots/linear-live-pr15-en-390-browser-band.png`.
- Main post-merge [run](https://github.com/0xalyt/ShareTexts/actions/runs/44882504842): all three browser jobs stopped at the Composer geometry gate's pairing-code timeout during the Worker incident.
- `git diff --check`: passed.

## NOT VERIFIED / blockers

- `npm run smoke:local` production sharing failed at room creation after 20s. Reliability traced the live Worker's `/ws` and `/stats` to HTTP 500 / Cloudflare 1101; missing CORS headers are a symptom. No transport changes are included here. Merge remains blocked until required checks pass.
- Physical Android/iOS devices, native Safari and old-device frame pacing are not verified by desktop browser emulation.
- Background-tab pause was not verified: the test browser did not enter `document.hidden` during tab switching/minimizing. Offscreen pause was verified; page-visibility listener is retained.
- No claim of transport compatibility is inferred from the browser logos.

## Owner questions

None. Reliability owns the Worker incident; recommendation is to keep this PR unmerged while required sharing checks are red.

## Next

Push the branch and open an unmerged PR under Paul's explicit outage exception. Keep it unmerged until the production Worker recovers and required sharing checks pass; then merge under Garv's instruction and confirm the live landing.
