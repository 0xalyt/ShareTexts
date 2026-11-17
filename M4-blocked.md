# M4 — BLOCKED, one prerequisite

**Checked:** 2026-11-17, at `6fc6273`. **Nothing was built for M4.**

The M4 prompt's prerequisite check lists six requirements. Five pass. The sixth
is a hard stop, and the prompt says to stop rather than build around it:

| # | Requirement | State |
|---|---|---|
| 1 | `M3b-report.md` exists and the Circle Worker is deployed | **PASS** — `M3b-report.md`, `M3-report.md`, `ALL-M-REPORT.md` §3 (Worker versions `53ee77ad → 0bb0b14d → 37b2266a → 35e90c98 → 20acd057`) |
| 2 | `npm run verify:zero-knowledge` green against the live Worker | **not re-run in this session** — last recorded green 15/15 on `20acd057` |
| 3 | Live `/circle/capabilities` answers | **PASS** (recorded, and nothing has changed the Worker since) |
| 4 | `verify:bundle` green with headroom | **PASS** — 175.1 KB, 4.9 KB under the 180 KB ceiling |
| 5 | `useRoomList.ts` and the M2 Room UI exist | **PASS** |
| 6 | **The circle key is not stored raw in IndexedDB** | **FAIL** |

## The one that fails, precisely

`src/lib/circle/store.ts` still keeps the raw circle key `K` beside the
non-extractable import, so a stolen IndexedDB dump is a stolen circle. That is
OD-10, and it is **M3b STEP 2**, which was not done. It is not a documentation
gap: the bytes are there.

M4 STEP 1 puts the outbox in IndexedDB and STEP 7 adds a second writer; shipping
either on top of a raw `K` widens exactly the surface OD-10 was written to close.

## What the owner must do

Nothing, except say go — the fix is mine to write:

> Run M3b STEP 2 (key at rest), then M4 STEP 1.

The work, already scoped in `M3b-report.md`: a per-device non-extractable AES-GCM
wrap key; `K` stored only as ciphertext with a fresh IV and AAD = circle id +
epoch; unwrap into memory only for approve/rotate, then zero the buffer; migrate
any raw record on first read and delete the raw copy; update
`docs/adr/0001-circle.md`; extend `verify-circle-crypto` and `verify-circle-pairing`
with a full-IndexedDB dump that must not contain `K`'s bytes, plus migration and
rotation cases.

It needs `npm run verify:circle-pairing` against the deployed Worker in the same
run, which is why it was not squeezed into the copy-fix session.

## Carried over, unchanged

- **M3b STEP 2** — above.
- **M3b STEP 3, second half** — the tappable empty state in the Nearby sheet.
- **`npm run verify:browser`** — written and registered, never run end to end.
