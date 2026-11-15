# M2 — The Room

**Tag:** `before-M2` (pushed) · **Branch:** `main` · **Date:** 2026-11-15

Status: prerequisites cleared, STEP 0 and **STEP 1 shipped**. STEPs 2–5 are not
started; the BUDGET RULE forbids starting a step that cannot be finished and
verified in the same run, and they are listed as untouched rather than
half-built.

## 1. Prerequisites — all four satisfied

| Required | Commit | Proof |
| --- | --- | --- |
| `src/lib/itemState.ts` | `c6bfcb0` | one vocabulary, consumed by `MessageCard` and now by the feed's state-word rule |
| `scripts/verify-no-flash.mjs` | `c6bfcb0` | clean: 0 ms blank, 0 white frames, no `skipWaiting()` |
| `SHARETEXTS-PROJECT-STATE.md` | `c6bfcb0`, `f9e74a4` | §4–8 in place, bundle line updated |
| Bundle ≤ 180 KB | `661f99e` | **219.9 → 179.0 KB** gzip, PASS |

## 2. STEP 0 — audit (`f9e74a4`)

- `git tag before-M2` pushed.
- `docs/redesign/room-audit.md`: every §19 clause and the desktop rules marked
  BUILT / PARTIAL / MISSING with `file:line`.
- Six before-shots of a real paired room in `docs/redesign/shots/m2-before/`
  (320×568 → 2560×1080) from `scripts/shots-m2-before.mjs`.

## 3. STEP 1 — feed and bubbles (`f3e07f8`)

| Requirement | State | Evidence |
| --- | --- | --- |
| Name and time only on sender change or after 5 minutes | **shipped** | `ChatView` computes `showMeta` per message (sender change OR ≥ 5 min gap); gate measured 3 meta rows for 3 blocks of 5 messages |
| State word on the most recent own message only | **shipped** | `showStateWord` + `isFailed()`; gate measured 1 state word for 4 own messages |
| Radius 18, max width 82% | **shipped** | measured in the browser: 18px, 79.4% for a short line |
| `role="log"`, polite, additions only | **shipped** | gate reads the attributes off the thread |
| No percentage in a live region | **shipped** | gate asserts zero matches |
| `content-visibility: auto` | already built | `src/index.css:1018` |
| 6× CPU throttle measurement | **done** | 20/20 messages delivered, ~738 ms per message including the sender's own pacing |

Gate: `node scripts/verify-room-feed.mjs` → **GREEN, 6/6**.

Not done inside STEP 1: progress is still React state for the bubble (the CSS
variable/ref optimisation) — measuring first showed no dropped frames, so it was
not changed blindly.

## 4. NOT VERIFIED (strict)

- **STEPs 2, 3, 4, 5 and 6 are untouched.** No tapbacks, no typing frame, no
  Devices/More sheets, no desktop rail.
- The five-minute rule is implemented and unit-reasonable, but the gate proves
  the *sender-change* half; breaking a block across a real five-minute gap was
  not clock-simulated.
- The after-shots for the feed were not captured (only before-shots exist).
- No measurement on the owner's Redmi 9; the throttle number comes from CDP at
  6×, not from the device.

## 5. Untouched steps

STEP 2 tapbacks · STEP 3 typing indicators (OD-4) · STEP 4 Devices/More sheets ·
STEP 5 desktop master-detail · STEP 6 polish (`break-ui`, `review-animations`).

## 6. Files changed this milestone

`src/lib/itemState.ts`, `src/components/MessageCard.tsx`, `src/components/CommandBarChip.tsx`,
`src/components/CommandBar.tsx`, `src/components/send/SendScreen.tsx`,
`src/views/SingleScreenApp.tsx`, `src/views/ChatView.tsx`,
`src/lib/messages/*.ts` (new `chat.threadAria` in 9 locales),
`scripts/verify-no-flash.mjs`, `scripts/verify-room-feed.mjs`,
`scripts/shots-m2-before.mjs`, `docs/redesign/room-audit.md`,
`docs/redesign/shots/m2-before/*`, `SHARETEXTS-PROJECT-STATE.md`,
`M2-report.md`, `M2-blocked.md`.

## 7. New gates

`verify:no-flash` · `verify:room-feed` (new) · `verify:claims` · `verify:icons` ·
`verify:chaos` · `verify:bundle` (PASS at 179.0 KB).

## 8. Questions (with recommendations)

1. **Tapbacks trigger** — §19 says long-press opens the reaction strip, but
   long-press currently enters selection mode. Confirm the move (Select then
   lives in the menu). *Recommendation: as §19 says.*
2. **Typing default ON** — one small frame per 3 s while typing, on the Redmi
   too. *Recommendation: ON, per OD-4.*
3. **Desktop rail data** — `useRoomList()` can only be filled from
   `sessionStorage` until M4's Linked devices. *Recommendation: ship on
   `sessionStorage` behind the stable hook.*

## 9. OWNER ACTIONS

- Answer 1 before STEP 2 lands, since it decides what long-press means.
- Check the live build (this push touches `src/`): the room should now show one
  name/time per run of messages and one receipt on the newest own message.
- Expect the next step to push the entry chunk past 180 KB again; it will need a
  re-measure, not a re-base.
