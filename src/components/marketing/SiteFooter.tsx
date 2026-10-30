import React from 'react';
import { AtSign } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BrandLockup } from '../BrandLockup';
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
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-12 sm:py-14">
        <div className="grid gap-x-8 gap-y-10 grid-cols-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
            {/* The brand lockup, linked home — same ember mark + themed
                wordmark as every other header, never a cream night swap. */}
            <BrandLockup className="w-fit" />
            <p className="mt-4 max-w-[34ch] text-[14px] leading-[1.55] text-apple-ink-muted dark:text-white/60">
              {t('home.subtitle')}
            </p>
            {/* AA floors in BOTH themes: muted/80 (3.75:1) and white/40
                (3.83:1) both failed the 4.5:1 bar — this is opaque muted
                (5.79:1) and white/55 (6.18:1). */}
            <p className="mt-3.5 flex items-center gap-2 text-[12px] font-medium text-apple-ink-muted dark:text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden />
              iPhone · Android · Windows · macOS · Linux
            </p>
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
                      className="group inline-flex min-h-[40px] items-center text-[14px] font-medium text-apple-ink/80 hover:text-ember dark:text-white/70 dark:hover:text-azure-400 transition-colors"
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
        <div className="mt-10 flex flex-col gap-1 border-t border-black/[0.06] pt-5 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
          <p className="text-[12px] font-medium text-apple-ink-muted dark:text-white/55">
            © {year} ShareTexts · {t('footer.noApp')} · {t('footer.noAccount')} · {t('footer.temporary')}
          </p>
          <a
            href="https://x.com/0xalyt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('footer.followAria')}
            className="inline-flex min-h-[40px] w-fit items-center gap-1.5 text-[12px] font-medium text-apple-ink-muted transition-colors hover:text-apple-ink dark:text-white/55 dark:hover:text-white"
          >
            <AtSign className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            0xalyt
          </a>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
