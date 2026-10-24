/**
 * TriLineGlyph — the "every icon is exactly three SVG lines" idea, made real.
 *
 * Both states are drawn with the SAME three <line> elements, so switching is a
 * true morph: the lines interpolate to their new endpoints instead of one
 * glyph unmounting and another popping in. A state that needs fewer visible
 * strokes collapses its extra line to a zero-length point at the center —
 * invisible, but still a line, so the structure never breaks.
 *
 *   play   → vertical left edge + two diagonals to the tip (a triangle)
 *   pause  → two vertical bars; the third line collapses to a center point
 *
 * Line 1 is deliberately IDENTICAL in both states (the left edge IS the left
 * bar), so the eye anchors on it while lines 2 and 3 travel. That shared
 * anchor is what makes the morph legible rather than jittery.
 *
 * Motion animates the x1/y1/x2/y2 SVG attributes directly — no path `d`
 * string swapping, so there is no shape-matching plugin and no frame where
 * the glyph reads as anything but play or pause.
 */
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export type TriLineState = 'play' | 'pause';

/** Endpoints per line, per state: [x1, y1, x2, y2]. viewBox is 0 0 24 24. */
const GEOM: Record<TriLineState, [number, number, number, number][]> = {
  play: [
    [8, 5, 8, 19],    // left edge (shared anchor — identical in both states)
    [8, 5, 18, 12],   // top diagonal to the tip
    [8, 19, 18, 12],  // bottom diagonal to the tip
  ],
  pause: [
    [8, 5, 8, 19],    // left bar (same as play's left edge)
    [16, 5, 16, 19],  // right bar
    [12, 12, 12, 12], // extra line collapsed to an invisible center point
  ],
};

/** A line whose two endpoints are identical renders as nothing but a round
 *  cap; hide it entirely so no stray dot shows at low opacity. */
const isPoint = (e: [number, number, number, number]) =>
  e[0] === e[2] && e[1] === e[3];

export function TriLineGlyph({
  state,
  className,
  strokeWidth = 2.2,
}: {
  state: TriLineState;
  className?: string;
  strokeWidth?: number;
}) {
  const reduced = useReducedMotion();
  const target = GEOM[state];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {target.map((endpoints, i) => {
        const [x1, y1, x2, y2] = endpoints;
        return (
          <motion.line
            key={i}
            // Reduced motion: jump straight to the state, no interpolation.
            initial={false}
            animate={{ x1, y1, x2, y2, opacity: isPoint(endpoints) ? 0 : 1 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }}
          />
        );
      })}
    </svg>
  );
}

export default TriLineGlyph;
