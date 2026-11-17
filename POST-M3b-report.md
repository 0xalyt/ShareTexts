# Post-M3b — the typeface, the room under stress, the mobile pass

**Branch:** `main` · **Date:** 2026-11-17 · **Live marker:** `18166e7925f7`

Two pieces of work that are not numbered milestones but changed the product
everywhere: the app now wears **Allo**, and the room was fed content nobody types
on purpose. Both are measured; the numbers are below.

---

## 1. Allo (`2fd5069`)

Allo is an interface typeface with an optical-size axis: 12 px labels and 40 px
headlines are separate drawings rather than one drawing scaled. SIL OFL 1.1, so
it ships.

**What is in the repo**

| File | Bytes | Why |
|---|---|---|
| `public/fonts/AlloVariableFriendly.woff2` | 229,028 | the UI face: opsz 9–32 and wght 100–900, roundness fixed at its default 50 |
| `public/fonts/OFL.txt` | 4,433 | the licence, beside the file — the OFL requires redistribution to carry it |

The **full** variable file is 442,544 bytes. The 213 KB difference buys exactly
one axis (`ROND`, corner roundness) whose default is already what interfaces
want. On the Redmi 9 this app is tested on, that is not a trade worth making; the
comment in `src/index.css` says so and says how to swap back.

**How it is used**

```
font-optical-sizing: auto          →  each size gets its own drawing
font-feature-settings:
  "ss02" 1                         →  serifed I, tailed l, footed 1, slashed 0
                                      (six-digit codes are read character by character)
  "case" 1                         →  punctuation lifts beside capitals
  "calt" 1                         →  a typed -> becomes a real arrow
```

Two tokens name the face — `--font-sans`, `--font-display` — plus one
`@font-face`. Inter stays behind Allo so an offline first paint still looks like
the product; the Apple branch (`html.apple-type`) keeps Allo first, so an iPhone
and a Redmi render the same family.

**Proof, measured on the live site**

```
stack:     Allo
loaded:    true
features:  "calt", "case", "ss02"
opt-size:  auto
request:   200 AlloVariableFriendly.woff2
```

**NOT VERIFIED:** I never looked at it. Computed styles and a 200 prove the font
arrived, not that 12 px captions read well on a 6-inch screen. The design
consequences (tracking at display sizes, weight pairing against the ember accent)
are unreviewed.

---

## 2. The room under stress (`18166e7`)

Harnesses: `scripts/stress-ui.mjs` (whole room, measures overflow and targets)
and `scripts/stress-cases.mjs` (isolated crops, for before/after).

Content sent, through the real composer, between two paired browsers: `a`, a
140-character URL, a 60-character unbroken word, a 300-character sentence,
`1234567890123`, `0`, `₹ 1,23,45,678`, Devanagari, eight emoji, and twelve short
items where the design was drawn for three.

| # | Case | Before | After |
|---|---|---|---|
| 1 | 140-character URL as a link message | bubble **1022 px** in a 390 px viewport; 12 elements past the right edge; text starting off-screen | **270 px**, one row, `example.com` + truncated path |
| 2 | 60-character word, no spaces | clipped at the right edge | wraps to three lines inside the bubble |
| 3 | Saved image whose blob URL is gone | broken-image glyph on a black lightbox; a hole in the thumbnail | file glyph in both places |

**Root cause of 1 and 2:** a bubble is an auto-width box, so a child that cannot
shrink sets the width from max-content. `truncate` and `min-w-0` were already on
the link row; they need a bounded ancestor. Fix: `min-w-0 max-w-full` on the
bubble, `max-w-[calc(100%+0.5rem)] overflow-hidden` on the anchor,
`[overflow-wrap:anywhere]` on the text body (fires only when there is nowhere
else to break).

**Held up unchanged:** twelve items, 13-digit numbers, zero, emoji, mixed
direction, and the composer's position with a full list above it.

**Proof**

```
mobile 390 : over the right edge 0 · clipped text 0 · page scrollWidth 390/390
desktop 1440: over the right edge 0 · clipped text 0 · page scrollWidth 1440/1440
```

Screenshots (git-ignored, on the owner's machine):

```
audit/stress/before-390-viewport.png     ← the before, same three messages
audit/stress/after-390-viewport.png      ← the after
audit/stress/{before,after}-room-390.png
audit/stress/{before,after}-room-1440.png
audit/stress/report-{before,after}.json  ← raw counts
```

Written up in `docs/redesign/stress-pass.md`.

---

## 3. Mobile web pass (`18166e7`)

| Check | Finding | Action |
|---|---|---|
| Safe-area bottom | already honoured in 8 places (composer, sheets, footers, install nudge, detect overlay) | none |
| **Safe-area left/right (landscape notch)** | **gap** — `viewport-fit=cover` was set, the insets were never spent | added `env(safe-area-inset-left/right)` on `#root` under `(orientation: landscape)` |
| **Link row tap target** | **40 px** | `min-h-[44px]` |
| Input zoom | 14 fields across 6 surfaces, **all ≥ 16 px** | none — gate green on iPhone and Pixel profiles |
| Hover-only actions | Nearby delete is `opacity-100` by default, fades only under `@media (hover: hover)` | none |
| Bottom bar over content | composer is a flex sibling of the scroller, not an overlay; 10 px gap at 390 | none |
| 390 px layout | room, composer, banner, 12-item list all fit | `verify-mobile-ui` green |

**Deliberately not changed:** desktop rail icon buttons (Disconnect, Save, Copy)
are 40 × 40. Pointer surface, meets the project's 40 px gate; raising them would
change the rail's rhythm for every desktop user to satisfy a thumb rule that does
not apply there.

**NOT VERIFIED:** a physical phone. Safe-area insets, the notch and the home
indicator were measured in Chromium profiles and in CSS — emulation gets those
closest to lying.

---

## 4. Gates run for this work

`npm run lint` clean · `npm run build` 0 · `npm run verify:bundle` GREEN
(175.1 KB) · `verify-input-zoom` 14/14 ≥ 16 px · `verify-mobile-ui` ALL GREEN ·
`npm run smoke:local` GREEN · live marker `2fd50694a2d1` (type) and
`18166e7925f7` (layout), `scripts/smoke-live.mjs` GREEN after both.

## 5. Files changed

```
public/fonts/AlloVariableFriendly.woff2 · public/fonts/OFL.txt   (new binaries)
src/index.css            @font-face, tokens, features, landscape insets
index.html               font preload
src/components/MessageCard.tsx        bubble/link/text bounds, 44 px row
src/components/SavedItemsOverlay.tsx  two image fallbacks
DESIGN.md · SHARETEXTS-PROJECT-STATE.md
scripts/stress-ui.mjs · scripts/stress-cases.mjs (new)
docs/redesign/stress-pass.md (new)
```

## 6. Questions (with my recommendation)

1. **Do you want the full Allo variable file (ROND axis, +213 KB)?** Recommended:
   no for the shipped app, yes for a design branch where we audition roundness.
2. **Should the desktop 40 px icon buttons become 44?** Recommended: no — keep
   the rail's density; revisit only if he starts using a touch laptop.
3. **Does the type need its own tuning pass** (display tracking, weight pairing
   against ember)? Recommended: yes, one short pass, with your screenshots —
   Allo's display cut is tighter than Inter's at the same size.

## OWNER ACTIONS

1. Look at the app on the Redmi and tell me if the captions read thin. That is
   the one judgement I cannot make from measurements.
2. Reinstall the PWA once, so the cached CSS and the new font are picked up
   cleanly on the home-screen icon.
