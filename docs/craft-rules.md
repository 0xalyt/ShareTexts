# Craft rules — what was adopted, and where it lives in the code

This file exists because "install these skills" is only worth anything if the
rules land in the product. Each line names a rule, the source it came from, and
the code that now enforces it. Anything that did not land is in the last
section, with the reason.

Reference repositories were cloned to `agent/skills/` (git-ignored — they are
reference material, not shipped code) and read from there.

## Typography — Allo, used on purpose

Allo is variable in **opsz 9–32** and **wght 100–900** with `ROND` fixed at 50
in the Friendly build. Its feature set, read out of the shipped file
(`GSUB` tags `calt case ccmp cv01–cv05 dnom frac liga numr ss01–ss03 subs sups
tnum zero`), is what made the following possible.

| What | Where | Why |
|---|---|---|
| True obliques (`AlloOblique.woff2`, `AlloSemiBoldOblique.woff2`, `italicAngle −9°`) | `src/index.css` `@font-face` | The editor has an italic action. Without an italic face the browser shears the roman — a fake the eye reads as "cheap". |
| `font-synthesis-style: none` | `src/index.css` html rule | Now that a real oblique exists, synthesising one would be a silent fallback to the worse rendering. |
| `opsz 32` on `.st-display`, `.st-h2`, `.st-h3` | `src/index.css` | The display drawing is tighter with stronger corrections; `clamp()` can land under 32 px and auto-sizing would then hand a headline the text drawing. |
| `opsz 11` on `.st-meta` | `src/index.css` | Allo's named Small end. 12 px meta is where the text drawing's spacing is too tight. |
| `.st-verbatim` (calt off, ligatures off) on message bodies, image captions and the composer | `MessageCard.tsx`, `ChatView.tsx` | **This is the correctness fix of the pass.** `calt` turns a typed `->` into an arrow and raises brackets beside figures. In a product whose whole job is carrying someone's characters, a rendering that disagrees with the clipboard is a bug. |
| `.st-code` (tabular + `zero` slashed + `ss02`) on the pairing code and OTP slots | `SendScreen.tsx`, `spaceui/OtpInput.tsx` | 0 and O are the same character at 44 px bold. The slashed zero is the disambiguation Allo ships for exactly this. |
| `.st-numeric` | `src/index.css` | Counts, sizes and timers must not reflow when a digit changes. |
| Script-scoped stacks for `ar`, `hi`, `ja`, `zh-Hans`, `zh-Hant` | `src/index.css` `html:lang(…)` | Allo has 606 glyphs: Latin only. Four of our eleven locales are not Latin, so those lines were rendering kanji from one family and Latin from another. Each script now leads with a face that has the whole line. |

Verified by `scripts/verify-allo.mjs` (9/9): roman and oblique load, opsz is set
on the ramp, synthesis is off, the code field carries `zero`, and a bubble
containing `a -> b (2) ffi 10:05` keeps `calt 0` and `no-contextual`.

## Interface details

| Rule | Source | Where |
|---|---|---|
| Scale `0.96` on press, one value everywhere | make-interfaces-feel-better §12 | 55 `active:scale-[0.97]` normalised to `0.96` across 23 files |
| Never `transition: all` — name the properties | §14 | All 15 occurrences replaced with `transition-[color,background-color,border-color,box-shadow,transform,opacity]` |
| Tabular figures for anything that updates | §9 | `.st-numeric`, `.st-code`, room header |
| `text-wrap: pretty` on body, `balance` on headings | §10 | `.st-body`, existing `.st-display/.st-h2/.st-h3` |
| Image outline: pure black/white at 10%, never a tinted neutral | §11 | `st-img-edge`, already in place |
| 44 px touch floor, 40 px in dense desktop rows | §16 | `min-h-[44px]` rows; the desktop rail's 40 px is documented in `docs/redesign/stress-pass.md` |
| Motion never the only feedback | §19 | status colour + word + icon, not animation alone |

## The article's list

| Item | State |
|---|---|
| Onboarding | Already a single choice (Send / Receive) with the code path visible; no changes made. |
| Motion with purpose | Existing curves kept (`cubic-bezier(0.32,0.72,0,1)` sheets, 180–300 ms state); no motion added this pass. |
| Empty states | `chat.empty` has a destination line, a content line and an action; it is not "No data". `stats.empty` and `space.empty` are the two thin ones — see leftovers. |
| Physical feedback / haptics | Present: `lib/haptics.ts`, a settings toggle, `haptic('error')` on a wrong code, `hapticTick()` on send/copy. |
| Icons as typography | One icon family (lucide) + the custom device marks; no change. |
| Feel faster | Sending is optimistic; the composer clears on send and the bubble settles in place. |
| Write like a human | Voice is already competent-not-cute ("This room closes in 10 minutes"). No strings rewritten this pass, because all 11 locales would have to move together. |
| Study great apps | That is what `agent/skills/` is for. |

## Leftovers, with reasons

- **`stats.empty` ("No transfers recorded yet.") and `space.empty` ("Nothing here yet")** — both are the article's named anti-pattern, but they are `t()` keys in 11 locale files; changing copy without the other ten would ship a mixed-language screen. Needs a copy pass, not a patch.
- **Toast system** — still does not exist in the product. Building one is a feature.
- **CJK/Arabic webfonts** — deliberately not added (megabytes); the script stacks use system faces.
- **`ROND` axis exploration** — the Friendly build fixes roundness at 50; using the full 442 KB variable file to move it costs 213 KB for a corner-radius effect.
