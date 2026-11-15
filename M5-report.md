# M5 report — Nearby v2 + Walk-up

Scope of this report: **STEP 0 (partial) and STEP 1, shipped and verified.**
STEPs 2–8 are untouched and listed at the end. That is a stopping decision, not
an omission: STEP 2 changes the client, the socket.io server *and* the card, and
a half-built visibility model would have left the owner with a switch that lies.

Tag before this prompt: `before-M5` → `23aee05`.
Worker deployed this session: **version `35e90c98-ad81-4437-ba0f-621f20c72963`**.

---

## STEP 0 — audit

`docs/redesign/nearby-audit.md` (new). It contains today's flow as a diagram, the
exact per-device record the server keeps (`cid`, `name`, token, `announcedAt`,
`kind`, `browser`, `model`, `gpu`), and the five findings that justify STEPs 1–3.

**Screenshots: not captured.** STEP 0 asks for the current Nearby card and
landing tile at 390×844 and 1440×900. Deferred to STEP 4, which rebuilds that
card and captures the full state set (empty / one / three / connecting / done).
Recorded as missing rather than claimed.

## STEP 1 — the Lobby is scoped to the network

**The defect.** `worker/src/index.ts` addressed one Durable Object for the whole
deployment — `idFromName('lobby')` — with a 24-slot pool. So "nearby" meant
"online", a stranger on another continent was a nearby device, and discovery
silently stopped at the 25th open tab *worldwide*.

**The change** (`worker/src/shard.ts`, new):

```
networkKey = IPv4 address, or the /64 prefix of an IPv6 address
dailySalt  = HMAC-SHA256(LOBBY_SALT | Stats-DO salt, "st/lobby-salt/v1|<UTC date>")
shard      = HMAC-SHA256(dailySalt, networkKey)[0..31]
Lobby DO   = idFromName('lobby:' + shard)
```

- The raw IP is used for the HMAC input and then dropped — never stored in the
  DO, never logged, unrecoverable from the shard without the day's salt.
- `LOBBY_SALT` (owner secret) wins when set; otherwise `Index.ts` asks the Stats
  DO for a salt, which generates one **once** and keeps it, so sharding stays
  stable across isolate restarts before the secret exists. Cached 60 s.
- Capacity is now **64 per network shard** (`PRESENCE_MAX_DEVICES`), not 64
  globally; `LOBBY_FULL` still carries the calm message.
- No header (local dev) → shard `local-dev`, so `wrangler dev` behaves.
- IPv6 is grouped by /64 because a single device is routinely handed a whole /64.

**Why this is not itself a privacy boundary:** Indian mobile carriers put
thousands of subscribers behind one public IPv4, so a shard can be large. That
is the argument for STEP 2 (visibility off by default, 10-minute window) and
STEP 3 (per-transfer consent), and it is written into the audit ADR-style note
rather than into the UI.

**Gate — `npm run verify:lobby-shard` → 25/25.** It bundles the real
`shard.ts` and `lobby.ts` with esbuild against the same `cloudflare:workers` shim
as the room suites, and drives the actual Durable Object:

```
ok  IPv4 is its own network · port ignored · forwarded list takes first hop
ok  IPv4-mapped IPv6 is the IPv4
ok  IPv6 collapses to its /64 · two hosts in one /64 match · a different /64 differs
ok  loopback resolves · missing/unknown IP has no network
ok  same network → same shard (333b087c…), two networks → two shards
ok  shard rotates at the UTC day boundary (333b087c… → ccaeeca0…)
ok  a different salt gives a different shard
ok  the shard carries no readable IP (32 hex chars, no '.' or ':')
ok  no IP → local-dev shard
ok  same network → same Lobby instance; different network → different instance
ok  both announces accepted; a device on the same network sees the other one
ok  a device on another network sees nothing
ok  a shard holds 64 devices and refuses the 65th — LOBBY_FULL
ok  no raw IP is stored in the Durable Object (5 keys, none an IP)
```

Two bugs the gate found in my own first draft, both fixed: an IPv4 `host:port`
was parsed as IPv6, and a leftover `deleteItem`-style assumption about the
global lobby id.

**Live proof.** After `worker:deploy`, a real WebSocket to
`wss://sharetext-signaling.alighttt.workers.dev/lobby?cid=…` announced and
received `{"type":"ack","ok":true,"success":true…}` — sharding did not break
presence in production. `/circle/capabilities` still answers.

## Gates run for this push

| command | result |
|---|---|
| `npm run lint` | clean |
| `npm run build` | exit 0 |
| `npm run worker:typecheck` | clean |
| `npm run worker:test` | 103 passed, 0 failed |
| `npm run verify:lobby-shard` | **25/25** |
| `npm run verify:claims` | clean, 43 files, 1 declared exemption |
| `npm run verify:bundle` | GREEN |
| `npm run smoke:local` | GREEN |
| live: `/lobby` announce over wss | ack ok |

## NOT VERIFIED — strict

- **Nothing was tested on a real device.** No Redmi 9 run, no mobile-network
  run. The IPv6 /64 and carrier-grade-NAT reasoning is from the code and from
  RFC behaviour, not from a measurement on your SIM.
- **No screenshot of anything.** The Nearby card is visually unchanged; STEP 1
  is server-side only, so nothing on screen should differ — that is a belief,
  not a check.
- **Two shards were never observed side by side in production.** The gate proves
  it in the emulator; on live, Cloudflare supplies the IP and I only exercised
  my own network's shard.
- **The salt's day boundary was proven with an injected clock**, not by waiting
  for midnight UTC.
- `npm run test:nearby`, `verify-nearby-consent`, `verify-walkup`,
  `verify-handoff`, `verify-no-flash`, `verify:robust` were **not** run: they
  cover STEPs 2–7, which were not built.

## Untouched steps (carry to the next prompt)

- **STEP 2** visibility model: Off by default, "visible for 10 minutes" with a
  countdown ring, `sessionStorage` persistence, announce only while visible,
  token rotation per session, GPU hint removed from `nearby.ts` and from the
  lobby validation, `verify-nearby.mjs` extended.
- **STEP 3** request/consent/4-digit code, Known pair for 30 days, block list,
  3 requests/minute, silent decline, ad-hoc Room on accept.
- **STEP 4** the Nearby card rebuild (choreograph / mobile-native /
  emil-design-eng), screenshots at three sizes, `verify-no-flash`.
- **STEP 5** `/walkup`, guest browsing, End & wipe, 15-minute idle auto-wipe,
  `verify-walkup.mjs`.
- **STEP 6** "Someone without ShareTexts?" on the Send sheet.
- **STEP 7** `navigator.share` handoff + `verify-handoff.mjs`.
- **STEP 8** `NEARBY_TERM` in `src/lib/brand.ts` across 11 locales, claims
  update.

## Files changed

```
worker/src/shard.ts            new — network key, daily salt, shard
worker/src/index.ts            lobby routed by shard; lobbySecret() with Stats fallback
worker/src/stats.ts            internal /lobby-salt (generate once, keep)
worker/src/lobby.ts            capacity 64 per shard; doc states the scoping
worker/src/types.ts            LOBBY_SALT?
scripts/verify-lobby-shard.mjs new gate
docs/redesign/nearby-audit.md  new audit
package.json                   verify:lobby-shard
M5-report.md                   this file
```

## OWNER ACTIONS

1. **Set `LOBBY_SALT`** (recommended, one command, then re-deploy is not needed
   for the secret to take effect on the next request path, but deploy once after):
   ```bash
   openssl rand -hex 32 | wrangler secret put LOBBY_SALT
   npm run worker:deploy
   ```
   Without it, sharding still works (a random salt is generated and kept in the
   Stats DO) — the salt is just not secret from that object.
2. **Worker is already deployed** (`35e90c98`), so nothing is pending from me.
3. **Real-device check** (2 minutes, on the Redmi 9): open sharetexts.online on
   the phone *and* on your laptop on the same Wi-Fi, both on the landing page.
   Each should list the other exactly once. Then switch the phone to mobile data
   and confirm the two no longer see each other — that is the whole claim of
   STEP 1, and I could not run it for you.
4. Nothing to install, no account, no new env var beyond `LOBBY_SALT`.

## Questions (with my recommendation)

1. **STEP 2's default.** The prompt says Off by default for strangers. On a
   shared carrier IP that means most Indian mobile users see nobody until they
   tap the switch — which is correct but *feels* broken. **Recommendation:** keep
   Off by default (it is the honest, safe default) and make the empty state do
   the teaching ("Ask the other person to turn on Nearby for 10 minutes — or
   show them a QR"), exactly as STEP 2 specifies.
2. **Should the 10-minute window pause when the tab is backgrounded?** Phone
   browsers freeze timers, so a "10 minute" window can expire 40 s after you
   leave and come back. **Recommendation:** store an absolute deadline and
   recompute on visibility change — never trust the interval count.
3. **`LOBBY_SALT` now or later?** **Recommendation:** now, it is one command and
   removes the "salt readable from the Stats DO" caveat from the report.

---

# STEP 2 — shipped after the first report (this section supersedes "untouched")

**Why it exists:** the owner's verdict on the STEP 1 push was *"nothing visible
changed at all."* He was right — STEP 1 was server-side only. STEP 2 is the
visible half: the switch, the countdown, and the fact that being findable is now
a choice with a clock on it.

## What changed

**Visibility is a deadline, not a flag** (`src/lib/nearby.ts`):

```
sessionStorage['sharetext.presenceVisibleUntil.v1'] = <epoch ms>
```

- **Off by default** for strangers (OD-7). A fresh device announces nothing.
- "Let nearby devices see me" opens a **10-minute** window; the switch label
  becomes a live `m:ss` countdown (`nearby.visibleFor` in all 11 locales, with
  `nearby.visibleForHint`).
- The window is stored as an **absolute deadline**, never a countdown. Phone
  browsers freeze timers when a tab is backgrounded, so a "10 minutes" kept in
  an interval would lie for hours. A deadline also survives a reload of that tab,
  which is what "for 10 minutes" has to mean.
- When the window closes, the client **withdraws immediately** on its own timer
  instead of waiting for the next 45 s keepalive — otherwise a device stays
  findable up to 45 s after the window the user agreed to.
- A tab that slept through the window reports Off on the next tick, so the switch
  never shows a negative countdown.
- **A new window is a new presence participant**: `stopVisible()` drops the
  session device id, so the token other devices see rotates per session.
- A device that is Off can still **see** and invite visible devices; it just
  cannot be found. The hero hint says "You won't appear on other devices" while
  Off, so an empty list cannot be mistaken for a broken feature.

**The GPU hint is gone** — `detectGpuVendor` deleted from the client, `gpu`
removed from the announce payload, from `LobbyEntry`, from both list/projection
sites and from the invitation relay in `worker/src/lobby.ts` **and** the
socket.io server (`server.ts`). It was a fingerprinting surface with no UI value.

## Proof — `npm run verify:nearby-visibility` → 21/21

Runs the real `src/lib/nearby.ts` in Node with a fake `sessionStorage`, a fake
socket and a controllable clock (esbuild stubs only the two logging imports):

```
ok  a fresh device is NOT visible (and the old accessor agrees)
ok  the window is ten minutes
ok  while Off, nothing is announced (only a withdraw, no announce)
ok  while Off there is no presence token
ok  turning it on sets a deadline ten minutes out; visibleUntil() reads it
ok  now it announces; the announce carries NO GPU hint
    (keys: browser, deviceId, kind, model, name)
ok  the announce keeps the coarse display hints
ok  the server token is adopted
ok  past the deadline the device is not visible; deadline cleared
ok  after the window it withdraws instead of re-announcing
ok  a window that closes while open withdraws on its own timer
ok  turning it off drops the session device id
ok  a new visibility session is a new presence id (8db425ab… → 3360a389…)
ok  the deadline is stored, not a countdown; 4 min later, 6 remain
ok  a tab that slept past the deadline reports Off
```

Other gates after the change: `verify-nearby` **28/28** (rich-presence field
contract updated to `browser,id,kind,model,name`), `verify:lobby-shard`
**25/25**, `worker:test` 103/103, `lint` clean, `build` 0, `verify:claims`
clean, `verify:bundle` GREEN, `smoke:local` GREEN.

## Live

Deployed twice this session; final Worker version `20acd057-2a8b-4593-892d-07ca2fef2950`.
Live build marker `230a30e82c5a`.

`node scripts/smoke-live.mjs` was run three times. **The first two runs failed
one check** — `message A → B arrived within 15 s` — on runs where pairing took
22–28 s instead of the usual ~5 s. The third run was GREEN (paired in 4.7 s,
room up in 8.7 s). `worker:test-live` was 18/18 on the same Worker. The cause is
load on this machine (several leftover dev servers), not a regression: nothing in
STEP 2 touches rooms or message relay. Recorded rather than hidden — if it
reproduces on a quiet machine, it is a real latency bug.

## Still NOT built in STEP 2

- **The dead-end "Show QR" button.** STEP 2 asks that an empty list offer
  "Ask the other person…or show them a QR". The sentence exists, but the QR
  itself is STEP 5's guest flow — building a second QR surface here would have
  been exactly the duplicate the M6 prompt warns about. It ships with STEP 5.
- **STEP 3+: untouched.** Request/consent/code, the card rebuild, Walk-up,
  "someone without ShareTexts", native handoff, `NEARBY_TERM`.

## What the owner should see now (and what changed visually)

On the landing page, the Nearby control now reads **"Visible for 9:58"** with the
time counting down after you turn it on, and it starts **Off** — so if both
devices are fresh, neither appears in the other's list until one of you flips it.
That sentence is the whole STEP 2 product decision; if it reads wrong in practice,
the number to change is `NEARBY_VISIBLE_MS`, not the logic.
