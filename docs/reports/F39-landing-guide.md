# F39 — A quieter landing, a handoff you can explore

## Changed

- `src/components/marketing/LandingSections.tsx`: replace two equal-weight story cards with a reader-controlled Pair/Send guide. Both instructions remain visible; only the explicitly labelled illustration changes. Native pressed buttons retain meaningful names, descriptions, focus, and ordinary Tab/Space/Enter behavior. Step numbers follow the selected locale.
- `src/components/landing/landing-page.css`: align desktop words/media at their centers; use the existing subhead/title type tokens; compress browser compatibility into a quiet signature; make the guide responsive; distinguish laptop/phone proportions; separate Temporary Spaces with a rule rather than another nested card. Example changes transition only transform/opacity for 250ms after pointer selection; persistent layers retarget on interruption. First paint, keyboard selection and reduced motion do not animate.
- `src/components/landing/BrowserCompatibility.tsx`: treat compatibility as supporting information, not another competing section headline. All six names and licensed browser marks remain readable at rest.
- `scripts/verify-handoff.mjs`: cover selection state, fixed illustration geometry, keyboard selection and reduced motion across English, Spanish and Arabic at 320/360/390/1440px. Existing film, command contrast, source-order and real Space-entry checks remain intact.

Hero film/player/assets, supporting pages and transport/protocol code are untouched. This branch includes the concurrently merged sharing fixes from main rather than replacing them.

## Craft decisions and reference research

- [User Interface — Laws of UX](https://www.userinterface.wiki/laws-of-ux): reduce competing visual choices, chunk the explanation into two named actions, retain large targets and immediate feedback. There is no fabricated usage counter, urgency or social proof.
- [User Interface — Animating Container Bounds](https://www.userinterface.wiki/animating-container-bounds): avoid animating from an unmeasured initial state. The guide instead reserves a fixed drawing area and never moves functional text.
- [Detail](https://detail.design/): use explicit state and restrained surfaces rather than ambient ornament. The selected step is a real control; example code and receipts are not pretend clickable UI.
- [Preet Suthar](https://preetsuthar.me/): optical hierarchy, intentional line breaking, independent dark surfaces and usable targets informed the type-token correction, quieter browser band and interaction states.
- Local `apple-design`, `landing-page-design`, `emil-design-eng`, `animate` and `animation-performance` guidance informed this implementation. Repository neutral surfaces, radius/type tokens and no-first-load-entrance requirements take precedence over conflicting generic landing templates.

### Motion relationship

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| Selected illustration | Lead | Pointer selection | 250ms | Opacity + 6px rise | Together with outgoing illustration |
| Outgoing illustration | Support | Pointer selection | 250ms | Opacity + 6px fall | No exit queue; retargets on interruption |
| Controls, copy, caption, frame | Static | — | — | None | Preserve reading position and immediate input |

CSS transitions use the existing strong ease-out token and persistent layers. Keyboard/reduced-motion selections are instantaneous. The replacement recording includes mid-flight reversal and fixed-frame checks; native-device frame performance is not inferred from the VM.

## Proof

- `npx tsc --noEmit`, `npm run build`, `npm run verify:bundle`, `npm run verify:claims`, `git diff --check`: passed during implementation.
- `npm run verify:handoff`: passed, including new guide checks in English/Spanish/Arabic at 320/360/390/1440px; current screenshots are `audit/tmp/handoff-320.png`, `handoff-390.png`, `handoff-1440.png`, `landing-story-1440.png`, `landing-1024-700.png` and dark variants.
- `npm run verify:layout`: passed desktop, sheets, no-flash, first-room-paint and basics. Landing radii remain 8/12/16/24px, section edges match, and the phone has no horizontal overflow.
- `npm run smoke:local`: production build and server, code pairing, text/link delivery and console checks passed. The existing smoke reaction step remains explicitly disabled, not claimed as tested.
- First fresh recorded walkthrough caught an Arabic 320px illustration defect before merge: a proportional locale fallback widened the Latin sample beyond the sender card. Latin code samples now use the existing monospace token, and compact mini-card geometry covers the 360px intermediate width too. The browser gate now measures rendered code ranges against the padded card and all six receiver cells in English/Spanish/Arabic at 320/360/390/1440px.
- `npm run lint`, `npm run worker:typecheck`, `npm run worker:test`: passed. Corrected functional revision `d587e89` passed all six CI checks, including Chromium/Firefox/WebKit, Vercel and Devin Review.
- Replacement local Chromium walkthrough passed: [Recording](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=b4925a61-4dd3-4ebe-bf11-6b2fc2179386). Started from a fresh English idle landing with Send/Receive/film visible. Verified pointer interruption, keyboard/reduced-motion changes, fixed geometry, 320/390/1024/1440px layouts, Arabic 320/360px glyph fit, dark command labels, readable browser names, real Temporary Space creation and keyboard FAQ. Arabic 320px sender glyphs fit x=182.48–272.52 inside padded x=181–274. Dark command contrast: Create room 11.14:1, Send this/Join room 6.35:1.
- Concurrent supporting-page and keyboard-action changes from main merged cleanly before integration checks. The initial integration CI attempt failed Chromium's tab-rejoin/file-queue steps; unchanged base and landing integration both passed the complete Chromium E2E locally, and all six CI checks passed on rerun. No transport/protocol code or E2E expectations were changed.
- The subsequently merged hero-film update from main (`7cf7ad7`) is also integrated without replacing its implementation. A clean dependency install, production build, TypeScript, handoff regression matrix and bundle gate pass with the new film/player. Entry gzip is 175.4 KB against the 180 KB budget. Only this report and the four landing/gate files form this PR's change against current main.

## Corrected diagnosis

An initial source-only inference incorrectly treated the desktop `.landing-hero-grid` as the mobile layout. Mobile renders a separate branch. The unnecessary breakpoint and incorrect assertion were removed, not shipped. Fresh production checks in Android Chromium emulation at 320/390px found a single-column hero, matching viewport/document widths, and no horizontal overflow. This does not prove Garv's physical device is unaffected or that a mobile fix was deployed.

## NOT VERIFIED

- Physical Android/iOS devices, native Safari and screen-reader audio.
- Every page on the reference sites; researched the relevant index pages and selected motion, typography and interaction articles rather than claiming an exhaustive crawl.
- Production is not part of the local walkthrough; release verification is tracked in the PR after merge.

## Owner questions / next

No owner decision needed. Merge the verified integration under Garv's explicit instruction and confirm production. Hero film/player and supporting-page improvements remain owned by their separate sessions.
