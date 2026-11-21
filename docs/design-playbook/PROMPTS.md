# Prompts for Freebuff (or any AI coder) working on ShareTexts

How to use: open Freebuff in the repo root, paste one prompt, let it finish, check its work against the rubric in [README.md](./README.md). One prompt per session works better than five at once. Every prompt starts with the same preamble; keep it.

---

## Preamble (paste first, every time)
```
You are a senior design engineer working on ShareTexts (https://sharetexts.online/), a no-account way to send text, links, images, video and files between devices with a short code or QR. Content is encrypted in transit, not end-to-end; Temporary Spaces keep content on the server for up to 7 days. Never write privacy claims beyond what PROTOCOL.md allows (no "end-to-end encrypted", no "nothing is stored").

Before writing code:
1. Read AGENTS.md, PROTOCOL.md (what may be claimed about privacy), docs/design-playbook/README.md, docs/design-playbook/preetsuthar-lessons.md, docs/design-playbook/REFERENCES.md, docs/craft-rules.md and docs/redesign/motion-policy.md.
2. Load the skills listed for this task from .claude/skills/ and follow them.
3. Read the files you will change and the existing tests/verify scripts around them. Reuse existing tokens (src/index.css, src/lib/motion/tokens.ts), components and libraries. Do not add a dependency if one already does the job.
4. Write a short plan: the user problem, what changes, which principle each change uses, and what you will not touch.

While coding:
- Basics first: one primary action per screen, one radius scale with concentric nesting, one left edge, 4px spacing steps, Allo only, max 3 type sizes per screen.
- Animate only transform and opacity. Anything interruptible uses a spring. Every tap paints feedback in the same frame.
- Everything must work identically with prefers-reduced-motion: reduce (motion replaced, information kept).
- No marketing filler copy. Every new string goes in src/lib/messages/en.ts and the other locale files.
- Do not change files outside the scope of this prompt.

Before saying done:
- Run: npm run lint && npm run worker:typecheck && npm run smoke:local && npm run worker:test && npm run verify:layout && npm run build && npm run verify:bundle && npm run verify:claims
- Check 375px, 768px, 1440px; light and dark; reduced motion on and off; keyboard only.
- Score the change with the 7-point rubric in docs/design-playbook/README.md and report the scores honestly. Fix anything under 4.
```

---

## 1. Whole-app basics audit (run this first)
```
Skills: impeccable, make-interfaces-feel-better, web-design-guidelines, emil-design-eng, break-ui.

Audit every screen of ShareTexts for the basics: hierarchy ("make important stuff bigger"), corner radii ("stop using six separate corners"), alignment, spacing, type sizes, colour use, touch targets, empty/loading/error states, and copy. Screens: landing (src/views/SingleScreenApp.tsx), send/receive pairing (src/components/send, src/components/receive), room (src/views/ChatView.tsx, src/components/MessageCard.tsx), Temporary Spaces (src/views/SpaceView.tsx), sheets (src/components/ui/Sheet.tsx), settings, legal/FAQ pages.

Run the app (npm run dev), screenshot each screen at 375px and 1440px in light and dark. For each screen list: the primary action and whether it is the most prominent thing; every distinct border-radius value in use; every spacing value off the 4px scale; elements that do not share an edge; more than 3 type sizes; any tap target under 44px on touch.

Write the findings to docs/design-playbook/audit-<date>.md as a table (screen, problem, principle, fix, file). Then fix the top 10 by user impact, smallest change first, one commit each. Do not redesign; fix basics.
```

## 2. Gray browser-logo marquee
```
Skills: make-interfaces-feel-better, animation-performance, remove-animations.
Read: preetsuthar-lessons.md §3 (16ms) and §6 (icons the same size).

Under the "Works in all modern browsers" line on the landing, replace the browser names in src/components/landing/BrowserCompatibility.tsx with a horizontally scrolling marquee of the real browser logos: Chrome, Safari, Firefox, Edge, Opera, Brave, Arc, Samsung Internet, Vivaldi, DuckDuckGo. No names visible.
- Logos: official SVGs from https://github.com/alrra/browser-logos (MIT) or https://simpleicons.org/ (CC0). Store them in public/ or as inline SVG components; keep total under 30KB gzipped.
- Gray: render monochrome with CSS (filter: grayscale(1) plus opacity, or currentColor single-colour versions), about 55% contrast in light and 45% in dark, full colour is not wanted.
- Optical size: normalise by visual mass, not box size; round marks a little smaller than square ones. Same visual height ~24px mobile, 28px desktop, 48–64px gaps.
- Motion: one CSS @keyframes translateX(-50%) on a track holding the list twice, linear, ~40s per loop, on the compositor (no rAF, no JS). Edge fade with mask-image linear-gradient. Pause on hover and focus-within.
- Reduced motion: no movement; show the logos as a static centred, wrapped row. Same logos, same order.
- Accessibility: the moving copy is aria-hidden; one visually hidden list names the browsers for screen readers. Each logo has an accessible name in the hidden list only.
- Reuse the old .st-marquee* CSS in src/index.css if it fits; remove dead marquee CSS you do not use.
Verify on a 4x CPU throttle that the marquee stays smooth and the main thread is idle.
```

## 3. Landing: stacked like Stripe, bigger and calmer
```
Skills: landing-page-design, frontend-design, hallmark, design-taste-frontend, humanizer, choreograph.

Make the desktop landing a single centred column like the mobile one: headline → two actions (Start sharing / Join with a code) → hero film → browser marquee → how it works → FAQ → footer. No side-by-side hero. Files: src/views/SingleScreenApp.tsx (landingNode, idleHeroNode), src/components/marketing/LandingSections.tsx.
- Headline is the biggest thing on the page (clamp(44px, 7vw, 96px)), Allo display weight, text-wrap: balance, hanging full stop (preetsuthar-lessons §10). One short supporting line under it, max 60ch.
- The two actions are the second-biggest thing: primary filled, secondary quiet; at least 48px tall; 12px apart.
- Remove filler copy like "Made to move" and the "Open a room. Pair your devices. Send it across." triplet next to the video; the film shows that already.
- Section rhythm: 96px between sections desktop, 64px mobile; content width 1080px for the film, 640px for text.
- Entrance: headline, actions, film stagger in 40ms apart with opacity + 8px translateY, ease-out 300ms, once. Reduced motion: no translate, instant.
Check that nothing shifts while Allo loads (CLS 0).
```

## 4. Allo, used properly
```
Skills: apple-design, make-interfaces-feel-better. Read https://allo.joshpuckett.me/ fully, docs/craft-rules.md, preetsuthar-lessons.md §5 and §8.

Garv says Allo currently looks "too cute". Fix the type system with Allo itself:
- Map roles to faces: display (headline), title, body, label, mono-like numerals (pairing code, sizes, timers with font-variant-numeric: tabular-nums). Use Allo's real weights and oblique faces, never synthesised. Use the optical sizes where Allo provides them.
- Tighten display tracking (negative letter-spacing scaled with size), loosen small labels slightly. Line-height 1.05 display, 1.2 titles, 1.5 body.
- Replace icon glyphs with Allo symbols wherever an Allo symbol exists for it; align symbols to cap height.
- text-box: trim-both cap alphabetic on buttons, pills, badges and the pairing code so labels are truly centred.
- Subset and preload only the core face; metric-matched fallback with size-adjust so nothing reflows.
Put the type scale as tokens in src/index.css and update scripts/verify-allo.mjs if the gate needs to know about new faces.
```

## 5. Hero film: show what ShareTexts actually does
```
Skills: stageshow, dimensional-drawing-motion, choreograph, animate. References: https://serenatan.org/launchvideo (pacing and cuts), https://www.apple.com (product films).
Files: src/components/HeroLaunchFilm.tsx, src/lib/heroFilmAssets.ts, src/components/landing/hero-film.css, film/ sources, public/film/.

Make a 15–25s silent loop that shows real ShareTexts UI: open a room on a laptop, scan the QR with a phone, send a text, then a photo, a video and a PDF; each arrives on the other screen. Use the real components (render them with stageshow) rather than illustrations.
- Shot list first: 6–8 shots, each one idea, 2–3s. Cuts on action. One peak moment (first file landing) with a slightly longer hold and a follow-through settle; end on the ShareTexts mark.
- Camera moves ease in-out, never linear; arcs for items travelling between devices.
- Ship AV1/H.264 MP4 + WebM, light and dark, < 3MB each, poster frames, muted playsinline autoplay, no controls overlay text next to the film. Respect prefers-reduced-motion and save-data: show the poster with a play button.
```

## 6. Sending and receiving: the peak moment
```
Skills: animation-vocabulary, gestures, emil-design-eng, review-animations. Read preetsuthar-lessons.md §1 (shapes melting) and §12 (springs).
Files: src/views/ChatView.tsx, src/components/MessageCard.tsx.

- Send: press compresses the button to scale 0.96 within one frame (anticipation). The message appears optimistically at once with a "Sending" state, then settles to "Sent" with a small check that lands one beat later (follow-through). Frequent action: total under 250ms, no flourish beyond that.
- Receive: the new card enters from the peer's side with a spring (bounce ~0.15), images fade up from a blurred placeholder at the real aspect ratio (no layout shift).
- First transfer in a room only: one exaggerated moment (a soft merge of the two device chips in the header using the smin approach in §1, on a small canvas). Never repeated in the same room.
- Every state (sending, sent, failed + retry, receiving N%) is visible as text too, not only motion. Reduced motion: same states, no movement.
```

## 7. Sheets, menus and touch
```
Skills: gestures, make-interfaces-feel-better. Read preetsuthar-lessons.md §4, §9, §11.
Files: src/components/ui/Sheet.tsx, OverlaySheet.tsx, any menu/tooltip.

- Sheets: open with a spring from the bottom edge; drag follows the finger 1:1; past the top or bottom edge use rubber banding (c = 0.55); release snaps to the point nearest the projected position (deceleration 0.998) and keeps the release velocity. Interruptible at any time.
- Menus and tooltips: Floating UI (offset → flip → shift → size) or CSS anchor positioning with flip fallbacks; scale from the trigger (transform-origin at the anchor); top layer (popover/dialog), no z-index wars.
- Touch targets: every icon button gets a 44px hit area with an invisible ::after under @media (pointer: coarse), drawn size unchanged.
```

## 8. Glass, done carefully
```
Skills: apple-design, animation-performance. Read preetsuthar-lessons.md §2. References: https://glassyui.com/, https://glisse.kelvinzhang.com/.
Files: .st-lens in src/index.css, --st-glass-* in src/styles/apple-dna.css.

Extend the one existing glass material; do not create a second. Use it only on small fixed chrome (header, composer bar, segmented controls, sheet grabber). Blur + tint must be readable by itself; refraction (SVG displacement at the rim) is a Chromium-only enhancement that must not affect layout or contrast. Corners concentric with their content. Check text contrast against the worst background the glass can sit on (4.5:1). Measure scroll FPS on a 4x CPU throttle before and after; if it drops, remove glass from that surface.
```

## 9. Loading, empty and error states
```
Skills: make-interfaces-feel-better, impeccable. Reference: https://skullet.lochie.me/.
Files: src/components/SkeletonScreen.tsx, src/components/ui/StatePanel.tsx, RouteSkeleton in src/App.tsx.

Every screen that waits shows a skeleton with the real layout's geometry (same radii, same spacing), not a spinner. Shimmer is one CSS gradient on transform, paused under reduced motion. Skeleton → content is a 150ms crossfade with zero layout shift. Every empty state says what to do next with one action. Every error says what happened, what was kept, and one way to fix it.
```

## 10. Speed and old devices
```
Skills: animation-performance, vercel-react-best-practices, systematic-debugging. Read preetsuthar-lessons.md §3 and the "Speed on every device" section of README.md.

Profile the landing and a room with Chrome DevTools at 4x CPU throttle and Slow 4G. Report LCP, INP, CLS and long tasks. Fix in order: anything animating layout/paint properties, rAF loops that CSS can replace, unnecessary re-renders (React Profiler), large images without dimensions, fonts that block. Test Safari (iOS 16), Firefox and Samsung Internet. Record before/after numbers in the PR.
```

## 11. Agents as users
```
Read preetsuthar-lessons.md §13. Add /llms.txt describing what ShareTexts is, how a room works, the limits (file size, expiry) and links to the FAQ and privacy pages, in plain Markdown. Make sure every button has an accessible name and every important state has text, so agents and screen readers can use the app.
```

## 12. Review your own change (paste after any prompt above)
```
Skills: review-animations, ponytail-review, code-review, find-bugs, verification-before-completion.
Review the diff you just made as a strict senior designer and engineer. For each changed screen: does it pass the 7-point rubric? Any radius, spacing or type size off the scale? Any animation that is not interruptible, not on transform/opacity, or missing a reduced-motion path? Any code you did not need? Fix what you find, rerun the checks, then report.
```
