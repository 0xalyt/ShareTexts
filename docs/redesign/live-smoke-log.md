# Live smoke log (DESIGN.md §0d)

After each push: wait until https://sharetexts.online serves the new
`<meta name="sharetexts-build">`, then run
`node scripts/smoke-live.mjs --expect <marker>` and append the result here.

## 2026-10-23 — marker `8edbc79ba8fd` (P0 STEP 8, first-ever run with marker)

Command: `node scripts/smoke-live.mjs --expect 8edbc79ba8fd`

| Check | Result |
|---|---|
| https://sharetexts.online answers 200 | PASS (200) |
| build marker === 8edbc79ba8fd | PASS (got 8edbc79ba8fd) |
| two devices paired (code …395) | PASS — 10 381 ms to connected, room up in 15 006 ms |
| message A → B arrived within 15 s | PASS (12 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | **FAIL** — 1 pre-existing CSP violation (see below) |

**[smoke-live] 1 FAILURE(S)** — the failure is B1 (already filed, STEP 5), not
a regression of this push: `vercel.json`'s CSP header copy pins the stale
`sha256-dlnEh4mZ…`, so the pre-paint theme bootstrap (script body hashes to
`sha256-eMqzSGqQ…` LF-normalized) is blocked on the live site. Both browser
contexts logged the identical violation. `git diff --stat
21cbd26..HEAD -- index.html vercel.json` is empty: this push touched neither
the script nor the pin. server.ts's own two pins are correct; only the
Vercel header copy is stale. Fix slot: P-token/hygiene (re-pin + pin-parity
gate), tracked as B1.

Console warnings (3, noise by design): `signaling worker redirect:
sharetext-signaling.garv29devra.workers.dev →
sharetext-signaling.alighttt.workers.dev` — the deployed build's baked
`VITE_SIGNALING_URL` is the previous worker; the boot-probe redirect picks
the current worker (which speaks the newest protocol) and pairing/message
checks pass over it. `scripts/verify-seo.mjs` already classifies this
warning as WORKER_NOISE. Owner note (not a bug): updating the Vercel env
var `VITE_SIGNALING_URL` to the current worker would silence it and remove
the probe hop.

Conclusion: marker pipeline works end to end (push → Vercel build stamps
VERCEL_GIT_COMMIT_SHA → live meta → smoke `--expect` pins it). Live pairing
and delivery verified on the new build.

## 2026-10-23 — marker `9e0b8297c0b5` (P0 STEP 9, docs-only push)

Command: `node scripts/smoke-live.mjs --expect 9e0b8297c0b5`

| Check | Result |
|---|---|
| answers 200 | PASS |
| build marker === 9e0b8297c0b5 | PASS (live on poll 1) |
| two devices paired (code …808) | PASS — 12 679 ms to connected |
| message A → B | PASS (5 ms) |
| sender echo | PASS |
| no console errors | **FAIL — same pre-existing B1 CSP violation** (identical hash detail as the 8edbc79 run) |

[smoke-live] 1 FAILURE(S). Identical to the previous run: the only failure
is B1 (stale vercel.json pin), filed and assigned P-token/hygiene. No new
failures from this push.
