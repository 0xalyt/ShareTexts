# Interaction map (P2, STEP 0)

One row per meaningful interaction. "Now" is the code as it stood at tag
`before-p2`; "P2" is the row this phase implements. Every row is checkable by
hand.

Durations are the Apple-DNA grammar from DESIGN.md §18. Where the code differs
today, the row says so plainly.

| # | Trigger | Immediate response | Transition | Result | Back or cancel | State kept |
|---|---|---|---|---|---|---|
| 1 | Tap **Send** (`home-send`) | press: translateY(2px), edge 3→1px in 60 ms (`TactileButton`, §6) | **Now** 120 ms `opacity` crossfade in an `AnimatePresence` (`SingleScreenApp.tsx:1155`). **P2** push 280 ms: pairing enters from the right, Home shifts −8% and dims to .96 (`ScreenStack`) | Pairing screen: two-device scene + six-digit code (`create.title`, `LiveCodeDisplay`) | In-app Back = `handleCancel()` (`:709`, aborts the create, returns Home, no confirm). **P2** also: browser/Android Back does the same | Home scroll position; locale, theme; nothing typed is lost (the intent field's text is consumed once by the room) |
| 2 | Tap **Receive** (`home-receive`) | press feedback as above | **Now** 120 ms crossfade. **P2** push 280 ms | Receive screen: six OTP boxes, first box focused, keyboard up (`LiveCodeInput`, `autoFocus`) | In-app Back (`handleCancel` → idle). **P2** browser Back too | Home scroll; chosen method |
| 3 | Type the **6th digit** | boxes fill; capsule locks with an in-place "Joining…" (`LiveCodeInput` `isJoining`) | none until the server answers | code accepted → green capsule → connecting panel (`panelMode 'connecting'`) → Room on channel open | A wrong code shakes + wipes + refocuses **in place**; digits stay until wiped. Back leaves the flow | digits on error; Home scroll behind |
| 4 | Tap a **nearby row** (device) | press feedback on the row | **Now** the list is inline in the Home column (`NearbyDevices.tsx`, no sheet). **P2** sheet: rise 320 ms with grabber, drag to dismiss, Esc | Sheet with the device list, then the two switches, then "Why isn't my device showing?" | drag down past 28% of height or 0.6 px/ms, Esc, or the close control | Home scroll; discovery keeps running under the sheet |
| 5 | Tap a **device** inside the sheet | the row states "Asking…" (invite sent) | none — the answer is what moves | invite accepted → connect moment → Room; declined → row returns to idle with a quiet note | Cancel in the row; the sheet stays open | sheet stays open; Home scroll |
| 6 | **Code \| QR \| Link** (pairing screen methods) | the chosen method replaces the previous content | **Now** the three are separate buttons (Show QR opens an overlay, Share link copies) — there is no tab control. **P2 does not add one** (out of scope: the pairing screen is P-room-shell) | method content | not needed | chosen method for this session |
| 7 | Tap **More** (header, phones) | press | **Now** no More control: the header carries language + theme + saved + docs. **P2** sheet 320 ms (phones) / popover 175 ms (desktop) | Saved, Docs, Guides, Search, About, Privacy, Terms | Esc, backdrop, drag | none |
| 8 | Tap the **theme glyph** | the glyph morphs sun↔moon (shipped `2cc2082`-equivalent: `ThemeToggle`) | none (morph only) | theme switches, persisted in `sharetext.theme` | not needed | none |
| 9 | Tap **Stay connected** (re-entry card) | press on the card | **Now** spring 320 ms enter. **P2** unchanged | rejoins the remembered room | Back leaves it again | room history |
| 10 | **Browser/Android Back** in the Room | nothing visible on the first press | **Now** `ChatView.tsx:487-523` pushes one history entry for the room and a popstate opens the Disconnect confirm sheet. **P2** matches §18: 280 ms reverse push | Back asks "Leave this room?" (`ConfirmSheet`) when another device is connected or the room has items, else leaves directly | Stay keeps the room and re-pushes the entry | messages, drafts, roster |
| 11 | **Escape** in any sheet | sheet closes | 190 ms out | back to the surface that opened it | — | the opener's state |
| 12 | Drag a **sheet** down | content follows the finger (`--drag`) | release: snap back 240 ms or dismiss 190 ms | dismissed or restored | drag < 28% and < 0.6 px/ms = snap back | opener's state |
| 13 | Any press with **prefers-reduced-motion** | no travel | crossfade 140 ms | same result, no motion | — | — |
| 14 | Any press with **html.no-glass** / reduced transparency | solid fills | unchanged | same result | — | — |

## What this map corrects in the prompt's draft

- Row 6: the draft says the pairing screen already has a `Code | QR | Link`
  segmented control whose thumb slides 240 ms. It does not. The screen has
  three separate actions (`SingleScreenApp.tsx:1222-1240`: Show QR opens an
  overlay, Share link and Copy code are buttons). Adding that control belongs
  to the pairing-screen phase, not P2 — recorded here so nobody "fixes" the
  map by inventing UI.
- Row 4: `NearbyDevices` is **inline** on Home, not a sheet. P2 introduces the
  sheet, and keeps discovery running underneath it (the component's own state
  is what the sheet shows; nothing remounts).
- Row 10: history for the Room exists (`ChatView`), history for Home →
  Send/Receive → Connecting does not. P2 adds the missing levels; it does not
  replace ChatView's mechanism, which already unwinds its own entry correctly
  (the popstate carries a generation tag so a replayed event cannot re-open a
  sheet).
- Row 1/2: the panels are `opacity` crossfades at 120 ms, not pushes. P2 adds
  the push and keeps the crossfade for mode changes only.
