# M2 — BLOCKED

**Checked at `8e70030` (M1 pushed), 2026-11-14.** The M2 prompt requires the
previous milestone's report to show STEPs 0–3 shipped before anything is built.
It does not. Nothing was built for M2; no files outside this one were touched.

## What the prerequisite check found

| Required by the M2 prompt | State in the repo | Evidence |
| --- | --- | --- |
| `M1-report.md` exists | **yes** | present at the repo root, pushed in `8e70030` |
| M1 STEP 1 — `src/lib/itemState.ts`, the single item-state vocabulary (`queued → sending → sent → delivered → seen`, plus `failed/paused/expired`) | **MISSING** | `ls src/lib/itemState.ts` → no such file. No such module anywhere in `src/lib`. |
| M1 STEP 2 — `scripts/verify-no-flash.mjs`, the no-flash gate | **MISSING** | `ls scripts/verify-no-flash.mjs` → no such file. `M1-report.md` §3 says so in its own words: "No `verify-no-flash.mjs` … the service-worker change was reviewed and built, not measured under an update." |
| M1 STEP 3 — `scripts/verify-claims.mjs` | **yes** | present, `npm run verify:claims` → 8 rules, 43 files, 0 findings, 1 declared exemption |
| M1 — the four extra skills in `.claude/skills` | **yes** | 26 skills present, including all thirteen the M2 prompt names (`choreograph`, `emil-design-eng`, `apple-design`, `animate`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `remove-animations`, `gestures`, `mobile-native`, `break-ui`, `animation-vocabulary`) |
| `M1-report.md` must not show a red gate | **it does** | §3: `npm run verify:bundle` FAILS — entry chunk `index-CWorB8yT.js` is **219.9 KB gzip against a 180 KB budget**, 39.9 KB over. The budget was deliberately not raised. |
| `M1-report.md` must not list untouched steps this prompt depends on | **it does** | §3 lists S1 and S4–S15 of the fragility matrix as unmeasured; §4 lists the untouched M1 items. |
| `SHARETEXTS-PROJECT-STATE.md` (M2's report is required to update its §4–8) | **MISSING** | `ls SHARETEXTS-PROJECT-STATE.md` → no such file. An M2 report cannot update sections that do not exist. |

## Why this matters for M2 specifically

M2's four main steps are built on exactly the pieces that are missing:

- **STEP 1 (feed) and STEP 4 (sheets)** both print an item state word. "Sent",
  "Delivered", "Waiting", "Failed — Retry" must come from one vocabulary, or the
  transcript and the sheets will disagree with each other. `ChatView` and
  `MessageCard` currently derive those words inline.
- **STEP 5 (desktop)** has "landing → room must not flash" as its own gate and
  names `node scripts/verify-no-flash.mjs`, which does not exist — so that step
  could not be verified even if it were built.
- The bundle gate is red, so any M2 work that adds a typing indicator, a
  reaction strip and a master-detail rail lands on a build already 39.9 KB over
  its ceiling, with no accepted number to compare against.

## What the owner must do (in order)

1. **Run the M1 carry-over** — the M1 prompt again, or a short carry-over prompt,
   covering only the three unfinished M1 pieces:
   - `src/lib/itemState.ts` + every call site switched to it;
   - `scripts/verify-no-flash.mjs` + a green run;
   - the M1 STEP 1 remaining scenarios (S1, S4–S10, S13–S15) or an explicit
     decision that they stay unmeasured.
2. **Decide the bundle question** from `M1-report.md` §5 question 2: keep
   180 KB and cut (route-split the chat view, defer `motion`), or accept a
   documented number for this build. Either way the gate needs to be green or
   knowingly re-based before M2 adds weight.
3. **Create `SHARETEXTS-PROJECT-STATE.md`** with sections 1–8 (the M2 report must
   update §4–8). If a version exists outside the repo, commit it; otherwise ask
   for it to be generated.
4. Re-paste the M2 prompt once 1–3 are done. Nothing in this prompt needs to be
   rewritten — only its prerequisites.

## What was NOT done here, deliberately

No branch, no code, no gate run, no tag `before-M2`. The prompt's STOP rule is
unambiguous: "Do not build anything." Tagging a milestone that has not started
would be a false marker, and the tag is cheap to create when work begins.
