import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Pressable } from './Pressable';

/**
 * ListRow — the quiet inset row that replaced cards on Home (§18).
 *
 * 52px tall, an inset hairline (starting where the content starts, like an
 * iOS table view), an optional leading glyph, an optional trailing value and
 * a chevron only when the row really goes somewhere.
 *
 * There is no card, no shadow and no border box: a row is a line of type
 * with a target around it, which is why five of them read as one list
 * instead of five competing objects.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  href,
  chevron = true,
  testId,
  className,
  ariaLabel,
  disabled,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLElement>;
  href?: string;
  chevron?: boolean;
  testId?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onClick={onClick}
      href={href}
      disabled={disabled}
      testId={testId}
      label={ariaLabel}
      className={cn(
        'group flex min-h-[52px] items-center gap-3 px-1 py-2.5',
        // Inset hairline: the line belongs to the row, not to a box.
        'border-b border-apple-divider/70 last:border-b-0 dark:border-white/[0.08]',
        className,
      )}
    >
      {leading ? <span className="flex h-8 w-8 shrink-0 items-center justify-center text-apple-ink-muted dark:text-white/55">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium leading-tight text-apple-ink dark:text-white">{title}</span>
        {subtitle ? (
          <span className="truncate text-[13px] font-medium text-apple-ink-muted dark:text-white/50">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0 text-[13px] font-medium text-apple-ink-muted dark:text-white/50">{trailing}</span> : null}
      {chevron ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-apple-ink-muted/50 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-white/30 motion-reduce:transition-none"
          strokeWidth={1.8}
          aria-hidden
        />
      ) : null}
    </Pressable>
  );
}

export default ListRow;
