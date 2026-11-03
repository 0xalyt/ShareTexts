# Design audit — measured against the design skills

Two skills were installed from `elayadesign/ai-design-skills` (`figma-designer`,
`landing-page-design`) and used as an **audit lens** over the existing product,
not as a replacement for this project's own design kit (`APPLE-DNA.md`,
`DESIGN.md`, `INTERACTION-MOTION.md`). Where the two disagree, the disagreement
is recorded below with a reason — a rule that is wrong for this product is
worth naming, not silently obeying or silently ignoring.

The machinery is `scripts/audit-design.mjs`: it walks the real surfaces in a
real browser and counts the rule violations a machine can actually check.

```
node scripts/audit-design.mjs        # dev server on :3010
```

It fails the build only on the objectively broken classes — horizontal
overflow at 390px, dead links (`href="#"`), images without `alt` — and reports
the rest as counts with examples, because "553 off-scale font sizes" is a
design decision to make, not a gate to fail.

## What was measured, and the state after this pass

| Surface | tiny text | tap targets < 44 | one-side borders | nested radius | overflow | dead links | img no alt |
|---|---|---|---|---|---|---|---|
| Home / hero | 0 | 9 → **2** | 0 | 0 | none | 0 | 0 |
| Send | 0 | 3 → **0** | 0 | 0 | none | 0 | 0 |
| Receive | 0 | **0** | 0 | 0 | none | 0 | 0 |
| Room (paired) | 0 | 6 → **3** | 0 | 0 | none | 0 | 0 |
| Settings sheet | 0 | 21 → **4** | 0 | 0 | none | 0 | 0 |
| Docs | 0 | 24 → **3** | 0 | 0 | none | 0 | 0 |
| Privacy / Terms | 0 | 5 → **2** | 0 | 0 | none | 0 | 0 |

Text contrast: a separate probe (`audit/tmp/probe-contrast.mjs`) resolved every
leaf text node on Home against its composited background and found **0 runs
below WCAG AA** (4.5:1 body, 3:1 large). `check-contrast` already covers the
other surfaces; `verify-axe` is 0 serious/critical/moderate across 8 surfaces.

## Fixed in this pass

1. **Tap targets below the 44px floor** (the largest real defect found).
   - `.segmented` — the Send Code/QR/Link control and every other segmented
     control — was **38px** tall. Now 44.
   - Settings theme pills 32 → 44; the editable device-name row was a 23px
     tall target. Now 44. Appearance rating stars 40 → 44, and the two
     quiet Text buttons under them 40 → 44.
   - Docs section pills, the app-shell footer nav (36 → 44), `SiteFooter`
     links (40 → 44), the brand lockup link (40 → 44), back arrows on every
     non-room page (40 → 44), chat suggestion chips (36 → 44), the retry
     button in `SystemAlert`, the nearby-send pill, and the Space action row.
   - The audit found these by measuring, not by reading class names: the
     36/38/40 values were invisible in review and obvious in a hit-area map.

2. **A decorative-art exemption for the audit.** The 8px "9:41" and 7.5px
   labels inside the hero's phone mock are a *picture of a phone*, not
   interface text; they sit under `aria-hidden="true"` and are excluded the
   same way the sr-only skip link is. Without that rule the harness would
   have pushed a real product change (inflating illustration type) for a
   false positive.

## Deliberate divergences from the skills (and why)

| Skill rule | Here | Why |
|---|---|---|
| "Never use Inter" | Inter throughout | The product's type system is Inter, self-hosted, subset, and gated by `measure-fonts.mjs`, which fails if a glyph renders as a fallback. Swapping the family is a brand decision for the owner, not an audit outcome. |
| "No background gradients; surfaces are flat" | Glass surfaces, `dot-bg` texture, device-mock gradients | The app's material language is iOS glass (`APPLE-DNA.md`). The measured gradients are the device illustration and a radial dot texture, not decorative page backgrounds. |
| Tailwind type scale only | 553 `text-[Npx]` utilities, mostly 12/13/16/17 | The scale is Apple's, not Tailwind's: 17 body, 15 subhead, 13 footnote, 11 caption. Snapping 553 sites to 12/14/16 would change the product's typographic voice and line heights across every screen. Recorded, not changed. |
| "Touch targets ≥ 44" | Applied to controls; iOS switches stay 56×26 | The switch's *visible* pill is iOS-standard, but its hit area is a padded 70×40 wrapper (`StandardSwitch`). Same reasoning for the room header pills at 40px: a 44px header row would visibly change the room's chrome height. |
| "No cards with a border on one side" | 0 findings | Already clean. |
| "Nested radius = outer − gap" | 0 findings | Already clean. |
| "Hero heading gradient" | Flat ink heading | The hero is the *app*, and a gradient headline over a live input would read as marketing chrome on a tool. Existing decision, kept. |

## Still open (honest list)

- **Room header targets at 40px** (device pill, Disconnect, recipient chip).
  Raising them means raising the room header, which is a layout change to the
  one screen this project deliberately freezes between phases. Left as is,
  listed here so it is a decision and not an oversight.
- **Docs mobile pill strip** scrolls horizontally at 390px by design, with an
  edge fade; the third pill clips mid-word at rest. Not page overflow, but a
  first-time reader may not realise the strip scrolls.
- **Off-scale type** is untouched by design (above).
- The skills' conversion/landing-page rules (offer, CTA hierarchy, FAQ,
  tagline reveal) do not apply to the app shell; they apply to the marketing
  pages under `public/`, which were not in this pass's scope.
