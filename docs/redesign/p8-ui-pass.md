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
Tradeoff / remaining risk: B34 and B35 remain; enlarge-text users on /docs
           still pan horizontally by 138px.
Decision:  keep.
```

## What this pass deliberately did not do

- No restyle, no new dependency, no font or palette change, no motion added.
- The reaction burst particles are still shipped: removing them is STEP 4 of
  the earlier plan, and doing it now would be a separate, measured change to a
  repeated action rather than a rider on this one.
