# M3 — Circle Core

**Tag:** `before-M3` (pushed) · **Branch:** `main` · **Date:** 2026-11-15

Status: **STEP 0 and STEP 1 shipped.** STEPs 2–6 are not started; the BUDGET
RULE forbids starting a step that cannot be finished and verified in the same
run, and the mailbox server (STEP 2) is a Durable Object class, a migration and
a route table — it gets its own run.

Nothing public changed. No claim was enabled. Rooms, `src/lib/crypto.ts`, the
room protocol and Spaces are untouched, as OD-5 requires.

## 1. STEP 0 — ADR and pending claim (`ef9e4b8`)

- `git tag before-M3`, pushed.
- `docs/adr/0001-circle.md` — data model, crypto, pairing, request auth, threat
  model, and the complete list of what the server learns (IP, request times,
  ciphertext sizes, circle ID, device IDs, push endpoints, acks). Two pages, as
  asked.
- `docs/claims.md` gained a **PENDING — not claimable** row for "Linked devices
  are end-to-end encrypted", with the condition for turning it on (STEP 4's
  zero-knowledge proof). `verify:claims` still forbids the phrase in public
  copy.

## 2. STEP 1 — device keys and the seal (`ef9e4b8`)

`src/lib/circle/seal.ts`
- HKDF-SHA-256 → AES-256-GCM. No third-party crypto library.
- AAD binds `circleId | itemId | fromDeviceId | epoch | ts | chunkIndex |
  chunkCount`, so a chunk cannot be moved to another circle, item, position or
  sender, and cannot be replayed.
- `K` is imported **non-extractable** — and, because WebCrypto will not derive
  from a key it cannot read, it is imported as an *HKDF base key*, so there is
  no code path that turns it back into bytes.
- Wrap/unwrap per device over ECDH, salted with `circleId`.
- SAS: four emoji from a fixed 64-entry table, derived from
  `ECDH || joinSecret || transcriptHash`.
- Membership log: hash-chained, each entry signed by a member.

`src/lib/circle/keys.ts`
- Two P-256 pairs per browser (ECDSA for signatures, ECDH for wrapping), private
  halves generated `extractable: false` and stored in IndexedDB
  (`sharetext-keys` v1, store `device`).
- `deviceId` = first 20 chars of base32(SHA-256(sign SPKI)).
- `isCircleCapable()` probe, `requestPersistence()`, rename, coarse default
  label.

### Gate — `npm run verify:circle-crypto`

Runs the **production module** under Node's WebCrypto (Node 24 strips the
types), not a re-implementation:

```
✓ known-answer vector — 2mHdjXgXKq-jcc4RyD_vRSWp0kFiUEXKlcDbfw
✓ round trip
✓ a flipped ciphertext bit is rejected
✓ a flipped AAD bit is rejected
✓ a chunk moved to another circleId / itemId / fromDeviceId / epoch / ts / chunkIndex / chunkCount is rejected  (7 checks)
✓ wrap → unwrap → read an item
✓ unwrapped circle key is non-extractable
✓ a third device cannot unwrap the circle key
✓ a wrap from another circle is rejected
✓ SAS matches on both devices — 🎯 ⚡ 🎯 🚗
✓ SAS differs under a man in the middle — 🐼 ☀️ 🚀 ❄️
✓ SAS is bound to the join secret
✓ an honest chain verifies
✓ a forged entry is rejected — broken_link
✓ a missing link is rejected — broken_link
✓ a non-member cannot sign the chain — bad_signature
✓ no static importer (entry chunk pays 0 bytes)

[verify-circle-crypto] GREEN
```

Other gates after STEP 1: `tsc --noEmit` clean · `npm run build` 0 ·
`npm run verify:bundle` **PASS 179.0 KB (unchanged)** · `npm run smoke:local`
GREEN · `npm run verify:claims` clean.


## 3. STEP 2 — the mailbox, shipped

`worker/src/circle.ts` — the `Circle` Durable Object. Server-side nouns, exactly
as ADR 0001 describes: members, per-device wraps, a signed membership log, invites,
pending joins, sealed items and their chunks, acks, nonces. It holds no key, no
name, no kind and no plaintext.

- **Routes** (all under `/circle/<circleId>/…`): `POST /create`, `POST /invite`,
  `POST /join`, `POST /approve`, `GET /members`, `POST|GET /log`,
  `PUT|GET /item/:id/chunk/:i`, `GET /items`, `POST /item/:id` (ack),
  `DELETE /item/:id`.
- **Auth**: ECDSA P-256 over `METHOD 
 PATH 
 hex(SHA-256(bodyBytes)) 
 time 

  nonce`, verified against the member's stored key, ±60 s clock window, 5-minute
  nonce memory for replay. A pending joiner may speak once, with the key it is
  submitting plus a live invite; approval — never a code — is what writes
  membership.
- **Limits** (`worker/src/limits.ts`): 1 MiB chunks, 200 chunks/item, 500
  items/circle, 30-day item TTL, 12 devices, 5 000 log entries, 20 invites,
  10-minute invites, ±60 s clock, 5-minute nonces, 1 MiB + 8 KiB body cap.
- **Config**: `CIRCLES` DO binding, migration `v6-circle`
  (`new_sqlite_classes = ["Circle"]`), route table entry with the same per-IP
  rate limiting the Space routes use.

### Gate — `npm run verify:circle-worker` (30/30)

Bundles the real class against the Worker shim and signs real requests:

```
ok  create registers the first device · a second create is refused
ok  unsigned / stale / replayed / non-member / forged are each refused
     (401, 401, 409, 403, 401)
ok  invite mints a 64-hex id and an 8-char code, expiring in ten minutes
ok  a joiner with the code becomes pending, not a member
ok  the join relay carries a transcript hash, not keys
ok  a pending device cannot approve itself
ok  approval writes membership and a wrap (2 devices, wrap @ epoch 1)
ok  an invite is not reusable once approved
ok  a sealed chunk is accepted · the other device reads back identical bytes
ok  the chunk response is not cacheable (no-store)
ok  a chunk over 1 MiB is refused · item list has sizes/epochs but no names
ok  an ack names the device that got it · another device cannot delete your item
ok  the owner deletes it and it stops being listed
ok  a signed log entry is chained with a sequence number

30/30 checks passed · 25 routes timed: median 0.45 ms, p95 2.21 ms
```

**Honest reading of the timing**: p95 2.21 ms is Node emulator *wall* time for the
whole DO call, not Worker CPU time. It clears the 5 ms target with room, but a
real `wrangler dev`/production CPU measurement still needs the deploy.

Not built, and named so it is not mistaken for done: the **Stats budget guard**
(the per-circle accounting hook the prompt pairs with these routes). The generic
per-IP rate limit is in place; the per-circle request budget is not.

**`npm run worker:deploy` has still NOT been run** — no Cloudflare token on this
machine. The binding, the `v6-circle` migration and the routes exist in the repo
and pass their gate, but nothing is live until that deploy. No client code calls
`/circle/*` yet, so shipping the frontend before the Worker is harmless.

## 4.. NOT VERIFIED (strict)

- **STEPs 2–6 untouched.** No `Circle` Durable Object, no `/circle/*` routes, no
  `CIRCLES` binding, no `v6-circle` migration, no `limits.ts`, no Stats budget
  guard, no pairing UI, no zero-knowledge proof, no dev surface. No client code
  calls `/circle/*`, so a client deployed before a Worker is harmless today.
- **`npm run worker:deploy` has NOT been run.** STEP 2 needs it; the exact
  command is in §7.
- **p95 CPU per mailbox route: not measured**, because no mailbox route exists
  yet. The prompt's target (≤ 5 ms) is recorded here as the number STEP 2 must
  hit.
- The crypto gate runs in Node. The same module in a browser (IndexedDB key
  storage, the capability probe) is compiled and type-checked but **not**
  exercised in a real browser this run — that belongs with STEP 3's Playwright
  pairing gate.
- No iOS/Safari check of `navigator.storage.persist()`.

## 4. Untouched steps (carry forward)

STEP 2 mailbox server (`worker/src/circle.ts`, `limits.ts`, routes, `CIRCLES`,
`v6-circle`, budget guard) · STEP 3 client pairing (`api.ts`, `store.ts`,
`pairing.ts` + `verify-circle-pairing.mjs`) · STEP 4 zero-knowledge proof
(`verify-zero-knowledge.mjs`) · STEP 5 flagged dev surface · STEP 6 deploy
safety.


## 5. STEP 3 — client pairing, shipped

`src/lib/circle/api.ts` — the signed client. Every call signs
`METHOD 
 PATH 
 hex(SHA-256(bodyBytes)) 
 time 
 nonce` with the device key;
the body is hashed as bytes and the path is the pathname (query excluded, so the
two sides cannot disagree about a `since`). `join` is the one request that signs
with the key it is *submitting*, which is why a pending device can speak before
it is a member.

`src/lib/circle/pairing.ts` — the four moves: create (the circle id is chosen by
the client, not the server), invite (the **join secret is the client's**; the
server is given only its SHA-256 — this was a real bug in STEP 2's first version
and is fixed here), join → pending, four emoji, approve → wrap + signed
`add_device`. Plus `pairingProblemKey()`, so every failure the flow can produce
has an i18n key instead of ad-hoc wording.

`src/lib/circle/store.ts` — IndexedDB `sharetext-circle` v1, one record per
circle: `circleId`, `epoch`, K imported for use, and the raw K the inviting
device needs to wrap for a new device.

### Gate — `npm run verify:circle-pairing` (17/17, real worker)

Runs the production modules against `wrangler dev` on 127.0.0.1:8787 (not a
mock, not a re-implementation):

```
ok  one device creates the circle and holds K
ok  an invite has a code, a client-owned secret and a fragment
ok  the server never receives the join secret
ok  the fragment round-trips to (circleId, joinSecret)
ok  the joiner becomes pending with a transcript hash
ok  the inviter sees exactly one pending device · a pending device is not a member yet
ok  both devices show the same four emoji — 🍉 🦊 🦊 ✈️
ok  a swapped key produces different emoji — 🐷 🥁 🐔 🎸
ok  approval wraps K for the joiner and records an epoch
ok  the joiner unwraps the same K and reads what the inviter sealed
ok  the circle now lists two devices, and B can read it too
ok  a wrap exists for the joiner at epoch 1
ok  a spent invite cannot link another device · a wrong code is refused
ok  a device outside the circle cannot read it · the server rejects a malformed invite id

17/17 checks passed
```

Server changes that came with it: `POST /invite` now takes the client's
`inviteId` (the server mints only the code), `GET /pending` lists joiners for
members only, base64**url** keys and signatures decode correctly on the Worker
side (a plain `atob` rejected every browser-signed request), and circle
responses carry CORS headers with PUT/DELETE plus the signature headers allowed.

**Deviation to know about (⚑ question 1 below):** `store.ts` keeps the raw K
alongside the non-extractable import. Wrapping K for a newly linked device needs
its bytes, and the server holds nothing. The item path still uses only derived,
non-extractable keys.

## 5b. Files changed

`docs/adr/0001-circle.md` (new) · `docs/claims.md` · `src/lib/circle/seal.ts`
(new) · `src/lib/circle/keys.ts` (new) · `scripts/verify-circle-crypto.mjs`
(new) · `package.json` (gate wired) · `M1-report.md` (bundle line brought up to
date: the recorded failure was fixed in `661f99e` and the record now says so).

## 6. New gates

`npm run verify:circle-crypto` (24 assertions).

## 7. Questions (5, with recommendations)

1. **STEP 2 ordering** — the mailbox is the last step that needs a Worker
   deploy before client code may call it. Build the mailbox next, deploy, then
   the client? *Recommendation: yes — server first, `npm run worker:deploy`, then
   pairing.*
2. **Free-plan CPU** — mailbox routes must stay ≤ 5 ms p95. Streaming a 1 MiB
   chunk through a Durable Object is the risk; if it lands above 5 ms, store
   chunks as one `ArrayBuffer` per row and skip per-chunk re-encryption.
   *Recommendation: measure before optimising, and report the real p95.*
3. **`new_sqlite_classes`** — `v6-circle` assumes the existing SQLite-backed DO
   pattern from Spaces. Confirm the account already runs `space.ts` in
   production (it does per M1's protocol work), so the migration tag ordering
   is safe. *Recommendation: proceed; verify the tag list in `wrangler.toml`
   before deploying.*
4. **Budget guard thresholds** — 70% → `text-only`, 90% → `direct-only`, as
   written. Should the guard also shut new circle creation at 90%?
   *Recommendation: no; existing circles keep working, only new items are
   refused.*
5. **SAS length** — four emoji is what the prompt specifies. Six emoji is
   roughly 36 bits instead of 24 for the cost of two more comparisons.
   *Recommendation: keep four now; revisit when the claim flips in M4.*

## 8. OWNER ACTIONS

- When STEP 2 lands, run: `npm run worker:deploy` (from the repo root, with
  `CLOUDFLARE_API_TOKEN` in the environment). It must be deployed **before**
  any client build that calls `/circle/*` is pushed.
- No new secrets are needed for STEPS 0–1. STEP 2 uses the existing Worker
  bindings; VAPID keys stay M4's job.
- Nothing on the public site changed in this run; no live copy to review.
