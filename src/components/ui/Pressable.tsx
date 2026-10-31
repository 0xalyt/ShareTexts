import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Pressable — the one tap-wrapper for anything that is not a button we style
 * elsewhere (§18): a list row, a tile, a card that opens something.
 *
 * It contributes exactly one thing: the press. Geometry, surface and label
 * belong to the caller so a row stays a row. Renders <a> when `href` is set.
 */
export function Pressable({
  children,
  onClick,
  href,
  className,
  disabled,
  label,
  testId,
  type = 'button',
  as = 'button',
}: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLElement>;
  href?: string;
  className?: string;
  disabled?: boolean;
  /** Accessible name when the content alone does not name the action. */
  label?: string;
  testId?: string;
  type?: 'button' | 'submit' | 'reset';
  as?: 'button' | 'a';
}) {
  const classes = cn(
    'press block w-full text-left',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember',
    disabled && 'opacity-40 pointer-events-none',
    className,
  );
  if (as === 'a' || href) {
    return (
      <a href={href} aria-label={label} data-testid={testId} className={classes} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={label} data-testid={testId} className={classes}>
      {children}
    </button>
  );
}

export default Pressable;
