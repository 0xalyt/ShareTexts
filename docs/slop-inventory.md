# Slop inventory — Phase 0 (design/apple-grade)

Every template-looking element, its file, and the verdict. Default is KILL.
Legend: KILL = delete · REPLACE = keep the capability, replace the look · KEEP = fine as-is.

| # | Element | File(s) | Verdict | Notes |
|---|---------|---------|---------|-------|
| 1 | Announcement bar | `src/components/AnnouncementBar.tsx` | **KILL** | Zero mount sites — dead code. Delete file. |
| 2 | JS-swapped boot shell + "Still loading" (8s) | `index.html` (1 occurrence each) | **KILL** | Crawlers read it as page copy; replaced by prerendered HTML (Phase 5). |
| 3 | Warm decorative background primitives | `src/index.css` ~858–955 (`.st-dotgrid`, `.st-softspot`, `.st-diag`, `.st-horizon`, `.st-spotlight`) | **KILL** | Pattern/glow decoration; none of it communicates a product state. |
| 4 | Keycap press (3D bottom lip, shadow Y 4→1) | `src/components/TactileButton.tsx`, `--st-btn-primary-edge` in `src/index.css` | **REPLACE** | Button stays (it is the primary affordance); press becomes plain sink: scale .97 + tint, no lip. |
| 5 | 3D/keycap-styled secondary surfaces | `--st-btn-secondary-grad`, `st-*` tactile gradients | **REPLACE** | Flat surfaces + 1px line, per-token. |
| 6 | Emoji reactions via Apple artwork | `src/components/spaceui/EmojiReaction.tsx` (dep `react-apple-emojis`) | **REPLACE** | Feature stays (not deleting a feature); ships Unicode glyphs with a subset self-hosted Noto Color Emoji instead of Apple's artwork. Dependency removed. |
| 7 | Platform-logo marquee | `src/components/marketing/PlatformStrip.tsx` (`st-marquee`, mounted in `src/views/Docs.tsx`) | **REPLACE** | Static wrapped row of text labels; marquee CSS deleted. |
| 8 | Isometric/data-flow marketing illustrations | `src/components/marketing/DataFlow.tsx` (Docs), `src/components/DeviceLinkIllustration.tsx` (NearbyDevices, ChatView) | **KILL / REPLACE** | DataFlow: delete (Docs uses real steps/code). DeviceLinkIllustration: replaced by the real product state in the Phase 4 Nearby rebuild. |
| 9 | Glow / radar-overlay decoration | `src/components/NearbyDetectOverlay.tsx` | **REPLACE** | Becomes an honest scanning state in the Phase 4 state machine. |
| 10 | Hero fake-device demo | `src/components/HeroDeviceDemo.tsx`, `src/components/HeroTransferScene.tsx` (both mounted in `src/views/SingleScreenApp.tsx`) | **REPLACE** | Phase 4: demo rebuilt from the app's real components + real strings; no fake names/numbers. |
| 11 | Slide-to-confirm | `src/components/SlideToConfirm.tsx` (SingleScreenApp) | **REPLACE** | Confirm capability stays; visual becomes a plain control with 44px target. |
| 12 | Rating nudge on the landing | `src/components/spaceui/rating.tsx` (RateCard in SingleScreenApp) | **REPLACE** | Off the landing page; feedback stays reachable from settings, not mid-marketing-page. |
| 13 | Warm-era decorative palette tokens | `src/index.css` (`--iso-*` warm light values, ember-tinted shadows `rgba(240,100,19,…)` in `.st-band`) | **REPLACE** | Phase 2 true-neutral retune; brand orange only for brand/CTA. |
| 14 | Two icon libraries | `@gravity-ui/icons` (17 files) + `lucide-react` | **REPLACE** | Phase 3: lucide-react only, strokeWidth 1.5, gravity removed. |
| 15 | Install nudge | `src/components/InstallNudge.tsx` (App) | **KEEP** | Real PWA capability, quiet copy. Restyle only if Phase 2 contrast requires it. |
| 16 | Presence dock | `src/components/PresenceDock.tsx` | **KEEP** | Real device-presence state. |
| 17 | Surface grammar (`.st-card/.st-tile/.st-band/.st-chip`) | `src/index.css` | **KEEP** | One coherent tone system — this is the target, not slop. |
| 18 | `ads/` hero videos (16x9, 9x16 mp4) | `ads/` | **KEEP** | Not referenced by any page — offline posting assets. Zero CLS/INP cost (confirmed: no `src`/`index.html` references). |
| 19 | Borrowed UI libraries | Rare UI / OpenSourceUI / Great UI / UI Arc (README credits) | **KEEP? → AUDIT** | Phase 7 `license-checker`; components that survive the inventory keep only with license terms confirmed (SegmentedToggleButton = OpenSourceUI, used in SettingsOverlay). |

## Target
One system: pinned neutrals, one type scale, lucide only, real product states as the only illustration.
