# F40 — Docs, About and legal reading experience

## Scope and decisions

Docs and legal pages now share a reading system: the app's Allo/system type,
neutral canvas, measured columns, clear current location, 44px navigation targets
and quiet transform-only affordances. About remains static HTML at `/about` so
its content, metadata and links still work without JavaScript. Its typography,
header, footer and theme preference now match the app. Existing component credits
are retained. Landing film, protocol, Worker and storage behavior are out of scope.

| Before | After | Why |
| --- | --- | --- |
| Disconnected About article | Responsive editorial story and honest device/lifetime explanation | Build recognition without adding decorative motion. |
| Docs navigation buttons | Hash-addressable chapters, mobile native picker, next/previous links | Support return visits, history and progressive guidance. |
| Dense legal column | Clear page introduction, reading rail and section anchors | Let readers find the answer before asking them to trust it. |
| Blanket no-storage claims in Docs and About | Distinct live-room, Temporary Space and local saved-item lifetimes | Match the existing privacy policy rather than implying zero knowledge. |
| Silent code-copy action | Success, failure and screen-reader feedback | Close the action/feedback loop without changing clipboard contents. |

## Browser proof

[Replacement recorded local checks](https://app.devin.ai/sessions/dda0462d4ad34518b63018a709ec3ae1?testRecording=1698b0e2-86a9-438f-8cd7-8677f249213c).

The rebuilt production app passed Chromium checks on Docs, About, Privacy and
Terms at 1440, 390 and 320 CSS px in light and dark. All 24 combinations fit
without document-level horizontal overflow. The legal index was corrected after
the first recording caught an IntersectionObserver ordering bug; all 72 legal
anchor checks now match the current heading, including Contact at maximum scroll.
Manual scroll, history and deep-link reload were also verified.

First-Tab skip links enter main on all four pages. Docs chapter rail, mobile
picker, next/previous, quickstart shortcuts, hash reload and Back/Forward pass.
Code copy writes the exact payload; genuinely denied clipboard permission shows
retry/manual-copy guidance. About renders without JavaScript. All distinct
internal About destinations resolve. Theme changes persist both ways between the
static and app pages and survive reload. No runtime or CSP errors were observed.

Local screenshots and supplemental test data are retained under
`audit/support-pages/` in the session, not committed. Automated layout gates may
regenerate legacy screenshots; those are intentionally excluded from this change.

## Shell checks

- `npm run lint`
- `npm run build`
- `npm run verify:claims`
- `npm run verify:bundle` (entry chunk remains under the 180KB gzip budget)
- `npm run smoke:local` (production build, pairing, text and link transfer)
- `npm run verify:layout` (desktop, sheets, no-flash, room-paint, basics)
- `git diff --check`

The unskipped pre-push hook reruns the bundle and layout gates. An existing
unused landing-poster preload warning is non-failing on the shared SPA shell.

## Not verified

Native Safari/iOS, physical-device transfers, screen-reader audio and translated
support copy are not verified. Support prose remains English, explicitly marked
as such. Production deployment is checked separately after merge; the local
recording is not evidence of deployment. No claim is made about the separate
landing/video or sharing-recovery workstreams.

## Environment knowledge follow-up

Keep the current development startup command. Add production-preview knowledge:
run `npm run build`, then `PORT=3010 npm start`. The testing agent verified that
launch path. Use a fresh browser origin/context after rebuilding to avoid a
service worker serving an older local bundle.
