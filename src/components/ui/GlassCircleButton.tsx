import React from 'react';
import { cn } from '../../lib/utils';

/**
 * GlassCircleButton — the floating Back circle of a task screen (§18).
 *
 * One 44px circle of the glass material, no bar behind it. The control is
 * glyph-only, so an accessible name is required, not optional.
 *
 * `tone="solid"` is the calm variant for surfaces that already carry glass
 * (a sheet header, the bottom group): same geometry, plain canvas fill.
 */
export function GlassCircleButton({
  label,
  children,
  onClick,
  href,
  className,
  testId,
  tone = 'glass',
  disabled,
}: {
  /** Accessible name — required. */
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  testId?: string;
  tone?: 'glass' | 'solid';
  disabled?: boolean;
}) {
  const classes = cn(
    'press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
    'text-apple-ink dark:text-white',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember',
    tone === 'glass' ? 'glass' : 'bg-apple-canvas dark:bg-apple-tile-1',
    disabled && 'opacity-40',
    className,
  );
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} data-testid={testId} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={classes}
    >
      {children}
    </button>
  );
}

export default GlassCircleButton;
