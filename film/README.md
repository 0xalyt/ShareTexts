# The hero film

`sharetexts-hero-1080p.mp4` is rendered from the product itself, not from a 3D
scene: the surfaces in it are the same components the landing page renders
(`LaptopFrame`, `PhoneFrame`, `RoomWindow`, `PhoneScreen`), so every pixel of
interface is the real UI. There is no Blender on this machine and none is
needed for a cut — but it does mean the materials are CSS, not ray-traced.

## Render it

```bash
npm run dev -- --port 3010        # the rig renders from a running dev server
node scripts/render-film.mjs assets    # real landing screens → film/assets
node scripts/render-film.mjs probe     # eight stills to check framing
node scripts/render-film.mjs frames    # ~800 frames at 1920×1080
node scripts/render-film.mjs audio     # voiceover + music + sound design
node scripts/render-film.mjs encode    # → film/out/sharetexts-hero-1080p.mp4
```

`frames` is resumable: it skips PNGs already on disk, so a cancelled run can be
restarted. Roughly 3–6 minutes for the full sequence on this machine.

## How it stays reproducible

The scene is a pure function of time. `FilmStage` exposes `window.__film(t)`,
which sets the scene to an exact time and resolves after two committed frames;
`film.html` disables CSS animation and transition entirely. The rig asks for
`t = 13.2083` and gets the same picture every run, which is what makes a
33-second film re-cuttable instead of a screen recording of luck.

`src/film/FilmStage.tsx` holds the whole timeline:

- `SHOTS` — the camera. One entry per move: push-in, drift, pull-back.
- `LAPTOP` / `PHONE` — world layout, in frame coordinates (1920×1080).
- `FLIGHTS` — when a payload crosses, and in which direction.
- `CAPTIONS` — the lower-third lines and their windows.
- device state is derived from `t` near the bottom of the component.

## Where it is not finished

- **Voiceover** is the OS speech engine (Microsoft David) reading
  `film/audio/vo.txt`. It is a timings reference, not a performance: replace it
  with a human or a premium TTS voice, keep the same windows, and re-run
  `audio` then `encode`.
- **Materials** are CSS approximations — gradients, one blurred sheen for the
  desk, one grain layer. There is no true reflection, refraction or bokeh. A
  photoreal version needs a 3D render; this cut is honest about being a
  screen-accurate film rather than a photograph.
- Artifacts (`film/frames`, `film/audio`, `film/out`, `film/assets`) are
  gitignored. Only the rig and the scene are versioned.
