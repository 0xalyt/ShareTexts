# ShareTexts: instructions for coding agents

ShareTexts (https://sharetexts.online/) sends text, links, images, video and files between devices with a short code or QR. No account; content is encrypted in transit (not end-to-end, see `PROTOCOL.md`). React 19 + Vite + Tailwind v4 + Motion; a Cloudflare Worker in `worker/`. Merging to `main` deploys production.

## Read before changing anything people see
1. `docs/design-playbook/README.md`: the design standard, the 19 UX and motion principles mapped to this app, the rubric.
2. `docs/design-playbook/PROMPTS.md`: ready-made task prompts (audit, browser marquee, landing, Allo, hero film, send/receive, sheets, glass, loading, speed).
3. `docs/design-playbook/preetsuthar-lessons.md`: rendering, motion maths and typography details with source links.
4. `docs/design-playbook/REFERENCES.md`: links, libraries, which skill to load, where each thing lives in the code.
5. `docs/craft-rules.md` and `docs/redesign/motion-policy.md`: existing house rules.

## Skills
Free skills are installed in `.claude/skills/` (licences and sources in `.claude/skills/SOURCES.md`). Load the ones REFERENCES.md lists for your task and follow them.

## Hard rules
- Fix basics before adding anything: one primary action per screen, one radius scale with concentric nesting, aligned edges, 4px spacing steps, Allo only.
- Animate only `transform` and `opacity`; interruptible motion uses springs; tokens from `src/lib/motion/tokens.ts`.
- Everything works the same with `prefers-reduced-motion: reduce`: motion is replaced, information is kept.
- New copy goes in `src/lib/messages/en.ts` and every other locale file. Plain words, no filler.
- Privacy wording follows `PROTOCOL.md`: never write "end-to-end encrypted", "nothing is stored" or similar. Rooms are encrypted in transit; Temporary Spaces keep content on the server for up to 7 days.
- Prefer existing components and libraries over new code or new dependencies.

## Checks before done
```
npm run lint && npm run worker:typecheck
npm run smoke:local && npm run worker:test && npm run verify:layout
npm run build && npm run verify:bundle && npm run verify:claims
```
