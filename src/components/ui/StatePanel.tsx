import React from 'react';
import { AlertCircle, Bookmark, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * StatePanel — empty, loading and error are one family, not three one-offs.
 *
 * The three states answer the same two questions in the same order, at the
 * same weight, in the same frame:
 *
 *   what is going on  →  one 16px sentence (the title)
 *   what can I do     →  one 13px sentence (the body), then one action
 *
 * The frame is a fixed minimum height on purpose: when data lands, the panel
 * is replaced by rows in the same slot, so the header, the footer and the
 * person's scroll position do not move. Loading is not a centred spinner in a
 * void — it keeps the copy anatomy so the answer to "what is happening?" is on
 * screen while it happens.
 *
 * Copy contract (enforced by review, not by types):
 *   · empty  — a door: name the place, then invite the one action that fills it
 *   · loading— present tense, what is being read and where it comes from
 *   · error  — name the problem, then the fix. No apology, no "oops", no
 *              "something went wrong" without saying WHAT went wrong.
 */
export type StateKind = 'empty' | 'loading' | 'error';

const TILE: Record<StateKind, string> = {
  empty: 'bg-ember/10 text-ember dark:bg-azure-400/12 dark:text-azure-400',
  loading: 'bg-black/[0.05] text-apple-ink-muted dark:bg-white/[0.07] dark:text-white/60',
  error: 'bg-status-danger/10 text-status-danger',
};

export function StatePanel({
  kind,
  title,
  body,
  action,
  secondary,
  icon,
  illustration,
  testId,
  className,
  children,
}: {
  kind: StateKind;
  /** What is going on, in one sentence. */
  title: string;
  /** What to do about it, in one sentence. */
  body?: string;
  action?: { label: string; onClick: () => void; testId?: string };
  secondary?: { label: string; onClick: () => void; testId?: string };
  /** Override the family glyph; the tile, size and colour stay the same. */
  icon?: React.ReactNode;
  /** Full drawing, without the glyph's surrounding tile. */
  illustration?: React.ReactNode;
  testId?: string;
  className?: string;
  /** Extra content under the copy — the skeleton rows, for `loading`. */
  children?: React.ReactNode;
}) {
  const glyph =
    icon ??
    (kind === 'error' ? (
      <AlertCircle className="h-5 w-5" strokeWidth={1.8} />
    ) : kind === 'loading' ? (
      <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" strokeWidth={1.8} />
    ) : (
      <Bookmark className="h-5 w-5" strokeWidth={1.8} />
    ));

  return (
    <div
      data-testid={testId}
      data-state={kind}
      role={kind === 'loading' ? 'status' : undefined}
      aria-busy={kind === 'loading' || undefined}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      className={cn(
        // One frame for all three: same padding, same measure, same floor.
        'flex min-h-[300px] w-full flex-col items-start justify-center px-5 py-6 text-start',
        className,
      )}
    >
      {illustration ? <span className="st-state-illustration" aria-hidden>{illustration}</span> : <span
        className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', TILE[kind])}
        aria-hidden
      >
        {glyph}
      </span>}
      <p className="mt-4 text-[16px] font-medium leading-snug text-apple-ink dark:text-white">
        {title}
      </p>
      {body && (
        <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/65">
          {body}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          data-testid={action.testId}
          className="press mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-ember-ink px-5 text-[13px] font-medium text-white transition-colors hover:bg-ember-ink-hover"
        >
          {action.label}
        </button>
      )}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          data-testid={secondary.testId}
          className="press mt-1 inline-flex min-h-[44px] items-center text-[13px] font-medium text-ember-ink transition-colors hover:underline dark:text-azure-400"
        >
          {secondary.label}
        </button>
      )}
      {children}
    </div>
  );
}

/**
 * Skeleton row shaped like a saved row: 48px tile, a title line, a meta line,
 * and the action rail underneath. Same padding and radius as the real row, so
 * the swap is a fill-in, not a reflow.
 */
export function StateSkeletonRow({ index = 0 }: {
  index?: number;
  /** Declared so `<StateSkeletonRow key={i}>` typechecks (repo React 19 types). */
  key?: React.Key;
}) {
  return (
    <div
      className="flex min-h-[92px] w-full shrink-0 gap-3 rounded-[16px] border border-black/[0.06] p-3 dark:border-white/[0.07]"
      aria-hidden
    >
      <span className="st-skeleton h-12 w-12 shrink-0 rounded-[12px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <span className="st-skeleton h-3 rounded-full" style={{ width: `${72 - index * 9}%` }} />
        <span className="st-skeleton h-2.5 w-2/5 rounded-full" />
        <span className="st-skeleton h-[30px] w-24 rounded-full" />
      </span>
    </div>
  );
}

export default StatePanel;
