import React from 'react';
import { cn } from '../../lib/utils';

/**
 * LargeTitle — the content-first screen title (§18): h2, 32px, 700, left
 * aligned, no rule, no bar. Optional one-line supporting sentence beneath.
 *
 * Deliberately not a hero: the title names the screen, the callers below it
 * do the work. Text-wrap balance keeps a two-line phone title from leaving
 * a single orphan word.
 */
export function LargeTitle({
  children,
  subtitle,
  as: Tag = 'h2',
  className,
  subtitleClassName,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  subtitleClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Tag className="text-[32px] font-bold leading-[1.14] tracking-[-0.02em] text-apple-ink [text-wrap:balance] dark:text-white">
        {children}
      </Tag>
      {subtitle ? (
        <p className={cn('text-[16px] leading-[1.4] text-apple-ink-muted [text-wrap:pretty] dark:text-white/55', subtitleClassName)}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default LargeTitle;
