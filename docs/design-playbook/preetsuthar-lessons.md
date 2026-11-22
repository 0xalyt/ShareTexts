# What preetsuthar.me teaches, applied to ShareTexts

Read the original article before you touch the matching part of the app. Each one has a live demo; drag it, slow it down, and copy the number that feels right. Every rule below names the article, the rule, and where it lands in ShareTexts.

Index of all articles: https://preetsuthar.me/ (scroll "Writing"). Case studies: https://preetsuthar.me/case-studies/21st.html, https://preetsuthar.me/case-studies/textcortex.html, https://preetsuthar.me/case-studies/inbound.html, https://preetsuthar.me/case-studies/solcard.html, https://preetsuthar.me/case-studies/emergente-labs.html

## 1. Shapes that melt into each other (the Dynamic Island look)
Source: https://preetsuthar.me/writing/how-shapes-melt-into-each-other

- A liquid split or join is a change in topology. A path morph or `border-radius` tween can never do it. Animate the things the outline is computed from (centre, width, radius, with a spring) and let the outline fall out.
- Two ways to draw it:
  - **Distance field + smooth min** (canvas/WebGL). Exact shapes, untouched until within `k`. Shapes join once the gap is narrower than `2k`. Quadratic smin (Inigo Quilez):
    ```js
    function smin(a, b, k) { k *= 4; const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; }
    const circle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
    const pill = (px, py, cx, cy, h, r) => Math.hypot(Math.max(Math.abs(px - cx) - h, 0), py - cy) - r;
    ```
  - **Gooey SVG filter** (blur + alpha threshold): `feGaussianBlur stdDeviation=10` then `feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -7"`. Cheap to write, but it rounds every corner, melts text inside, and re-blurs the whole region every frame. Put the blobs in one filtered layer and the content above it, unfiltered; keep the filter region tight.
- ShareTexts use: the pairing moment (two device chips meeting and merging into one "connected" pill), a send "drop" pulling away from the composer and landing in the peer's lane, the status pill growing a bubble for "Typing…" or "Receiving 3 files". Prefer smin on a small canvas; fall back to a static join with reduced motion.

## 2. Liquid glass
Source: https://preetsuthar.me/writing/how-liquid-glass-is-rendered

- Frosted glass *scatters* (blur). Liquid glass *bends* (displacement at the rim), catches a moving highlight, adapts tint and shadow to what is behind, and keeps corners concentric.
- Rim displacement: `t = max(0, 1 - d/bezel); shift = strength * t * t;` sample from `p - n*shift`. Middle stays calm, edge bends steeply.
- Concentric corners: `inner = max(0, outerRadius - padding)`. Apply this to every nested surface (sheet → card → button). This is the single cheapest "Apple" detail.
- Web reality (Nov 2026): `backdrop-filter: blur()` works everywhere. SVG refraction inside `backdrop-filter: url(#lens)` only renders reliably in Chromium (WebKit bug 245510, Firefox bug 1961378), and `CSS.supports` does not tell you it renders. So **refraction is decoration; blur + tint alone must be readable.**
- Cost: a backdrop filter re-reads and re-filters what is behind it every frame while anything scrolls. Use glass on a few small chrome surfaces (header, composer, sheet grabber, segmented control), never on scrolling lists or full-screen layers.
- Contrast: design the label for the *worst 10% of pixels* behind the glass, not the average. Add a dimming/tint layer (Apple's "Clear needs a dimming layer"); darken the edge and brighten the specular rim to separate glass from content.
- ShareTexts already has `.st-lens` in `src/styles/apple-dna.css` with a `@supports not (backdrop-filter)` fallback. Extend that one material; do not invent a second glass.

## 3. Every frame has 16ms
Source: https://preetsuthar.me/writing/every-frame-has-16ms

- 60Hz = 16.7ms per frame, 120Hz = 8.3ms. Keep your own work under ~10ms.
- Animate only `transform` and `opacity` (and `filter` sparingly). As CSS animations/transitions/WAAPI they run on the compositor and keep moving when the main thread is blocked. `left/top/width/height/margin` trigger layout; `box-shadow`/`background-color` trigger paint.
- A `requestAnimationFrame` loop runs on the main thread and freezes when JS is busy (e.g. while sealing chunks, parsing a big paste, or hashing a file). Never drive the transfer progress ring or the hero with rAF if CSS/WAAPI can do it.
- `will-change` only right before an animation, removed after.
- No layout thrashing: read all `getBoundingClientRect()` first, then write.
- INP (tap → next paint) under 200ms is good, over 500ms is poor. Every tap in ShareTexts must paint feedback in the same frame (pressed state), even if the work behind it takes longer.

## 4. How a popover finds its place
Source: https://preetsuthar.me/writing/how-a-popover-finds-its-place

- Pipeline order: offset → flip → shift → size → arrow → hide. Boundary = clipping ancestors ∩ viewport.
- Use Floating UI (`@floating-ui/react`, `autoUpdate`) or CSS anchor positioning (Baseline Jan 2026: `position-anchor`, `position-try-fallbacks: flip-block`). Never hand-position menus.
- ShareTexts: device menu, share-target menu, emoji/attachment menu, tooltips in the header must flip near the keyboard on phones and `size` to the visual viewport.

## 5. How browsers break lines
Source: https://preetsuthar.me/writing/how-browsers-break-lines

- `text-wrap: balance` on headings and short captions; `text-wrap: pretty` on paragraphs. Both fall back safely.
- Do not put `pretty` or `balance` on editable text (the composer); lines above the caret would jump.

## 6. Icons that look the same size
Source: https://preetsuthar.me/writing/icons-that-look-the-same-size

- Equal bounding boxes are not equal size. A circle covers 79% of its box, a triangle 50%. Use a keyline grid (24 box, 20 live area; round shapes drawn ~11% wider than square ones).
- Optically centre asymmetric glyphs: a play/send triangle must move toward its point (centroid is the limit, judge by eye). Check the send arrow, play button on the hero film, and the share icon.
- Browser logos in the marquee: normalise by visual mass, not by box. Firefox's round mark and Safari's compass should look as heavy as Chrome's.
- Icons beside text are sized against the cap height (SF Symbols rule), not a square.

## 7. Smooth corners
Source: https://preetsuthar.me/writing/smooth-corners

- `border-radius` is G1 (curvature jumps 0 → 1/r). Apple's continuous corner is G2 (curvature ramps). The kink is visible on large cards and buttons.
- CSS: `corner-shape: squircle` (Chrome/Edge 139+, ignored elsewhere, so it is safe progressive enhancement). Same radius looks tighter as a squircle; raise the radius ~1.5× when you switch, or it looks smaller.
- One radius scale, nested concentrically (see §2). "Stop using six separate corners": a screen should show at most three radii.

## 8. The invisible box around text
Source: https://preetsuthar.me/writing/the-invisible-box-around-text

- Padding is measured from the font's ascent/descent box, not the letters, so labels sit off-centre. Use `text-box: trim-both cap alphabetic` on buttons, pills, badges and the pairing code (Chrome/Edge 133, Safari 18.2, Firefox 154; ignored elsewhere). Stop nudging padding by 1px.
- `font-size-adjust: from-font` so fallback fonts keep Allo's x-height while it loads.

## 9. The maths of iOS scrolling
Source: https://preetsuthar.me/writing/the-maths-of-ios-scrolling

- Momentum: velocity × 0.998 per ms (`normal`) or 0.99 (`fast`). Projected distance = `v0/1000 * d/(1-d)`; at normal ≈ 0.5s of release speed.
- Snap a thrown sheet to the snap point nearest the *projection*, not the release point, then spring there starting with the release velocity.
- Velocity from the last ~100ms of samples; treat a pointer still for 40ms as stopped.
- Rubber band past an edge: `offset = (1 - 1/(x*c/d + 1)) * d`, `c = 0.55`. First pixels move at 55% of the finger; it never reaches `d`.
- ShareTexts: the bottom sheets (Space, Settings, attachment), swipe-to-dismiss on previews, pull past the end of the message list.

## 10. Hanging punctuation
Source: https://preetsuthar.me/writing/hanging-punctuation

- A centred headline ending in a full stop looks shifted left. Wrap the stop and give it a negative right margin in `em` (tune by eye, per font and weight). Only on big, short, centred lines; each line its own `nowrap` block. `hanging-punctuation` is Safari-only.
- ShareTexts: the landing H1 and section headers.

## 11. Bigger touch targets that look the same
Source: https://preetsuthar.me/writing/bigger-touch-targets-that-look-the-same

- Keep the drawn size; grow the hit area with an invisible `::after` (positioned, no layout shift) to 44px.
- Only under `@media (pointer: coarse)`. Text buttons grow vertically (`inset-inline: 0`); icon buttons grow all round. Turn it off inside button groups. Test on a real phone.

## 12. What a spring actually is
Source: https://preetsuthar.me/writing/what-a-spring-actually-is

- A tween is a function of time and restarts from rest when retargeted (a jolt). A spring has state (position + velocity) and keeps its velocity when retargeted. **Anything the user can interrupt (sheets, drags, toggles, the pairing chip) uses a spring.**
- Tune with response + damping fraction, not stiffness/mass. ζ = 1 critically damped (no overshoot); ζ 0.7 overshoots 4.6%. Most UI wants ζ 0.85–1; playful moments (a successful drop) ~0.7.
- Simulate with semi-implicit Euler in fixed 1ms steps if you ever hand-roll one. In practice use Motion (`motion/react`, already a dependency) `type: "spring", visualDuration, bounce`.

## 13. Your next user might be an agent
Source: https://preetsuthar.me/writing/your-next-user-might-be-an-agent

- Agents fetch pages and skim noise. Give them a clean text door: `llms.txt`, Markdown versions of docs, explicit "do this, not that" rules, error states that fail loudly. That is why this playbook and `AGENTS.md` exist.

## 14. Other articles worth reading for this app
- https://preetsuthar.me/writing/how-a-page-morphs-into-the-next — View Transitions: the old view is a picture (text scales like a photo), fix aspect with `object-fit: cover; overflow: clip`, give text `width: fit-content`, default 250ms. Use for landing → room and room → Space.
- https://preetsuthar.me/writing/animating-a-collapsible-properly — measure height without the 4px slide (clip layer), remove the flex `gap` a closed panel still owns, watch the first and last frames slowed down.
- https://preetsuthar.me/writing/dark-mode-is-not-inverted — up means lighter in dark mode, desaturate brand colours, text at ~87%/60% white, never pure black/white.
- https://preetsuthar.me/writing/a-theme-from-three-colours and https://preetsuthar.me/writing/why-gradients-go-grey — build ramps in OKLCH; interpolate gradients `in oklch` so they do not go muddy.
- https://preetsuthar.me/writing/a-font-is-a-performance-decision — subset Allo with `unicode-range` (core preloaded, extended on demand), metric-matched fallback so nothing shifts when it loads, a check that fails when used glyphs change.
- https://preetsuthar.me/writing/streaming-text-without-jank — buffer incoming chunks, reveal on a rAF clock that speeds up with backlog, parse only the last open block. Applies to relayed text arriving in bursts.
- https://preetsuthar.me/writing/the-safe-triangle — hover submenus need a safe polygon (Floating UI `safePolygon`) with ~300ms timeout.
- https://preetsuthar.me/writing/why-z-index-9999-doesnt-work — stacking contexts; use the top layer (`popover`, `<dialog>`) instead of z-index wars.
- https://preetsuthar.me/writing/you-can-finally-style-a-select — `appearance: base-select` for the language picker.
- https://preetsuthar.me/writing/a-save-bar-with-four-states, https://preetsuthar.me/writing/designing-what-an-agent-does-while-you-wait, https://preetsuthar.me/writing/undo-for-an-ai-chat — model every async action as explicit states (idle, working, done, failed) with undo instead of confirm dialogs. Directly applies to send, receive, room creation.
- https://preetsuthar.me/writing/when-a-search-input-runs-out-of-room, https://preetsuthar.me/writing/an-address-form-for-16-countries — inputs that adapt to content and locale.
- https://preetsuthar.me/writing/how-multiplayer-works-in-figma — last-writer-wins per property, server as authority; relevant to Space sync.
- https://preetsuthar.me/writing/three-ways-an-ai-draws-an-interface
- https://preetsuthar.me/writing/what-you-can-ship-now-november-2026 — current browser features (anchor positioning, `corner-shape`, `text-box`, base-select, view transitions); check support before relying on one.
