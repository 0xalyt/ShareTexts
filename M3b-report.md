# M3b — Loose ends and hotfix

**Tag:** `before-M3b` · **Branch:** `main` · **Date:** 2026-11-17

**Shipped: STEP 0 and STEP 1. STEPs 2 and 3 untouched. STEP 4 is this file.**

Why the two stopped: STEP 2 is a crypto migration on the key that protects every
Circle item, and STEP 3 is a copy change across 11 locales plus the prerendered
pages. Both need their gates run against a live pairing and a live page. Starting
either with the budget left would have produced exactly what this prompt exists to
fix — a report that says "done" about something only half measured. What follows
is a precise punch list instead of a paragraph of intent.

## STEP 0 — reports true, gates runnable (`f265d22`)

- `git tag before-M3b`, pushed.
- **`M3-report.md` rewritten.** It said "STEPs 0 and 1 shipped. STEPs 2–6 are not
  started" while `03d1b05` (client pairing) and `23aee05` (zero-knowledge proof +
  `/circle/capabilities`) had shipped and the Worker had been deployed five times.
  It now records STEPs 0–4 shipped and deployed with SHAs and the version chain
  `53ee77ad → 0bb0b14d → 37b2266a → 35e90c98 → 20acd057`, STEP 5 untouched, STEP 6
  satisfied by feature detection, and — in its own NOT VERIFIED section — that
  **the raw `K` sat in IndexedDB**, which is OD-10. `M2-report.md` and
  `M5-report.md` were checked against `ALL-M-REPORT.md` §2/§5 and agree.
- **`verify:typing` registered.** The script existed; nothing ran it.
- **`verify:fast`** (no browser): lint, claims, TOTP parity, bundle, `worker:test`,
  circle crypto, circle worker, lobby shard, nearby visibility, icons.
- **`verify:browser`** (`scripts/verify-browser.mjs`): starts the dev server on
  port 3010, waits for a 200, runs typing, sheets, desktop, room-feed, no-flash,
  chaos with `BASE_URL` set, then stops the server either way. This removes the
  trap that made an independent re-run see `ERR_CONNECTION_REFUSED`.
- **`build:analyze` was broken on Windows** — `ANALYZE=1 vite build` dies in
  cmd.exe with "'ANALYZE' is not recognized". It is `node scripts/build-analyze.mjs`
  now and writes `audit/bundle.html` + `audit/bundle.json`.

**Proof:** `npm run verify:fast` → **EXIT 0** (21/21 icon checks, 12 references,
claims clean, bundle PASS, worker 103/103 among them).

**NOT VERIFIED:** `npm run verify:browser` was **not run** — it boots a second dev
server on 3010 while the session's server holds 3081, and six browser gates take
longer than the budget left after STEP 1. It is written and registered, not
proven. That is the first thing to run next session.

## STEP 1 — the budget has headroom again (`0f87288`)

`npm run build:analyze` found the entry's heaviest dependency: **`otpauth`**, in
the entry for one HMAC-SHA1 (~30 KB raw / 4.7 KB gzip), because `generateTOTP`
must be synchronous and WebCrypto is not.

- `src/lib/totp-sha1.ts` (new): SHA-1, HMAC-SHA1, base32 and RFC 6238 truncation,
  ~150 lines, no dependency. `src/lib/totp.ts` now calls it; the exported API is
  unchanged, so every caller and every gate is untouched.
- `scripts/verify-totp-parity.mjs` proves it is the same TOTP:
  `sha1` against node:crypto for lengths 0–200 and 1 MiB (201/201), `hmacSha1`
  against node:crypto (200/200), `totpAt` against the **Worker's WebCrypto
  implementation** for 400 random secrets and counters (400/400), and against
  **otpauth** — the library that generated the codes the Worker has been
  validating — for 100 (100/100). **5/5.**
- `.githooks/pre-push` runs `npm run verify:bundle`; `prepare` sets
  `core.hooksPath`; `DESIGN.md` §0 gained the rule and the emergency skip
  (`SKIP_BUNDLE_HOOK=1 git push`). The hook ran on this very push and printed
  `[verify-bundle] GREEN` before the ref update.

**Entry chunk: 179.8 KB → 175.1 KB gzip.** Budget 180 KB, working target 177 KB,
headroom 4.9 KB. `npm run smoke:local` **GREEN** before the push.

## STEP 2 — key at rest (OD-10): NOT DONE

The work is: a non-extractable AES-GCM wrap key per device, `K` stored only as
ciphertext (fresh IV, AAD = circle id + epoch), unwrap-on-approve/rotate with the
buffer zeroed after, migration of any raw record on first read, ADR update, and
two extended gates (full IndexedDB dump must not contain `K`'s bytes).

`src/lib/circle/store.ts` still stores the raw `K`. **The debt is real and
unchanged.** It was not started because a rushed crypto migration is worse than a
documented one: it needs `verify:circle-pairing` against the deployed Worker, a
migration test from a real old record, and a rotation check, all in one run.

## STEP 3 — the page telling the truth about Nearby: NOT DONE

Exact inventory of the sentences that are now false (every one says the device
appears while the app is merely open; Nearby is off by default for 10 minutes at
a time):

| File | Line | Text |
|---|---|---|
| `index.html` | 133 | JSON-LD: "Device discovery while ShareTexts is open on your other device" |
| `index.html` | 355 | "It appears under Available while ShareTexts is open on both devices" |
| `index.html` | 368 | "the other device appears automatically while ShareTexts is open on both" |
| `index.html` | 370 | "Your device appears only while ShareTexts is open on it" (privacy FAQ) |
| `scripts/seo-routes.mjs` | 190, 218 | the prerendered FAQ and "How it works" |
| `src/views/Docs.tsx` | 597 | the in-app Docs answer |
| `public/llms.txt` | 5, 12, 18, 44 | four sentences |
| `public/guides/share-clipboard-between-phone-and-pc.html` | 166 | "tap its name when it appears under Nearby" |
| `src/lib/messages/*.ts` (11) | `nearby.visibleWhileOpen`, `nearby.visibleWhileOpenHint`, `nearby.hint` | "Visible while ShareTexts is open" |
| `src/components/NearbyDevices.tsx` | ~838 | the empty state |

Also missing: the two forbid rules in `docs/claims.forbidden.json`
(`appears automatically`, `appears under Available while`), and the one-line
empty state — "Ask the other person to turn on Nearby for 10 minutes, or connect
with a code." with a button into the existing code flow.

## Files changed

`package.json` · `scripts/verify-browser.mjs` (new) · `scripts/build-analyze.mjs`
(new) · `scripts/verify-totp-parity.mjs` (new) · `.githooks/pre-push` (new) ·
`src/lib/totp-sha1.ts` (new) · `src/lib/totp.ts` · `DESIGN.md` · `M3-report.md` ·
`M3b-report.md` · `SHARETEXTS-PROJECT-STATE.md`

## Questions (with my recommendation)

1. **Run STEP 2 first next session, before any other Circle work?** Recommended:
   yes — it is the only open item where a stolen phone's IndexedDB is a stolen
   circle.
2. **Is "turn on Nearby for 10 minutes" the wording you want shipped in 11
   languages?** Recommended: yes; it matches the timer the sheet actually runs.
3. **Should `verify:browser` be allowed to use port 3010 even when something is
   already listening there** (reuse it instead of failing)? Recommended: yes,
   reuse if the page answers, start one only if the port is free.
4. **May I delete `otpauth` from `dependencies`?** Recommended: not yet — `server.ts`
   and six scripts still import it; move those to the hand-written TOTP in the
   same commit that removes the dependency.
5. **Do you want the copy fix (STEP 3) as one commit per surface** (shell FAQ,
   prerender, guides/llms, locales, sheet) or one copy commit? Recommended: one
   per surface, so a bad translation can be reverted alone.

## OWNER ACTIONS

1. **Set the lobby salt without `openssl`** (works in Termux):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put LOBBY_SALT --config worker/wrangler.toml
   npm run worker:deploy
   ```
2. **Reinstall the PWA on the Redmi** after the next icon change — an installed
   web app keeps its old icon until it is removed and re-added.
3. **Nothing else needs you.** M3b changed no protocol, no crypto on the wire and
   no claim.
