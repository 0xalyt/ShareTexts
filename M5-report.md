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
