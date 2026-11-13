import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { hapticTap } from '../lib/haptics';

/**
 * XProfileLink — the maker's X profile, as a face rather than a handle.
 *
 * A social link at the end of a page is a small promise: "there is a person
 * behind this". So it shows the person. Three things make that work without
 * it becoming decoration:
 *
 *   · It still reads as a LINK on desktop. Hovering fades the portrait to
 *     black and puts the X glyph on top — the same language as every profile
 *     button — with "Maker: Garv" above it, so the identity and the
 *     destination are both legible before the click.
 *   · On a finger there is no hover, so the veil is desktop-only
 *     (`@media (hover: hover)`); the tap answers with a squeeze instead, and
 *     the haptic fires on pointerdown so the feedback lands before the
 *     navigation does.
 *   · It is a picture, not a file. `draggable={false}`, no text selection,
 *     `pointer-events-none` on the image, and no download affordance: the
 *     only thing you can do to it is follow it.
 *
 * If the portrait is missing (or fails to decode) the circle falls back to
 * the ember X badge, which still reads as a profile link rather than a
 * broken image.
 *
 * The portrait lives at `public/brand/maker-garv.webp` — a 1:1 image, 96–
 * 160px, square. Nothing in this component needs to change when it is
 * replaced.
 */

/**
 * The portrait, tried in order. Whichever file exists is the one used — a
 * `.webp` saved from a design tool, a `.png` dragged out of a screenshot, or
 * a `.jpg` off a phone. Nothing here needs editing when the picture changes.
 */
// The `?v=` is a cache key, not a param the server reads: the portrait was
// replaced once already and browsers kept the old file (and, worse, kept a
// cached 404 from before it existed, which made the component fall through to
// its monogram on some devices but not others). Bump it whenever the picture
// changes.
const PORTRAITS = [
  '/brand/maker-garv.webp?v=2',
  '/brand/maker-garv.png?v=2',
  '/brand/maker-garv.jpg?v=2',
] as const;

export function XGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function XProfileLink({
  className,
  testId = 'footer-x',
  /** Drawn diameter in px. The TAP target stays 44 regardless — a footer
   *  portrait is an ornament next to the language control, not a button that
   *  should take a button's space. */
  size = 28,
}: {
  className?: string;
  testId?: string;
  size?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const broken = attempt >= PORTRAITS.length;
  // The accessible name carries everything the picture carries: who, where,
  // and that it leaves the site.
  const label = 'Maker: Garv — @0xalyt on X (opens in a new tab)';

  return (
    <a
      href="https://x.com/0xalyt"
      target="_blank"
      rel="me noopener noreferrer"
      aria-label={label}
      title="Maker: Garv — @0xalyt"
      data-testid={testId}
      onPointerDown={() => hapticTap()}
      className={cn(
        'group/maker relative inline-flex items-center justify-center rounded-full',
        'min-h-[44px] min-w-[44px]',
        // Squeeze on press: the whole point is that the tap is felt before the
        // page leaves. 150ms is short enough to finish inside the navigation.
        'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
        // Hover is a lift, not a bounce: the circle grows a hair and the ring
        // warms, which reads as "a person you can visit" rather than a button.
        '[@media(hover:hover)]:group-hover/maker:scale-[1.08]',
        'active:scale-[0.90] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-apple-parchment dark:focus-visible:ring-offset-night-900',
        className,
      )}
      style={{ width: Math.max(44, size), height: Math.max(44, size) }}
    >
      {/* The drawing, inside the 44px target. */}
      <span
        className="relative block overflow-hidden rounded-full ring-1 ring-black/[0.10] transition-[box-shadow,ring-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)]:group-hover/maker:ring-ember/35 dark:ring-white/15"
        style={{
          width: size,
          height: size,
          boxShadow: '0 1px 2px rgba(20,16,10,0.10), 0 6px 16px -8px rgba(20,16,10,0.28)',
        }}
      >
        {broken ? (
          // The stand-in until the portrait lands: a monogram badge, not a
          // fallback. Graphite sphere with a warm rim, the maker's initial in
          // the same ember the product uses, and a presence dot — the three
          // things every real avatar badge has, drawn with CSS so it still
          // looks deliberate at 48px and costs zero bytes.
          <span className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#141210] text-white">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(120% 120% at 30% 8%, #3a322c 0%, #211c18 46%, #131110 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -8px 14px -8px rgba(0,0,0,0.7)',
              }}
            />
            <span
              aria-hidden
              className="relative leading-none font-bold tracking-[-0.03em] text-ember"
              style={{ fontSize: Math.round(size * 0.44) }}
            >
              G
            </span>
            <span
              aria-hidden
              className="absolute bottom-[6%] right-[6%] z-10 h-[22%] w-[22%] rounded-full bg-[#35c759]"
              style={{ boxShadow: '0 0 0 2px #141210' }}
            />
          </span>
        ) : (
          <img
            src={PORTRAITS[attempt]}
            alt=""
            width={size}
            height={size}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onError={() => setAttempt((n) => n + 1)}
            className="pointer-events-none h-full w-full select-none object-cover [-webkit-user-drag:none]"
          />
        )}
        {/* The profile veil — desktop only, because a touch browser keeps
            :hover after a tap and the face would stay buried. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-black/82',
            'opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
            '[@media(hover:hover)]:group-hover/maker:opacity-100',
            'group-focus-visible/maker:opacity-100',
          )}
        >
          <XGlyph className="h-[38%] w-[38%] text-white" />
        </span>
      </span>

      {/* No custom tooltip: the anchor already carries `title`, so hovering
          showed TWO labels stacked on top of each other — the drawn one and
          the browser's. The browser's is the one that behaves (delay, edge
          flipping, touch suppression), so it is the only one left. */}
    </a>
  );
}

export default XProfileLink;
