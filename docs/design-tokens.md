# Design tokens — Phase 2 (design/apple-grade)

The pinned palette from the approved brief, verified once against
apple.com as required, with every derived value and its math.

## 1. One-time apple.com verification (2026-10-19, Playwright, getComputedStyle)

| Surface | apple.com live | Brief pin | Delta | Verdict |
|---|---|---|---|---|
| body background | `rgb(255, 255, 255)` | `#fbfbfd` | ΔRGB 5/5/3 | Pin kept — apple.com uses pure white body with `#f5f5f7` section bands; `#fbfbfd` is apple's off-white section/page tone (used across product pages). Both are non-warm; difference imperceptible. |
| body color | `rgb(29, 29, 31)` | `#1d1d1f` | **exact match** | ✓ |
| font stack | `"SF Pro Text", "SF Pro Icons", …` | self-hosted Inter | n/a | Inter pinned by brief (SF Pro not licensable); Inter verified ≤1KB from system. |
| globalnav | `rgba(255,255,255,0.8)` frosted | 48px sticky header | n/a | Structure matches brief (frosted sticky bar). |

Section band on apple.com = `#f5f5f7` ✓ exact brief pin.

## 2. Pinned neutrals — LIGHT (all verified, no warm cast)

| Token | Value | Contrast check |
|---|---|---|
| `--color-bg` / `--color-apple-canvas` | `#fbfbfd` | page |
| band / `--color-bg-secondary` / `--st-tone-sunk` / parchment | `#f5f5f7` | apple.com's own band |
| surfaces / `--color-surface*` / `--st-tone-raised` / chrome | `#ffffff` | |
| `--color-text` / `--color-apple-ink` | `#1d1d1f` | 16.28:1 on `#fbfbfd` ✓ |
| `--color-text-secondary` / apple-ink-muted / eyebrow | `#6e6e73` | 4.91:1 on `#fbfbfd` ✓ |
| `--color-text-muted` | `#8e8e93` (decorative captions only, unchanged) | |
| `--color-border` | `rgba(0,0,0,.08)` (≈#e8e8ea solid kept where alpha breaks) | |

## 3. Pinned neutrals — DARK

| Token | Value | Contrast check |
|---|---|---|
| `--color-bg` | `#181818` | page (was #101012) |
| `--color-bg-secondary` / sunken / parchment / tone-sunk | `#141414` | |
| `--color-surface-elevated` / raised / tone-raised / cards | `#262626` | |
| `--color-border` (line) | `#333333` | |
| `--color-text` / ink | `#e4e4e4` | 13.97→(12.6):1 on `#181818` ✓ |
| `--color-text-secondary` / ink-2 | `#888888` | 5.01:1 on `#181818` ✓ |

## 4. Ember on light — derived darker shade (brief: ≥4.5:1)

Measured (WCAG math, verified by script):

| Candidate | as TEXT on `#fbfbfd` | white label ON it |
|---|---|---|
| `#f06413` (brand) | 3.11 ✗ | 3.21 ✗ |
| `#d9560e` | 3.84 ✗ | 3.97 ✗ |
| `#c25310` | 4.48 ✗ (marginal) | 4.63 ✓ |
| **`#c04b09`** | **4.78 ✓** | **4.94 ✓** |

**`--color-ember-ink: #c04b09`** — chosen: same hue family (19°), already the
keycap-edge tone in the palette (not a new muddy brown), passes BOTH
directions ≥4.5:1. Light-mode ember TEXT and light-mode ember BUTTON label
backing use this tone. Dark mode keeps bright ember (`#f06413`/`#fb7a2e`:
5.5:1 on `#181818` ✓).

**Design-owner conflict recorded:** `src/index.css` carries a note that the
owner rejected an earlier AA deepening (539b97c, "read muddy"). The current
approved brief explicitly requires ≥4.5:1 for text and buttons on light, so
the deepening is implemented as narrowly as possible: palette-native
`#c04b09` stops only (top stop `#c25310`), keycap structure unchanged,
dark CTA untouched. If the owner still rejects it, revert is one gradient
token (`--st-btn-primary-grad` light block).

## 5. Verification commands

```bash
npm run verify:neutrals   # OKLCH chroma ≤0.01 for all neutral tokens + warm-tint grep (new gate)
npm run test:theme        # light/dark token assertions (updated pins)
npm run verify:quality    # contrast matrix + named exceptions (updated)
```

## 6. Warm-tint audit scope

Every hex in `src/index.css` token blocks, `index.html` (theme-color,
boot shell, OG placeholders), `public/manifest.json`,
`public/og/*` generated plates, `src/lib/theme.ts`, guides
`_template.css` — brand/ember/azure/peach/honey/honey-gold are the
BRAND family (chroma > 0.01, exempt); every NEUTRAL must be chroma ≤ 0.01.
