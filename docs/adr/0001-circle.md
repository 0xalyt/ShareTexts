# ADR 0001 — Circle (Linked devices)

**Status:** accepted (OD-5, M3) · **Date:** 2026-11-15 · **Supersedes:** nothing

## Problem

Today a room's key comes from the server (`src/lib/crypto.ts`, PBKDF2 over a
room secret the Worker mints and holds). That is honest and fine for a live
two-device transfer, and it is why the product says "encrypted in transit" and
not "end-to-end". It cannot do the thing the owner actually wants: close the
tab on one device, open another, and find the item still there. Storing
anything under a server-held key would make "the server cannot read it" false.

Circle is a second, parallel system. Rooms, `crypto.ts`, the room protocol and
Spaces are untouched.

## Nouns

- **Device key** — per-browser ECDSA P-256 (sign) + ECDH P-256 (derive).
- **Circle** — a set of devices; random `circleId`; one symmetric `K`.
- **Item** — a sealed text, link, image or file.
- **Mailbox** — the Durable Object holding sealed items for absent devices.

The server never sees `K`, item contents, item names, item kinds or device
names.

## Data model (Durable Object `Circle`, SQLite)

`meta` · `members` · `wraps(device_id, epoch, wrapped, wrapped_by, sig)` ·
`log(seq, kind, body, sig, signer, ts)` · `invites` · `joins` ·
`items(item_id, from_device, epoch, size, chunks_n, created_at, expires_at)` ·
`chunks(item_id, idx, blob)` · `acks(item_id, device_id, ts)` · `push_subs` ·
`nonces`.

Device labels are stored **encrypted under `K`** — a label is a fingerprint of
a person's setup, not metadata the server has any use for.

## Crypto

- Per item: `itemKey = HKDF-SHA-256(K, salt = itemId, info = "st/item/v1")`.
- Every chunk: AES-256-GCM, random 96-bit IV, ciphertext ≤ 1 MiB.
- The item header (kind, name, MIME, total size) lives **inside chunk 0's
  plaintext**, so the server sees sizes and nothing else.
- AAD binds `circleId | itemId | fromDeviceId | epoch | ts | chunkIndex |
  chunkCount` — a chunk cannot be moved to another circle, another item,
  another position, or replayed.
- Per-device key wrap: `shared = ECDH(mine, theirs)`; `wrapKey =
  HKDF(shared, salt = circleId, info = "st/wrap/v1")`; `K` wrapped with
  AES-GCM. The unwrapped `K` is imported **non-extractable**.
- Rotation: epoch `e+1`; a removed device never gets the new wrap. Items carry
  their epoch, so an old device can still read what it was entitled to.

## Membership log

`add_device`, `remove_device` and `rotate` are statements **signed by an
existing member** and hash-chained. Every client verifies the chain before
trusting a member or wrapping `K` for anyone. The server can drop the whole
circle, but it cannot add a device: a forged entry has no valid signature, and a
spliced one breaks the chain.

## Pairing

- **Invite** — 16-byte `joinSecret`, 10-minute expiry, single use, carried in
  the URL **fragment** (`#j=<circleId>.<joinSecret>`), which no browser sends to
  any server. The server stores only `inviteId = SHA-256(joinSecret)`.
- **Code** — 8-char base32 mapping to an `inviteId`, 10-minute TTL, 10 attempts
  per minute.
- **Approval** — a four-emoji short authentication string derived from
  `ECDH(inviter, joiner) || joinSecret || transcriptHash`. Both people see four
  emoji and compare. Approve wraps `K` and appends a signed `add_device`. A
  mismatch burns the invite. This is the defence against a server swapping keys
  mid-pairing.

## Request authentication

`X-ST-Device`, `X-ST-Time`, `X-ST-Nonce`, `X-ST-Sig`, where the signature is
ECDSA over `METHOD \n PATH \n sha256(body) \n time \n nonce`. The DO checks the
±60 s window, a 5-minute nonce window and the member's public key. A pending
joiner authenticates with its own submitted key plus a valid `inviteId`.

## Threat model — what this defends and what it does not

**Defends against:** a curious or compromised server reading item contents,
names or kinds; a server adding a device to a circle; a server swapping keys
during pairing (the SAS comparison catches it); replay and chunk reordering.

**Does not defend against:** a compromised *device* (it holds a wrapped `K`); a
person who approves a join they did not compare (the SAS is shown, not
enforced); traffic analysis through ciphertext sizes and request times; a
server that deletes or withholds items (availability is not covered).

## What the server learns — the complete list

IP address, request times, ciphertext sizes, the circle ID, device IDs, push
endpoints, and which device acknowledged which item. Nothing else: not `K`, not
contents, not names, not kinds, not device labels.

## Claims

"Linked devices are end-to-end encrypted" stays **unclaimable** until
`scripts/verify-zero-knowledge.mjs` (M3 STEP 4) passes. `docs/claims.md` carries
it as a draft marked pending; no public copy changes in M3.

## Consequences

- One more Durable Object class, one more migration (`v6-circle`), one more
  binding (`CIRCLES`).
- The client must carry real crypto (WebCrypto only, no third-party library),
  lazily loaded: zero bytes in the entry chunk.
- The product now has two encryption stories, and copy must keep them apart:
  rooms are "encrypted in transit", Circle is (later) "end-to-end".
