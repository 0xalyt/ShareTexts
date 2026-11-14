# F30 — P2 report (Apple DNA, step 1)

Tag `before-p2` → `main`. Branch: `main`, no long-lived branch. Every step was
committed on its own, pushed, and smoke-checked where the live site had a new
build to check.

## Summary

1. Home is now two doors — *Send* / *Receive* — with quiet rows underneath (Nearby,
   Temporary Space), one intent field above them, and no toggles, second Send
   button or orange glow left in the hero.
2. The shell speaks the §18 grammar: flat buttons on brand orange, glass only on
   the Back circle, the header capsule and the bottom group, real press and
   haptics, a screen stack that pushes from the right, and a Back that means one
   thing everywhere.
3. Four defects were found by measuring rather than looking, and fixed: the
   self-hosted Inter subsets were **swapped on disk** (the product rendered Arial
   on every non-Apple machine), the Back circle left its history entry behind,
   task headings painted underneath the Back circle, and six quiet captions
   failed AA while the token gate reported "0 failing".
4. Every gate is green except three: the frame budget (5.6% of frames above
   33 ms against a 5% budget, B23), the known footer tap sizes (B20), and the
   live smoke — which cannot pass while the signaling worker rejects browsers.
5. Room-level behaviour is therefore **not verified in P2**, and neither is
   anything that needs a second device on a real network.

## Commits

| commit | what |
| --- | --- |
| `6f0c091` | docs: Apple DNA grammar (contract v1.3), interaction map |
| `8ed02a6` | feat(ui): Apple DNA primitives — CSS layer, tokens, haptics, ScreenStack |
| `89ab875` | feat(buttons): one flat grammar, SF-first type, named haptics |
| `1456ab2` | feat(shell): glass header capsules, task chrome, history-aware back |
| `42d34c0` | chore(git): keep audit captures and scratch probes out of the repo |
| `9a802e0` | test(header): pin the 44px capsule and its adjacent theme glyph |
| `034dbaf` | feat(home): two doors, quiet rows, Nearby sheet |
| `50e4532` | fix(type): ship the real Inter subsets and keep SF off non-Apple stacks |
| `7f8a2ac` | fix(nav): the Back circle consumes the level it pushed |
| `9145607` | fix(a11y): quiet text on Home, Send and the sheets now clears AA |
| `aeadf2d` | test(frames): measure the P2 motion budget, and correct the font contract |
| this one | docs: F30-p2 report |

`before-p2` is pushed. Owner commits `836d212`, `2cc2082`, `28321fa`, `c2bf243`
are untouched.

## Per step: what changed

### Step 1 — Worker URL: skipped, with the reason

`https://sharetext-signaling.0lighttt.workers.dev` does not resolve at all
(`curl` → HTTP 000), and the hostnames that *do* exist
(`…0xalyt…`, `…alighttt…`, `…garv29devra…`) answer `200` to a request with no
`Origin` header and `403` to every browser origin. A WebSocket handshake from
the app therefore fails. Nothing in the repo can fix a worker that is deployed
elsewhere; putting a working URL in code without a worker that accepts the
origin would only hide the failure. The step stops here and is listed under
NOT VERIFIED.

### Step 2 — Primitives

- `src/styles/apple-dna.css`: tokens for press (.975 / 95 ms / 155 ms), the six
  durations, the three easings, `.press`, `.glass`, `.glass-capsule`,
  `.segmented` with a shared thumb, `.route-stack` states, and `.sheet` with a
  drag variable. Fallbacks: `@supports not (backdrop-filter)`, reduced
  transparency, `html.no-glass`, reduced motion (crossfade 140 ms, no
  translation).
- `src/lib/haptics.ts`: `haptic('tap'|'select'|'success'|'error')`, Android
  vibration patterns, `HAPTICS_IOS = false`, one `sharetext.haptics` master
  switch, gestures only. `hapticSuccess` / `hapticArrive` / `hapticTick` remain
  as thin wrappers so nothing else broke.
- `src/components/ui/ScreenStack.tsx` + `GlassCircleButton`, `Segmented`.
- Proof: `scripts/verify-primitives.mjs` — **6/6** on the dev server (the
  `/__kit` route is dev-only, so this gate's home is `localhost:3010`; against a
  production build it correctly reports that the kit page is not the kit).

### Step 3 — Home

Removed from the hero: the Visible / Auto-connect toggles, "Why isn't my device
showing?", the Temporary Space box, the second Send button under the demo, and
every orange glow and gradient behind the hero. `HeroDeviceDemo` keeps the
walk, and now starts it by itself (`AUTO.open → connecting`), because the button
that used to start it was the one removed.

Added: two doors with a one-line caption each, one intent field above them, and
two quiet rows (Nearby → sheet, Temporary Space → sheet). The Nearby sheet is
the §18 restyle: 36×5 grabber, radius 24, backdrop 36%, drag-to-dismiss at 28%
of height (min 36 px) or 0.6 px/ms, focus trap, Esc. `OverlaySheet` gained
`keepMounted` so the Nearby presence engine is not torn down every time the
sheet closes.

Screenshots: `audit/p2/after/home-{390x844,844x390,820x1180,1440x900}-{light,dark}.png`
plus `audit/p2/after/contact-sheet.html` (gitignored, by owner request — only
source and gates are committed).

Interactive elements in the **first viewport**: phone 390×844 → **9**, budget 8.
The overrun is the intent field (input + submit), kept deliberately: it is the
one place a first-time visitor can start without choosing a door, and it is the
P1a field the doors were built around. See question 2.

| viewport | interactive in first viewport |
| --- | --- |
| 390×844 | 9 |
| 844×390 | 9 |
| 820×1180 | 16 |
| 1440×900 | 12 |

### Step 4 — Motion and history proofs

- `audit/p2/motion/home-send-back/` and `home-receive-back/`: 8 frames per leg
  at ~12 fps, captured from the compositor (CDP screencast — `page.screenshot()`
  is far too slow to catch a 280 ms push), plus an `index.html` contact sheet.
- `scripts/measure-frames.mjs`: CPU throttle 4×, rAF sampler, p50/p95/p99 and
  the share of frames above 33 ms, over six phases.
- `scripts/verify-nav.mjs`: **13/13**.

## Interaction map

`docs/redesign/INTERACTION-MAP.md` (step 0) is the register; every row was
walked by hand or by a gate. The P2 rows, and where each is proven:

| interaction | where it is checked |
| --- | --- |
| door press → Send / Receive | `verify-nav`, `verify-quality` |
| intent submit → Send with the text | `verify-intent-entry` |
| Back circle and browser Back agree | `verify-nav` |
| sheet drag / Esc / focus trap | `verify-primitives`, `verify-axe`, manual |
| theme glyph | `verify-theme`, `verify-quality` |
| header capsule: More (phone) / command (desktop) | `verify-theme` (capsule + glyph pins, `9a802e0`), `verify-quality` |
| press + haptics | `verify-primitives` |
| Room arrival, leave, reconnect | `verify-f18` **over a local pair** — live is blocked |

## History audit (§3c)

| level | pushes | Back returns to | proven by |
| --- | --- | --- | --- |
| Home | — (base) | leaves the site | `verify-nav` (lands on `about:blank`) |
| Send | exactly one `pushState`, tagged `{stTask}` | Home, room cancelled silently, no confirm | `verify-nav` |
| Receive | exactly one `pushState` | Home | `verify-nav` |
| Connecting | within the Send entry | Send | `verify-nav` + manual |
| Room | one entry, tagged with a generation (`stRoom`) | Home | `verify-f18` (local pair) |
| Sheets | **none** — §3c lists screens, not dismissals | sheet closes | `verify-nav` |

One defect was found here and fixed (B24): the Back circle cancelled the screen
but never popped the entry, so the *next* Back landed on a phantom level and
appeared to do nothing. `verify-nav` now proves the entry is consumed — after
the circle, one more Back leaves the site.

## Gates

| gate | result |
| --- | --- |
| `tsc --noEmit` | 0 |
| `npm run build` (incl. `pin-csp --check`) | 0 — "2 inline-script pin(s) consistent" |
| `verify-f18` | **29/31** — the 2 failures are B20 (footer tap sizes, untouched by P2) |
| `verify-quality` | 18/18 |
| `verify-theme` | all green |
| `verify-primitives` | 6/6 (dev server) |
| `verify-nav` (new) | 13/13 |
| `verify-axe` (new) | 0 serious/critical, 0 moderate across Home light+dark, Nearby sheet, Temporary Space sheet, Send |
| `check-contrast` | 0 below AA on landing / home / home@phone, both themes; Settings **skipped** (needs a connected room) |
| `measure-fonts` | all pass — H1, body and button glyphs are Inter; CLS 0.0369 |
| `measure-frames` | **5.6%** above 33 ms against a 5% budget → B23, open |
| `smoke-live` | **4 failures** — pairing cannot start while the worker rejects the origin |

Contrast is clean only after B26: the token gate had been skipping every
`oklab(… / alpha)` colour, so it was reporting "0 failing" while axe flagged
five real ones. Fixing the probe surfaced 17 failing runs; six were on P2
surfaces and are fixed.

## Frame numbers

390×844, CPU throttle 4×, production bundle, budget ≤5% of frames above 33 ms
(full table: `audit/p2/frames.md`):

| phase | frames | p50 | p95 | p99 | max | >33 ms |
| --- | --- | --- | --- | --- | --- | --- |
| scroll Home | 115 | 16.7 | 33.3 | 50.0 | 66.7 | 8.7% |
| push Send | 82 | 16.7 | 33.4 | 266.8 | 266.8 | 8.5% |
| Back to Home | 82 | 16.7 | 16.8 | 200.1 | 200.1 | 4.9% |
| push Receive | 85 | 16.7 | 16.8 | 266.6 | 266.6 | 2.4% |
| Back from Receive | 67 | 16.7 | 16.8 | 50.0 | 50.0 | 3.0% |
| open Nearby sheet | 83 | 16.7 | 33.3 | 100.0 | 100.0 | 7.2% |
| close Nearby sheet | 77 | 16.7 | 16.7 | 33.4 | 33.4 | 2.6% |
| **overall** | **591** | | | | | **5.6%** |

Reading: the median frame is exactly 60 fps everywhere, and the misses are two
kinds. (a) One long frame per push, ~220–270 ms, when Home unmounts and the
destination tree commits *inside* the 280 ms animation. (b) Continuous paint
cost on Home — disabling `backdrop-filter` alone takes push-Send from 12.0% to
9.0%, and the hero's looping demo sits under a blurred header. Headless
Chromium rasterises blur on the CPU, so this is the pessimistic reading; a real
phone with a GPU is not this slow. It is still over the line the contract drew,
so it stays open instead of being explained away.

## NOT VERIFIED

- **Anything that needs the signaling worker**: Room entry, pairing, Settings,
  `verify-mobile-ui`'s room flow, `verify-toggle-desktop` (three tracker-null
  checks), and Settings contrast. The worker returns `403` to browsers.
- **`smoke-live`**: 4 failures, all downstream of the same worker.
- **SF on an Apple device.** The Apple branch is proven to *reorder the token*
  (`html.apple-type`), not to paint SF: this machine is Windows.
- **Haptics on iOS.** `HAPTICS_IOS = false` on purpose; nobody has felt it.
- **The Android back gesture itself.** `page.goBack()` is the same entry, but the
  gesture is not the API.
- **Frame numbers on real hardware.** 4× CPU throttle under software rendering
  is a stand-in, not a phone.
- **Landscape phone composition below the fold**, and any screen at a width the
  four captures do not cover.

## Owner questions (3)

**1. The frame budget (B23).** 5.6% against 5% — one mount frame per push plus
the blur's paint cost, measured without a GPU. *Recommendation:* treat this as
the software-rendering number, check it on your phone once, and if it reads as
smooth call the budget met. If not, I take the cheaper of the two fixes: mount
task-screen content one frame after the push starts, so the animation runs on
an empty canvas. That is a small change and it does not touch the design.

**2. The intent field on the phone (9 interactive vs a budget of 8).**
*Recommendation:* keep it. Removing a field to hit a number would put back the
"which door do I press?" hesitation the doors exist to answer; if you want the
count, the honest way to get to 8 is folding the theme glyph into the More
sheet, which costs a tap for a thing people use once.

**3. One worker, one origin.** Today three different worker hostnames appear in
the app, the deploy env and the smoke, and all of them refuse the site's origin.
*Recommendation:* deploy the worker once, allow `https://sharetexts.online` and
`http://localhost:3010`, and set that single URL in `.env.production`. Until
then Room, pairing, Settings and the live smoke stay red for reasons that are
not in this repo.

## Self-audit

- [x] Worker URL in code and smoke 6/6 — **skipped with a reason** (step 1):
      the URL does not resolve and the deployed workers 403 every origin.
- [x] DESIGN.md is v1.3 with section 18; `docs/redesign/INTERACTION-MAP.md` exists.
- [x] Primary buttons use brand orange `#f06413`; no gradient or glow behind the
      hero (the only `blur-3xl`/glow match on Home is the intent capsule's own
      shadow).
- [x] SF-first stack … with a correction the contract now records: Inter leads
      the token and `html.apple-type` restores SF first on a real Apple platform,
      because Blink resolves `-apple-system` on Windows too. `fonts.txt` shows
      Inter painting on Windows/Linux.
- [x] Glass only on the back circle, capsules and the bottom group; 2 glass
      elements on Home (budget 3); fallbacks proven by `verify-primitives`.
- [x] Header: at most 3 controls on a phone (skip link + More + theme).
- [x] Back behaviour matches 3c; `verify-nav` passes 13/13.
- [ ] Home first viewport: at most 8 interactive elements on a phone — **9**,
      reported, with the reason above (question 2).
- [ ] Frame budget met; contrast clean; axe clean — **contrast clean, axe clean,
      frame budget 5.6% (B23, open)**.
- [x] Tag `before-p2` pushed; every push has a smoke record in
      `docs/redesign/live-smoke-log.md`.

## 5 things to check on a real phone

1. **Home.** Does the first screen read as two obvious doors with a field above
   them, or does the field compete with the buttons? One thumb, one glance.
2. **The Back gesture from Send.** Swipe back once: you should land on Home and
   a second back should leave the site — not a dead press in between.
3. **Dragging the Nearby sheet.** Grab the sheet and flick it down. It should
   follow your finger and dismiss on a flick; a slow drag past about a third
   should also dismiss, and stopping early should snap back.
4. **How buttons and the theme glyph feel.** Press and hold Send: it should sink
   2 px and hold, and on Android it should buzz once on success. The theme
   glyph should feel like a 44 px target, not a 20 px icon.
5. **The font, if you have an iPhone or a Mac.** Headings should be SF there and
   Inter here — the same weight and rhythm, no visible jump in size between the
   two. On Android, check the phone's default-browser look, not Chrome's.
