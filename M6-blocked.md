# M6 is blocked — M4 was never built

**Date:** 2026-11-15 · **Branch:** `main` · **State:** stopped before building anything

The M6 prompt's PREREQUISITE CHECK requires `M4-report.md` showing M4 **STEPs
1–4** shipped: the outbox/inbox, device pairing, push, and Linked devices in the
landing page and in the Room. None of that exists, so no M6 code was written.

This file says what is missing, why, and the one action that unblocks it.

## What the check required, and what is actually true

| Required | Truth today | Verdict |
| --- | --- | --- |
| `M4-report.md` exists and shows STEPs 1–4 | **The file does not exist.** The repo has `M4-blocked.md` — M4 was stopped at its own prerequisite check and never started. | ❌ |
| Outbox / inbox with persistence across tab close | Not written. There is no `src/lib/outbox.ts`, no inbox runner, no delivery acknowledgement. | ❌ |
| Device pairing (link a device, Linked devices list) | Partial: the M3 Circle *client* (`src/lib/circle/*`) and mailbox Worker exist and are deployed, but no UI links a device, and nothing lists Linked devices in the landing page or the Room. | ❌ |
| Push (VAPID) wake a closed device | Not configured. `/circle/capabilities` returns `"push": false` because `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are unset. | ❌ |
| `useRoomList()` and the Room UI (M2) | Shipped in `4ec91dd`; `verify:desktop` 16/16, `verify:sheets` 9/9. | ✅ |

M6's every valuable path ends in a **target**: STEP 1's "Send to…" sheet lists
Linked devices, STEP 5's clipboard ladder fires only for text from the person's
own Linked devices, and the push rung needs M4's notification. Without M4 there
is exactly one target — the guest QR — which is M6 STEP 1's fallback, not M6.

## What changed since `M4-blocked.md` was written (good news)

M4's own three blockers are now **cleared**, so M4 can be run immediately:

| `M4-blocked.md` complaint | Now |
| --- | --- |
| "Worker deploy has NOT been run" | **Deployed**: version `35e90c98-ad81-4437-ba0f-621f20c72963`. `GET /circle/capabilities` is live. |
| "`scripts/verify-zero-knowledge.mjs` does not exist" | **Exists and is green: 15/15 against production** — no plaintext or key on the wire, stored bytes 7.96 bits/byte, reads carry public keys only. |
| M3 STEP 3 pairing | `verify:circle-pairing` **17/17 against the deployed Worker**. |
| (found during deploy) `/circle/*` returned 429 for every call | Fixed: `circle` scope added to the rate limiter (`8c6af0d`). |
| (found during deploy) a device whose clock is 60 s off could not link at all | Fixed: `401 {error:'STALE', now}` + client skew correction and one retry (`23aee05`). |

So the M4 chain is unblocked for the first time. The order is now:

1. **Run the M4 prompt** (outbox → pairing → push → Linked devices). That is what
   gates M6.
2. **Optionally finish M5 STEPs 2–8 first** if you want the Nearby card and
   Walk-up before M6 — M6 only needs the guest QR from M5, and M5 STEP 1
   (network-scoped Lobby) is already shipped and live.
3. **Then re-paste M6.** With M4 present, M6 STEP 1's target sheet, STEP 5's
   clipboard ladder and STEP 2's Share Target stash all have somewhere to send.

## What M6 steps would be buildable today (and why I did not build them)

- STEP 1 `/send` parser and preview — buildable, but its "Send to…" sheet would
  list **no devices**, so it would ship a doorway into an empty room.
- STEP 2 `share_target` + service-worker stash — buildable and self-contained.
- STEP 3 iPhone Shortcut guide — buildable.
- STEP 4 browser extension — buildable.

Building STEP 2–4 while STEP 1 has no destination is exactly the "half a feature
that lies" the budget rule forbids, and the prompt says to stop rather than
silently redo a dependency. All four carry to the next prompt unchanged.

## Owner actions

1. **Re-paste the M4 prompt.** Nothing else is needed first — the Worker is
   deployed and the zero-knowledge gate is green.
2. Optional, M4 STEP 3: set the push secrets when M4 asks for them
   (`wrangler secret put VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT`).
   `push` stays `false` in `/circle/capabilities` until then, honestly.
3. Nothing to install, no account, no payment.
