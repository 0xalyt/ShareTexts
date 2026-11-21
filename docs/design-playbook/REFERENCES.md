# References, libraries and where to look

Open the link before copying the idea. Prefer an existing library over hand-rolled code.

## Craft references Garv chose
| Reference | Use it for |
|---|---|
| https://preetsuthar.me/ (see [preetsuthar-lessons.md](./preetsuthar-lessons.md)) | Rendering, motion maths, typography and interaction details with live demos |
| https://www.userinterface.wiki/ | Laws of UX and animation principles explained with examples |
| https://detail.design/ | Small interaction details from shipped products |
| https://allo.joshpuckett.me/ | Allo font: weights, oblique faces, optical sizes, symbols. The only typeface in ShareTexts |
| https://serenatan.org/launchvideo | Launch-film pacing, cuts and motion for the hero film |
| https://glassyui.com/ | Liquid-glass React components (registry installs) |
| https://glisse.kelvinzhang.com/ | Glass/refraction rendering on the web |
| https://kobra.systems/components | Component craft reference |
| https://skullet.lochie.me/ | Skeleton loading that matches the real layout |
| https://reanimate.niazmorshed.dev/ | Recreating a reference site's animation (skill: `reanimate`) |
| https://github.com/enesozturk/dimensional-drawing | Technical drawings and spec-sheet films of components (skills: `dimensional-drawing`, `dimensional-drawing-motion`) |
| https://emilkowal.ski/ui | Emil Kowalski on animation and design engineering (skills: `emil-design-eng`, `animate`, `ask-emil`) |
| https://linear.app, https://stripe.com, https://www.apple.com, https://www.notion.so, https://www.framer.com, https://www.aesop.com, https://www.muji.com, https://www.airbnb.com, https://www.duolingo.com, https://www.pentagram.com | The benchmark per area listed in README.md |
| https://orgo.ai | Landing composition and scroll interaction |
| https://x.com/jaydwivedi_/status/2123684031489323073 | Garv's pick; read it if your agent can open X (it needs a login for most agents) |

## Libraries already in the repo (use these first)
- **Motion** `motion/react` (`package.json`): springs, layout animations, `AnimatePresence`, `useReducedMotion`. Docs https://motion.dev/docs/react. Tokens live in `src/lib/motion/tokens.ts` (`DUR`, `EASE`, `SPRING`); use them, do not invent durations.
- **Tailwind v4** for layout utilities; design tokens stay in `src/index.css`.
- **lucide-react** for icons where Allo symbols do not cover the glyph. Size icons to text cap height.

## Libraries to reach for when needed
| Need | Library | Link |
|---|---|---|
| Menus, tooltips, popovers that flip/shift | Floating UI | https://floating-ui.com/docs/react |
| Toasts | Sonner (skill: `ask-sonner`) | https://sonner.emilkowal.ski/ |
| Drawers / bottom sheets | Vaul (only if `src/components/ui/Sheet.tsx` cannot do it) | https://vaul.emilkowal.ski/ |
| Accessible primitives | Radix UI / Base UI | https://www.radix-ui.com/primitives, https://base-ui.com/ |
| Real browser logos | `@browser-logos/*` or Simple Icons | https://github.com/alrra/browser-logos, https://simpleicons.org/ |
| Number/text transitions | NumberFlow | https://number-flow.barvian.me/ |
| Page transitions | View Transitions API (skill: `vercel-react-view-transitions`) | https://developer.chrome.com/docs/web-platform/view-transitions |
| Smooth corners | CSS `corner-shape: squircle` | https://developer.mozilla.org/docs/Web/CSS/corner-shape |
| Browser support checks | Can I use / Baseline | https://caniuse.com/, https://web.dev/baseline |

## Installed skills and when to load them
All live in `.claude/skills/<name>/SKILL.md` (provenance and licences in `.claude/skills/SOURCES.md`). Load the skill, follow it, then come back to this playbook.

| Task | Skills |
|---|---|
| Any UI change | `impeccable`, `make-interfaces-feel-better`, `web-design-guidelines`, `emil-design-eng` |
| New page or section | `frontend-design`, `hallmark`, `design-taste-frontend`, `landing-page-design`, `ui-ux-pro-max` |
| Motion | `animation-vocabulary`, `animate`, `choreograph`, `gestures`, `animation-performance`, `review-animations`, `remove-animations`, `find-animation-opportunities`, `improve-animations` |
| Apple feel | `apple-design` |
| Learning a reference site | `learn-taste`, `reverse-engineer-anything`, `reanimate`, `scrapling-official` |
| React code | `vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions` |
| Less code | `ponytail`, `ponytail-review` |
| Copy | `humanizer`, `writing-guidelines` |
| Planning | `grill-with-docs`, `grilling`, `domain-modeling`, `research`, `to-spec` |
| Quality | `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `webapp-testing`, `code-review`, `find-bugs`, `security-review`, `break-ui` |
| Films, demos, diagrams | `stageshow`, `dimensional-drawing`, `dimensional-drawing-motion`, `diagram-design` |
| What people say right now | `last30days` |

Not installed, and why: `senlindesign/taste-skill` (no licence file), Graphify and Craft Anything (tools, not skills; install with their own CLIs if you want them: https://github.com/Graphify-Labs/graphify, https://github.com/storytold/craft-anything), Vidscribe (Apple Silicon only: https://github.com/SamuelZ12/vidscribe), Supabase skills (ShareTexts does not use Supabase). Uizze (http://uizze.com) and ThinkUI (http://thinkui.xyz) are websites, not repos; browse them for anti-slop examples.

## Where things are in the code
| Thing | File |
|---|---|
| Landing composition, header, footer | `src/views/SingleScreenApp.tsx` (`landingNode`, `idleHeroNode`, `headerNode`, `footerNode`) |
| Hero film | `src/components/HeroLaunchFilm.tsx`, `src/lib/heroFilmAssets.ts`, `src/components/landing/hero-film.css`, `public/film/` |
| Browser row | `src/components/landing/BrowserCompatibility.tsx`; old marquee CSS `.st-marquee*` in `src/index.css`, `src/components/marketing/PlatformStrip.tsx` |
| How it works, FAQ | `src/components/marketing/LandingSections.tsx` (`ThreeThings`, `LandingFaq`) |
| Brand lockup | `src/components/BrandLockup.tsx`, `src/components/PageHeader.tsx` |
| Pairing | `src/components/send/SendScreen.tsx`, `src/components/receive/ReceiveScreen.tsx`, `src/components/spaceui/OtpInput.tsx` |
| Room and messages | `src/views/ChatView.tsx`, `src/components/MessageCard.tsx`; Spaces `src/views/SpaceView.tsx` |
| Sheets | `src/components/ui/Sheet.tsx`, `OverlaySheet.tsx`, `ConfirmSheet.tsx` |
| Loading | `src/components/SkeletonScreen.tsx`, `src/components/ui/StatePanel.tsx`, `RouteSkeleton` in `src/App.tsx` |
| Glass | `.st-lens` in `src/index.css`; `--st-glass-*` in `src/styles/apple-dna.css` |
| Motion tokens | `src/lib/motion/tokens.ts`, `src/lib/motion.ts` |
| Radius, colour tokens, Allo `@font-face` | `src/index.css`; fonts in `public/fonts/` |
| Copy (all languages) | `src/lib/messages/en.ts` and siblings; `src/lib/i18n.tsx` |
| Design gates | `scripts/verify-*.mjs` (visual-system, dna, allo, icons, theme, sheets, landing-motion, axe, rtl, …) |
