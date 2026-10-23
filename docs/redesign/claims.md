# Claims — P0 re-check (full ledger)

Re-verification of all 16 claims from `docs/claims.md` (Phase 1 ledger) against the
current tree, plus claims added since Phase 1. Proof rule: every row cites
`file:line` or a command. Verdicts: **TRUE** · **OVERSTATED** (true only with a
qualifier the UI doesn't give) · **FALSE** · **UNVERIFIED**. Status: FIXED /
OPEN / WRONG. Nothing is changed by this document — differences are recorded for
the owner. `docs/claims.md` stays as the Phase 1 record; this supersedes it.

## Crypto / privacy

| # | Claim (surface) | Proof | Verdict | Status |
|---|---|---|---|---|
| 1 | "end-to-end encryption" / "ShareTexts never sees your content" | README.md:5 now says "encrypted in transit"; index.html:320,332,338 say "encrypted in transit"; but Legal.tsx:48 ("Your content is end-to-end encrypted"), Legal.tsx:128, Docs.tsx:228 ("same secure end-to-end encrypted channel"), Docs.tsx:284 ("Encrypted end-to-end … never sees your content") still claim E2E. Server mints and holds the room secret (server.ts:1031 `new OTPAuth.Secret`, given to both devices server.ts:1059,1122), so relayed content is server-derivable (`docs/PROTOCOL.md:4-7` states exactly this). | **OVERSTATED on Legal + Docs surfaces** | **OPEN** — README/index.html/PROTOCOL fixed; Legal.tsx + Docs.tsx still claim E2E. Owner decides: either rewrite Legal/Docs copy to "encrypted in transit" (P-copy) or fund the crypto change (open issue in docs/claims.md) |
| 2 | "Nothing is kept" / "no permanent history" / "nothing stored" | Rooms: in-memory Map only, wiped by TTL (server.ts:521 rooms Map, server.ts:333 `ROOM_EMPTY_TTL` 4h, sweep server.ts:734); stay-registry persists roomId + **sha256 hash** of secret only (server.ts:528,533,553). Temporary Spaces: server-backed DO + R2, up to 7 days (worker/src/space.ts:138 expiresAt; index.html:344 states it). Saved Items + resume store persist on-device in IndexedDB (src/lib/savedStore.ts:1-30; src/lib/transferStore.ts:1-16). Meta description "No app, no account, nothing stored." (index.html:9,43,56) takes no account of spaces/saved items. | **TRUE for rooms; OVERSTATED as an absolute** ("nothing stored" meta + FAQ) | **OPEN** — meta/OG need a rooms qualifier (P-copy); index.html:322,332,338 already split rooms vs spaces correctly (FIXED for FAQ copy) |
| 3 | "Encrypted in transit. Gone when the room closes." | en.ts:251 `details.encryptedNote`; in-memory rooms (server.ts:521) + 4h empty TTL (server.ts:333) | **TRUE** (room scope) | FIXED (reworded from "Encrypted on the way") |
| 4 | "Connected through an encrypted relay." | Replaced: en.ts:246 `details.relay` = "Relayed through the server. Encrypted in transit." (rendered ChatView.tsx:1155) | claim no longer made | FIXED |
| 5 | "Rooms keep nothing after they close" | server.ts:521 in-memory; server.ts:734 sweep; stay-registry stores hashes not content (server.ts:533) | **TRUE** | FIXED |

## Codes and scoping

| # | Claim | Proof | Verdict | Status |
|---|---|---|---|---|
| 6 | "six-character room code" (old README) | README.md:6 "six-digit pairing code" | TRUE | FIXED |
| 7 | "six-digit code" everywhere | en.ts:86,93,107,137,619; index.html:319,334; JSON-LD featureList index.html:114 | **TRUE** | FIXED |
| 8 | Nearby = LAN ("nearby") | en fixed: en.ts:429 "Available devices", :430-431 "Available · n" (labels no longer claim LAN). Presence is a shared signaling-socket pool, not LAN (src/lib/nearby.ts:218 registration; NearbyDevices.tsx:43 comment states flow never depends on local network). **But 8 locales still say "nearby"**: de.ts:358 "Geräte in der Nähe", ja.ts:357 "近くのデバイス", ar.ts:357 "الأجهزة القريبة" (all 8 non-en locales, :357-362). `details.local` "Direct connection, same network." (en.ts:247) is accurate — it renders only for webrtc connectionType `'local'` (src/lib/webrtc.ts:433 host candidate) | en **TRUE**; non-en **OVERSTATED** | **OPEN** — P-copy for the 8 locales |
| 9 | "8-character space code" | worker/src/spaceCode.ts:24 `CODE_LENGTH = 8`; index.html:344 | **TRUE** | FIXED |
| 10 | Space lifetime "6 hours up to 7 days … content is deleted" | en.ts:517, index.html:344; expiry is server-authoritative (worker/src/space.ts:351-354) with alarm-driven cleanup (worker/src/space.ts:990-1017: expiry → `beginExpiry` → `runCleanup`, retry on failure) and R2 object deletion (worker/src/space.ts:714 `SPACE_BUCKET.delete`) | **TRUE** (sweep proof now exists — Phase 4's "pending" is closed) | FIXED |

## Numbers / speed

| # | Claim | Proof | Verdict | Status |
|---|---|---|---|---|
| 11 | Activity number | en.ts:75 label "rooms made so far" matches what is counted (`roomsCreated`, server.ts:121) — **en label TRUE**. But server applies a **floor of 113** (server.ts:121 `Math.max(..., 113)`) which DESIGN.md §16 forbids ("No floor"); useLiveStats.ts:114-119 comment claims "No fabricated floor" while the number it displays carries the server floor. 8 locales label it "connections" while the value counts rooms (de.ts:66 "Verbindungen bisher", es.ts:66, fr.ts:66, ja.ts:66, zh.ts:66, hi.ts:66, pt.ts:66, ar.ts:66) — label doesn't say what is counted there. | en TRUE / **contract violation** (floor) + 8-locale label mismatch | **OPEN** — see ACTIVITY-COUNTERS.md; removing the floor is a server change (P1+ owner call) |
| 12 | "They pair in seconds." | grep "in seconds" → 0 hits in src/ and index.html | claim removed | FIXED |
| 13 | "no app, no account, no wires" | README.md:4; en.ts:651 "No store, no account."; footer.noApp/noAccount en.ts:117-118 | **TRUE** | FIXED |
| — | "they arrive instantly" (conn.readyBody) | en.ts:176; no measurement of transfer latency exists (smoke-live measures pairing, not delivery) | **UNVERIFIED** | OPEN — new since Phase 1; either measure it (add p50 delivery time to smoke) or soften (P-copy) |
| — | "Encrypted peer-to-peer transfers" (JSON-LD featureList) | index.html:116; relay fallback exists — some transfers are peer-to-peer, relayed ones aren't | **OVERSTATED** (feature list has no relay carve-out) | OPEN — P-copy; low priority (structured data, not visible UI) |

## Local persistence (new since Phase 1 — security.md F4 follow-up)

| # | Claim | Proof | Verdict | Status |
|---|---|---|---|---|
| 14 | "Save a text, link, photo or file … it will be here on this device." | en.ts:688; savedStore.ts IndexedDB, local-only, committed-tx durability (src/lib/savedStore.ts:1-30: "Local-only. Nothing here is ever sent to the signaling server") | **TRUE** | FIXED (ships as written) |
| 15 | Resume store keeps in-flight file bytes across refresh | src/lib/transferStore.ts:1-16 — IndexedDB, sweep 24h/7d, local-only | **TRUE** (code comment, no user-facing claim found) | FIXED (documented, no copy change needed) |

## Meta / structured data

| # | Claim | Proof | Verdict | Status |
|---|---|---|---|---|
| 16 | `inLanguage` lists 9 locales | index.html:109,136 both `"en"` | TRUE now | FIXED |
| 17 | sameAs / GitHub → `github.com/Alightttt/ShareTexts` | index.html:95,354-355 now `0xalyt`; scripts/seo-routes.mjs:102 was the last live emitter — fixed in P0 STEP 8a, verified: `grep -r Alightttt dist/` → none | TRUE | FIXED — P0 STEP 8a |
| 18 | Meta/OG "…right in your browser… No app, no account, nothing stored." | index.html:9,43,56 | browser-only part TRUE; "nothing stored" overstated (see #2) | OPEN — P-copy with #2 |

## Emoji rendering facts (DESIGN.md §7 contract vs code)

Contract §7 (DESIGN.md:79) says emoji are "drawn as Apple-style images from
public/emoji-apple through src/lib/emoji.ts … One switch: VITE_EMOJI_SET".
Reality today:

- **The pipeline is gone.** `ls public/emoji-apple` → missing; `ls src/lib/emoji.ts` → missing; `grep VITE_EMOJI_SET` → 0 hits. Removed deliberately in F28 Phase 3 (see F28 report §7, PRIOR-WORK #86).
- **What renders:** plain Unicode glyphs painted by the platform color-emoji font — src/components/spaceui/EmojiReaction.tsx:34-37 ("The glyphs are plain Unicode text; the platform's color-emoji font paints them"), glyph table EmojiReaction.tsx:38-46.
- **The picker shows exactly six reactions** (Emojipedia names): `red-heart` ❤️ `U+2764 U+FE0F`, `thumbs-up` 👍 `U+1F44D`, `face-with-tears-of-joy` 😂 `U+1F602`, `face-with-open-mouth` 😮 `U+1F62E`, `fire` 🔥 `U+1F525`, `folded-hands` 🙏 `U+1F64F` — same list in both copies: EmojiReaction.tsx:38-46 and MessageCard.tsx:111-118 (`REACTION_CHOICES`).
- **Chips** render the same glyph + a tabular count inside a 26px pill in a 40px hit box (MessageCard.tsx:145-160); the chip lights ember when it is ours (MessageCard.tsx:153-154).
- **No bundled fallback.** On a platform without a color-emoji font the picker/chips degrade to monochrome or tofu. Owner report "Apple emoji reactions are missing" is **NOT REPRODUCED** on this Windows host (Segoe UI Emoji renders them full color — `audit/baseline/reaction-picker-open-390x844-light.png`, `reaction-added-390x844-light.png`); tracked as bugs.md **B5**, needs the owner's device to proceed.
- **No emoji as icons in UI** (§7 rule): sweep of literal emoji outside reactions → only `chat.suggest.hi` "Say hi 👋" (en.ts:277 + all 9 locales) — that's copy, inventoried as slop #10 (**KILL**, P-copy).
- Contract §7 text describing the PNG pipeline is **stale vs code**: owner decision — either amend §7 to match Unicode-glyph reality or restore an image set. Recorded as Differs in the F28 report §7 table.
