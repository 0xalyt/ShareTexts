import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// IconButton3D — the header's shared icon slot.
// ---------------------------------------------------------------------------
// Header actions stay visually quiet until hover or press. A 40px hit area,
// shared focus treatment, and one stroke icon keep the toolbar easy to scan.
//
// Renders an <a> when given href, a <button> otherwise. 40px tall minimum —
// the same touch contract as everything else in the header.
// ---------------------------------------------------------------------------

export interface IconButton3DProps {
  /** Accessible name — always required (these are glyph-only controls). */
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  /** Brand tint for a control that is currently active. */
  active?: boolean;
  className?: string;
  testId?: string;
}

export function IconButton3D({ label, children, onClick, href, active = false, className, testId }: IconButton3DProps) {
  // 44px (§5, §18): the header's controls are thumbs-first, and a 40px
  // glyph in a capsule reads as smaller than the Back circle beside it.
  const classes = cn(
    'press flex items-center justify-center w-11 h-11 rounded-full',
    'text-apple-ink/70 dark:text-white/70 hover:text-apple-ink dark:hover:text-white',
    'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
    'transition-[color,background-color] duration-150 ease-out motion-reduce:transition-none',
    active && 'text-ember dark:text-azure-400 bg-ember/[0.08] dark:bg-azure-400/[0.10]',
    className
  );
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} data-testid={testId} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} data-testid={testId} className={classes}>
      {children}
    </button>
  );
}
