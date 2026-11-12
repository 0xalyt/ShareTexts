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
const PORTRAITS = ['/brand/maker-garv.webp', '/brand/maker-garv.png', '/brand/maker-garv.jpg'] as const;

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
  /** Diameter in px. 48 is the default; never below 44 for a finger. */
  size = 48,
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
        'transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'active:scale-[0.90] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-apple-parchment dark:focus-visible:ring-offset-night-900',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="relative block h-full w-full overflow-hidden rounded-full ring-1 ring-black/[0.10] dark:ring-white/15"
        style={{ boxShadow: '0 1px 2px rgba(20,16,10,0.10), 0 6px 16px -8px rgba(20,16,10,0.28)' }}
      >
        {broken ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ember text-white">
            <XGlyph className="h-[42%] w-[42%]" />
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

      {/* The name, on hover, above the face. Pointer-events off so it never
          eats the click it is describing. */}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap',
          'rounded-full bg-[#1d1d1f] px-2.5 py-1 text-[11px] font-semibold leading-none text-white',
          'opacity-0 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)] transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
          '[@media(hover:hover)]:group-hover/maker:translate-y-0 [@media(hover:hover)]:group-hover/maker:opacity-100',
          'group-focus-visible/maker:translate-y-0 group-focus-visible/maker:opacity-100',
          'dark:bg-[#e8e8ea] dark:text-[#1d1d1f]',
        )}
      >
        Maker: Garv
      </span>
    </a>
  );
}

export default XProfileLink;
