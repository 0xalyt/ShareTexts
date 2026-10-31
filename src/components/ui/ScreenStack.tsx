import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * ScreenStack — hierarchy pushes (§18).
 *
 * Changing `screen` mounts the new screen with the push animation (it comes
 * in from the right while the outgoing one leaves), then settles. The
 * animation is CSS (styles/apple-dna.css), so it runs on the compositor and
 * can be interrupted by the next screen at any frame; under
 * prefers-reduced-motion the same change is a 140 ms crossfade.
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
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), mode === 'push' ? 300 : 200);
    return () => clearTimeout(t);
  }, [screen, mode]);

  return (
    <div className={cn('route-stack', className)}>
      <div key={screen} className="route-screen" data-route-state={settled ? 'active' : mode}>
        {children}
      </div>
    </div>
  );
}

export default ScreenStack;
