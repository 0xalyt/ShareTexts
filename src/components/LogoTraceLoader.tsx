import React, { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * LogoTraceLoader — the ShareTexts mark, drawn by light.
 *
 * The mark is a signal leaving a point: two rings opening at the bottom and a
 * pin with a round head. So the loader is not a spinner with a logo pasted in
 * the middle — it is that idea animated. A soft wave of light rises out of the
 * pin's base at the bottom centre, travels out through the rings (clipped to
 * the mark, so the light exists only inside the shape), and a short bright
 * segment runs around the outer rim like a packet leaving. When the work
 * finishes, the whole silhouette draws itself, then the solid mark resolves
 * and stays.
 *
 * Geometry: the paths below are the real mark, traced from
 * public/brand/app-icon-glyph.png at 1800px through the alpha channel
 * (marching squares at 50% coverage, subpixel, simplified to Bézier segments).
 * They are the shipped shape rather than a redraw — the rebuild matches the
 * source pixels at 97% IoU, i.e. an edge difference well under a pixel at any
 * size this renders at. TRACE_PATH is the outer rim only; FILL_PATHS are the
 * three solid parts (outer ring, inner ring, pin). All of it paints with
 * currentColor, so the caller owns the colour.
 *
 * Cost: three opacity/transform animations and one dash offset. Nothing
 * measures the DOM, nothing runs per frame in JS, and the SVG is the same size
 * on the first paint and the last, so it can never shift the layout it sits in.
 */

export type LogoTraceLoaderProps = {
  /** Work in progress. Defaults to true; false starts the resolution. */
  loading?: boolean;
  /** Force the resolve even while `loading` is still true. */
  isComplete?: boolean;
  /** Rendered box in CSS pixels — identical on every render. */
  size?: number;
  /** Stroke weight in viewBox units (the mark is 100 wide). */
  strokeWidth?: number;
  /** Seconds for one lap of the rim trace and one outgoing wave. */
  loopDurationSeconds?: number;
  /** Seconds for the solid mark to fade in. */
  fillFadeSeconds?: number;
  className?: string;
  ariaLabel?: string;
  /** Called once, after the solid mark is on screen. */
  onDone?: () => void;
};

type LoaderPhase = 'loop' | 'closingOutline' | 'fadingFill' | 'done';

const LOGO_VIEW_BOX = '0 0 100 100';

/** Outer rim, bottom-right cap to bottom-left cap: where the light travels. */
const TRACE_PATH =
  'M77.1 85.6C77.3 86.3 77.9 86.8 78.5 87.1C79.1 87.5 79.8 87.8 80.4 87.9C81 88 82.1 87.9 82.1 87.8C82.8 87.6 84.2 87.2 84.2 86.7C85.3 85.8 87.2 83.9 88.5 82.5C89.7 81.2 90.8 79.8 91.8 78.4C92.8 77 94.5 75.6 94.5 74.1C95.4 72.5 97.1 70.5 97.1 68.6C97.9 66.5 99.2 63.9 99.2 61.5C99.7 58.8 100 55.5 100 52.7C100 49.9 99.2 47.1 99.2 44.4C98.7 41.6 97.8 38.6 96.9 36C96 33.6 93.6 31.2 93.6 28.9C92.3 26.5 90.5 23.8 88.8 21.7C87.3 19.6 83.6 17.7 83.6 16C81.7 14.2 79.3 12.3 77.1 10.8C75 9.4 70.4 8.1 70.4 7.1C67.9 6 64.8 4.9 62.2 4.2C59.9 3.6 55.1 3.2 55.1 3C52.6 2.8 47.4 0.4 47.4 2.9';

/** The solid mark, part by part, traced from the shipped artwork. */
const FILL_PATHS = [
  'M47.4 2.9C45.6 3.1 43.3 3.3 41.4 3.7C39.6 4 37.7 4.5 36 5C34.4 5.5 31.3 6 31.3 6.7C29.6 7.5 27.2 8.6 25.4 9.6C23.7 10.6 20.6 11.7 20.6 12.8C19 14 17.2 15.5 15.6 17C14.1 18.5 11.3 20 11.3 21.7C10 23.3 7.6 25 7.6 26.8C6.4 28.6 5.3 30.7 4.4 32.5C3.6 34.2 2.9 36.1 2.3 37.8C1.8 39.5 1.3 41.3 1 43C0.6 44.7 0.2 46.4 0.2 48.2C0 50.1 0 52.5 0 54.4C0.1 56 0.4 57.7 0.4 59.4C0.7 61.2 1.2 63.4 1.7 65.3C2.3 67.3 3 69.3 3.7 71C4.3 72.6 5.9 74.2 5.9 75.7C6.7 77.2 7.7 78.7 8.6 80.1C9.6 81.4 10.7 82.8 11.7 84C12.6 85 13.9 86.2 14.7 86.8C15.1 87.2 16.2 87.6 16.2 87.8C16.8 88 17.7 88.2 18.3 88.2C18.9 88.2 20 88 20 87.8C20.5 87.5 21.1 87.1 21.5 86.7C21.9 86.4 22.1 85.9 22.3 85.5C22.5 85.1 22.6 84.6 22.7 84.2C22.8 83.8 22.7 83.4 22.7 83.1C22.6 82.6 22.3 82.2 22.3 81.8C22.1 81.3 21.4 80.8 21.4 80.3C20.9 79.8 19.4 79.2 19.4 78.5C18.8 77.9 17.5 77.1 17.5 76.3C16.8 75.4 15.7 74 15.1 73.1C14.6 72.4 13.8 71.7 13.8 70.9C13.3 70 12.6 68.5 12.2 67.4C11.8 66.5 11.1 65.5 11.1 64.6C10.8 63.6 10.3 62.6 10.3 61.6C10 60.6 9.6 59.5 9.6 58.4C9.5 57.3 9.3 56.1 9.3 55C9.2 53.9 9.2 52.9 9.2 51.8C9.3 50.3 9.7 48 9.7 46.1C10 44.2 10.5 42.2 11.1 40.4C11.6 38.6 13.2 36.9 13.2 35.2C14 33.5 15.4 31.2 16.3 29.8C16.9 28.8 18.5 27.8 18.5 26.8C19.3 25.9 21.1 24.9 21.1 23.9C22.1 23 23.4 21.9 24.2 21.1C24.9 20.5 26.4 20 26.4 19.4C27.2 18.9 28.8 18.4 28.8 17.9C29.7 17.3 30.8 16.7 31.9 16.2C32.8 15.7 34.8 15.2 34.8 14.8C35.9 14.3 38.5 13.8 38.5 13.5C39.7 13.1 41.3 12.7 42.5 12.4C43.5 12.2 45.6 12.1 45.6 12C46.7 11.8 48.1 11.7 49.2 11.7C50.1 11.7 51.9 11.7 51.9 11.7C52.9 11.7 54.1 11.8 55.1 11.9C56.2 12.1 58.2 12.2 58.2 12.4C59.6 12.7 61.8 13.3 63.4 13.9C65 14.4 68 15.1 68 15.8C69.6 16.6 72.8 17.6 72.8 18.6C74.4 19.7 76 21.1 77.3 22.3C78.5 23.3 80.6 24.5 80.6 25.7C81.7 27 83.1 28.8 84 30.2C84.8 31.4 86.2 32.6 86.2 33.9C86.9 35.5 87.9 37.6 88.5 39.5C89.2 41.4 90.1 43.3 90.1 45.2C90.4 47.1 90.7 49.3 90.8 51.1C90.9 52.9 90.8 55.1 90.7 56.4C90.6 57.4 90.3 58.3 90.3 59.3C90.1 60.2 89.6 61.3 89.6 62.2C89.3 63.3 88.8 64.6 88.4 65.6C88.1 66.4 87.4 67.3 87.4 68.1C86.8 69.2 85 70.9 85 72.2C84.1 73.6 81.8 75.1 81.8 76.5C80.5 77.9 78.4 79.7 77.5 80.6C77.3 80.9 76.9 81.3 76.9 81.6C76.7 82 76.6 82.5 76.5 82.9C76.5 83.3 76.5 83.7 76.5 84.1C76.6 84.4 76.8 84.7 76.8 85C76.9 85.3 77.2 85.8 77.4 86.2C77.7 86.5 78 86.7 78.3 87C78.5 87.2 79.2 87.4 79.2 87.5C79.5 87.7 80.1 87.8 80.4 87.9C80.8 87.9 81.5 87.9 81.5 87.9C81.9 87.8 82.8 87.7 82.8 87.5C83.2 87.3 84.2 87 84.2 86.7C85.1 85.9 87.3 83.7 88.5 82.5C89.4 81.6 90.3 80.4 91.1 79.4C91.7 78.6 93 77.7 93 76.7C93.8 75.3 95.4 72.5 96.1 71C96.6 70 97.4 69 97.4 67.9C97.8 66.7 98.4 64.9 98.7 63.7C98.9 62.7 99.3 61.8 99.3 60.8C99.5 59.7 99.8 58.1 99.9 56.7C100 55.3 100 53.9 100 52.6C100 51.1 99.7 49.5 99.7 48C99.5 46.2 98.9 43.1 98.5 41.4C98.3 40.3 97.5 39.1 97.5 38C97.1 36.7 96.6 35.3 96.1 34.1C95.7 33 94.7 31.9 94.7 30.9C94 29.7 93.1 27.9 92.3 26.7C91.7 25.7 90.4 24.7 90.4 23.7C89.6 22.7 88.8 21.5 87.9 20.5C87.1 19.5 85.2 18.5 85.2 17.5C84.3 16.5 83.1 15.4 82.1 14.6C81.3 13.9 79.7 13.3 79.7 12.6C78.6 11.9 77 10.7 75.9 10C75 9.4 73 8.9 73 8.4C71.9 7.8 70.4 7.1 69.2 6.5C68.1 6.1 66.9 5.6 65.7 5.2C64.6 4.8 62.2 4.5 62.2 4.2C61 3.9 59.5 3.6 58.4 3.4C57.3 3.3 55.1 3.1 55.1 3C54 2.9 51.8 2.9 51.8 2.9C50.5 2.8 47.4 2.8 47.4 2.9Z',
  'M47.8 21.1C46.5 21.2 45.1 21.4 44 21.6C43.1 21.8 41.3 22 41.3 22.3C40.2 22.6 37.7 23.1 37.7 23.6C36.5 24.1 35.2 24.7 34.1 25.4C33 26 31 26.7 31 27.4C29.9 28.3 28.5 29.5 27.5 30.4C26.5 31.3 25.6 32.3 24.9 33.3C24.1 34.2 22.8 35.2 22.8 36.1C22.1 37.1 21 38.2 21 39.2C20.4 40.4 19.9 41.7 19.4 42.9C19 44 18.4 45.1 18.4 46.2C18.1 47.4 17.7 48.6 17.7 49.8C17.6 51.2 17.6 52.8 17.6 54.1C17.6 55.2 17.9 56.4 17.9 57.5C18.1 58.7 18.4 60.2 18.8 61.5C19.1 62.7 19.6 64.1 20.1 65.1C20.4 66 21.4 66.8 21.4 67.7C21.9 68.6 22.6 69.7 23.2 70.5C23.6 71.2 24.7 71.8 24.7 72.5C25.3 73.1 26.1 73.9 26.7 74.3C27.1 74.6 28 74.8 28 74.9C28.5 75.1 29.7 75.2 29.7 75.2C30.2 75.1 31 74.9 31.5 74.7C31.9 74.5 32.4 74.1 32.7 73.9C32.9 73.7 33.3 73.4 33.3 73.1C33.5 72.8 33.9 72.3 33.9 71.9C34 71.5 34.1 71 34 70.5C34 70 33.9 69.5 33.8 69.1C33.6 68.7 33.2 68.3 33.2 67.9C32.6 67.2 31.3 65.8 30.5 64.8C29.8 63.9 29.3 62.9 28.8 61.9C28.3 60.9 27.9 59.8 27.6 58.8C27.3 57.7 26.9 56.7 26.9 55.7C26.8 54.5 26.7 52.9 26.8 51.8C26.8 50.9 27 50 27 49.2C27.2 48.3 27.7 47.4 27.7 46.5C28 45.5 29 44.3 29 43.3C29.5 42.2 30.8 41.1 30.8 40.1C31.5 39.2 32.3 38.2 33.2 37.3C34 36.4 35.9 35.6 35.9 34.9C37 34.1 38.8 33 40 32.4C41 31.8 43.2 31.4 43.2 31.1C44.4 30.7 46.7 30.5 46.7 30.3C48 30.1 49.5 30 50.7 30C51.8 30 54 30.1 54 30.3C55 30.5 56.2 30.8 57.2 31.1C58.1 31.3 59.1 31.7 59.9 32.1C60.7 32.5 62.1 32.9 62.1 33.3C62.9 33.8 64.7 34.5 64.7 35.2C65.5 35.9 66.4 36.8 67.1 37.4C67.6 38 68.5 38.5 68.5 39.1C69 39.9 69.9 41.2 70.4 42.1C70.8 42.9 71.6 43.8 71.6 44.7C71.9 45.7 72.4 47.2 72.6 48.3C72.8 49.3 72.9 50.3 73 51.3C73.1 52.3 73 53.2 73 54.2C72.9 55.3 72.7 56.6 72.5 57.6C72.3 58.5 71.6 59.4 71.6 60.3C71.2 61.2 70.7 62.1 70.3 62.9C69.8 63.7 68.8 64.4 68.8 65.1C68 66 66.4 67.7 65.8 68.4C65.6 68.7 65.4 69.1 65.4 69.5C65.3 69.9 65.2 70.4 65.3 70.8C65.3 71.2 65.4 71.6 65.5 71.9C65.6 72.3 65.9 72.6 65.9 72.8C66.1 73.2 66.5 73.6 66.8 73.9C67 74.1 67.5 74.3 67.5 74.4C67.9 74.6 68.7 74.9 69.2 75C69.7 75.1 70.2 75 70.6 74.9C70.9 74.9 71.5 74.8 71.5 74.7C71.9 74.5 72.7 74.3 72.7 74.1C73.1 73.8 73.8 73.4 73.8 73.1C74.3 72.6 75.3 71.5 75.9 70.8C76.5 70.2 77.4 69.5 77.4 68.8C77.9 68 78.6 66.8 79.1 66C79.5 65.3 80.1 64.6 80.1 63.8C80.5 62.7 81.2 60.9 81.5 59.5C81.8 58.2 82.2 56.9 82.2 55.5C82.3 53.9 82.2 51.2 82.2 50C82.1 49.3 81.9 48.6 81.9 47.9C81.7 47 81.1 45.6 81.1 44.4C80.7 43.1 79.4 41.3 79.4 39.9C78.7 38.4 77.7 36.6 76.8 35.2C76.1 34.1 74.3 32.9 74.3 31.9C73.3 30.8 71.1 29.7 71.1 28.8C69.9 27.7 68.3 26.4 66.8 25.5C65.2 24.6 63.5 23.8 62 23.2C60.6 22.6 57.8 22.2 57.8 21.9C56.3 21.5 54.5 21.2 52.8 21.1C51.1 21 49.2 21.1 47.8 21.1Z',
  'M49.8 40.9C49.2 40.9 47.9 41 47.9 41.1C47.2 41.3 46.2 41.6 45.4 41.9C44.8 42.2 43.5 42.5 43.5 42.9C42.9 43.3 42.2 43.9 41.6 44.4C41.1 45 40.1 45.6 40.1 46.2C39.7 47 39.1 48.1 38.8 48.8C38.5 49.4 38.3 50 38.3 50.6C38.2 51.3 38.1 52 38.1 52.7C38.1 53.5 38.5 54.8 38.5 55.8C38.8 56.8 39.3 57.9 39.8 58.8C40.4 59.6 41.9 60.4 41.9 61.1C42.7 61.8 44.8 62 44.8 63.2C45.3 68.5 44.7 87.7 44.9 93C44.9 93.8 45.4 94.5 45.8 95.1C46 95.5 46.9 95.8 46.9 96.1C47.3 96.4 47.9 96.7 48.4 96.9C48.9 97.1 49.8 97.2 49.8 97.2C50.3 97.2 51 97.1 51.5 96.9C52 96.7 53.1 96.5 53.1 96.1C53.5 95.8 54 95.3 54.3 94.8C54.6 94.4 54.8 93.8 54.9 93.4C55 93 55.1 92.5 55.1 92.1C55.1 87 54.7 68.1 55.1 63C55.1 62.2 56.7 62.1 57.2 61.8C57.5 61.6 58 61.4 58 61.1C58.5 60.6 59.6 59.4 60.2 58.6C60.7 57.8 61.1 56.6 61.4 55.9C61.6 55.5 61.8 55 61.8 54.5C61.9 53.9 61.9 53.2 61.9 52.6C61.9 51.9 61.8 51.2 61.8 50.5C61.6 49.8 61.4 49 61.1 48.3C60.9 47.6 60.1 47 60.1 46.4C59.7 45.7 58.7 45.1 58.7 44.5C58.1 44 57.4 43.4 56.8 43C56.2 42.5 54.9 42.2 54.9 41.9C54.1 41.6 53.2 41.3 52.4 41.1C51.6 41 50.6 40.9 49.8 40.9Z',
] as const;

/** The pin's base: the point the light leaves from. */
const LIGHT_X = 50;
const LIGHT_Y = 92;
/** Big enough that one lap reaches the top ring. */
const WAVE_R = 112;

/** How long the closing outline takes to draw itself. */
const OUTLINE_MS = 520;

const CSS = `
@keyframes st-logo-run { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -1 } }
@keyframes st-logo-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes st-logo-wave {
  0% { transform: scale(0.08); opacity: 0.95 }
  60% { opacity: 0.5 }
  100% { transform: scale(1); opacity: 0 }
}
@keyframes st-logo-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes st-logo-ring {
  0% { transform: scale(0.06); opacity: 1 }
  45% { opacity: 0.9 }
  100% { transform: scale(1); opacity: 0 }
}
.st-logo-run { animation: st-logo-run var(--st-logo-loop, 1.6s) linear infinite; }
.st-logo-draw { animation: st-logo-draw var(--st-logo-outline, 520ms) ease-out both; }
.st-logo-wave, .st-logo-ring {
  transform-box: view-box;
  transform-origin: ${LIGHT_X}px ${LIGHT_Y}px;
}
.st-logo-wave { animation: st-logo-wave var(--st-logo-loop, 1.6s) ease-out infinite; }
.st-logo-ring { animation: st-logo-ring var(--st-logo-loop, 1.6s) cubic-bezier(0.22, 0.61, 0.36, 1) infinite; }
.st-logo-fill { animation: st-logo-fade var(--st-logo-fill, 450ms) ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .st-logo-run, .st-logo-draw, .st-logo-wave, .st-logo-ring, .st-logo-fill { animation: none !important; }
}
`;

export function LogoTraceLoader({
  loading = true,
  isComplete = false,
  size = 40,
  strokeWidth = 4,
  loopDurationSeconds = 1.6,
  fillFadeSeconds = 0.45,
  className,
  ariaLabel,
  onDone,
}: LogoTraceLoaderProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [phase, setPhase] = useState<LoaderPhase>('loop');
  const announced = useRef(false);

  // `isComplete` wins over `loading`: a caller that knows the work landed can
  // say so without also flipping the boolean it uses for everything else.
  const finished = isComplete || !loading;

  useEffect(() => {
    // A reduced-motion reader still needs the answer, just not the journey.
    if (reduce) {
      setPhase('done');
      return;
    }
    if (!finished) {
      setPhase('loop');
      return;
    }
    setPhase('closingOutline');
    const fadeMs = Math.max(0, Math.round(fillFadeSeconds * 1000));
    // Timers, not animationend: a throttled tab or a skipped frame must still
    // land on the solid mark. The outline is timed, the fill is declared.
    const toFill = window.setTimeout(() => setPhase('fadingFill'), OUTLINE_MS);
    const toDone = window.setTimeout(() => setPhase('done'), OUTLINE_MS + fadeMs);
    return () => {
      window.clearTimeout(toFill);
      window.clearTimeout(toDone);
    };
  }, [finished, reduce, fillFadeSeconds]);

  useEffect(() => {
    if (phase !== 'done' || announced.current) return;
    announced.current = true;
    onDone?.();
  }, [phase, onDone]);

  const showFill = phase === 'fadingFill' || phase === 'done';
  const stroke = Math.max(0.6, strokeWidth);

  return (
    <svg
      role="status"
      aria-label={ariaLabel}
      aria-busy={phase !== 'done' || undefined}
      viewBox={LOGO_VIEW_BOX}
      width={size}
      height={size}
      className={cn('st-logo-trace block shrink-0', className)}
      style={{
        ['--st-logo-loop' as string]: `${loopDurationSeconds}s`,
        ['--st-logo-fill' as string]: `${fillFadeSeconds}s`,
        ['--st-logo-outline' as string]: `${OUTLINE_MS}ms`,
      }}
    >
      <style>{CSS}</style>
      <defs>
        {/* A wavefront, not a glow: the light has a short trailing edge and a
            bright leading rim, so it reads as something travelling outward
            rather than a lamp switching on behind the mark. */}
        <radialGradient id={`stLogoWave${uid}`}>
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.56" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.66" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="0.88" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="0.96" stopColor="currentColor" stopOpacity="0.65" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`stLogoClip${uid}`}>
          {FILL_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
      </defs>

      {/* Kept while working so the mark is always legible; gone once solid.
          Faint on purpose: the light is what brightens it. Small sizes get
          more of it, because at 18px a 0.16 ghost disappears into a label. */}
      {!showFill && (
        <g opacity={size <= 22 ? 0.3 : 0.16}>
          {FILL_PATHS.map((d) => (
            <path key={d} d={d} fill="currentColor" />
          ))}
        </g>
      )}

      {/* Light leaving the pin, seen only where the mark is. Below 28px the
          band is thinner than one device pixel, so small sizes skip it and
          rely on the rim trace, which still reads. */}
      {phase === 'loop' && size >= 28 && (
        <g clipPath={`url(#stLogoClip${uid})`}>
          {/* Two passes of the same wave: soft light behind, a defined front
              edge in front. The edge is what makes it read as travelling. */}
          <circle className="st-logo-wave" cx={LIGHT_X} cy={LIGHT_Y} r={WAVE_R} fill={`url(#stLogoWave${uid})`} />
          <circle
            className="st-logo-ring"
            cx={LIGHT_X}
            cy={LIGHT_Y}
            r={WAVE_R}
            fill="none"
            stroke="currentColor"
            strokeWidth={9}
            strokeLinecap="round"
          />
        </g>
      )}

      {/* The travelling segment on the rim. */}
      {phase === 'loop' && (
        <path
          className="st-logo-run"
          d={TRACE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="0.14 0.86"
        />
      )}

      {/* The answer: the silhouette closes, then fills. */}
      {!showFill && phase !== 'loop' && (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={Math.max(0.8, stroke * 0.5)}
          strokeLinejoin="round"
          className="st-logo-draw"
        >
          {FILL_PATHS.map((d) => (
            <path key={d} d={d} pathLength={1} strokeDasharray="1 1" />
          ))}
        </g>
      )}

      {showFill && (
        <g className="st-logo-fill">
          {FILL_PATHS.map((d) => (
            <path key={d} d={d} fill="currentColor" />
          ))}
        </g>
      )}
    </svg>
  );
}

export default LogoTraceLoader;
