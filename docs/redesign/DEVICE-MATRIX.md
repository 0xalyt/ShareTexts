# Device matrix — what a browser cannot prove

Twelve viewports are captured automatically (`scripts/capture-matrix.mjs`) and
the core flow runs in Chromium, Firefox and WebKit in CI. That covers layout,
overflow, keyboard reach and the engines. It does **not** cover real hardware:
a real keyboard, real safe areas, real camera permissions, a real installed
app, or a Share Target. Those are the owner's five minutes on a phone.

## What the automated matrix covers

| Viewport | Why this size |
| --- | --- |
| 320×568 | smallest phone still in use (iPhone SE 1st gen) |
| 375×667 | iPhone SE 2/3 |
| 390×844 | iPhone 12–15 |
| 844×390 · 667×375 | both landscape sizes — keyboard up, composer reachable |
| 820×1180 · 1180×820 | iPad both ways |
| 673×841 · 1344×841 | foldable, folded and unfolded |
| 1280×800 · 1920×1080 · 2560×1440 | laptop and two desktop widths |

Screens: Home, Send, Receive, Settings. Room and Space need a peer and are
covered by the two-context flow in `scripts/e2e.mjs`.
Result recorded in `audit/p6-matrix/report.json`: horizontal overflow and
thumb-zone position of the single filled control, per screen per size.

## What the owner must test by hand

1. **Samsung Internet, Android (any recent phone).** Open `sharetexts.online`,
   run one transfer. Watch for: the address bar hiding on scroll and whether
   the Send button stays reachable; the file picker opening the Samsung picker
   rather than Chrome's; a pull-to-refresh accidentally firing mid-transfer.
2. **iPhone Safari, iOS 16 or later.** One transfer each way. Watch for: the
   bottom bar overlapping the composer while the keyboard is up; the home
   indicator on a full-height page; the tab being suspended when you switch to
   the other app to copy the code.
3. **A low-end Android (2–3 GB RAM, 4-year-old CPU).** Open the landing page
   and start a transfer. Watch for: the first paint taking more than a few
   seconds; the hero animation stuttering; the QR scanner failing to get a
   camera permission prompt.
4. **Install to Home Screen** on both platforms, then open the installed app
   and send one file. Watch for: the app opening in a browser tab instead of
   standalone; the icon; the splash screen.
5. **A shared link opened inside WhatsApp or Telegram.** Watch for: the
   "Open in your browser" line appearing, the Android button actually leaving
   WhatsApp, and the iOS instruction matching what the ⋯ menu shows.

## Known limits, stated plainly

- Firefox and WebKit are verified in CI only; this machine has Chromium
  installed. A green CI run is the evidence, not a local screenshot.
- `backdrop-filter` is behind a flag on some Android browsers; the app falls
  back to solid fills, which the automated contrast check covers.
- A Safari tab is paused when backgrounded. Large files resent after the tab
  returns; that is the platform, not the app.
