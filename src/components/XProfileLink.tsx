import React from 'react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

/**
 * The X profile link — one component, because it appears in three footers and
 * had drifted into three different targets (36px, 40px, and a bare text run).
 *
 * What "done properly" means for one social link:
 *
 *   · 44×44 minimum on a finger. A 36px pill is a fine drawing and a target
 *     a thumb misses; the handle text alone was a 20px-tall run.
 *   · A visible focus ring. These footers sit at the end of long pages, and
 *     a keyboard user tabbing the last row needs to see where they are —
 *     hover styles are not a focus state.
 *   · `rel="me"` as well as `noopener noreferrer`: it is a profile link, and
 *     `me` is the one rel that says so.
 *   · The new tab is announced, not implied. `target="_blank"` with no
 *     warning is the classic small betrayal of the last link on a page.
 *   · Press feedback (`active:scale`), so a tap answers before navigation.
 */
export function XGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function XProfileLink({
  showHandle = true,
  className,
  testId = 'footer-x',
}: {
  /** Show the @handle beside the glyph. Hidden on the narrowest surfaces. */
  showHandle?: boolean;
  className?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  // The accessible name carries both halves a sighted user gets from the
  // picture: who it is, and that it leaves the site.
  const label = `${t('footer.followAria')} — @0xalyt (opens in a new tab)`;

  return (
    <a
      href="https://x.com/0xalyt"
      target="_blank"
      rel="me noopener noreferrer"
      aria-label={label}
      title="x.com/0xalyt"
      data-testid={testId}
      className={cn(
        'group inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full',
        'border border-apple-divider/70 px-3 text-[12px] font-semibold leading-none',
        'text-apple-ink-muted transition-[color,border-color,transform] duration-150',
        'hover:border-apple-ink/25 hover:text-apple-ink',
        'active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-apple-canvas',
        'dark:border-white/[0.10] dark:text-white/60 dark:hover:border-white/25 dark:hover:text-white',
        'dark:focus-visible:ring-ember/70 dark:focus-visible:ring-offset-night-900',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        className,
      )}
    >
      <XGlyph className="h-[13px] w-[13px]" />
      {showHandle && <span>@0xalyt</span>}
    </a>
  );
}

export default XProfileLink;
