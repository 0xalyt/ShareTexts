# M2 — The Room

**Tag:** `before-M2` (pushed) · **Branch:** `main` · **Date:** 2026-11-15

M2 was blocked at its own prerequisite check (`M2-blocked.md`). This run cleared
every prerequisite, shipped STEP 0, and stopped before STEP 1. The BUDGET RULE
says not to start a step that cannot be finished and verified, so STEPs 1–5 are
listed below as untouched rather than half-built.

## 1. Prerequisites — all four now satisfied

| Required | Delivered | Proof |
| --- | --- | --- |
| `src/lib/itemState.ts` | `c6bfcb0` | one vocabulary `queued → sending → sent → delivered → seen` + `failed/paused/expired`; `MessageCard`'s delivery tick reads both state and label from it |
| `scripts/verify-no-flash.mjs` | `c6bfcb0` | clean — 166 frames on landing → room with 0 ms blank, 0 white frames; static proof that `sw.js` has no `skipWaiting()` |
| `SHARETEXTS-PROJECT-STATE.md` | `c6bfcb0` | §4–8 in place, bundle failure recorded |
| Bundle ≤ 180 KB | `661f99e` | **219.9 → 179.0 KB gzip** (1.0 KB under), `npm run verify:bundle` PASS |

The bundle cut was real deferral, not a re-based budget: SpaceView's sheets
(10.7 KB, they were dragging the whole lazy view into the entry), `QrArt`
(10.9 KB, drawn in one segment of one screen), `CommandBar` (6.0 KB, with its
6-line chip split into `CommandBarChip.tsx` so the header stops carrying the
palette), and Settings / Saved / Nearby (15.7 KB, all opened rather than
visited). Every one is a `React.lazy` with a same-size placeholder where a slot
matters, so nothing shifts when the chunk lands.

## 2. STEP 0 — audit (shipped)

- `git tag before-M2` created and pushed.
- `docs/redesign/room-audit.md`: every clause of `DESIGN.md` §19 plus the
  desktop rules, each marked BUILT / PARTIAL / MISSING with `file:line`.
- `docs/redesign/shots/m2-before/` — six captures via
  `scripts/shots-m2-before.mjs` (which pairs two devices and photographs the
  real room): 320×568, 390×844, 844×390, 768×1024, 1440×900, 2560×1080.

What the audit found, in short:

| §19 clause | State |
| --- | --- |
| Bar: Back circle, status dot + word | BUILT |
| Bar: centred title, trailing glass capsule, Devices/More | MISSING (P8 shipped a left-aligned one-liner) |
| Empty room | BUILT (P8) |
| Feed: fills, images, file cards, progress | BUILT (bubble radius is 16, not 18; width 85/65%, not 82%) |
| Feed: name + time only on sender change or after 5 min | **MISSING** — every incoming message prints its own name and time |
| Feed: state word on the last own message only | PARTIAL — `showsStateWord()` exists, no caller |
| Feed: `role="log"` | PARTIAL — a `role="status"` live region exists, the thread is not a log |
| Tapbacks: 500 ms long-press with 10 px cancel | BUILT as a trigger, wired to **selection mode** |
| Tapbacks: right-click, keyboard React, strip, menu, badge | MISSING |
| Composer | BUILT |
| Sheets: scrim 36%, solid panel, radius 24 | PARTIAL — one primitive (`OverlaySheet`) owns focus trap / Escape / scroll lock; scrim token unverified |
| Desktop master-detail, `useRoomList()` | MISSING |

## 3. NOT VERIFIED (strict)

- **STEPs 1–5 were not started.** No feed grouping, no tapbacks, no typing
  frame, no Devices/More sheets, no desktop rail. Nothing in this report claims
  otherwise.
- The six before-shots were captured, not reviewed by a person.
- The sheet scrim value is recorded as unverified: it was read from the
  component, not measured off a rendered pixel.
- The bundle win is measured by `verify:bundle` only; no field measurement on
  the owner's Redmi 9 has been taken this milestone.
- `verify:chaos`, `verify:claims`, `verify:icons`, `smoke:local` and
  `verify-no-flash` all pass after the split, but the split's own runtime cost
  (a chunk fetch when a sheet opens) was not measured on a slow device.

## 4. Untouched steps (carry to the next prompt)

STEP 1 feed and bubbles · STEP 2 tapbacks · STEP 3 typing indicators · STEP 4
Devices and More sheets · STEP 5 desktop master-detail · STEP 6 polish (and the
`break-ui` / `review-animations` passes).

## 5. Files changed

- `src/lib/itemState.ts` (new), `src/components/MessageCard.tsx`
- `scripts/verify-no-flash.mjs` (new), `scripts/shots-m2-before.mjs` (new)
- `scripts/verify-icons.mjs` (new, M1 follow-up), `docs/claims.forbidden.json`,
  `scripts/verify-claims.mjs`
- `src/views/SingleScreenApp.tsx`, `src/components/send/SendScreen.tsx`,
  `src/components/CommandBar.tsx`, `src/components/CommandBarChip.tsx` (new)
- `docs/redesign/room-audit.md` (new), `docs/redesign/shots/m2-before/*`
- `SHARETEXTS-PROJECT-STATE.md` (new), `M1-report.md`, `M2-blocked.md`,
  `M2-report.md`

## 6. New gates

`npm run verify:no-flash` · `npm run verify:claims` · `npm run verify:icons` ·
`npm run verify:chaos` · `npm run verify:bundle` (now PASS at 179.0 KB).

## 7. Questions (5, with my recommendation)

1. **Feed grouping (STEP 1)** — the clause says name + time only on sender
   change or after 5 minutes of silence. Confirm the 5-minute window, or is 2
   minutes the feel you want on a phone? *Recommendation: 5 minutes as written.*
2. **Bubble geometry** — §19 says radius 18 and 82% width; the code is 16 and
   85/65%. Change the code to the spec, or the spec to the code? *Recommendation:
   change the code; the spec is the approved one.*
3. **Tapbacks on touch** — long-press currently opens selection mode, which
   people also use to copy several messages. Move selection to the menu only, or
   keep long-press for selection and put tapbacks on double-tap? *Recommendation:
   follow §19 — long-press opens the strip, "Select" moves into the menu.*
4. **Typing setting default** — OD-4 says ON. Confirm you want typing frames
   sent by default on the Redmi (it is one small frame per 3 s while typing).
   *Recommendation: ON, as OD-4 says.*
5. **Desktop rail** — `useRoomList()` today can only be filled from
   `sessionStorage` (current room, Stay Connected room, `pairing.ts` recents).
   Ship the rail on that, or wait for M4's Linked devices? *Recommendation: ship
   on `sessionStorage` behind the stable hook, exactly as the prompt says.*

## 8. OWNER ACTIONS

- Confirm answers to 1–3 before STEP 1/STEP 2 code lands; each of them changes
  what gets built.
- Check the live build after this push (it is `src/`-touching): the landing
  should feel identical, with the QR and sheets now fetched on first use.
- If the 179.0 KB figure matters to you, note it is 1 KB under the ceiling —
  the next M2 step adds code, so this gate will need another look during STEP 1.
