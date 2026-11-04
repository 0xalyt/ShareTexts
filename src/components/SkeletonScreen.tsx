/**
 * SkeletonScreen — the loading state, tailored per screen.
 *
 * A skeleton is not decoration: it is the app holding the user's place. Each
 * variant mirrors the REAL screen's geometry (same paddings, same column, same
 * hierarchy) so the swap from skeleton to content moves nothing. The blocks are
 * flat band-coloured rectangles — no shimmer sweep, no pulse, no gradient. A
 * moving placeholder draws the eye to the one thing on screen that has nothing
 * to say; stillness reads as "your room is coming" instead of "the app is
 * busy".
 *
 * Timing (DESIGN.md §2.6): nothing appears for the first 300 ms. Work under
 * 300 ms is fast enough that a skeleton would be a flash, and a flash is worse
 * than a beat of nothing. SkeletonGate owns that delay, and the wait costs no
 * layout shift because it reserves the same box the skeleton will fill.
 *
 * Variants mounted today:
 *   room    — the transfer room (Suspense fallback in SingleScreenApp)
 *   space   — a Temporary Space before its first snapshot arrives
 * The Nearby sheet deliberately has no skeleton: it has a designed searching
 * state (the radar row), and a skeleton there would invent a wait that the
 * presence socket does not actually make.
 * The old home/pairing/connecting/connected variants were removed in P2: no
 * route rendered them, and a skeleton for a screen that cannot load is a lie
 * about how fast the app is.
 */
import React from 'react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

/** One quiet block — the only primitive a skeleton needs. Exported so every
 *  loading surface (routes, space, cards) draws from ONE tone instead of
 *  re-declaring per-site colors. */
export function Bar(props: { className?: string; style?: React.CSSProperties; key?: React.Key }) {
  // NOTE: the type declares `key` only so `<Bar key={i}>` typechecks in
  // maps — React extracts it before props arrive, so it is never read
  // here (accessing props.key warns "key is not a prop" and fails gates).
  const { className, style } = props;
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn('h-3.5 rounded-full bg-apple-ink/[0.07] dark:bg-white/[0.08]', className)}
    />
  );
}

export type SkeletonVariant = 'room' | 'space';

/**
 * The 300 ms rule. Children are the skeleton; `min` is the box the region will
 * occupy, so showing nothing first cannot shift anything.
 */
export function SkeletonGate({
  children,
  min = '18rem',
  delay = 300,
  className,
}: {
  children: React.ReactNode;
  /** CSS min-height of the region, so the wait reserves real space. */
  min?: string;
  delay?: number;
  className?: string;
}) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return (
    <div className={className} style={{ minHeight: min }} aria-busy={!ready}>
      {ready ? children : null}
    </div>
  );
}

/** Three row-shaped blocks: the shared geometry of every list that loads. */
function Rows({ count = 3, wide = false }: { count?: number; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-1.5">
          <Bar className="h-9 w-9 shrink-0 !rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className={cn('h-3', wide ? 'w-[62%]' : 'w-[48%]')} />
            <Bar className="h-2 w-[30%]" />
          </div>
          <Bar className="h-2.5 w-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonScreen({ variant = 'room' }: { variant?: SkeletonVariant }) {
  const { t } = useI18n();

  // The transfer room: device bar, the message column, the composer pill.
  // FULL-BLEED — the real room fills its pane edge to edge, so the skeleton
  // must too (a centered island would render at 340px and jump).
  if (variant === 'room') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={t('skeleton.room')}
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
          {/* Three quiet cards, then the composer: the room's real height,
              without inventing a conversation the user will never see. */}
          <div className="flex-1 flex flex-col justify-end gap-3 px-4 pb-4">
            <Bar className="me-auto h-10 w-[58%] !rounded-[16px]" />
            <Bar className="ms-auto h-12 w-[46%] !rounded-[16px]" />
            <Bar className="me-auto h-10 w-[38%] !rounded-[16px]" />
          </div>
          {/* Composer: the same three pieces, in the same places. */}
          <div className="flex items-center gap-2 px-4 pb-5">
            <Bar className="h-11 w-11 shrink-0 !rounded-full" />
            <Bar className="h-11 flex-1 !rounded-[20px]" />
            <Bar className="h-11 w-11 shrink-0 !rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // A Temporary Space: title, share row, then its list of items.
  if (variant === 'space') {
    return (
      <div role="status" aria-live="polite" aria-label={t('space.title')} className="flex flex-col gap-5 p-4 select-none">
        <div className="flex flex-col gap-2">
          <Bar className="h-6 w-[46%] !rounded-[8px]" />
          <Bar className="h-2.5 w-[28%]" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-10 flex-1 !rounded-[12px]" />
          <Bar className="h-10 w-10 !rounded-[12px]" />
        </div>
        <Rows count={3} wide />
      </div>
    );
  }

  // Normally unreachable (the union is closed above); an empty status keeps a
  // future variant failing visibly instead of rendering a blank box.
  return <div role="status" aria-live="polite" aria-label={t('common.loading')} className="h-full w-full" />;
}
