# Nearby audit — before M5

Written before changing anything, from the code as it stands at tag `before-M5`.

## Today's flow, in one diagram

```
 device A (landing page)                device B (landing page)
        │                                       │
        │  WS /lobby?cid=…                      │  WS /lobby?cid=…
        └──────────────► Lobby DO ◄─────────────┘
                         idFromName('lobby')
                         ONE instance, whole planet
                         cap: PRESENCE_MAX_DEVICES = 24
        │  presence_announce {deviceId,name,kind,browser,model,gpu}
        │◄─────────────── presence_list [tokens] ────────────────►│
        │                                                          │
        │  presence_invite {to: token, roomId, secret}             │
        │───────────────────────────────► tapped device only ─────►│
        │                                       │ accept → create/join room
        └──────────── room WebSocket (existing transport) ─────────┘
```

So: announce is implicit — **any open tab is visible**. Consent exists at the
*invite* step (`presence_invite` → the other side accepts), but there is no
visibility switch, no time limit, and no code for a stranger.

## What the server stores per device (one `dev:<deviceId>` entry)

| field | what it is | why it exists |
|---|---|---|
| `cid` | live socket tag | retire a stale socket after refresh |
| `name` | sanitized, ≤32 chars, default "Unnamed device" | the tile label |
| `token` | `sha256(deviceId + per-DO salt)` | what other devices see; the deviceId never leaves |
| `announcedAt` | ms | TTL (90 s) and sweep |
| `kind` | `phone` / `tablet` / `desktop` | icon |
| `browser` | short label | "iPhone · Safari" |
| `model` | trimmed model string | label detail |
| `gpu` | `NVIDIA`/`AMD`/`Intel`/`Apple` | "desktops only", and a fingerprinting surface |

`conn:<cid>` holds `{deviceId}`. Entries die after 90 s without a keepalive,
and a sweep every 30 s broadcasts removals.

## What this audit found (the reasons STEPs 1–3 exist)

1. **"Nearby" is not nearby.** One Durable Object for the whole deployment:
   a stranger in another country is "nearby", and the 24-slot cap means
   discovery silently dies at the 25th open tab **worldwide**. Fixed in STEP 1
   by addressing `lobby:<shard>`, where the shard is an HMAC of the network key.
2. **Visibility is not a choice.** A device is listed the moment the page is
   open. AirDrop's model — off by default, "everyone for 10 minutes" — is both
   friendlier and safer. STEP 2.
3. **No code for strangers.** The only gate is an accept tap from a device you
   may not recognise. STEP 3 adds the 4-digit code and the Known-pair memory.
4. **The GPU string is pure fingerprinting.** No UI shows it usefully. Removed
   in STEP 2.
5. **Carrier-grade NAT.** Indian mobile carriers put thousands of subscribers
   behind one public IPv4, so a network shard can be large. That is exactly why
   STEP 2 makes visibility opt-in for 10 minutes and STEP 3 requires consent per
   transfer. Sharding is not a security boundary by itself — consent is.

## Screenshots

**Not captured.** STEP 0 asks for the current Nearby card and landing-page tile
at 390×844 and 1440×900. The screenshots are deferred to STEP 4, which rebuilds
that card anyway and captures the whole state set (empty / one / three /
connecting / done). Recorded here rather than claimed.
