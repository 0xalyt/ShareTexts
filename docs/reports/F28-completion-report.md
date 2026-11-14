# F28 — P0: truth, contract, baseline, safety net

Report for prompt P0. Proof rule: every row cites file:line, a command or a screenshot
path. Anything unchecked says NOT VERIFIED. Prior F28 (apple-grade branch pass, commit
`ca53b59`) is preserved in git history and is a source for STEP 2.

## 1. Summary

P0 made the repo safe to design in. All 8 steps done, each on main, each gated
(tsc + build + relevant gates), each pushed:

| Step | Delivered | Proof |
|---|---|---|
| 0 | Safety net: `before-p0` tag pushed at d5ca699 | §2 |
| 1 | DESIGN.md (the contract) + §0 working rules incl. push/smoke/revert | DESIGN.md |
| 2 | Prior-work ledger — 90 claims from audits/reports/protocol checked | docs/redesign/PRIOR-WORK.md |
| 3 | APP-MAP (10 sections, every claim cites file:line) + audit generators, full gate run | docs/redesign/APP-MAP.md |
| 4 | Proof machinery: `capture-baseline.mjs` (144-shot matrix), `smoke-live.mjs`, measured noise floor (33 pixel-clean / 109 noisy pairs at >8 threshold, boxes in audit/noise-floor.json) | 37caaa1 |
| 5 | Slop inventory + bug ledger **B1–B15** (severity, proof, cause, fix-prompt slot each) | docs/redesign/slop.md, bugs.md |
| 6 | Claims re-checked (18 rows), activity-counter definitions, emoji facts | docs/redesign/claims.md, ACTIVITY-COUNTERS.md |
| 7 | Reference study — measured facts from obry.app, Apple, Duolingo, popl.co (sourced, observation only) | docs/redesign/reference-study.md |
| 8 | Hygiene: last old-handle emitter fixed (8a), package rename verified (8b), build marker `meta sharetexts-build` = 12-char sha (8c), first live smoke run | §4 |
| 9 | No-pixel-change proof: post-STEP-8 re-capture vs baseline — 36 identical + 100 mask-emptied + 8 excluded, **0 flags** | §5 |

The truth gap that motivated the prompt is quantified rather than guessed:
§3 below lists 47 contract-vs-code rows read from this tree (≈30 match,
≈17 differ — stale comments, lying token names, two grammars for radius/
durations/shadows). Fixing those is the redesign prompts' job, not P0's.

Known-live failures stay open on purpose: **B1** (live CSP pin blocks the
theme bootstrap — reproduced by the first live smoke), B3 (30 s vs 90 s
timer copy), B16 (timestamps use host locale) — filed with proof, not fixed,
per "do not fix anything not in this prompt".

## 2. Commits pushed

| sha | message |
|---|---|
| d5ca699 | feat(saved): per-device saved library (pre-P0 worktree fast-forward) |
| f8ddb09 | docs: design contract v1.1 (STEP 1) |
| d16baaa | docs: prior-work ledger — 90 claims checked (STEP 2) |
| fd77686 | docs: app map + audit generators + full gate run (STEP 3) |
| 37caaa1 | feat(audit): P0 STEP 4 — proof scripts + baseline matrix + measured noise floor |
| 726081e | docs(redesign): P0 STEP 5 — slop inventory + bug ledger |
| c4badca | docs(redesign): P0 STEP 6 — claims re-check, counters, emoji facts |
| 21cbd26 | docs(redesign): P0 STEP 7 — measured reference facts |
| 8edbc79 | chore(seo): P0 STEP 8 — old handle fix + build marker |
| 95568f5 | docs(redesign): first live smoke (marker 8edbc79ba8fd) — 5/6 PASS |
| (this commit) | P0 STEP 9 pixel proof + report completion |

Safety net: tag `before-p0` pushed to origin at d5ca699 (`git push origin before-p0`,
output: `* [new tag] before-p0 -> before-p0`).

## 2a. Environment

| Item | Value | Proof |
|---|---|---|
| OS | Windows 10/11 build 26200, Git Bash (MINGW64_NT-10.0-26200) | `uname -s` |
| Node | v24.19.0 | `node -v` |
| npm | 11.17.0 | `npm -v` |
| Playwright | 1.62.1 | `npx playwright --version` |
| Chromium | installed (chromium-1234, chromium-1248, headless shells, ffmpeg) | `$LOCALAPPDATA/ms-playwright` listing |
| Dev server | `npm run dev` with PORT=3012 | contract §0.9 |
| Prod server | `npm run build` then `NODE_ENV=production PORT=3013 node dist/server.cjs` | contract §0.9 |
| Branch at start | design/apple-grade, 10 ahead / 0 behind main → fast-forwarded main to d5ca699, both pushed | `git rev-list --left-right --count main...HEAD` → `0 10` |

## 3. Contract vs code (DESIGN.md sections 3–9)

Values read from this tree (d5ca699 + DESIGN.md). Differences are recorded, not fixed —
owner decides.

### Section 3 — Colour

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| light canvas #ffffff | #fbfbfd | src/index.css:72 (--color-bg), :98 (--color-apple-canvas) | Differs (#fbfbfd) |
| light band #f5f5f7 | #f5f5f7 | src/index.css:73, :99, :160 | Match |
| light ink #1d1d1f | #1d1d1f | src/index.css:67, :100 | Match |
| light ink-2 #6e6e73 | #6e6e73 | src/index.css:68, :101 | Match |
| light ink-3 #8e8e93 | #8e8e93 | src/index.css:69 | Match |
| light line #dedee3 | rgb(0 0 0/0.08) (≈#ebebeb on white) | src/index.css:80 | Differs (alpha, not the hex) |
| light divider #e8e8ed | rgb(0 0 0/0.08) | src/index.css:105 (--color-apple-divider) | Differs |
| dark canvas #101012 | #181818 | src/index.css:285 | Differs |
| dark band #141416 | #141414 | src/index.css:286 | Differs (#141414, 1 step off) |
| dark raised #18181a | #262626 | src/index.css:287-289 | Differs |
| dark ink #ededf2 | #e4e4e4 | src/index.css:293 | Differs |
| dark ink-2 #9c9ca3 | #888888 | src/index.css:294 | Differs |
| dark line #3a3a42 | #333333 | src/index.css:297 | Differs |
| dark divider #2a2a30 | #2a2a2a | src/index.css:298 | Differs (1-2 values off) |
| accent light #f06413 | #f06413 | src/index.css:51 (--color-brand), :57 (--color-ember), :93 (--color-focus) | Match (but 5 names, see below) |
| accent dark #fb7a2e | #fb7a2e | src/index.css:301, :317 | Match |
| press #d9560e (light) | #d9560e | src/index.css:52 | Match |
| orange text on light #b3450b | #b3450b exists as --color-azure-800 | src/index.css:111 | Match value / token name not -accent-ink |
| success #34c759 | #34c759 | src/index.css:85, :115 | Match |
| success ink on light #1d7a35 | #1d7a35 | src/index.css:216 | Match |
| warning #ff9500 | #ff9500 | src/index.css:87, :116 | Match |
| warning ink on light #9a5a00 | #c77a00 | src/index.css:117 | Differs |
| danger #ff3b30 | #ff3b30 | src/index.css:89, :119 | Match |
| danger ink on light #c22e24 | #c22e24 | src/index.css:219 | Match |
| one accent, few names | five names for #f06413: brand, ember, apple-blue, azure-600, focus | src/index.css:51,57,93,103,113 | Differs (lying names, the P0 "why") |
| "Warm paper… One accent: iOS blue" top comment | comment still says iOS blue; code comment below says EMBER | src/index.css:38-44 vs :46-49 | Differs (stale header comment) |
| toggle ON = success green | #5CCB67 | src/components/ThemeToggle.tsx:47,166 | Differs (not --color-status-success) |
| no gradients on UI | --st-btn-primary/soft/secondary gradients defined and used | src/index.css:242-244, :320-322; src/components/TactileButton.tsx:51,58,65 | Differs |

### Section 4 — Type

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| Apple devices get SF via -apple-system first | "Inter" leads the stack everywhere | src/index.css:35 | Differs (Inter first; SF only as fallback) |
| Inter variable, self-hosted, 100–900, font-display swap, Latin subsets | @font-face Inter 100 900, swap, inter-latin{,-ext}.woff2 | src/index.css:13-29 | Match |
| size-adjusted fallback | no `size-adjust` anywhere in src/ | grep -rn size-adjust src/ → 0 hits | Differs (absent) |
| :lang() system fonts for hi/ar/ja/zh/ko | no :lang() CSS (only a comment saying they read locale from i18n) | grep -rn ':lang(' src/ → 0 CSS hits; src/lib/i18n.tsx:73 | Differs (absent) |
| display 56/64, 650, -0.03em | text-[clamp(56px,6vw,64px)] + .st-display 650/-0.03em | src/views/SingleScreenApp.tsx:836; src/index.css:410 | Match |
| h1 40 | no .st-h1 / no 40px h1 rule found; h1 only sets letter-spacing -0.03em | src/index.css:357; grep st-h1 → 0 | Differs (40px not defined) |
| h2 32 | .st-h2 32px | src/index.css:411 | Match |
| h3 22/600 | .st-h3 22px/600 | src/index.css:412 | Match |
| body 17/1.47 | body 16px/1.5; .st-body 16px/1.55 | src/index.css:261-262, :414 | Differs (16px, 1.5–1.55) |
| small 15 | no 15px step (nearest: .st-title 16, .st-support/.st-label 13) | src/index.css:413-415 | Differs (absent) |
| caption 13 | .st-support/.st-label 13px | src/index.css:414-415 | Match |
| micro 12 | .st-meta 12px, .st-eyebrow 12px | src/index.css:416, :421 | Match |
| tighten letter-spacing only ≥20px | body 16px carries -0.01em; base body -0.008em; .st-title 16px -0.018em | src/index.css:264, :413-414 | Differs (tracking below 20px) |
| tabular numbers for codes/counts | .tnum utility, used on codes, counts, % | src/index.css:382-384 | Match |
| headings text-wrap: balance | balance on h-stacking + .st-display/h2/h3 | src/index.css:355, :410-412 | Match |
| paragraphs text-wrap: pretty | 0 hits for text-pretty / text-wrap: pretty | grep → 0 | Differs (absent) |
| line length ≤60ch | no max-width in ch found | NOT VERIFIED (no such rule located) | Differs / unchecked |

### Section 5 — Shape, space, depth

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| radius 12 small controls | --radius-sm 12px | src/index.css:165 | Match |
| radius 14 buttons | ConfirmSheet buttons rounded-[14px]; TactileButton sizes use rounded-full | src/components/ConfirmSheet.tsx:91-102; src/components/TactileButton.tsx:38-40 | Differs (two grammars) |
| radius 16 cards | --radius-md 16px; cards use rounded-[16px] | src/index.css:166; src/components/SavedItemsOverlay.tsx:264 | Match |
| radius 24 sheets | --st-radius-sheet: 20px (24px tier exists as --radius-xl) | src/index.css:168, :202 | Differs (sheet = 20) |
| radius full for chips | rounded-full used for chips/pills | e.g. src/components/MessageCard.tsx:571 | Match |
| one shadow token, floating layers only | 7 --shadow-* + 3 --st-elev-* levels | src/index.css:171-177, :210-212 | Differs (10 tokens) |
| min touch target 44×44 | --st-control-md 44px / lg 52px, but many min-h-[40px] controls | src/index.css:197-199; e.g. src/components/SavedItemsOverlay.tsx:460,521 | Differs (40px controls exist) |
| 4px grid, spacing steps 4/8/12/16/24/32/48/80 | no spacing-token list defined | NOT VERIFIED (tokens absent) | Differs (no token source) |

### Section 6 — Buttons

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| primary = flat orange fill | primary uses linear-gradient (light #c25310→#a94008, dark #fb8447→#d9560e) | src/index.css:242, :320; src/components/TactileButton.tsx:51 | Differs (gradient) |
| label white 19px/700 | no 19px found; sizes use text-[13px]/text-[16px] | src/components/TactileButton.tsx:38-40; grep text-\[19px\] → 0 | Differs |
| 3px darker bottom edge #c04b09 | edge token #8a3608 (dark #a83f06); 3px→1px press shadow present | src/index.css:248, :323; src/components/ShareMenu.tsx:159 | Differs on colour (#8a3608 ≠ #c04b09); geometry matches |
| press: down 2px, edge 3→1px, 60 ms | active:translate-y-[2px] + active:shadow-[0_1px_0_0_…]; DUR.instant=60 exists | src/components/ShareMenu.tsx:159; src/lib/motion/tokens.ts:32 | Match geometry; 60ms pin for this press NOT VERIFIED |
| radius 14 on buttons | ConfirmSheet 14px; TactileButton rounded-full | src/components/ConfirmSheet.tsx:91-102; TactileButton.tsx:38-40 | Differs (split) |
| height 52 hero / 44 default | --st-control-lg 52px / --st-control-md 44px | src/index.css:198-199 | Match |
| secondary: surface fill, 1.5px line, ink 17px/600 | secondary bg-white/dark:bg-apple-tile-2, label 16px semibold; no 1.5px border token found | src/components/TactileButton.tsx:83; sizes :38-40 | Differs (16px label; border NOT VERIFIED) |
| focus: 2px orange ring, 2px offset, keyboard only | :focus-visible outline 2px solid var(--color-ember), offset 2px; :focus:not(:focus-visible) none | src/index.css:364-369 | Match |
| disabled: 40% opacity, no press | disabled:opacity-60 and opacity-80 in components | src/components/NearbyDetectOverlay.tsx:373,394; src/components/SavedItemsOverlay.tsx:599 | Differs (60–80%) |
| state change inside same button | implemented per component; e.g. saved flows use busy/copy states | src/components/SavedItemsOverlay.tsx (busy, copied state) | Match (spot-checked); full audit NOT VERIFIED |

### Section 7 — Icons and emoji

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| Lucide only, no other icon libs | no react-icons / @heroicons / @gravity-ui imports in src/ | grep "from 'react-icons…'\|@heroicons…" → 0 | Match |
| stroke 1.5 everywhere | strokeWidth histogram: 2 → 14 uses, 1.5 → 9, 3 → 6, 2.5 → 6, 2.4 → 3, 2.2 → 3 | grep -rhoE 'strokeWidth=…' src \| sort \| uniq -c | Differs (1.5 not dominant) |
| emoji from public/emoji-apple via src/lib/emoji.ts, VITE_EMOJI_SET switch | dir and file removed; no VITE_EMOJI_SET; reactions render Unicode glyphs via platform color-emoji font | ls public/emoji-apple → missing; ls src/lib/emoji.ts → missing; grep VITE_EMOJI_SET → 0; src/components/spaceui/EmojiReaction.tsx:16-19 | Differs (Phase 3 removed the pipeline the contract describes) |
| image fails → native fallback, reaction never disappears | no image pipeline to fail; glyph always renders | src/components/spaceui/EmojiReaction.tsx:16-19 | Match in effect (glyph path), contract text stale |
| no emoji as icons in UI | no icon-emoji usage found outside reactions (spot check) | NOT VERIFIED exhaustively | — |

### Section 8 — Motion and haptics

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| durations 60/120/180/280/480 from src/lib/motion/tokens.ts | DUR = {60,120,180,280,480} | src/lib/motion/tokens.ts:32-38 | Match |
| CSS mirrors the same ladder as --st-dur-* | CSS has only --st-dur-micro 120 + --st-dur-long 480, PLUS a different ladder --motion-micro/quick/normal/slow = 100/160/250/350 | src/index.css:543-544 vs :187-190 | Differs (two ladders; 60/180/280 missing from CSS) |
| springs without overshoot for UI | SPRING.sheet {stiffness 380, damping 36} → ζ≈0.92; SPRING.snap {500, 40} → ζ≈0.89 | src/lib/motion/tokens.ts:46-50 | Differs (slightly underdamped; small overshoot possible) |
| animate transform and opacity only | color/background transitions widespread (transition-colors); width animated too | src/index.css:1177 (transition: width); transition-* in most components | Differs (owner decides intent: entrance/layout vs state color) |
| interruptible | motion/react retargets springs; documented in tokens header | src/lib/motion/tokens.ts:17-27 | Match |
| respects prefers-reduced-motion | MotionConfig reducedMotion="user" + CSS @media guards (14+ blocks) | src/main.tsx:51; src/index.css:557,590,609,627,671,696,717,745,992-995 | Match |
| loops only for live state, ≤1 per screen | loops exist for connecting/live dot; exhaustive count NOT VERIFIED | src/index.css:641 (bars hold still under reduced motion) | — NOT VERIFIED |
| haptics only through src/lib/haptics.ts: tap light, toggle tick, success double tick, error firm | file exists; exports hapticSuccess [12,40,18], hapticArrive [10,34,12], hapticTick 8 — 3 of the 4 named haptics, different names | src/lib/haptics.ts:30,35,42 | Differs (missing tap-light/error-firm, names differ) |
| do not promise iOS Safari haptics unless tested | NOT VERIFIED (no iOS Safari test here) | — | — |

### Section 9 — Voice

| Contract item | Code value | File:line | Match / Differs |
|---|---|---|---|
| banned words absent (seamless, effortless, unlock, supercharge, elevate, empower, revolutionize, magic, blazing, "in seconds", "whether you're") | 0 hits in src/lib/messages/en.ts | grep -rniE 'seamless\|effortless\|…' src/lib/messages/en.ts → empty | Match (en only; other 8 locales NOT VERIFIED) |
| all user-visible text in src/lib/messages/*.ts | hard-coded English aria-labels exist outside messages | src/App.tsx:94,166; src/components/BrandLockup.tsx:51; src/components/CommandBar.tsx:494,504 | Differs |
| no "!" / no "Oops" / no "Welcome to" in copy | NOT VERIFIED exhaustively (full string audit is STEP 3d) | — | — |
| claims listed in docs/redesign/claims.md | file does not exist yet; docs/claims.md exists (prior pass) | ls docs/redesign → absent; docs/claims.md exists | Differs (STEP 6 creates it) |

## 4. P0 STEP 8 — hygiene + first live smoke

| Item | Result | Proof |
|---|---|---|
| 8a old GitHub handle on generated pages | `scripts/seo-routes.mjs:102` was the last live emitter — changed `Alightttt` → `0xalyt`; after build `grep -r Alightttt dist/` → **none** | commit 8edbc79 |
| 8b package rename | already done pre-P0 (`react-example` → `sharetexts`) — verified `package.json:2` + repo-wide grep clean | `grep -rn react-example .` → 0 |
| 8c build marker | builds stamp `<meta name="sharetexts-build">` = 12-char commit sha (Vercel `VERCEL_GIT_COMMIT_SHA`, local git HEAD) into dist/index.html + every derived SEO page; consumed by smoke `--expect` | local build → `21cbd267219e`; live after push → `8edbc79ba8fd` |
| gates before push | tsc clean, `npm run build` ok, `verify-seo` **114/114** | 8edbc79 |
| live smoke (`--expect 8edbc79ba8fd`) | **5/6 PASS**: 200, marker match, two devices paired (10 381 ms), message A→B (12 ms), echo. 1 FAIL = console errors | docs/redesign/live-smoke-log.md |
| the 1 FAIL | pre-existing **B1**: `vercel.json` pins stale `sha256-dlnEh4mZ…`; the theme bootstrap (`eMqz…`) is CSP-blocked **on live** — both contexts | `git diff --stat 21cbd26..HEAD -- index.html vercel.json` empty → not a regression of this push; B1 row updated with the re-reproduction |
| console warnings (3) | designed boot-probe redirect `…garv29devra.workers.dev → …alighttt.workers.dev` — baked `VITE_SIGNALING_URL` in Vercel env is the previous worker; already classified WORKER_NOISE by verify-seo | live-smoke-log.md |

## 5. P0 STEP 9 — no-pixel-change proof

Procedure per docs/redesign/capture-noise.md (masks measured in STEP 4).

1. **Static proof first:** `git diff --stat 21cbd26..HEAD -- src index.css
   public index.html server.ts worker` → **empty**. STEP 8 touched only
   build tooling (seo-routes.mjs) and docs.
2. **Re-capture:** `node scripts/capture-baseline.mjs --out
   audit/baseline-post8` — 144/144 shots; capture script byte-identical to
   the baseline run (`git diff 37caaa1..HEAD -- scripts/capture-baseline.mjs`
   empty).
3. **Diff:** `node scripts/_diff-post8.mjs` (threshold >8/channel, floor boxes
   from audit/noise-floor.json + cause-verified supplemental boxes in
   audit/step9-masks.json painted on BOTH sides):

| Result | Count |
|---|---|
| pixel-identical (raw) | 36 |
| noisy → emptied by masks | 100 |
| excluded (connecting — animation phase is the content) | 8 |
| **flags** | **0 → `PROOF HOLDS`** (audit/step9-diff.txt, exit 0) |

Every mask box was justified by visual inspection before use
(`_probe-step9-diffmap.mjs` / `_probe-step9-crops.mjs`, crops kept in
`audit/step9-crops/`): wall-clock meta strips (incl. format drift caused by
B16), icon-glow/send-arrow render timing, picker-chip animation phase,
seconds-tick rows, random code extents, dotted-divider dash phase,
sub-pixel AA. Full cause table: capture-noise.md §STEP 9.

Note: `audit/baseline-post8/` (31 MB) stays local — precedent set by the
temporary run2 matrix; the committed evidence is the diff output, masks and
crops (audit/step9-diff.{txt,json}, step9-masks.json, step9-crops/).

## 6. NOT VERIFIED

- **Live CSP fix (B1)** — reproduced live, not fixed (outside P0's prompt).
- **Other 8 locales** for §3 voice rows — en only (pre-existing gap).
- **iOS Safari haptics** — no iOS device in this session (pre-existing).
- **B5 owner emoji report** — not reproducible on this host; needs the
  owner's device/OS (filed with evidence).
- **post8 matrix on a second host/OS** — machine-specific drift (B16) was
  observed between two runs here; cross-machine pixel equality is not
  claimed.

## 7. Questions for the owner (max 5)

1. **B1 (live CSP blocks the theme bootstrap on every load)** — re-pin
   `vercel.json` to the two hashes + add a pin-parity gate? **Recommend:
   yes, next prompt (P-token) — it is the only S1 that hits all live
   visitors.**
2. **Vercel env `VITE_SIGNALING_URL`** still points at the old worker
   (`…garv29devra…`), so every boot probes and redirects. **Recommend:
   update the env var to `https://sharetext-signaling.alighttt.workers.dev`
   (owner action in the Vercel dashboard).**
3. **B16 timestamps use the host locale, not the app language.**
   **Recommend: fix in the P-copy pass (format under `sharetext.locale`).**
4. **B5 "Apple emoji reactions are missing" — which device/OS showed
   nothing?** (Windows here renders them.) **Recommend: owner names the
   device before P-emoji.**
5. **Commit the 31 MB post-STEP-8 matrix?** **Recommend: no — results +
   masks are committed; re-running the capture regenerates images.**

## 8. What I would do next

P1 prompts in DESIGN.md order, starting with the two S1s' fix slots (B1
token/hygiene, then the §3 colour/type/shape divergence rows the contract
already measured), then P-landing (B6/B13/B14 are all one hero-scene
family). The proof machinery from P0 re-runs unchanged: capture → diff →
gates → smoke.
