import React from 'react';
import { Smartphone, Monitor, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * PlatformStrip — "it runs on what you already own", scrolling once.
 *
 * Why platforms and not other companies' logos: a marquee of brand marks we
 * have no relationship with would be a claim we cannot back, and readers who
 * know the game read it as filler. What is actually true, useful, and ours to
 * say is which devices and browsers ShareTexts runs on today — so the strip
 * names those, with the app's own glyph vocabulary (one phone, one screen,
 * one globe) instead of borrowed marks.
 *
 * Presentation: a plain wrapping row. It was a marquee, which in a reference
 * page is the wrong tool twice over — the reader is scanning for one name and
 * has to wait for it, and the loop showed a clipped chip at each end.
 */
const PLATFORMS: { name: string; kind: 'phone' | 'screen' | 'web' }[] = [
  { name: 'iPhone', kind: 'phone' },
  { name: 'Android', kind: 'phone' },
  { name: 'iPad', kind: 'phone' },
  { name: 'Windows', kind: 'screen' },
  { name: 'macOS', kind: 'screen' },
  { name: 'Linux', kind: 'screen' },
  { name: 'Chrome', kind: 'web' },
  { name: 'Safari', kind: 'web' },
  { name: 'Firefox', kind: 'web' },
  { name: 'Edge', kind: 'web' },
];

const Glyph = ({ kind, className }: { kind: 'phone' | 'screen' | 'web'; className?: string }) => {
  if (kind === 'phone') return <Smartphone className={className} aria-hidden />;
  if (kind === 'screen') return <Monitor className={className} aria-hidden />;
  return <Globe className={className} aria-hidden />;
};

export function PlatformStrip({ className }: { className?: string }) {
  return (
    <section className={cn('w-full', className)} aria-labelledby="platforms-title">
      <div className="mb-3.5 flex items-baseline gap-3">
        <h2
          id="platforms-title"
          className="text-[12px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/70 dark:text-white/40"
        >
          Works everywhere
        </h2>
        <span className="h-px flex-1 bg-apple-divider/70 dark:bg-white/[0.07]" aria-hidden />
        <span className="text-[12px] font-medium text-apple-ink-muted/60 dark:text-white/30">
          nothing to install
        </span>
      </div>
      {/* A wrapping row, not a marquee. In a reference page the reader is
          looking for one name — "does it run on Linux?" — and a ticker makes
          them wait for it to come round, while the loop cut the first and
          last chip in half at the mask. Ten short chips fit in two calm
          lines at every width, and nothing moves. */}
      <ul className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {PLATFORMS.map((p) => (
          <li
            key={p.name}
            className="flex shrink-0 items-center gap-2 rounded-full border border-apple-divider/70 bg-white/60 px-3.5 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]"
          >
            <Glyph kind={p.kind} className="h-3.5 w-3.5 text-apple-ink-muted dark:text-white/45" />
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-apple-ink/80 dark:text-white/70">
              {p.name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PlatformStrip;
