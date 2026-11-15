# M4 is blocked — prerequisites are not met

**Date:** 2026-11-15 · **Branch:** `main` · **State:** stopped before building anything

The M4 prompt's PREREQUISITE CHECK requires three things. Two are missing, so no
M4 code was written. This file says exactly what is missing, what to run, and in
what order — nothing here is a product decision.

## What the check required, and what is actually true

| Required | Truth today | Verdict |
| --- | --- | --- |
| `M3-report.md` shows the Circle Worker **deployed** and the live `/circle/capabilities` answering | `M3-report.md` §3 says **`npm run worker:deploy` has NOT been run** (no Cloudflare token on the machine). The mailbox code, `CIRCLES` binding and `v6-circle` migration exist in the repo and pass `verify:circle-worker` 30/30, but nothing is live. `https://sharetexts.online/circle/capabilities` → **404**, and no `/circle/capabilities` route exists in `worker/src/index.ts` yet. | ❌ |
| `scripts/verify-zero-knowledge.mjs` green | The file **does not exist**. That was M3 **STEP 4** — one of the steps M3's report lists as untouched (STEPs 3–6). | ❌ |
| `M2-report.md` shows `useRoomList()` and the Room UI shipped | Shipped in `4ec91dd`: `src/lib/useRoomList.ts`, `src/components/RoomRail.tsx`, `verify:desktop` 16/16, `verify:sheets` 9/9. | ✅ |

So the M4 chain ("Circle Core, deployed Worker, zero-knowledge gate green") stops
at the first link: **M3 is not finished, and the Worker is not deployed.**

## What the owner must do, in this order

### 1. Run the M3 carry-over first (it is not part of M4)

M3's own report (§4 "Untouched steps") carries these forward, and M4 depends on
them. They belong to the M3 prompt:

- **M3 STEP 3** — client pairing (`src/lib/circle/api.ts`, `store.ts`,
  `pairing.ts`, `scripts/verify-circle-pairing.mjs`).
- **M3 STEP 4** — the zero-knowledge proof and `scripts/verify-zero-knowledge.mjs`
  (the gate that M4 STEP 8's claim flip is forbidden without).
- **M3 STEP 5** — the `/?circle=dev` surface.
- **M3 STEP 6** — deploy safety.

Tell me to run "the M3 carry-over (STEPs 3–6)" and I will take them in order,
each with its own gate and push, exactly as M3's BUDGET RULE says.

### 2. Deploy the Worker, then verify it live

From the repo root, with a Cloudflare token in the environment:

```bash
CLOUDFLARE_API_TOKEN=... npm run worker:deploy
```

This is the step that activates the `CIRCLES` binding and the `v6-circle`
migration. Until it runs, every `/circle/*` URL 404s in production and M4 STEP 1
("mailbox delivery") cannot be tested end to end.

Then confirm the two live facts the M4 prerequisite asks for:

```bash
curl -s https://sharetexts.online/circle/capabilities
node scripts/verify-worker-live.mjs
```

`/circle/capabilities` does not exist yet either — it is written by **M3 STEP 6**
(or, failing that, as the first task of M4 STEP 1). Its job is to answer honestly
with the limits the UI must show in M4 STEP 5: item size, waiting time (7 days),
`push: true|false` depending on the VAPID secrets, and the heavy-day budget flag.

### 3. VAPID secrets (needed for M4 STEP 3, not for the deploy itself)

`worker/src/vapid.ts` reads these names — set them before any push work is
testable:

```bash
cd worker && npx wrangler secret put VAPID_PUBLIC_KEY    --config wrangler.toml
cd worker && npx wrangler secret put VAPID_PRIVATE_KEY   --config wrangler.toml
cd worker && npx wrangler secret put VAPID_SUBJECT       --config wrangler.toml
```

With them missing the Worker answers `capabilities.push = false`, and M4 STEP 3
must hide its call to action rather than pretend.

## What is ready for M4 when it unblocks

- `src/lib/circle/seal.ts`, `src/lib/circle/keys.ts` (M3 STEP 1) — the crypto M4
  STEP 1 seals with.
- `worker/src/circle.ts`, `worker/src/limits.ts`, `verify:circle-worker` 30/30
  (M3 STEP 2) — the mailbox M4 STEP 1 uploads to, including the exact limits
  (`chunkBytes`, `chunksPerItem`, `itemTtlMs`, `itemsPerCircle`) that M4 STEP 5
  must show a person.
- `useRoomList()` + `RoomRail` (M2 STEP 5) — the hook M4 STEP 4 swaps the
  implementation of.
- `OverlaySheet` (M2 STEP 4) — the sheet the emoji comparison and push
  explanations should use.

## What I did this turn

Nothing but this file. No source, no gates, no dependencies touched — per the
prompt: "STOP. Do not build anything."
