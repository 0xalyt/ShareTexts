import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BrandLockup } from '../BrandLockup';
import { XProfileLink } from '../XProfileLink';
import { useI18n } from '../../lib/i18n';
import type { MsgKey } from '../../lib/messages/types';

/**
 * SiteFooter — the long-form pages' footer.
 *
 * Tailored, not templated. The usual four-column sitemap is a lie on a site
 * with nine pages: it either repeats the top nav, or it invents links that
 * lead nowhere. So this footer carries what a person at the end of a long
 * page actually might want next — the product, the two legal pages, the one
 * guide — in three short columns, each with a heading that means something.
 *
 * Hierarchy (rev 2026-10, matching the landing footer):
 *   band     the footer is its own tone (parchment), not "page + hairline"
 *   brand    lockup → one-sentence promise → "every platform" status line
 *   columns  heading (12px eyebrow) → links at a 40px tap floor
 *   legal    one row: © · the deal in three words · the one social handle
 *
 * The third column used to be headed "Terms" while also containing a "Terms"
 * link — the heading and the link read as a duplicate. It is `Legal` now
 * (footer.legal, translated in every locale), which is what the column is.
 *
 * Fully localized (the hardcoded-English version shipped before the demo
 * round's 9-locale pass caught it).
 */
const COLUMNS: { title: MsgKey; links: { label: MsgKey; href: string; external?: boolean }[] }[] = [
  {
    title: 'footer.useIt',
    links: [
      { label: 'footer.open', href: '/' },
      { label: 'footer.withCode', href: '/#main-content' },
      { label: 'space.title', href: '/docs' },
    ],
  },
  {
    title: 'footer.read',
    links: [
      { label: 'nav.docs', href: '/docs' },
      { label: 'nav.guides', href: '/guides' },
      { label: 'nav.about', href: '/about' },
      { label: 'footer.devs', href: '/llms.txt' },
    ],
  },
  {
    title: 'footer.legal',
    links: [
      { label: 'nav.privacy', href: '/privacy' },
      { label: 'nav.terms', href: '/terms' },
      { label: 'footer.report', href: 'https://x.com/0xalyt', external: true },
    ],
  },
];

export function SiteFooter({ className }: { className?: string }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer
      className={cn(
        // Its own band, edge to edge: the tone change is the divider, so the
        // footer needs no border and no shadow on top of it.
        'bg-apple-parchment/80 dark:bg-white/[0.02] border-t border-black/[0.05] dark:border-white/[0.06]',
        className,
      )}
    >
      {/* Same 1200px column as the header, the landing footer and every
          hero: the brand sits on one left edge across the whole site. */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-6 sm:py-16 lg:px-8 2xl:px-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))] lg:gap-x-12">
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
            {/* The brand lockup, linked home — same ember mark + themed
                wordmark as every other header, never a cream night swap. */}
            <BrandLockup className="w-fit" />
            <p className="mt-4 max-w-[34ch] text-[13px] leading-[1.55] text-apple-ink-muted dark:text-white/60">
              {t('home.subtitle')}
            </p>
            {/* AA floors in BOTH themes: muted/80 (3.75:1) and white/40
                (3.83:1) both failed the 4.5:1 bar — this is opaque muted
                (5.79:1) and white/55 (6.18:1). */}
            <p className="mt-3.5 flex items-center gap-2 text-[12px] font-medium text-apple-ink-muted dark:text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden />
              iPhone · Android · Windows · macOS · Linux
            </p>
            {/* The end of a long page is where a reader is finally convinced
                and has nothing left to click but a sitemap. One solid button
                back to the product, in the same ink the app uses for its own
                primary action, so the footer ends on a door instead of a
                column of small links. */}
            <a
              href="/"
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-apple-ink px-4 text-[13px] font-semibold text-white transition-colors hover:bg-apple-ink/90 dark:bg-white dark:text-night-900 dark:hover:bg-white/90"
            >
              {t('footer.open')}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </a>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={t(col.title)} className="min-w-0">
              <h2 className="st-eyebrow">{t(col.title)}</h2>
              <ul className="mt-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="group inline-flex min-h-[44px] items-center text-[13px] font-medium text-apple-ink/80 hover:text-ember dark:text-white/70 dark:hover:text-azure-400 transition-colors"
                    >
                      {/* The underline grows from the left on hover — the
                          quiet affordance an Apple footer uses instead of
                          turning the label blue. */}
                      <span className="bg-gradient-to-r from-current to-current bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-200 group-hover:bg-[length:100%_1px] motion-reduce:transition-none">
                        {t(link.label)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The bottom row: the deal, stated once, plus the one action a
            reader might want at the very end of a page. */}
        {/* Bottom row. Two things only — the deal, and the person — with the
            hairline doing the separating work so neither needs a bigger gap
            to look intentional. Wraps as a block on a phone instead of
            shrinking the line until it wraps mid-sentence. */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-black/[0.06] pt-6 dark:border-white/[0.08]">
          <p className="min-w-0 text-[11.5px] font-medium leading-relaxed text-apple-ink-muted dark:text-white/55 sm:text-[12px]">
            © {year} ShareTexts · {t('footer.noApp')} · {t('footer.noAccount')} · {t('footer.temporary')}
          </p>
          {/* The person behind it, not a handle. One component owns the
              target, the 44px floor, the reduced-motion opt-out and the
              press feedback, so the three footers cannot drift again. */}
          <XProfileLink className="-my-1" />
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
