# ShareTexts — handover for the next coding agent

Read this first. It is the owner's vision, the house rules, the exact workflow
(including how and when to push), and the honest state of the work as of
**20 Nov 2026**. Nothing here overrides a gate in the repo; where they disagree,
the gate wins and you fix the code, not the gate.

---

## 1. What the product is

ShareTexts is **"AirDrop for everyone"** — a browser-to-browser transfer tool.
Two devices, one page, nothing to install, no account. Send text, links, files,
images, video; the receiving device gets originals (no compression), and when
the room closes everything disappears. Rooms can also be **hosted for 7 days**
so a link can be opened later.

Live surface: the landing (`/`), a send/receive room (`/r/:code` and the
`?room=` entry points), `/docs`, legal pages, and a small marketing set
(`/guides/*`, comparison pages).

Stack: **Vite + React + TypeScript** front end, an **Express + Socket.IO**
server (`server.ts`, bundled to `dist/server.cjs` by esbuild), an optional
**Cloudflare Worker** in `worker/` for edge pieces. No native app; there is no
Expo/React Native project anywhere — do not add one.

## 2. The owner's vision (this is the brief, not decoration)

Written from repeated instructions across sessions. Treat it as acceptance
criteria, not mood:

- **Apple-level polish.** Every surface should feel considered: typography,
  spacing, motion, the weight of a shadow. "If it looks like a template, it is
  wrong."
- **Buttery smooth, native feel**, on a low-end Android on 3G *and* a 6GHz
  desktop, in every browser. No jank, no layout shift, no blank frames.
- **Animations are never the only carrier of meaning.** On a device with
  animations switched off, *everything must still work and still be
  understandable* — the information an animation would have shown must already
  be in the still state. This is the single most repeated instruction.
- **Everything is touch-, click-, gesture-friendly and interruptible.** A
  gesture in flight must be able to change its mind mid-way.
- **Soul.** The app must not feel dead: micro-interactions, haptics on the
  meaningful actions (never a buzz for every tap), honest feedback, quiet
  details.
- **Honesty in copy.** No invented numbers, no fake social proof, no claim the
  protocol cannot keep (e.g. "delete" says *this device's copy*, because the
  other device keeps what it received).
- **"Don't make mistakes. Strictly."** Verify before saying done. Report what
  was not checked.

Taste rules that have already been settled by the owner — do not re-litigate:

- The hero headline is one statement on two lines at **equal weight** (56px,
  700, full ink), centred at every width: `Share [cycled noun]` /
  `between any devices easily.`
- Under it, a pill: **"Introducing Airdrop for everyone"** (key
  `home.subheading`), then the live count, then the two glossy doors.
- The "Three things it does" stories are **hand-drawn vector scenes**
  (`src/components/landing/StoryArt.tsx`), not screen recordings. Keep it that
  way; the recordings were removed on purpose.
- One corner-radius family on the landing (≤ 4 radii), sections on one left
  edge and one width, 4px spacing grid, ≥ 48px seams, ≥ 48px primary targets.
  `verify:basics` enforces all of this.

## 3. House rules (non-negotiable)

1. **Every user-visible string goes through `t()`** and exists in **all 11
   locales**: `en, de, es, fr, hi, ja, pt-BR, pt-PT, zh-Hans, zh-Hant, ar`
   (`src/lib/messages/*.ts`). Adding a key to `en.ts` alone breaks the gate.
   Arabic is RTL — check it.
2. **Never weaken or skip a gate.** No `skip`, no loosened assertion, no
   `// @ts-ignore`, no disabling a test to get green. If a gate is genuinely
   wrong, say so and fix the gate *visibly*, with the reason in the commit.
3. **`npm run verify:claims` must stay clean** — it greps marketing copy for
   claims the product cannot support. Reword copy rather than exempting it.
4. **`npm run smoke:local` must be green before anything touching `src/` or
   `public/` is pushed.**
5. **Secrets never enter the repo.** No keys in code, `.env` files, logs or
   chat. `.env` is the owner's; don't print it.
6. **The owner has pre-approved pushes to `main`** for this project (that is
   the only branch in use). Do not push to other branches or force-push. Do not
   open PRs. Do not `git push` anything you have not committed deliberately.
7. **Never stage `docs/redesign/shots/m2-desktop-*.png`** — build scripts rewrite
   them; committing them is noise.
8. Work inside `C:\Users\garvd\ShareTexts\.freebuff\ShareTexts`. That is the
   project root.

## 4. How to run it

```bash
cd "C:/Users/garvd/ShareTexts/.freebuff/ShareTexts"
npm run dev                 # tsx server.ts — dev server, default port 3010
PORT=3010 npm run dev       # force the port (see gotcha below)
```

Production check (what the owner looks at):

```bash
npm run build                                   # 3–6 minutes on this machine
PORT=3023 NODE_ENV=production node dist/server.cjs   # http://127.0.0.1:3023
```

**Gotchas that have already cost hours:**

- `PORT` sometimes arrives as `0` from the runner environment; the server then
  binds a random port and prints `http://0.0.0.0:0`. Always pass `PORT=3010`
  explicitly when starting dev yourself.
- **Restart the production preview after every build** — `dist/` is what it
  serves, and the old process keeps the old bytes.
- Cold Vite dev SSR is slow on this machine (6–60 s for the first `/`). A gate
  or a Playwright `page.goto` timing out at 30 s usually means "cold and
  loaded", not "broken". Warm it with `curl` first, then run the gate.
- **Kill leftover processes between sessions.** Orphaned `tsx server.ts` and
  `dist/server.cjs` trees from interrupted runs will starve the machine and
  make every browser gate time out. Find them by PID, never by name pattern:
  ```bash
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Select-Object ProcessId,CommandLine"
  ```
  Kill by port for a server: `netstat -ano | grep :3010` → `taskkill //PID <pid> //F`.
- Builds and any command over ~4 minutes must run as a **background** command
  with output redirected to a file, then be polled. Do not `nohup … &` inside a
  synchronous command.
- `page.goto` / screenshots: the in-app preview tools are unreliable here.
  Write a throwaway Playwright script under `scripts/_tmp-*.mjs`, write PNGs to
  `film/out/`, read those images, then delete the script.

## 5. How to verify (the honest order)

Cheap → expensive; stop when the change is covered:

| Command | What it protects |
|---|---|
| `npx tsc --noEmit` (`npm run lint`) | types |
| `npm run verify:claims` | marketing honesty |
| `npm run build` | the real artifact |
| `BASE_URL=http://127.0.0.1:3023 node scripts/verify-basics.mjs` | landing layout law |
| `npm run smoke:local` | end-to-end: create room, pair, send text/link, no console errors |
| `npm run verify:layout` | `desktop, sheets, no-flash, room-paint, basics` in a real browser |
| `npm run verify:bundle` | entry ≤ 180 KB gzip, locale chunks, no empty chunk |

Feature-specific gates already exist and should be used instead of inventing
new ones: `verify:landing-motion`, `verify:entrances`, `verify:tabs`,
`verify:sheets`, `verify:sheet-drag`, `verify:composer`, `verify:mobile-ui`
(`test:mobile`), `verify:states`, `verify:form`, `verify:typing`,
`verify:room-feed`, `verify:icons`, `verify:neutrals`, `test:theme`,
`verify:reactions`, `verify:resume`, `verify:csp`, `verify:seo`,
`verify:fast` (the pre-push-safe subset of unit-ish checks).

**Known pre-existing reds / flakes** (not caused by your change — say so, don't
"fix" them by weakening):

- `verify:visual-system` — raw hex in `HeroDeviceDemo.tsx` / `QrArt.tsx`,
  and a `rounded-br-[3px]`.
- `verify:dna` — sheet-drag flakes.
- `verify-browser sheets` — flakes when run inside the combined gate; reruns
  standalone green (14/14).

## 6. How work is committed and pushed

Commit style in this repo: a **plain-English imperative subject**, then a body
that explains *why* (the problem, what was rejected, what the trade-off was) —
see `git log` for the register. No emoji in the subject.

The repo has hooks installed (`git config core.hooksPath .githooks`):

- **pre-push** runs `npm run verify:bundle` and then, if the push touches
  `src/` or `public/`, `npm run verify:layout`. A red pre-push **aborts the
  push**. That is the intended behaviour: fix the code. `SKIP_PREPUSH=1` exists
  for genuine emergencies only — never use it to ship an unrelated change.
- If the pre-push browser gates die with `page.goto` timeouts, the cause is
  almost always the dev server (cold/orphaned), not your diff: kill the port,
  start one clean server, warm it with `curl`, push again.

Because pre-push can take 4–8 minutes here, run `git push` as a **background**
command with a log file and poll it, otherwise the tool call is cancelled
mid-push and you cannot tell whether the push landed.

Where things go: remote is `https://github.com/0xalyt/ShareTexts.git`, branch
`main`. Owner pre-approved; no PRs.

## 7. Code map

```
server.ts              Express + Socket.IO: rooms, presence, uploads, SSR shells
src/views/             SingleScreenApp (landing + shell), ChatView, SpaceView,
                       NearbyDevices, Docs, Legal, ReceiveScreen
src/components/        The component layer. Notable:
  ShuffleHeading.tsx     hero: "Share [noun]" measured slot + promise line
  landing/StoryArt.tsx   the three hand-drawn landing scenes
  marketing/             LandingSections (ThreeThings, SectionHead, FAQ), FaqSection
  MessageCard.tsx        a message row: long-press / right-click / action menu
  MessageActions.tsx     tapback strip + action menu (portal)
  PullToRefresh.tsx      grain-ring dissolve, wired to chat + space
  ui/                    Detent, ScreenStack, sheets and dialogs
src/lib/               i18n + messages/ (11 locales), motion tokens, haptics,
                       loops.generated.ts (legacy, now unused by the landing),
                       space/useSpaceClient, richText, itemState, speedEngine
src/styles/apple-dna.css   the component layer: glossy buttons, hero type,
                           `.st-*` motion recipes, `.st-art-*` (new)
src/film/              the hero film (canvas) + `?mode=hero` capture mode
scripts/               every gate (verify-*.mjs), smoke, film render, generators
worker/                optional Cloudflare Worker
```

Motion law: `MotionConfig reducedMotion="user"` wraps the app (`src/main.tsx`),
and CSS motion lives behind `@media (prefers-reduced-motion: no-preference)`
with the still state carrying the meaning. Keep both.

## 8. State on 20 Nov 2026

**Everything is pushed.** `main` is level with origin as of the handover
commit, including `729bcf8` (the equal-weight, centred promise line) and this
document. Confirm with `git status -sb` before you start — if it is ahead, a
push is the first job (see §6; warm :3010 with one `curl` first, the pre-push
browser gates only time out on a cold server).

**Shipped this week:** the three landing graphics (`3da2921`), the hero film
rebuild (`bc33a37`), the pull-to-refresh dissolve (`319df43`).

**Known bug, diagnosis finished, fix not written:** the message action menu
(`src/components/MessageActions.tsx`) is unreachable by keyboard. It opens,
renders `role="menu"` with `role="menuitem"` rows, but never moves focus into
it, so a keyboard user's Tab walks to the next message; Escape closes without
returning focus. The fix is specified in the file's own terms:

- capture `document.activeElement` on open, focus the first `[role="menuitem"]`
  (with `preventScroll`) on the next tick;
- `ArrowUp`/`ArrowDown`/`Home`/`End` roving focus inside the menu;
- `Escape` closes **and** restores focus; `Tab` closes without restoring
  (it means "I'm done"); a pointer-outside close must not steal focus back;
- keep the listeners keyed on `open` alone and read `onClose` through a ref —
  `MessageCard` passes a fresh arrow every render, so a naive effect re-runs
  (and would re-focus) on every progress tick.

**Temporary files to delete if present:** `scripts/_tmp-audit.mjs` (a
throwaway a11y sweep: unnamed controls, click-traps, sub-44px targets,
duplicate ids, focusables inside `aria-hidden`). If it survives, it is worth
running once against `/?audit=1` and acting on what it prints.

**Open threads worth taking next, in the owner's priority order:**

1. A real click-through of Send → pair → room → receive on a phone viewport,
   logging every rough edge, then fixing them in order. The gates cover the
   big mechanics; this is where "soul" is won or lost.
2. The chat surface in the same detail: arrival, send, copy, delete, tapbacks,
   selection mode, scroll anchoring, composer behaviour on a real phone
   keyboard.
3. Accessibility sweep: focus order, visible focus rings, `aria-live` on
   arrival/errors, landmarks, the audit script above as the starting list.
4. Reduce-motion parity audit, surface by surface: for each animation, ask
   "what does a user learn from this that the still state does not say?"
