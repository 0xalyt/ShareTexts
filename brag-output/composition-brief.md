# Composition brief — ShareTexts launch cut

Deliverable: 1920×1080, 30 fps, 15.0 s, silent, seamless loop for the landing hero.
Source of truth: `src/film/BragStage.tsx` (rendered through `film.html?mode=brag`).

## Look

- Ink `#0B0A09`, cream `#F2E9DE`, ember `#f06413`, card `#141210`, one status green `#34c759`.
- Allo display at 700 / opsz 32 / −0.045 em tracking; Inter for UI text; 15 px labels at 0.22 em.
- One warm bloom per frame, 6% grain over everything, vignette at 52%.
- Persistent chrome: mark + wordmark top-left, six chapter labels top-right, URL and line
  bottom-left/right, separated by a 1 px 10% rule.

## Timing

| Beat | In | Out | Type | Motion |
|---|---|---|---|---|
| Hook | 0.00 | 2.60 | `Send it straight / to your other / device.` | settled at frame 0; packet crosses 0.35–2.15; 2.2% push |
| Link | 2.60 | 5.20 | `One code. / Two devices.` | cut; QR plate and six tiles rise; digits light 3.12–3.77; 1.4° plate rotation |
| Send | 5.20 | 7.80 | `Send anything.` | cut; title at 5.20; bubbles 5.44 / 5.82 / 6.20; each 18 px rise |
| File | 7.80 | 10.40 | `Files, byte for byte.` | cut; card rises 7.95; progress 8.15–9.25; `Saved` at 9.50 |
| Key | 10.40 | 12.80 | `Encrypted end to end.` | cut; URL rises 10.72; bracket 11.15; ciphertext line 11.30 |
| Outro | 12.80 | 15.00 | `Move anything between / your devices.` | cut; mark and lines rise 12.90–13.65; hold |

## Mechanics

- Pure function of time. `window.__film(t)` sets state and resolves after two committed frames.
- No CSS animation or transition inside `film.html`; every value is computed from `t`.
- Every scene cuts on a whole beat at 30 fps (78 / 156 / 234 / 312 / 384), so a 30 fps
  render lands the cut exactly on a frame boundary.
- Frame 0 is the poster: hook fully settled, mark, promise and URL visible. The loop restarts
  from it, so the poster is not a substituted frame.

## Sound

None. The hero is muted by policy (`HeroFilm` mounts `muted`, `playsInline`, `loop`) and the
file is encoded `-an`. Nothing in the cut depends on audio.

## What is deliberately absent

- No whole dashboard, no sidebar, no fake metrics, no stock footage.
- No claim that is not in the product: no account, no app, no install; six-digit room; QR;
  text/link/photo/file; byte-for-byte file; end-to-end encryption with the key in the fragment.
