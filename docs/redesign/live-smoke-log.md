# Live smoke log (DESIGN.md §0d)

After each push: wait until https://sharetexts.online serves the new
`<meta name="sharetexts-build">`, then run
`node scripts/smoke-live.mjs --expect <marker>` and append the result here.

## 2026-10-23 — marker `8edbc79ba8fd` (P0 STEP 8, first-ever run with marker)

Command: `node scripts/smoke-live.mjs --expect 8edbc79ba8fd`

| Check | Result |
|---|---|
| https://sharetexts.online answers 200 | PASS (200) |
| build marker === 8edbc79ba8fd | PASS (got 8edbc79ba8fd) |
| two devices paired (code …395) | PASS — 10 381 ms to connected, room up in 15 006 ms |
| message A → B arrived within 15 s | PASS (12 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | **FAIL** — 1 pre-existing CSP violation (see below) |

**[smoke-live] 1 FAILURE(S)** — the failure is B1 (already filed, STEP 5), not
a regression of this push: `vercel.json`'s CSP header copy pins the stale
`sha256-dlnEh4mZ…`, so the pre-paint theme bootstrap (script body hashes to
`sha256-eMqzSGqQ…` LF-normalized) is blocked on the live site. Both browser
contexts logged the identical violation. `git diff --stat
21cbd26..HEAD -- index.html vercel.json` is empty: this push touched neither
the script nor the pin. server.ts's own two pins are correct; only the
Vercel header copy is stale. Fix slot: P-token/hygiene (re-pin + pin-parity
gate), tracked as B1.

Console warnings (3, noise by design): `signaling worker redirect:
sharetext-signaling.garv29devra.workers.dev →
sharetext-signaling.alighttt.workers.dev` — the deployed build's baked
`VITE_SIGNALING_URL` is the previous worker; the boot-probe redirect picks
the current worker (which speaks the newest protocol) and pairing/message
checks pass over it. `scripts/verify-seo.mjs` already classifies this
warning as WORKER_NOISE. Owner note (not a bug): updating the Vercel env
var `VITE_SIGNALING_URL` to the current worker would silence it and remove
the probe hop.

Conclusion: marker pipeline works end to end (push → Vercel build stamps
VERCEL_GIT_COMMIT_SHA → live meta → smoke `--expect` pins it). Live pairing
and delivery verified on the new build.

## 2026-10-23 — marker `9e0b8297c0b5` (P0 STEP 9, docs-only push)

Command: `node scripts/smoke-live.mjs --expect 9e0b8297c0b5`

| Check | Result |
|---|---|
| answers 200 | PASS |
| build marker === 9e0b8297c0b5 | PASS (live on poll 1) |
| two devices paired (code …808) | PASS — 12 679 ms to connected |
| message A → B | PASS (5 ms) |
| sender echo | PASS |
| no console errors | **FAIL — same pre-existing B1 CSP violation** (identical hash detail as the 8edbc79 run) |

[smoke-live] 1 FAILURE(S). Identical to the previous run: the only failure
is B1 (stale vercel.json pin), filed and assigned P-token/hygiene. No new
failures from this push.

## 2026-10-24 — marker `459a3ac537d6` (P1a STEP 1 — verify-emoji gate)

Command: `node scripts/smoke-live.mjs --expect 459a3ac537d6`

| Check | Result |
|---|---|
| answers 200 | PASS |
| build marker === 459a3ac537d6 | PASS (live on poll 1) |
| two devices paired (code …229) | PASS — 8 523 ms to connected, room up in 13 010 ms |
| message A → B | PASS (4 ms) |
| sender echo | PASS |
| no console errors | **PASS** |

[smoke-live] GREEN against https://sharetexts.online.

Unexpected vs the P1a prompt's expectation ("still 5/6 (B1) until STEP 2"):
this run is 6/6 — the B1 CSP console violation no longer fires on live.
Most likely `899d19e` (fix(seo): derived CSP pins) corrected the live pin
after the P0 runs recorded 5/6. Not claimed as a B1 fix yet: the pin is
still hand-derived, not build-time-verified, so STEP 2 still ships
`pin-csp --check` in the build chain and `verify-csp --live` to prove it.

## 2026-10-24 — marker `2429e15e5f72` (P1a STEP 2 — B1 CSP: build-time pin gate)

Command: `node scripts/smoke-live.mjs --expect 2429e15e5f72`
Commit: `2429e15` — fix(csp): pin real inline-script hashes at build time, LF line endings

| Check | Result |
|---|---|
| answers 200 | PASS |
| build marker === 2429e15e5f72 | PASS (live on poll 1) |
| two devices paired (code …861) | PASS — 6 544 ms to connected, room up in 10 175 ms |
| message A → B | PASS (5 ms) |
| sender echo | PASS |
| no console errors | **PASS** — no CSP violation |

[smoke-live] GREEN against https://sharetexts.online (6/6).

B1 proof (same push): `node scripts/verify-csp.mjs --live` GREEN — the deployed
`content-security-policy` header on all five fetched pages (/, /about, /docs,
/privacy, /terms) carries exactly the two pins the shipped inline scripts hash
to (`eMqz…` boot on the shells, `eLR/…` about year stamp), no dead pins. See
`audit/p1a/verify-csp-live.txt` and `audit/p1a/csp-live.txt` (curl -sI).
`pin-csp --check` now runs at the end of `npm run build` (fails the build on a
missing or dead pin; `SKIP_CSP_CHECK=1` is the emergency escape).

## 2026-10-25 — marker `618abd41de68` (P1a STEP 3 — B16: app language drives formatting)

Command: `node scripts/smoke-live.mjs --expect 618abd41de68`
Commit: `618abd4` — fix(format): app language drives all dates, times and numbers (B16)

| Check | Run 1 | Run 2 |
|---|---|---|
| answers 200 | PASS | PASS |
| build marker === 618abd41de68 | PASS | PASS |
| two devices paired | PASS — 50 008 ms to connected, room up in 59 008 ms (B missed the 20 s chat-view wait) | PASS — 30 801 ms, room up in 36 122 ms |
| message A → B | **FAIL — timed out at 15 s** | PASS (465 ms) |
| sender echo | PASS | PASS |
| no console errors | PASS (3 warnings: signaling worker redirect) | PASS (same 3 warnings) |

Run 1 was 5/6: pairing took 50 s on live, so the 15 s delivery window expired
before the channel was usable — an infra-timing flake, not a formatting
regression (no console/page errors, sender path healthy). Run 2 on the same
marker: **GREEN 6/6**. Recorded both runs rather than only the green one.

## 2026-10-29 — marker `fa0374a4ea15` (P1a STEP 4 + STEP 5)

Command: `node scripts/smoke-live.mjs --expect fa0374a4ea15`

| Check | Result |
|---|---|
| https://sharetexts.online answers 200 | PASS (200) |
| build marker === fa0374a4ea15 | PASS (got fa0374a4ea15) |
| two devices paired (code …776) | PASS — 12 539 ms to connected, room up in 17 791 ms |
| message A → B arrived within 15 s | PASS (9 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | PASS (2 warnings: signaling worker redirect) |

**[smoke-live] GREEN — 6/6.** First run after B1's fix (STEP 2) with no CSP
violation in either context: the pre-paint theme bootstrap now executes on
live. The two warnings are the pre-existing `VITE_SIGNALING_URL` redirect
noise documented above, not errors.

This marker carries the capture tooling (STEP 4) and the contract's §17
(STEP 5) — neither touches runtime code, so pairing/message here is the
regression check for STEP 1–3's runtime changes riding the same deploy.

## 2026-10-29 — marker `e1959cae5c29` (P1a STEP 6 — report + bug statuses)

Command: `node scripts/smoke-live.mjs --expect e1959cae5c29`

| Check | Result |
|---|---|
| answers 200 | PASS (200) |
| build marker === e1959cae5c29 | PASS (live on poll 2) |
| two devices paired (code …690) | PASS — 7 370 ms to connected, room up in 11 476 ms |
| message A → B arrived within 15 s | PASS (5 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | PASS (2 warnings: signaling worker redirect) |

**[smoke-live] GREEN — 6/6.** Docs-only push (report + bug statuses); the
runtime under it is the same code the previous marker proved, and pairing is
back to ~7 s on live after the 12 s run on `fa0374a…`.

## 2026-11-01 — P2 pushes `7f8a2ac`, `9145607`, `aeadf2d`

Command: `node scripts/smoke-live.mjs` (no `--expect`: the live marker cannot
move until Vercel deploys, and the failure below is not about the marker).

| Check | Result |
|---|---|
| https://sharetexts.online answers 200 | PASS (200) |
| build marker present | PASS (present, older build) |
| share card (og/twitter, 1200×630 PNG) | PASS |
| two devices paired | **FAIL** — `getByTestId("pairing-code")` never appeared; the page logged `WebSocket … wss://sharetext-signaling.garv29devra.workers.dev/lobby` closed before it opened |
| message A → B arrived within 15 s | SKIPPED — pairing failed |
| sender sees its own message | SKIPPED — pairing failed |
| no console errors during smoke | PASS (5 warnings, all the same worker) |

**[smoke-live] 4 FAILURE(S)** — every one downstream of the signaling worker,
which answers `200` to a request with no `Origin` and `403` to every browser.
Filed as question 3 in `F30-p2-report.md`; nothing in the repo can fix it.

## P3 — after `916f720` (connect) and `17df61e` (settings)

Run: `node scripts/smoke-live.mjs` against https://sharetexts.online, twice,
after both pushes. The live site still serves the pre-P3 build (nothing in P3
has been deployed), so this records that the deployment is healthy, not that
P3's screens are live.

| check | run 1 | run 2 |
| --- | --- | --- |
| site answers 200 | PASS | PASS |
| build marker present | PASS | PASS |
| share card + 1200×630 og image | PASS | PASS |
| two devices paired | PASS (…191, 7.9 s to connected) | PASS (…432, 6.6 s to connected) |
| message A → B within 15 s | PASS (11 ms) | PASS |
| sender sees its own message | PASS | PASS |
| no console errors | **FAIL** — `/assets/QRScanner-BXrU1kO3.js` returned 404 | PASS |

**[smoke-live] GREEN** on run 2. Run 1's single failure is a stale chunk in the
current deployment: `curl` confirms `https://sharetexts.online/assets/QRScanner-BXrU1kO3.js`
is a 404, so the deployed HTML references a scanner bundle that is not there —
filed as B31, and it will be replaced by the next deploy. The signaling worker
also logged its redirect warning three times per page (expected, harmless).

## 2026-11-03 — marker `fac3629c0b1e` (P4 final: fix B36, then GREEN)

Command: `node scripts/smoke-live.mjs` (auto-detects the served marker)

| Check | Result |
|---|---|
| https://sharetexts.online answers 200 | PASS (200) |
| build marker present | PASS (fac3629c0b1e) |
| share title is the brand line | PASS — AirDrop for everyone — ShareTexts |
| og:title is the brand line | PASS |
| og:image is absolute | PASS — https://sharetexts.online/og/sharetext-og-v11.png?v=22 |
| og:image carries a cache-buster | PASS |
| twitter card is summary_large_image | PASS |
| og:image declares 1200x630 | PASS |
| og:image serves as a real 1200x630 PNG | PASS — 200 image/png 1200x630 117KB |
| two devices paired | PASS (code …600) — 5 878 ms to connected, room up in 8 444 ms |
| message A → B arrived within 15 s | PASS (5 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | PASS |

**[smoke-live] GREEN.** The two runs before this one failed the message check
(B36): the composer grew ~20px the moment the field gained text, so the send
tap landed beside the button. With that caption removed, delivery is 5 ms.
The three console *warnings* are the expected `VITE_SIGNALING_URL` override
(the Vercel env var still names the retired host; the client uses the
canonical worker and says so once per page — B37).


## 2026-11-03 — marker `e65f94fb1066` (P4 report commit)

Command: `node scripts/smoke-live.mjs`

| Check | Result |
|---|---|
| site answers 200 / marker present | PASS (e65f94fb1066) |
| share card + 1200×630 og image | PASS (117 KB PNG) |
| two devices paired | PASS (code …358) — 8 051 ms to connected |
| message A → B arrived within 15 s | PASS (8 ms) |
| sender sees its own message | PASS |
| no console errors during smoke | PASS |

**[smoke-live] GREEN** again after the report push, so the two runs that bracket
this phase (`fac3629c0b1e`, `e65f94fb1066`) both deliver in single-digit
milliseconds. Docs-only commits after this one change no runtime code.

## P6 — reach and ship

Every P6 push was bracketed by a live run. The two worth recording are the
first deploy of the new homepage title and the one that fixed the smoke's own
assertion of the old one:

| push | result |
| --- | --- |
| `1760d852a71d` (P6 report) | GREEN except the title checks, which still asserted "AirDrop for everyone — ShareTexts". Real failure of the test, not the site: the live title was already the new product-first line. |
| `3603e6b6bb4c` (smoke assertion) | **GREEN**, 13/13: marker match, `og:title` leads with the product, og image 1200×630 69 KB, two devices paired in 10.8 s, message in 198 ms, no console errors. |

The three new search pages were checked against the live origin after that
push: `/iphone-to-windows`, `/android-to-iphone` and `/airdrop-alternative` all
return `200` with their own `<title>` and `<h1>`, and all three appear in the
live `sitemap.xml`.
