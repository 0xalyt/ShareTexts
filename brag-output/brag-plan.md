# /brag — ShareTexts hero film

Run: 2026-11-18 · format landscape 1920×1080 · 30 fps · 15.0 s · muted loop for the landing hero
Tone: `polished`, with one hard claim leading and proof under it (the article's "bold promise" hook,
not the controversy hook — the product is a utility, and "everything else sucks" would date badly
and is not what the owner asked for).

## What the product is

ShareTexts moves text, links, photos and files between two devices through a six-digit room code.
No account, no app install, no cloud folder. The payload is sealed on the sending device and opened
on the receiving one; the room key travels in the URL fragment, which browsers never send to a
server. Free, and it runs in the browser already on both devices.

Audience: people who have a file on their phone and need it on the laptop in front of them — and who
do not want to email it to themselves or upload it to a drive first.

## The angle

**The shortest distance between two devices is not a cloud.** Every other way of moving a file makes
a copy somewhere in the middle: a draft, a drive, a chat thread, a sync folder. ShareTexts makes the
two devices the whole story. That is the claim the film has to land in two seconds, and the rest of
the film is the receipt: one code, three kinds of payload, a file that lands byte for byte, and a key
that never leaves the two devices.

## Hook (first 2.6 s — frame 0 is the poster)

> **Send it straight to your other device.**
> NO ACCOUNT · NO APP · NO INSTALL

Frame 0 is the settled hook, not an empty stage: the hero autoplays muted and loops, so the first
frame is also the thumbnail everywhere the file is shared. The only motion in the hook is a packet
travelling the wire between two outlined devices on the right, so the still reads as a diagram of
the promise and the motion reads as the promise happening.

## Highlights

1. **The link (2.6–5.2).** One code, two devices. The real QR plate and the six digits light one at
   a time, as the second device types them.
2. **The send (5.2–7.8).** Text, a link and a photo land in the real room thread — three arrivals,
   three beats, each one a beat of its own rather than a wall of UI.
3. **The file (7.8–10.4).** `Q3-budget.pdf` runs to 100% and settles on **Saved**. "Byte for byte"
   is the promise; the progress bar is the proof.
4. **The key (10.4–12.8).** The address bar turned into the argument: `…/space/<id>#k=…` — the part
   after `#` never leaves the browser. The most specific, least generic thing the product can say.

## Punchline / outro (12.8–15.0)

Wordmark, "Move anything between your devices.", `sharetexts.online`, "Free. No account."
Holds 1.8 s, then hard-cuts back to the hook. Both ends are ink frames with the mark in the same
place, so the loop restart reads as a chapter repeat, not a glitch.

## Storyboard

| # | Time | Picture | Type on screen | Motion | Beat |
|---|---|---|---|---|---|
| 1 | 0.0–2.6 | Ink; outlined laptop + phone at right, dashed wire, ember packet crossing; warm bloom bottom-left | `Send it straight / to your other / device.` (device. in ember); kicker `NO ACCOUNT · NO APP · NO INSTALL` | packet crosses 0.35–2.15 s on a cubic; 1.5% slow push | Hook |
| 2 | 2.6–5.2 | Cream QR plate (real `QrArt`, room `482 916`) at right; six code tiles at left | `One code. / Two devices.`; sub `Open it on both. Scan, or type six digits.` | cuts in; tiles light 3.15–4.0 s; plate grows 1.00→1.02 | Reveal |
| 3 | 5.2–7.8 | Room thread card: header, three bubbles, composer | `Send anything.`; sub `Text. A link. A photo.` | text 5.70, link 6.08, photo 6.46; each rises 16 px and settles | Highlight 1 |
| 4 | 7.8–10.4 | One giant file card; three ghost cards behind at 8% | `Files, byte for byte.`; sub `No compression. No re-upload.` | progress 8.15→9.25; `Saved` + tick at 9.5; ring pulse | Highlight 2 |
| 5 | 10.4–12.8 | Address strip on a card; dashed bracket under the fragment | `Encrypted end to end.`; sub `The key is made on your devices. It never reaches the server.`; bracket label `the fragment never leaves the browser` | strip slides up 0.4 s; `#k=` in ember from the start; bracket draws at 11.15 | Highlight 3 |
| 6 | 12.8–15.0 | Centred lockup on ink | `Move anything / between your devices.`; `sharetexts.online`; `Free. No account.` | mark and lines rise 12 px, settle by 13.6; hold to 15.0 | Outro |

Cuts are hard. Every scene carries the same chrome — mark top-left, chapter label top-right,
`sharetexts.online` bottom-left — so the six frames are one publication, not six slides.

## Readability budget

- Hook: 8 words, on screen from frame 0 → 2.6 s.
- `One code. Two devices.` 4 words → 2.6 s.
- `Send anything.` 2 words → 2.6 s.
- `Files, byte for byte.` 4 words → 2.6 s.
- `Encrypted end to end.` 3 words → 2.4 s.
- Outro: 5 words + URL → 2.2 s.

Nothing that must be read is on screen for less than 2.2 s; body copy is static for its whole scene.

## Visual identity

- Ink `#0B0A09`; cream `#F2E9DE`; ember `#F06413` (the product's own token); muted cream at 52%;
  card `#141210`; one green `#34C759` for "connected".
- Type: **Allo** (the product's face), display at 700 with opsz 32 and −0.045 em tracking; labels at
  16 px, 0.22 em, uppercase.
- Surfaces: 24–28 px radii, 1 px cream ring at 8%, contact shadows, one ember bloom per frame.
  No stock footage, no 3D, no invented dashboards.
- Grain 6% and a vignette sit over every frame, so cuts do not flash.

## Claims audit (nothing invented)

- "No account / no app / no install" — the product's own claim, true of the web app.
- `482 916` and `…/space/<id>#k=…` — the product's real code format; the fragment rule is in
  `src/lib/space/constants.ts` and `src/lib/circle/api.ts`.
- `Q3-budget.pdf` — the filename the existing film already uses; the progress bar is illustrative UI,
  not a benchmark claim.
- "Encrypted end to end" — proven by `verify-zero-knowledge` against the deployed Worker.
- No counts, no customer names, no performance numbers, no testimonial.

## Audio

The landing hero is muted by policy and the file ships silent (as the previous hero did). The cut is
built to stand up without sound: every beat is carried by type and a physical move, and the file is
encoded `-an`. A scored 1080p cut is out of scope for this run; if the owner wants one for social,
the same frames can be muxed with a track without re-rendering.

## Poster

Frame 0 (`f00000.png`) is the poster: it is the settled hook, fully legible, with the mark, the
promise and the URL. It is also the first frame of the loop, so there is no jumped thumbnail and no
seam — the `/brag` "bake the poster as frame 0" rule is satisfied by making the true first frame the
strongest settled frame rather than replacing it.

## Render path

`/brag` normally hands the brief to Hyperframes. This machine has no Hyperframes install, and the
repo already owns a deterministic 1920×1080 rig (`film.html` + `window.__film(t)` + Playwright +
ffmpeg) whose output is the current hero. The lean path builds the composition as a pure function of
time and renders it through that rig, which is also the only path that keeps the film reproducible
from source.
