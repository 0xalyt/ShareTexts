import React, { useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';

/**
 * ShuffleHeading — the hero line types itself into a different noun.
 *
 * "Share [anything] between any devices easily." cycles the noun with a real
 * type-in / type-out, because the point of that line is *variety*: the thing
 * changes while the promise stays put.
 *
 * Two decisions worth knowing:
 *
 *   · The characters are written straight into the DOM node, not into React
 *     state. A state update every 72 ms re-rendered the hero on a loop, and
 *     that is not free: measured on a phone-emulated page it was adding ~80 ms
 *     of main-thread work per keystroke burst, which showed up as a laggy theme
 *     toggle and a laggy first tap anywhere on the page. Nothing else needs to
 *     know this word exists, so React is told exactly once.
 *   · It runs whether or not the device has reduced motion enabled. That is a
 *     deliberate exception to our motion policy on the owner's instruction, and
 *     it is the one animation on the page that carries meaning rather than
 *     decoration — the sentence claims "anything", and the words are the
 *     evidence. It stays safe: everything lives in one inline box whose width
 *     is reserved by an invisible longest word, so nothing outside it moves.
 *     Assistive tech gets a single stable sentence and never the churn.
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

const TYPE_MS = 72;
const DELETE_MS = 42;
const HOLD_MS = 1150;
const GAP_MS = 140;

export function ShuffleHeading({ className }: { className?: string }) {
  const { lang } = useI18n();
  const wordRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (lang !== 'en' || !wordRef.current) return;
    const node = wordRef.current;
    let index = 0;
    let shown = WORDS[0];
    let phase: 'typing' | 'holding' | 'deleting' | 'waiting' = 'holding';
    let timer = 0;

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
    tick();
    return () => window.clearTimeout(timer);
  }, [lang]);

  return (
    <h1
      className={`st-display text-[clamp(29px,7.6vw,44px)] sm:text-[clamp(32px,3.6vw,44px)] tracking-[-0.035em] text-apple-ink dark:text-white text-center ${className ?? ''}`}
    >
      <span className="sr-only">Share anything between any devices easily.</span>
      <span aria-hidden className="flex flex-col items-center">
        {/* Line one is centred as a unit and never moves: "Share" is anchored
            at the start of that unit, and the word slot beside it has a fixed
            width, so typing cannot shift the word, the caret or the sentence
            below it. Two lines instead of one because a single line at this
            size breaks mid-phrase on every phone. */}
        <span className="inline-flex items-baseline whitespace-nowrap">
          Share
          <span
            className="relative inline-block shrink-0 align-baseline text-left"
            style={{ marginLeft: '0.26em' }}
          >
            {/* The ghost sets the slot width and must never be allowed to
                shrink: when flex squeezed it on a phone, the word underneath
                was clipped mid-glyph. */}
            <span className="invisible whitespace-nowrap" aria-hidden>
              Screenshots
            </span>
            <span className="absolute inset-0 whitespace-nowrap">
              <span
                ref={wordRef}
                className="st-word-gradient bg-clip-text text-transparent"
              >
                {lang === 'en' ? 'Texts' : 'anything'}
              </span>
              <span
                className="st-caret-rm ml-[2px] inline-block w-[2px] translate-y-[0.06em]"
                style={{
                  height: '0.92em',
                  background: 'linear-gradient(180deg, #ff9f45, #f06413)',
                  animation: 'st-caret-blink 1.05s steps(1,end) infinite',
                }}
              />
            </span>
          </span>
        </span>
        <span className="mt-0.5">between any devices easily.</span>
      </span>
    </h1>
  );
}

export default ShuffleHeading;
