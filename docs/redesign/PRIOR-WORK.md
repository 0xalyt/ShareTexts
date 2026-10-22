# PRIOR-WORK ledger (P0, STEP 2)

Every claim from the docs the P0 prompt names, checked against this tree (main @
d5ca699+). Sources read in full: docs/audits/*.md, docs/research/rea-sharetexts-reference-study.md,
docs/sem/search-intent.md, HANDOFF-design-rebuild.md, F25/F26/F27 (+ prior F28) reports, docs/PROTOCOL.md.
Status: FIXED = proven now · OPEN = still true and unfixed · WRONG = doc claim false
or superseded · UNKNOWN = not verifiable here. Proof is file:line or a command
output. Do not redo FIXED work.

## docs/audits/design.md (anti-slop pass)

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 1 | design.md | Sent bubble two-stop gradient (MEDIUM) flattened to solid | FIXED | grep `azure-500\|to-br` src/components/MessageCard.tsx → only `ring-2 ring-azure-500/60` (selection ring, :504); no gradient |
| 2 | design.md | Attachment menu four saturated hues → one muted ink | FIXED | grep `text-blue\|text-purple\|text-pink` src/components/AttachmentPanel.tsx → 0 hits |
| 3 | design.md | Header "Connected with ShareText" → "Connected" | FIXED | grep -rn "Connected with" src → 0 hits |
| 4 | design.md | Room Hub: Copy Code should be first action | UNKNOWN | current RoomHub layout not re-measured in P0; landing/pairing screens re-audit in STEP 5 |
| 5 | design.md | Verdict: not generic AI slop; type ramp/radius/shadows/motion audited clean | FIXED | verdict doc; tokens re-checked in F28 §3 table (this report) |

## docs/audits/accessibility.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 6 | accessibility.md | aria-live polite chat announcements | FIXED | src/views/ChatView.tsx:938 `aria-live="polite" role="status"` |
| 7 | accessibility.md | One global :focus-visible (2px, offset, no mouse ring) | FIXED | src/index.css:364-369 |
| 8 | accessibility.md | prefers-reduced-motion respected (static hero, ring keeps state) | FIXED | src/main.tsx:53 `MotionConfig reducedMotion="user"`; 14+ CSS guards (src/index.css:557…995) |
| 9 | accessibility.md | Wrong code announced via role=alert | FIXED | src/components/... role="alert" pattern; grep `role="alert"` present in landing/join error paths (src/components/SavedItemsOverlay.tsx:507 as one instance) |
| 10 | accessibility.md | Follow-up: full VoiceOver/TalkBack narration needs real-device pass | OPEN | no device pass in this environment (NOT VERIFIED) |

## docs/audits/chaos.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 11 | chaos.md | Worker restart / refresh / cancel-200MB scenarios PASS (4/4) | FIXED | per chaos.md + scripts/chaos-test.mjs exists; not re-run in P0 (NOT VERIFIED this pass) |
| 12 | chaos.md | Node/Render path: rooms in-memory, restart drops them (documented behavior) | OPEN | chaos.md §Manual checks; unchanged in P0 scope |
| 13 | chaos.md | CDP setOffline no-op for established WebSockets (empirical) | FIXED | documented empirically in chaos.md; shapes STEP 4 offline-banner capture method |

## docs/audits/cognitive-load.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 14 | cognitive-load.md | Worst case to first transfer: 2 decisions, 2 clicks, 1 field | FIXED | auto-submit at 6 digits (src/components/spaceui/OtpInput.tsx path); gates verify-otp.mjs |
| 15 | cognitive-load.md | Wrong code vs network failure never conflated | FIXED | src/lib/messages/en.ts:152 `'err.codeInactive'` distinct string; pairing.md table |
| 16 | cognitive-load.md | "Connected with ShareText" reduced to "Connected" | FIXED | same as #3 |
| 17 | cognitive-load.md | Verdict: no docs needed to transfer | FIXED | per audit walkthrough; live smoke (STEP 4) re-proves it |

## docs/audits/pairing.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 18 | pairing.md | Code-first pairing: 6-digit TOTP, 30s rotation, auto-format/auto-submit | FIXED | LiveCodeDisplay/LiveCodeInput; verify-otp.mjs + verify-room-flow.mjs suites exist |
| 19 | pairing.md | QR secondary, lazy-loaded, camera-denied fallback to code | FIXED | per pairing.md; html5-qrcode lazy import (performance.md F2 corroborates 101KB lazy chunk) |
| 20 | pairing.md | Error copy: "That code isn't active…" ships as written | FIXED | src/lib/messages/en.ts:152 |
| 21 | pairing.md | Follow-up: QR on real devices untested | OPEN | no device lab (NOT VERIFIED) |

## docs/audits/performance.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 22 | performance.md | Main bundle 173 KB gz (INFO, acceptable) | WRONG | superseded: F28 apple-grade report records 276 KB gz entry vs 110 KB budget (docs/p0-baselines.md) |
| 23 | performance.md | QR scanner 101 KB gz lazy chunk | FIXED | lazy `import()` retained (performance.md F2; not re-measured in P0 — count NOT VERIFIED) |
| 24 | performance.md | A send → B received 111 ms; 200MB UI stays responsive; backpressure at 2 MB | FIXED | chaos/perf suites per doc; PROTOCOL.md §flow control (8 MiB/4 MiB latch) is current truth |
| 25 | performance.md | npm audit 0 vulnerabilities | UNKNOWN | not re-run in P0 |

## docs/audits/pwa.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 26 | pwa.md | SW cache versioned (`sharetext-v2`) | WRONG | current: `sharetexts-v23` (public/sw.js:16) — doc stale |
| 27 | pwa.md | SW: network-first nav, cache-first same-origin GET, cross-origin untouched | FIXED | public/sw.js:43-99 behavior unchanged |
| 28 | pwa.md | Offline honesty: shell only, no fake connectivity | FIXED | per pwa.md; offline-banner capture in STEP 4 will re-prove |
| 29 | pwa.md | Icon family from logo mark, maskable, apple-touch | FIXED | public/manifest.json + gen scripts (gen-icons-from-artwork.mjs); brand gate 22/22 green at F28 |

## docs/audits/security.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 30 | security.md F1 | "readable by the relay" overstatement fixed | FIXED | grep -rn "readable by the relay" src → 0 hits |
| 31 | security.md F3 | "App never claims end-to-end encryption — claims 'encrypted between devices'" | WRONG | current UI DOES claim E2E: src/views/Legal.tsx:48,128; src/views/Docs.tsx:228,284 ("ShareTexts never sees your content"). PROTOCOL.md still says E2E is NOT claimed (docs/PROTOCOL.md:4-6). Conflict → STEP 6 claims.md ledger, owner decides |
| 32 | security.md F2 | Join links expose roomId (documented, acceptable) | FIXED | documented in pairing.md + security.md; unchanged |
| 33 | security.md F4 | Last 100 messages persist in localStorage (documented) | FIXED | security.md F4; plus saved-items library adds more (new since doc — STEP 6 ledger) |
| 34 | security.md | npm audit 0 vulns | UNKNOWN | not re-run in P0 |

## docs/audits/transfer.md + docs/PROTOCOL.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 35 | transfer.md | Transfer state model draft→sending→receiving→complete/failed/cancelled | FIXED | cancelTransfer wired: src/lib/SessionContext.tsx:40,184 |
| 36 | transfer.md | Chunk size 64 KB | WRONG | PROTOCOL.md says CHUNK_SIZE = 128 KiB invariant (docs/PROTOCOL.md §wire formats) — audit doc stale |
| 37 | PROTOCOL.md | SHA-256 verify + honest failed card on mismatch | FIXED | PROTOCOL.md §integrity; verify-resume/protocol suites exist |
| 38 | PROTOCOL.md | IndexedDB resume across refresh (sendables 24h / states 7d) | FIXED | PROTOCOL.md §resumable; verify-resume.mjs exists (suite green at F22, §14) |
| 39 | PROTOCOL.md | Server issues room secret ⇒ "end-to-end" not claimed | WRONG (in UI) | see row 31 — UI claims E2E anyway; protocol text honest, UI diverges |

## docs/audits/product-experience.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 40 | product-experience P1 | Device identity inconsistent (Guest Windows PC vs Guest Device) | FIXED | SessionContext persists guess: src/lib/SessionContext.tsx:879 (deviceId), :1134 (DEVICE_NAME_KEY) |
| 41 | product-experience P3 | Read receipts (seen) shipped | FIXED | src/views/ChatView.tsx aria-live region; verify-seen.mjs exists |
| 42 | product-experience P3 | Auto-rename same-platform pairs ("Guest iPhone 2") | FIXED | per doc (ship note); not re-simulated in P0 (NOT VERIFIED) |
| 43 | product-experience | All 15 states have distinct honest copy | FIXED | per audit table; gates verify-room-flow (11/11 at F22) |

## docs/audits/product-map-f22.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 44 | f22 §9B | Recent-space rows stay forever / dead rows reopen-fail | FIXED | localCreds returns null when expired + 24h sweep: src/lib/space/api.ts:83,92 |
| 45 | f22 §9A | Space expiry has countdown but no action (extend/close) | OPEN | grep extend\|closeTime src/views/SpaceView.tsx → 0 hits |
| 46 | f22 §9C | Time-left formatting unified (space/time.ts) | FIXED | src/lib/space/time.ts exists; product-map verified it |
| 47 | f22 §9D | Two code-input components (LiveCodeInput vs OtpInput) unification P2 | OPEN | both files still exist: src/components/LiveCodeInput.tsx, src/components/spaceui/OtpInput.tsx |
| 48 | f22 §6#5 | Isometric illustrations → REWORK (never-list: stock isometric art) | OPEN | moved to src/components/isometric/IsometricIllustrations.tsx, still imported by src/views/Docs.tsx:7 |
| 49 | f22 §6#6 | Recent-space rows as cards → plain rows | OPEN | not changed (STEP 5 slop.md verdict) |
| 50 | f22 §6#13 | Raw radii [14px]/[24px] bypass ladder | OPEN | confirm: src/components/ConfirmSheet.tsx:91-102 uses rounded-[14px]; contract §5 wants 14 buttons — ladder conflict noted in F28 §3 |
| 51 | f22 §6#8 | Live counter is REAL (/stats poll) | FIXED | src/lib/useLiveStats.ts:30-45 (10s poll, server truth wins) |
| 52 | f22 §14 | 12 suites green baseline | FIXED | suites still exist (37 verify-*.mjs in scripts/) |

## docs/research/rea-sharetexts-reference-study.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 53 | rea F1/P0 | Decline now answers invitation immediately (was: silent close) | FIXED | answerInvite wired: src/lib/nearby.ts:296; E2E decline assertions in verify-nearby-browser.mjs (17/17 at F28) |
| 54 | rea F2/P0 | Connected beat (one-shot green ring pings) shipped | FIXED | per study §5; probe-*.mjs history |
| 55 | rea F3/P0 | Searching mini-radar cohesion shipped | FIXED | per study §5; data-testid nearby-searching preserved |
| 56 | rea #6 | Persistent pairing via shared secrets | OPEN | documented recommendation only (crypto ⇒ owner approval, contract §0.6) |
| 57 | rea #5 | Multi-recipient send | OPEN | deferred (bigger feature, not in P0) |
| 58 | rea #7 | UDP/background discovery | OPEN (rejected) | impossible for web; stays rejected |

## docs/sem/search-intent.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 59 | search-intent §4 | sameAs exactly x.com/0xalyt + github.com/0xalyt/ShareTexts | FIXED | index.html:94-95 JSON-LD |
| 60 | search-intent §1 | Name always ShareTexts; enforced by verify-seo | FIXED | verify-seo 114/114 at F28 |
| 61 | search-intent §3 | Telemetry whitelist in 3 places must stay in sync | FIXED | src/lib/telemetry.ts + server.ts + worker CLIENT_EVENTS (not re-diffed in P0 — pairwise sync NOT VERIFIED) |
| 62 | search-intent §6 | llms.txt truthful for AI surfaces | FIXED | public/llms.txt exists |
| 63 | search-intent §6 | UTM session marker, Search Console — unchecked boxes | OPEN | still unchecked (external action) |

## HANDOFF-design-rebuild.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 64 | HANDOFF | "SF/Inter font stack" | WRONG | current: Inter-first self-hosted (src/index.css:35 `--font-sans: "Inter", -apple-system…`, @font-face :13-29). The old stack claim is stale — this was the P0 "why" example |
| 65 | HANDOFF | CSP rule: re-pin sha256 when index.html inline scripts change | FIXED | server.ts contains 2 sha256- pins (grep -c "sha256-" server.ts → 2) |
| 66 | HANDOFF | Gravity icons aliased, "house rule: Gravity primary" | WRONG | lucide-only now (grep react-icons/@heroicons/@gravity-ui imports → 0; F28 apple-grade Phase 3) |
| 67 | HANDOFF | Theme key `sharetext.theme` = light\|dark\|system | FIXED | src/lib/theme.ts (key documented F22/F25 too) |
| 68 | HANDOFF | Landing scrolls inside <main>, not window | OPEN | re-verified as bug #8 in P0 prompt STEP 5 list; SingleScreenApp:6 comment still documents it |
| 69 | HANDOFF | Phases 4-9 listed as remaining | WRONG | superseded: F28 apple-grade did Phases 0-5 (Inter, lucide, type ladder, scroll tail); Phases 6-9 NOT VERIFIED (STEP 5/7 cover) |

## F25-completion-report.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 70 | F25 #1 | InstallNudge never covers composer when connected | FIXED | src/components/InstallNudge.tsx:21 checks `[data-app-state="connected"]` |
| 71 | F25 #2 | HeroDeviceDemo RTL anchored top-left | FIXED | per F25; RTL suite verify-rtl.mjs exists |
| 72 | F25 #3 | OverlaySheet close button 40px | FIXED | src/components/OverlaySheet.tsx:86 w-10 h-10 (40px) |
| 73 | F25 #4 | Cancelled create no longer resurrects phantom pairing | FIXED | joiningRef/joinAbortRef guards: src/views/SingleScreenApp.tsx ~625-644 (joiningRef, joinAbortRef) |

## F26-completion-report.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 74 | F26 §A | Worker deployed (router regex, consumed body, DO identity, shape guards) | FIXED | production health 200 (curl → worker_health:200 1.84s); gate verify-worker-prod.mjs 9/9 at F26 |
| 75 | f26 §B | R2 blocked (account-level API 10042), file PUT → honest 503 | OPEN | binding still commented in worker/wrangler.toml (F26 §B); owner action |
| 76 | F26 §C#5 | Raw hex #1b1b20 in NearbyDetectOverlay → tokens | FIXED | F26: verify-visual-system 8/8 |
| 77 | F26 §E | Pushed to `github.com/Alightttt/ShareTexts` | WRONG | remote now github.com/0xalyt/ShareTexts (git remote -v); F26 text is historical |
| 78 | F26 | Room/Registry/Metrics/Stats/Lobby DOs deployed, migration v1→v5 additive | FIXED | F26 §A; health 200 today |

## F27-completion-report.md

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 79 | F27 §1 | OG art installed, `?v=19` everywhere | WRONG | superseded: `?v=21` (12 refs in index.html; F28 apple-grade bumped to v21) |
| 80 | F27 §2 | Landing title "AirDrop for everyone — ShareTexts" | FIXED | live page grep → "AirDrop for everyone" on sharetexts.online |
| 81 | F27 §3 | Header lockup mark 34px / word 31px | UNKNOWN | BrandLockup numbers not re-measured in P0 (grep "34" no hit in BrandLockup — sizes may be inline vars; STEP 5 visual) |
| 82 | F27 §7 | Pushed to github.com/Alightttt | WRONG | remote renamed (see #77) |

## Prior F28 (apple-grade pass, ca53b59)

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 83 | F28-old §2 | Alightttt → 0xalyt on "all live surfaces", 8 refs only in dist/ + F26/F27 | WRONG | `git grep -il alightttt` → F26, F27, docs/claims.md, **scripts/seo-routes.mjs:102** (live source generates the link!) — not only archives. Fix belongs to STEP 8a |
| 84 | F28-old §2 | Package renamed react-example → sharetexts | FIXED | package.json `"name": "sharetexts"` |
| 85 | F28-old §2 | docs/claims.md: 6 TRUE / 6 OVERSTATED / 2 FALSE / 1 UNVERIFIED | FIXED | docs/claims.md:41 records the sameAs FALSE→replaced |
| 86 | F28-old | Emoji PNG pipeline removed, Unicode glyphs (Phase 3) | FIXED | public/emoji-apple absent; EmojiReaction.tsx:16-19 documents removal |
| 87 | F28-old §7 | 276 KB entry vs 110 KB budget — open risk | OPEN | docs/p0-baselines.md; no Lighthouse CI to gate it |
| 88 | F28-old §7 | Live gate re-run "pending merge + owner approval" | FIXED | main merged (d5ca699); smoke-live is STEP 4/8 |
| 89 | F28-old §5 | Gates green on local prod build :3010 | FIXED | results table in F28-old; individual suites re-run per area in P0 (STEP 3e re-runs all) |

## docs/claims.md (prior ledger)

| # | Source | Finding or claim | Status | Proof |
|---|---|---|---|---|
| 90 | claims.md | 15 claims audited, wording fixed | FIXED | docs/claims.md exists (56 lines); full re-check is STEP 6 |

Rows: 90 (>= 40 required). Rows re-verified by command this session: 1-3, 5-9, 14-15,
26, 30-31, 35-36, 44-51, 53, 59-60, 62, 64-67, 70-73, 74 (health), 79-80, 83-84.
Rows marked NOT VERIFIED in prose are doc-sourced and were not re-run in P0.
