# F44: useful Docs, guides, and legal pages

## Content plan

People arriving with a file to send need instructions before architecture. Docs opens with one live transfer, then separates pairing, Nearby, Temporary Spaces, Hop, troubleshooting, privacy, and developer reference. Guides answer individual tasks. Policies explain access, storage, responsibility, and limits without claiming zero server access.

The existing reading shell, shared footer, English-content notice, reduced-motion behavior, and keyboard navigation remain in place. No landing, transfer, or signaling behavior changes are included.

## Files

- `src/views/Docs.tsx`, `reading-pages.css`, and `docs-faq.json`: task-first chapters, numbered steps, clear API credentials and limits, shared FAQ source.
- `src/views/Legal.tsx`, `privacy-content.html`, and `terms-content.html`: one policy source for React and crawlable/no-JavaScript HTML.
- `scripts/seo-routes.mjs`: current Docs overview, policies, and FAQ structured data.
- Ten pages in `public/guides/`: task-oriented index, core explanations, and device-transfer instructions.
- `scripts/verify-reading-content.mjs`, `scripts/verify-seo.mjs`, `docs/claims.forbidden.json`, and `package.json`: source-sharing, anchor, language, FAQ, guide, and claim regressions.

## Product facts behind the wording

| Topic | Source |
| --- | --- |
| Live-room secret issued by service; encrypted direct/relay transfers | `PROTOCOL.md`, `src/lib/crypto.ts` |
| Spaces: 6 hours to 7 days; retryable deletion | `worker/src/space.ts` |
| Space file storage disabled | `worker/wrangler.toml`, `docs/claims.forbidden.json` |
| Hop browser encryption and 30-day server mailbox | `src/lib/hop/hop.ts`, `worker/src/circle.ts`, `worker/src/limits.ts` |
| Saved Items browser-local, no automatic expiry or separate encryption | `src/lib/savedStore.ts` |
| Aggregate event allowlist | `src/lib/telemetry.ts` |
| Push API uses room secret; 256 KB text and 8 MB files | `server.ts`, `worker/src/index.ts` |

## Proof

- `npm run lint` and `npm run worker:typecheck`.
- `npm run build`, `npm run verify:bundle`, and `npm run verify:claims`.
- `node scripts/verify-reading-content.mjs --built`: exact policy HTML, shared FAQs, legal anchors, language semantics, and ten guide contracts.
- Negative fixtures rejected a split policy source, empty FAQ question, and broken Docs chapter link; restored fixtures passed.
- `npm run smoke:local -- --skip-build`: built app, room pairing, text/link delivery, echo, metadata, and console checks against local signaling.
- `npm run worker:test`: 252 assertions plus relay, receive, lifecycle, and deferred-loading regressions.
- `npm run verify:layout`: sheets, desktop geometry, no-flash, first-room paint, and landing basics passed. Serialize WebSocket suites against one emulator to avoid its per-IP rate limit.
- `npm run verify:seo`: all revised-page checks passed; the only failure was the unchanged homepage description at 210 characters, above its 200-character gate.
- Browser regression: clicking all twelve policy index entries keeps the correct active link and preserves the policy nodes across scroll updates. The test first reproduced six wrong highlights and two detached policy subtrees; stable HTML props fixed them.
- Tall-viewport regression: anchor clicks take precedence over the terminal-scroll shortcut until the reader scrolls again. Checks at 900px and 1713px heights cover every anchor and resumed scroll tracking.
- Recorded reading-page checks and CI results are linked in the PR.

Local browser tests use `VITE_CI_LOCAL_WORKER=1 VITE_SIGNALING_URL=http://localhost:8787`. The production signaling hostname is blocked on this VM.

## NOT VERIFIED

- Production deployment and the production Worker.
- Native Safari/iOS and native-speaker translation review. Reading content remains English and is labeled accordingly.
- Jurisdiction-specific legal compliance. This is a product-accurate wording pass, not professional legal advice.

## Owner question and recommendation

Before public launch, have counsel review the policies for the operator's jurisdiction and contact obligations. No jurisdiction, registered address, retention guarantee, or legal certification was invented.

## Next steps

Merge only after clean CI, clean Devin Review, and recorded local reading-page verification. Production checks remain deferred under the owner's instruction.
