# Motion is feedback, not a prerequisite

Implementation guidance for ShareTexts' shared interaction primitives. Extend
`src/lib/motion/tokens.ts`; `src/lib/motion.ts` is its seconds-based adapter.

## Principles applied

| Principle | ShareTexts contract |
| --- | --- |
| Doherty threshold, timing, frequency of use | Respond immediately; never hold a resolved action for a minimum animation runtime. Success may stay visible without blocking another action. |
| Interruptibility, follow-through | Catch a returning sheet at its painted position **before** cancelling its transition. Releasing it uses the existing trailing velocity window and distance-based settle. |
| Rubber banding | Past the sheet's upper boundary, use diminishing resistance bounded by the viewport, not an unbounded linear multiplier. |
| Origin awareness, arcs, solid drawing | Real transfer progress moves one contained tile from sender to recipient, along a shallow arc. Static positioning and dimensions remain valid without any animated transform. |
| Squash/stretch, restrained exaggeration | Preserve the sheet handle's drag-linked stretch and the file tile's small mid-flight swell. Never distort text or add a decorative loop. |
| Fitts's law, anticipation | The disconnect knob is 44px, respects the grab offset, and signals the release threshold. Pointer cancellation always resets; it never confirms. |
| Staggering, secondary action, Hick's law | Keep frequent tab choices together. Keyboard selection is immediate; pointer selection may move the single existing thumb. No extra child entrance or choice is added. |
| Von Restorff, peak-end rule | The existing success check and single transferred object are the emphasis. Success reflects the operation, not a staged celebration. |
| Slow in / slow out | Use the shared movement curve for on-screen tweens; gestures and byte-progress retargeting use springs or velocity-aware settling rather than restarting an ease-in on each tick. |

## Motion-on / motion-off are the same product

- `MotionConfig reducedMotion="user"` jumps positional transforms to their
  targets; it does **not** remove width/opacity staggers or CSS animations.
  Render the actual formatted number as text in the static path, without
  measuring or mounting digit strips. Use a stationary transfer tile rather
  than jumping it to a different position for every progress tick.
- Motion 12's `useReducedMotion` snapshots the preference at mount. Shared
  data/gesture primitives use `useMotionPreference`, a live media-query
  subscription that also respects explicit `MotionConfig` overrides.
- Direct manipulation stays available with reduced motion. The pointer owns
  the position; only the release/settle motion disappears.
- No functional state depends on `animationend`, `transitionend`, or a spring
  completing. Cancelling, unmounting, or changing preference must be safe.
- Keep layout anchors separate from travel transforms. With motion off, the
  flight becomes a stationary filename/size/progress ring inside the feed.
- Avoid inherited per-frame CSS variables and permanent `will-change` layers.
  Resize observers measure geometry when the feed changes, not per byte tick.

## Prompt for the next interaction change

> First identify cause, state, relationship, and frequency. Use shared motion
> tokens; do not add a library, artificial delay, or another moving lead.
> Keep frequent and keyboard interactions immediate. For a gesture, preserve
> the exact grab offset and presentation value on interruption; a cancellation
> must never commit. Specify the static reduced-motion rendering before coding
> the animated one. Exercise repeated input, cancellation, mid-motion reversal,
> live preference changes, narrow screens, and all three browser engines.
> Measure data and geometry, not just screenshots of an animation's last frame.

## Sources

- [Preet: every frame has 16ms](https://preetsuthar.me/writing/every-frame-has-16ms): layout/paint/composite costs and why transform/opacity are the default.
- [Preet: what a spring actually is](https://preetsuthar.me/writing/what-a-spring-actually-is): position/velocity survive retargeting; duration-based springs can discard velocity.
- [Preet: iOS scrolling](https://preetsuthar.me/writing/the-maths-of-ios-scrolling): trailing velocity, projection, and bounded rubber-band resistance.
- [Preet: bigger touch targets](https://preetsuthar.me/writing/bigger-touch-targets-that-look-the-same): visual size and hit size need not agree; avoid overlapping targets.
- [Preet: shapes melting](https://preetsuthar.me/writing/how-shapes-melt-into-each-other): separate content from shape layers; full-area blur has a real cost. No goo filter is added to the transfer path.
- [Apple: Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/): immediate feedback, continuity, direct manipulation.
- [Emil: choreography](https://github.com/emilkowalski/skills/tree/main/skills/choreograph): one lead, no unnecessary queues or repeated-use staggers.

Run `npm run verify:motion`, or
`BROWSERS=chromium,firefox,webkit npm run verify:motion`. This isolated test
fixture is not a production route and makes no signaling requests.
