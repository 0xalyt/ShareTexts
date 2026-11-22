# ShareTexts product film

## V5 authoring (review required before release)

The 16.8-second light/dark film uses original Blender 4.5 LTS hardware, an offline Three.js physical-material/HDRI stage, and device-resolution recordings of two real ShareTexts clients connected through a local Worker. Text/files actually cross the room; the receiver copies, saves, opens the photo and plays the received video. Film time is edited for clarity, **not a production transfer-speed benchmark**. Only H.264 movies and JPEG posters ship; no renderer, GLB, HDRI, fixtures or native captures enter production JavaScript.

| Time | Story |
| --- | --- |
| 0–0.8 s | Complete phone and laptop, safe margins, “Text. Files. Videos.” |
| 0.8–4.4 s | Compose/send text and a link; physical handoff; receiver arrives/copies. |
| 4.4–8 s | Choose/send an archive; handoff; receive/save confirmation. |
| 8–9 s | Open the received photo in the real viewer. |
| 9–13.8 s | Choose/send video; handoff; receive and play with native controls. |
| 13.8–16.8 s | Moving wide resolution, ShareTexts signature, exact opening pose. |

Dark is separately lit graphite hardware, genuine dark product UI and a #181818 studio, not an inversion or brightness filter. Theme variants share camera geometry/timing. Type matches full Allo (not Friendly): ROND 0, display opsz 32, calt disabled, opener/brand tracking -0.015em and chapter tracking -0.012em.

## Reproduce

Requires Node/project dev dependencies, Playwright Chrome, ffmpeg and [Blender 4.5 LTS](https://download.blender.org/release/Blender4.5/) (authored with 4.5.14 LTS; verify the official checksum). Start a local Worker on 8787 and an app on 3044 configured with `VITE_SIGNALING_URL=http://localhost:8787`; `FILM_UI_BASE_URL` overrides the app URL. Never use the production Worker for capture. A second app checkout belongs **outside** this repository: nesting another TypeScript project in `film/out` can pollute the root typecheck.

```sh
npx playwright install chrome
node scripts/capture-launch-ui.mjs
FILM_THEME=dark node scripts/capture-launch-ui.mjs
FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs probe
FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs render
FILM_THEME=dark FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs probe
FILM_THEME=dark FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs render
```

`FILM_FONT_FILE` can select a local full Allo variable file; the default is `public/fonts/AlloVariable.woff2`. Native capture records actual actions, screen anchors and high-resolution snapshots, with real photo-viewer and video-playback holds. It verifies the received video advances. `native-ui.json` captureVersion 3 rejects earlier incomplete takes. Snapshot cadence preserves sharp type; the **same transferred video payload** is recomposited at source cadence and its real playback time, feathering into the genuinely captured native controls. No transport/chat state is mocked.

The renderer exports Blender `studio.glb` in model-only mode and builds an isolated authoring site under ignored `film/out/launch-v5-{light,dark}` so HMR cannot interrupt capture. UI is unlit on LCD meshes to preserve exact colors. One deterministic `window.__film(t)` owns camera cuts/moves, packet arcs, chapter type and the ending. Shadow maps are static because hardware is stationary; decoded-image caching is bounded. `probe` emits key story frames/timings. `FILM_BENCH=1` samples adjacent opening frames for performance diagnosis. None of these intermediates ship.

## Delivery

Families are `public/film/sharetexts-launch-v5-{light,dark}.mp4`, `-full.mp4` and `-poster.jpg`. Muted hero exports are 1440×810/60 fps H.264/yuv420p with fast-start; full exports are 1920×1080 H.264/AAC with an original locally synthesized score. No borrowed audio. Posters show both complete devices in the real opening; final capture equals frame zero. Encoded copy is English; player controls and the hidden description remain localized.

Keep the existing player contract: visibility-gated loading, muted inline looping, offscreen/hidden-document pause, explicit pause persistence, meaningful error poster, saved/OS theme selection and phase-preserving remount. Reduced-motion/Save-Data disable autoplay while explicit Play remains available. Preserve 16:9 geometry, hidden description and forgiving play/pause target. Surrounding layout/control dock belongs to the landing owner. Run local build, bundle isolation, media and player checks before release; do not bypass required gates.

## Sources

- Hardware and packet artwork are original; no manufacturer models/artwork are redistributed.
- [Poly Haven Studio Small 08](https://polyhaven.com/a/studio_small_08), [CC0](https://polyhaven.com/license). Place `studio_small_08_1k.hdr` in `film/out`; verified source MD5 `de3ba64222895aca876b1d1c2e0cf81a`.
- NASA, *Earth Views from the ISS*, media ID `NHQ_2019_0626_Earth Views from the ISS`: [original collection](https://images-assets.nasa.gov/video/NHQ_2019_0626_Earth%20Views%20from%20the%20ISS/collection.json), [media-use guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). Use an Earth-only five-second excerpt with original audio removed, a derived still and a ZIP containing it. In `film/out/fixtures`, name them `Earth — NASA.mp4`, `Earth — NASA.jpg` and `Earth photos.zip`. NASA is credited in visible filenames/source imagery and does not endorse ShareTexts.
- Craft: [Serena-inspected launch reference](https://x.com/bot/status/2112252507762368684), [device frames](https://www.ui-skills.com/skills/ibelick/device-frames), [animation principles](https://www.userinterface.wiki/12-principles-of-animation), [Detail](https://detail.design/), Preet Suthar on [frame budgets](https://preetsuthar.me/writing/every-frame-has-16ms), [springs](https://preetsuthar.me/writing/what-a-spring-actually-is) and [shape joining](https://preetsuthar.me/writing/how-shapes-melt-into-each-other). Reference footage is not redistributed.

**Review gate:** V4 was rejected and must not ship. Send V5 movies/contact sheets for acceptance before a PR or changing `src/lib/heroFilmAssets.ts` to this family. Keep preload/player poster equality, matching theme families, codec/duration checks and the dev-only bundle boundary.
