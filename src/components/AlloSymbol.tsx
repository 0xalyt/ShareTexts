import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';

/** Allo's own glyphs, not approximations from another icon set.
 * Keep detailed pictograms (QR, files, devices) in Lucide: Allo has no
 * equivalent. Symbols are decorative; the surrounding control owns its label.
 * Source: Allo by Josh Puckett, https://allo.joshpuckett.me/ (SIL OFL 1.1).
 */
export const ALLO_SYMBOLS = {
  check: '✓', close: '✕', search: '⌕', plus: '+',
  left: '←', right: '→', next: '❯', more: '⋯',
} as const;

export function AlloSymbol({ name, size, className, style }: {
  name: keyof typeof ALLO_SYMBOLS;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn('allo-symbol', className)}
      style={{ ...(size === undefined ? {} : { '--allo-size': `${size}px` }), ...style } as CSSProperties}
      aria-hidden="true"
      dir="ltr"
      data-allo-symbol={name}
    >
      <span>{ALLO_SYMBOLS[name]}</span>
    </span>
  );
}
