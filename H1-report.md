# H1 — Restore the desktop rail

Status: **fix shipped, gates extended, one flake removed.** Pushed to `main`.

- Tag before the work: `before-H1`
- Regression commit: `0ebc470` (M5 bundle trim)
- Fix: static imports for `RoomRail` + `PresenceDock` in `src/views/SingleScreenApp.tsx`
- New gate: `scripts/verify-room-paint.mjs` (`npm run verify:room-paint`), wired into
  `npm run verify:browser` and `npm run verify:layout`
- Hook: `.githooks/pre-push` now runs `verify:layout` when `src/` or `public/` changes

---

## STEP 0 — Reproduce

`before-H1` tagged. Against the dev server on 3110 (the long-running one; the
shell exports `PORT=0`, so every gate ran with `BASE_URL=http://localhost:3110`):

```
$ BASE_URL=http://localhost:3110 node scripts/verify-desktop.mjs
FAIL 1024px — the rail is on screen — top y=-1
FAIL 1024px — the rail lists the room — 0 room(s)
FAIL 1024px — one way out of the room
...
13/16 checks passed
```

1440 and 2560 passed 16/16 on the same run — which is the interesting part: the
bug was *load* dependent, not geometry dependent. At 1024 the rail's chunk was
still in flight when the measurement landed; at the wider sizes the chunk had
resolved. That is why the defect read as "sometimes the rail is missing".

Cause, confirmed in the commit itself:

```
$ git show 0ebc470 -- src/views/SingleScreenApp.tsx | grep -n "RoomRail\|PresenceDock"
-import { RoomRail } from '../components/RoomRail';
-import { PresenceDock } from '../components/PresenceDock';
+const RoomRail = lazy(() => import('../components/RoomRail')...);
+const PresenceDockLazy = lazy(() => import('../components/PresenceDock')...);
+              <Suspense fallback={null}><RoomRail className="mb-5" /></Suspense>
+              <PresenceDockLazy ... />
```

`Suspense fallback={null}` around the master pane's room list: for the frames
before the chunk resolved, the desktop room had no rail, no room list and no
way back — an empty left pane, not a loading pane.

## STEP 1 — Static imports for first-paint surfaces

`RoomRail` and `PresenceDock` are static imports again; the `Suspense
fallback={null}` wrapper is gone, and the dock renders directly. The comment on
the import block now says why:

> These two paint in the FIRST FRAME of a room at ≥1024 px … A first-paint
> surface is not lazy-loadable, whatever it saves.

Audited the other lazy boundaries rather than blanket-reverting them:

| Lazy surface | Kept lazy? | Why |
| --- | --- | --- |
| `SystemAlert` | yes | renders after a failed create — never a first frame |
| `ConnectHandshake` | yes | overlay after a join attempt |
| `HeroTransferScene` | yes | inside the hero's story loop, after first paint |
| `ChatView` (mobile) | yes | behind `Suspense fallback={<SkeletonScreen variant="room" />}` — a real skeleton, not nothing |
| `QRScanner` | yes | only after "scan a code" is pressed |

Budget, measured both ways on the same machine:

| | entry chunk (gzip) |
| --- | --- |
| before (HEAD) | **171.2 KB** — `index-Bw1b6wvY.js` |
| after (this fix) | **171.9 KB** — `index-DWy_6QAd.js` |

+0.7 KB, still 8.1 KB under the 180 KB gate and 5.1 KB under the 177 KB working
target. The rest of the M5 savings stay saved.

```
$ node scripts/verify-bundle.mjs
PASS  entry chunk ≤ 180 KB gzip — index-DWy_6QAd.js is 171.9 KB (8.1 KB under)
[verify-bundle] GREEN
```

## STEP 2 — Room-entry first-paint gate

`scripts/verify-room-paint.mjs`. It does not sleep and then look; it samples
every animation frame, so it cannot be lucky:

- a rAF sampler is installed before the page loads and records, per frame,
  whether the room pane, the thread, the rail, the number of rail rooms, the
  presence dock and the composer are on screen;
- the room's first frame is the first frame that shows **the desktop room pane**
  (`[data-testid="room-panel"]`) *and* the thread. The pane is the signal that
  the layout has switched, so a phone layout caught mid-resize is not mistaken
  for a room entry;
- the rail, the room list, the presence dock and the composer must exist in
  **that same frame** — not one frame later;
- layout shift is summed over room entry only; more than **0.02** fails;
- a static pass reads `SingleScreenApp.tsx` and fails if `Suspense
  fallback={null}` wraps any first-paint component (`RoomRail`, `PresenceDock`,
  `ChatView`, `SystemAlert`).

Run at 1024×768 and 1440×900.

**It fails on the bug.** Re-introducing exactly what `0ebc470` did (lazy
`RoomRail` + `Suspense fallback={null}`) into the fixed file:

```
FAIL 1024×768 — the rail is in the first room frame — rail at +6 frame(s), rail rooms in-frame: 0
FAIL 1024×768 — the room list is in the first room frame — 0 room(s)
FAIL 1024×768 — room entry shifts less than 0.02 — CLS 0.0523
FAIL 1440×900 — the rail is in the first room frame — rail at +15 frame(s), rail rooms in-frame: 0
FAIL 1440×900 — the room list is in the first room frame — 0 room(s)
FAIL 1440×900 — room entry shifts less than 0.02 — CLS 0.0287
FAIL no Suspense fallback={null} wraps a first-paint surface — RoomRail

[verify-room-paint] 7 failure(s)
```

Note the CLS line: the pop-in was a real layout shift (0.052 / 0.029), which is
why the same gate now guards it.

**It passes on the fix:**

```
PASS 1024×768 — the rail is in the first room frame — rail at +0 frame(s), rail rooms in-frame: 1
PASS 1024×768 — the room list is in the first room frame — 1 room(s)
PASS 1024×768 — the presence dock is in the first room frame — dock at +0 frame(s)
PASS 1024×768 — the composer is in the first room frame — composer at +0 frame(s)
PASS 1024×768 — room entry shifts less than 0.02 — CLS 0.0000
PASS 1440×900 — the rail is in the first room frame — rail at +0 frame(s), rail rooms in-frame: 1
PASS 1440×900 — the room list is in the first room frame — 1 room(s)
PASS 1440×900 — the presence dock is in the first room frame — dock at +0 frame(s)
PASS 1440×900 — the composer is in the first room frame — composer at +0 frame(s)
PASS 1440×900 — room entry shifts less than 0.02 — CLS 0.0000
PASS no Suspense fallback={null} wraps a first-paint surface — none found

[verify-room-paint] clean — the first room frame is the whole room
```

`PresenceDock` gained `data-testid="presence-dock"` so the gate can see it. That
is the only production change the gate needed.

`verify-desktop` at the three widths, three consecutive runs after the fix:

```
run 1: 16/16 checks passed
run 2: 16/16 checks passed
run 3: 16/16 checks passed
```

## STEP 3 — `verify:layout` + pre-push

```
"verify:room-paint": "node scripts/verify-room-paint.mjs"
"verify:layout": "node scripts/verify-browser.mjs desktop,sheets,no-flash,room-paint"
```

`verify:layout` reuses `verify-browser`'s server lifecycle (starts a dev server
on `VERIFY_BROWSER_PORT`, default 3010, and stops it), so it needs no server of
its own and cannot be run against a stale build. `room-paint` was also added to
the full `verify:browser` list.

`.githooks/pre-push` now:

1. runs `npm run verify:bundle` (as before);
2. reads the refs git hands it on stdin and, **only when the push touches `src/`
   or `public/`**, runs `npm run verify:layout`;
3. `SKIP_PREPUSH=1 git push` skips both; `SKIP_BUNDLE_HOOK=1 git push` still
   skips only the bundle check. The hook refuses with a message that names the
   skip variable.

`DESIGN.md` §0 gained rules 12 and 13: no lazy-loading a first-paint surface,
and the layout gate runs before the push.

## STEP 4 — De-flake `verify-sheets`

Two separate sources of flakiness, both fixed at the cause:

**Timing.** The gate slept 600 ms after opening a sheet, 450 ms after Escape,
500 ms after a scrim click and 300 ms around a resize — a bet on how long a
spring takes on the machine running it. Each wait now asks the DOM:

- `settleSheet()` waits until the panel exists, is painted, has opacity 1 and
  its wrapper's transform is at rest (`none` or `matrix(1, 0, 0, 1, …)`), and the
  scrim is fully opaque;
- `gone()` waits for the sheet to leave the DOM instead of sleeping through the
  exit animation;
- `twoFrames()` replaces the fixed 300 ms after a viewport change;
- the focus-return check waits for `document.activeElement` to be the trigger
  rather than sleeping 500 ms and reading it.

**One assertion was testing formatting, not geometry.** "a centred dialog grows
from its trigger, not the viewport centre" required `/^[0-9]+px [0-9]+px$/`, but
the origin is measured from the trigger's own centre and lands on a fractional
pixel — `210px 265.898px`. That failed on a legitimate value, so the check now
parses both numbers and asserts the real property: a finite point inside the
viewport that is **not** the viewport's centre. It still fails if the dialog
grows from `50% 50%`, and it still fails if the origin is bogus.

**A third flake surfaced while proving the hook, not the gate.** The first
`git push` for this commit was rejected: `verify:layout` ran `sheets` and
`desktop` and both died pairing with `element was detached from the DOM`. The
same command passed three times by hand minutes earlier. Cause: a cold Vite
server optimises dependencies once and full-reloads the page when that
finishes, so a click that starts on the mount can find its target detached a
frame later; Playwright retries against a node that no longer exists until it
times out. `scripts/lib.mjs` now exports `clickStable()`, which retries the
click itself across the reload instead of trusting one attempt, and the pair
step in `verify-sheets` and `verify-desktop` uses it. `npm run verify:layout`
then passed twice in a row (and again inside the push that shipped this).

Five consecutive runs after the change:

```
14/14 checks passed
14/14 checks passed
14/14 checks passed
14/14 checks passed
14/14 checks passed
```

## Full checklist

| Gate | Result |
| --- | --- |
| `npm run lint` | clean (tsc, no output) |
| `npm run build` | exit 0 |
| `npm run verify:bundle` | GREEN — 171.9 KB |
| `npm run verify:browser` ×3 | see below |
| `npm run verify:desktop` ×3 | 16/16, 16/16, 16/16 |
| `npm run verify:sheets` ×5 | 14/14 ×5 |
| `npm run verify:room-paint` | clean (fails on the regression) |
| `npm run verify:layout` ×2 (+ 1 inside the push) | GREEN, GREEN, GREEN — no `detached` retries |

### `npm run verify:browser` — three consecutive runs

Each run starts its own dev server on 3010 and runs all eight gates: typing,
sheets, desktop, room-feed, no-flash, room-paint, chaos, key-at-rest.

| Run | Gates | Result |
| --- | --- | --- |
| 1 | typing 5/5 · sheets 14/14 · desktop 16/16 · room-feed 6/6 · no-flash clean · room-paint clean · chaos · key-at-rest | `[verify-browser] GREEN` — `EXIT=0` |
| 2 | same eight sections | `[verify-browser] GREEN` — `EXIT=0` |
| 3 | same eight sections | `[verify-browser] GREEN` — `EXIT=0` |

Logs: `audit/tmp/vb74-1.log`, `-2.log`, `-3.log` (git-ignored scratch).

## NOT VERIFIED

- **Not checked in Safari or Firefox.** The gate runs the packaged Chromium.
  `verify:link-join` already records webkit/firefox as unavailable here; the
  same limitation applies to the new gate.
- **No real throttled-network run.** The proof re-introduces the lazy boundary
  locally, which reproduces the frame delay deterministically; it does not
  replay a 3G profile where the chunk takes hundreds of milliseconds. The
  window would be wider there, not narrower.
- **2560 px room entry** was not added to the new gate — it runs 1024 and 1440.
  `verify-desktop` still measures 2560 geometry.
- **The pre-push hook ran for real on this push** (it rejected the first
  attempt, which is how the third flake above was found, and passed the second).
  It was not exercised against a deliberately failing `verify:bundle`; the skip
  variables were checked by reading the hook, not by running it with each one.
- **Live smoke needed two attempts.** The first `node scripts/smoke-live.mjs`
  after the deploy failed pairing: the console showed
  `WebSocket … /ws?room=… failed: WebSocket is closed before the connection is
  established` against the canonical signaling worker
  (`sharetext-signaling.alighttt.workers.dev`), so no room came up. The second
  run passed everything — pairing took 13.3 s and the message arrived in 11 ms —
  which reads as a cold signaling worker, not this change (the client bundle for
  the room path is byte-identical apart from the rail/dock placement). Flagged
  rather than buried: if it recurs, the worker's cold start is the thing to
  measure.

## Live

- Pushed: `2cbabd0..dc128b1` on `main`; the pre-push hook ran `verify:bundle`
  (GREEN) and `verify:layout` (GREEN) inside the push itself.
- Live build marker: **`dc128b138099`** (matches `HEAD`).
- `node scripts/smoke-live.mjs` against https://sharetexts.online:
  **GREEN** — 200, marker present, meta/OG/Twitter checks pass, two devices
  paired (code …578), message A → B in 11 ms, sender sees its own message, no
  console errors.

## Three questions

1. **Should the room-entry gate also cover 2560 px?** It costs ~25 s per width
   and 2560 is the least-used layout; I left it out to keep the hook fast. Say
   the word and it goes in.
2. **`verify:layout` is now on every UI push and takes about four minutes.** Is
   that the right trade for you, or should the hook run only `desktop` +
   `room-paint` (≈90 s) and leave sheets/no-flash to CI?
3. **The "Nothing stored" footer line still conflicts with Temporary Spaces
   keeping items up to 7 days** — the claim conflict from the previous pass is
   still open and still needs an owner decision, not a code change.
