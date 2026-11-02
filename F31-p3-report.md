# F31 — P3 report (Apple DNA 2, part 2: Send, Receive, connect, Settings)

Repo `sharetexts`, branch `main`, tag `before-p3` on `3de6549`'s parent.
Everything below was measured on this machine against `http://localhost:3010`
(dev server) unless a line says live.

## Summary

Five steps, four commits. P3 replaces the two halves of the hand-over — the old
LiveCodeDisplay / LiveCodeInput pair — with one Send screen and one Receive
screen, adds the moment in between, and rebuilds Settings as a real sheet. The
Room is untouched (P4).

The screen count went **down**: the Send screen is a single card with three
tabs, no footer and no duplicate "connect your other device" line; Receive is
six flat cells with no capsule around them and no card behind them. Both use
the same code lifetime the app has always had — 90 s, anchored to the room — and
now say so.

Three things P3 found while proving itself, all fixed: the 30-second copy (B27),
the language list's radio rows having no radio group (axe, critical), and four
contrast failures in the sheet that the gate had never been able to see because
it could not reach a room (B28).

## Commits

| commit | step |
| --- | --- |
| `376e4c7` | Step 1 — `feat(send): single hand-over screen with Code, QR, Link` |
| `3de6549` | Step 2 — `feat(receive): flat code entry, auto-join, honest errors` |
| `916f720` | Step 3 — `feat(connect): designed connect moment for both routes` |
| `17df61e` | Step 4 — `feat(settings): grouped sheet with Automatic language and real switches` |

Step 5 (the audit) is carried by `17df61e` together with the gate changes it
needed, because its fixes are in the same files as the sheet. Steps 3 and 4 also
share `src/lib/messages/*` (both steps added strings), so the connect commit
carries the settings strings and the settings commit carries the code that uses
them.

## Per step: what changed

### Step 1 — Send (`src/components/send/SendScreen.tsx`)

One screen: floating Back, "Send", the subtitle "Open ShareTexts on your other
device and tap Receive.", then the code card. Radius 16, no shadow, label
"Room code", six digits set 3+3 at 48 px tabular with a caption that counts the
**real** remaining time (m:ss) — `totp.ts` runs a 90 s period, so the caption
does too. Under 0:15 the time switches to `--color-status-warning-ink`, which is
`#9a5a00` after this step (the old `#c77a00` failed AA at 13 px).

The digits are one `aria-label` — "Pairing code: 5 2 2, 4 2 4" — because a
screen reader hearing six bare numerals is worse than hearing the number once,
grouped the way it is written.

Code | QR | Link is a segmented control with a shared thumb (240 ms) and a
190 ms crossfade; the chosen tab is remembered for the session. Copy code swaps
its own label to "Copied" for 1.5 s. QR sits on a white plate at 220 px. Link is
one truncated row plus "Share link".

The status row is a **sibling** of a fixed-height scroll area, not sticky:
sticky overlapped the card at 844×390. Short viewports compact (max-height
520 px) so the card and Copy code stay above the status line. No footer. At
≥1024 px it is one centred 480 px column.

Expired (dim, "Code expired", "New code") and offline (Retry) are both reached
by dev pins `?sendState=expired|offline`, inert in production builds.

### Step 2 — Receive (`src/components/receive/ReceiveScreen.tsx`)

Six flat cells, 48×56 (44×52 below 360 px), radius 12, band fill, 2 px accent
focus edge, gap 8 with a wider gap after digit 3 — no outer capsule, no card.
`autocomplete="one-time-code"`, `inputmode="numeric"`, paste fills all six,
backspace steps back, the sixth digit auto-submits with the primary button
reading "Joining…" in place. Join stays visible and disabled until six digits;
"Scan QR code" is the secondary.

A wrong code shakes for 280 ms and says "That code didn't work. Check the digits
or ask for a new one.", plus `haptic('error')`. Server errors are classified:
`expired` (has expired / no longer valid / too old), `offline` (reach /
connection / network / offline / timed out), everything else — including
"Invalid or expired code" — is a wrong code, because a person's next move is the
same.

`OtpInput` grew `variant="flat"` rather than a parallel implementation, so paste,
backspace, autofill, shake and the `data-slot` contract are the same code path
the old capsule used. `verify-otp` was retargeted from the removed capsule
contract to the flat geometry one and still passes 47/47.

### Step 3 — the connect moment (`src/components/ConnectHandshake.tsx`)

Two Lucide 24 px device glyphs in circles, a line drawn between them with
`stroke-dashoffset` over 600 ms linear, then a solid line, a check badge scaling
in over 280 ms, `haptic('success')`, a 220 ms hold and the push to the Room.
Reduced motion skips the draw entirely (measured: `transition-duration:
1e-05s`, `animation-name: none`) and fades the check over 120 ms.

The label is the part that had to be proved: it reads "Connecting…" while the
line draws, then resolves once to "Same network" or "Through ShareTexts" (hop)
after the line lands — never flipping mid-beat, never shifting. The captured
frames put both labels in the same box, `{x:135, y:146, w:120, h:20}`.

Nearby connect is the same component, so the two routes cannot drift apart.
Proof: `audit/p3/motion/connect/` (88 frames at ~12 fps), label-stability output
in the same folder.

### Step 4 — Settings (`src/components/SettingsOverlay.tsx`)

Groups — Device, Appearance, Language, Feedback, Nearby, About — in one
scrollable sheet: 52 px rows, inset hairlines, drag-to-dismiss, Esc, focus trap,
the scrim's tap closing. Device name edits inline. Appearance is
Light | Auto | Dark plus "Reduce transparency", which sets `html.no-glass` and
`sharetext.noGlass` so the change lands everywhere at once.

Language opens a **column inside the same sheet**, not a dialog on a dialog:
Back returns to the groups, the first row is "Automatic (device language)" and
clears the stored key, and every other language is written in its own name with
a check on the current one. `i18n.tsx` gained `auto` and
`useDeviceLanguage()` — the device language is detected, not frozen.

Haptics is a switch over `sharetext.haptics` with the honest helper "Vibrates
for connect and error. Android only.". Nearby's visibility and auto-connect
share state with the Nearby sheet. About lists Docs, Guides, Privacy, Terms and
the version read from the build marker.

## Interaction map (P3 surfaces)

| surface | action | result |
| --- | --- | --- |
| Send | Code / QR / Link | shared thumb 240 ms, 190 ms crossfade, remembered for the session |
| Send | Copy code | label becomes "Copied" for 1.5 s, no layout shift |
| Send | code expires | card dims, "Code expired", "New code" as the only action |
| Send | offline | Retry in place, code kept |
| Receive | type 6 digits | auto-join; Join reads "Joining…" |
| Receive | paste | all six cells fill, then the same auto-join |
| Receive | wrong code | 280 ms shake + sentence + `haptic('error')`, digits kept |
| Receive | keyboard up | `visualViewport` keeps Join above it |
| Connect | either route | one beat, then the room |
| Settings | theme | all three, persisted under `sharetext.theme` |
| Settings | Reduce transparency | `html.no-glass`, persisted |
| Settings | Language → Automatic | key removed, device language live |
| Settings | Haptics / Nearby | real switches, persisted, shared with Nearby sheet |

## Gates

| gate | result |
| --- | --- |
| `tsc --noEmit` | 0 |
| `npm run build` (incl. `pin-csp --check`) | 0 — "2 inline-script pin(s) consistent" |
| `verify-otp` | **47 passed, 0 failed, 0 page errors** |
| `verify-nav` | 13/13 |
| `verify-primitives` | 6/6 (reduced motion and reduced transparency both proven) |
| `verify-axe` (extended) | **0 serious/critical, 0 moderate across 8 surfaces** — Home light, Home dark, Nearby sheet, Temporary Space sheet, Send, Receive, **Settings**, **Settings → Language** |
| `check-contrast` (extended) | **0 below AA on 8 surfaces × 2 themes** — landing, home, home@phone, settings, settings@phone, settings-lang, send@phone, receive@phone — plus 19 runs classified as pre-existing room chrome (B29) |
| `verify-a11y-p3` (new) | focus order, names, 320 px reflow, landscape + keyboard, reduced motion — all values captured, no failures |
| `measure-frames` | **FAIL — 13.5%, 16.4% and 18.6% across three runs** (B23) |
| `smoke-live` | **GREEN** against https://sharetexts.online (run 2; run 1 failed on one stale asset — B31) |

### Notes on the two gates that changed

`verify-axe` and `check-contrast` could not reach Settings before, because its
only trigger is the gear in a connected room's header. Both now pair two real
pages against the dev transport, which is the path a person takes. That
immediately failed the language list (critical `aria-required-parent`: ten
`menuitemradio` rows with no menu) — fixed by making the list a `radiogroup` of
`radio` rows — and four contrast runs on the sheet itself (B28).

Pairing also measured the room header, the composer hints and the Temporary
Space sheet for the first time: 19 runs there are still below AA. They belong to
P4's surface, so they are **named** in `KNOWN_PREEXISTING` with a reason and
printed as known — not silently skipped, and not counted as passes.

### Frame numbers

Same harness as P2 (390×844, 4× CPU throttle, headless Chromium, software
rasterisation), three consecutive runs:

| phase | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| scroll Home | 9.7% | 9.4% | 18.2% |
| push Send | 7.2% | 15.6% | 7.3% |
| Back to Home | 14.3% | 11.8% | 28.6% |
| push Receive | 11.7% | 2.3% | 6.0% |
| Back from Receive | 33.3% | 100% (1 frame) | 100% (1 frame) |
| open Nearby sheet | 58.8% | 49.1% | 62.0% |
| close Nearby sheet | 11.8% | 5.5% | 10.0% |
| **overall** | **16.4%** | **13.5%** | **18.6%** |

Two honest readings. The numbers are **noisy on this host** — the same phase
moves by 8 points between runs, and "Back from Receive" sometimes samples a
single frame, which makes its percentage meaningless. But "open Nearby sheet" is
consistently the worst phase (49–62%, p50 33.3 ms), which no P3 change explains:
the sheet is P2's, `NearbyDevices.tsx` changed by one `export`. P2 measured 5.6%
overall; today's host cannot reproduce that, so P3 neither claims the budget nor
claims a regression it did not measure cleanly. B23 stays open with both numbers
in it.

## NOT VERIFIED

- **A second physical device.** Every pairing test here is two Chromium contexts
  on one machine; the transport is real, the radios are not.
- **Android haptics.** `navigator.vibrate` is called; nothing has buzzed.
- **The connect beat at 220 ms hold, on a phone.** The hold is real in code
  (`?beat=<ms>` stretches it for capture), but nobody has watched it at arm's
  length.
- **QR scanning end to end.** The scanner opens; the live build's scanner chunk
  currently 404s (B31), so this needs the next deploy before it can be trusted.
- **Settings under a real OS font-size setting**, and 200% *text* zoom (the
  reflow check is 320 CSS px, which is the WCAG condition).
- **Frame numbers on real hardware** — 4× throttle in software rendering is a
  stand-in.
- **The five phone checks below.**

## Owner questions (2)

**1. Is the Send code card allowed to be this quiet?** It is the whole screen and
it carries no shadow, no ring and no illustration; the only motion is the
counting caption. *Recommendation:* keep it. A code that someone reads out loud
should not compete with anything. If it reads as empty on a tablet, the fix is
more space above the card, not more chrome inside it.

**2. Should Settings keep "Haptics" on iOS?** The switch is shown everywhere and
its helper says "Android only." *Recommendation:* keep the row visible and the
helper honest — a missing row looks like a bug, and a switch that does nothing
without saying so is worse.

## Self-audit

- [x] Send is one screen: one title, one instruction, one card; no footer, no
      repeated line, nothing clipped at 844×390 or 390×844.
- [x] The code's remaining time is the real one (m:ss off `totp.ts`), and the
      copy conflict is resolved once — Send's caption and Receive's note now
      agree, and the note says 90 s (B27).
- [x] Receive auto-submits on the sixth digit, classifies errors into three
      kinds, and stays above the keyboard (proven at 844×390 with a 190 px
      visual viewport).
- [x] The connect moment respects reduced motion (no draw, check fades), and the
      label never flips: both labels measured in the same 120×20 box.
- [x] Settings is grouped, Automatic clears the stored key and follows the
      device, and every switch writes the key the app already reads.
- [x] Contrast clean (8 surfaces × 2 themes), axe clean (8 surfaces), `verify-nav`
      13/13, `verify-primitives` 6/6, `verify-otp` 47/47.
- [ ] `measure-frames` within the P2 budget — **13.5–18.6%, B23 open**, with the
      caveat above.
- [x] `before-p3` pushed; every push has a record in
      `docs/redesign/live-smoke-log.md`.
- [x] New strings are English placeholders in all nine locales and listed in
      `docs/redesign/i18n-todo.md`; findings are in `docs/redesign/bugs.md`
      (B27–B31).

## 5 things to check on a real phone

1. **Hand the code over.** Send on the phone, Receive on the laptop: one glance
   should be enough to read the code out loud, and the countdown should reach
   0:00 exactly as the old code stops working.
2. **Type it wrong on purpose.** The cells should shake once, the sentence
   should appear without moving the layout, and an Android phone should buzz
   once — not three times.
3. **Watch the connect moment.** Both device dots, one line drawn between them,
   then the room. It should feel like a beat, not a screen; if it feels slow,
   the 220 ms hold is the number to cut.
4. **Open Settings and change three things.** Theme to Dark, transparency off,
   language to Automatic after switching the phone to French — the sheet should
   never jump and "Automatic" should follow the phone without a reload.
5. **Scan the QR code.** This is the one path the gates cannot prove (B31):
   point the other phone's camera at the plate and confirm it lands in the same
   room as the six digits do.
