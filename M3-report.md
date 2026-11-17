# M3 — Circle Core

**Tag:** `before-M3` · **Branch:** `main` · **Rewritten:** 2026-11-16 for M3b STEP 0
(the previous text said "STEPs 2–6 are not started", which stopped being true when
`03d1b05` landed and made the M4 prompt's prerequisite check fail on a stale file).

Status: **STEPs 0–4 shipped and deployed. STEP 5 untouched. STEP 6 satisfied by
feature detection** of `GET /circle/capabilities`.

## What shipped

| SHA | Step | Content |
|---|---|---|
| `ef9e4b8` | 0–1 | `docs/adr/0001-circle.md`; device keys; the seal — HKDF-derived `K`, per-item keys, wraps, SAS |
| `b975aea` | 2 | The Circle mailbox Durable Object: sealed bytes in, sealed bytes out |
| `03d1b05` | 3 | Client pairing — `src/lib/circle/{api,pairing,store}.ts`; `verify:circle-pairing` 17/17 against a real local Worker |
| `8c6af0d` | — | **Production bug:** every `/circle/*` answered 429 because the `circle` rate-limit scope did not exist |
| `23aee05` | 4 | The zero-knowledge proof against production, `/circle/capabilities`, and the clock fix |

**Worker versions deployed this session** (wrangler OAuth `wormer10gpt@gmail.com`):
`53ee77ad` → `0bb0b14d` → `37b2266a` → `35e90c98` → `20acd057` (final).
Checked live after each: `/health`, `/circle/capabilities`, `POST /circle/<id>/create`
→ 200, unsigned `/members` → 401, `/lobby` announce → ack.

## Proof

| Gate | Result |
|---|---|
| `verify:circle-crypto` | GREEN, 24 assertions |
| `verify:circle-worker` | **30/30** (a real DO in Node) |
| `verify:circle-pairing` | **17/17 against the deployed Worker** |
| `verify:zero-knowledge` | **15/15 on production** |
| `worker:test` | 103/103 |
| `worker:test-live` | 18/18 |

The zero-knowledge gate does not ask the server whether it can read items. It
seals a 4 KiB item, records every byte that leaves the device, uploads, pulls the
ciphertext back, and tries to open it with only what the server holds:

```
ok  no request body / header ever contained the plaintext or K
ok  every request went to the mailbox, over the signed API — 3 requests
ok  stored bytes are indistinguishable from random — 7.96 bits/byte
ok  the member list carries public keys only — deviceId,signPub,ecdhPub,joinedAt
ok  a key the server could have made cannot open it
ok  the device that holds K reads it back exactly
```

## STEP 5 and STEP 6

- **STEP 5 — the flagged dev page: untouched.** There is no in-product "link this
  device" surface. Nothing in the UI calls `/circle/*`; the flows are driven by
  the gates.
- **STEP 6 — satisfied by feature detection.** The client asks
  `GET /circle/capabilities` and hides what the deployment cannot do; no claim is
  enabled on the strength of the deployment existing.

## NOT VERIFIED

- **No real phone in the loop.** Pairing is proven between Node clients and
  between two browser contexts; a Redmi 9 has never approved a device.
- **Key at rest was not zero-knowledge on disk.** `store.ts` kept the raw `K` in
  IndexedDB beside the non-extractable import. That is OD-10, and M3b STEP 2 is
  the fix — until that ships, a stolen IndexedDB dump is a stolen circle.
- **No claim flip.** "End-to-end encrypted" is still forbidden by
  `docs/claims.forbidden.json`, correctly: the Worker mints the room secret for
  temporary rooms, and the circle story does not cover them.

## Files

```
worker/src/{circle,limits,registry,index,types}.ts · worker/migrations/v6-circle
src/lib/circle/{api,pairing,store,seal}.ts
scripts/verify-circle-{worker,pairing,crypto}.mjs · verify-zero-knowledge.mjs
docs/adr/0001-circle.md
```

## Decisions worth naming

- **Signatures bind the pathname, not the query.** `?since=` is a read cursor, not
  content; signing it would make cache-busting retries fail. Replay nonces already
  cover the retry case.
- **Bodies are hashed as bytes**, not as re-serialised JSON: key order and
  whitespace differ between browsers, and only bytes are stable.
