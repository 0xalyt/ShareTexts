# Stress pass — awkward content + mobile web

Two harnesses, both real: `scripts/stress-ui.mjs` pairs two browsers and floods
the room with one character, a 140-character URL, a 60-character word, a
sentence, `1234567890123`, `0`, `₹ 1,23,45,678`, Devanagari, emoji, and twelve
items where the design was drawn for three. `scripts/stress-cases.mjs` isolates
the three worst shapes so a before and an after are the same crop.

## What broke, measured at 390 × 844

| # | Case | Before | After |
|---|---|---|---|
| 1 | A 140-character URL as a link message | the bubble measured **1022 px** wide inside a 390 px viewport: 12 elements past the right edge, the text starting off-screen left | **270 px**, one row, `example.com` + a truncated path |
| 2 | One 60-character word (no spaces) | crossed the right edge, clipped | wraps to three lines inside the bubble |
| 3 | A saved image whose blob URL is gone | browser's broken-image glyph on a black lightbox; a hole in the thumbnail | the file glyph, the lightbox closes over it cleanly |

Cause of 1 and 2: a message bubble is an auto-width box, so a child that cannot
shrink sets the width from max-content. `truncate` and `min-w-0` were already on
the row — they need a bounded ancestor. Fix: `min-w-0 max-w-full` on the bubble,
`max-w-[calc(100%+0.5rem)] overflow-hidden` on the link anchor, and
`[overflow-wrap:anywhere]` on the text body (it fires only when there is nowhere
else to break, so ordinary sentences are untouched).

Held up unchanged: twelve items in a row, numbers to 13 digits, zero, emoji,
mixed direction. `clipped text: 0`, `over the right edge: 0`, page `scrollWidth`
= viewport on both widths.

## Mobile web pass

| Check | Result |
|---|---|
| Safe-area insets | bottom inset honoured in 8 places (composer, sheets, footers, install nudge, detect overlay). **Landscape notch was uncovered** — added `padding-left/right: env(safe-area-inset-left/right)` on `#root` under `(orientation: landscape)`; `viewport-fit=cover` is already set |
| 44 px targets | mobile scan: only the hidden skip link and the link row at 40 px. Link row raised to `min-h-[44px]` — it is a tap target |
| Input zoom | `verify-input-zoom` — **14 fields across 6 surfaces, all ≥ 16 px**, no keyboard zoom on iPhone or Pixel profiles |
| Hover-only actions | the Nearby delete control is `opacity-100` by default and only fades under `@media (hover: hover)`; the pencil affordances sit at `opacity-40` (visible, not hidden) |
| Bottom bar covers content | no: the composer is a flex sibling of the scroller, not an overlay. Measured bottom gap 10 px (mobile) / 20 px (desktop) at 390 and 1440 |
| 390 px width | room, composer, banner and 12-item list all fit; `verify-mobile-ui` green |

Not fixed, deliberately: the desktop rail's icon buttons (Disconnect, Save,
Copy) measure 40 × 40. They are pointer targets in a 1440 layout, they meet the
40 px gate the project already sets, and raising them to 44 changes the rail's
rhythm for every desktop user to satisfy a touch rule that does not apply there.

## Screenshots

`audit/stress/` (git-ignored):

- `before-390-viewport.png` / `after-390-viewport.png` — the same three cases
- `before-case-link.png`, `before-case-list-top.png`, `after-case-link.png`, `after-case-list-top.png`
- `before-room-390.png`, `after-room-390.png`, `before-room-1440.png`, `after-room-1440.png`
- `report-before.json`, `report-after.json` — the raw counts
