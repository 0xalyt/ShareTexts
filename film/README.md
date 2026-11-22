# ShareTexts product film

## V6 reference-inspired edit

The 24-second editorial cut uses the owner's Fastlane *Claude for Ads* reference
for close-up UI staging, layered surfaces, object-preserving transitions and the
central-device carousel. It does not copy its brand, footage or story. The film
opens with a photo crossing from phone to laptop, shows actual short-code
pairing, then native text/copy, ZIP/download, photo receipt/viewer and video
playback before a mixed-content carousel and ShareTexts lockup.

`src/film/ReferenceFilm.tsx` and `reference-film.css` are offline authoring only,
selected by `film.html?mode=reference`. Every frame is a deterministic
`window.__film(t)` call. Native captureVersion 4 checkpoint sources come from
the V5 local-Worker capture below; pairing panels are an additional capture of
two independent real clients. Text is authored in English; the existing localized
player description and controls remain unchanged. No new dependencies or public
renderer code are required.

After capturing both V5 theme sources and placing the NASA fixtures below:

```sh
node scripts/capture-reference-pairing.mjs
node scripts/render-reference-film.mjs probe
node scripts/render-reference-film.mjs render
FILM_THEME=dark node scripts/render-reference-film.mjs render
FILM_FRAMING=phone node scripts/render-reference-film.mjs render
FILM_THEME=dark FILM_FRAMING=phone node scripts/render-reference-film.mjs render
```

The renderer builds an isolated authoring site, emits keyframe JPEG probes and
1920×1080/60 fps source frames (1440×1080 for the independently composed phone
cut), then exports `sharetexts-reference-v6-{light,dark}` families. Inline H.264
movies are 1440×810 desktop / 960×720 phone, two-pass 900 kbps, yuv420p/bt709,
fast-start and muted. Each stays under 3 MB; opening-frame JPEG posters stay
under 150 KB. Desktop `-full.mp4` is the source-resolution optional export with
an original locally synthesized score; it is never preloaded. All four cuts
share the same timing and semantic native states, not capture wall-clock times.
The received video payload is recomposited in its measured native screen bounds.
Film timing is editorial, not a transfer-speed benchmark.
`FILM_RANGE=10.25:11.56` recaptures only that bounded change before re-encoding;
use it only with existing frames from the same composition, otherwise render in
full. `FILM_FPS` supports 24/30 fps previews; release exports default to 60 fps.

The requested [VidScribe skill](https://github.com/SamuelZ12/vidscribe) was
installed for reference inspection. Its runtime targets macOS; on this Linux
authoring machine ffmpeg frame extraction was used instead. The owner's
[Fastlane reference](https://x.com/UseFastlane/status/2116024172430156062) is not
redistributed. NASA fixture attribution and the existing player/release gates
below also apply to V6.

## V5 authoring (review required before release)

The 16.8-second light/dark film uses original Blender 4.5 LTS hardware, an offline Three.js physical-material/HDRI stage, and device-resolution recordings of two real ShareTexts clients connected through a local Worker. Text/files actually cross the room; the receiver copies, saves, opens the photo and plays the received video. Film time is edited for clarity, **not a production transfer-speed benchmark**. Only H.264 movies and JPEG posters ship; no renderer, GLB, HDRI, fixtures or native captures enter production JavaScript.

| Time | Story |
| --- | --- |
| 0–0.8 s | Complete phone and laptop, safe margins, “Text. Files. Videos.” |
| 0.8–4.4 s | Compose/send text and a link; physical handoff; receiver arrives/copies. |
| 4.4–7.6 s | Choose/send an archive; handoff; receive/download confirmation. |
| 7.6–9.35 s | A separate photo arrives, then opens in the real viewer. |
| 9.35–13.8 s | Choose/send video; handoff; receive and play with native controls. |
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
FILM_FRAMING=phone FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs render
FILM_THEME=dark FILM_FRAMING=phone FILM_BLENDER=/path/to/blender node scripts/render-launch-film.mjs render
```

`FILM_FONT_FILE` can select a local full Allo variable file; the default is `public/fonts/AlloVariable.woff2`. Native capture records actual actions, screen anchors and high-resolution checkpoints, with separate photo-receipt/viewer states and real video-playback holds. It verifies the download event and that the received video advances. `native-ui.json` captureVersion 4 rejects earlier incomplete takes. The editor keys both themes to verified outcomes rather than sparse wall-clock samples. The **same transferred video payload** is recomposited at source cadence and its real playback time, feathering into the genuinely captured native controls. No transport/chat state is mocked. Capture uses the in-app owner's final received-file component: primary **Download** first, then responsive **Save item** and **Share** controls (icon-only below `sm`, with accessible names retained). Download confirmation is the real check/active state. A single staged item reads “1 attached”.

The renderer exports Blender `studio.glb` in model-only mode and builds an isolated authoring site under ignored `film/out/launch-v5-{light,dark}` so HMR cannot interrupt capture. UI is unlit on LCD meshes to preserve exact colors. One deterministic `window.__film(t)` owns camera cuts/moves, packet arcs, chapter type and the ending. Shadow maps are static because hardware is stationary; decoded-image caching is bounded. `probe` emits key story frames/timings. `FILM_BENCH=1` samples adjacent opening frames for performance diagnosis. None of these intermediates ship.

## Delivery

Families are `public/film/sharetexts-launch-v5-{light,dark}.mp4`, `-full.mp4` and `-poster.jpg`. Muted desktop exports are 1440×810/60 fps; `-mobile.mp4` and `-mobile-poster.jpg` use 960×720, a closer 4:3 camera, larger native UI close-ups and the exact same 16.8-second timeline. This is a separately composed phone cut, not a CSS crop that hides controls. Both use H.264/yuv420p and fast-start. Full downloadable exports stay 1920×1080 H.264/AAC with an original locally synthesized score. No borrowed audio. Posters show both complete devices in the real opening; final capture equals frame zero. Encoded copy is English; player controls and the hidden description remain localized.

Keep the existing player contract: visibility-gated loading, muted inline looping, offscreen/hidden-document pause, explicit pause persistence, meaningful error poster, saved/OS theme selection and phase-preserving remount. Reduced-motion/Save-Data disable autoplay while explicit Play remains available. Below 640px the picture and preload use the 4:3 phone family; wider screens retain 16:9. Theme/framing changes preserve phase and the visitor's paused choice. The localized description stays hidden; the 44px phone pause target stays outside the picture. Surrounding page layout/control dock otherwise stays unchanged. Run local build, bundle isolation, media and player checks before release; do not bypass required gates.

The cinematic hero budget is **< 3,000,000 bytes per inline MP4**, with each poster **<= 150,000 bytes** (DESIGN.md §20b). `npm run verify:bundle` checks every selectable phone/desktop and light/dark pair in the built output. Only one family is selected on a cold visit; full/audio downloads are never preloaded. The separate short feature-loop limit (six seconds and 1.2 MiB combined) does not apply to this film.

## Sources

- Hardware and packet artwork are original; no manufacturer models/artwork are redistributed.
- [Poly Haven Studio Small 08](https://polyhaven.com/a/studio_small_08), [CC0](https://polyhaven.com/license). Place `studio_small_08_1k.hdr` in `film/out`; verified source MD5 `de3ba64222895aca876b1d1c2e0cf81a`.
- NASA, *Earth Views from the ISS*, media ID `NHQ_2019_0626_Earth Views from the ISS`: [original collection](https://images-assets.nasa.gov/video/NHQ_2019_0626_Earth%20Views%20from%20the%20ISS/collection.json), [media-use guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). Use an Earth-only five-second excerpt with original audio removed, a derived still and a ZIP containing it. In `film/out/fixtures`, name them `Earth — NASA.mp4`, `Earth — NASA.jpg` and `Earth photos.zip`. NASA is credited in visible filenames/source imagery and does not endorse ShareTexts.
- Craft: [Serena-inspected launch reference](https://x.com/bot/status/2112252507762368684), [device frames](https://www.ui-skills.com/skills/ibelick/device-frames), [animation principles](https://www.userinterface.wiki/12-principles-of-animation), [Detail](https://detail.design/), Preet Suthar on [frame budgets](https://preetsuthar.me/writing/every-frame-has-16ms), [springs](https://preetsuthar.me/writing/what-a-spring-actually-is) and [shape joining](https://preetsuthar.me/writing/how-shapes-melt-into-each-other). Reference footage is not redistributed.

**Release gate:** V4 was rejected and must not ship. Review V5 at full speed and send decoded contact sheets before release. Verify distinct download/bookmark actions, separate photo receipt, theme-equivalent states, fixed movie-space cursor size, visible dark hardware and readable copy confirmation. Keep preload/player poster equality, matching theme families, codec/duration checks and the dev-only bundle boundary. Run the local build/player gates and handle Devin Review before merging.
