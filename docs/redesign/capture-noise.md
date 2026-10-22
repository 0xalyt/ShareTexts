# Capture noise floor — masks for the pixel proof

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
