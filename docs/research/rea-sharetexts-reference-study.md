# REA-Powered Reference Study — ShareTexts

**Date:** 2026-10-17 · **Thread:** radar-UI / REA integration · **Branch:** main @ 7565880
**Mission:** replace assumptions with evidence from comparable products, then implement a bounded set of improvements.

---

## 1. REA setup status

| Item | Value |
|---|---|
| Package | `rea-agents@6.5.0` (MIT; optional native providers Ghidra/IDA/JADX are separately licensed and **not installed** — not needed for web investigation) |
| Node requirement | `^22.19.0 \|\| ^24.11.0 \|\| >=26.0.0` — local Node v24.19.0 ✅ |
| Setup command | `npx rea-agents@latest setup --client claude_code --client codex --yes --json` (after a `--dry-run --json` plan review) |
| Applied | MCP registration `cmd.exe /d /c npx -y rea-agents@6.5.0 mcp` added to `~/.claude.json` and `~/.codex/config.toml`; skill `reverse-engineer-anything` v42 (207 tools) installed to `~/.agents/skills/` + `~/.claude/skills/` |
| Backups | `~/.claude.json.rea.backup`, `~/.codex/config.toml.rea.backup` (installer-created) |
| Doctor | `healthy: true`, registrations `aligned` for claude_code + codex |
| Restart note | The MCP tools become available inside a client **after restart**. This Freebuff session predates the install, so REA's MCP tool surface was **not callable mid-session**; REA was driven through its **CLI**, which needs no restart. |
| Not a runtime dep | REA was not added to package.json; nothing bundled. |

### Harmless test investigation (required before relying on REA)
`rea analyze-javascript-application <this repo's dist> --json` — static reconstruction of our own built bundle (authorized target, no execution). **Exit 0**, ~203 MB evidence JSON covering 47 artifacts, with honest inline coverage limitations (e.g. unanalyzed inline script bodies listed per file). Toolchain verified end-to-end.

**Limitations recorded:** passive browser observation requires an eligible attached CDP browser target and cannot click/navigate; native providers unconfigured; scenario capture (`capture-browser-scenario`) available but not required this pass.

## 2. References and exact workflows investigated

| Ref | Workflow examined | Method | Evidence |
|---|---|---|---|
| Apple AirDrop | Discovery scene, accept/decline card, Liquid Glass | Official docs (support.apple.com, HIG, WWDC25) | [119857](https://support.apple.com/en-us/119857) · [HIG Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) · [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) · [WWDC25/356](https://developer.apple.com/videos/play/wwdc2025/356/) |
| LocalSend | Discovery display, accept/decline handshake, failure states, multi-recipient | **Source-level**: official repo UI strings + page code read (open source) | [en.json](https://github.com/localsend/localsend/blob/main/app/assets/i18n/en.json) · [send_page.dart](https://github.com/localsend/localsend/blob/main/app/lib/pages/send_page.dart) · [device_list_tile.dart](https://github.com/localsend/localsend/blob/main/app/lib/widget/list_tile/device_list_tile.dart) · [protocol](https://github.com/localsend/protocol) |
| PairDrop | Persistent pairing trust, discovery sources, transfer states | **Source-level**: official repo UI strings + README | [README](https://github.com/schlagmichdoch/PairDrop) · [en.json](https://github.com/schlagmichdoch/PairDrop/blob/master/public/lang/en.json) |
| Duolingo | Milestone celebration design, outcome-responsive feedback | Official design blog | [streak milestone](https://blog.duolingo.com/streak-milestone-design-animation/) · [character animation](https://blog.duolingo.com/world-character-visemes/) |
| Blinkit | Explicit state progression, prominent CTA choreography | Interaction archive | [60fps.design shots](https://60fps.design/shots/blinkit-secret-santa-intro-animation) |
| Linear | Typography/elevation discipline | Official redesign article | [redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) |
| ShareTexts (self) | Decline path, connected beat, searching state | Direct code + live two-browser Playwright probes | this thread's probes + `verify-*` suites |

## 3. Main findings (observation ≠ inference)

**F1 — Decline must reach the other device immediately.** OBSERVED (LocalSend source): the sender sees *"The recipient has rejected the request."*; distinct rejected/busy states exist. OBSERVED (PairDrop): Accept/Decline is a first-class request dialog. OBSERVED (Apple HIG): alerts reserve Cancel on the leading side, default action trailing — decline is an explicit, labeled action. **ShareTexts (direct code evidence):** the incoming card's Decline routed through `closeOverlay` — it closed the popup locally and sent *nothing*; the inviter stayed in `inviting` until timeout, then a generic "declined or unavailable" error. The i18n key `nearby.declined` already existed in all 9 locales but was effectively unreachable in the immediate sense.

**F2 — Completion deserves one proportionate beat.** OBSERVED (Duolingo): celebrate the actual success moment with a characterful, bounded flourish. OBSERVED (Apple HIG Feedback): confirmation is reserved for activities important enough to warrant it; when success is expected, users "only need to know when it doesn't." Pairing is exactly such a milestone for ShareTexts. **ShareTexts:** ConnectHandshake's connected state is deliberately still (line draws + check fades) — correct restraint, but reads as "noted," not "done."

**F3 — Discovery states should look like one system.** OBSERVED (LocalSend): explicit "Nearby devices" area, search action, actionable troubleshooting. OBSERVED (ShareTexts): the landing searching row used a lone breathing ring — visually unrelated to the new radar overlay above it, so the two discovery surfaces read as two products.

**F4 — Native-only affordances must not be copied.** OBSERVED: LocalSend's multicast-UDP discovery and background transfers are platform capabilities a web app cannot assume; PairDrop (web, same constraints) solves trust with persistent pairing + shared secrets — which ShareTexts already matches via trusted tokens + auto-connect. Rejected: avatars/flags (no photo source exists; authored DeviceArt is the honest choice), multi-recipient send (bigger scoped feature), gamification (mission excludes it).

**F5 — Linear/Apple give no universal motion numbers.** OBSERVED: Linear documents no numeric scale/shadow/duration tokens in the sources read; Apple documents spring *behavior* (position/velocity preservation, interruptibility) but no canonical ms values. Inference: continue using the app's own documented motion ladder (`--motion-*`, 0.22/1/0.36 ease) rather than inventing "reference numbers."

## 4. Ranked opportunity matrix

| # | Finding | Evidence & confidence | Existing behavior | Proposed change | Impact | Effort | Risk | Verify | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | F1 decline silence | LocalSend source (high) + self-code (high) | Decline = local close; sender waits for timeout | Decline sends `answerInvite(from,false)` → inviter's existing declined-card path fires immediately; cooldown applies | High (trust) | S | Low (existing listener) | new E2E assertion | **P0 — implemented** |
| 2 | F2 connected beat | Duolingo blog (med) + HIG Feedback (high) | Still green check, no completion pulse | One-shot green ring ping from the check (Motion, reduced-motion flattened) | Med | S | Low | probe assertion + screenshot | **P0 — implemented** |
| 3 | F3 searching cohesion | Self-contrast (high) + LocalSend (med) | Lone breathing icon | Miniature two-ping radar using the overlay's own `.st-radar-ping` language | Med | S | Low | existing `nearby-searching` testid + screenshot | **P0 — implemented** |
| 4 | F1 sender-side copy | LocalSend strings (med) | `nearby.declined` generic | Distinct declined vs gone copy — key exists; revisit only if wording proves confusing in QA | Low | S | Med (9 locales) | manual | Deferred (works today) |
| 5 | Multi-recipient send | LocalSend (med) | Single-target rows | Multi-select composer | Med | L | High | — | Deferred (bigger feature, separate pass) |
| 6 | Persistent pairing via shared secrets | PairDrop (med) | Trusted tokens rotate with worker (trust downgrades on rotation — known limitation, documented in code) | Stable cross-session pairing identity | High | L | High (crypto, privacy review) | — | **Documented recommendation** — not mixed into a visual pass |
| 7 | Background/UDP discovery parity | LocalSend protocol (high: impossible) | Server-relay presence | — | — | — | — | — | **Rejected** — not available to web apps |

F-sequence protection: the F23/F24/F25 hero passes are accepted and pushed (HEAD = F25 defect pass). No hero changes in this pass. Existing well-working behavior preserved: mutual-confirm two-step overlay (own E2E contracts), trusted zero-tap flow, fallback code/QR/link group, three-tone surface grammar.

## 5. Implemented (this pass)

1. **Real decline** — incoming Decline now answers the invitation immediately; the inviter's existing `nearby.declined` failure card fires at once instead of after a timeout. New E2E coverage added to `verify-nearby-browser.mjs` (decline path had **zero** coverage before).
2. **Connected beat** — ConnectHandshake's connected state gains one-shot staggered green ring pings emanating from the check; tiles/type never move; frozen under reduced motion (MotionConfig) as a quiet opacity fade.
3. **Searching mini-radar** — the landing searching row reuses the overlay's ping language (two staggered `.st-radar-ping` rings + hairline ring), so both discovery surfaces now read as one system. `data-testid="nearby-searching"` preserved.

Before/after evidence: `public/_shots/` (searching row before: rows-desktop.png; after + decline + connected frames: captured in this pass — see verification section).

## 6. Verification (actual results, 2026-10-17)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | clean (exit 0) |
| Build | `npm run build` | passes (exit 0, seo-routes wrote) |
| Protocol suite | `node scripts/verify-nearby.mjs` | **28/28**, exit 0 (pipefail) |
| Nearby browser E2E | `node scripts/verify-nearby-browser.mjs` | **17/17**, 0 console/page errors — includes the NEW decline assertions (C sees declined card immediately; D's overlay detaches) |
| Auto-connect | `node scripts/verify-autoconnect.mjs` | PASS, exit 0 |
| Trusted auto-connect | `node scripts/verify-autoconnect-trusted.mjs` | **6/6**, exit 0 |
| One-screen landing | `node scripts/verify-landing-onescreen.mjs` | 0 of 7 sizes failing, exit 0 |
| Mobile UI | `node scripts/verify-mobile-ui.mjs` | ALL GREEN, exit 0 |
| Theme | `node scripts/verify-theme.mjs` | ALL GREEN, exit 0 |

E2E note: the first decline assertion used an instant DOM count for "overlay closed" and raced the optimistic local close (16/17). An isolated two-browser probe (`probe-decline-debug.mjs`, since removed) proved the overlay detaches <300 ms after the click and the inviter's card appears at once — the assertion was corrected to wait for detachment (5 s grace) with a dialog-text dump on lingering, which distinguishes a slow close from a re-open. Not a weakened check: it still fails unless the overlay actually closes.
