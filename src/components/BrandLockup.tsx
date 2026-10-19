import React from 'react';
import { ShareTextsLogo } from './ShareTextsLogo';
import { cn } from '../lib/utils';

/**
 * BrandLockup — the one way the brand appears anywhere in the app:
 * mark + wordmark, tightly paired.
 *
 * Geometry contract (measured, not eyeballed — rev 2026-10):
 *  - The mark's drawn content spans y=36..220 of its 256 viewBox, i.e.
 *    72% of the box: at box size 38 its painted height is 27.4px —
 *    visibly LEADS the 20px wordmark (design owner: the mark is the
 *    brand; the wordmark only names it). Compact: box 24 → ink 17.3px
 *    against the 16px wordmark, same relationship at sub-page scale.
 *  - The wordmark uses the platform UI face at a size that stays optically
 *    level with the mark across compact and full headers.
 *  - gap-0 + -ml-px: the mark's own internal padding IS the
 *    optical gap (~3px of air once the 1px overlap is applied). Anything
 *    that adds gap on top of that reads as a disconnect between the two
 *    halves of the brand.
 *  - The wordmark is `leading-none` and baseline-aligned against the mark's
 *    optical center (the diagonal composition leans low-left, so no manual
 *    translate is needed).
 *
 * The mark is ALWAYS the ember glyph — it never swaps to a cream/white
 * colorway at night (ShareTextsLogo holds that decision; the wordmark
 * follows the theme ink token).
 *
 * Used by: landing header + footer, app compact footer, Docs, Legal,
 * About, 404, error recovery — one brand voice everywhere.
 */
export function BrandLockup({
  href = '/',
  className,
  markClassName,
  markSize,
  mono = false,
  /** Sub-page / compact-strip size: mark 24px box, wordmark 16px. */
  compact = false,
}: {
  href?: string;
  className?: string;
  markClassName?: string;
  markSize?: number;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      aria-label="ShareTexts — home"
      className={cn('group flex items-center gap-0 shrink-0 min-h-[40px] -my-2 w-fit', className)}
    >
      {/* The box steps with the wordmark so both halves read as one object.
          One mark in the DOM — CSS sizes it, not a second copy. */}
      <span className={cn(
        'transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none flex shrink-0',
        compact ? 'w-[24px] h-[24px]' : 'w-[30px] h-[30px] sm:w-[38px] sm:h-[38px]',
      )}>
        {/* 1px overlap: the mark's transparent margin is the real gap, so a
            negative margin tightens the pairing without touching the ink. */}
        <ShareTextsLogo size={compact ? 24 : (markSize ?? 38)} mono={mono} className={cn('w-full h-full -mr-px', markClassName)} />
      </span>
      <span
        className={cn(
          'font-display font-semibold tracking-[-0.035em] leading-none text-apple-ink select-none',
          compact ? 'text-[16px]' : 'text-[19px] sm:text-[20px]',
        )}
      >
        ShareTexts
      </span>
    </a>
  );
}
