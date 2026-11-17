# M4 — Circle Experience ("Linked devices") — STATUS: NOT STARTED

**Branch:** `main` · **Checked:** 2026-11-17 at `9ce63bc` · **Report written:** 2026-11-17

This is a status report, not a shipping report. **No M4 step has been built.**
There is no outbox, no inbox, no "Link my devices" screen, no push, no shelf,
no Linked devices page. The only M4-related work is the prerequisite that was
blocking it, which is now fixed.

## Prerequisite check (all six)

| # | Requirement | State | Proof |
|---|---|---|---|
| 1 | `M3b-report.md` exists, Circle Worker deployed | **PASS** | `M3b-report.md`; `M3-report.md`; `ALL-M-REPORT.md` §3 versions `53ee77ad → 0bb0b14d → 37b2266a → 35e90c98 → 20acd057` |
| 2 | `verify:zero-knowledge` green against the live Worker | **PASS at `20acd057`** (15/15) | not re-run since; the Worker has not been redeployed, so the recorded run still describes the deployed code |
| 3 | Live `/circle/capabilities` answers | **PASS** | recorded in `M3-report.md` |
| 4 | `verify:bundle` green with headroom | **PASS** | 175.1 KB against a 180 KB ceiling (target 177) |
| 5 | `useRoomList.ts` + M2 Room UI exist | **PASS** | `src/lib/useRoomList.ts`, M2 sheets and room |
| 6 | The circle key is not raw in IndexedDB | **PASS (`4a0421d`)** | `verify:key-at-rest` 9/9 in a real browser; `verify:circle-pairing` 17/17 against the deployed Worker |

Item 6 was the blocker. `M4-blocked.md` recorded it, and now records it cleared.

## What "not started" means, concretely

```
$ git log --oneline --all --grep='^(feat|fix)\(circle\)' | head
4a0421d fix(circle): a stolen IndexedDB dump is no longer a stolen circle   ← M3b STEP 2
```

No commits for STEPs 1–8 of M4. `src/lib/circle/` contains `api.ts`,
`pairing.ts`, `seal.ts`, `store.ts` — the M3 core — and nothing that queues,
delivers, pushes or lists devices.

## What STEP 1 will build (the step that earns the headline)

`src/lib/circle/outbox.ts` + `inbox.ts`: an IndexedDB queue keyed by
`itemId` (UUIDv7) with states `queued → sealing → uploading(k/n) → stored →
delivered → seen`, per-chunk retry with 1/2/4/8/16/30 s backoff and jitter,
triggers on `online`, `visibilitychange`, app start, timer, push, and the
service-worker `sync` tag `circle-outbox`. Inbox: `GET /pending`, decrypt, store,
**then** ACK. Target for the gate: an item sent to a closed device arrives within
**2 s** of that device opening the app, exactly once, in order.

## What this report cannot tell you

- Whether the outbox survives a real Android background kill. No code yet.
- Anything about push, because `worker/src/vapid.ts` still only has the Space
  reminder path and no `sendPush` generalisation.
- Whether the 2 s target is reachable on the Redmi's network. No measurement
  exists, and I will not invent one.

## Questions (with my recommendation)

1. **Split M4 across two sessions at STEP 4?** Recommended: yes — STEPs 1–4 make
   your headline work; 5–8 are trust, speed, multi-tab and the claim flip.
2. **Should STEP 2's "Keep these devices linked?" line appear after the first
   transfer only, or after the first *successful* file?** Recommended: the first
   successful transfer of any kind; a text that arrived is enough evidence.
3. **Push before or after the Linked devices page?** Recommended: after the page
   — a push that wakes a device into a room the person cannot manage is worse
   than no push.

## OWNER ACTIONS

Nothing blocks M4. When STEP 3 (push) is reached, these become yours:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY  --config worker/wrangler.toml
npx wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.toml
npx wrangler secret put VAPID_SUBJECT     --config worker/wrangler.toml   # mailto:you@example.com
npm run worker:deploy
```

The exact names come from `worker/src/vapid.ts`; I will re-read that file before
STEP 3 rather than trusting this list.
