# Phase 0 baselines — design/apple-grade (measured 2026-10-19)

Measured against the production build served locally (`NODE_ENV=production PORT=3013 node dist/server.cjs`)
with `scripts/p0-baseline.mjs` (rerun: `node scripts/p0-baseline.mjs`).

## Core Web Vitals (390×844, local, unthrottled)

| Metric | Baseline | Budget (Phase 5) |
|---|---|---|
| LCP | **640 ms** | ≤ 2.0 s (Slow 4G + 4× CPU, Lighthouse CI) |
| CLS | **0.000** | ≤ 0.05 |
| INP | not yet instrumented | ≤ 150 ms (measured in Phase 5/7) |
| TBT | not yet instrumented | — |

Local numbers are unthrottled; the throttled Lighthouse baseline lands with the Phase 5 CI workflow.

## JavaScript (dist, gzip)

| Chunk | gzip | On critical path? |
|---|---|---|
| `index-*.js` (entry) | **276 KB** | yes |
| `vendor-motion-*.js` | 49 KB | yes (static import in `main.tsx`) |
| `vendor-icons-*.js` | 6 KB | yes |
| **Entry total** | **≈331 KB gz** | **budget: 110 KB gz** |
| `QRScanner-*.js` | 101 KB | split (verify it is intent-lazy) |
| `ChatView-*.js` | 33 KB | split |
| `Docs` / `Legal` | 12 / 3 KB | split |

Serving note: the local Node server sends JS **uncompressed** (390px load: ≈1.58 MB of JS
responses per page load, measured 3168 KB over two theme loads). Vercel's CDN gzips in
production, so the wire entry today is ≈331 KB gz. Compression on the Node path is a
Phase 5 item.

Entry contains `socket.io-client` (via `main.tsx` → `lib/socket` prewarm) and `motion`
(`MotionConfig` static import) — the two biggest levers for the 110 KB budget.

## Fonts

- **Zero webfont files shipped.** No `@font-face`, no Google Fonts link in `index.html` or `src/index.css`.
- Everything renders on the system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, …`);
  "Inter" only appears when installed locally. Phase 3 ships self-hosted Inter 4 variable
  (Latin woff2, `font-display: swap`, size-adjusted fallback) and strips the unused
  `fonts.googleapis.com` allowances from the CSP `style-src`/`font-src`.
- Boot shell (`index.html:183`) uses `-apple-system, BlinkMacSystemFont, sans-serif` — no Inter.

## Libraries / assets

| Item | Count | Note |
|---|---|---|
| Icon libraries | 2 | `@gravity-ui/icons` (17 files) + `lucide-react` → Phase 3: one |
| Emoji artwork | 1 | `react-apple-emojis` (Apple's artwork) → Phase 3: Noto subset |
| Theme switch | instant | `test:theme` green; no crossfade transition |
| `ads/` | 2 mp4s | unreferenced by any page — zero page cost |
| Package name | `react-example` | → `sharetexts` (Phase 1) |

## Screenshot matrix (landing, production build)

| Viewport | Light | Dark |
|---|---|---|
| 360×780 | `docs/audit/p0-landing-360x780-light.jpg` | `…-dark.jpg` |
| 390×844 | `docs/audit/p0-landing-390x844-light.jpg` | `…-dark.jpg` |
| 768×1024 | `docs/audit/p0-landing-768x1024-light.jpg` | `…−dark.jpg` |
| 1440×900 | `docs/audit/p0-landing-1440x900-light.jpg` | `…−dark.jpg` |

Recording: `docs/audit/p0-landing-demo.webm` (14 s, 1440×900 — covers >2 hero-demo loop cycles).
The Nearby→connect recording needs a two-peer session; captured with the existing
two-context probes when Phase 4 lands (CI artifact otherwise).

## Not measured yet (honest gaps)

- Time-to-connected (ws open → first data-channel byte): no instrumentation exists;
  Phase 5 adds it (cold vs warm, direct vs relay, Jio/Airtel).
- Throttled Lighthouse scores, real Redmi 9 numbers: Phase 5/7 (LHCI + chrome://inspect).
- Apple.com computed-style comparison: Phase 2 step 1 (recorded in `docs/design-tokens.md`).
