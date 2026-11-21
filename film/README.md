# The hero film

## Current landing: the white-studio launch film

The landing uses `LaunchFilm.tsx` + `StudioScene.ts` (`film.html?mode=launch`), a 12.7 s
sequence inspired by [Grok Bot — Action Button](https://serenatan.org/launchvideo/#video-27),
inspected through Serena Launch MCP. This is an adaptation of the reference's
motion language, **not a pixel-identical clone**: ShareTexts' two-device file
transfer replaces its iPhone OS/Action Button interaction. No reference frames,
third-party logos, voice or audio are redistributed.

| Time | Composition |
| --- | --- |
| 0–1.25 s | Macro phone; separate metal case, bevel, glass, lens and undistorted display. |
| 1.25–3.72 s | One continuous camera dolly reveals the laptop; the file lifts from its actual screen position and arcs into the other display. |
| 3.72–5.55 s | Both screens show receipt, with a settled two-device hold. |
| 5.95–8.55 s | Masked “From one screen / to the other.” entrances. |
| 8.65–11.9 s | Official orange mark resolves into the ShareTexts lockup. |
| 11.9–12.7 s | Return to the identical opening camera and hardware pose, not a blank loop seam. |

V2 replaces the flat CSS hardware with original 3D geometry, a procedural
studio environment, physical materials, a keyboard/deck/hinge and soft shadows.
Three.js and its types are pinned to **0.180.0**, an established September 2025
release, as **devDependencies only**. `film.html` is not a production Vite entry;
the website ships a video, not WebGL. Check `npm run verify:bundle` after building
and confirm production JS has no `THREE.WebGLRenderer`/`PMREMGenerator` code.

Craft references consulted for this revision: [device frames](https://www.ui-skills.com/skills/ibelick/device-frames)
(separate screen/hardware, native ratios, restrained metal, no manufacturer marks),
[Laws of UX](https://www.userinterface.wiki/laws-of-ux) (one lead, fewer playback
choices, a 48 px target around the small control), [eases vs. springs](https://www.userinterface.wiki/to-spring-or-not-to-spring)
and [animation principles](https://www.userinterface.wiki/12-principles-of-animation)
(a predetermined film uses eases; anticipation, staging, arcs and causal receipt),
[Detail](https://detail.design/detail/smart-corner-morph-animation) (continuous
shape treatment), [word breaking](https://detail.design/detail/smarter-word-break)
(let translated controls wrap), and [Preet Suthar](https://preetsuthar.me/)
(restrained typography and resolved small details). Hardware is an unbranded
approximation, not a claim of manufacturer-accurate industrial design.

The device screens reuse `DemoScreen`, the existing localized product
illustration. This is a demonstration, not a live transfer or speed benchmark.
The public player has a localized text description; the exported film's copy
is English. All player and source-film strings exist in every shipped locale.

| Asset | Delivery |
| --- | --- |
| `public/film/sharetexts-launch-v2.mp4` | 1440×810, 60 fps, H.264, no audio; muted landing loop. |
| `public/film/sharetexts-launch-v2-full.mp4` | 1920×1080, 60 fps, H.264/AAC; deliberate playback with original synthesized sound. |
| `public/film/sharetexts-launch-v2-poster.jpg` | The handoff at 3.05 s; reduced-motion and Save-Data default. |

To reproduce, start `PORT=3010 npm run dev`, then run:

```sh
npx playwright install chrome  # once; system ffmpeg is also required
node scripts/render-launch-film.mjs probe
node scripts/render-launch-film.mjs render
```

One deterministic clock (`window.__film(t)`) owns transforms, easing and
screen state. Capture uses headless Chrome, 1080p screenshots and 60 fps.
The script builds an isolated authoring site under the ignored output folder
and serves it on a temporary loopback port. Dev-server HMR cannot reload a
partially captured sequence; the ordinary app build remains untouched.
The script first captures `DemoScreen` textures at 402×874 and 1512×982 points,
each at 2×, and records file-icon coordinates for the 3D handoff anchors. Device
and screen aspect ratios are preserved. The macro shot intentionally crops the
hardware; the settled pair is fully visible. No source screen content is stretched.
Frames, probes and the original synthesized PCM soundtrack stay in ignored
`film/out/launch-v2/`; only the delivery encodes and poster are committed.
The sound bed and tactile tones are generated locally without samples or a
third-party music license. The landing encode deliberately has no audio track.

`HeroLaunchFilm` mounts only in the active responsive slot. It loads no video
until visible, respects reduced motion and Save-Data, pauses off screen or in
a hidden tab, remembers manual pause, and supports a manual autoplay fallback.
An error leaves a meaningful still and the full-film link available.
The inline pause/resume control has a 36 px visual disc and a 48 px hit target;
full viewing and download are secondary actions below the frame. The previous
Dark mode keeps the film's white-studio art direction inside a matte charcoal
cinema surround with soft light spill; no inversion alters product UI or brand color.
v1 assets remain for cached pages and existing links. New names avoid the
seven-day `/film` asset cache serving the old cut after deployment.

## Archived desk-film rig

The earlier rig and assets remain reproducible for existing links:

| File | What it is | Where it goes |
| --- | --- | --- |
| `film/out/sharetexts-hero-1080p.mp4` | the 32.0 s film with sound (1920×1080, 24 fps) | anywhere that plays it deliberately — social, a launch post |
| `public/film/sharetexts-hero-v3.mp4` | the 15.0 s muted launch cut, 1920×1080, 30 fps | the landing hero |
| `public/film/sharetexts-hero-v3-poster.jpg` | frame 0 of the launch cut | the hero's poster, shown before playback and under reduced motion |

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

`?mode=brag` renders the launch cut inside `src/film/FilmStage.tsx` (`LAUNCH_SHOTS`). It is
the same set and the same real app as the 32 s film, cut like a launch film instead of a
walkthrough: seven shots, hard cuts, one idea per shot, and the product doing the talking.
There is no typography stage any more — the first attempt at this cut was giant words on a
still field, and it read as a deck, not a product.

| Time | Shot |
| --- | --- |
| 0.0–2.2 | **Hook.** Both screens lit on the desk: the room card with its QR and `482 916` on the laptop, the Nearby card on the phone. Frame 0 is the poster, so this frame is settled, not mid-move. |
| 2.2–4.3 | **The phone.** Cut in on the iPhone as it joins, types, and sends — the bubble leaves the composer. The phone sits right of centre: a 9:19.5 device cannot fill a 16:9 frame, so the blurred laptop holds the left column and the super sits on it. |
| 4.3–7.0 | **Arrival.** Cut wide as the packet crosses the desk and lands in the laptop's thread, with a receive pulse and a ring at the landing point. The camera pushes onto the thread. |
| 7.0–8.8 | **The photo.** `Above the clouds.jpg`, 2.4 MB, arrives whole — shot tight, with the laptop right of centre so the super sits in a dark column instead of on the UI. |
| 8.8–10.4 | **Back to the phone** for `Q3-budget.pdf`, in the same frame as the first phone shot. |
| 10.4–12.4 | **Saved.** The file's progress runs to *4.2 MB · Saved to Downloads* while the super makes the trust claim the picture has just proven. |
| 12.4–15.0 | **Lockup.** The camera gives the frame back and the mark, `Move anything between your devices.` and `sharetexts.online` land on the room. |

Four supers total, each in a reserved column or on the empty desk — never across the
product. Focus is a step per shot (1.7–2.1 px of blur on the device that is not the subject),
not a rack, because a lens still travelling when the picture cuts reads as a mistake. Cuts
land on 30 fps frame boundaries and the file ships silent: the hero is muted by policy, so
the story has to survive without sound.

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
budget: 15.000 s, 450 frames, silent. Poster is frame 0. **A re-cut gets a new
filename**: `/film` is served with a seven-day `max-age`, so shipping a new cut
under an old name leaves every returning visitor watching the old one.

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
- `LAUNCH_SHOTS` — the hero cut's seven shots; every entry's `a` is a cut frame.
- `LOOP_SHOTS` — the loop's camera, which returns to its own start.
- `LAPTOP` / `PHONE` / `DESK_Y` — world layout in frame pixels. `DESK_Y` is
  derived from the laptop, and `PHONE_TOP` is derived from `DESK_Y` and the
  phone's own height, so both stand on the line by construction rather than by
  matching numbers.
- `flights` — when a payload crosses, and what it is.
- `CAPTIONS` / `LAUNCH_CAPTIONS` — the lower-third lines and their windows.
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
