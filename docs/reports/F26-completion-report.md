# F26 Completion Report — Production Parity & Temporary Spaces Recovery

**Date:** 2026-10-18 · **Branch:** `main` · **Deployed:** yes (Worker) · **R2:** blocked (account-level, see §3)
**Final status:** **Partially complete** — the Worker deployment objective is fully done and
production-verified; the R2 objective is blocked by an external Cloudflare account limitation
(R2 not enabled), with the code path verified end-to-end up to the honest 503 degradation.

---

## A. Deployment — DONE

- **Worker:** `sharetext-signaling` on `https://sharetext-signaling.alighttt.workers.dev`
  (the OAuth-authenticated Wrangler session's account — the repository's configured target;
  confirmed from `worker/wrangler.toml` + the authenticated `wrangler` session; account
  identifiers deliberately omitted from this report).
- **Previous deployed build:** version `5a401c3e`, created **2026-09-25T07:17:16Z** — predating
  every Temporary Spaces route (F14 landed 2026-10-01, F21 space codes 2026-10-07). Every
  `/space*` request fell through to the generic index JSON; the `/api/event` whitelist was the
  2026-09-21-era one that rejected `product.space_created`. This was the confirmed root cause of
  the F24 `verify-space-ui` failure.
- **New deployed version:** `4ca12417-e6f2-4d75-a698-8e2433edb87f`, deployed **2026-10-18** via
  `npm run worker:deploy` (= `wrangler deploy --config worker/wrangler.toml`). Deploy exit 0.
- **Deployed binding set:** ROOMS / REGISTRY / METRICS / STATS / LOBBY / SPACES (all Durable
  Objects; `Space` is the v5 SQLite class). No `SPACE_BUCKET` binding deployed (see §3).
- **Migration sequence:** v1 → v2-metrics → v3-stats → v4-lobby → **v5-space** (additive
  `new_sqlite_classes = ["Space"]`). No destructive migration; no compatibility-date change
  (2025-07-01 unchanged). Legacy Room/Registry/Metrics/Stats/Lobby data untouched.
- **Rollback:** `npx wrangler rollback --config worker/wrangler.toml` (interactive; the previous
  version `5a401c3e`-era deployment is retained by Cloudflare's deployment history).

### Source defects fixed in the current tree (carried into this deployment)

All four F26 audit findings were confirmed fixed in source before deploying (re-verified against
HEAD `cfd18df`, which post-dates the earlier report; the two commits after the F26 audit touched
frontend files only):

1. **`worker/src/index.ts`** — `/space/<id>` router regex was end-anchored (`…([0-9a-f-]{36})$`),
   so every sub-route (create/join/items/close/…) 404'd at the router layer. Fixed to
   `^/space/([0-9a-f-]{36})(/.*)?$/i` (optional tail).
2. **`worker/src/index.ts`** — `POST /space/join-code` forwarded the already-consumed request
   body to the Durable Object (`new Request(url, request)` after `request.json()`), producing a
   500. Now rebuilds the internal request from the parsed code. `/close` + `/heartbeat` bodies
   are also drained at the router (fixes a wrangler-dev-only post-response stream error).
3. **`worker/src/space.ts`** — `urlSpaceId` was read only from `?space=` (present only on
   `/space-ws`), so REST creates registered codes with a `null` spaceId (Registry 400 →
   misreported as "code already in use" 409) and minted a random spaceId addressing a *different*
   DO instance. Now falls back to the path id (`url.pathname.match(/^\/space\/([0-9a-f-]{36})/i)`).
4. **`src/lib/space/api.ts`** — wrong-shape guards: `checkCode` / `createSpace` / `joinSpace` /
   `joinByCode` now treat a 200 whose body lacks the contract fields as a **502 server failure**
   instead of parsing `undefined` (the F24 failure mode: fallback JSON → `available` undefined →
   UI said "taken" / navigated to `/space/undefined`).

Regression coverage: the DO unit suite (103 checks) exercises the DO layer; the F26 journey probe
(17 checks) drives the **router** layer end-to-end (create → checks → join-by-code → perms →
text → file-init → close → code retirement), which is precisely the layer the end-anchored-regex
bug hid from. The production contract gate (9 checks) pins the deployed route shapes so a future
stale deployment cannot pass silently.

## B. R2 — BLOCKED (external account limitation)

- **Intended bucket:** `sharetext-spaces`, binding `SPACE_BUCKET` (currently commented out in
  `worker/wrangler.toml` — correct: deploying a binding to a nonexistent bucket would make the
  entire Worker deploy fail).
- **Blocker:** the Cloudflare account has **R2 disabled at the account level**.
  Both `wrangler r2 bucket list` and `wrangler r2 bucket create sharetext-spaces` fail with
  **API code 10042 — "Please enable R2 through the Cloudflare Dashboard."** Enabling R2 requires
  the account owner to accept R2's terms/pricing in the Cloudflare dashboard (an account/billing
  action outside what any API token or agent can perform). No workaround was attempted, per the
  mission's non-negotiable rules (no substitute storage architecture, no public bucket).
- **Production behavior without R2 (verified live):** the Space DO degrades honestly. File
  `init` succeeds (200, `mode:"direct"`), then the direct `PUT` answers **503 `{"error":"Storage
  is not configured."}`** — confirmed against the real production worker in the journey probe
  (check 13). Text-only spaces work fully in production today.
- **To finish R2 once the account enables it:** uncomment the `[[r2_buckets]]` block in
  `worker/wrangler.toml`, run `npx wrangler r2 bucket create sharetext-spaces` (or accept the
  dashboard-created bucket), redeploy with `npm run worker:deploy`, then re-run the journey probe
  — its file leg automatically switches from the 503 branch to the full
  init → PUT → status → download-bytes-match branch (the probe already contains both paths).
- **Security posture (unchanged, verified in source):** per-space object keys
  (`spaces/<spaceId>/<itemId>/object`), per-request download authorization re-checked against
  live space expiry (a download can never outlive the space), `content-disposition: attachment`
  + `nosniff` + `private, no-store` on every download, uploader-scoped upload records, abort on
  incomplete multipart, and alarm-driven cleanup that aborts in-flight multipart uploads and
  batch-deletes every object when a space expires or is closed. No public bucket, no public
  object URLs, least-privilege binding.

## C. Bugs fixed (this task)

| # | Root cause | File(s) | Regression test |
|---|---|---|---|
| 1–4 | See §A (router anchor, consumed body, DO identity, wrong-shape guards) — all fixed in the audited tree and carried into the deployment | `worker/src/index.ts`, `worker/src/space.ts`, `src/lib/space/api.ts` | journey probe 17/17, prod gate 9/9, DO unit 103/103 |
| 5 | **Raw hex `#1b1b20` in `NearbyDetectOverlay.tsx`** (5 occurrences: sheet dark bg + 4 focus-ring offsets) failed the visual-system suite's "no raw hex in TSX" check — the in-flight Nearby feature used an off-token near-black instead of the `surface-dark` token (`#1a1a1e`, the same surface the sibling `NearbyDevices.tsx` already tokens) | `src/components/NearbyDetectOverlay.tsx` → `dark:bg-surface-dark/88`, `dark:ring-offset-surface-dark` | `verify-visual-system.mjs` now **8/8** (was 7/8); `tsc` exit 0; production build exit 0 |

## D. Verification — commands, real counts, exit codes

| Suite | Command | Result | Exit |
|---|---|---|---|
| Frontend typecheck | `npx tsc --noEmit` | clean | 0 |
| Production build | `npm run build` | success (dist + prerendered shells) | 0 |
| Worker typecheck | `npm run worker:typecheck` | clean | 0 |
| Worker DO unit suite | `node scripts/verify-worker.mjs` | **103/103** | 0 |
| Wire protocol vs local worker (workerd) | `WORKER_URL=http://localhost:8787 node scripts/verify-worker-live.mjs` | **18/18** | 0 |
| Space-code suite (Node dev backend) | `node scripts/verify-space-code.mjs` | **27/27** | 0 |
| Space UI browser E2E (two devices) | `URL=http://localhost:3010 node scripts/verify-space-ui.mjs` | **10/10** | 0 |
| Space experience E2E | `URL=http://localhost:3010 node scripts/verify-space-experience.mjs` | **33/33** | 0 |
| Visual system | `node scripts/verify-visual-system.mjs` | **8/8** (after bug #5 fix) | 0 |
| F26 journey vs **local worker** | `BASE=http://localhost:8787 node scripts/probe-space-journey-f26.mjs` | **17/17** | 0 |
| Prod contract vs **local source** | `WORKER_URL=http://localhost:8787 node scripts/verify-worker-prod.mjs` | **9/9** | 0 |
| **Prod contract vs PRODUCTION** | `node scripts/verify-worker-prod.mjs` | **9/9** (was 4/9 pre-deploy) | 0 |
| **F26 journey vs PRODUCTION** (real deployed worker; creates + closes one disposable space, self-cleaning) | `BASE=https://sharetext-signaling.alighttt.workers.dev node scripts/probe-space-journey-f26.mjs` | **17/17** | 0 |

Production journey detail (all 17): create → 200 {spaceId, token, manageKey}; fresh code
available; taken code → `available:false` + suggestion; invalid shape → `reason:"invalid"`;
join-by-code (lowercased messy input) → 200 snapshot + token; unknown code → 404 no-oracle;
member close without manage key → 403; wrong manage key → 401; joiner text item → 200 and
creator lists it; file init → 200 `mode:"direct"`; **file PUT → 503 "Storage is not configured"
(the honest R2-absent degradation — verified, not mocked)**; creator close → 200; code retired
→ 404; availability restored; boolean contract shape (never the stale-worker fallback).

Environment note: `wrangler dev` on this Windows host intermittently drops loopback connections
after some requests (the F26 report documented this; it can also crash the dev server). This
affected two early local-journey runs (connection-refused / status=0 on the close route) and a
`PORT=0` shell-environment quirk when starting the Node dev server. Every suite above passed on
a fresh dev process; **production is unaffected** — the production runs are the authoritative
ones and passed first time.

## E. GitHub

- Branch `main`; the deployment-era changes (this pass + the NearbyOverlay token fix + report
  update) are committed and pushed to `origin/main` (`github.com/Alightttt/ShareTexts`); remote
  state verified by `git fetch` + log comparison after push (see final answer for the exact hash).

## F. Remaining blockers

1. **R2 is not enabled on the Cloudflare account** (API code 10042) — the only blocker for
   production file-in-space support. Action required by the account owner: enable R2 in the
   Cloudflare dashboard, then the three-step finish in §B completes it. This is an account/billing
   limitation, not a code defect.
2. Nothing else. No code defects remain open; every applicable suite is green.

## G. Final status

**Partially complete** (naming it truthfully per the mission's definitions):

- ✅ Objective 1 — **Deploy the corrected Worker:** complete. The stale 2026-09-25 build is
  replaced by version `4ca12417`; every Temporary Spaces route, the human-friendly code flow,
  membership, authorization, lifecycle (expiry alarms, code retirement, cleanup) and the legacy
  endpoints (`/health`, `/ws`, `/lookup`, `/resolve-short`, `/api/push`, `/stats`, `/metrics`,
  telemetry whitelist incl. `product.space_created`) are verified **against production** —
  gate 9/9, journey 17/17.
- ⛔ Objective 2 — **R2 file storage:** blocked by the account-level R2-disabled limitation
  (§B/§F1). The code path is production-verified up to the honest 503; the multipart/R2 legs
  remain covered by the DO unit mocks only and cannot be claimed as production-verified until
  R2 is enabled and the binding is deployed. **No claim of R2 production verification is made.**
