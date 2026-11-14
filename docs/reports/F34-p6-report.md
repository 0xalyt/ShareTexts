# P6 — REACH AND SHIP

Branch `main`. Tag `before-p6` pushed before any change. Every commit below was
typechecked and built before it was pushed; `node scripts/smoke-live.mjs` ran
after each push.

| Step | Commit | State |
| --- | --- | --- |
| 1a voice | `61ed83c` feat(voice): plain, honest English | shipped |
| 1b language engine, RTL | `bbaa3ec` feat(i18n): script-aware detection, RTL | shipped |
| 1c front-door strings, Beta | `0f537334` feat(i18n): 320 front-door strings | shipped |
| 1d no hard-coded strings | `00f396e` feat(i18n): zero hard-coded UI strings | shipped |
| 2 states | `fb26850e` feat(states): quiet skeletons, honest errors | shipped |
| 3 screens and browsers | `6557438` feat(responsive): every screen size and browser | shipped |
| 4 search pages, title, robots | `3274054` feat(seo): prerendered pages that answer real searches | shipped |
| 4 perf | `b7755da` perf(landing): prewarm only where bandwidth allows | shipped, **budget NOT met** |
| 5 install / share target / offline | — | **NOT DONE** |
| 6 tokens, README, DESIGN v2.0 | — | **NOT DONE** |

---

## STEP 1 — English voice, language engine, new languages

### 1a Voice

`scripts/lint-voice.mjs` is a gate and it ran first, before any editing, against
the English file. It flags banned words ("instantly", "securely", "seamless",
"powerful", "revolutionary", "blazing", "effortless", "supercharge", …),
exclamation marks, sentences over twelve words, and the repeated
"No X, no Y" triad.

It found **14** real hits in 725 strings. Editing only those would have been a
gate passing on a technicality, so the pass also covered strings that read as
marketing without tripping a rule: 26 more edits across dashes, capitals,
unproven claims and honesty.

- Removed claims the product cannot prove: "instantly", "securely", the
  "Private" badge, and the demo's "No upload".
- The badge and the details row now say **Encrypted**, which is true and is the
  thing a reader actually wants to know.
- `docs/redesign/voice-changes.md` is **generated from `git diff HEAD`**, not
  written by hand, so it cannot drift from the code. 40 before → after rows.
- Result: `lint-voice: 729 strings, 729 non-empty — clean`.

### 1b Language engine and RTL

- `zh` split into `zh-Hans` / `zh-Hant`; `pt` into `pt-BR` / `pt-PT`
  (both by `git mv`, so blame survives).
- One registry, `src/lib/messages/registry.ts`, is now the only place a locale
  exists: code, native name, English name, direction, base language, status.
  `scripts/verify-locales.mjs` parses that file, so a locale cannot be added to
  the UI without also being checked.
- Detection ladder in `src/lib/i18n.tsx`: exact tag → language + script →
  language → next candidate → English. "Automatic" stays first in the sheet.
- Plurals and counts go through `Intl.PluralRules` (`tCount`), never `n === 1`.
- RTL for `ar`, `he`, `fa`, `ur`: `dir` on the document plus logical utilities
  (`ms-*`, `me-*`, `start-*`, `end-*`) on the screens the shell renders.
  Proof: `audit/p6-rtl/home-ar-390x844.png` and `home-en-390x844.png` —
  `dir=rtl`, mirrored layout, **0 px** horizontal overflow.
- pt-PT and zh-Hant **inherit** from pt-BR and zh-Hans and ship only their
  overrides (23 and 26 keys). A half-reviewed variant is never a hole.

### 1c Languages, honestly

Every non-English locale carries `STATUS = 'draft'` at the top of its file, and
the Language sheet shows a **Beta** chip for any draft locale. The owner
promotes one by changing that string to `reviewed`; nothing else changes.

`docs/redesign/translation-review.md` holds, per language, a checklist for a
native reader and **25 key strings to read aloud**, chosen because a wrong
translation there breaks trust or the flow.

`scripts/verify-locales.mjs` enforces: every locale has every key, placeholders
(`{code}`, `{n}`…) match exactly, and no English copy survives outside an
allow-list. The allow-list is a **ratchet** — `docs/redesign/i18n-allowlist.json`
may shrink, never grow; `--update-allowlist` is a deliberate act.

**Wave-1 languages (id, tr, ru, ko, it, bn) were deliberately NOT shipped.**
The budget went instead to translating the 320 front-door strings in the eight
locales that already existed: their still-English count fell from 65–80 to
27–46 per locale. Shipping six half-translated new languages would have made
the product look wider and feel worse. They remain listed as NOT DONE.

### 1d No hard-coded strings

`scripts/lint-hardcoded.mjs`: **0 hard-coded UI strings across 81 components.**
Four documented exceptions, each for a reason: `Legal.tsx` and `Docs.tsx` are
English legal/prose surfaces marked `lang="en"`; `CommandBar.tsx` renders dev
affordances; `ErrorFallback` in `App.tsx` renders *above* the i18n provider, so
it cannot read a locale; brand tokens and the `ABCD-72QK` code example are
not sentences.

---

## STEP 2 — Quiet skeletons, honest errors

- The shimmer sweep is gone. `SkeletonScreen` is band-coloured blocks that match
  the final layout: `room` (3 rows + composer) and `space`.
- `SkeletonGate` shows nothing for the first **300 ms** and then fades the
  skeleton in, so a fast load never flashes a placeholder.
- Both variants reserve the exact height of the content they stand in for, so
  the swap does not shift anything: measured 844 px before, 800 px content, no
  reflow of the rows above.
- Nearby keeps its designed radar "searching" state. A skeleton there would
  invent a wait that does not exist.
- Four error strings now say what happened and what to do next, in the Beacon
  voice ("The room closed. Start a new one — the code was only good while both
  tabs were open.").
- Proof: `audit/p6-states/docs-skeleton-390x844.png` — nothing at 150 ms, bands
  at 750 ms, content after.

---

## STEP 3 — Every screen, every browser

### The matrix

`scripts/capture-matrix.mjs` — twelve viewports (320×568, 375×667, 390×844,
844×390, 667×375, 820×1180, 1180×820, 673×841, 1344×841, 1280×800, 1920×1080,
2560×1440) × four peerless screens (Home, Send, Receive, Settings).

**48 captures, 0 with horizontal overflow.** Recorded per capture: overflow in
px, the first element wider than the viewport (none), and where the single
filled control sits. At 390×844 the Send button's bottom edge is at 56% of the
height — inside the thumb zone. The 320×568 case is the tight one and it still
has 0 px of overflow. Screenshots: `audit/p6-matrix/`.

Room and Space need a peer; they are exercised by the two-context flow in
`scripts/e2e.mjs`, not by a static capture.

### Engines

`scripts/lib.mjs` now launches whatever `BROWSER` names. CI switches from one
Chromium job to a matrix of **Chromium, Firefox and WebKit**, runs the full core
flow (create → join → transfer → reconnect → rejoin) in each, captures the same
twelve viewports in each, and uploads `audit/` as an artifact per engine.

**Not verified locally:** only Chromium is installed on this machine, so
Firefox and WebKit evidence is the CI run, not a screenshot I produced.

### In-app browsers

`src/lib/inAppBrowser.ts` detects WhatsApp, Instagram, Telegram, Facebook,
Messenger, LinkedIn and the generic Android `; wv)` host from the UA, plus the
capability gap (no WebRTC, no clipboard, no share) that actually matters — and
offers one quiet line with a way out:

| Context | What appears |
| --- | --- |
| WhatsApp, Android | "Some transfers need a full browser." + **Open in your browser** (an `intent://…#Intent;scheme=https;package=com.android.chrome` URL) |
| Instagram, iOS | "Tap ⋯, then Open in Safari." — no button, because there is no API to press |
| Chrome, any | nothing |

It is a single line above the hero, dismissible, never a modal, and it never
blocks: the Send/Receive flow still works underneath. Proof:
`audit/p6-inapp/whatsapp-android-390x844.png`,
`instagram-ios-390x844.png`, `plain-chrome-390x844.png` (absent).

The CTA is a text link, not a second filled orange button — one primary action
per screen still holds.

`docs/redesign/DEVICE-MATRIX.md` lists the five things a browser cannot prove
and which phone to test them on.

---

## STEP 4 — Speed and search

### What shipped

- Three new answer-first pages, generated by `scripts/gen-search-pages.mjs` from
  the existing guide shell so they cannot drift visually:
  `/iphone-to-windows`, `/android-to-iphone`, `/airdrop-alternative`.
  Served as real static HTML at their short URLs (dev and prod in `server.ts`,
  plus Vercel rewrites). Verified against a production build:
  `200`, 14.1 kB of HTML, unique `<title>` and `<h1>` on each.
- Each page: unique title, description and H1; the answer inside the first 40–60
  words; one fact per sentence; a visible FAQ whose questions and answers are
  copied **verbatim** into FAQPage JSON-LD; BreadcrumbList; canonical.
- The AirDrop page names where we lose: no offline transfer, slower on large
  videos, a code to type, a tab that must stay open. A comparison table says so
  in the first column.
- Homepage title now leads with the product:
  **"ShareTexts — send files and text between any devices, in your browser"**
  (67 chars). `AirDrop alternative` is the first H2 of the comparison page and
  appears in its body — the trademark is never first.
- `robots.txt` names the crawlers it welcomes instead of implying it with a
  wildcard: Googlebot, Bingbot, DuckDuckBot, Applebot, YandexBot, Baiduspider;
  GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-Web, PerplexityBot,
  Google-Extended, Applebot-Extended, CCBot. Session routes stay disallowed.
- `sitemap.xml` gained the three URLs. No `hreflang` was added: the localised
  UI has no per-language URLs, so any `hreflang` would promise a page that does
  not exist. The nine-languages claim was already absent from the JSON-LD —
  checked, nothing to remove.

### Two other title options

1. **"Send files and text between any devices — ShareTexts"** — same facts, the
   verb first. Reason: reads like an instruction, matches what people type.
   Rejected because it buries the brand at the end where a SERP truncates.
2. **"iPhone to Windows, Android to iPhone — ShareTexts"** — leads with the two
   searches with the most intent. Reason: matches query text closely. Rejected
   because it describes only the most common pairs, and the product is wider
   than that.

### Budgets — the honest numbers

Measured by `scripts/perf-landing.mjs` against a production build: 390×844,
Slow 4G (1.6 Mbit/s, 150 ms RTT), 4× CPU slowdown.

| Metric | Budget | Measured | Verdict |
| --- | --- | --- | --- |
| LCP | ≤ 2.0 s | **12.8–15.0 s** | **fail** |
| CLS | ≤ 0.05 | 0.000–0.001 | pass |
| INP (observed) | ≤ 150 ms | 0 ms observed | no interaction latency seen; not a lab INP |
| Landing JS, gzip | ≤ 110 KB | **305.7 KB** in the entry alone | **fail** |

Top five chunks by gzip size:

| Chunk | gzip |
| --- | --- |
| `index` (react + app shell + motion config) | 305.7 KB |
| `QRScanner` | 98.2 KB |
| `vendor-motion` | 47.1 KB |
| `ChatView` | 30.8 KB |
| `vendor-socket` | 12.7 KB |

Wire total on first load before the fix: **1,272 KB of JS in 7 requests**.

What was done tonight: the landing prewarmed 450 KB of room and scanner chunks
while idle, on every connection — including the slow ones where that bandwidth
is exactly what the first paint needs. They now load on the first sign of intent
when `navigator.connection` reports slow or data-saver. The QR scanner, motion
and the chat view were already separate chunks, so the lazy-loading the brief
asks for is in place for those four.

What is still over budget is the **entry chunk**: the whole app shell, react and
the motion config arrive before anything renders, and the landing has no
prerendered body to paint LCP from. The next move is route-level splitting (the
landing gets its own entry; the room, spaces and settings move behind their
existing lazy boundaries) plus a static hero in `index.html` so LCP does not
wait for hydration. That is a day of work, not an evening, and it is **NOT DONE**.

`npm run lh` is wired to Lighthouse 12 (mobile, simulated throttling, HTML
report to `audit/lighthouse.html`). **It was not run here** — it downloads on
first use and this machine is offline for that.

### Owner list (assets prepared, actions not taken)

- Search Console and Bing Webmaster verification: sitemap is live and correct,
  the three new URLs are in it; add the property and submit.
- Show HN: title = the page title; first comment links `/airdrop-alternative`.
- Product Hunt: same three pages are the gallery captions' source of truth.
- AlternativeTo: list under "AirDrop alternatives" and "File Transfer".
- Subreddits: r/selfhosted, r/Android, r/apple — the honest comparison page is
  the thing to link, not the homepage.
- GitHub topics: `file-transfer`, `webrtc`, `pwa`, `privacy`, `no-account`.

---

## Checks run

`tsc --noEmit` clean · `npm run build` clean (build marker, CSP pins) ·
`lint-voice` clean (729 strings) · `lint-hardcoded` 0/81 ·
`verify-locales` 11 locales green · `verify-brand-assets` 28 green ·
`capture-matrix` 48 captures / 0 overflow · new routes 200 with unique titles
against a production build · `smoke-live` GREEN after every push.

## NOT DONE

1. **Wave-1 languages** (id, tr, ru, ko, it, bn) — not started; the budget went
   to finishing the eight existing locales. Owner still has 6 to add.
2. **Landing performance budget** — LCP 12.8 s and 305.7 KB entry JS against
   2.0 s and 110 KB. Needs route-level splitting, not a tweak. Reported above
   with the top five chunks and the plan.
3. **Firefox and WebKit locally** — CI only; no local screenshot.
4. **Prerendered landing body** for LCP — the five prose routes have real HTML;
   the homepage still paints from JS.
5. **Tier B — Step 5 entirely**: install nudge, Share Target, desktop shortcuts
   sheet, what's new, offline page, Report row in Space More.
6. **Tier C — Step 6 entirely**: token consolidation with a zero-diff proof,
   README rewrite, DESIGN.md v2.0, final QA sweep.
7. **Lighthouse run** — `npm run lh` is wired and documented, not executed.

---

## 5 things the owner checks on a real phone

1. **Language "Automatic" after changing the phone's language.** Change iOS or
   Android to Spanish (or any of the eight), reopen the site: the page should be
   in that language with no reload, and the Language sheet should show
   **Automatic** with a tick.
2. **A Beta language.** Pick Japanese (or any locale not marked reviewed) and
   confirm the **Beta** chip appears next to it in the Language sheet — that
   chip is the promise that no native reader has approved it yet.
3. **The Share Target** — NOT DONE this round; test it after Step 5 ships.
   Until then, the check is: share a photo from the Android gallery to
   ShareTexts and confirm nothing breaks.
4. **Installing the app.** Safari → Share → Add to Home Screen; Chrome →
   Install. Open the installed app: it must be standalone with no address bar,
   and one transfer must work inside it.
5. **The first transfer from a WhatsApp link.** Send `sharetexts.online` to
   yourself in WhatsApp, open it there: the "Open in your browser" line must
   appear once, the Android button must actually leave WhatsApp, and the iPhone
   instruction must match what the ⋯ menu shows.
