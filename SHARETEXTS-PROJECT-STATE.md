# ShareTexts — project state

Last updated at `main` after the M1 carry-over. Sections 4–8 are the ones every
milestone report updates; 1–3 describe the shape that rarely changes.

## 1. What this is

ShareTexts (sharetexts.online) is a browser-to-browser transfer app: two devices
pair with a six-digit code, a QR or a link, and then exchange text, links and
files. No account, no install. Rooms are encrypted in transit; the Worker mints
the room secret, so the product does **not** claim end-to-end encryption.

## 2. Runtime and layout

- **Client:** React + TypeScript + Vite, `src/`. Entry `index.html` → `src/main.tsx`.
- **Signalling:** a Cloudflare Worker in `worker/` (Durable Objects for rooms,
  WebSocket relay fallback, `/stats`, `/metrics`). Node server `server.ts` runs
  the same logic locally for development and smoke tests.
- **Static:** `public/` (24 guide pages, `llms.txt`, icons, `sw.js`).
- **Data:** in-memory rooms in the Worker; D1/R2 bindings exist but R2 for Space
  files is commented out — Temporary Spaces are text and links only.
- **Tests/verifiers:** `scripts/*.mjs`, driven by `npm run …` (see §4).

## 3. Milestones

| Milestone | State |
| --- | --- |
| M1 — Solid ground | shipped (`M1-report.md`), with three carry-over items completed after the report: `src/lib/itemState.ts`, `scripts/verify-no-flash.mjs`, this file. Bundle gate still red. |
| M2 — The Room | prerequisites cleared (`661f99e`); STEP 0 (`f9e74a4`) and STEP 1 feed (`f3e07f8`) shipped; STEPs 2–6 untouched (`M2-report.md`). |
| M3 — Circle Core | STEP 0 ADR + pending claim and STEP 1 crypto (`ef9e4b8`) shipped; STEPs 2–6 untouched (`M3-report.md`). Worker deploy pending for STEP 2. |
| M4+ | not started. |

## 4. Gates — current truth

| Command | What it proves | Last measured |
| --- | --- | --- |
| `npm run lint` | types and lint | clean |
| `npm run build` | the app compiles | exit 0 |
| `npm run worker:test` | Worker behaviour incl. honest counters | 103 passed, 0 failed |
| `npm run worker:typecheck` | Worker types | clean |
| `npm run smoke:local` | the built server serves the real routes | GREEN |
| `npm run verify:claims` | no forbidden product claim | 8 rules, 43 files, 0 findings, 1 declared exemption |
| `npm run verify:chaos` | four reliability promises, measured | 4/4 PASS (S2, S3, S11, S12) |
| `npm run verify:chaos2` | the other eleven reliability promises | 6 PASS, 5 NOT VERIFIED (S6–S8, S10, S14) — 2026-11-16 |
| `npm run verify:link-join` | a /s/ link or QR joins, and every failure names itself with one action | 8/8 PASS, 6 NOT VERIFIED (webkit/firefox not installed; stale SW, stale cache, TTL, full room) |
| `npm run verify:room-feed` | §19 feed rules: grouping, one state word, geometry, log semantics | GREEN, 6/6 |
| `npm run verify:circle-crypto` | Circle seal: pins, tamper, wrap, SAS, chain | GREEN, 24 assertions |
| `node scripts/verify-no-flash.mjs` | no blank gap, no white frame, no mid-session SW takeover | clean |
| `npm run verify:icons` | every icon reference resolves and matches its size | 12 references |
| `npm run verify:lobby-shard` | Nearby is scoped by network: shard = HMAC(dailySalt, IPv4 or IPv6 /64), 64 devices per shard, no IP stored | **25/25** (emulator, real DO) |
| `npm run verify:bundle` | entry ≤ 180 KB gzip; target 177 | **PASS — 175.1 KB** (179.8 before `0f87288`, which removed `otpauth` from the entry) |
| `npm run verify:fast` | every non-browser gate in one command | **EXIT 0** (2026-11-17) |
| `npm run verify:browser` | starts its own dev server on 3010, then typing, sheets, desktop, room-feed, no-flash, chaos | written and registered; **not yet run end to end** |
| `npm run verify:totp-parity` | the hand-written client TOTP equals node:crypto, the Worker and otpauth | **5/5** |

## 5. Known debt (ordered by what it costs the owner)

-1. **M6 is blocked on M4, and M4 is blocked on nothing now.** Linked devices,
   the outbox/inbox and push do not exist yet, so "Send from anywhere" has no
   destination. M4's original blockers (deploy, zero-knowledge gate) are both
   cleared — see `M6-blocked.md`. Run M4, then M6.

0. **Nearby is scoped and time-boxed, but consent is not built yet.** STEP 1 gave presence a network
   shard; visibility is still implicit (any open tab is listed) and there is no
   code for a stranger. M5 STEPs 2–3 fix that. Until then the honest sentence is
   "devices on your network can see that ShareTexts is open", not "nearby".
   Related: a carrier-grade-NAT shard can be large, so consent per transfer
   (STEP 3) is the real boundary, not the shard.

1. **Bundle: 175.1 KB, 4.9 KB under the ceiling.** `otpauth` left the entry
   (`src/lib/totp-sha1.ts`, proven by `verify:totp-parity`); `.githooks/pre-push`
   runs the gate before every push, so this cannot walk back unnoticed. Earlier: the ceiling was already
   breached at `6991c46` (181.3 KB) before M1b; the fix was deferral (room rail,
   presence dock, handshake drawing, room empty-state scene, system alert). Any
   new entry code needs a matching split, not a budget bump.
2. **Reliability matrix: 10 of 15 measured.** S1, S4, S5, S9, S13, S15 measured
   on 2026-11-16 (all PASS); S2, S3, S11, S12 from 2026-11-14. Still
   **NOT VERIFIED**: S6–S8 (20 MB resume across a reload), S10 (service-worker
   swap), S14 (three-hour Stay Connected clock).
3. **Item state is now centralised but not yet the only reader.** `MessageCard`
   uses `itemState.ts`; `ChatView` and the sheets still derive some words inline.
4. **Space file storage** disabled and now structural: `FEATURE_SPACE_FILES`
   (false) owns the button, paste, drop and overlay, the composer says "Text and
   links for now.", and the Worker answers `/space/capabilities` with the truth
   (`files: Boolean(env.SPACE_BUCKET)`). The claims linter forbids describing it.
4e. **M4 was blocked on 4c and is cleared** (`4a0421d`) — `M4-blocked.md` records
   the check and the proof. M4 starts at STEP 1.
4c. **The Circle key is sealed at rest** (`4a0421d`): AES-GCM ciphertext under a
   per-device non-extractable wrap key, AAD = circle id + epoch, v1 records
   migrate on read, `withCircleKey()` zeroes the bytes. `verify:key-at-rest` 9/9
   in a real browser; `verify:circle-pairing` 17/17 against the deployed Worker.
   Not covered: code execution inside the origin (XSS/extension) can use the
   wrap key exactly as the app does.
   `src/lib/circle/store.ts` keeps the raw `K`; the fix is a non-extractable
   AES-GCM wrap key, ciphertext-only storage, a migration of the raw record and
   two extended gates — M3b STEP 2, not done. This is the largest open risk in
   the project: a stolen phone's IndexedDB is a stolen circle.
4d. **Nearby copy now matches the switch** (`6fc6273`): the shell FAQ, JSON-LD,
   the prerendered pages, the in-app Docs, `llms.txt`, two guides and nine
   locales say “turn Nearby on, for 10 minutes, on the device you want to send
   to”. Two forbid rules (`nearby-appears`, `nearby-while-open`) plus
   `verify:claims-selftest` keep the old sentences from coming back. Still open:
   the sheet's empty state names the code but is not tappable.
4b. **Link joins no longer blame the room for a broken connection.**
   `resolveShortCode` returns a reason (`not_found | unreachable | timeout |
   config`), one retry covers a phone that has no route yet, and the notice's
   single action is "Try the six-digit code" (dead) or "Try again"
   (unreachable). Five `link.*` diag stages make the next failure self-explaining.
5. **`home.roomsMade` still says "rooms made"** while the counter measures
   two-device connections.
6. **Circle has no server yet.** `src/lib/circle/*` is client crypto only; no
   `/circle/*` route exists and no client calls one, so nothing is broken by
   the gap — but the mailbox (M3 STEP 2) needs `npm run worker:deploy`.

## 6. Environment

- Work dir on the owner's machine: `C:\Users\garvd\ShareTexts\.freebuff\ShareTexts`.
- The shell exports `PORT=0`, so always pass `PORT=3010` explicitly when starting
  the dev server, then poll `/` for 200 before anything else.
- Dev port default is 3010; live smoke runs against the deployed origin.
- `git config http.postBuffer 524288000` is needed for the large binaries.

## 7. Deployment

Push to `main` → the host builds. Wait for the live build marker, then
`node scripts/smoke-live.mjs`. If live breaks, revert first and diagnose after.
Worker changes require `npm run worker:deploy` (owner action) — the new
`/space/capabilities` route is in that category.

2026-11-16: `smoke-live` failed once with `ERR_NAME_NOT_RESOLVED` on the
signaling Worker and passed on a rerun (message in 4 ms). A live failure whose
console shows a name-resolution or network-changed error is this machine's
network, not the deploy — rerun before reverting.

## 8. Conventions

- Every user-visible string through `t()` in all 11 locales, natural wording.
- No invented numbers; a number on screen comes from a counter, never from copy.
- Every claim must be allowed by `docs/claims.md`; `verify:claims` enforces it.
- Small commits; `git tag before-<milestone>` first; never weaken a gate.
- `npm run smoke:local` green before any push touching `src/` or `public/`.
