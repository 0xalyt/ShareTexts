import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { ProductLoop } from '../landing/ProductLoop';
import { LOOPS } from '../../lib/loops.generated';

/* ---------------------------------------------------------------------------
 * LandingSections — the scroll tail of the front door.
 *
 * Phase 5 order (DESIGN.md §20a): hero → Three things → The small things →
 * FAQ → final call → footer. Each section is at most one phone viewport high,
 * and each story is one bold lead word, ONE plain sentence, and a recording of
 * the real product doing it — no invented screens, no mock notifications.
 *
 * Copy rules: short sentences, verbs, no marketing slop, no "!", every claim
 * backed by docs/redesign/claims.md. Strings live in messages/en.ts.
 * ------------------------------------------------------------------------- */

/* No eyebrow. A section's heading is its own label; "What it does" over
 * "Three things it does." said the same thing twice in two sizes, and it is
 * the kind of second label that makes a page feel annotated rather than
 * designed. The heading alone carries the rank. */
function SectionHead({ heading, id }: { heading: string; id?: string }) {
  return (
    <div className="mb-8 max-w-[560px]">
      <h2 id={id} className="st-h2 text-apple-ink dark:text-white">
        {heading}
      </h2>
    </div>
  );
}

/* ── Three things — lead word, one sentence, one real recording ───────────── */

const STORIES = [
  { key: 'pair', loop: 'pair' },
  { key: 'send', loop: 'send' },
  { key: 'keep', loop: 'keep' },
] as const;

export function ThreeThings() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="how-title" className="w-full pt-16 pb-12">
      <SectionHead id="how-title" heading={t('home.three.heading')} />
      {/* Three stories. On phones each is a row (words left, recording right);
          from lg it becomes three columns with the recording on top.

          The row version was what shipped, and on a 1440 screen it left a
          250px dead band beside every two-line paragraph — the recording is a
          phone screen ~325px tall, so the row was always as tall as the
          picture and the words floated in the middle of it. Three columns
          give the recordings a shared top line, the words a full column
          width, and the section the rhythm of a three-step sequence instead
          of three empty bands. */}
      <ul className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
        {STORIES.map(({ key, loop }) => {
          // A story with no recording yet is words on the page, one column:
          // an empty frame would be decoration pretending to be the product.
          const hasLoop = LOOPS[loop] !== null;
          return (
          <li
            key={key}
            className={cn(
              'flex border-t border-black/[0.10] pt-5 dark:border-white/[0.14]',
              hasLoop
                ? 'flex-row items-start gap-5 sm:gap-8 lg:flex-col lg:gap-5'
                : 'flex-col gap-2',
            )}
          >
              <div className="min-w-0 flex-1">
                <h3 className="text-[22px] font-semibold leading-tight text-apple-ink dark:text-white">
                  {t(`home.three.${key}.lead`)}
                </h3>
                <p className="mt-2 max-w-[34ch] text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/60">
                  {t(`home.three.${key}.body`)}
                </p>
              </div>
              <ProductLoop
                name={loop}
                label={t(`home.three.${key}.lead`)}
                className="w-[108px] shrink-0 sm:w-[132px] lg:w-[168px]"
              />
          </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── FAQ — the seven questions that actually block a first transfer ────────
 *
 * The list is ordered the way a first-time visitor asks, not the way the
 * docs are organised: what is this → how do I use it → what does it cost →
 * will it work on MY device → where can I do this → is it safe → what can I
 * send. Everything that only matters once someone is already in a room (code
 * lifetime, relay internals, Temporary Spaces) lives in the docs, one click
 * away, instead of competing here.
 * ------------------------------------------------------------------------- */

export function LandingFaq() {
  const { t } = useI18n();
  /* Four, not seven. The last three answered questions nobody has before a
   * first transfer (code lifetime, relay internals, Temporary Spaces) and are
   * one click away in the docs. A landing FAQ is the objections that stop the
   * tap, nothing else. */
  const items: QA[] = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
  ];
  return (
    <section aria-labelledby="faq-title" className="w-full py-16">
      <FaqSection
        items={items}
        heading={t('home.faq.heading')}
        sub={t('home.faq.sub')}
        pinFirst
        hideLabel
        defaultOpen={0}
        className="max-w-[720px]"
      />
      <a
        href="/docs"
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 py-3 text-[13px] font-semibold text-ember-ink hover:underline dark:text-azure-400"
      >
        {t('home.faq.more')}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </section>
  );
}

/* ── Final call — back to the two real actions ────────────────────────────── */

export function LandingCta({
  onSend,
  onReceive,
  sendLabel,
  receiveLabel,
}: {
  onSend: () => void;
  onReceive: () => void;
  sendLabel: string;
  receiveLabel: string;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="cta-title" className="w-full pt-16 pb-20">
      {/* A tone shift instead of a bordered card: the CTA is the last calm
          moment on the page, so it gets room, not a frame. */}
      <div className="rounded-[24px] bg-apple-parchment/70 px-6 py-12 text-center dark:bg-white/[0.04] sm:py-16">
        <h2 id="cta-title" className="st-h2 text-apple-ink dark:text-white">
          {t('home.cta.heading')}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/60">
          {t('home.cta.sub')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onSend}
            data-testid="cta-send"
            className={cn(
              'inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[16px] font-semibold text-white active:scale-[0.96] transition-motion',
              'bg-apple-ink hover:bg-apple-ink/90 dark:bg-white dark:text-night-900 dark:hover:bg-white/90',
            )}
          >
            {sendLabel}
          </button>
          <button
            type="button"
            onClick={onReceive}
            data-testid="cta-receive"
            className={cn(
              'inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[16px] font-semibold border active:scale-[0.96] transition-motion',
              'border-apple-divider bg-white text-apple-ink hover:border-apple-ink/25',
              'dark:border-white/[0.14] dark:bg-white/[0.05] dark:text-white dark:hover:border-white/30',
            )}
          >
            {receiveLabel}
          </button>
        </div>
        {/* The one trust line the whole page earns. */}
        <p className="mt-5 text-[13px] font-medium text-apple-ink-muted dark:text-white/55">
          {t('footer.trust')}
        </p>
      </div>
    </section>
  );
}
