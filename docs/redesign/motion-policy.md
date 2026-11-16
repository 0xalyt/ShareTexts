# Motion policy — two surfaces, two rules

Status: **proposal**, nothing below is implemented yet.

The repo already has the vocabulary (`src/lib/motion/tokens.ts`, `--ease-*` in
`apple-dna.css`) and a hard rule that nothing enters from `scale(0)`. What it
does not have is a rule about **how often** a thing moves. That is the split
below.

## 1. Where the line is

| surface | files | who sees it | how often |
|---|---|---|---|
| **Marketing / first-run** | `views/SingleScreenApp.tsx` (idle + landing), `components/marketing/*`, `App.tsx` not-found, `views/Docs.tsx` | someone deciding whether to use this | once, maybe twice |
| **Product** | room (`views/ChatView.tsx`, `MessageCard`, `Composer`), send/receive (`send/SendScreen.tsx`), nearby (`NearbyDetectOverlay`, `NearbyDevices`), sheets, settings, palette, toasts | someone transferring a file | tens to hundreds of times a day |

The line is not "which file folder" — it is **how many times the same person
will see the same motion**. A logo animation seen once is an introduction; the
same animation seen on the fortieth file is a tax.

## 2. Product policy — frequency decides

The more often something happens, the less it may move. Things people do all
day do not animate for delight.

| frequency | example | allowed |
|---|---|---|
| **every message / every send / every reaction** | new bubble, delivery tick, chip, file hand-off | **none.** State changes in place. No entrance, no scale, no bounce, no travel. |
| **every minute or so** | typing indicator, connection state, unread count | one opacity or colour change, ≤150ms. Motion only if it carries information (that it is live), and it stops the moment the state does. |
| **on intent, a few times an hour** | open sheet, open palette, open attachment panel, switch mode | structural: 180–280ms, `--ease-out` enter / `--ease-in-out` move, one property (position or opacity). |
| **rare / destructive** | confirm delete, disconnect, language switch, error banner | no flourish at all. The words are the design. |

Rules that follow from that:

- **Feedback is not animation.** A pressed button scales to 0.97 in 160ms; a
  receipt swaps glyph and colour. Neither is a "moment".
- **No looping "alive" decoration.** A pulse is allowed only while a state is
  genuinely pending, and must stop when it stops being pending. Four forever
  loops saying "online" is three too many.
- **Content is not an event.** A message, a row, a device, a saved item is
  *data*. Datum does not enter; it is there.
- **No bounce in the product.** Overshoot on a daily surface reads as
  unreliability, and it is the one thing the owner has already banned twice.

## 3. Marketing / first-run policy — exactly one moment

One orchestrated motion per marketing surface, and it must:

1. **play once** per visit (not on scroll-back, not in a loop);
2. **tell the product's story in one beat** — what it is, in ~2.5–3s;
3. **end on a settled frame** that is the same as the resting layout, so a
   screenshot taken at any later point is correct;
4. **collapse to its end state** under `prefers-reduced-motion`.

Everything else on that surface is static layout. A page that animates every
section as you scroll has not chosen a moment; it has chosen noise.

## 4. Product: motions to remove

Ordered by how often they fire. `f` = the frequency of the trigger.

| # | file:line | what happens now | f | why it goes |
|---|---|---|---|---|
| 1 | `components/MessageCard.tsx:704` | every bubble springs in: `opacity 0→1`, `y 6→0`, and for partner messages a `scale 1.015→1` land, spring 380/26 | every message | the single most frequent event in the product; the thread already shows arrival by growing |
| 2 | `views/ChatView.tsx:1018` → `components/TransferFlight.tsx` | a chip flies across the viewport on every file send: `translate3d` 250ms + scale/opacity 200ms, `pointer-events:none` overlay | every file | it delays the message it is celebrating, and the card's own progress ring already says the same thing |
| 3 | `components/spaceui/EmojiReaction.tsx:170` | 5-particle burst per reaction: travel, drift, blur, scale ramp | every reaction | pure delight on a repeated gesture; the count on the chip is the feedback |
| 4 | `components/MessageCard.tsx:143` | reaction chip entrance `scale 0.9 / opacity`, 220ms | every reaction | a chip is data; it should be at full size the frame it exists |
| 5 | `components/MessageCard.tsx:317,337,351` | three receipt pops (`Sent`/`Delivered`/`Seen`), `scale 0.9 / opacity`, 200ms each | every message, up to 3× | a receipt is a status glyph; swap the glyph and colour, do not pop it |
| 6 | `views/ChatView.tsx:1893` | send button arrow→check morph, 180ms, plus a `sentPulse` timer per send | every send | the message leaving is the acknowledgement; the button popping is a second, redundant one |
| 7 | `components/MessageCard.tsx:100` | selection-ring check `scale 0.9 / opacity` 200ms | every selection toggle | selection mode is a batch operation; the ring state is the whole signal |
| 8 | `components/NearbyDetectOverlay.tsx:100` + `:110` | radar bubbles spring in with a 0.12s+ stagger, then bob `y 0→-5→0` forever, per bubble | every scan | an entrance *and* a permanent loop on a list of devices that is simply data |
| 9 | `components/NearbyDetectOverlay.tsx:236,283,324` | broadcast glyph, card glyph tile, device art all pop in (0.9, 240–260ms) | every scan | same reason as #8; the overlay opening is already the event |
| 10 | `index.css` `st-halo`, `st-radar-ping`; `SendScreen` `st-live-dot`; `DeviceArt` `st-status-dot` | four infinite loops that all mean "alive" | always on, on screen | idle work that communicates one bit; keep **one** (the waiting pill) and only while actually waiting |
| 11 | `views/ChatView.tsx` (7 × `height: 0 → auto`) | connection banners, offline alert, recipient chips animate their height on every state change | every connect / drop / add | layout animation on live state is exactly where a half-drawn frame is most likely; instant or opacity-only |
| 12 | `views/ChatView.tsx:1097` | partner name remounts with `opacity 0, y 3 → 0` on rename | every rename / reconnect | text updates; it does not arrive |
| 13 | `components/MessageCard.tsx:518` | attachment block fades/rises 6px per mount | every attachment | same as #1 |

Also dead, not a policy matter: `components/HeroDeviceDemo.tsx` (1,180 lines,
44 motion sites, `st-bloom` 9s/11s blobs, `st-ring` ripple) is **imported
nowhere**. Today it is neither the marketing moment nor product code.

## 5. Marketing: the one moment to keep

**The hand-off.** A single pass, first view only, ~2.6s:

```
0.0s  the two devices are already on screen (settled frame, no entrance)
0.4s  the code appears on the sender
1.2s  a file chip leaves the sender and lands on the receiver
1.8s  the receipt turns "Seen" on the sender
2.6s  rest — the frame the page keeps
```

Why this one: it is the product's entire argument in one beat, it is the only
thing on the landing that could not be a screenshot, and it is what
`HeroDeviceDemo.tsx` was built for. It should replace, not add to, the current
marketing motion:

| remove from marketing | why |
|---|---|
| `marketing/LandingSections.tsx:52,107,158` — every section fades/rises 14px as it scrolls in | scrolling is not an event; this is the "chose noise instead of a moment" failure |
| `HeroDeviceDemo` `st-bloom` 9s/11s blur blobs | three decorative loops behind the one moment compete with it |
| `views/Docs.tsx` → `marketing/DataFlow.tsx` `st-flow-pulse` | a diagram that pulses forever in documentation is decoration; draw the path, leave it still |
| `marketing/FaqSection.tsx` height animation | kept, but reclassified: it is a disclosure, not an entrance — functional, allowed |

Reduced motion, marketing: the hand-off renders its **end state** (chips in
place, receipt on). Nothing is hidden from someone who opted out.

## 6. What this does not change

Structural motion stays as it is: sheet open/close (280ms, drawer curve),
route push (280ms), segmented thumb travel (200ms), palette open, toast in/out,
press at 0.97/160ms, typing indicator (bobbing reduced to opacity only if it
is touched at all). Those encode *where you are* and *what you just did*; they
are not delight, and removing them would cost orientation, not noise.
