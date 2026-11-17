# Design system pass — type, colour, sticky, density

Date 2026-11-17. Everything below was measured in Chromium against the running
app (`localhost:3110`), not estimated. Numbers that were not measured are not
written here.

## 1. Type scale

One face: **Allo** (variable, opsz 9–32, wght 100–900, SIL OFL). No second face —
the display and the body are the same family at different optical sizes, which is
the reason Allo was chosen over a display/body pairing.

| Role | Utility | Size / weight / tracking / leading | Used for |
|---|---|---|---|
| Display | `.st-display` | clamp 34–44 px · 700 · −0.036em · 1.03 | hero headline only |
| H2 | `.st-h2` | clamp 26–34 px · 680 · −0.033em · 1.1 | section headlines |
| H3 | `.st-h3` | 22 px · 650 · −0.025em · 1.2 | card and sheet titles |
| Title | `.st-title` | 16 px · 620 · −0.019em · 1.25 | dialog titles, device names |
| Section | `.st-section` | 13 px · 600 · −0.002em · 1.3 | list/section headers (sentence case) |
| Label | `.st-label` | 13 px · 600 · 0.002em · 1.3 | control labels |
| Body | `.st-body` | 16 px · 400 · −0.01em · **1.55** | the reading size, and form text |
| Support | `.st-support` | 13 px · 500 · 0.002em · 1.45 | secondary lines under a label |
| Meta | `.st-meta` | 12 px · 500 · 0.008em · 1.35 | timestamps, counts, hints |
| Numeric | `.st-numeric` | inherits size · tabular figures | every count, size, timer, code |
| Eyebrow | `.st-eyebrow` | 12 px · 600 · 0.06em | reserved; see the rule below |

**Roles are not free-floating sizes.** A new screen picks a role; it does not
pick `text-[14.5px]`. Two one-offs are refused by this rule and are being
retired: 14.5 px in the rail and 19 px in the room header.

**Line length:** body copy is capped by its container at 65–78 characters
(`max-w-[68ch]` on prose blocks, `max-w-3xl` in the thread). Nothing sets a
paragraph wider than 80ch.

**Tracked-out all-caps:** not used. The rail's "ROOMS" heading was 11 px
uppercase with 0.08em tracking — a designed shout over a list that already
exists. It is `.st-meta` sentence case now. `.st-eyebrow` stays in the system for
the one place that is genuinely a label, not a heading.

**Floor:** nothing that carries body meaning is under 12 px. The 8 px type in the
landing's device mock is inside an illustration of a phone, not readable copy.

## 2. Palette — the five that do the work

The product already has a palette; this names it, keeps it, and says what each
value is *for*. No cream-and-clay, no black-and-acid.

| Role | Light | Dark | Used for |
|---|---|---|---|
| Background | `#fbfbfd` | `#181818` | page canvas |
| Surface | `#ffffff` | `#232323` | cards, sheets, the raised layer |
| Text | `#1d1d1f` | `#f5f5f7` | body and headings |
| Muted | `#6e6e73` | `rgba(255,255,255,.55)` | meta, hints, secondary |
| Accent (ember) | `#f06413` | `#ff8a3d` | one action per screen, links |
| Danger | `#ff3b30` ink `#c22e24` | `#ff453a` ink `#ff7a72` | destructive only |

Success (`#34c759` / ink `#1d7a35`) and warning (`#ff9500` / ink `#9a5a00`) are
**status**, never brand. The accent is not allowed to mean "success", and success
is not allowed to be the accent.

## 3. Colour used for meaning

| Meaning | Hue family | Where |
|---|---|---|
| Primary action, links | ember / azure-400 in dark | one per view |
| Success | green, ink weight for text | connected dot, "delivered", "seen" |
| Warning | amber, ink weight for text | reconnecting, expiring items |
| Danger | red, ink weight for text | disconnect, unlink, delete |
| Neutral | ink / muted | everything structural |

A form error and a marketing highlight are never the same colour: errors are
`status-danger-ink`, highlights are `ember`. Both are text-weight tokens rather
than fill colours, so small type stays readable.

## 4. Contrast — measured, both themes

`scripts/contrast-audit.mjs` walks every visible text node, resolves the
background actually behind it (compositing alpha through ancestors), and applies
4.5:1 (normal) / 3:1 (large). Run against the landing page and a live room, light
and dark.

**Found — one failing pair, now fixed**

| Pair | Use | Measured | Fix |
|---|---|---|---|
| `#34c759` on `#fbfbfd`, 12 px | the room's connection word ("Same network") | **2.15:1** (needs 4.5) | token `status-success-ink` `#1d7a35` (dark: `#4fd071`) |

The same fill-colour-as-text mistake was in three message-state labels
("Delivered", "Seen") and is fixed the same way.

**After the fix: 0 pairs under the floor in light and in dark**, landing and room.
Muted grey `#6e6e73` at 13 px on `#fbfbfd` measures ≈ 4.9:1 and passes; it is not
darkened further, because the product's quiet grey is the point.

## 5. Sticky

One sticky header per screen. The app header and the page header now carry a
hairline (`rgba(0,0,0,.055)` / `rgba(255,255,255,.07)`) so content passing
underneath reads as "behind glass" rather than as a broken edge. No second sticky
bar was added; the room's own bar is part of the same sticky header, not a stack.
On a phone the header sits under the status bar via the page's own padding, and
the composer keeps its `env(safe-area-inset-bottom)`.

## 6. Density

**One density: comfortable.** There is no compact mode, so there is no compact
mode to meet the 44 px floor with — the choice that removes the risk is better
than the choice that guards it. Row heights in the room are 12 px meta under
16 px body with 10 px padding; the rail's rows are 44–56 px. If a compact mode is
ever wanted, it must keep ≥44 px targets and ≥13 px type, and this document is
where that is written down.

## 7. Tokens

Colour, type and motion tokens already live in `src/index.css` (`@theme`) and are
named for what they do (`--color-status-danger-ink`, `--st-ease-out`,
`--st-dur-quick`). The pass added one: `.st-numeric`. Motion values follow the
published curve set already in the file (`cubic-bezier(0.32, 0.72, 0, 1)` for
sheets, 180–300 ms for state changes, 0 ms under reduced motion) — no new motion
constants were invented.

## 8. What this pass did not do

Listed plainly, not as a deliverable:

- **Toasts** do not exist in the product (no toaster, no library). Building a
  toast system is a feature, not a pass.
- **Overlay audit** (sheet vs modal) — the app already uses `OverlaySheet` for
  long flows and `SlideToConfirm` for one destructive decision; no rewrite done.
- **Primary navigation redesign** — no changes made.
- **Landing hero, footer, section map** — untouched in this pass.
- **3D / canvas hero** — the landing's hero is a live device mock, not a 3D
  scene; nothing to profile.
- **Density specimens at 1280/390** — the screenshots in `audit/align/` and
  `audit/stress/` show the single shipped density at both widths.
