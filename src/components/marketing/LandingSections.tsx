import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { StoryArt } from '../landing/StoryArt';

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

const STORIES = [{ key: 'pair' }, { key: 'send' }, { key: 'keep' }] as const;

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
      {/* One column per story, artwork on top at the column's full width.
          The recordings this replaces were 168px wide in a 340px column — a
          postage stamp of a phone screen, and a third of the section held a
          quarter-megabyte of video each. A drawing gets the space to say its
          one thing, and it stays crisp on a retina display and a 3G phone
          alike. The index is the only new mark: it tells you these are three
          parts of one answer, in order. */}
      <ul className="grid grid-cols-1 gap-12 sm:gap-10 lg:grid-cols-3 lg:gap-8">
        {STORIES.map(({ key }, i) => (
          <li key={key} className="group flex flex-col">
            <div className="st-art-panel relative isolate overflow-hidden rounded-[16px] border border-black/[0.09] bg-apple-parchment/60 p-4 transition-colors duration-300 dark:border-white/[0.10] dark:bg-white/[0.03]
                            [@media(hover:hover)]:group-hover:border-black/[0.16] dark:[@media(hover:hover)]:group-hover:border-white/[0.18]">
              <div className="aspect-[320/220] w-full">
                <StoryArt story={key} label={t(`home.three.${key}.lead`)} />
              </div>
              <span
                aria-hidden
                className="absolute left-4 top-3.5 text-[11px] font-semibold tabular-nums tracking-[0.16em] text-apple-ink-muted/55 dark:text-white/30"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="mt-5 text-[20px] font-semibold leading-tight tracking-[-0.015em] text-apple-ink dark:text-white">
              {t(`home.three.${key}.lead`)}
            </h3>
            <p className="mt-2 max-w-[36ch] text-[15.5px] leading-relaxed text-apple-ink-muted dark:text-white/60">
              {t(`home.three.${key}.body`)}
            </p>
          </li>
        ))}
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

