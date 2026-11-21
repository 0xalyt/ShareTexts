# ShareTexts design playbook for coding agents

Read this before you change anything a person sees in ShareTexts. It is written for any AI coder (Freebuff, Claude Code, Cursor, Devin) and for people.

- **Prompts you can paste:** [PROMPTS.md](./PROMPTS.md)
- **Lessons from preetsuthar.me, mapped to this app:** [preetsuthar-lessons.md](./preetsuthar-lessons.md)
- **Links and libraries:** [REFERENCES.md](./REFERENCES.md)
- **Installed skills:** `.claude/skills/` (see `.claude/skills/SOURCES.md`). Freebuff, Claude Code and Codebuff load them automatically.
- **House rules already in the repo:** `docs/craft-rules.md`, `docs/redesign/motion-policy.md`, `HANDOFF-design-rebuild.md`, `docs/research/rea-sharetexts-reference-study.md`.

## What ShareTexts is
Open a room on one device, pair another with a short code or QR, and send text, links, images, video and files across. No account. End-to-end encrypted. Temporary Spaces hold a shared board for a while and then expire. Users: someone moving a photo from phone to laptop, a student sending notes to a library PC, a team sharing a link in a meeting, a support agent getting a screenshot from a customer.

The product is the moment the thing arrives on the other screen. Everything else is there to make that moment fast, certain and a little delightful.

## The one-line standard
Garv: "Good design is solving problems and making decisions feel obvious." And: "Your app doesn't need a redesign. You just suck at basics." Fix the basics first; then be unreasonably ambitious on a few moments.

## The basics, as checkable rules
1. **Make important stuff bigger.** One primary action per screen, visibly the largest and highest-contrast thing (Von Restorff). On the landing that is "Start sharing" / "Join with a code". In a room it is the composer and Send. Secondary actions are smaller and quieter, not just a different colour.
2. **Stop using six separate corners.** One radius scale from `src/index.css` (`--radius-*`, `--st-radius-*`). At most three radii on a screen. Nested surfaces are concentric: `inner = outer - padding`. Pills are fully round; everything else comes from the scale.
3. **Align your elements.** Every screen has one left edge and one content width. Text baselines line up across columns; icons align to text cap height, not the box. Use the grid, not per-element nudges.
4. **Fix your spacing.** Use a 4px base with steps 4, 8, 12, 16, 24, 32, 48, 64, 96. Related things are closer than unrelated things (proximity). Section gaps are at least 2× element gaps. No one-off values like 13px or 22px.
5. **Type.** Allo only, with its real oblique faces, optical sizes and symbols (https://allo.joshpuckett.me/). At most 3 sizes on a screen plus one display size. `text-wrap: balance` on headings, `pretty` on paragraphs, tabular numbers for codes, sizes and timers. Never synthesised italics (`font-synthesis-style: none`).
6. **Colour.** Neutral first; colour only to mean something (primary action, success, error, the peer's device). OKLCH ramps. Dark mode is designed, not inverted (higher = lighter).
7. **Copy.** Plain verbs, sentence case, one idea per line. No marketing filler ("Made to move", "Seamless", "Supercharge"). Run the `humanizer` skill on any new copy.

## The 19 principles Garv named, and where each one lives in ShareTexts
Use a principle only where it removes doubt or adds feeling the user benefits from. Never add motion just to show it exists. Every principle must hold with reduced motion on (see "Animation-off parity").

| Principle | What it means | Where to use it in ShareTexts | Where not to |
|---|---|---|---|
| Timing | Duration fits distance and importance. 100–180ms for presses and small UI, 200–300ms for sheets and route changes, up to ~500ms for one hero moment. | Press feedback, sheet open, message arrival | Long fades on frequent actions |
| Slow in, slow out | Ease in-out for things moving between two places on screen; ease-out (fast start) for things entering; ease-in for exits. | Sheet open (ease-out), dismiss (ease-in) | Linear, except progress and marquees |
| Anticipation | A small move before the main move tells the user something is about to happen. | Send button compresses (scale 0.96) on press, the message lifts 2px before it flies | Before every hover |
| Follow-through | Parts keep moving a little after the main body stops. | A received image card settles with a slight overshoot; the check after "Sent" lands a beat after the bubble | Text, form fields |
| Squash and stretch | Shape deforms to show speed and contact, volume preserved. | The pairing chip stretching as it travels to the connected state; the drop indicator on file drag-over | Containers holding text (it blurs and wobbles words) |
| Exaggeration | Push one detail past real to make it read. | The single "connected" moment, the first successful transfer | Everyday UI |
| Arcs | Natural motion travels on curves, not straight lines. | A sent item travelling from composer to the peer lane; QR code to "paired" chip | Lists and sheets (vertical is correct) |
| Staggering | Children enter 30–50ms apart so the eye reads order. Cap the total under ~300ms. | Landing sections, a batch of received files, the device list | Lists over ~8 items (stagger only the first few) |
| Secondary action | A supporting motion that adds life without stealing focus. | Typing dots, a soft glow on the peer's avatar while receiving | Anything competing with the primary action |
| Solid drawing | Things have consistent volume, light and depth. One light source; shadows agree. | Cards, the composer, sheets, the phone in the hero film | Mixed shadow directions |
| Origin awareness | Things grow out of what opened them. | Menus scale from their trigger (`transform-origin` at the anchor), sheets rise from the bottom edge, previews expand from the tapped thumbnail | Modals that appear from the centre for no reason |
| Interruptible motion | A new input retargets the motion from its current position and velocity. | Sheets, drags, toggles, tab switches; use springs (Motion `type: "spring"`) | Keyframe sequences on interactive controls |
| Rubber banding | Pull past an edge and it resists, then springs back: `offset = (1 - 1/(x*0.55/d + 1)) * d`. | Sheet over-drag, swipe-to-dismiss previews, end of the message list | Desktop mouse-wheel scrolling |
| Doherty threshold | Respond in under 400ms, ideally the same frame, or the user's flow breaks. | Pressed state on every tap; optimistic "Sending…" message; skeletons in place of spinners | Fake delays |
| Fitts's law | Time to hit = distance and size. Big, close targets for frequent actions. | Send, Join, Copy code, Download: 44px+ hit area, thumb zone on phones, at the edge on desktop | Tiny icon-only close buttons in corners |
| Hick's law | More choices = slower decisions. | Landing: two choices (start / join). Attachment menu: the 3 common types first, rest behind "More" | Hiding the main action in a menu |
| Von Restorff | The one different item is remembered. | One accent primary button per screen; new-message highlight | Multiple accent buttons on one screen |
| Frequency of use | The more often a thing is used, the less it should animate and the closer it should be. | Sending text: instant, no flourish. Pairing for the first time: can be a moment | Long animations on send |
| Peak-end rule | People judge an experience by its best moment and its end. | Design the peak (first file lands on the other device) and the end (leaving the room shows what was shared and that it is gone) | Spreading effort evenly |

Read the source material behind these: https://www.userinterface.wiki/ (laws and animation principles), https://lawsofux.com/, https://emilkowal.ski/ui/great-animations, https://www.nngroup.com/articles/animation-duration/, and the installed skills `animation-vocabulary`, `emil-design-eng`, `apple-design`, `choreograph`, `review-animations`.

## The benchmarks Garv set
- **Animation like Apple:** springs, origin-aware, interruptible, nothing moves without a reason. Study https://developer.apple.com/design/human-interface-guidelines/motion.
- **Onboarding like Duolingo:** do one thing, see it work, get rewarded. The first transfer is the onboarding; no tour.
- **UI like Linear:** quiet neutral chrome, tight type, keyboard first, fast. https://linear.app
- **Typography like Pentagram:** a few sizes, strong contrast between them, real typographic care. https://www.pentagram.com
- **Minimalism like Muji:** remove until it breaks, then add one thing back.
- **Search and filters like Airbnb:** for Spaces and history, filters are visible chips, results update live, counts show before you commit.
- **Art direction like Aesop:** warm, restrained, materially real imagery.
- **Dashboards like Notion:** Space boards: blocks, clear empty states, inline editing.
- **Landing layouts like Stripe:** stacked, centred: headline → two actions → hero film → proof → how it works. One column on desktop too.
- **Micro-interactions like Framer:** hover, press, drag all feel physical.

## Animation-off parity (non-negotiable)
Garv: "everything to work same in animation off devices as they work in animation on devices."
- Under `prefers-reduced-motion: reduce`, replace movement with opacity or an instant state change. Never remove the *information* the motion carried (sent, arrived, connected, error).
- No feature may depend on `animationend`/`transitionend` firing. Drive state from app logic; animation follows state.
- Autoplay (hero film, marquee) pauses with reduced motion and shows a poster or a static row; a play/pause control is always available.
- Test both: Chrome DevTools → Rendering → Emulate `prefers-reduced-motion`. Existing gate: `scripts/verify-landing-motion.mjs`, skill: `remove-animations`.

## Speed on every device
- Target: LCP < 2.5s on a mid Android over 4G, INP < 200ms, CLS < 0.05.
- Animate `transform`/`opacity` only. Glass (`backdrop-filter`) only on small, fixed chrome. No rAF loops for things CSS or WAAPI can do.
- Test on a 4× CPU throttle and a 60Hz screen. Respect `prefers-reduced-data` and `save-data` for the hero video (poster only).
- Fonts: subset Allo, preload only the core face, metric-matched fallback.
- Browser support: last 2 versions of Chrome, Safari (iOS 16+), Firefox, Edge, Samsung Internet, Opera. Every new CSS feature needs a fallback that still looks right.

## Before you call any change done
Run, in this order, and fix what fails:
```
npm run lint && npm run worker:typecheck
npm run smoke:local && npm run worker:test && npm run verify:layout
npm run build && npm run verify:bundle && npm run verify:claims
```
Then check by hand at 375px, 768px and 1440px, in light and dark, with reduced motion on and off, with a keyboard only, and on a real phone if the change touches touch.

Score the change against this rubric. Anything under 4 is not done:
1. Does the screen have one obvious primary action? (Hick, Von Restorff)
2. Are radii, spacing and alignment on the scales above?
3. Does every interaction paint feedback in the same frame?
4. Does it work identically with reduced motion?
5. Is it readable at 200% zoom and with VoiceOver/TalkBack labels?
6. Would a designer at Linear or Apple be embarrassed by any pixel? Run the `impeccable` and `make-interfaces-feel-better` skills as a second opinion.
7. Did you add code you did not need? Run `ponytail-review`.
