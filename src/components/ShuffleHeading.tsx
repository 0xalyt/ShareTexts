import React, { useLayoutEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';

/**
 * ShuffleHeading — the hero line types itself into a different noun.
 *
 * "Share [anything] between any devices easily." cycles the noun with a real
 * type-in / type-out, because the point of that line is *variety*: the thing
 * changes while the promise stays put.
 *
 * Three decisions worth knowing:
 *
 *   · CENTRED, PER WORD. The line is centred as the sentence it currently is,
 *     not inside a box reserved for the longest word. The old version sized a
 *     slot to "Screenshots" and wrote short words into it, so "Share Code" sat
 *     in the left of a wide slot with a hole on the right — the line looked
 *     pinned left of centre (and worse on desktop, where the hole was 200px).
 *     Now the slot is only as wide as the word it is typing, so the pair is
 *     always optically centred.
 *   · NO JITTER. The slot width is driven by the *target* word, measured from
 *     an invisible ghost, and eased over 240ms. During the 72→88ms keystrokes
 *     the line therefore does not move at all — it only breathes once, in the
 *     gap between words, when the next word needs more room.
 *   · It runs whether or not the device has reduced motion enabled. That is a
 *     deliberate exception to our motion policy on the owner's instruction, and
 *     it is the one animation on the page that carries meaning rather than
 *     decoration — the sentence claims "anything", and the words are the
 *     evidence. It stays safe: everything lives inside the h1, whose two lines
 *     are sized to fit the column, so nothing outside it moves. Assistive tech
 *     gets a single stable sentence and never the churn.
 */

const WORDS = [
  'Texts',
  'Files',
  'Images',
  'Videos',
  'Links',
  'GIFs',
  'Movies',
  'Code',
  'APKs',
  'Audio',
  'Documents',
  'Screenshots',
  'Pictures',
  'Music',
  'Anything',
];

/** Typing rhythm. Slowed by ~20% on the owner's note: the words should be
 *  readable as words, not as a slot machine. */
const TYPE_MS = 88;
const DELETE_MS = 50;
const HOLD_MS = 1400;
const GAP_MS = 120;
/** How long the line takes to make room for the next word. */
const BREATHE_MS = 240;

export function ShuffleHeading({ className }: { className?: string }) {
  const { lang } = useI18n();
  const wordRef = useRef<HTMLSpanElement | null>(null);
  const ghostRef = useRef<HTMLSpanElement | null>(null);
  const slotRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const node = wordRef.current;
    const ghost = ghostRef.current;
    const slot = slotRef.current;
    if (!node || !ghost || !slot) return;

    // Non-English gets one honest word, statically: the noun list is English
    // content, and translating fifteen nouns per locale is not this component's
    // job. No slot width, no loop, no timers.
    if (lang !== 'en') {
      slot.style.width = '';
      node.textContent = 'anything';
      return;
    }

    let index = 0;
    let shown = WORDS[0];
    let phase: 'typing' | 'holding' | 'deleting' | 'waiting' = 'holding';
    let timer = 0;

    /** Reserve exactly the target word's width (the ghost is the ruler). */
    const breathe = (word: string) => {
      ghost.textContent = word;
      const width = ghost.getBoundingClientRect().width;
      if (width > 0) slot.style.width = `${width}px`;
    };

    const tick = () => {
      const target = WORDS[index];
      if (phase === 'holding') {
        timer = window.setTimeout(() => {
          phase = 'deleting';
          tick();
        }, HOLD_MS);
        return;
      }
      if (phase === 'deleting') {
        if (shown.length > 0) {
          shown = target.slice(0, shown.length - 1);
          node.textContent = shown;
          timer = window.setTimeout(tick, DELETE_MS);
        } else {
          phase = 'waiting';
          timer = window.setTimeout(() => {
            index = (index + 1) % WORDS.length;
            phase = 'typing';
            breathe(WORDS[index]);
            tick();
          }, GAP_MS);
        }
        return;
      }
      if (phase === 'typing') {
        const next = WORDS[index];
        if (shown.length < next.length) {
          shown = next.slice(0, shown.length + 1);
          node.textContent = shown;
          timer = window.setTimeout(tick, TYPE_MS);
        } else {
          phase = 'holding';
          tick();
        }
      }
    };

    node.textContent = shown;
    breathe(shown);
    tick();

    // A remeasure after the display face lands (and on resize) keeps the slot
    // honest: the first measurement can happen before the webfont swaps in.
    const remeasure = () => breathe(WORDS[index]);
    window.addEventListener('resize', remeasure);
    document.fonts?.ready.then(remeasure).catch(() => {});

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', remeasure);
    };
  }, [lang]);

  return (
    <h1
      className={`st-display text-[clamp(32px,8.8vw,46px)] lg:text-[clamp(44px,4.05vw,56px)] tracking-[-0.035em] text-apple-ink dark:text-white text-center lg:text-left ${className ?? ''}`}
    >
      <span className="sr-only">Share anything between any devices easily.</span>
      <span aria-hidden className="flex flex-col items-center lg:items-start">
        {/* Line one: "Share" + the word, centred as a unit. The slot is as
            wide as the word currently being typed, so there is never a void
            beside a short word — and because the width is measured from the
            TARGET word, typing does not drag the line around. */}
        <span className="inline-flex items-baseline justify-center whitespace-nowrap lg:justify-start">
          <span>Share</span>
          <span
            ref={slotRef}
            className="relative inline-block shrink-0 align-baseline text-left motion-reduce:transition-none"
            style={{
              marginLeft: '0.26em',
              transition: `width ${BREATHE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {/* The ruler: never seen, never in flow. */}
            <span ref={ghostRef} className="invisible absolute left-0 top-0 whitespace-nowrap" aria-hidden>
              Texts
            </span>
            <span ref={wordRef} className="st-word-gradient bg-clip-text text-transparent">
              {lang === 'en' ? 'Texts' : 'anything'}
            </span>
            <span
              className="st-caret-rm ml-[0.04em] inline-block w-[2px] translate-y-[0.06em]"
              style={{
                height: '0.9em',
                background: 'linear-gradient(180deg, #ff9f45, #f06413)',
                animation: 'st-caret-blink 1.05s steps(1,end) infinite',
              }}
            />
          </span>
        </span>
        {/* Line two is the promise, a size below the noun so the pair reads as
            one statement instead of two headlines. At 0.62em it holds on ONE
            line from 360px up — the old same-size version wrapped to two lines
            on every phone AND on desktop, which is what made the block look
            ragged and top-heavy. */}
        <span className="mt-[0.16em] text-[0.58em] font-semibold leading-[1.18] tracking-[-0.02em] text-apple-ink/70 dark:text-white/70 text-center text-balance lg:text-left">
          between any devices easily.
        </span>
      </span>
    </h1>
  );
}

export default ShuffleHeading;
