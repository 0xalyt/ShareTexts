# ShareTexts — project state

Last updated at `main` after the M1 carry-over. Sections 4–8 are the ones every
milestone report updates; 1–3 describe the shape that rarely changes.

## 1. What this is

ShareTexts (sharetexts.online) is a browser-to-browser transfer app: two devices
pair with a six-digit code, a QR or a link, and then exchange text, links and
files. No account, no install. Rooms are encrypted in transit; the Worker mints
the room secret, so the product does **not** claim end-to-end encryption.

## 2. Runtime and layout

- **Client:** React + TypeScript + Vite, `src/`. Entry `index.html` → `src/main.tsx`.
- **Signalling:** a Cloudflare Worker in `worker/` (Durable Objects for rooms,
  WebSocket relay fallback, `/stats`, `/metrics`). Node server `server.ts` runs
  the same logic locally for development and smoke tests.
- **Static:** `public/` (24 guide pages, `llms.txt`, icons, `sw.js`).
- **Data:** in-memory rooms in the Worker; D1/R2 bindings exist but R2 for Space
  files is commented out — Temporary Spaces are text and links only.
- **Tests/verifiers:** `scripts/*.mjs`, driven by `npm run …` (see §4).

## 3. Milestones

| Milestone | State |
| --- | --- |
| M1 — Solid ground | shipped (`M1-report.md`), with three carry-over items completed after the report: `src/lib/itemState.ts`, `scripts/verify-no-flash.mjs`, this file. Bundle gate still red. |
| M2 — The Room | blocked at its prerequisite check (`M2-blocked.md`); the carry-over above clears two of its conditions. |
| M3+ | not started. |

## 4. Gates — current truth

| Command | What it proves | Last measured |
| --- | --- | --- |
| `npm run lint` | types and lint | clean |
| `npm run build` | the app compiles | exit 0 |
| `npm run worker:test` | Worker behaviour incl. honest counters | 103 passed, 0 failed |
| `npm run worker:typecheck` | Worker types | clean |
| `npm run smoke:local` | the built server serves the real routes | GREEN |
| `npm run verify:claims` | no forbidden product claim | 8 rules, 43 files, 0 findings, 1 declared exemption |
| `npm run verify:chaos` | four reliability promises, measured | 4/4 PASS (S2, S3, S11, S12) |
| `node scripts/verify-no-flash.mjs` | no blank gap, no white frame, no mid-session SW takeover | clean |
| `npm run verify:icons` | every icon reference resolves and matches its size | 12 references |
| `npm run verify:bundle` | entry ≤ 180 KB gzip | **FAIL — 219.9 KB** |

## 5. Known debt (ordered by what it costs the owner)

1. **Bundle: 219.9 KB against 180 KB.** Not re-based; the number is real. Cuts
   need route-splitting the chat view and/or deferring `motion`.
2. **Reliability matrix is partial.** S1, S4–S10, S13–S15 unmeasured.
3. **Item state is now centralised but not yet the only reader.** `MessageCard`
   uses `itemState.ts`; `ChatView` and the sheets still derive some words inline.
4. **Space file storage** disabled; the claims linter forbids describing it.
5. **`home.roomsMade` still says "rooms made"** while the counter measures
   two-device connections.

## 6. Environment

- Work dir on the owner's machine: `C:\Users\garvd\ShareTexts\.freebuff\ShareTexts`.
- The shell exports `PORT=0`, so always pass `PORT=3010` explicitly when starting
  the dev server, then poll `/` for 200 before anything else.
- Dev port default is 3010; live smoke runs against the deployed origin.
- `git config http.postBuffer 524288000` is needed for the large binaries.

## 7. Deployment

Push to `main` → the host builds. Wait for the live build marker, then
`node scripts/smoke-live.mjs`. If live breaks, revert first and diagnose after.
Worker changes require `npm run worker:deploy` (owner action).

## 8. Conventions

- Every user-visible string through `t()` in all 11 locales, natural wording.
- No invented numbers; a number on screen comes from a counter, never from copy.
- Every claim must be allowed by `docs/claims.md`; `verify:claims` enforces it.
- Small commits; `git tag before-<milestone>` first; never weaken a gate.
- `npm run smoke:local` green before any push touching `src/` or `public/`.
