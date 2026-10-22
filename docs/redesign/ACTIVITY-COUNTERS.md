# Activity counters — definitions for the owner

DESIGN.md §16: *"The live line shows two real counts: rooms made, and times
people used the app (the definition is set by the owner after
docs/redesign/ACTIVITY-COUNTERS.md). They come only from counters stored on
the server for real events. No floor, no multiplier, no invented growth. The
label says exactly what is counted. If the service cannot be reached, hide the
numbers."*

This document records what the server actually counts today, where the numbers
are wrong against §16, and the decisions only the owner can make. No code is
changed by this document.

## 1. What exists today

| Count | Where it lives | What it really counts | Client display |
|---|---|---|---|
| `roomsCreated` | `server.ts:121` — `Math.max(roomsCreatedTotal, metrics['rooms.created'] ?? 0, 113)`; incremented in `count('rooms.created')` (`server.ts:86-90`), persisted to `.rooms-total.json` (`server.ts:80,89`) | Lifetime rooms **created** (not connections, not messages), persisted across restarts, **plus a hard floor of 113** | landing live line: `{roomsCreated} + t('home.roomsMade')` — `src/views/SingleScreenApp.tsx:869-873`, sourced from `useLiveStats()` (`src/lib/useLiveStats.ts:45-125`) |
| `users` | `server.ts:115-118` — count of distinct `activePeers` across open rooms | Devices **seated right now** (a point-in-time gauge, not an event counter) | fetched (`useLiveStats.ts:66`) but the current landing line shows only `roomsCreated` |
| "times people used the app" | **does not exist** | — | — |

Only one number is shown today: `SingleScreenApp.tsx:869-873`. The brief's
second number ("times people used the app") has **no server counter yet**.

## 2. Violations of §16 as the code stands

| §16 rule | Reality | Proof |
|---|---|---|
| "No floor" | Server applies `Math.max(..., 113)` — a floor of 113 | server.ts:121 |
| "counters … for real events" | Floor is not an event; it invents 113 rooms that were never counted | server.ts:119-121 comment says it "covers rooms created before lifetime tracking existed" |
| "The label says exactly what is counted" | en label "rooms made so far" matches (`en.ts:75`), **but 8 locales say "connections"** while the value counts rooms | de.ts:66 "Verbindungen bisher", es.ts:66, fr.ts:66, ja.ts:66, zh.ts:66, hi.ts:66, pt.ts:66, ar.ts:66 |
| Client honesty comment vs server | `useLiveStats.ts:114-119` says "No fabricated floor" while displaying the server number that carries the floor | src/lib/useLiveStats.ts:114-119 vs server.ts:121 |
| "If the service cannot be reached, hide the numbers" | Implemented — tracker returns `null` until the server answers, chip renders nothing (`SingleScreenApp.tsx:869`) | Match |

## 3. Decisions for the owner

**D1 — The floor.** Options:
- **(a) Remove the floor** (recommended: §16 says no floor). The number drops
  to the true persisted total (`.rooms-total.json`), or 0 on a fresh server.
  Honest, matches the contract, visibly smaller.
- **(b) Keep the floor and amend §16** to allow a documented bootstrap floor.
  The brief's current text forbids it, so the contract would change, not the code.
- Note: the floor only matters if `.rooms-total.json` was lost or predates
  tracking; once a real persisted total exceeds 113 the floor is inert.

**D2 — The second number: "times people used the app."** Definition options
(any of these is a real server-side event; pick one and the label follows it):

| Option | Counts | Label would read | Cost |
|---|---|---|---|
| **(a) Pairings** (recommended) | each time a **second device joins** a room (the moment two devices are connected) — derivable from the existing join path (server.ts:1119,1165 roster joins) with a new persisted counter | "connections made" | new persisted file + increment at 2nd-join; no new protocol |
| (b) Rooms with activity | rooms where ≥1 message/file was relayed or a peer connection opened | "sessions used" | needs an event hook at first transfer — more plumbing |
| (c) Rooms closed by users | each `disconnect`-after-pairing | "rooms finished" | conflates closes with usage |

All options: persist like `roomsCreatedTotal` (`.rooms-total.json` pattern,
server.ts:80-90), increment only on the real event, floor at **0**, and expose
from `/stats` (server.ts:108-124) so `useLiveStats` can hide when it is null.

**D3 — Label translations.** Whichever definitions win, the 8 non-en
`home.roomsMade` strings must say exactly what is counted (today they say
"connections" while counting rooms — de/es/fr/ja/zh/hi/pt/ar line 66). This is
a P-copy item.

**D4 — Show the second number or not.** §16 says the live line shows two
counts; the current UI renders one chip (`SingleScreenApp.tsx:869-873`).
Adding the second number is a visual change → belongs to a P-prompt (P-landing),
not P0.

## 4. Wire contract (for whoever implements)

`GET /stats` (server.ts:108-124) already returns
`{ service, generated_at, users, roomsCreated, note }` with
`Access-Control-Allow-Origin: *`. Add `pairsCreated` (or chosen name) here;
`useLiveStats` (`src/lib/useLiveStats.ts:66-68`) already parses `roomsCreated`
and should parse the new field the same way: show only when the server answered,
hide on null, never synthesize.
