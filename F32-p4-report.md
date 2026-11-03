# F32 — P4 "ROOM + FEEL" report

**Status: shipped, live smoke GREEN, two P4 steps deliberately not done (listed at the end).**

The phase had three jobs: make the Room feel like the rest of the product, stop
sheets costing frames, and close two live defects (B31 stale chunk, several
signaling hosts). Two of the three are done and one is partially done. Along the
way P4 shipped its own S1 defect and this report is honest about it: for about
forty minutes the live site could not deliver a message (B36).

---

## Commits (all on `main`, all pushed, tag `before-p4` marks the base)

| Commit | What |
|---|---|
| `3eae6f2` + `ad17dae` | STEP 0 — DESIGN.md §19 "Room grammar" (contract v1.5) |
| `e88e546` | STEP 1a — stale-chunk recovery: `vite:preloadError` guard, `manifest: true`, `dist/precache.json`, `sw.js` `sharetexts-v27` precaches lazy chunks + carries old assets forward, new gate `verify-chunk-recovery` |
| `baca527` | STEP 1b — one signaling worker: `SIGNALING_WORKER` constant, worker `originPermitted()`, origin gate before `/health`, 4 new origin checks in `verify-worker-prod` |
| `b680555` | STEP 2 — no `backdrop-blur` anywhere in components; scrim/panels/headers solid; `measure-frames` rewritten as a relative gate with a committed baseline |
| `b633ee8` | STEP 3 (partial) — quiet composer (teach row, key-hint row and formatting toolbar out of the default view; formatting moved into the Add sheet), recipient row gated to 3+ devices, touch keeps Return as newline, room chrome raised to AA |
| `1c6bc32` | always use the canonical worker even when `VITE_SIGNALING_URL` disagrees (logs once) |
| `7c5cc8e`, `b14a071` | **incident response** — revert STEP 3 and STEP 1a while the live message failure was unexplained |
| `3b9498b`, `ad6874f` | re-apply both once the bisect named the culprit |
| `fac3629` | **the fix** — remove the composer caption that changed the composer's height while typing |
| `5ab7d4b` | docs: close B31/B29, file B36/B37, live smoke log entry |

---

## What shipped, step by step

### STEP 1a — stale chunks cannot strand a session (B31 closed)

`vite.config.ts` now emits `manifest: true` and a small `precacheManifest()`
plugin writes `dist/precache.json` (4 entries: QRScanner, ChatView, Docs,
Legal). `public/sw.js` (cache `sharetexts-v27`) precaches those URLs at install
and, on activate, carries the previous build's `/assets/*` entries forward
before deleting the old cache — so a browser that is mid-session when hashes
rotate still has the chunk its HTML asks for. `src/main.tsx` listens for
`vite:preloadError` and unhandled rejections: the first failure inside a 10 s
window sets `sharetext.chunkReloadAt` and reloads once, which is the only
recovery available to a page whose module graph is already broken.

New gate `scripts/verify-chunk-recovery.mjs`: **8/8** (it simulates a rotating
deploy and proves the lazy chunk is served from the new cache).

Live confirmation after the final deploy: `smoke-live` reports **0 console
errors** — the 404 chunk that B31 described is gone because it is precached.

### STEP 1b — one worker, one host (B37 filed)

Source, config and the deployed env var named three different
`sharetext-signaling.*` hosts. The brief named `0xalyt` as canonical; it does not
exist:

```
$ nslookup sharetext-signaling.0xalyt.workers.dev 8.8.8.8
** server can't find sharetext-signaling.0xalyt.workers.dev: NXDOMAIN
$ curl -s -o /dev/null -w '%{http_code}' https://sharetext-signaling.0xalyt.workers.dev/health
000
$ curl -s -o /dev/null -w '%{http_code}' https://sharetext-signaling.alighttt.workers.dev/health
200
```

`0lighttt` is dead the same way; only `alighttt` resolves. So the canonical host
is `sharetext-signaling.alighttt.workers.dev`. That is a deviation from the
brief, made for the only reason that justifies one: the named host has no DNS
record. Dead hosts were removed from source and config; dated archives (the
F26/F28/F30 reports and earlier smoke-log entries) were left exactly as written,
because they record what was true on the day.

The worker now checks `Origin` before `/health` and permits `sharetexts.online`,
`*.vercel.app` and any loopback port, answering 403 otherwise.
`scripts/verify-worker-prod.mjs`: **13/13 against the live worker**, including
the four origin cases.

### STEP 2 — sheets stop paying for blur

Every `backdrop-blur` was removed from `src/`: the sheet scrim is now
`bg-black/36`, and the ConfirmSheet, Nearby, Saved, CommandBar and Settings
panels are solid; headers, toast and chips too.

Measured in the quiet window right after the change, on a 4× CPU-throttled
390×844 viewport, median of 5 runs: **opening the Nearby sheet went from 26.9%
of frames over 33 ms to 6.0% (−78%)**; every other phase stayed inside the
noise band. That is the measurement behind the step.

`scripts/measure-frames.mjs` was rewritten to be a *relative* gate: it compares
today's median against `audit/frames-baseline.json` (committed, with the host,
Chromium build and throttle recorded) at 25% tolerance, so a different machine
does not fail it for being a different machine.

**Honest caveat — the gate cannot pass on this host today.** Three consecutive
runs of the *same* build gave: open Nearby 8.6% / 8.8% / 11.5%, scroll Home
9.3% / 13.6% / 17.1%, and within-run spreads up to 26 points. Phases the phase
did not touch moved as much as the phase it did. The 25% tolerance sits far
below this machine's noise floor (the committed baseline's own spread is 7.6 pt
on a 8.3% median), so the gate is reporting load, not code. Recommended fix is
in the NOT DONE list: more runs and a stricter percentile, not a looser
tolerance.

### STEP 3 (partial) — the Room's quiet surface

Shipped:

* The composer shows only what a message needs: **+**, the field, the send
  circle. The teach row, the desktop key-hint row and the formatting toolbar are
  out of the default view. Formatting lives in the Add sheet as a "Formatting"
  row (`AttachmentPanel` gained an optional `onFormatting`).
* The recipient row only appears in a 3+ device room (`others.length >= 2`), so
  a two-device room no longer offers a picker with one choice in it.
* `isTouchDevice` (`pointer: coarse`) keeps Return as a newline on a phone;
  desktop keeps Enter-to-send.
* Room chrome now clears AA: status chips use `--color-status-warning-ink`, the
  latency readout and Reconnect are ink on the bar, the stay-connected and
  invite hints moved to ink-muted. `KNOWN_PREEXISTING` in `check-contrast` is
  now empty — nothing is excluded by name any more.

Screenshots (2× DPR, from the production build served on :3330):
`audit/p4/room-390x844-light-{empty,text,add,format}.png`,
`audit/p4/room-390x844-dark-*.png`, `audit/p4/room-844x390-light-*.png`,
`audit/p4/after-nearby-{light,dark}.png`.

### The incident: B36, an S1 P4 shipped into live

After the STEP 3 push, `smoke-live` failed its message check — reproducibly, 3
times. A's own bubble appeared, B never received anything. The symptom looked
like signaling or crypto, which is exactly why it took a bisect:

1. Pre-P4 build on a local dist server → `B has msg: true`.
2. HEAD build → `B has msg: false`.
3. Build each P4 commit in turn: fails from `b633ee8` onward.
4. Revert STEP 3 → passes. Re-apply only STEP 3 → fails. **STEP 3 is the cause.**
5. Re-apply STEP 1a on top → still passes, so the PWA work was innocent.
6. Within STEP 3, the sender's own echo was fine and the recipient was
   innocent, so the failure had to be at the tap: the shortcut caption I added
   rendered only while the field was focused **and** non-empty, inside the
   composer's own flex column. Typing therefore grew the composer ~20px and
   moved the orange send circle out from under the click/tap.

Fix (`fac3629`): the caption is gone; the composer keeps one height from empty
to sent. Confirmed by the same probe (`B has msg: true`) and then on live.

During the bisect I also reverted STEP 1a and STEP 3 rather than debug on the
live site (DESIGN §0.10e), then re-applied both once the cause was named. The
live site was never left serving a known-broken build across a turn boundary.

---

## Gates

Run against the production build on `http://127.0.0.1:3330` unless the gate
needs the dev-only gallery or the live site.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `verify-chunk-recovery` | **8/8** |
| `verify-worker-prod` (live worker) | **13/13** |
| `verify-nav` | 12 passed, 0 failed, 1 skipped (Connecting → Room and the Android back gesture need a real peer) |
| `verify-axe` | **8 surfaces × 2 themes, 0 serious/critical, 0 moderate** |
| `check-contrast` | **16 runs, 0 below AA**, `KNOWN_PREEXISTING` empty |
| `verify-reactions` | **9/9** |
| `verify-otp` | **47 passed, 0 failed, 0 page errors** |
| `verify-primitives` (dev `/__kit`) | **6/6** (18 controls ≥ 44×44) |
| `measure-frames` | **FAIL — noise-limited, see above** (8.6 / 8.8 / 11.5% on an unchanged phase) |
| `smoke-live` | **GREEN, 12/12** — paired in 5 878 ms, message delivered in **5 ms**, 0 console errors |

Note on `verify-primitives`: pointed at the dist server it reports "1 control"
and fails, because `/__kit` is dev-only. That is a wrong-target artifact; against
its real target (dev `:3010`) it is 6/6.

---

## NOT DONE (screen by screen)

These were in the brief and are **not** in this phase. Each is a deliberate stop,
not an oversight — the ones at the top are the ones that matter.

| Item | Where | Why it stopped |
|---|---|---|
| **Feed meta density** | Room, every bubble | Each bubble still prints `Seen • 06:52 PM` inside it. §19 wants one meta line per group, not per bubble. Visible in `audit/p4/room-390x844-light-text.png`. |
| **RoomBar grammar (§19)** | Room header | The header is still the P3 bar with a corrected palette. The §19 bar (name + status as one lockup, actions right) was written into the contract but not built. |
| **Apple-style tapbacks** | Room, message actions | The smiley opens the existing reaction row; the long-press/double-tap gesture and the pill above the bubble were not built. |
| **Desktop master-detail** | Room, ≥1024px | Still one column, full width. The brief's two-pane room is untouched. |
| **Rating removal** | wherever it lives | Not touched. |
| **Home cleanup** | Home | Not touched — P4 was scoped to the Room. |
| **STEP 7** | — | Not started. |
| **Frame-gate noise** | `measure-frames` | The gate needs more runs / a stricter percentile before it can resolve a 25% change on this hardware. Today it fails on unchanged phases. |

Because STEP 3 stopped at the composer, the commit message was renamed to say
what it actually contains rather than the brief's "native room" title.

---

## Five things to check on a real phone

The gates run in headless Chromium on a laptop. These are the things it cannot
tell you:

1. **Type, then send.** Type a long message and watch the orange circle. It must
   not move while you type or after you send — that movement was B36, and it cost
   a live message. Then check the message actually landed on the other device.
2. **Open Nearby and Settings on the oldest Android in the house.** The scrim no
   longer blurs, so both sheets should open without the hitch they had in P3.
   This is the only place the frame work is really judged.
3. **Scan QR after a fresh deploy.** B31's 404 chunk is gone from the build, but
   only a camera proves the scanner opens on a real device.
4. **Rotate the room to landscape.** 844×390 is in the screenshots; the composer
   and header behaviour at that height is only trustworthy on a real keyboard
   and a real rotation.
5. **Turn "Stay connected" on, background the tab for a minute, come back.**
   The room should reappear with its messages; the pinning path is the one part
   of the room no gate reaches without two devices and time.

---

## Two things only the owner can finish

* **Vercel still sets `VITE_SIGNALING_URL` to the retired host.** The client now
  ignores it, uses the canonical worker and logs one warning per page (three per
  smoke run). Deleting that variable in the dashboard removes the warning; there
  is no Vercel CLI session on this machine, so it could not be done from here.
* **The frame gate needs a decision**: either accept that this hardware cannot
  measure 25% changes and raise the run count plus tolerance to match its noise,
  or re-baseline on a quiet machine and treat the gate as advisory until then.
