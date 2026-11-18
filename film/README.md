# The hero film

Two cuts come out of this rig:

| File | What it is | Where it goes |
| --- | --- | --- |
| `film/out/sharetexts-hero-1080p.mp4` | the 32.0 s film with sound (1920×1080, 24 fps) | anywhere that plays it deliberately — social, a launch post |
| `public/film/sharetexts-hero-v2.mp4` | the 15.0 s muted launch cut, 1920×1080, 30 fps | the landing hero |
| `public/film/sharetexts-hero-v2-poster.jpg` | frame 0 of the launch cut | the hero's poster, shown before playback and under reduced motion |

The picture is the product itself: `LaptopApp` and `PhoneApp` in
`src/film/FilmUI.tsx` are the real room/connect screens — the QR plate, the
six-digit code in two groups of three, the countdown, the this ⇄ partner
header with its Direct badge, the composer, the received thread — drawn at
native laptop and native phone density. Nothing in the film is invented UI.

The set around them is CSS, not a 3D render — but the *materials* are not
CSS guesses. `scripts/make-film-textures.mjs` draws two textures once and
writes them to `public/film/tex/`: an oak board (long wandering grain, pores
that catch light, colour drift across the plank) and a brushed aluminium that
is blended into the laptop lid, deck and phone body at soft-light. The screen
glass carries a reflected window pane and a bright line where it meets the
bezel. Light is a room: warm key from upper left, cool fill from the right,
spill from both panels onto the wood, contact shadows, a mirrored chassis on
the surface, bokeh behind, then vignette + bloom + grain.

## Shot list (32.0 s)

| Time | Shot |
| --- | --- |
| 0.0–4.0 | Establish. Both devices on the lit oak, ShareTexts already open: the room card with QR + `482 916` on the laptop, the Nearby card on the phone. A push so slow you notice it only at the cut. |
| 4.0–7.2 | Connect. Drift onto the phone; Nearby appears at 4.2 with the laptop listed as *Your iPhone · Same network · 1 device*. |
| 7.2–8.6 | One tap. Connect presses (7.2–7.6); the laptop's header flips to Connecting… then Direct at 8.55, the phone joins at 8.95. |
| 8.6–11.6 | Two-shot. Pull back while both ends light up; the phone starts typing at 11.2. |
| 11.6–14.0 | Text. Send at 13.2, the payload crosses the desk, lands at 14.0 with a receive pulse. |
| 14.0–17.1 | Photo. Attachment appears at 15.5, sends at 16.25, the photo card lands at 17.1. |
| 17.1–21.4 | File. `Q3-budget.pdf` attaches at 19.3, sends at 20.15, lands at 20.9, progress runs to Saved. |
| 21.4–24.0 | Hold on the laptop: three payloads in the thread. |
| 24.0–26.3 | Pull back to the whole desk. |
| 26.4–32.0 | End card: logo, "Move anything between your devices.", sharetexts.online. |

Captions are one line per beat (muted-friendly): *No app. No account.* ·
*One tap to connect.* · *Text.* · *Photos.* · *Files.* · *Encrypted. Nothing
is kept.*

## The launch cut (15.0 s, the hero)

`?mode=brag` renders `src/film/BragStage.tsx`: six beats following ONE photograph from a
phone to a laptop. It is not the desk shot and it is not a setup guide: the code is one
sentence inside beat 3, the pitch is what the viewer gets. The plan and the article notes
are in `brag-output/relaunch-plan.md`.

| Time | Beat |
| --- | --- |
| 0.0–2.7 | **Promise.** `Phone to laptop. Nothing in between.` The photograph leaves the phone and crosses to the laptop. Settled at frame 0, because frame 0 is the poster. |
| 2.7–5.4 | **Why better.** Three routes struck through — email, drive, chat — then `ShareTexts doesn’t.` |
| 5.4–8.1 | **The moment.** The same photograph lands full-bleed on the laptop; light sweeps it and `Saved on this device` appears. |
| 8.1–10.8 | **Anything.** Text, link and a 24.3 MB file arrive as three cards; the file completes. |
| 10.8–13.2 | **Private.** `Encrypted end to end.` with the fragment-key URL and the lock that sentence is about. |
| 13.2–15.0 | **Lockup.** Mark, `Move anything between your devices.`, the URL, `Free. No account.` |

Cuts are hard and land on 30 fps frame boundaries; the chrome is a mark, a URL and one 3 px
ember progress line, identical in every frame. Frame 0 is the strongest settled frame, so the
poster is the true first frame rather than a substituted one. The file ships silent: the hero
is muted by policy and the cut is built to stand up without sound.

> The 10.0 s desk loop below is still in the rig (`?mode=loop`) but no longer ships as the
> hero. Its camera positions belong to the 10 s cut and are unrelated to the launch cut.

## The loop (10.0 s, retired from the hero)

`?mode=loop` renders a self-contained version of the same set: both devices
already connected with all three payloads in the thread, one text packet
crossing at 3.0–4.4 s. It is cut as four beats with holds, not as a drift:

| Time | Beat |
| --- | --- |
| 0.0–3.0 | Establish. A slow push in on the whole set; the lens settles on the laptop. |
| 3.0–5.0 | The send. The rack pulls through to the phone as the card leaves it; the camera follows a hair left. |
| 5.0–7.2 | The arrival. Focus returns to the laptop thread as the card lands, with a ring leaving the landing point, a four-ghost trail behind the card and a lit edge along its direction of travel. |
| 7.2–10.0 | Settle home to frame 0's camera, exactly. |

One studio light move runs across the set (5.0–9.3 s), windowed to zero at both
ends, so the aluminium and the desk take a highlight without the loop showing a
seam. Focus, exposure and UI state are identical at t=0 and t=10; nothing
persists across the seam, which is why it can loop forever.

The set was reframed with this cut: both devices fill the frame (196–1604 px of
a 1920 px stage), the phone overlaps the laptop by 96 px and casts a shadow onto
it, both bottoms sit on `DESK_Y` by construction, and the desk's cream seam line
— a 12 px band at 0.12 alpha that read as a pasted rectangle — is a wide haze.

## Render it

```bash
npm run dev -- --port 3010          # the rig renders from a running dev server
node scripts/render-film.mjs probe  # 13 stills to check framing and light
node scripts/render-film.mjs probe-brag  # 18 stills for the launch cut, both sides of every cut
node scripts/render-film.mjs brag   # 450 frames → film/frames-brag (FPS=30)
node scripts/render-film.mjs bragweb # → public/film (launch cut + poster)
node scripts/render-film.mjs frames # 816 frames → film/frames
node scripts/render-film.mjs loop   # 240 frames → film/frames-loop
node scripts/render-film.mjs audio  # voiceover + music + sound design
node scripts/render-film.mjs encode # → film/out/sharetexts-hero-1080p.mp4
node scripts/render-film.mjs web    # → public/film (loop + poster)
node scripts/render-film.mjs all    # everything
```

`bragweb` reads the frame count and derives 30 fps from the 15 s cut, so it no
longer inherits `FPS` from the shell (`FPS=24` re-timed it to 18.75 s). It
encodes at CRF 27 to keep the hero inside DESIGN §20b's 1.2 MB landing-media
budget: 918,008 B, 15.000 s, 450 frames, silent. Poster is frame 0.

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
  derived from the laptop, and `PHONE_TOP` is derived from `DESK_Y` and the
  phone's own height, so both stand on the line by construction rather than by
  matching numbers.
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
