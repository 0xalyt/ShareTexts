# F29 — P1a: ship, fix the live bug, make the proof tool strict

Date: 2026-10-29 · Branch: `main` · Tag at start: `before-p1a`
Report file: this one. `F28-completion-report.md` is untouched.

Every numbered step ended with tsc + build + its gates, a commit, a push, and a
live smoke once the deployed build marker matched. The smoke records are in
`docs/redesign/live-smoke-log.md`.

| Step | Commit | Live marker | Smoke |
|---|---|---|---|
| 1 — Apple emoji layer | `459a3ac` (+ `ebe3d3b` artwork) | `459a3ac537d6` | 6/6 GREEN |
| 2 — B1 CSP pin at build time | `2429e15` | `2429e15e5f72` | 6/6 GREEN, no CSP violation |
| 3 — B16 one formatter | `618abd4` | `618abd41de68` | 6/6 GREEN (run 2; run 1 was a live timing flake, both recorded) |
| 4 — deterministic capture + strict diff | `45eedb2` | `fa0374a4ea15` | 6/6 GREEN |
| 5 — DESIGN.md v1.2 §17 decisions | `fa0374a` | `fa0374a4ea15` | 6/6 GREEN |

## Step 1 — the Apple emoji layer ships

`src/lib/emoji.ts` + `src/components/Emoji.tsx` render the six reaction glyphs
as 160 px Apple artwork from `public/emoji-apple/`, switchable off with
`VITE_EMOJI_SET=native`. The service worker moved to cache v24 and precaches
the six PNGs.

- `npm run test:emoji` (`scripts/verify-emoji.mjs`) — GREEN: the six PNGs are
  served `200 image/png`; the picker renders six `<img>` with
  `naturalWidth > 0`; a reaction chip contains an `<img>`; with
  `/emoji-apple/**` aborted the chip falls back to the native character; and a
  second build with `VITE_EMOJI_SET=native` (built into `.tmp-native`, served,
  then deleted) has zero `emoji-apple` images and renders the native glyphs.
- Artwork weight: **121 267 bytes total (118.4 KB) for six PNGs** — under the
  150 KB review line, nothing resized.

## Step 2 — B1, the live CSP that blocked the theme script

The live CSP pinned a hash that matched no script, so the pre-paint theme
bootstrap never ran. Hand-pinned hashes drift, so the fix removes the hand:

- `.gitattributes` with `* text=auto eol=lf` and binary rules;
  `git add --renormalize .` showed no content changes beyond line endings.
- `scripts/pin-csp.mjs` hashes every executable inline script in the built HTML
  (JSON-LD and module scripts excluded) and compares it with `vercel.json` and
  `server.ts`. `--check` is the default and runs at the end of `npm run build`;
  `--write` re-pins (`npm run pin-csp`); `SKIP_CSP_CHECK=1` is the loud escape.
- `scripts/verify-csp.mjs --live` re-reads the deployed header and applies the
  same rule. Result on marker `2429e15e5f72`: GREEN — the live
  `content-security-policy` carries exactly the two pins the shipped scripts
  hash to (`eMqz…` boot script, `eLR/…` about-page year), no dead pins.
  Proof archived in `audit/p1a/csp-live.txt` and
  `audit/p1a/verify-csp-live.txt`.
- The live smoke after this push logged **no CSP violation** in either browser
  context — the first run to do so.

## Step 3 — B16, one formatter for every date, time and number

`src/lib/format.ts` adds `fmtTime`, `fmtDateTime`, `fmtShortDate`,
`fmtWeekdayTime`, `fmtDayHeading` and `fmtNumber`; all take the app's active
language, map it to a BCP-47 tag (`zh → zh-Hans`, …), cache one formatter per
language and let the language — never the machine — choose the hour cycle.
Every call site named in the brief was replaced (MessageCard, SavedItemsOverlay,
CommandBar, SingleScreenApp, SpaceView, ChatView, `lib/space/time.ts`), and the
grep for `toLocale|Intl.` now finds only the formatter module.

`npm run test:format` (`scripts/verify-format.mjs`) — GREEN, 18 runs: for each
of the app's 9 languages the rendered time equals
`Intl.DateTimeFormat(<mapped>, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })`
for the pinned timestamp, and the output is identical with the browser context
set to `en-US` and to `de-DE` (e.g. `hi` → `10:00 am` in both, `ar` → `١٠:٠٠ ص`
in both).

## Step 4 — the proof tool, now strict

The P0 diff "passed" with 100 of 144 screens masked and a capture that used
locale `en` and the real clock. `--static` now pins every input a screenshot
can leak and `scripts/diff-matrix.mjs` compares at **tolerance 0** and exits 1
on any unmasked difference.

Measured over two full passes (`STATIC_RUN_SEED=9001` vs `9002`, 144/144 shots
each, zero combo failures):

- **144 / 144 byte-identical** with `audit/static-masks.json` → `PASS`.
- **132 / 144 byte-identical with no masks at all**; the 12 that differ are the
  6 `pairing` and 6 `space-room` sheets, and every differing pixel sits inside
  their named box (`audit/static-p1a-diff-nomasks.txt`).
- Masks are **14 small boxes**, not screens: the pairing code tiles + countdown
  ring (server TOTP), and the header space-code chip (server random code).
  `audit/step9-masks.json` is replaced and deleted; `_diff-post8.mjs`,
  `_diff-runs.mjs` and the step-9 crop/diffmap probes are deleted with it.

Three transients had to be pinned at their source rather than masked:

1. **`connecting` (8 variants).** The app signals over a WebSocket and one trip
   carries the join ack, the offer and the channel-open in a few milliseconds,
   so both earlier passes shot the panel already gone. The capture now proxies
   the creator's socket and delivers its frames 4 s late while the joiner's
   panel is shot. `console.txt` records
   `phase=connecting panel=true composer=false` for all 8, and they are now
   byte-identical with no mask.
2. **The room header's route line.** It is classified once, from a `getStats()`
   snapshot; if that snapshot has no succeeded candidate pair the header says
   "Connected" for the life of the room. Filed as **B17**; the capture pins the
   snapshot (wait for a succeeded pair) and `settleRoom()` refuses to shoot
   until the label resolves.
3. **Space create under a reused dev server.** The dev backend keeps registered
   codes and the per-IP throttle in memory, so a second pass on the same server
   died in `space create did not navigate after retries`. Each pass now runs
   against a freshly restarted server, documented in
   `docs/redesign/capture-noise.md` along with the
   `--disable-features=LocalNetworkAccessChecks,…` launch pin that stops
   Chromium from intermittently blocking the page's own socket to localhost.

## Step 5 — DESIGN.md v1.2 §17

Section 17 is the decisions log: every place the code and the contract
disagreed, the owner's choice, and the phase that carries it. The emoji row
records this phase as shipped.

## Bugs closed this phase

- **B1** — the live CSP pinned a hash matching no script; the theme bootstrap
  is now build-time verified and confirmed live.
- **B5** — Apple reaction artwork ships again behind a switchable layer, with a
  gate that proves both the image and the native paths.
- **B16** — every date, time and number now follows the app language.

Filed this phase: **B17** (one-shot link classification can leave the header on
"Connected" for the life of a room) — capture-time pinned, product fix queued
for the room-shell phase.

## Verification summary

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean (run before every commit) |
| `npm run build` | clean, includes `pin-csp --check` |
| `npm run test:emoji` | GREEN (re-run at report time) |
| `npm run test:format` | GREEN — 18 language/context runs (re-run at report time) |
| `scripts/verify-csp.mjs --live` | GREEN on marker `2429e15e5f72` |
| `scripts/diff-matrix.mjs` (two static passes) | PASS — 144/144 with 14 masks, 132/144 with none |
| `scripts/smoke-live.mjs --expect <marker>` | 6/6 GREEN on `459a3ac…`, `2429e15…`, `618abd4…`, `fa0374a…` |

## Not done / honest notes

- The connecting panel is pinned by *pacing* the creator's socket, not by
  freezing the app: the 4 s delay changes nothing in the DOM, but it does mean
  the connecting shot is always the "handshake not yet opened" beat. A future
  capture may want a second, "handshake opened" shot.
- Two full passes plus repairs ran against a dev server whose space-code
  throttle and in-memory registry are shared state; the final pair used a fresh
  server per pass and is the recorded one. Earlier, discarded passes are still
  in `audit/static-p1a-runA|B` (they show the pre-fix flakiness, not the proof).
- `VITE_SIGNALING_URL` still points at the previous signaling worker, so live
  runs log a redirect warning. Not a bug (the boot probe follows it), still an
  owner-side env fix.
