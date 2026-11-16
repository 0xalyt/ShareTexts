# M1b — reliability matrix, the link failure, Space files, icon

**Date:** 2026-11-16 · **Branch:** `main` · **Tag:** `before-M1b` · Live marker `0ebc47033054`

## 0. The owner's bug report

**Owner bug report not provided.** The paste block was still placeholder text,
so STEP 2 used the case table in the prompt instead of a device report.

## 1. What shipped

| SHA | Step | What |
| --- | --- | --- |
| `db67a7c` | 1 | `scripts/verify-chaos-2.mjs` — the eleven unmeasured scenarios, run; `docs/redesign/reliability-matrix.md` regenerated with all fifteen |
| `bff3a06` | 2 | `resolveShortCode` says *why* it failed; one retry on a transient failure; "couldn't reach the room" instead of "this link isn't active"; the notice's single action is now the six-digit route (was "Close"); five `diag()` stages; `scripts/verify-link-join.mjs` |
| `4811acf` | 3 | `FEATURE_SPACE_FILES = false` owns the file button, paste, drop and overlay; one honest line "Text and links for now." in all nine full dictionaries; Worker `GET /space/capabilities` → `{ files: Boolean(env.SPACE_BUCKET) }` |
| `0ebc470` | — | The entry chunk was **already** 1.3 KB over budget at `6991c46` (181.3 KB against 180 KB). Code-split five room-only surfaces; 179.8 KB, gate green |

## 2. Proof

**Matrix — all fifteen accounted for** (`node scripts/verify-chaos-2.mjs --write`):

| | |
| --- | --- |
| PASS, measured this run | **S1** (first signal 484 ms, code in hand, no hang), **S4** (composer refuses while the peer is gone, honest waiting, delivered once on return), **S5** (frozen tab, same promise), **S9** (offline 20 s → offline copy, disabled send, delivered after), **S13** (backgrounded 2 real minutes → caught up in **21 ms**), **S15** (clock +10 min → joined) |
| PASS, measured earlier | S2, S3, S11, S12 (`verify-chaos.mjs`, 2026-11-14, `be53dd0`) |
| NOT VERIFIED | S6, S7, S8, S10, S14 — reasons in the matrix |

**Link gate — `node scripts/verify-link-join.mjs`: 8/8**

```
PASS a /s/ link opens the room on the other device — /s/1830521e
PASS a QR payload (link + ?c=) still joins — /s/51b55ee9?c=428913
PASS a link opened by a device 2 min ahead still joins or says why — joined
PASS inside WhatsApp the link joins, or explains itself with one action — joined
PASS a dead link says the room is gone
PASS the dead link's one action is the six-digit route, and it opens it
PASS a link we could not resolve says so, and offers a retry — kind=unreachable, action="Try again"
PASS it never blames the room for a connection failure
NOT VERIFIED webkit / firefox (not installed), stale SW, stale index.html, idle TTL, full room
```

The two fixed behaviours fail on the old code by construction: the old build
answered every resolve failure with "That link isn't active anymore" and offered
"Close" on a dead link.

**Other gates:** `npm run lint` clean · `npm run build` 0 · `npm run verify:bundle`
**PASS** (179.8 KB, was 181.3 KB) · `node scripts/verify-claims.mjs` clean (8 rules,
43 files) · `npm run verify:entrances` OK · `npm run verify:form` 20/20 ·
`npm run smoke:local` **GREEN** · live marker `0ebc47033054` · `node scripts/smoke-live.mjs`
**GREEN on the second run** (first run failed: `ERR_NAME_NOT_RESOLVED` for the
signaling Worker and `ERR_NETWORK_CHANGED` — local DNS/network churn, the same
transport that paired successfully 48 s earlier; the rerun delivered a message in
4 ms).

## 3. NOT VERIFIED (strict)

- **S6, S7, S8** — a 20 MB file held across a reload. The resume path exists
  (`src/lib/webrtc.ts`), nothing exercised it. Not run: a stable two-peer session
  for two minutes plus a mid-transfer reload did not fit the budget.
- **S10** — a new service worker mid-session. The dev server registers no SW;
  this needs two production builds and a swapped revision.
- **S14** — Stay Connected after three hours. No controllable server clock in the
  running stack.
- **STEP 2 stale-SW, stale cached `index.html`, idle-TTL expiry, full room.** Not
  produced; the dead-link branch is exercised via `/s/deadbeef`.
- **WebKit and Firefox.** Not installed for Playwright on this machine, so the
  cross-engine claim is untested. `NOT VERIFIED` in the gate output.
- **STEP 3's DOM half.** The file button is hidden by the flag and the copy line
  renders, but I did not write the Playwright assertion: the Space entry flow has
  no test ids and reusing its selectors needed a session I did not have. The
  "present when a test Worker binds a bucket" half needs an R2 binding — the
  owner's account has R2 off (error 10042).
- **STEP 4 copy review** — screenshots captured, **not looked at**. Ten images in
  `docs/redesign/shots/m1b/` (home, guides index, temporary-spaces,
  compare-whatsapp, how-it-works × 390 and 1440). They are a record, not a review.
  That directory is gitignored (`docs/redesign/shots`), so the captures exist on
  the owner's machine only; say the word and I will force-add them.
- **The icon.** `verify-icons` passes on structure; nothing here proves the
  installed image is the owner's file.
- **Skills.** `break-ui`, `mobile-native` and `emil-design-eng` were **not read**
  this turn; no skill was applied, so none is claimed.

## 4. Untouched steps

- **STEP 4's icon regeneration** — blocked on the source image (see questions).
- **STEP 4's copy review** — captured, unread.
- **STEP 2's stale-service-worker instrumentation** — the link diag stages exist;
  nothing was added for the "old shell serving a new URL" case because it could
  not be reproduced.

## 5. Files changed

`src/lib/socket.ts` · `src/lib/SessionContext.tsx` · `src/views/SingleScreenApp.tsx`
· `src/views/SpaceView.tsx` · `src/lib/space/capabilities.ts` (new) ·
`src/lib/messages/{en,es,fr,de,pt-BR,hi,ja,zh-Hans,ar}.ts` · `worker/src/index.ts` ·
`scripts/verify-chaos-2.mjs` (new) · `scripts/verify-link-join.mjs` (new) ·
`package.json` · `docs/redesign/reliability-matrix.md` · `docs/redesign/shots/m1b/*`

## 6. Questions (with my recommendation)

1. **Which exact image file is the correct app icon?** Path or filename, please.
   My recommendation: put it in `public/brand/` and tell me the name; I regenerate
   every size from that one source and record its SHA-256 in
   `public/icons.meta.json`.
2. **Is the Space file promise (STEP 3) allowed to come back this quarter?** If R2
   stays off, my recommendation is to leave `FEATURE_SPACE_FILES = false` and keep
   the honest line rather than turn uploads on without storage behind them.
3. **Should the link/QR gate run in the deploy path?** It creates real rooms on
   the dev server only. My recommendation: yes, keep it local-only, not in CI,
   because it depends on a dev signaling server.
4. **Do you want the three-hour Stay Connected case (S14) proven with a real
   clock shift in the Worker?** That is a small test-clock hook. My recommendation:
   yes, but as its own small step, not smuggled into M1b.
5. **WebKit/Firefox:** may I install those Playwright browsers? My recommendation:
   yes — the owner's report is about a phone browser we have not tested.

## 7. OWNER ACTIONS

1. **Send the icon file** (question 1). Until then the installed icon on any phone
   stays as whatever it cached.
2. **Reinstall the PWA on the phone** once the icon ships: an installed web app
   keeps its old icon until it is removed from the home screen and installed again.
3. **Paste the bug report block** from the M1b prompt if the link/QR failure is
   still happening — device, direction, what the screen said, which app's browser.
   The five `link.*` diag stages now record the path, so a copy of Diagnostics →
   "Copy report" after a failure names the stage.
4. **Run `CLOUDFLARE_API_TOKEN=... npm run worker:deploy`** when convenient: the
   new `/space/capabilities` route and the `CIRCLES` binding ship with the Worker,
   not with Vercel.
