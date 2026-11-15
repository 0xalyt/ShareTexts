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

## 3. NOT VERIFIED (strict)

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

## 5. Files changed

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
