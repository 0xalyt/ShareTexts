# F26 Completion Report — Production Parity & Temporary Spaces Recovery

**Date:** 2026-10-17 · **Branch:** `main` · **HEAD:** `756588061ac9f4a77e376721b5aaa4615f7491d2` (F25 defect pass, synced with `origin/main`, 0 unpushed commits)
**Deployment status:** NOT deployed — prepared and awaiting explicit authorization.

---

## 1. Repository state

- HEAD `7565880` on `main`, in sync with origin (the reported frontend commit `0d80a65` is the parent of HEAD; both verified present in history).
- Working tree: 30 uncommitted files preserved untouched (F25 UI work, research doc, shot artifacts). This pass added 3 source edits + 2 new scripts (listed in §4).
- Worker config: [worker/wrangler.toml](worker/wrangler.toml) — `sharetext-signaling`, entry `src/index.ts`, compat date `2025-07-01`, 6 DO bindings (Room/Registry/Metrics/Stats/Lobby/Space), migrations v1–v5 (v5 = `new_sqlite_classes: ["Space"]`). The `SPACE_BUCKET` R2 binding ships **commented out**; the Space DO degrades honestly (503 "Storage is not configured") so text-only spaces work without it.
- Deploy command of record: `npm run worker:deploy` → `wrangler deploy --config worker/wrangler.toml` ([docs/CF_MIGRATION.md](docs/CF_MIGRATION.md) §6). Wrangler 4.120.1 authenticated (OAuth, account `b46c1660…`).

## 2. Source-versus-production route comparison

Production = `https://sharetext-signaling.alighttt.workers.dev`. All probes harmless (GETs + one anonymous telemetry counter); no tokens, no spaces created, no uploads.

| Route | Expected (current source) | Observed (production) | Verdict |
|---|---|---|---|
| `GET /health` | 200 `{ok:true,service}` | 200 `{ok:true,"service":"sharetext-signaling-cf"}` | ✅ present |
| `GET /space-code/check` | 200 `{available:boolean,suggestion?}` | **200 generic index JSON** (`{name,endpoints:[…]}`) | ❌ **absent — falls through** |
| `POST /space/join-code` | 404 no-oracle for unknown code | **200 generic index JSON** | ❌ **absent** |
| `GET /space/<uuid>/…` | 401/404 via Space DO | **200 generic index JSON** | ❌ **absent** |
| `GET /space-ws` | WebSocket upgrade / 400 | **200 generic index JSON** | ❌ **absent** |
| `POST /api/event` `product.method_nearby` | 204 (whitelisted since 2026-09-21) | 204 | ✅ present |
| `POST /api/event` `product.space_created` | 204 (whitelist grew in `cf735ba`, 2026-10-07) | **400 Bad request** | ❌ **older whitelist** |
| `POST /api/event` `product.bogus` | 400 | 400 | ✅ matches |
| `POST /lookup` | 404 unknown room | 404 `{"error":"Invalid or expired code"}` | ✅ present |
| `POST /resolve-short` | 404 invalid | 404 `{"error":"Invalid link"}` | ✅ present |
| `POST /api/push` | 400 bad body | 400 | ✅ present |
| `GET /ws` (no room) | 400 | 400 `{"error":"invalid room"}` | ✅ present |
| `GET /stats` | 200 `{…,roomsCreated}` | 200, `roomsCreated: 485` | ✅ present |
| `GET /metrics` | 200 (no token configured) | 200 | ✅ present |

## 3. Confirmed root cause

**Production runs a Worker build from 2026-09-25 that predates every Temporary Spaces route.** Four independent lines of evidence:

1. `wrangler deployments status` → latest deployment created **2026-09-25T07:17:16Z** (version `5a401c3e`).
2. F14 (Spaces) committed **2026-10-01** (`9a20980`); F21 (space codes) **2026-10-07** (`cf735ba`) — both after the last deploy.
3. Every `/space*` route falls through to the generic index (deployed build has no such routes); old routes answer correctly.
4. The `/api/event` whitelist on production exactly matches the 2026-09-21-era source (`7827199` — space events absent) and rejects `product.space_created`, which only the 2026-10-07 build accepts.

This fully explains the F24 `verify-space-ui` failure. **Additionally, this pass found three genuine source defects** that a deploy alone would have carried into production (see §4) — so the F24 finding was both deployment drift *and* latent source bugs the stale build had been masking.

## 4. Source changes (this pass)

1. **[worker/src/index.ts](worker/src/index.ts)** — `/space/<id>` router regex was end-anchored (`…([0-9a-f-]{36})$`), so **every sub-route (create/join/items/close…) 404'd at the router**; the DO-only unit suites never exercised this layer. Fixed to allow an optional tail. (Present since F14 — production never ran it, so it went unnoticed.)
2. **[worker/src/index.ts](worker/src/index.ts)** — `POST /space/join-code` forwarded the already-consumed request body to the DO (`new Request(url, request)` after `request.json()`), producing a 500. Now rebuilds the internal request with the parsed code. Also: `/close`+`/heartbeat` bodies are drained at the router (fixes a wrangler-dev-only post-response stream error; production discards unread bodies by design).
3. **[worker/src/space.ts](worker/src/space.ts)** — `urlSpaceId` was read only from `?space=` (present only on `/space-ws`), so REST creates registered codes with a `null` spaceId (Registry 400 → misreported as "code already in use" 409) and minted a random spaceId addressing a *different* DO instance. Now falls back to the path id.
4. **[src/lib/space/api.ts](src/lib/space/api.ts)** — wrong-shape guards: `checkCode` / `createSpace` / `joinSpace` / `joinByCode` now treat a 200 whose body lacks the contract fields as a **502 server failure** instead of parsing `undefined` (the F24 failure mode: fallback JSON → `available` undefined → UI said "taken"/navigated to `/space/undefined`). No fallback authorization, no rate-limit changes; the SpaceView already maps a thrown check to "idle — let create() decide", so a stale worker now reads as a server hiccup, never as a code collision.
5. **[worker/src/index.ts](worker/src/index.ts)** — generic index `endpoints` list now includes the real route set (debugging aid; this audit used it to date the deployed build).

New scripts: [scripts/probe-space-journey-f26.mjs](scripts/probe-space-journey-f26.mjs) (full journey vs local worker) and [scripts/verify-worker-prod.mjs](scripts/verify-worker-prod.mjs) (§6 contract gate).

## 5. Test commands, real exit codes, remaining failures

| Suite | Command | Result |
|---|---|---|
| Frontend typecheck | `npx tsc --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0 |
| Worker typecheck | `npm run worker:typecheck` | exit 0 |
| Worker DO unit suite | `node scripts/verify-worker.mjs` | **103/103**, exit 0 |
| Wire protocol vs local worker (workerd) | `WORKER_URL=http://localhost:8787 node scripts/verify-worker-live.mjs` | **18/18**, exit 0 |
| Space-code suite (Node dev backend) | `node scripts/verify-space-code.mjs` | **27/27**, exit 0 |
| Space UI browser E2E (two devices) | `URL=http://localhost:3010 node scripts/verify-space-ui.mjs` | **10/10**, exit 0 |
| **F26 journey vs local worker** (create → checks → join-by-code → perms → text → file init/upload → close → retirement; disposable data, self-cleaning) | `node scripts/probe-space-journey-f26.mjs` | **17/17**, exit 0 |
| Prod contract vs **current source** | `WORKER_URL=http://localhost:8787 node scripts/verify-worker-prod.mjs` | **9/9**, exit 0 |
| Prod contract vs **production** | `node scripts/verify-worker-prod.mjs` | **4/9, exit 1** — expected: 5 STALE-DEPLOYMENT failures (§6) |

No baseline failures discovered. File upload against the local worker exercised the documented R2-absent degradation (init 200 → direct PUT 503 "Storage is not configured"), not a regression — with the R2 binding commented out in wrangler.toml the journey verifies init/status/close paths; multipart R2 paths remain covered only by `verify-worker.mjs` unit mocks.

Environment notes: `wrangler dev` on this Windows host is flaky (its loopback proxy drops connections after some requests — "Network connection lost"/"Can't read from request stream"); all worker-local suites pass on a fresh dev process, and the journey probe uses body-less keep-alive-off requests to be robust against it. This affects only local dev, not production.

## 6. Deployment prerequisites and risks

- **Prerequisites:** none new — the existing wrangler.toml migrations are already declared (`v5-space` adds the `Space` DO class; SQLite-backed, additive). No compatibility-date change (2025-07-01 unchanged). No schema destructive to Room/Registry/Metrics/Stats/Lobby data. Wrangler is already authenticated on this machine.
- **R2 (optional, separate decision):** `SPACE_BUCKET` ships commented out; deploying without it means production spaces are text-only (files → honest 503). Enabling requires creating the `sharetext-spaces` bucket + uncommenting the binding — a production resource change, **not** included in the prepared command.
- **Frontend/Worker coupling:** none required. The deployed frontend works with the new worker immediately (its `checkCode` expects the boolean contract, which the new worker serves). This pass's frontend guards (502 on wrong shape) additionally protect any client against a future stale worker. No Vercel redeploy is required for the parity fix.
- **Risks:** low — additive routes on a worker whose existing routes are untouched; rollback is `npx wrangler rollback` (previous version `5a401c3e` retained by Cloudflare). One accepted-behavior note: `/space-code/check` + `/space/join-code` share the 30/60s per-IP `space-code` rate scope (unchanged from source; not weakened).
- **Verification after deploy:** re-run `node scripts/verify-worker-prod.mjs` → must be 9/9 (it currently fails 4/9 with explicit stale diagnostics, so it cannot false-pass).

## 7. Deployment command and verification plan — PREPARED, NOT EXECUTED

```bash
# 1. (optional sanity) local gate, all green per §5
npm run worker:typecheck && node scripts/verify-worker.mjs

# 2. THE PRODUCTION-CHANGING ACTION — requires explicit authorization
npm run worker:deploy          # = wrangler deploy --config worker/wrangler.toml

# 3. Verification (read-only)
node scripts/verify-worker-prod.mjs      # must print 9/9, exit 0
# 4. Optional end-to-end smoke (creates + closes one disposable space): 
#    node scripts/probe-space-journey-f26.mjs  (BASE defaults to local; set BASE=https://sharetext-signaling.alighttt.workers.dev)

# Rollback if needed:
npx wrangler rollback --config worker/wrangler.toml   # interactive: pick version 5a401c3e-era
```

## 8. Is production deployment still required?

**Yes.** The audit confirms production cannot serve any Temporary Spaces route today; source fixes cannot reach users without a Worker deploy. The frontend's F24 symptom resolves the moment the worker is current.

## 9. Precise approval needed

A single explicit authorization to run `npm run worker:deploy` (Worker-only, no R2 bucket creation, no Vercel changes). If file-in-space support should also go live, a second approval to create the `sharetext-spaces` R2 bucket and uncomment the `SPACE_BUCKET` binding in [worker/wrangler.toml](worker/wrangler.toml) before the same deploy.
