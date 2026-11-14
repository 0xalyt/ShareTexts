# M1 — Solid ground

**Tag before work:** `before-M1` · **Work on:** `main` · **Date:** 2026-11-14

M1 was "make the existing product honest and reliable before adding anything".
This is what shipped, what it is proven by, and — deliberately — what is still
unproven or untouched.

---

## 1. What shipped

| # | Change | Reason it mattered |
| --- | --- | --- |
| `0467d9b` | `PROTOCOL.md` tells the truth: rooms idle-expire after 5 h, Stay Connected survives 30 idle days, and the encryption row says **encrypted in transit** with the reason (the Worker mints the room secret) | The spec is what future work copies from. Two of its numbers were wrong and one claim was unsupportable. |
| `835eb8d` | Eleven `F2x`/`F3x` run reports moved to `docs/reports/` | They sat at the repo root, burying the files a person opens. `scripts/tmp-*.mjs` were kept: three tracked verifiers import them. |
| `497419b` | The **113 floor removed** from `worker/src/metrics.ts` and `server.ts`; `verify-worker` now asserts 1 → 3 → exact 40 → 0 on reset | The landing page advertised "113 rooms made" on a service that had made far fewer, because storage was seeded and reads were clamped. An invented number is the one thing this product cannot ship. |
| `497419b` | Activity shows the real count only from 10 upward, otherwise the word **Live** (`home.live`, all nine locales that carry `home.roomsMade`) | An honest zero reads as a dead product; a real number at five reads as a quiet one. Neither is a lie. |
| `580ff28` | **Claims linter**: `docs/claims.forbidden.json` + `scripts/verify-claims.mjs` (`npm run verify:claims`) | Eight patterns with a written reason each. It found 33 real falsehoods across the guides, `llms.txt` and the app shell. |
| `580ff28` | Every "encrypted end-to-end" rewritten to **"encrypted in transit"** — about, how-it-works (including the HowTo JSON-LD search engines read), privacy, security, clipboard guide, `llms.txt` | Rooms are not end-to-end encrypted. The Worker hands out the key. |
| `580ff28` | Six unqualified absolutes ("Nothing is stored", "nothing is kept") replaced with qualified truths | Temporary Spaces hold content for a chosen duration, and the server keeps room state, IPs, sizes and times. |
| `be53dd0` | Service worker stops calling `skipWaiting()` | A new build used to activate mid-session and take over open pages, so a tab mid-transfer asked for chunks of a build it was no longer running — the "everything reloaded and my file died" failure. It now activates on the next cold start or navigation. Stale-chunk recovery is untouched. |
| `d424bbc` | `scripts/verify-chaos.mjs` (`npm run verify:chaos`) + `docs/redesign/reliability-matrix.md` | Four scenarios measured in a real browser. |
| `d424bbc` | Pressing Enter before the data channel opens now says **"Waiting for connection"** and keeps the draft | The send button was disabled, but Enter returned silently: no bubble, no reason. |
| — | `scripts/verify-icons.mjs` (`npm run verify:icons`) | Every icon reference resolves and every PNG matches its declared `sizes`; the manifest carries a maskable icon. |

## 2. What proves it

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| `npm run worker:test` | **103 passed, 0 failed** (floor assertions now honest) |
| `npm run worker:typecheck` | clean |
| `npm run smoke:local` | GREEN |
| `npm run verify:claims` | 8 rules, 43 files, **0 findings**, 1 declared exemption (a WhatsApp comparison line, printed on every run) |
| `npm run verify:icons` | 12 references resolve and match |
| `npm run verify:chaos` | **4/4 PASS** — S2, S3, S11, S12 |
| `npm run verify:bundle` | **FAIL** — see §3 |

The chaos run found its own two bugs before it found the app's:

- **S12** first reported 17/25 sends received. The chat list uses
  `content-visibility: auto`, and `innerText` omits off-screen bubbles, so the
  harness was counting only what fitted on screen and calling the rest lost.
  With `textContent`: **25/25, no duplicates, order kept.**
- **S2** first "failed" because `page.route()` does not intercept WebSocket
  upgrades — the room was real and the test was asserting against a healthy
  app. Blocked with `routeWebSocket`, the app behaves: honest message, retry,
  and no phantom pairing code a person could read out loud.

## 3. NOT VERIFIED — and the one gate that fails

**Bundle budget: FAIL.** Entry chunk `index-CWorB8yT.js` is **219.9 KB gzip**
against a 180 KB budget — **39.9 KB over**. Next largest: `QRScanner-*` 98.2 KB,
`vendor-motion-*` 47.3 KB. The budget was not raised to make the gate pass; the
honest number is the one above. Reducing it is real work (route-splitting the
chat view, replacing or deferring `motion`), not a config edit, and it needs its
own measurement after each step.

Not run at all, and therefore not claimed:

- **S1, S4–S10, S13–S15** of the fragility matrix (offline→online recovery,
  tab sleep, clock skew, storage quota, backgrounded transfers, reconnect
  storms). They need CDP lifecycle control and network priming; the matrix file
  says plainly that they are unmeasured.
- **No `verify-no-flash.mjs`.** The `skipWaiting` removal addresses the cause of
  the mid-session swap, but no harness asserts "no flash on update". The
  service-worker change was reviewed and built, not measured under an update.
- **Temporary Space file storage.** The R2 binding is commented out; Spaces are
  text and links only. The claims ruleset forbids describing them as holding
  files, but no capability flag or UI gate was added (plan STEP 3b).
- **Icon artwork.** `verify-icons` proves structure, not design. Whether the
  current mark is the right one needs the owner's source image.
- **Visual check of this run's copy edits.** The guide and shell text changed in
  eight files; they were built and linted, not read on a screen.

## 4. Steps from the plan left untouched, on purpose

- `scripts/tmp-*.mjs` deletion — three tracked verifiers import them; the plan's
  precondition ("confirm nothing references them") does not hold.
- `home.roomsMade` → "connections made" relabel — the counter now measures
  two-device connections, so the label lags the meaning by one word. Renaming
  the key touches every locale and the Activity threshold; it is a clean
  follow-up, not a truth fix (the number itself is honest now).

## 5. Questions for the owner (5)

1. **Icons:** is the current mark final, and do you have the source SVG or the
   original artwork? `verify-icons` can only check structure until then.
2. **Bundle:** 219.9 KB against a 180 KB budget — keep the budget and cut
   (route-split the chat view, defer motion), or accept a higher number as the
   documented reality of this build?
3. **Temporary Spaces:** is "text and links only" the intended state for now, or
   should file storage ship in this milestone? The R2 binding is commented out.
4. **The counter's name:** it counts two-device connections. Should the copy say
   "connections" everywhere (display and key name), or stay "rooms made"?
5. **Reliability matrix:** which of S1, S4–S10, S13–S15 matters enough to build
   harness for next — offline→online recovery, or tab sleep/resume?

## 6. Owner actions

- Decide question 2 (bundle) before the next release gate is treated as green.
- Provide the icon source if question 1 is "yes, final".
- After deploying: confirm on the live site that the landing no longer shows a
  seeded number, and that the guides no longer say "end-to-end".
