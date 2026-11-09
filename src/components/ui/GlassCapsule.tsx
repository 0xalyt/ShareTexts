import React from 'react';
import { cn } from '../../lib/utils';

/**
 * GlassCapsule — the trailing group of at most two actions on a task screen
 * (§18). It is the only container allowed to hold glass buttons; past two
 * controls the right answer is a sheet, not a longer capsule (Hick).
 *
 * Children are expected to be 44px targets with their own accessible names;
 * this wraps them and owns the material, the radius and the 4px padding.
 */
export function GlassCapsule({
  children,
  className,
  label,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the group, e.g. "Room actions". */
  label?: string;
  testId?: string;
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      data-testid={testId}
      /* 3px of padding, not 4: two 44px targets inside a 40px-radius pill read
         as one instrument cluster only when the rim stays a hairline. At 4px
         the capsule grew a visible white gutter around both icons, which is
         what made the phone header look like two buttons floating in a lozenge. */
      className={cn('glass-capsule inline-flex items-center gap-0 p-0.5', className)}
    >
      {children}
    </div>
  );
}

export default GlassCapsule;
