import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * FaqSection — the Docs questions, in a shape you can actually scan.
 *
 * The answers are passed IN, not written here: the Docs page already owns
 * this content (and index.html publishes the same questions as FAQPage
 * structured data), so this component is the reading experience and nothing
 * else. One answer open at a time — a stack of open answers is a wall of
 * text again — with hairline dividers instead of a card per question, so the
 * list reads as one object.
 *
 * The FIRST answer is always visible (`pinFirst`): the question everyone
 * asks ("what is this?") should not need a tap to read, and on a landing page
 * a fully collapsed list reads as "no answers here". It is rendered as plain
 * content, not as a disclosure that refuses to close — a control that does
 * nothing when pressed is a lie about what it does.
 *
 * Accessibility is not an afterthought on a disclosure: every header is a
 * real <button> with aria-expanded and aria-controls pointing at its panel,
 * the panel is a real element with an id, and the chevron rotates rather
 * than being swapped for a different glyph (a swap is invisible to anyone
 * reading the button's text, a rotation is honest about state).
 */
export type QA = { q: string; a: string };

export function FaqSection({
  items,
  heading,
  sub,
  hideLabel = false,
  className,
  defaultOpen = 0,
  pinFirst = false,
}: {
  items: QA[];
  /** Rendered as the section's own h2 when given (long-form pages have one). */
  heading?: string;
  /** One quiet line under the heading: what this list is for. */
  sub?: string;
  /**
   * Suppress the built-in "Questions" rule-and-label. The landing already
   * introduces this list with its own eyebrow ("FAQ") AND heading ("Questions,
   * answered."), so the label was the third stacked title over one list —
   * noise, not hierarchy. Long-form pages keep it.
   */
  hideLabel?: boolean;
  className?: string;
  defaultOpen?: number | null;
  /** Keep the first answer open and non-collapsible (see the note above). */
  pinFirst?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const panelId = (i: number) => `faq-panel-${i}`;

  return (
    <section className={cn('w-full', className)} aria-labelledby="faq-title">
      {heading ? (
        <div className="mb-5 max-w-[560px]">
          <h2
            id="faq-title"
            className="st-h2 text-apple-ink dark:text-white"
          >
            {heading}
          </h2>
          {sub ? (
            <p className="mt-2.5 text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/55">
              {sub}
            </p>
          ) : null}
        </div>
      ) : hideLabel ? null : (
        <div className="mb-5 flex items-baseline gap-3">
          <h2
            id="faq-title"
            className="text-[12px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/70 dark:text-white/40"
          >
            Questions
          </h2>
          <span className="h-px flex-1 bg-apple-divider/70 dark:bg-white/[0.07]" aria-hidden />
        </div>
      )}

      <ul className="divide-y divide-apple-divider/70 border-y border-apple-divider/70 dark:divide-white/[0.06] dark:border-white/[0.06]">
        {items.map((item, i) => {
          const pinned = pinFirst && i === 0;
          const isOpen = pinned || open === i;
          const id = panelId(i);
          const question = (
            <span
              className={cn(
                'flex-1 text-[16px] font-semibold transition-colors',
                isOpen || pinned
                  ? 'text-apple-ink dark:text-white'
                  : 'text-apple-ink/80 group-hover:text-apple-ink dark:text-white/75 dark:group-hover:text-white',
              )}
            >
              {item.q}
            </span>
          );
          return (
            <li key={item.q}>
              <h3>
                {pinned ? (
                  // Not a button: the answer below is always visible, so there
                  // is nothing for this heading to toggle.
                  <span className="flex min-h-[56px] items-center gap-3 py-4 text-left">
                    <ChevronRight
                      className="h-4 w-4 shrink-0 rotate-90 text-ember dark:text-azure-400"
                      aria-hidden
                    />
                    {question}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={id}
                    data-testid={`faq-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="group flex min-h-[56px] w-full items-center gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:focus-visible:ring-azure-400/50"
                  >
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-apple-ink-muted transition-transform duration-200 dark:text-white/40',
                        isOpen && 'rotate-90 text-ember dark:text-azure-400',
                      )}
                      aria-hidden
                    />
                    {question}
                  </button>
                )}
              </h3>
              {pinned ? (
                // Same measured line-height and indent as an expanded panel,
                // so the first answer and the rest of the list share a rail.
                <p id={id} className="pb-5 pl-7 pr-2 text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/55">
                  {item.a}
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={id}
                      key="panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pl-7 pr-2 text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/55">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default FaqSection;
