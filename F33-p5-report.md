# F33 — P5 "Front door"

Branch `main`, straight through. Tagged `before-p5` before the first commit.
Every push was preceded by `git pull --rebase`; nothing was force-pushed.

| step | commit | state |
|---|---|---|
| START — tag | `before-p5` | done, pushed |
| STEP 0 — the contract | `1b2eef9` | done |
| STEP 1 — story, small things, FAQ, final call, footer | `f108902` | done |
| STEP 2 — real loops | `ed6f531` | done |
| STEP 3 — dead art, one phone, no second Send | `c830e7f` | done (see 3 for what was already true) |
| STEP 4 — Beacon and the eight scenes | `c830e7f` | **partly** — 8 scenes drawn and reviewed, 3 mounted |
| STEP 5 — honest Activity (Tier B) | — | **NOT DONE** |

Live smoke after STEP 1 (`f108902`) and after `c830e7f`: **GREEN**, 12/12, transfer
arrival 2 ms and 8 ms.

---

## STEP 0 — DESIGN.md §20

`## 20. Front door` (20a scroll and sections, 20b loops, 20c illustration and
Beacon, 20d footer, 20e activity) is in the contract before any code, so the
later steps argue with a written rule instead of with me.

## STEP 1 — the page

**The bug (bugs.md B8):** the landing scrolled an inner `<main>`, so the
browser's own scrollbar did nothing on the front door and the page could not be
scrolled the way a page is scrolled. The landing now scrolls the **window** — on
a desktop and on a phone — and the app shell only returns to
`h-dvh overflow-hidden` for the task screens, which own their height.

What is on the page now:

1. hero (unchanged: headline, subline, two doors, the running product)
2. **Three things** — Pair, Send, Keep. One bold lead word, one sentence, one
   recording each.
3. **The small things** — eight items, icon plus four to seven words, every one
   a row in `claims.md`.
4. **FAQ** — eight questions, limits stated (1 TB per file, a space keeps files
   up to seven days, what the relay can see). `home.faq.a5` used to say
   "ShareTexts stores no files, text, or history", which is false for a
   Temporary Space; it was rewritten rather than softened.
5. **Final call** with the one trust line: "Free. No account. Works in your
   browser."
6. **footer** — wordmark, Docs/About/Privacy/Terms/Guides as text links, the
   language row opening the same sheet the header uses, GitHub, "Made by Mr.
   Garv" → `x.com/0xalyt`. No icon row. Every link is a 44px target, which
   closes **B20**; the gate measures it rather than trusting it.

Copy lives in `src/lib/messages/en.ts`. The other eight dictionaries carry the
English sentence as a placeholder and every new key is listed in
`docs/redesign/i18n-todo.md` under "P5 — front door copy".

**The gate was rewritten, not loosened.** `verify-landing-onescreen` used to
require `scrollHeight === clientHeight` — a page that cannot scroll — which §20a
now forbids. It asserts what the old assertion was for, and two new things:

```
1920x1080: ok heroInFold demoBottom=649 vh=1080 pageScroll=1837 innerScrollers=none
1600x900:  ok heroInFold demoBottom=649 vh=900  pageScroll=2017 innerScrollers=none
1440x900:  ok heroInFold demoBottom=655 vh=900  pageScroll=2017 innerScrollers=none
1366x768:  ok heroInFold demoBottom=602 vh=768  pageScroll=2149 innerScrollers=none
1280x800:  ok heroInFold demoBottom=602 vh=800  pageScroll=2117 innerScrollers=none
1152x700:  ok heroInFold demoBottom=591 vh=700  pageScroll=2213 innerScrollers=none
1024x768:  ok heroInFold demoBottom=545 vh=768  pageScroll=2143 innerScrollers=none
structure ok: hero=84 demo=137 how=816 features=2097 faq=2379 cta=3091 footer=3408
              stories=3 small=8 faq=8 footerLinks=9
```

The phone landing also gained the sections: before this step the front door on a
390px screen was the hero and nothing else, because the story sections were
built only inside the desktop node.

Other checks on STEP 1: axe 8 surfaces, 0 serious/critical and 0 moderate;
contrast landing 63 text runs per theme, 0 below AA; nav 13 passed / 0 failed /
0 skipped (dev server).

## STEP 2 — the recordings are the product

`npm run record-loops` drives the app in a 390x844 viewport, two contexts where
two devices are needed, and encodes each run with system ffmpeg into MP4 (H.264),
WebM (VP9) and a WebP poster.

Two mistakes were made and fixed rather than shipped:

- the first pass took frame 0, which is the app's own "Opening ShareTexts…"
  splash, so all three posters were a picture of a loading screen. Each scene
  now reports when its story starts and the encoder cuts there;
- the poster is the **payoff** frame (92% in), not the setup.

| story | mp4 | webm | poster | length |
|---|---|---|---|---|
| pair | 36,205 B | 40,450 B | 12,354 B | 6.0 s at 2.1× |
| send | 27,652 B | 29,539 B | 6,562 B | 3.5 s at 1.3× |
| keep | 54,872 B | 64,314 B | 8,696 B | 3.5 s at 1.6× |

Total 280,644 B = **274 KB**, against the 1.2 MB budget. Each file is under its
own ceiling (350 KB MP4, 300 KB WebM, 40 KB poster); the command fails if any
file or the total misses, so a regression cannot be committed quietly.

Playback, measured on the production build rather than argued:

```
before scroll: pair.webp @291ms, send.webp @291ms, keep.webp @292ms
after scroll:  send.webm @2694ms
light:  v0 paused=false t=1.4s ready=4 | v1 same | v2 same | after scrolling away paused=true,true,true
dark:   v0 paused=false t=1.4s ready=4 | v1 same | v2 same | after scrolling away paused=true,true,true
light reduced-motion: v0 paused=true t=0s ready=0 | v1 | v2 same
dark  reduced-motion: v0 paused=true t=0s ready=0 | v1 | v2 same
```

`readyState 0` under reduced motion is the point: no video bytes at all, only the
poster. Nothing but the three posters (~27 KB) is fetched before the visitor
scrolls near a story.

**LCP before/after,** built twice (manifest null, then with the loops), three
runs each on the production build:

- without the loops: 564 / 308 / 328 ms → median **328 ms**
- with the loops: 292 / 300 / 284 ms → median **292 ms**

No regression, well inside the +100 ms allowance.

The recordings also forced a layout fix: a 390x844 frame at half the container is
nearly 1200px tall, which made the section swallow the page. The loop is now a
108px inset on a phone and 148px on a desktop, beside the words.

## STEP 3 — what was already true, and what was dead

- **One phone at ≤640px:** already true — `HeroDeviceDemo` receives
  `variant={isNarrow ? 'phone' : 'full'}`, so a narrow screen gets one phone and
  never the laptop-plus-phone composition. Verified in the source and in the
  390x844 captures; nothing changed.
- **No second "Send":** already true — §18 removed the demo's own Send button;
  the demo plays itself and keeps only Restart. `data-testid="demo-send"` no
  longer exists in the tree.
- **Dead art deleted (8,745 B of source):**
  `src/components/spaceui/SegmentedToggleButton.tsx` (7,060 B) — nothing imports
  it since the settings control moved to the token primitive; and four
  background primitives with zero mount sites in `src/index.css` — `.st-dotgrid`,
  `.st-softspot`, `.st-diag`, `.st-bloom` (1,685 B), plus their comment block.
  Checked with an import-graph pass over `src/`, not by eye.

Still shipping and deliberately **not** deleted here, because they are mounted
and removing them is a §0.4 gate change: `.dot-bg` on the 404 and the app shell,
`.st-spotlight` on the landing (slop.md #5/#6), and the isometric art on Docs
(slop.md #11, a REPLACE, not a delete).

## STEP 4 — Beacon, partly mounted

`src/components/art/Beacon.tsx` — round body, two eyes, a small smile, three
signal arcs, all proportional to the body radius so the arcs clear the head at
32px and at 200px. The first version drew the arcs through the face; the kit
caught it and it was rewritten.

`src/components/art/Scenes.tsx` — Waiting, Connected, EmptyRoom, Offline,
CodeExpired, RoomEnded, NotFound, Arrived. Flat only, 2.5px `currentColor`
outline, four CSS variables plus the brand accent (`--st-art-body`,
`--st-art-shade`, `--st-art-accent`, `--st-art-ink`), one `aria-hidden` on the
frame, no gradient, no shadow. Rendered markup per scene: **1.37–1.85 KB**,
against the 4 KB ceiling.

`/__kit/art` (dev only, imported inside `import.meta.env.DEV`) shows all eight in
light, on a dark plate, and at half size.

**Mounted: three of eight** — 404 (`SceneNotFound`), the connected empty room
(`SceneEmptyRoom`, replacing the device-link illustration there), and the
peer-offline state (`SceneRoomEnded`). The other five are drawn and reviewed but
not mounted: waiting (Send's status is a 44px pill at the bottom of the pane),
offline banner (a one-line strip), expired code and wrong code (a single alert
line inside `ReceiveScreen`), nearby-empty (a status row by design, §18). Each of
those slots is smaller than the drawing, and inventing space for a picture in a
screen that was tuned to hold one line would trade a real cost for decoration.
That is my call, and it is the reason STEP 4 is partly done rather than done.

## Verification actually run for this report

- `npx tsc --noEmit` clean before each commit.
- `npm run build` clean (5 builds).
- `verify-landing-onescreen` — 7 desktop sizes + structure, 0 failures.
- `verify-axe` — 8 surfaces, 0 serious/critical, 0 moderate.
- `check-contrast` — landing 63 runs/theme, 0 below AA.
- `verify-nav` — 13 passed / 0 failed / 0 skipped **on the dev server**. It fails
  on the `dist-server` harness at `task-back`, and it fails the same way on the
  build from before any of this work, so the failure is the harness, not the
  change — reported as a limitation, not as a pass.
- `smoke-live` — GREEN twice, on `f108902` and on `c830e7f`.
- `record-loops` — 3 stories, all inside budget; playback and LCP probes as above.

Screenshots (gitignored, `audit/p5/`): landing full-page and per section at
1440x900 and 390x844 in both themes, `art-kit-{light,dark}.png`, and
`404-390x844-{light,dark}.png`.

## Self-audit

- [x] Does the landing scroll the window, on a phone and a desktop?
- [x] Is the hero still inside the first screen at every size the gate covers?
- [x] Three stories, each one lead word, one sentence, one recording of the real product?
- [x] Eight small things, each four to seven words and provable from `claims.md`?
- [x] Eight FAQ answers, with limits stated plainly and the encryption claim corrected?
- [x] Footer as text links with 44px targets, language row, GitHub, "Made by Mr. Garv", no icon row?
- [x] No recording loads before it is near the viewport, and none plays under reduced motion?
- [x] Every media file inside its byte budget, total inside 1.2 MB?
- [x] LCP no worse than before the recordings (median 292 ms vs 328 ms)?
- [x] Beacon drawn from the logo, flat, 2.5px outline, four variables, no gradients or shadows?
- [x] Every scene under 4 KB of markup and `aria-hidden`?
- [x] Dead code that nothing imports deleted, with the bytes reported?
- [ ] All eight scenes mounted — **three of eight**.
- [ ] Activity counters and the Activity screen (STEP 5) — **not started**.
- [ ] New landing copy translated — **English placeholders**, ledgered.

## NOT DONE

1. **STEP 5 in full.** No honest counters, no `/stats`, no Activity screen, no
   Clear-history row. The hero's "N rooms made so far" is whatever the previous
   phase left in place; it has not been audited against
   `ACTIVITY-COUNTERS.md` (baseline 113, no `Math.max` floor, 60/min/IP and
   20/min/room limits) in this work.
2. **Five scene mounts:** waiting, offline, code-expired, arrived, nearby-empty.
   The drawings exist and are reviewed in `/__kit/art`; see STEP 4 for why each
   slot is a layout decision rather than a one-line insert.
3. **Translations.** 33 keys are English in the eight other locales and listed in
   `docs/redesign/i18n-todo.md`.
4. **Docs page art.** The isometric illustration and the platform marquee still
   ship (slop.md #8, #11); both are REPLACE items that need a real product
   screenshot and a Docs redesign, not a delete.
5. **`measure-frames`** still fails from host noise and was not part of this work.

## Five things the owner checks on a real phone

1. Open the site and **scroll with your thumb**: one scrollbar, one page. The
   hero is still composed on the first screen, and scrolling down never scrolls
   you back up to it.
2. Stop on **Three things** and watch each story play once it is half on screen,
   then scroll away and back: it pauses and resumes, it does not stutter or
   restart from the beginning.
3. Turn on **Reduce Motion** (iOS: Settings → Accessibility → Motion) and reload:
   the posters are still there, nothing moves, and the page uses no video data.
4. Tap every footer link: Docs, About, Privacy, Terms, Guides, GitHub, "Made by
   Mr. Garv" — all reach a real page, and none is a 20px text sliver you miss.
5. Visit a URL that does not exist (e.g. `/nope`) and disconnect the network once:
   the two drawings should look like drawings, not like broken images, and the
   words should still say what happened in both light and dark.
