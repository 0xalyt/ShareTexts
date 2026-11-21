import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionPreference } from '../lib/useMotionPreference';
import { cn } from '../lib/utils';

/**
 * NumberTicker — the dissolve digit-roll, on the web.
 *
 * Each digit is its own clipped 0–9 column. The column's strip rolls to the
 * new digit on a calm iOS curve, rightmost first with a small stagger, so a
 * number reads as one object settling rather than six little wheels starting
 * at once. A digit that appears (a count moving 9 → 10) opens its column in
 * from zero width; one that disappears folds its column away. The row is
 * inline-flex, so those width changes animate instead of snapping — the
 * layout never jumps.
 *
 * The dissolve original gets this from Reanimated worklets; this app is a
 * Vite + React web build with no Expo runtime, so the same behaviour is
 * rebuilt with `motion/react` (already a dependency) and tabular figures:
 *
 *   · columns are exactly `1ch` wide because the type is tabular — every
 *     digit occupies the same advance as "0", which is what makes a width
 *     animation honest instead of a guess.
 *   · the strip is 0…9 stacked at 1em each; `translateY(-N em)` is the digit.
 *
 * Locale: the glyphs come from `Intl.NumberFormat(locale).format(0…9)`, so an
 * Arabic interface rolls ٠…٩ rather than dropping Latin digits into the row.
 * A character that is not one of the locale's digits (a unit, a separator, an
 * em dash) stays static text and is never rolled.
 *
 * It rolls on mount — that is the "first time we see the number" reveal — and
 * again whenever the value changes.
 */

export interface NumberTickerProps {
  /** Pre-formatted text, e.g. "1.2 GB", "—". Digits inside it roll. */
  text?: string;
  /** Or a bare number, formatted here with the locale's grouping/decimals. */
  value?: number;
  /** Fixed fraction digits when `value` is used. */
  decimals?: number;
  /** BCP-47 locale for digit shapes and grouping. */
  locale?: string;
  /** Text before/after the number ("€ 12", "12 GB"). */
  prefix?: string;
  suffix?: string;
  /** Seconds for one digit to roll. */
  duration?: number;
  /** Extra delay per column, walking right to left. */
  stagger?: number;
  /** Plain-text value for assistive tech; defaults to the rendered number. */
  label?: string;
  className?: string;
}

/** The calm iOS curve — fast, then a long soft settle, no bounce. */
const EASE = [0.22, 1, 0.36, 1] as const;

const GLYPHS = new Map<string, string[]>();

/** The digit shapes this locale actually uses (Arabic-Indic for ar-EG, …). */
function digitGlyphs(locale: string): string[] {
  const cached = GLYPHS.get(locale);
  if (cached) return cached;
  let glyphs: string[];
  try {
    const f = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
    glyphs = Array.from({ length: 10 }, (_, i) => f.format(i));
  } catch {
    glyphs = Array.from({ length: 10 }, (_, i) => String(i));
  }
  GLYPHS.set(locale, glyphs);
  return glyphs;
}

type Token =
  | { key: string; kind: 'digit'; digit: number }
  | { key: string; kind: 'char'; char: string };

/**
 * Split the text into static characters and rolling digits. Digit keys count
 * from the RIGHT, so appending a leading digit (9 → 10) leaves the existing
 * columns untouched and only opens one new column on the left.
 */
function tokenize(text: string, glyphs: string[]): Token[] {
  const index = new Map<string, number>();
  glyphs.forEach((glyph, i) => index.set(glyph, i));

  // Static characters are grouped into runs: "GB", "," and "—" stay one
  // text node, so the number is still readable and copyable as words while
  // only the digits are split into rolling columns.
  const runs: Array<{ digit: number } | { char: string }> = [];
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    runs.push({ char: buffer });
    buffer = '';
  };
  for (const char of Array.from(text)) {
    const digit = index.get(char);
    if (digit === undefined) {
      buffer += char;
      continue;
    }
    flush();
    runs.push({ digit });
  }
  flush();

  const total = runs.reduce((n, run) => n + ('digit' in run ? 1 : 0), 0);
  let seen = 0;
  return runs.map((run, i): Token => {
    if ('char' in run) return { key: `c${i}`, kind: 'char', char: run.char };
    const fromRight = total - 1 - seen;
    seen += 1;
    return { key: `d${fromRight}`, kind: 'digit', digit: run.digit };
  });
}

export function NumberTicker({
  text,
  value,
  decimals = 0,
  locale = 'en-US',
  prefix,
  suffix,
  duration = 0.62,
  stagger = 0.028,
  label,
  className,
}: NumberTickerProps) {
  const reduce = useMotionPreference();

  const formatted = useMemo(() => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      try {
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      } catch {
        return String(value);
      }
    }
    return text ?? '';
  }, [decimals, locale, text, value]);

  const glyphs = useMemo(() => digitGlyphs(locale), [locale]);
  const tokens = useMemo(() => tokenize(formatted, glyphs), [formatted, glyphs]);

  /* Width is animated in PIXELS, never as "0 → 1ch": a unitless 0 and a ch
     value cannot interpolate, so the column would snap open instead of
     opening. The probe is one tabular "0" at the ticker's own font, which is
     exactly the advance every digit in the row occupies. */
  const probeRef = useRef<HTMLSpanElement>(null);
  const [digitWidth, setDigitWidth] = useState(0);
  useLayoutEffect(() => {
    if (reduce) return;
    const el = probeRef.current;
    if (!el) return;
    const read = () => setDigitWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reduce]);

  const plain = label ?? `${prefix ?? ''}${formatted}${suffix ?? ''}`;
  // MotionConfig suppresses spatial transforms, including the strip's y.
  // A zero-duration strip would therefore show the first glyph (0), not the
  // requested digit. Render real text instead: correct on first paint, when
  // the preference changes, and with animations completely disabled.
  if (reduce) {
    return (
      <span className={cn('num-ticker', className)}>
        <span className="sr-only">{plain}</span>
        <span aria-hidden>{prefix}{formatted}{suffix}</span>
      </span>
    );
  }
  const digitCount = tokens.reduce((n, token) => n + (token.kind === 'digit' ? 1 : 0), 0);
  let seen = 0;

  return (
    <span className={cn('num-ticker', className)}>
      {/* The value as text, for screen readers, selection and any consumer
          that reads the DOM — the rolling art below is decorative. */}
      <span className="sr-only">{plain}</span>
      <span className="num-ticker__row" aria-hidden>
        <span ref={probeRef} className="num-ticker__probe" aria-hidden>0</span>
        {prefix ? <span className="num-ticker__char">{prefix}</span> : null}
        <AnimatePresence initial={false}>
          {tokens.map((token) => {
            if (token.kind === 'char') {
              return (
                <span key={token.key} className="num-ticker__char">{token.char}</span>
              );
            }
            const fromRight = digitCount - 1 - seen;
            seen += 1;
            const delay = reduce ? 0 : fromRight * stagger;
            return (
              <motion.span
                key={token.key}
                className="num-ticker__col"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: digitWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : {
                        width: { duration: 0.34, ease: EASE, delay },
                        opacity: { duration: 0.22, ease: 'linear', delay },
                      }
                }
              >
                <motion.span
                  className="num-ticker__strip"
                  initial={{ y: '0em' }}
                  animate={{ y: `${-token.digit}em` }}
                  transition={reduce ? { duration: 0 } : { duration, ease: EASE, delay }}
                >
                  {glyphs.map((glyph, i) => (
                    <span key={i} className="num-ticker__glyph">{glyph}</span>
                  ))}
                </motion.span>
              </motion.span>
            );
          })}
        </AnimatePresence>
        {suffix ? <span className="num-ticker__char">{suffix}</span> : null}
      </span>
    </span>
  );
}

export default NumberTicker;
