# F42 — Landing preview state and idle feedback space

## Scope

| File | Purpose |
| --- | --- |
| `src/components/landing/ProductDetails.tsx` | Show a state label in the expiry-preview header. |
| `src/components/landing/landing-page.css` | Keep both header states the same size; collapse the empty feedback row. |
| `src/lib/messages/{en,es,fr,de,pt-BR,pt-PT,hi,ja,zh-Hans,zh-Hant,ar}.ts` | Translate the new `home.space.expired` state label. |

No changes to hero film/player, supporting pages, room/Space creation, storage, startup caching, signaling, transport, crypto or Worker.

## Decisions

| Before | After | Why |
| --- | --- | --- |
| Closed preview still advertised `7 days` | Header changes from `7 days` to `Expired` | Report the illustrated state, not its previous retention. |
| First fix repeated the selected `After expiry` tab | Separate localized state label | The tab chooses the view; the header names its state. |
| Idle browser card reserved an empty feedback line | Empty live region remains mounted but has no height or margin | Preserve announcements without unfinished space below the actions. |

The header labels share one grid cell and reserve the longer translation's geometry. The inactive label uses `visibility: hidden`; no new animation is introduced. Existing reduced-motion/keyboard behavior, clipboard-denial recovery and QR disclosure are unchanged. Apple design's state feedback and Emil's unseen-detail guidance informed the changes; existing landing tokens and geometry remain in use.

## Proof

- `npx tsc --noEmit`, `npm run build`, `npm run verify:bundle`: passed after adding all eleven state translations. Entry remains 178.2 KB gzip against the 180 KB hard gate; the inherited 177 KB working-target overage is unchanged.
- `npm run verify:handoff`: passed; `audit/tmp/landing-detail-handoff.log`.
- `npm run smoke:local`: passed; `audit/tmp/landing-detail-smoke.log`.
- Unmodified pre-push bundle/layout hooks run before this source branch can be pushed.
- [Final state-label UI retest](https://app.devin.ai/sessions/519f23e8501a4602b8ad36b0399832ca?testRecording=4057bae4-78d1-4f0d-a9b7-cabadc6ad767): passed on an isolated local production build. Fresh English 1440/390px, Arabic RTL 320px and German 320px show distinct Expired state labels, restore the localized duration on reopening, and keep the header/card geometry. Idle phone cards have only their normal 20px bottom padding plus 1px border.
- The earlier focused run verified dark desktop, clipboard success/browser-enforced denial and QR Show/Hide/Escape; those styles and handlers did not change in the final state-label correction.
- Screenshots: `/home/ubuntu/screenshots/detail-final-desktop-space-expired.png`, `detail-final-en-390-browser-band.png`, `detail-final-ar-320-browser-band.png`, `detail-final-ar-320-space-expired.png` and `detail-final-de-320-space-expired.png`.
- Prior release [PR #12](https://github.com/0xalyt/ShareTexts/pull/12) post-merge checks passed in Chromium, Firefox and WebKit. Its live sharing smoke also passed; this is not evidence for deployment of this follow-up.

## NOT VERIFIED

This follow-up in production, physical devices, native Safari, screen-reader audio, human review of all translations, physical-camera QR scanning and real Space expiry.

## Owner questions and next step

None. Open the follow-up PR, merge once its checks pass under the owner's instruction, then confirm the deployed marker and interactions. The direct-to-main rule in the repository's older contract is superseded by the session's PR workflow; no hook or CI gate is bypassed.
