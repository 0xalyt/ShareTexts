# ShareTexts — Design Contract v1.1
Read this before every task. If code and this file disagree, tell the owner; do not guess.

## 0. Working rules (every task)
1. Proof rule: every claim in a report needs proof: a screenshot path, command output or file:line. Write "NOT VERIFIED" for anything you did not check.
2. Read before write: open a file and note in one line what it does before editing it.
3. Small commits, one idea each. After each commit run `npx tsc --noEmit`. Before every push also run `npm run build` and the `scripts/verify-*.mjs` gates for the area you touched.
4. Gates are never deleted or weakened to pass. If a gate is wrong, fix it in the same commit and say why in the message.
5. CSP rule: if an inline <script> in index.html changes, re-pin its sha256 in server.ts, and restart the prod server after rebuilding.
6. Stop and ask the owner only when: a change touches protocol or crypto (src/lib/crypto.ts, PROTOCOL.md, signaling in server.ts or worker/), you want to delete a feature, or two instructions conflict. For anything else make the call and note it in the report.
7. Do not invent numbers, claims or features.
8. Screenshots go to audit/<task>/. Third-party screenshots go to audit/refs/ (git-ignored). Never commit other people's assets.
9. Commands are bash-style. On Windows use your shell's version (PowerShell: `$env:URL="http://localhost:3012"; node scripts/verify-theme.mjs`). Dev server: `npm run dev` (PORT=3012). Production check: `npm run build`, then `NODE_ENV=production PORT=3013 node dist/server.cjs`.
10. Push rules. The owner approved working straight on main: no branches, no PRs, no waiting for approval. Safety net:
 a) At the start of each prompt: `git pull`, then `git tag before-<prompt-id>` and `git push origin before-<prompt-id>`.
 b) Push only finished steps that pass tsc, build and the relevant gates.
 c) One idea per commit. Push after each finished step, not at the end.
 d) After each push, wait until the live page shows your build marker (meta sharetexts-build), then run `node scripts/smoke-live.mjs` and record the result. (Until P0 adds the marker and the script, skip this.)
 e) If a push breaks the live site: `git revert <sha>`, push at once, write it in the report. Do not debug on live.
11. Every task ends with a report file (F-number): files changed, proof, NOT VERIFIED list, questions for the owner (max 5, each with your recommendation), what you would do next. No adjectives. Evidence only.

## 1. What we are making
A calm, fast, honest tool for moving things between your own devices. It should feel like Apple made it, with Duolingo's warmth and Blinkit's speed.
Blend rule: Apple = structure, type, restraint, motion. Duolingo = friendly illustration and cheerful feedback. Blinkit = speed, one bold action, a clear next step. Warmth comes from illustration, words and feedback, never from extra decoration on controls.
Personality: calm, quick, friendly, honest. Never loud, techy, corporate or gimmicky.

## 2. Ten taste rules (in priority order)
1. One primary action per screen. It is the only filled orange control on that screen.
2. Task screens (pairing, enter code, connecting, room, space) are clean: no footer, no marketing, no stats, no tips panel.
3. At most 3 visible choices per decision. The rest goes behind "More".
4. Show real UI, not decoration. If a visual is not a real state of the product, remove it.
5. Every screen has designed states: empty, loading, error, offline, success.
6. Feedback within 100 ms. No spinner for work under 300 ms. No entrance animation on first load.
7. Familiar before new: chat bubbles, share sheets, bottom sheets, OTP boxes.
8. Always honest: no fake numbers, no fake urgency, no claim the code cannot prove.
9. Thumb first: on phones the main action sits in the bottom 40% of the screen.
10. Spend the polish on two peak moments: "devices connect" and "it arrived". Everything else stays quiet.

## 3. Colour (source of truth: src/index.css)
Target token names (P1 renames the old ones; values stay): --color-accent, -accent-press, -accent-soft, -accent-ink; -canvas, -band, -raised; -ink, -ink-2, -ink-3; -divider, -line, -line-strong; -success/-soft/-ink, -warning/-soft/-ink, -danger/-soft/-ink.
Light: canvas #ffffff · band #f5f5f7 · ink #1d1d1f · ink-2 #6e6e73 · ink-3 #8e8e93 · line #dedee3 · divider #e8e8ed
Dark: canvas #101012 · band #141416 · raised #18181a · ink #ededf2 · ink-2 #9c9ca3 · line #3a3a42 · divider #2a2a30
Accent (brand orange "ember"): #f06413 light, #fb7a2e dark. Press #d9560e. Orange TEXT on light: #b3450b.
Status: success #34c759 (text on light #1d7a35) · warning #ff9500 (text on light #9a5a00) · danger #ff3b30 (text on light #c22e24)
Rules:
- Orange is for the primary button, the logo and one highlight per screen. Never body text or big backgrounds.
- #f06413 on white is only 3.2:1. Small orange text on white must use #b3450b (5.6:1).
- White text on #f06413 is 3.2:1: allowed only for labels 18.7px bold or larger. Smaller labels on orange use ink #1d1d1f (5.2:1).
- ink-3 (#8e8e93) is 3.3:1 on white: decoration, placeholder and disabled only, never informative text.
- Neutrals are true neutrals in both themes. No cream, brown or tinted greys.
- No gradients on UI. No glow shadows. No page-level colour washes.
- Toggle ON = success green, like iOS.

## 4. Type
- Apple devices: the system font (SF) through -apple-system. Never add SF files to the repo: Apple's licence does not allow SF on websites.
- Everywhere else: Inter variable, self-hosted (SIL OFL), Latin subsets, font-display: swap, size-adjusted fallback. The system stack stays as the last fallback.
- Hindi, Arabic, Japanese, Chinese, Korean and other scripts use system fonts through :lang(). Do not force Inter.
- Scale (px): display 56/64 (650, -0.03em) · h1 40 · h2 32 · h3 22 (600) · body 17/1.47 · small 15 · caption 13 · micro 12. Tighten letter-spacing only at 20px and above.
- Codes, counts and progress use tabular numbers.
- Line length 60 characters or less. Headings text-wrap: balance. Paragraphs text-wrap: pretty.

## 5. Shape, space, depth
- 4px grid. Spacing steps 4/8/12/16/24/32/48/80.
- Radius: 12 small controls · 14 buttons · 16 cards · 24 sheets · full for chips.
- Depth comes from 1px lines and tone, not shadows. One shadow token exists, for floating layers only (menus, sheets, toasts).
- Never more than two nested surfaces (page → card).
- Minimum touch target 44x44, even if the icon is smaller.

## 6. Buttons (one grammar for the whole app)
- Primary: flat orange fill, label white 19px/700, 3px darker bottom edge (#c04b09), radius 14, height 52 (hero) or 44. On press it moves down 2px and the edge shrinks to 1px, in 60 ms.
- Secondary: surface fill, 1.5px line, ink label 17px/600.
- Tertiary: text only, ink-2.
- Destructive: text in the danger colour, always behind a confirm sheet. Never a large red block.
- Disabled: 40% opacity, no press.
- Focus (keyboard only): 2px orange ring, 2px offset.
- State changes happen inside the same button at a fixed width: Send → Sending → Sent.

## 7. Icons and emoji
Lucide only, stroke 1.5, 20px in chrome, 24px in feature areas, currentColor. No emoji as icons in UI. Emoji appear only as message reactions and quick chips, drawn as Apple-style images from public/emoji-apple through src/lib/emoji.ts. One switch: VITE_EMOJI_SET=apple|native. If an image fails, fall back to the native character; a reaction never disappears.

## 8. Motion and haptics
- Durations from src/lib/motion/tokens.ts (60/120/180/280/480 ms). Springs without overshoot for UI. One playful spring is allowed, only for the two peak moments.
- Animate transform and opacity only. Everything is interruptible. Everything respects prefers-reduced-motion.
- Loops only for live state (connecting, live dot). At most one loop per screen.
- Haptics only through src/lib/haptics.ts: tap light, toggle tick, success double tick, error firm. Do not promise haptics on iOS Safari unless tested.

## 9. Voice
- Write like a kind person talking. Short. Verbs. 12 words or fewer per sentence. No "!", no "Oops", no "Welcome to".
- Every button is a verb. Every error says what happened and what to do next.
- Banned: seamless, effortless, unlock, supercharge, elevate, empower, revolutionize, magic, blazing, "in seconds", "whether you're".
- Never claim what the code does not do. Claims are listed in docs/redesign/claims.md.
- All user-visible text lives in src/lib/messages/*.ts. No inline strings.
- Good: "That's it. It arrived." Bad: "Your file was successfully delivered!"

## 10. Illustration (from P4)
Original characters only. Never copy Duolingo's owl or any brand art. Flat colour, rounded geometric shapes, 2.5px ink outline, a small palette (orange plus four helper colours used only inside illustrations). At most one illustration per screen, always next to a clear action. If a real UI state can be shown instead, show the UI.

## 11. Psychology map (each principle has one named place; never used as a trick)
- Hick's law: fewer choices → Home offers Send and Receive only.
- Jakob's law: familiar patterns → chat bubbles, share sheet, OTP boxes.
- Fitts's law: big, near targets → sticky bottom action on phones, 44px minimum.
- Doherty threshold: under 400 ms feels instant → 100 ms feedback, optimistic UI.
- Peak-end rule: polish "connected" and "arrived"; end every session calmly.
- Von Restorff: one orange thing per screen.
- Goal gradient: real progress on pairing and transfers, never fake.
- Aesthetic-usability: polish builds trust in a tool that touches private files.
- Trust cues: say plainly who can see the data, only what is true.
Banned: fake scarcity or urgency, fake counters, streak guilt, confirm-shaming, hidden opt-outs.

## 12. Devices and accessibility
WCAG AA contrast. Visible focus. Screen-reader names on every control. aria-live for connection status. 200% text zoom works. RTL for Arabic, Hebrew, Persian, Urdu. prefers-reduced-motion and prefers-contrast. Works at 320px wide, in portrait and landscape, with safe areas and the on-screen keyboard. Chrome, Edge, Firefox, Safari, Samsung Internet, and in-app browsers (WhatsApp, Instagram, Telegram).

## 13. Performance budget (mobile, Slow 4G, 4x CPU)
LCP 2.0 s or less · INP 150 ms or less · CLS 0.05 or less · landing JavaScript 110 KB gzip or less · no layout shift from fonts · no loading screen over 300 ms unless a network call is really pending.

## 14. Never (anti-slop list)
Glossy gradients · glow shadows · dot-grid or pattern backgrounds · page colour washes · cards inside cards inside cards · 3D bevels · marquees · announcement bars · emoji bullets in UI · stock-style isometric art · stats dashboards on task screens · two primary CTAs for the same action on one screen · a footer on task screens · any third-party component pasted without being restyled to this file.

## 15. References: what to take, what not to take
- Apple (apple.com, HIG): structure, type, restraint, motion. Not: SF files, SF Symbols, Apple logos.
- Duolingo (public site, blog.duolingo.com design posts): illustration language, celebration moments. Not: the owl, streaks, XP, their art.
- Blinkit (public site/app, 60fps.design shots): speed, one bold promise, sticky bottom action, in-place button states.
- obry.app: landing = short real-product loops, 3 big features then small ones, honest FAQ, price/trust line, key-hint chips, maker signature.
- x.com/i/chat: skeleton = quiet grey blocks matching the final layout, shown only after 300 ms. The owner will provide screenshots.
- popl.co app: the share/connect flow, like popl.co app: one obvious next step, few taps. Study it; do not copy it.
- LocalSend, PairDrop, AirDrop: discovery and accept/decline states (see docs/research/rea-sharetexts-reference-study.md).
- Linear: type and elevation discipline. Cursor app: neutral near-black dark theme (not brown).
- Galleries for browsing, not copying: designeer.xyz, saved.design, appinspo.com, bestdesignsonx.com, recent.design.
- Component sites (ideas only; restyle everything; check licences first): opensourceui.in, uiarc.dev, evilbuttons.com, bluma.design. Rare UI is MIT + Commons Clause.

## 16. Activity numbers
The live line shows two real counts: rooms made, and times people used the app (the definition is set by the owner after docs/redesign/ACTIVITY-COUNTERS.md). They come only from counters stored on the server for real events. No floor, no multiplier, no invented growth. The label says exactly what is counted. If the service cannot be reached, hide the numbers.
