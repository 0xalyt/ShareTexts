import React from 'react';
import { cn } from '../../lib/utils';
import { DUR, SPRING } from '../../lib/motion/tokens';
import { MotionSurface } from './MotionSurface';

/**
 * ScreenStack — hierarchy pushes (§18).
 *
 * A short directional arrival distinguishes hierarchy from a method switch.
 * No effect/timer starts it a frame late, and no outgoing screen holds input.
 * Keyboard and reduced-motion navigation are immediate. The idle/landing
 * screen stays still; its layout and film have their own owners.
 *
 * The outgoing screen is not kept alive: state that must survive belongs to
 * the caller (scroll, selection, drafts) — this component owns motion only.
 */
export function ScreenStack({
  screen,
  children,
  className,
  mode = 'push',
}: {
  /** Any value that identifies the screen; a change triggers the transition. */
  screen: string;
  children: React.ReactNode;
  className?: string;
  /** 'push' for hierarchy, 'mode' for the crossfade used by method switches. */
  mode?: 'push' | 'mode';
}) {
  return (
    <div className={cn('route-stack', className)}>
      <MotionSurface
        key={screen}
        className="route-screen"
        initial={screen === 'idle' ? false : { opacity: 0, x: mode === 'push' ? 14 : 0 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', ...SPRING.snap, opacity: { duration: DUR.short / 1000 } }}
      >
        {children}
      </MotionSurface>
    </div>
  );
}

export default ScreenStack;
