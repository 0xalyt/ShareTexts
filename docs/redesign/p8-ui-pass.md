# P8 — Preservation-First pass: design fingerprint and acceptance card

Method: `pasted_content.txt` / `ui-design-master-reference.pdf` (the same
Preservation-First UI Design Guide). Its rules that bound this pass: inspect
before changing, preserve identity, at most three high-confidence improvements,
evidence before and after, and never claim a check that was not run.

## Design fingerprint (app as it stands, before this pass)

| Observe | What this product is |
|---|---|
| Main job | Move text, links and files between two devices, in a browser, with no app install. Send/Receive is the whole story; pairing is a six-digit code. |
| Visual identity | Ember/orange mark, cream "paper" canvas, Apple-adjacent geometry — generous radii, hairline borders, one glass capsule holding loose instruments, display face on the wordmark only. Quiet by intent: no ambient blobs, no gradient washes. |
| System | Tailwind + a small token layer (`apple-*`, `night-*`, `st-lens`, `st-card`, `st-spotlight`), shared primitives (`BrandLockup`, `GlassCapsule`, `IconButton3D`, `ConfirmSheet`, `useFocusTrap`). 44px control rhythm, 40px in dense rows. |
| Hierarchy | One primary action per region (pair, send, receive). Header instruments recede behind the capsule. |
| Behavior | Focus traps with return, layered Escape (one layer per press), reduced-motion and reduced-transparency fallbacks, 11 locales with RTL, service-worker offline shell. |
| Constraints | 320px → desktop, touch and keyboard, light/dark, 11 locales, iOS-safe areas, motion budget measured at 4× CPU. |
| Protected qualities | The ember mark, the cream canvas, the capsule cluster, the 44px rhythm, the one-primary-action rule, the copy voice (plain, specific, no exclamation), every existing gate. |
| Known problems | `docs/redesign/bugs.md` — B23 (motion budget), B34/B35 (200% text reflow on /docs and /about), B2 fixed, B30 stale. |

## This pass: three changes, each classified

1. **B36 — defect correction.** At 200% text the landing header's rem padding
   doubled (20 → 40px) while its controls stayed 44px, pushing the theme toggle
   7px past the viewport. Fixed by pinning that one header's inline padding to
   20px. Protected: identical at every normal size, because 20px *is* what
   `px-5` resolves to at 100%.
2. **`npm run verify:robust` — verification.** Six assertions plus one
   KNOWN-OPEN line, so the class of bug above can never come back silently and
   the unfixed /docs overflow cannot quietly disappear from the record.
3. **B34 / B35 — logged, not fixed.** Both are real, measured, and outside a
   bounded fix: /docs needs a decision about the pill row's edge-fade bleed at
   enlarged text, and /about's overflow is not yet diagnosed.

### Acceptance card

```text
Goal:      The app stays usable for a reader who enlarges text — no clipped
           controls, no sideways panning on the core surfaces.
Observed:  B36: theme toggle clipped by 7px at 390px + 200% text.
Before/after conditions: production build, 320 / 390 / 390+200% text, light.
Changed:   Landing header inline padding px-5 -> px-[20px]; new verify:robust.
Preserved: Every size at 100% text, the capsule cluster, 44px controls, the
           cream canvas, all existing gates.
Checks performed: npm run verify:robust (6/6), smoke:local, verify-quality,
           tsc --noEmit, npm run build.
Checks not performed: real-device iOS/Android at 200% text; Safari; a manual
           visual review of /docs at 200% text (measured only, not looked at).
Tradeoff / remaining risk: B38 was still open in this pass (fixed in P8.1
           below); B39 was later retracted as a measurement error.
Decision:  keep.
```

## P8.1 — the /docs reflow fix (follow-up)

```
Goal:      Close B38 rather than keep printing it as known-open.
Observed:  /docs at 390px + 200% text panned 138px sideways (measured with a
           real scroll attempt, not a scrollWidth read).
First attempt, rejected: minmax(0,1fr) + break-words on the tiles. The page
           stopped panning and the gate went green — and the diagram became one
           letter per line. A green gate over destroyed content is worse than
           the bug; thrown away. (The screenshots are why the gate is not the
           only check.)
Second attempt, also rejected: an em-based track floor. `em` resolves against
           the tile's own fixed 13px font, so the floor never grew with the
           reader's text size — 84px of overflow survived.
Shipped:   minmax(3.5rem,1fr) — rem, so the floor follows the root text size —
           plus overflow-x-auto on the row so any surplus scrolls inside the
           diagram instead of moving the page. Text keeps whole words.
Evidence:  390+200%: pagePan 138 -> 0, inner row scroll 186 -> 100.
           390+100%: cells [114,90,114], row 342/342, no pan — identical to the
           live build, compared against sharetexts.online with the same probe.
           320+100%: pagePan 6 -> 0.
Checks performed: verify:robust (8/8), the /docs probe at 320/390 x 100/200%,
           visual review of /docs at 320+100% and 390+200% (screenshots).
Checks not performed: a real device at 200% text; Safari; whether readers
           discover the diagram's own horizontal scroll.
Tradeoff / remaining risk: at 200% text the two device tiles sit one word per
           line and the second tile is partly off-screen until swiped. B41 (the
           page header at 320px + 200% text, 68px) is logged and not fixed: it
           needs a decision about which header item gives way.
Decision:  keep.
```

## What this pass deliberately did not do

- No restyle, no new dependency, no font or palette change, no motion added.
- The reaction burst particles are still shipped: removing them is STEP 4 of
  the earlier plan, and doing it now would be a separate, measured change to a
  repeated action rather than a rider on this one.
