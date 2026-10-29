# Capture noise floor — masks for the pixel proof

## P1a (2026-10-29) — the current floor: strict static mode

A pixel proof is only worth what its capture pins. `--static` is now the only
mode a diff may use, and `scripts/diff-matrix.mjs` compares at **tolerance 0**
(any channel differing by one step counts).

Everything the capture pins as an INPUT (never a mask):

- context: `locale: 'en-US'`, `timezoneId: 'UTC'`, `deviceScaleFactor: 1`,
  `reducedMotion: 'reduce'`; screenshot `animations: 'disabled'`, `caret: 'hide'`.
- `page.clock.setFixedTime(2026-10-22T10:00:00Z)` — Date only, timers keep running
  (installing the clock and pausing it also freezes rAF and breaks rendering).
- seeded `mulberry32` behind `Math.random` / `crypto.getRandomValues`, so every
  client-made id, code and default name is identical run to run.
- pinned HTTP: `/stats` (the live rooms counter) and `/space` snapshots
  (`createdAt`/`expiresAt`) rewritten to the frozen clock's values.
- pinned socket payloads: `presence_list` → empty, `space_sync`/`space_event`
  lifetime rewritten to the frozen values.
- `backdrop-filter` disabled (Chromium's one non-bit-stable compositing op).
- `RTCPeerConnection.getStats()` waits for a succeeded candidate pair before it
  answers, so the header's one-shot route classification lands every time (see
  the route-line row below).
- landing offline gate no longer abortable: `navigator.onLine` may lag the
  context emulation by a frame, and a 5 s timeout there used to kill a whole
  8-screen combo. The banner-absent check is the real condition.

### The two transients that used to break the proof

| Screen | Why it moved | Pin |
|---|---|---|
| `connecting` (all vps) | The app signals over a WebSocket, and one trip carries the join ack, the offer and the channel-open in a few ms. Both passes caught the panel already gone (99.96 % on `844x390-dark`, 29 % on `390x844-light`; `console.txt` read `panel=false composer=true`). | `ctx.routeWebSocket('**/socket.io/**')` proxies the creator's socket and delivers every frame **4 s late** while the joiner types its code and the shot is taken — same signaling, just slower. `console.txt` now logs `connecting-state phase=connecting panel=true composer=false` for all 8 variants, and the 8 shots are byte-identical with **no mask**. |
| room screens (header route line) | The subtitle starts as the generic “Connected” and resolves to “Same network” / “Relay” once the link is classified — and that classification runs ONCE, on the peer's first `connected` event, from a `getStats()` snapshot. Taken mid-negotiation, it finds no succeeded candidate pair and leaves “Connected” for the life of the room. One pass shot the resolved label, the other the generic one on every room screen of a combo (479 px @390x844, 2990 px @820x1180). | Two belts: the `getStats()` pin above makes the snapshot honest, and `settleRoom()` still refuses to shoot until the label reads “Same network” / “Relay” (plus 900 ms of stable body text). The one-shot classification itself is a product bug — logged in `bugs.md`. |

### Masks — 14 boxes, each measured and cause-verified

`audit/static-masks.json` (this replaces `audit/step9-masks.json`; the older
file and the `_diff-post8/_diff-runs/_probe-step9-*` probes are deleted):

| Group | Boxes | Cause |
|---|---|---|
| `pairing-*` (8) | the code tiles + countdown ring panel; `[[368,366,377,376]]` at 844x390 where the tiles are hidden | server-generated TOTP digits and the ring's seconds arc |
| `space-room-*` (6) | the header code chip only (e.g. `[[619,13,735,44]]` @1440) | server-issued random space code; excludes the countdown text and member chip |

Nothing else is masked. Measured on 2026-10-29 over two full passes
(`STATIC_RUN_SEED=9001` vs `9002`, 144/144 shots each, no combo failures):

- **144 of 144 byte-identical** with the masks → `PASS` at tolerance 0.
- **132 of 144 byte-identical with NO masks at all**; the 12 that differ are
exactly the 6 `pairing` and 6 `space-room` sheets above, and every differing
pixel falls inside their named box (`audit/static-p1a-diff-nomasks.txt`).
  The old floor was 26 raw-identical pairs out of 142 with 100 screens masked;
  this one masks 14 small boxes and nothing else.

### Running the proof

```bash
STATIC_RUN_SEED=777 node scripts/capture-baseline.mjs --static --out audit/p1a-a
STATIC_RUN_SEED=888 node scripts/capture-baseline.mjs --static --out audit/p1a-b
node scripts/diff-matrix.mjs audit/p1a-a audit/p1a-b --masks audit/static-masks.json
```

A single combo can be re-shot into an existing directory with
`--combo 390x844-dark` (it skips the manifest and `console.txt` writes).

Two operational rules the pair above depends on:

- **Restart the dev server before each pass.** The dev space backend keeps
  registered codes AND the per-IP create throttle in memory for the life of the
  process, so a second run on the same server collides with the first run's
  codes and dies in `space create did not navigate after retries` (cost: three
  wasted 65 s throttle waits per combo). A fresh server per pass took both
  passes to 144/144 with zero failures.
- **The launch flags include
  `--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests`.**
  Without them Chromium intermittently blocks the page's own signaling
  WebSocket to `localhost` (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`),
  which both breaks space creation and hides the `connecting` panel. It is an
  environment pin, like `--disable-gpu`, not a product change.

## STEP 9 (2026-10-23) — superseded floor (kept as history)

STEP 9 proves the hygiene pass (STEP 8) changed **no pixels**: re-run
`scripts/capture-baseline.mjs` after the pass and diff against
`audit/baseline/`. A raw diff would drown in false positives, because
several regions are legitimately nondeterministic. This doc names every
volatile region and how the diff step masks it.

## Measured floor (run1 vs run2, same code, 2026-10-22)

Two full matrix runs on identical code, diffed per-pixel (threshold >8/256
per channel) with `scripts/_diff-runs.mjs`; raw data in `audit/noise-floor.json`.

- **26 of 142 pairs byte-identical**; most static screens (docs, 404, all
  dark variants of docs/404) are pixel-identical.
- **116 pairs differ**; 100 of them under 0.4 % of pixels, and every one of
  those falls in a box listed below.
- The only structural misses: `connecting-390x844-light` and
  `connecting-844x390-light` are absent from run2 — the connecting panel
  transition beat was faster than the 4 s capture window. The connecting
  screen is **timing-dependent by nature** (see mask row 5).

Measured boxes (x0,y0,x1,y1 in CSS px) that carry all the noise:

| Screen group | Measured box (representative) | Max share | Cause |
|---|---|---|---|
| connecting (all vps) | whole screen (e.g. `0,11,819,1177` @820) | **15.3 %** | packet-travel animation phase — mask the whole screen or skip diffing it |
| offline-banner (all vps) | `218,7,863,381` @1440; `51,8,338,406` @390 | 1.0 % | banner entrance/exit animation phase + the page beneath re-laid out during the offline flip |
| room-with-messages / image-message / settings / room-ended / reaction-* (@820, @1440) | `594,219,679,342` @820; `1217,232,1301,355` @1440 | 3.9 % | message-timestamp + "Seen" meta line (wall clock), and reaction-chip seconds-tick |
| room-with-messages / empty-room / reaction-* (@390, @844) | `85,76,304,360` @390; `312,80,531,126` @844 | 3.9 % | same timestamps in the stacked layout |
| pairing (all vps) | `52,414,338,433` @390; `132,395,1172,575` @1440 | 0.34 % | random 6-digit code + countdown ring seconds |
| space-room (all vps) | `247,24,406,40` @844; `545,24,704,40` @1440 | 0.16 % | random `bse-XXXX` space code in the header chip |
| landing / language-menu / space-create / space-join (all vps) | `218,371,235,381` @1440; `365,350,382,360` @820; `150,396,167,406` @390 | 0.05 % | live rooms counter (server truth — the number can tick between runs) |
| empty-room / enter-code (occasional) | single pixel (e.g. `983,318`) | <0.001 % | antialiasing / cursor blink — ignore below 1 px |

## Rule

A region may be masked **only** if it can change with zero product change:
random room data, wall-clock text, or in-flight animation phase. Nothing
else gets a mask — a mask that could hide a real regression is forbidden.

## Volatile regions (by screen — table now cross-checked against the measurement)

| Screen | Volatile element | Why | Mask strategy (selector → rect) |
|---|---|---|---|
| pairing (all vps) | the 6 code digit tiles + countdown ring | random per room | `[data-testid="pairing-code"]` bounding box (covers the measured `52,414,338,433` @390 box) |
| enter-code (all vps) | typed digits | the run types a fresh random code | same `input` row box (6-cell input container) — measured clean this run (digits cleared), keep the mask for safety |
| room-with-messages, image-message, reaction-added, reaction-picker-open, settings, room-ended | message timestamps + "Seen · 04:06 pm" meta | wall clock | the measured `594,219,679,342` @820 / `1217,232,1301,355` @1440 / `85,76,304,360` @390 boxes = the last-message meta strip; selector equivalent: every `[data-testid^="msg-"]` card's time row |
| room-with-messages (desktop) | header device-name chip + code area | fresh per room, but names are deterministic defaults here — measured CLEAN at 1440 beyond the timestamp box | no mask needed beyond the timestamp strip (verified by the run) |
| space-room (all vps) | `bse-XXXX` code chip in the header | random per run | `[data-testid="space-code-chip"]` box (measured `247,24,406,40` @844) |
| landing, language-menu, space-create, space-join | live rooms counter pill | server truth — ticks up between runs | the measured ~17×10 px box (`218,371,235,381` @1440); selector: the `tnum` counter inside the live pill |
| offline-banner (all vps) | the banner + everything under it during the offline flip | entrance/exit animation phase differs | mask the measured banner-region box, or capture only after the entrance settles (future capture fix) |
| connecting (all vps) | everything | packet-travel animation phase is the content | **do not diff** the connecting screen — it is excluded from the pixel proof; its correctness belongs to the motion review |
| motion frames | everything | animation phase is the point | motion sequences are **not** diffed; they are reviewed, not pixel-proven |

Screens with **no** volatile regions (diff these exactly, zero tolerance):
landing (both halves), language-menu, docs, 404, space-create, space-join,
offline-banner, empty-room, settings.

Note the landing hero demo never self-plays (own Send control), so
landing is deterministic; its `landing-demo` motion frames are excluded
from the diff by the same rule as all motion output.

## Deriving the exact rects (STEP 9 procedure — step 1-3 DONE this session)

1. ✅ With no code change between runs, ran capture-baseline twice:
   `audit/baseline/` and `audit/baseline-run2/` (142 vs 144 files — the two
   missing `connecting` shots are the timing race documented above).
2. ✅ Diffed per-pixel with `scripts/_diff-runs.mjs` (threshold >8); results
   in `audit/noise-floor.json` and summarised in the measured-floor table.
3. For the STEP 9 diff, each differing region must still be confirmed against
   the table above; if a region falls outside every listed box, the noise has
   a cause the table is missing — fix the capture script or the table, never
   widen a mask to swallow it.
4. Encode the confirmed rects as painted-black boxes (same-size PNG overlay
   per viewport) applied to **both** sides before the final diff.
5. Baseline vs. post-STEP-8 diff must then be empty on every
   zero-tolerance screen and mask-bounded elsewhere. Zero-tolerance screens
   (pixel-identical this session, 26 pairs): docs, 404, and the static
   sheets outside their counter strip.

## Capture determinism settings (already in capture-baseline.mjs)

- fixed viewports, `colorScheme` emulated, `locale: 'en'`, theme forced
  via localStorage before first paint
- `settle = networkidle (8 s cap) + 800 ms` before each static shot
- message screens wait for real DOM text, not timers
- image-message waits 4 s after file input for the transfer to finish

## STEP 9 result (2026-10-23) — PROOF HOLDS

Re-captured the full matrix after the STEP 8 hygiene pass (`audit/baseline-post8/`,
144/144 shots, capture script byte-identical to the baseline run — `git diff
37caaa1..HEAD -- scripts/capture-baseline.mjs` empty) and diffed with
`scripts/_diff-post8.mjs`:

- **36 pixel-identical raw** · **100 emptied by the masks** · **8 excluded
  (connecting)** · **0 flags** — `audit/step9-diff.txt`, `audit/step9-diff.json`.
- Git proof first: `git diff --stat 21cbd26..HEAD -- src index.css public
  index.html server.ts worker` is **empty** — STEP 8 touched no runtime file.
  The captures are the belt-and-braces confirmation.

Steps 4–5 of the procedure above: DONE. Masks = floor boxes from
`audit/noise-floor.json` + cause-verified supplemental boxes in
`audit/step9-masks.json` (each entry carries the confirmed cause). Every
supplemental box was justified by diffmap/crop inspection
(`scripts/_probe-step9-diffmap.mjs`, `scripts/_probe-step9-crops.mjs`) before
being added. Regions outside both sets were flags, investigated one by one:

| Region (first-seen) | px | Confirmed cause | Evidence |
|---|---|---|---|
| message meta strips (all room screens, all viewports) | up to 400/file | wall-clock text `Seen · hh:mm` — AND the format drifted between runs (`04:00 pm` → `11:22 AM`) because MessageCard's `timeOf` passes `[]` as locales (host default, not the app locale; host culture is now en-IN per `Get-Culture`) | crops `audit/step9-crops/*.base/post8`; src/components/MessageCard.tsx:68 |
| header device icon (room-with-messages @390) | 250 | icon glow/connection-pulse phase at capture | diffmap rows y18–37, crops visually identical |
| send button (room-with-messages @390) | ~40 | ↑ arrow render timing (present post8, absent baseline) — composer state timing race | crops send.base/send.post8 |
| reaction picker chip row (@390) | ~300 | chip pop/enter animation phase (left half differed today, right half in the floor run) | diffmap rows 182–211 + crops |
| reaction chip rows (@1440/@820) | ~50–160 | seconds-tick text row above the strip | diffmap rows 166–202 |
| space code chip | 9 | random `bse-XXXX` glyph extent (floor box missed 3 px below) | diffmap y24–43 only |
| pairing code/ring | up to 376 | random code tile glyph extent + countdown ring seconds-hand tip | diffmaps y443–469 / y471–497 + residual 1 px |
| docs dashed divider (y959–960) | 16 | dotted divider dash phase (transfer diagram) | crops identical |
| language rows (@844 dark), Paste icon, docs flash | 10/2/16 | sub-pixel AA / cursor blink (Devanagari hinting rows) | crops identical |
| language-menu counter pill (@390) | 8 | live-rooms counter (server truth) | table row already covered the cause |
| offline-banner edge columns + beneath | 4 | banner entrance/exit phase (known table cause; edges outside floor box) | diffmap y7–41 columns x269/x550 |

Floor-box growth is the table row "message-timestamp + Seen meta line (wall
clock)" doing its job — the text simply rendered wider today; boxes were
re-measured, not widened past the observed region. One instructive miss:
`pairing-1440x900-**light**`'s floor box covered only y471–497 while the dark
variant covered the whole y395–575 band — the light run1-vs-run2 pair had the
same code digits by luck. Fixed by masking the same band for both variants
(recorded in step9-masks.json).

Net: STEP 8 changed **no pixels on any of 136 diffed screens**; every residual
traced to a zero-product-change cause (clock text, random room data, animation
phase, sub-pixel AA). Reproduce: `node scripts/capture-baseline.mjs --out
audit/baseline-post8 && node scripts/_diff-post8.mjs`.
