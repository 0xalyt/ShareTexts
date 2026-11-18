# M4 — Circle Experience ("Linked devices")

**Branch:** `main` · **Tag before this prompt:** `before-M4` → `5f42bba` · **Date:** 2026-11-18

**SHAs:** engine `fe0003a` (feat) · report + state doc `9d2a207` (docs) · both pushed to `main` (`5f42bba..9d2a207`).
**Live:** pushed → Cloudflare build live → `node scripts/smoke-live.mjs` **GREEN** against `https://sharetexts.online`, build marker `9d2a20778236` (matches HEAD). The deploy is observable on the live `sw.js`, which now carries the `circle-outbox` sync handler; the circle engine itself is **not** in the shipped bundle yet because nothing imports it (STEP 1 has no surface), so the entry chunk is unchanged at 171.9 KB.

## Status

| Step | State |
|---|---|
| 1 — Outbox, inbox, mailbox delivery | **engine + both gates shipped (this report)** |
| 1 — items rendered in the Room timeline | **NOT DONE** (see "Untouched") |
| 2 — Pairing experience, "Keep linked?" | untouched |
| 3 — Push | untouched |
| 4 — "Your devices" shelf, Circle in the Room | untouched |
| 5 — Linked devices page | untouched |
| 6 — Direct path | untouched |
| 7 — Multi-tab, install nudge | untouched |
| 8 — Claims, docs, telemetry | untouched |

The headline promise — *send from one device, close the tab, open the other device later, the item is there* — is now **true in code and proven by gates**: 17/17 in `verify-outbox`, 10/10 in `verify-circle-e2e`. It is **not reachable by a person yet**, because STEP 2's "Link my devices" screen is what creates a circle in the app. That is the next prompt-shaped job, not a hidden half-step.

## Prerequisite check — proof re-run this session, not quoted from a report

| # | Requirement | Result |
|---|---|---|
| 1 | `M3b-report.md`, Circle Worker deployed | **PASS** — `M3b-report.md` present; Worker answers on `sharetext-signaling.alighttt.workers.dev` |
| 2 | `verify:zero-knowledge` green vs the live Worker | **PASS — 15/15** (`ok every mailbox read answered … /members /items /log /pending`) |
| 3 | live `/circle/capabilities` answers | **PASS** — `{"version":"circle-1","maxChunkBytes":1048576,"chunksPerItem":200,"itemsPerCircle":500,"itemTtlDays":30,"membersPerCircle":12,"push":false,"heavyDay":false}` |
| 4 | `verify:bundle` green with headroom | **PASS** — entry `index-COomOhyr.js` **171.9 KB** (180 ceiling) |
| 5 | `useRoomList.ts` + M2 Room UI exist | **PASS** |
| 6 | circle key not raw in IndexedDB | **PASS** — `verify:key-at-rest` 9/9 (re-run in this session) |
| 7 | `verify:browser` fully green, desktop ≥16/16 | **PASS** — `[verify-browser] GREEN — every browser gate passed` (sheets 14/14, desktop **16/16**, no-flash clean, room-paint clean, basics clean) |

## What STEP 1 shipped

New files (all lazy — the entry chunk did not move):

| File | What it is |
|---|---|
| `src/lib/circle/items.ts` | One item, sealed into chunks and opened back. Wire: `iv(12) ┃ ts(8, f64) ┃ ciphertext ┃ tag`. Plaintext: `u32 headerLen ┃ header JSON ┃ payload`. Header (kind, name, mime, bytes, sha256) travels **inside** the ciphertext. `newItemId()` is **UUIDv7**, so the mailbox lists a thread in send order. |
| `src/lib/circle/outbox.ts` | IndexedDB `sharetext-outbox` v1 (`items` + `payloads`), states `queued → sealing → uploading(k/n) → stored → delivered → seen` sideways into `failed / paused / expired`, per-chunk upload with 1/2/4/8/16/30 s + jitter backoff, resumable at the chunk that failed, idempotent by (itemId, index), storage-estimate refusal, pause/resume/cancel/retry, and six triggers (boot, `online`, visibility, 15 s timer, push message, `circle-outbox` Background Sync). |
| `src/lib/circle/inbox.ts` | IndexedDB `sharetext-inbox` v1. `GET /items` → fetch chunks → decrypt → **write to disk** → **then** ACK. Local dedupe by (circle, item) key. Four items in parallel, not in series. Items that cannot be opened are counted (`skipped`), not silently dropped. |
| `src/lib/circle/idb.ts` | The promise wrapper; no schema knowledge. |
| `src/lib/circle/endpoint.ts` | Mailbox origin without importing socket.io. |
| `scripts/verify-outbox.mjs` | The gate (below). |
| `scripts/verify-circle-e2e.mjs` | The other gate (below). |
| `scripts/lib/two-devices.mjs` | Two real browser profiles, the production pairing flow, both sides really holding K. |

Touched: `src/lib/circle/api.ts` (retry is a parameter now; skew persisted), `src/lib/circle/seal.ts` (`unwrapCircleKeyRaw`), `src/lib/circle/pairing.ts` (`unwrapRawFromInviter`), `public/sw.js` (`sync` handler for `circle-outbox`).

## Proof — measured, this session

`node scripts/verify-outbox.mjs` — **17/17, 57 s**

| Claim | Measured |
|---|---|
| three items queue and upload while the other device's tab is closed | `stored,stored,stored` |
| the queue survives a reload of the sending tab | `stored,stored,stored` |
| offline queues instead of failing | `skipped=offline queued=1` |
| the queued item goes when the network returns | `uploaded=1` |
| a device that opens later gets every queued item | 4 items, **1832 ms** |
| the items arrive in the order sent | `one \| https://example.com/two \| three \| four` |
| nothing arrives twice | 4 ids, 4 unique |
| **the pull itself finishes within 2 s** | **1832 ms for 4 items** |
| 25 rapid sends | `uploaded=25 failed=0`; 25 arrived, 25 unique, in order |
| a failed chunk stops the pass instead of lying | `queued, done=1/3, attempts=1` |
| the next pass resumes and completes | `stored 3/3` |
| the resumed pass starts at the failed chunk | chunk 0 PUTs after resume = **0**, chunk 1 = 1 |
| the last uploaded item is picked up by a later pull | `[1]` |
| ACK is the only thing that says delivered | `30 moved`, all `delivered` |
| a seen receipt sticks | 1 |

`node scripts/verify-circle-e2e.mjs` — **10/10**

create → pair (four emoji match) → text + link + file → receive → ACK → seen, with the file **byte-identical** (46 bytes) and its name preserved. Three items in **1576 ms**.

**The owner's 2-second number, honestly:** the pull is **1.83 s**; page-open → items on screen is **3.38 s** (app boot 1.55 s + pull 1.83 s) on this machine against the deployed Worker, whose RTT from here is ~300–400 ms. The remaining gap is (a) the app does not yet start the pull during boot — that is STEP 4's wiring — and (b) latency, which is ~4× worse here than on a phone at 80 ms RTT. The gate asserts the part this milestone owns and prints the total rather than redefining the target as a pass.

### Five bugs the gates found (all fixed here)

1. **No browser could use the mailbox if its clock was >60 s off.** The client recovered from `401 STALE` by retrying with an `x-st-retry` header; that header is not in the Worker's `Access-Control-Allow-Headers`, so the browser blocked the retry and the app showed "Failed to fetch" on its first Circle call. The retry is now a parameter, and the corrected skew is remembered in `localStorage`. **The Node gates could never see this: Node has no preflight.**
2. **A resumed upload restarted at chunk 0.** The error path wrote the pre-pass record instead of the advanced one, forgetting which chunks had landed.
3. **The first retry waited 2 s, not 1 s** — the ladder was indexed from `attempts` instead of `attempts - 1`.
4. **Every received item failed to open**: the parallel-pull rewrite passed `fromDevice` where the AAD wanted `fromDeviceId`, so all four AAD fields shifted. Found by `verify-outbox`, fixed, then green.
5. **The joining device could never persist K.** `unwrapCircleKey` returned a non-extractable handle with no bytes to seal, so a joiner's circle evaporated on reload. Added `unwrapCircleKeyRaw` + `unwrapRawFromInviter` (M3 gap, no protocol change: same ciphertext, same AAD).

Also corrected a spec assumption: `GET /pending` on the Worker is the queue of devices awaiting **approval**, not of waiting items. The inbox reads `GET /items` (whose `acked[]` is the receipt list). Code wins over docs, per the brief.

## NOT VERIFIED (strict)

- **No real phone.** Everything above is Chromium on Windows against the deployed Worker. The Redmi 9 + Termux path is untested.
- **Background Sync has not woken anything.** The `sync` handler and the `circle-outbox` registration exist and the code path is wired, but no gate proves Chromium wakes a closed tab. Not claimed.
- **No push.** `capabilities.push` is `false`; STEP 3 untouched.
- **Nothing is on screen.** No Room timeline row, no "Waiting" badge, no Library surface. A person cannot link, send or receive through the UI yet.
- **Safari/iOS untested** (no WebKit run this session).
- **No 40 MB direct transfer** (STEP 6).
- **Seen receipts are local only** — the `seen` state does not travel to the sender yet (needs STEP 3/6's channel).

## Untouched

STEP 2 (link screen, QR/code, emoji sheet, "Keep linked?"), STEP 3 (push), STEP 4 (landing shelf, Circle in the Room, `useRoomList` swap), STEP 5 (Linked devices page, unlink, recovery), STEP 6 (direct path, big files), STEP 7 (multi-tab leader, install nudge), STEP 8 (claim flip, docs, telemetry). STEP 1's **Room timeline rendering** is also untouched: it needs the STEP 2 link screen for a circle to exist at all, and the Room's timeline is fed by `SessionContext`, so doing it first would have meant a half-built surface with no way to reach it.

## New gates

```
npm run verify:outbox        # 17 checks, two browser profiles, ~60 s
npm run verify:circle-e2e    # 10 checks, ~90 s
```

Both need a dev server (they start their own, `3102` / `3103`) and reach the deployed Worker (`CIRCLE_URL` overrides).

## Files changed

`src/lib/circle/{items,outbox,inbox,idb,endpoint}.ts` (new), `src/lib/circle/{api,seal,pairing}.ts`, `public/sw.js`, `scripts/verify-outbox.mjs` (new), `scripts/verify-circle-e2e.mjs` (new), `scripts/lib/two-devices.mjs` (new), `package.json` (two scripts), this report, `SHARETEXTS-PROJECT-STATE.md`.

## Questions (with my recommendation)

1. **Where do Circle items appear in the Room?** Inline in the same timeline, or a "Linked devices" section above it? → **Recommend a separate section**, because the room transcript is peer-to-peer and ephemeral while these items waited in a mailbox; merging them would make "nothing is kept" read as false.
2. **Who gets the 2-second budget — the pull, or the whole open?** → **Recommend the whole open**, and close it by starting the pull during boot (STEP 4), not by making the mailbox faster than physics.
3. **Mailbox TTL:** the Worker keeps items 30 days (`itemTtlDays`), the client's own queue expires at 7. Should the client match? → **Recommend keeping 30 server / 7 client**: the server's number is an abuse bound, the client's is a promise to the person.
4. **"Seen" receipt:** send it over the membership log now, or wait for STEP 6's signed channel? → **Recommend now over the log** (it is already signed and ordered), so the sender's "Delivered" does not stay forever the last word.

## OWNER ACTIONS

**Worker deploy (only if you change `worker/src`; this session changed none):**

```bash
cd worker && npx wrangler deploy
# then, from the repo root:
node scripts/verify-zero-knowledge.mjs
```

**Push secrets (STEP 3, not needed yet).** `worker/src/vapid.ts` reads exactly these three:

```bash
cd worker
npx wrangler secret put VAPID_PUBLIC_KEY    # raw P-256 point, base64url
npx wrangler secret put VAPID_PRIVATE_KEY   # PKCS8, base64url
npx wrangler secret put VAPID_SUBJECT       # mailto:you@sharetexts.online
```

**Real-device checks when STEP 2 lands** (each is a sentence I cannot verify from here):

1. Redmi 9, Chrome: link two devices, send text, close the second tab, reopen it — the text is there in under two seconds.
2. Redmi 9: turn airplane mode on, send, turn it off — the item goes by itself.
3. iPhone Safari: same, and note whether the tab survives being backgrounded overnight.
4. Both: rename one device and check the other shows the new name.
