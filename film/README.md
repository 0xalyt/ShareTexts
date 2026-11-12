# The hero film

Two cuts come out of this rig:

| File | What it is | Where it goes |
| --- | --- | --- |
| `film/out/sharetexts-hero-1080p.mp4` | the 34.0 s film with sound (1920×1080, 24 fps) | anywhere that plays it deliberately — social, a launch post |
| `public/film/sharetexts-hero.mp4` | the 10.0 s muted loop, 1920×1080 | the landing hero |
| `public/film/sharetexts-hero-poster.jpg` | frame 0 of the loop | the hero's poster, shown before playback and under reduced motion |

The picture is the product itself: `LaptopApp` and `PhoneApp` in
`src/film/FilmUI.tsx` are the real room/connect screens — the QR plate, the
six-digit code in two groups of three, the countdown, the this ⇄ partner
header with its Direct badge, the composer, the received thread — drawn at
native laptop and native phone density. Nothing in the film is invented UI.

The set around them (desk, light, depth of field, grade) is CSS, not a 3D
render. It is lit like a room: warm key from upper left, cool fill from the
right, spill from both panels onto the desk, contact shadows, a mirrored
chassis on the surface, bokeh behind, then vignette + bloom + grain.

## Shot list (34.0 s)

| Time | Shot |
| --- | --- |
| 0.0–3.0 | Establish. Both devices on a lit desk, ShareTexts already open: the room card with QR + `482 916` on the laptop, the Nearby card on the phone. Slow push. |
| 3.0–7.2 | Discovery. Drift onto the phone; the laptop's "Your iPhone · Nearby" row appears. |
| 7.2–9.4 | One tap. The Connect button presses (7.0–7.8); the laptop's header flips to Connecting… then Direct. |
| 9.4–12.4 | Pull back to a two-shot; the phone types the message. |
| 12.4–14.5 | Text. Send at 13.5, the payload crosses the desk, lands on the laptop at 14.4. |
| 14.5–18.4 | Photos. Attachment appears, sends at 17.45, the photo card lands at 18.3. |
| 18.4–23.2 | Files. `Q3-budget.pdf` sends at 22.35, lands at 23.1, progress runs to Saved. |
| 23.2–26.0 | Hold on the laptop, three payloads in the thread. |
| 26.0–28.6 | Pull back to the desk. |
| 28.6–34.0 | End card: logo, "Move anything between your devices.", sharetexts.online. |

Captions are one line per beat (muted-friendly): *No app. No account.* ·
*One tap to connect.* · *Text.* · *Photos.* · *Files.* · *Encrypted. Nothing
is kept.*

## The loop (10.0 s)

`?mode=loop` renders a self-contained version of the same set: both devices
already connected with all three payloads in the thread, one text packet
crossing at 2.6–3.9 s with a receive pulse that decays to nothing, and a
camera drift that returns to its exact starting position at 10.0 s. Focus,
exposure and UI state are identical at t=0 and t=10, so there is no cut —
nothing persists across the seam, which is why it can loop forever.

## Render it

```bash
npm run dev -- --port 3010          # the rig renders from a running dev server
node scripts/render-film.mjs probe  # 13 stills to check framing and light
node scripts/render-film.mjs frames # 816 frames → film/frames
node scripts/render-film.mjs loop   # 240 frames → film/frames-loop
node scripts/render-film.mjs audio  # voiceover + music + sound design
node scripts/render-film.mjs encode # → film/out/sharetexts-hero-1080p.mp4
node scripts/render-film.mjs web    # → public/film (loop + poster)
node scripts/render-film.mjs all    # everything
```

`frames` and `loop` are resumable: they skip PNGs already on disk, so a
cancelled pass restarts where it stopped. **After changing a device's position
or the camera, delete `film/frames` and `film/frames-loop`** — a resumed pass
would mix two versions of the film.

## How it stays reproducible

The scene is a pure function of time. `FilmStage` exposes `window.__film(t)`,
which sets the scene to an exact time and resolves after two committed frames;
`film.html` disables CSS animation and transition entirely. The rig asks for
`t = 13.2083` and gets the same picture every run.

`src/film/FilmStage.tsx` holds the timeline:

- `SHOTS` — the camera. One entry per move.
- `LOOP_SHOTS` — the loop's camera, which returns to its own start.
- `LAPTOP` / `PHONE` / `DESK_Y` — world layout in frame pixels. `DESK_Y` is
  derived from the laptop, and `PHONE.top` is derived so both sit on the line.
- `flights` — when a payload crosses, and what it is.
- `CAPTIONS` — the lower-third lines and their windows.
- device state is derived from `t` near the bottom of the component.

Framing rule: wide beats stay at or below ~1.05 scale so both devices fit;
close beats push far enough that the other device is properly out of frame.
A shot where both are half cropped is the one composition that reads as an
accident.

## Where it is not finished

- **Voiceover** is the OS speech engine (Microsoft David). It is a timings
  reference, not a performance: replace it, keep the windows, re-run `audio`
  then `encode`. The hero on the site is muted, so none of this is load
  bearing for the landing page.
- **Materials** are CSS: gradients, one sheen per panel, contact shadows,
  mirrored chassis, blur for depth. Convincing, but there is no ray-traced
  reflection, refraction or true bokeh. Going further means a 3D render, which
  this machine cannot do — and a 3D render would no longer be the real UI.
- Artifacts (`film/frames`, `film/frames-loop`, `film/audio`, `film/out`) are
  gitignored. Only the rig, the scene, and the two web assets are versioned.
