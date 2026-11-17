# M4 — was blocked, now CLEARED (`4a0421d`)

**Checked again:** 2026-11-17. **M4 may start at STEP 1.**

This file existed because one prerequisite failed. It passes now.

| # | Requirement | State |
|---|---|---|
| 1 | `M3b-report.md` exists and the Circle Worker is deployed | **PASS** |
| 2 | `npm run verify:zero-knowledge` green against the live Worker | **PASS** at `20acd057` (15/15); not re-run since — the Worker has not changed |
| 3 | Live `/circle/capabilities` answers | **PASS** |
| 4 | `verify:bundle` green with headroom | **PASS** — 175.1 KB, 4.9 KB under the ceiling |
| 5 | `useRoomList.ts` and the M2 Room UI exist | **PASS** |
| 6 | The circle key is not stored raw in IndexedDB | **PASS** (`4a0421d`) |

## What closed item 6

`src/lib/circle/store.ts` no longer writes `keyRaw`. K is stored as AES-GCM
ciphertext under a per-device, **non-extractable** wrap key; AAD binds it to
circle id and epoch; the bytes exist only inside `withCircleKey()`, zeroed in a
`finally`; v1 records migrate on first read and `listCircles` migrates as well.

**Proof, in a real browser against a real IndexedDB** — `npm run verify:key-at-rest`,
9/9:

```
PASS the device wrap key is non-extractable
PASS after saveCircle, K's 32 bytes appear nowhere in IndexedDB
PASS a v1 record does hold raw K before migration (the test can see it)
PASS after the migration read, raw K is gone from IndexedDB
PASS the migrated record has no keyRaw field
PASS the migrated record carries keySealed
PASS openStoredCircle still opens a sealed circle
PASS withCircleKey still returns K's exact bytes
PASS the database has both stores — circles, device
```

`npm run verify:circle-pairing` — **17/17 against the deployed Worker**, so the
change did not disturb the protocol: a wrap still exists for the joiner at epoch
1, a spent invite still fails, a wrong code still fails, a non-member still
cannot read.

## What M4 STEP 1 inherits

`saveCircle()` now seals at the boundary, so the outbox writer should call
`withCircleKey()` for anything that needs K's bytes and must never keep them.
The outbox's own records are not key material and are not covered by this change.
