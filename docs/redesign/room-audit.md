# Room audit — DESIGN.md §19 against the code

Taken at `main` after `661f99e` (M2 STEP 0). One row per clause of §19. "Built"
means the code does what the clause says today; "partial" means part of the
sentence holds; "missing" means it does not exist and the clause is the work.

## Bar

| Clause | State | Evidence |
| --- | --- | --- |
| Floating Back circle | **BUILT** | `src/views/ChatView.tsx` header, `task-back` test id, used by every verifier |
| Centred title = device name (17/600) with a status line | **PARTIAL** | §19 records that P8 shipped ONE left-aligned line instead; the title is `session.partnerName`, the status line is the single dot + word + counts suffix |
| Live dot + "Same network" / "Through ShareTexts" | **BUILT** | ChatView status line derives the dot from the printed count, never from legacy `connectionType` (`ChatView.tsx:278` comment and the suffix it feeds) |
| Trailing glass capsule with at most 2 actions: Devices (count), More | **MISSING** | No capsule, no Devices sheet, no More sheet. The actions exist scattered: settings overlay, saved overlay, disconnect button |

## Empty room

| Clause | State | Evidence |
| --- | --- | --- |
| First thread entry, left-aligned, top-anchored, 112px drawing, one 18px sentence, one 13px line, three underlined text actions | **BUILT** | `ChatView.tsx:1437` (`chat.empty.dest`), `:1441` (`chat.empty.body`), starters nearby; P8 delivered this |
| Steps down 40px while the arrival toast is up | **BUILT** | same block, toast offset handled in P8 |

## Feed

| Clause | State | Evidence |
| --- | --- | --- |
| Mine = accent-soft, theirs = band fill, ink text | **BUILT** | `MessageCard.tsx:516` bubble wrapper |
| Radius 18 | **PARTIAL** | `MessageCard.tsx:516` is `rounded-[16px]`; images are 16 and cards 16 — the clause says 18 for the bubble |
| Max width 82% | **PARTIAL** | `MessageCard.tsx:514` and `:676` are `max-w-[85%] sm:max-w-[65%]` |
| Device name and time only when the sender changes or after 5 minutes | **MISSING** | `MessageCard.tsx:602-604` renders `msg.fromDevice` + `msg-time` on **every** incoming message; there is no grouping pass and no 5-minute rule anywhere in the tree (`grep -n "300000\|showMeta"` returns nothing) |
| Images radius 16 + 1px inset outline | **BUILT** | image bubble, `MessageCard.tsx:681` card and the thumbnail path |
| File cards: middle ellipsis, size, real progress bar with percent, state word | **PARTIAL** | size, progress bar and percent are real; the state word exists per transfer but not from the M1 vocabulary until this milestone — `attachmentState()` now maps it (`src/lib/itemState.ts`) |
| State word on the most recent own message only | **PARTIAL** | `DeliveryTick` shows Sent/Delivered/Seen on every own message; `showsStateWord()` exists in `itemState.ts` but no caller uses it yet |
| Thread is `role="log"`, polite announcements for new incoming only | **PARTIAL** | `ChatView.tsx:995` is a `role="status"` live region that announces an `announcement` string; the thread itself has no `role="log"` |
| Never announce progress percentages | **BUILT** | progress lives in the bubble, not the live region |
| `content-visibility: auto` for off-screen bubbles | **BUILT** | `src/index.css:1018` |
| Transfer progress out of React state (CSS var / ref) | **PARTIAL** | progress still flows through React state for the bubble; M1 measured no jank, but a 300-message thread has not been measured at 6× throttle |

## Composer

| Clause | State | Evidence |
| --- | --- | --- |
| One floating group, "+" glass circle, capsule 1–5 lines, orange Send circle scaling in | **BUILT** | `ChatView.tsx` composer; `npm run verify:composer` covers it |
| No formatting toolbar, no hint row, no recipient chip in the default view | **BUILT** | same |

## Tapbacks

| Clause | State | Evidence |
| --- | --- | --- |
| Long-press 500 ms | **BUILT as a trigger, wrong destination** | `MessageCard.tsx:195-214` `useLongPress` (500 ms) opens **selection mode**, not a reaction strip (`:455`) |
| Cancel when the finger moves > 10 px, scrolling wins | **BUILT** | same hook |
| Right-click on desktop | **MISSING** | no `onContextMenu` in `MessageCard.tsx` |
| Keyboard-reachable "React" button | **MISSING** | no React action; `msg.react` strings exist but are unused |
| Reaction strip above, action menu below | **MISSING** | neither exists |
| Badge on the bubble corner, tap toggles | **MISSING** | reactions render as a row, not a corner badge; `test:reactions` covers the row |

## Sheets

| Clause | State | Evidence |
| --- | --- | --- |
| Scrim `rgb(0 0 0 / 36%)`, no backdrop-filter | **PARTIAL** | `src/components/OverlaySheet.tsx` is the single sheet primitive (focus trap, Escape, scroll lock all live there); its scrim token has not been checked against 36% |
| Solid panel, radius 24, one floating shadow | **PARTIAL** | panel styling lives in the same file; radius/scale unverified |
| Glass only on Back circle, trailing capsule, composer (≤ 3) | **PARTIAL** | no trailing capsule exists yet, so the budget cannot be exceeded today |

## Desktop (≥ 1024 px)

| Clause | State | Evidence |
| --- | --- | --- |
| Master-detail: 320 px rail, Room on the right | **MISSING** | no rail; the desktop is one pane |
| `useRoomList()` hook returning `{ current, stay, recents }` | **MISSING** | no such hook |
| Content max-width 1440 px centred, no horizontal scroll | **PARTIAL** | desktop shell exists (`ChatView` max-w-3xl 2xl:max-w-4xl), not checked at 2560×1080 or 3440×1440 this milestone |

## What STEP 1–5 therefore have to build

1. Feed: grouping pass (sender change + 5-minute rule), radius 18, 82% width, `role="log"`, state word only on the last own message, measured 6× throttle number.
2. Tapbacks: right-click, keyboard React, strip above/menu below, corner badge, scroll-cancel proof in `test:reactions`.
3. Typing: OD-4 frame end to end, indicator, setting, PROTOCOL.md.
4. Devices + More sheets on the existing `OverlaySheet` primitive, scrim at exactly 36%.
5. Desktop rail behind `useRoomList()`.

Nothing in this audit was changed by STEP 0; it is a measurement, and the work
above is what remains.
