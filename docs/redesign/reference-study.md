# Reference study — measured facts (P0 STEP 7)

Measured, sourced facts from the four DESIGN.md §15 references called out for
this prompt: **obry.app**, **Apple**, **Duolingo**, **popl.co**. Observation only —
no recommendations here; what to take / not take stays in DESIGN.md §15 and the
P-prompts. Every fact is a quote, a count, or a figure with its URL. Limits of
text-only page reads are stated (no rendered-viewport claims unless measured).

The older, broader study (LocalSend, PairDrop, AirDrop, Blinkit, Linear) stays
at `docs/research/rea-sharetexts-reference-study.md`; this file does not
duplicate it.

---

## obry.app — landing structure

Sources: https://obry.app/ , /privacy , /terms , /changelog , /robots.txt , /sitemap.xml

| # | Fact | Value |
|---|---|---|
| 1 | Section order (text-level) | hero ("Screen Memory") → "What Obry does" → "Coming soon" → FAQs → closing message/CTA → availability line |
| 2 | Hero headline | "Screen Memory. Stickies made by capture. Moved by gesture." — **58 characters** |
| 3 | Feature descriptions under "What Obry does" | **10** (screen capture, docking, shake to drop, text editing, scroll capture, lock and fade, Recents, card color, Apple Notes sync, Calculator) |
| 4 | FAQ | **7 questions**, answers ≈ 29, 90, 30, 35, 34, 60, 35 words |
| 5 | Price/trust line (exact quote) | "Free for 14 days. Then $12. One-time purchase." — repeated near the closing CTA |
| 6 | Availability line | "Available for macOS 14.0 and higher." |
| 7 | Key-hint example (exact quote) | "Press ⌥Tab from anywhere on your Mac." (chip styling not verifiable from text read) |
| 8 | Sign-off (exact quote) | "With Obry." — follows "Captures stay within reach." at the close |
| 9 | Footer contents | closing message, Download, Send to Mac, repeated trial/price line, availability line; no footer nav links exposed |

**Limits:** controls-above-fold count, big-vs-small feature block layout,
video-vs-static media, fonts, gradients and shadows are NOT measurable from a
text-only read — recorded NOT VERIFIED. DESIGN.md §15's claims about "3 big
features then small ones" and "key-hint chips" remain UNVERIFIED visually.

---

## Apple — homepage structure + HIG numbers

Sources: https://www.apple.com/ · HIG Typography, Color, Layout, Motion ·
https://developer.apple.com/design/tips/ · WWDC 2020/10175 · WWDC 2018/803

| # | Fact | Value |
|---|---|---|
| 1 | apple.com desktop nav items | **11 text links** (Store, Mac, iPad, iPhone, Watch, Vision, AirPods, TV & Home, Entertainment, Accessories, Support) |
| 2 | Hero CTAs | **2** ("Learn more" + "Pre-order"); a second promo below carries "Learn more" + "Buy" — fold placement NOT VERIFIED |
| 3 | Hero headline length | 33 characters (rotating campaign copy) |
| 4 | Hero composition | product-image led; headline + CTAs support the imagery |
| 5 | Dynamic Type categories | xSmall→xxxLarge; **Body style scale: 14, 15, 16, 17, 19, 21, 23 pt**; body default **17 pt** (Large) |
| 6 | macOS body baseline | **13 pt** |
| 7 | Tracking guidance | tracking adapts to point size; SF Pro Text→Display transition is variable across **17–28 pt** (WWDC 2020/10175); don't bolt arbitrary letter-spacing onto system text |
| 8 | Color guidance | "judicious use of color" — color communicates/conveys brand/shows status/clarifies; accent = emphasis, not a substitute for labels |
| 9 | Touch target | **44 × 44 pt** minimum (design tips) |
| 10 | Margins / safe areas | no single universal number in current HIG — respect system margins, guides, safe areas |
| 11 | Motion | fluid, responsive, natural; response, interruption/redirection, spatial consistency (WWDC 2018/803). **No universal animation-duration number exists in the HIG** — do not cite one as an Apple rule |

**Limits:** HIG page is dynamically rendered; the fetch exposed title/description
rather than the full sizing table — figures above are the Body-style scale, not
every text role.

---

## Duolingo — design language, celebrations, copy

Sources: blog.duolingo.com — "Shape language: Duolingo's art style",
"Building character", "You're on fire! (streak milestone)",
"The habit-building research behind your Duolingo streak", "Introducing the new
Duolingo learning path", "Art meets technology" · secondary: Canny Creative
brand guide, Creative Bloq, Mobbin, github.com/nexu-io/open-design (third-party)

| # | Fact | Value | Source tier |
|---|---|---|---|
| 1 | Named principles | "minimalistic, playful"; quick to produce · clear to understand · fun to learn with · attention grabbing ("people naturally prioritize objects in motion") | official blog |
| 2 | Style direction | "vibrant colors and rounded buttons on a white background" (no numeric radius/stroke given) | official blog |
| 3 | Custom typeface | **Feather Bold** (display; made with Fontsmith + Johnson Banks, 2019); copy face reported as DIN Next Rounded | secondary |
| 4 | Palette | Feather Green **#58CC02**, Mask Green #89E219, Eel #4B4B4B, Snow white; secondary: Macaw #1CB0F6, Cardinal, Bee, Fox, Beetle, Humpback | secondary (Canny/Mobbin) |
| 5 | Correct/wrong state colors | green = correct, red = wrong (two-color rule); third-party values #58CC02 / #FF4B4B | secondary |
| 6 | Button spec | official posts give none; third-party reconstruction: 16px radius, 4px darker bottom edge, press removes edge + moves down 4px | third-party (NOT Duolingo's spec) |
| 7 | Celebration triggers | correct-answer character animation; mid-lesson animation after a streak of correct answers; streak milestones at **1 week, 1 month, 100 days, 1 year** (Phoenix Duo "power up"), share card to save/post | official blog |
| 8 | Measured effect of streak animation | new animation after extending a streak raised D7 retention of new learners by **+1.7%** | official blog |
| 9 | Confetti/sound as milestone elements | NOT established by these posts (character reactions + lip-synced audio are documented separately) | — |
| 10 | Warm copy examples (verbatim) | "Congrats on proving you're a legend!" · "Duo is waiting for you to practice today." · "Congratulations on all your hard work, and your willingness to keep up your language learning habit!" | official blog |

**Limits:** no official numeric font-weight range, radius, stroke or shadow
tokens found; keep those provisional until checked against Duolingo's current
official brand guidelines.

---

## popl.co — share/connect flow

Sources: https://popl.co/ , /pages/digital-business-card , /pages/pricing ·
support.popl.co articles 8737311, 11720865, 8728463, 9289575, 8597943,
8856968, 9449660 · App Store listing 1503939262

| # | Fact | Value |
|---|---|---|
| 1 | Marketing headline (quote) | "Your AI GTM platform for in-person events." |
| 2 | Hero CTAs in page text | **1** — "Get Started Now." |
| 3 | Share path from home screen | 3 actions: open → card is already on home → tap **Share** → tap a method (QR / Link / NFC) — i.e. **2 taps after opening** when already on home |
| 4 | Share path from anywhere in app | tap Share icon → choose QR, Link, or NFC (2 taps) |
| 5 | Mechanisms | QR/PopCode, shareable profile link (LinkedIn, Instagram, X, WhatsApp…), NFC accessory, Wallet cards, Apple Watch, home/lock-screen widgets, email signature, iMessage, NameDrop |
| 6 | Recipient sees | profile opens **in the phone browser**; Save Contact flow: iPhone = Save Contact → View → Done (3 steps); Android = Save Contact → Save to Contacts → Add Contact (3 steps) |
| 7 | No-install claim (quote) | "No app needed!" (recipient needs no Popl app or accessory) |
| 8 | Branding caveat | sender can enable "Remove Popl Branding" to remove the recipient-side download prompt |
| 9 | Offline | without internet "only your Contact Card will be shared" (Offline Mode) |
| 10 | Pending/"waiting for scan" state | NOT documented — share steps are direct, no intermediate waiting screen found |
| 11 | Tiers | Free + **Pro $7.99/mo ($76.99/yr)** + **Pro+ $14.99/mo ($144.99/yr)** (US App Store); gated features: Single Link Mode (Pro+), custom subdomains (Pro+), branded NFC push (Pro+), custom QR/logo (Pro) |

**Limits:** above-fold control count and hero artwork are text-read limits —
placement at 1440×900 NOT VERIFIED.

---

## Consistency notes for later prompts

- Every "NOT VERIFIED" above is a visual question — the P-prompts that need it
  should measure it from a rendered screenshot, not from this text study.
- DESIGN.md §15 lines for these four references are consistent with these facts;
  no contradiction found (obry's "3 big features" claim is the one UNVERIFIED
  item — the page text lists 10 flat descriptions).
