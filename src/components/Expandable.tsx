/**
 * Expandable / FitWidth — content that resizes WITHOUT the container snapping.
 *
 * Width and height are not interpolatable between a fixed value and "whatever
 * the content needs", so Motion cannot animate `height: 'auto'` between two
 * unknown sizes on its own. The fix is two elements: an OUTER motion div that
 * animates to a measured size, and an INNER div (the ref target) whose size
 * the content dictates. When content changes, the observer reports the new
 * size and the outer div springs to it.
 *
 * Guards (all three are load-bearing):
 *  1. First render: bounds are 0 before the first measurement — animate to
 *     "auto" until a real number exists so nothing animates from 0.
 *  2. Inner ref, outer animate — never the same element (loop).
 *  3. Reduced motion: MotionConfig upstream flattens transforms, but height
 *     is a layout value, so we zero the transition ourselves here.
 */
import React from 'react';
import { motion } from 'motion/react';
import { useMotionPreference } from '../lib/useMotionPreference';
import { useMeasure } from '../lib/useMeasure';
import { cn } from '../lib/utils';
import { DUR, EASE } from '../lib/motion/tokens';

/**
 * Animates its own height to its content's height — always.
 *
 * Two modes, one component:
 *  - `open` omitted (always-fit): for content that resizes WHILE MOUNTED
 *    (line-clamp releasing, a preview swapping for full text). This is the
 *    pure article pattern — the outer div tracks the inner's measured height
 *    and springs whenever it changes. AnimatePresence can't do this: the node
 *    never unmounts, so there's no enter/exit to hook.
 *  - `open` given: collapses to 0 height when false, fits content when true —
 *    accordions and show/hide. Children stay mounted either way, so their
 *    measurement stays warm and re-opening doesn't remount state.
 */
export function Expandable({
  open,
  children,
  className,
  duration = DUR.short / 1000,
}: {
  open?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Seconds. Kept short: a size catch-up that lags reads as lag. */
  duration?: number;
}) {
  const [ref, bounds] = useMeasure();
  const reduced = useMotionPreference();
  const fit = bounds.height > 0 ? bounds.height : 'auto';
  return (
    <motion.div
      className={cn('overflow-hidden', className)}
      initial={false}
      animate={{ height: open === false ? 0 : fit }}
      transition={reduced || (typeof document !== 'undefined' && document.documentElement.dataset.motionIntent !== 'pointer') ? { duration: 0 } : { duration, ease: EASE.out }}
    >
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}

/** Frequent action labels update in place: never interpolate layout width. */
export function FitWidth({ children, className }: {
  children: React.ReactNode;
  className?: string;
  /** Retained for caller compatibility; width updates are immediate. */
  duration?: number;
}) {
  return <span className={cn('inline-block whitespace-nowrap', className)}>{children}</span>;
}
