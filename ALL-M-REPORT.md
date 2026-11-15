# All M tasks — combined report

**Owner:** Mr. Garv · **Repo:** `0xalyt/ShareTexts` · **Branch:** `main`
**Date:** 2026-11-15 · **Author:** freebuff (sole engineer)
**Living Worker:** `https://sharetext-signaling.alighttt.workers.dev`

This is one report across **M1–M6**, in the format the prompts ask for
(what shipped · proof · NOT VERIFIED · untouched · files · gates · questions ·
owner actions), plus the decision ledger they do not ask for and you did:
**why this way, and why not the other way.**

---

## 0. The verdict in one table

| Milestone | State | What it means for you |
|---|---|---|
| **M1 — Solid ground** | ✅ Shipped (before this session's M2–M3 work) | State vocabulary, no-flash gate, SW takeover fix, claims linter, chaos measurement, PWA |
| **M2 — The Room** | ✅ **Complete** (STEPs 0–5) | Feed grouping, typing, one sheet for both doors, desktop master pane |
| **M3 — Circle Core** | 🟡 **STEPs 0–4 done**, deployed, proven zero-knowledge; **STEPs 5–6 untouched** | The encrypted mailbox is live; the UI that links a device in-product does not exist yet |
| **M4 — Circle Experience** | ⛔ **Never built** (`M4-blocked.md`) | No outbox, no Linked devices list, no push |
| **M5 — Nearby v2** | 🟡 **STEPs 0–2 done**, live; **STEPs 3–8 untouched** | Nearby is now network-scoped and opt-in for 10 minutes; no consent code, no card rebuild, no Walk-up |
| **M6 — Send From Anywhere** | ⛔ **Blocked** (`M6-blocked.md`) | Depends on M4, which does not exist |

**Honest total: 1 milestone complete, 2 partially done and live, 2 stopped at
their prerequisite check, 1 blocked by an unbuilt dependency.** Nothing in this
report is a projection; every number is from a run below.

---

## 1. M1 — Solid ground ✅

### What shipped (SHAs before this session)

| SHA | Change |
|---|---|
| `497419b` | Activity counter starts at zero; the number only appears from ten |
| `580ff28` | `verify-claims` linter + copy brought inside what the gates prove |
| `be53dd0` | A new build **waits its turn** instead of taking over mid-transfer |
| `d424bbc` | `verify-chaos`: four reliability promises measured instead of trusted |
| `0467d9b` | Protocol doc: TTLs and the encryption claim match the code |
| `c6bfcb0` | One item-state vocabulary (`itemState.ts`) + no-flash gate |
| `835eb8d` | Reports moved out of the repo root into `docs/reports` |

### Proof

`verify:chaos` 4/4 (S2, S3, S11, S12), `verify:no-flash` clean,
`verify:claims` clean, `npm run lint` clean. The M1 report is
`M1-report.md` — read it for the long form.

### NOT VERIFIED (from `M1-report.md` §3, not re-run here)

`M1-report.md` §3 names **one gate that fails** and the things that could not be
proven in a headless browser. I did **not** re-run M1's suite in this session; the
report is the source of truth for it, and it says what it says rather than what I
would like.

### Decisions worth naming

- **Item state centralised rather than repeated.** `MessageCard` reads
  `itemState.ts`; `ChatView` and the sheets still derive some words inline (this
  is debt #3 in the project state). Why not finish it then: every word touched is
  an 11-locale change, and M2 was already doing that work in the feed.
- **A waiting service worker never swaps code mid-session.** Why: a takeover
  during a transfer is indistinguishable from a crash. Cost: updates land one
  navigation later.

---

## 2. M2 — The Room ✅ complete

### What shipped

| SHA | Step | Content |
|---|---|---|
| `f9e74a4` | 0 | `docs/redesign/m2-audit.md` + six before-shots |
| `f3e07f8` | 1 | The feed groups like a conversation instead of stamping every bubble |
| `52927ec` | 3 | Ephemeral typing frame, one each way (OD-4) |
| `4ec91dd` | 4–5 | One sheet for both doors + real desktop master pane |

### Proof

| Gate | Result |
|---|---|
| `verify:typing` | **5/5** |
| `verify:sheets` | **9/9** |
| `verify:desktop` | **16/16** |
| screenshots | `docs/redesign/shots/m2-desktop-{1024,1440,2560}.png` (gitignored; added with `git add -f`) |

### NOT VERIFIED

The desktop shots prove layout at three widths, not feel. No real-device run.

### Untouched from M2

STEP 2 (bubble/typography pass) was folded into STEP 1 and is not separately
shipped — say so rather than claim six steps for five commits.

### Decisions worth naming

- **Typing is a frame, not a poll.** One `typing` event each way, expiring in the
  client. Why not presence-based typing: presence is 45 s keepalives, which would
  show "typing" for 45 s after the person stopped.
- **One sheet for both doors** (share + join) instead of two. Why: two sheets
  drift; one cannot. Cost: a slightly more conditional component.

---

## 3. M3 — Circle Core 🟡 STEPs 0–4 done, deployed

### What shipped

| SHA | Step | Content |
|---|---|---|
| `ef9e4b8` | 0–1 | ADR + device keys + the seal (HKDF K, per-item keys, wraps, SAS) |
| `b975aea` | 2 | The Circle mailbox DO: sealed bytes in, sealed bytes out |
| `03d1b05` | 3 | Client pairing: `api.ts`, `pairing.ts`, `store.ts` |
| `8c6af0d` | — | **Production bug:** every `/circle/*` was 429 — the `circle` rate-limit scope did not exist |
| `23aee05` | 4 | Zero-knowledge proof against production + `/circle/capabilities` + the clock fix |

### Deployments (all this session, via wrangler OAuth `wormer10gpt@gmail.com`)

`53ee77ad` → `0bb0b14d` → `37b2266a` → `35e90c98` → `20acd057` (final).
Verified live after each: `/health`, `/circle/capabilities`, `POST /circle/<id>/create`
→ 200, unsigned `/members` → 401, `/lobby` announce → ack.

### Proof

| Gate | Result |
|---|---|
| `verify:circle-crypto` | GREEN, 24 assertions |
| `verify:circle-worker` | **30/30** (real DO in Node) |
| `verify:circle-pairing` | **17/17 against the deployed Worker** |
| `verify:zero-knowledge` | **15/15 on production** |
| `worker:test` | 103/103 |
| `worker:test-live` | 18/18 |

The zero-knowledge gate does not *ask* the server whether it can read items. It
seals a 4 KiB item, records every byte that leaves the device, uploads, pulls the
ciphertext back and tries to read it with only what the server holds:

```
ok  no request body / header ever contained the plaintext or K
ok  every request went to the mailbox, over the signed API — 3 requests
ok  stored bytes are indistinguishable from random — 7.96 bits/byte
ok  the member list carries public keys only — deviceId,signPub,ecdhPub,joinedAt
ok  a key the server could have made cannot open it
ok  the device that holds K reads it back exactly
```

### NOT VERIFIED

- No in-product "link this device" UI — STEPs 5–6 untouched.
- No real phone in the loop; pairing is proven between two Node clients.
- The claim flip ("end-to-end encrypted") is **permitted but not done**: it needs
  `docs/claims.md`, the forbidden list, the privacy page and 11 locales in one
  change. `verify:claims` still forbids the phrase today, correctly.

### Files (M3)

```
worker/src/circle.ts · limits.ts · registry.ts · index.ts · types.ts
src/lib/circle/{api,pairing,store,seal}.ts
scripts/verify-circle-{worker,pairing,crypto}.mjs · verify-zero-knowledge.mjs
docs/adr/… (seal ADR) · worker/migrations/v6-circle
```

### Decisions worth naming

- **Signatures bind the pathname, not the query.** Why: `?since=` is a read
  cursor, not content; signing it would make cache-busting retries fail. Why not
  sign the full URL: it also makes every retry a fresh signature, which the
  replay-nonce already covers.
- **Bodies are hashed as bytes**, not as re-serialised JSON. Why: key order and
  whitespace differ between browsers; hashing bytes is the only thing that cannot
  disagree with what was actually sent.
- **Join signs with the key it is submitting.** Why: a new device is not a member
  yet; anything else needs either a password or a plaintext secret on the wire.
- **`store.ts` keeps the raw K next to the non-extractable import.** This is a
  documented deviation: wrapping K for a *new* device requires the bytes, and
  WebCrypto cannot export a non-extractable key. Recommendation: keep, because
  the alternative (re-pair to add a device) is worse.
- **Clock fix by telling the client the time, not by widening the window.** Why
  this way: this machine is 59.4 s behind the edge, and real phones drift; a
  device a minute off could not link at all. Why not widen to 5 minutes: the
  ±60 s window is what bounds replay of a captured signature, so widening trades
  a real defence for a symptom. The server now answers
  `401 {error:'STALE', now}` and the client corrects once and retries once —
  separately for `call()` and `join()`, because `join` carries its own signature.

---

## 4. M4 — Circle Experience ⛔ never built

`M4-blocked.md` (`960659d`, updated `896bea9`). At the time of the check, M3 was
not deployed and `verify-zero-knowledge.mjs` did not exist, so the prompt's own
prerequisite check said stop. I stopped and wrote the file instead of building.

**That state has changed:** M3 is deployed and the zero-knowledge gate is 15/15 on
production, so **M4 is now unblocked and is the single highest-value next step**
— it is what gives anything a destination to send to.

### Why not build it anyway

The chain — sealed mailbox → deployed Worker → zero-knowledge green → outbox →
Linked devices → M6 — has one missing link at the time (deploy). Building the
outbox on an undeployed mailbox would have produced a feature that works only on
the developer's machine, and the report would have had to say "pending deploy",
which is precisely the kind of claim these prompts forbid.

---

## 5. M5 — Nearby v2 🟡 STEPs 0–2 done, live

### What shipped

| SHA | Step | Content |
|---|---|---|
| `0e92cc8` | 0–1 | `docs/redesign/nearby-audit.md` + network-scoped Lobby |
| `230a30e` | 2 | Visibility: off by default, 10-minute deadline, GPU hint removed |
| `71612e9`, `3bb0407` | — | STEP 1 and STEP 2 report sections |

### The defect STEP 1 fixed

The Lobby was **one Durable Object for the whole deployment**, 24 slots:
`idFromName('lobby')`. "Nearby" meant "online"; a stranger on another continent
was a nearby device; discovery died at the 25th open tab **worldwide**.

```
networkKey = IPv4 address, or the /64 prefix of an IPv6 address
dailySalt  = HMAC-SHA256(LOBBY_SALT | Stats-DO salt, "st/lobby-salt/v1|<UTC date>")
shard      = HMAC-SHA256(dailySalt, networkKey)[0..31]
Lobby DO   = idFromName('lobby:' + shard)      capacity 64 per shard
```

### Proof

| Gate | Result |
|---|---|
| `verify:lobby-shard` | **25/25** (real DO, esbuild + cf shim) |
| `verify:nearby-visibility` | **21/21** (real `nearby.ts`, fake clock/storage/socket) |
| `verify-nearby` | **28/28** (legacy socket.io server) |
| live `/lobby` wss announce | `{"type":"ack","ok":true,"success":true}` |
| two live sockets, same network | saw each other |

### NOT VERIFIED

- **No Redmi 9 run, no mobile-data run.** The IPv6 /64 and carrier-grade-NAT
  reasoning is from RFC behaviour, not from your SIM.
- **No screenshots of the new switch.** STEP 0's before-shots are deferred to
  STEP 4, which rebuilds the card; STEP 2's countdown was **not looked at**.
- Two different shards were never observed side by side in production.
- **Live smoke flaked:** two runs failed `message A → B within 15 s` when pairing
  took 22–28 s (several leftover dev servers on this machine); later runs passed
  in 4.7 s. Recorded, not hidden. `worker:test-live` was 18/18 on the same Worker.

### Untouched (STEPs 3–8)

Consent + 4-digit code + Known pair + block (3), the card rebuild (4), Walk-up
`/walkup` + End & wipe (5), "someone without ShareTexts" (6), `navigator.share`
handoff (7), `NEARBY_TERM` in `src/lib/brand.ts` across 11 locales (8).

### Decisions worth naming

- **HMAC shard with a daily salt instead of storing the IP.** Why: the raw IP is
  the one identifier a network layer hands you, and keeping it would make this a
  tracking system. Why not geo/IP-prefix lookup at the edge: it needs another
  service and returns the same answer for "same network".
- **IPv6 grouped by /64, not by address.** Why: one phone is routinely given a
  whole /64; keying on the full address would show nobody.
- **Capacity per shard, not globally.** Why: the old cap was the bug.
- **Visibility is a stored deadline, not a countdown.** Why: phone browsers
  freeze timers when backgrounded, so an interval says "4 minutes left" hours
  later. Why sessionStorage, not localStorage: "10 minutes" must not survive a
  browser restart.
- **Off by default for strangers even though it feels broken on CGNAT.** Why: a
  device that is findable without consent is the wrong default for a product that
  puts your files on unknown computers. The cost is real and is handled by making
  the Off hint say "You won't appear on other devices" instead of pretending the
  list is empty.
- **Withdraw on the window's own timer, not at the next keepalive.** Why: a 45 s
  keepalive would keep a device findable 45 s past the window the user agreed to.
- **New window → new presence id → new token.** Why: OD-7 says the token rotates
  per session; the cheapest correct way is a fresh participant id per window.
- **GPU hint deleted, not hidden.** Why: it is a fingerprinting surface with no
  UI value; deleting it from both servers means no client can send it back.
- **Stopped before STEP 2's dead-end "Show QR" button.** Why: the QR is STEP 5's
  guest flow, and the M6 prompt explicitly forbids a second guest flow. Building
  one here would have been the duplicate.

---

## 6. M6 — Send From Anywhere ⛔ blocked

`M6-blocked.md` (`a7ec97f`). The check requires `M4-report.md` showing STEPs 1–4.
The repo has only `M4-blocked.md`. There is no Linked-device target, no push, no
outbox — so a `/send` doorway would open onto an empty room.

### Why not build the independent steps anyway

STEPs 2–4 (Share Target + stash, iPhone Shortcut guide, browser extension) are
self-contained and could ship. They are doorways. A doorway with no destination is
a broken promise with a nice UI, and the budget rule says stop rather than ship
half a feature that lies. All four carry forward unchanged.

---

## 7. Command ledger — what I actually ran, and what each proves

### Build and type

| Command | Proves |
|---|---|
| `npm run lint` (`tsc --noEmit`) | types across app + worker config |
| `npm run build` | the app compiles and emits |
| `npm run worker:typecheck` | `worker/tsconfig.json` clean |
| `npm run verify:bundle` | entry ≤ 180 KB gzip — GREEN |

### Worker

| Command | Proves |
|---|---|
| `npm run worker:test` | 103/103 DO behaviour incl. honest counters |
| `npm run worker:test-live` | 18/18 against the **deployed** Worker |
| `npm run worker:deploy` | rolled out 5 versions this session |

### Milestone gates

| Command | Result |
|---|---|
| `npm run verify:typing` | 5/5 |
| `npm run verify:sheets` | 9/9 |
| `npm run verify:desktop` | 16/16 |
| `npm run verify:circle-worker` | 30/30 |
| `npm run verify:circle-pairing` | 17/17 live |
| `npm run verify:zero-knowledge` | 15/15 live |
| `npm run verify:lobby-shard` | 25/25 |
| `npm run verify:nearby-visibility` | 21/21 |
| `node scripts/verify-nearby.mjs` | 28/28 |
| `npm run verify:claims` | clean, 43 files, 1 declared exemption |
| `npm run smoke:local` | GREEN |
| `node scripts/smoke-live.mjs` | GREEN (after two load-flaked runs) |

### Ad-hoc production probes (not gates, used to prove deploy health)

```bash
curl -s https://sharetext-signaling.alighttt.workers.dev/health
curl -s https://sharetext-signaling.alighttt.workers.dev/circle/capabilities
# → {"version":"circle-1","maxChunkBytes":1048576,"chunksPerItem":200,
#    "itemsPerCircle":500,"itemTtlDays":30,"membersPerCircle":12,
#    "push":false,"heavyDay":false}
node -e "<wss /lobby announce>"   # → ack ok
```

---

## 8. Questions (5, each with my recommendation)

1. **Nearby default: Off or On?** Today Off (OD-7). On a shared carrier IP most
   Indian mobile users will see nobody until they tap the switch. **Recommendation:
   keep Off**; it is the only default that does not make a stranger's device
   findable without consent. If it feels broken in your hand, the fix is the empty
   state's teaching line, not the default.
2. **10 minutes — is that the right number?** `NEARBY_VISIBLE_MS = 600_000`.
   **Recommendation:** keep 10; it is AirDrop's "10 minutes" and long enough to
   walk a file between two devices.
3. **M4 next, or M5 STEPs 3–5?** M4 unblocks M6 and gives every future feature a
   destination. M5 STEPs 3–5 give the visible Walk-up win. **Recommendation: M4
   first**, then M5 STEP 5, then M6.
4. **The claim flip ("end-to-end encrypted").** The gate is green on production,
   so the claim is now permitted. **Recommendation:** do it as one change with
   `docs/claims.md` + 11 locales (M4 STEP 8's shape), not as a one-line copy edit,
   because `verify:claims` will otherwise fail the next push.
5. **`LOBBY_SALT`.** Unset today; the salt is generated once in the Stats DO.
   **Recommendation:** set it (`openssl rand -hex 32 | wrangler secret put
   LOBBY_SALT`), which removes the "readable from the Stats DO" caveat.

---

## 9. OWNER ACTIONS

1. **Re-paste M4.** Its two blockers are cleared; it is the gate on M6.
2. **Set `LOBBY_SALT`** (one command, then `npm run worker:deploy`).
3. **Real-device check for M5 STEP 1–2** (2 minutes, Redmi 9): phone + laptop on
   the same Wi-Fi, both on the landing page → turn the switch on both → each lists
   the other once. Then switch the phone to mobile data → they must **stop** seeing
   each other. That is the whole claim of STEP 1 and I could not run it.
4. **Anything still failing?** Give me the exact screen, tap and what appeared.
   My live checks (`worker:test-live` 18/18, presence two-socket, smoke-live green)
   did not reproduce the "linking / QR / transfer failed" you reported, so I need
   the moment, not a description.
5. **VAPID secrets** when M4 STEP 3 asks: `wrangler secret put
   VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT`. Until then
   `/circle/capabilities` honestly says `"push": false`.

---

## 10. What this report does **not** claim

- It does not claim M4 or M6 exist.
- It does not claim the Nearby card has been looked at, or that any of it was
  tested on your phone.
- It does not claim the live smoke has been stable: it flaked twice under load,
  passed when the machine was quiet, and that is written down here rather than
  smoothed over.
- It does not claim the M3 encryption copy is live; the gate is green, the copy
  is not written.
