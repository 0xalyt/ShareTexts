/**
 * SkeletonScreen — the loading state, tailored per screen.
 *
 * A skeleton is not decoration: it is the app holding the user's place.
 * The variant mirrors the REAL screen's geometry (same paddings, same
 * column, same hierarchy) so the swap from skeleton to content moves
 * nothing — the layout is stable before and after load. Bars use the
 * canvas's own tones, one gentle shimmer sweep (CSS, transform-only, no
 * jank), and go still under prefers-reduced-motion (MotionConfig also
 * flattens the rest of the app there).
 *
 * Loading here is rare (routes and chunks prewarm on idle); the skeleton
 * exists for slow networks and cold caches — precisely when a blank or
 * flashing frame would cost the most trust.
 *
 * NOTE: only the `room` variant is mounted in the app (SingleScreenApp's
 * Suspense fallbacks). Earlier drafts carried home/pairing/connecting/
 * connected variants that no route ever rendered — removed rather than
 * shipped as dead code.
 */
import React from 'react';
import { cn } from '../lib/utils';

/** One quiet bar — the only primitive a skeleton needs. Exported so
 *  every loading surface (routes, space, cards) draws from ONE tone and
 *  one motion instead of re-declaring per-site colors. */
export function Bar(props: { className?: string; style?: React.CSSProperties; key?: React.Key }) {
  // NOTE: the type declares `key` only so `<Bar key={i}>` typechecks in
  // maps — React extracts it before props arrive, so it is never read
  // here (accessing props.key warns "key is not a prop" and fails gates).
  const { className, style } = props;
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn(
        'st-skeleton h-3.5 rounded-full bg-apple-ink/[0.07] dark:bg-white/[0.08]',
        className
      )}
    />
  );
}

export type SkeletonVariant = 'room';

export function SkeletonScreen({ variant = 'room' }: { variant?: SkeletonVariant }) {
  // variant === 'room' — mirrors the transfer room: device bar, the
  // message column, and the composer pill at the bottom. FULL-BLEED:
  // the real room fills its pane edge to edge, so the skeleton must
  // too (a centered island would render at 340px and jump).
  if (variant === 'room') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Opening your room"
        className="h-full w-full flex flex-col select-none"
      >
        <div className="h-full w-full flex flex-col">
          {/* Device bar */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Bar className="h-8 w-8 !rounded-[10px]" />
            <div className="flex flex-col gap-1.5">
              <Bar className="h-3 w-24" />
              <Bar className="h-2 w-16" />
            </div>
          </div>
          {/* Message column — alternating sides like real cards, stable
              heights so nothing jumps when content replaces it. */}
          <div className="flex-1 flex flex-col justify-end gap-3 px-4 pb-4">
            <Bar className="mr-auto h-10 w-[64%] !rounded-[16px]" />
            <Bar className="ml-auto h-10 w-[52%] !rounded-[16px]" />
            <Bar className="mr-auto h-16 w-[72%] !rounded-[16px]" />
          </div>
          {/* Composer */}
          <div className="flex items-center gap-2 px-4 pb-5">
            <Bar className="h-11 w-11 shrink-0 !rounded-full" />
            <Bar className="h-11 flex-1 !rounded-[20px]" />
            <Bar className="h-11 w-11 shrink-0 !rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Unreachable today (SkeletonVariant is 'room'-only); kept as an empty
  // status so an added variant fails visibly rather than rendering blank.
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="h-full w-full" />
  );
}
