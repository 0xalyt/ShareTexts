# Detail pass — the full list, with status

Every item from the brief, in the order it was given. Status is what the code
does now, checked in the repo — not what a plan says it will do.

Legend: **done now** = written in this pass · **already** = the product already
did it (verified in code, and where possible in the browser) · **pending** = not
built, with the reason.

| Detail | Status | Where / why |
|---|---|---|
| Smarter word break | **done now** | `[overflow-wrap:anywhere]` breaks an unbroken token only when there is no other place; `text-wrap: pretty` on `.st-body`; new `word-break: auto-phrase` under `@supports` for CJK, where every character is a legal break and particles end up stranded. |
| Interfaces that survive translation | already | Every string is `t()` across 11 locales; buttons are `min-h` + flexible, not fixed-width; labels sit above fields rather than inside them. New copy always lands with its keys. |
| Smart corner morph | pending | The sheets morph by scale, not by radius. A true morph needs a single shape element animated between two rects — worth its own pass. |
| Adaptive text colour | pending | Captions over user photos still use a fixed scrim. Proper version samples the media or uses a gradient measured against the worst case. |
| Respect platform language | already | i18n auto-detects and stores the choice; `<html lang/dir>` follows it, so `:lang()` and screen readers agree. |
| Avoid browser back on side swipe | **done now** | `overscroll-x-contain` on every horizontal scroller: marketing flow, code blocks, the formatting strip, docs tabs. Verified: 4 scrollers, all `contain`. |
| Clicking a label focuses the field | **done now** | The receive screen's "Your code" label could not be clicked — six cells look tappable but the words are the biggest thing on screen. It forwards focus to the first cell (`htmlFor` cannot point at a group). Verified in the browser. |
| Platform-agnostic shortcut labels | already | `modKey` renders ⌘ on Apple platforms and Ctrl elsewhere (`ChatView` formatting shortcuts). |
| Screen-shaking feedback | **done now** | `st-shake` — three decaying 6 px beats, 360 ms, paired with the error line and the haptic; off under `prefers-reduced-motion`. Verified: class present after a rejected code. |
| Custom video player in the room | pending | The room does not render an inline player; video arrives as a file. Building a player before there is anything to play it in is backwards. |
| Blurred icon transition | pending | Icon states cross-fade by colour/scale today; the blur variant belongs with the icon set rewrite. |
| Custom scrollbar | already | `scrollbar-width: thin` + `::-webkit-scrollbar` 8 px, transparent track; `room-scroll` for the thread. |
| Progressive bottom blur edge | already | `st-scroll-fade-y` / `st-edge-fade`, with a mask (not an overlay) so it cannot cover the scrollbar — see next row. |
| Fade edge must not cover the scrollbar | already | The fades are `mask-image` on the scroller, so the bar stays visible and draggable. |
| Visual alignment for icon buttons | already | The 36 px leading slot and the alignment audit (`scripts/align-audit.mjs`) exist for this; glyphs are optically centred, not box-centred. |
| Special text selection | already | `::selection` themed in both modes (ember wash light, azure dark). |
| Prevent continuous click | already | `sendingRef` gate in `ChatView` — a second tap during a send returns before it does anything. |
| Chat minimap | pending | Desktop-only, needs a message-density map and a viewport handle; a real component, not a class. |
| Footer easter egg | pending | Not built. |
| Lifecycle indicator | **done now** | The pairing code now carries a 3 px bar that drains against the code's real 90 s window, amber at 15 s with the caption. Test `bar agrees with the caption it illustrates` compares the bar's width with the `m:ss` text so it cannot drift from the truth. |
| Shake a disabled button on click | pending | Disabled buttons swallow the click by definition; the honest version is to keep the button enabled-looking and explain on tap. Needs a decision, not a class. |
| Avoid WebP for OG image | already | `og:image` is a 1200×630 `.jpg`. |
| Outer and inner border radius (concentric) | already, mostly | Cards use radius = inner + padding at the sizes in use (16 outer / 12 inner); a full sweep of nested radii has not been audited. |
| Search by context, not keywords | pending | Search is a filter over titles. Context search means indexing room contents, which is a privacy decision before it is a UI one. |
| Overscroll in nested scrollers | already | Every sheet/thread body uses `overscroll-contain`; horizontal ones now contain x too. |
| Rich previews for external URLs | already | `LinkCard` resolves pasted URLs into a card in the bubble. |
| Convert internal URLs to rich previews | pending | Would reuse `LinkCard` for `sharetexts.online/…` — small, but needs a resolver that knows our routes. |
| Smooth highlight block transition | already | Selected segments animate their highlight with the shared sheet curve. |
| Interruptible animation | already | Interactive state changes are CSS transitions; keyframes are reserved for staged, one-shot sequences. |
| Interactive 404 | pending | `app.404` copy exists; the page is static. |
| Animated action button | already | `press` + `active:scale-[0.96]` — one value across all 55 sites. |
| Dynamic visual guideline | pending | Needs a table; the app has no data table yet. |
| CSS text-box-trim | **done now** | `.st-trim` utility plus `text-box-trim` on `.st-display`, so the hero's box ends at the cap and the baseline instead of the font metrics. Ignored by browsers that don't parse it. |
| Themed favicon | already | Full icon set including `favicon.svg`, plus `media`-scoped `theme-color` pairs. |
| Themed icon for PWA on Android | pending | Needs a maskable icon variant in the manifest. |
| Collapse instead of close | pending | Sheets dismiss by drag/close; a "hide" affordance needs somewhere to hide *to*. |
| Text overflow cutoff | already | Truncating labels use ellipsis; gradient masks where a tab strip would otherwise hard-cut. |
| File path truncating (root + filename) | pending | File rows show the name; there is no full path in the UI yet. |
| Dynamic favicon | pending | Would communicate "someone is waiting" in a background tab. Worth doing, but it needs the unread state to be reliable first. |
| Dynamic theme color | already | Two `media`-scoped `theme-color` metas follow the OS theme; the in-app theme toggle does not rewrite them on iOS-style browsers — that part is pending. |
| Reduced animation for frequent actions | already | Motion is on state changes only; reduced-motion removes the halo, the shake, the marquee and the sheet spring. |

New gate: `scripts/verify-details.mjs` — 6/6 (lifecycle bar renders and agrees
with its caption, the bar moves with the clock, label focus, rejection shake,
horizontal scrollers contain the gesture).

## Not in this pass, and next

The device demo you asked for (phone + MacBook running ShareTexts, a live
transfer between them, one caption line under it, both looping together) is a
build of its own: it needs a timeline the two device frames and the caption both
read from, so the words and the picture cannot drift, and a reduced-motion
static that still explains the product. `HeroDeviceDemo.tsx`,
`landing/ProductLoop.tsx` and the loop recorder already provide the pieces
(frames, poster-first video, visibility-gated playback); the missing part is the
shared timeline plus captions that are written in the product's own voice.
That work is not started, and it is the next pass rather than a line item here.
