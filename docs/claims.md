# Claims — Phase 1 truth ledger (design/apple-grade)

Every factual claim in the UI, meta tags, JSON-LD and README, with proof
(`file:line`) and verdict. TRUE = proven · OVERSTATED = true only with
qualifiers · FALSE = contradicted · UNVERIFIED = no proof found yet.
No string ships that is not TRUE after the fix column lands.

## Crypto / privacy

| # | Claim (surface) | Proof | Verdict | Fix |
|---|---|---|---|---|
| 1 | "end-to-end encryption" — `README.md:4-5`, `index.html:118` (JSON-LD feature), `index.html:317`, `index.html:329` (boot-shell FAQ), PROTOCOL.md:4-5 | Key = PBKDF2(room secret) per `src/lib/crypto.ts:29-49`; the **server mints and holds the room secret in plaintext** (`server.ts:388`, `:141-152` Bearer auth for the agent push API, `:126` comment: "the same credential the devices hold"). Direct WebRTC legs never expose bytes to the server; the relay leg the server *can* read. | **OVERSTATED** | Rewritten to "encrypted in transit"; direct-vs-relay nuance stated where length allows. **Crypto redesign → open issue (draft below); no crypto code changed in this PR.** |
| 2 | "never stored on a server / no copies of your content" — `index.html:318`, `index.html:335`, JSON-LD `index.html:104` ("Nothing is kept") | Rooms: in-memory only, wiped on close/restart (`server.ts` rooms Map, TTL ~4h `:327`). Temporary Spaces: **server-backed** Durable Object + R2, 6h–7d (`worker/src/space.ts`, `en.ts:477` "up to 7 days"). | **OVERSTATED** | Split by surface: rooms keep nothing after they close; spaces store until their expiry, then are deleted. |
| 3 | "Encrypted on the way. Gone when the room closes." — `en.ts:212` (room details) | In-transit encryption + in-memory room lifetime (`server.ts` rooms Map). | **TRUE** (room scope) | Wording aligned to "Encrypted in transit." |
| 4 | "Connected through an encrypted relay." — `en.ts:207` | Relay forwards AES-GCM ciphertext over TLS; but the relay holds the room secret (claim 1). "Encrypted relay" reads as server-blind. | **OVERSTATED** | → "Relayed through the server. Encrypted in transit." |
| 5 | "Rooms keep nothing after they close" (new, replaces #1/#2 wording) | Rooms Map is in-memory, never written to disk; restart wipes (`server.ts` `rooms`, `ROOM_EMPTY_TTL` comment `:325-327`). | **TRUE** | ships as written |

## Codes and scoping

| # | Claim (surface) | Proof | Verdict | Fix |
|---|---|---|---|---|
| 6 | "six-character room code" — `README.md:6` | Pairing UI is six **digits** everywhere: `en.ts:98,327-331`, JSON-LD `index.html:114`, live room code `418302`. | **FALSE** | README → "six-digit pairing code". |
| 7 | "Six-digit pairing code / Type the six-digit code" — `en.ts:98`, JSON-LD `:114` | Same evidence as #6. | **TRUE** | keep. |
| 8 | "Nearby" pool scope — `en.ts:390-393,405-406`, landing toggle "Other devices nearby can see this one" | Discovery registers presence on the shared signaling socket (`src/lib/nearby.ts:218`); `NearbyDevices.tsx:43` states the flow "never depend[s] on the local network". Pool = devices online with ShareTexts open, relayed through the server — **not** LAN-scoped. | **OVERSTATED** | Labels → "Available devices" / "Available · n"; hints → "Other devices with ShareTexts open can see this one." Feature (keys, behavior) unchanged. Non-English locales follow in the Phase 4 copy pass. |
| 9 | Temporary Space code "8-character space code" — `index.html:341` | `worker/src/spaceCode.ts:24` `CODE_LENGTH = 8`, alphabet `ACDEFGHJKMNPQRTUVWXYZ234679`. | **TRUE** | keep. |
| 10 | Space lifetime "6 hours up to 7 days", "7 days is the maximum. Everything is removed when it closes." — `index.html:341`, `en.ts:477,486` | Brief confirms DO+R2 backing, 6h–7d; expiry deletion sweep to be pointed at in Phase 4 (`worker/src/space.ts`). | **TRUE (pending sweep proof)** | point at proof line in Phase 4; wording stays. |

## Numbers / speed

| # | Claim (surface) | Proof | Verdict | Fix |
|---|---|---|---|---|
| 11 | "1,206 connections made so far" — chip + `en.ts:75` | `/stats` → `roomsCreated` lifetime counter, persisted, **floor of 113**, explicitly "approximate" (`server.ts:102-119`). Counts rooms, not connections. | **OVERSTATED** | label → "rooms made so far"; value stays (real server counter, approximate by design). |
| 12 | "They pair in seconds." — `en.ts:175` | No measurement exists yet (Phase 5 adds connect timings). Also voice-banned ("in seconds"). | **UNVERIFIED** | rewritten without a time claim. |
| 13 | "no app, no account, no wires" — hero `en.ts:69`, README:4 | No accounts anywhere; browser-only. | **TRUE** | keep in hero once; de-duplicated elsewhere in Phase 4. |

## Meta / structured data

| # | Claim (surface) | Proof | Verdict | Fix |
|---|---|---|---|---|
| 14 | `inLanguage` lists 9 locales — `index.html:109` | Only `hreflang="x-default"` exists (`index.html:62`); no localized routes (`scripts/seo-routes.mjs` emits English only). The 9 app locales are client-side UI strings, not page content. | **OVERSTATED** | → `"en"`. |
| 15 | sameAs / GitHub links → `github.com/Alightttt/ShareTexts` — `index.html:95,352`, `docs/sem/search-intent.md:60` | Owner renamed to `0xalyt`. | **FALSE** | replaced repo-wide (live surfaces). Historical F26/F27 reports stay as archive — noted in PR. |
| 16 | Meta/OG descriptions "…right in your browser…" — `index.html:9,43,56` | Browser-only app, no install. | **TRUE** | keep (title change is Phase 6). |

## Open issue draft (crypto — owner decision, NOT changed in this PR)

> **Title:** Replace server-issued room secrets with client-derived key exchange
> The app-layer AES-GCM key derives from the room secret the signaling server
> mints and stores (`server.ts:388`, `src/lib/crypto.ts:29`). Direct WebRTC
> legs are safe (server never sees datachannel bytes), but relayed content is
> decryptable by the server. Proposal: per-device ECDH over the signaling
> channel so no server-held secret can derive content keys. Until then, public
> copy says "encrypted in transit", never "end-to-end".

## Pending — M3 Circle (do not use in public copy)

| # | Draft claim | Status | Why it stays off |
| --- | --- | --- | --- |
| P1 | "Linked devices are end-to-end encrypted." | **PENDING — not claimable** | The Circle design (`docs/adr/0001-circle.md`) makes it true by construction: the server never receives `K`, and `scripts/verify-circle-crypto.mjs` proves the seal refuses tampering, reordering and cross-circle replay. It becomes claimable only when `scripts/verify-zero-knowledge.mjs` (M3 STEP 4) shows nothing readable is stored or logged. Until then `docs/claims.forbidden.json` keeps the phrase forbidden and no public copy changes. |

## Hop — linked devices ("My devices")

| # | Claim (surface) | Proof | Verdict |
| --- | --- | --- | --- |
| H1 | "what you send is waiting on the other device the next time it opens ShareTexts. It can be closed or offline when you send." — `hop.intro.body` | `scripts/verify-hop.mjs`: the receiving tab is closed, two items are sent, the tab is reopened and both are there, in order, before any tap. | **TRUE** (Chromium; real phones UNVERIFIED) |
| H2 | "Each item is encrypted on this device before it leaves, and the server keeps only that encrypted copy, for 30 days at most." — `hop.intro.note` | Items are sealed with AES-GCM under a key the Worker never receives (`src/lib/circle/items.ts`, `docs/adr/0001-circle.md`); `scripts/verify-zero-knowledge.mjs` checks the stored bytes; `worker/src/limits.ts` `itemTtlMs` is 30 days, and `tidy()` in `src/lib/hop/hop.ts` removes an item sooner once every device has it. | **TRUE** |
| H3 | "No account." — `hop.intro.note` | A device is a key pair made in the browser (`src/lib/circle/keys.ts`); nothing asks for an email, phone number or password. | **TRUE** |
| H4 | "Delivered" — `hop.state.delivered` | Shown only after another device has acknowledged the item (`syncDelivered`); `verify-hop` asserts the waiting wording first and Delivered only after the receipt. | **TRUE** |
| H5 | "Waiting for a connection" while offline — `hop.state.queued` | `verify-hop` goes offline, sends, checks the item stays queued, goes online and checks it arrives once. | **TRUE** |
| H6 | "If it shows these four in this order, it is really yours." — `hop.confirm.body` | The four emoji come from the ECDH secret between the two devices, the join secret that only travelled in the scanned code, and a transcript both sides compute themselves (`shortAuthString`). A server that swaps a key produces different emoji; `verify-hop` asserts both screens agree and that the scanner is not linked before the other device confirms. | **TRUE** |

Not claimed, on purpose: "end-to-end" (still forbidden by the linter until the
owner flips P1), instant delivery (Hop asks the mailbox every few seconds while
open; there is no push yet), and anything about iPhone or Firefox, which have
not been tested on real devices.

Also listed under PR "UNVERIFIED for owner decision": repo website field +
`sharetext-phi.vercel.app` DNS-side 301 (vercel.json redirect shipped; DNS
record needs dashboard access).
