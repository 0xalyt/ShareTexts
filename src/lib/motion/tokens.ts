/**
 * Motion tokens (F24) — one restrained system for every transition in the
 * app. CSS carries the same duration ladder as `--st-dur-*` in index.css
 * (CSS can't import TS); keep the numbers in sync — this file is the
 * source of truth.
 *
 * Motion exists only to communicate: CAUSE · STATE · RELATIONSHIP ·
 * HIERARCHY · FEEDBACK · ORIENTATION. If an animation communicates none
 * of those, it does not ship (see docs/audits/motion.md for the audit).
 *
 * ── Duration ladder ────────────────────────────────────────────────────
 * instant  60ms   press feedback that should read as immediate
 * micro   120ms   taps, toggles, copy confirmations, tooltips
 * hover   150ms   pointer feedback
 * short   200ms   backdrop fades and small state flips
 * medium  280ms   toasts, popovers, structural entrances
 * sheet   400ms   structural surfaces (physical spring for gestures)
 * long    480ms   image fade-in; a singular hero beat may use 600ms
 *
 * Frequent interactions use short values: no animation may make the app
 * feel slower than the operation it describes. Long-running loops are
 * reserved for STATE (connecting, transferring) and are always frozen
 * under prefers-reduced-motion (MotionConfig reducedMotion="user" in
 * main.tsx makes positional transforms instant, but does NOT remove every
 * duration, stagger, or CSS keyframe. Prefer static digits and anchored
 * progress feedback; CSS guards the keyframe side).
 *
 * ── Springs vs easing ──────────────────────────────────────────────────
 * Springs (direct manipulation, sheets, cards, device selection) re-target
 * the moment state changes — motion/react interrupts and continues from
 * the current value, which is what keeps every animation interruptible.
 * Standard easing (--ease-out family) for opacity and informational fades.
 *//** Duration ladder in ms — the numbers CSS mirrors as --st-dur-*.
 *  NOTE: motion/react's `transition={{ duration }}` takes SECONDS — write
 *  `DUR.short / 1000` there. Passing a raw DUR value runs the animation for
 *  that many SECONDS (a 180ms backdrop fade becoming a 3-minute one that
 *  never visibly appears and never unmounts from AnimatePresence). */
export const DUR = {
  instant: 60,
  press: 120,
  hover: 150,
  state: 200,
  sheet: 400,
  hero: 600,
  micro: 120,
  short: 200,
  medium: 280,
  long: 480,
} as const;

/** Overlap spacing, not an action delay. CSS mirrors --st-stagger-step. */
export const STAGGER_STEP = 20;

/** Easing curves — mirror of index.css --ease-* tokens. */
export const EASE = {
  /** Default for entrances and ordinary transitions (index.css --ease-out). */
  out: [0.23, 1, 0.32, 1] as [number, number, number, number],
  /** Symmetric moves, longer sequences (index.css --ease-in-out). */
  inOut: [0.77, 0, 0.175, 1] as [number, number, number, number],
  /**
    * The drawer curve — vaul / iOS sheet settle: starts fast while it carries
    * the release speed, then eases out into place. Published value, not an
    * invented bounce: cubic-bezier(0.32, 0.72, 0, 1) (index.css --ease-drawer).
    */
  drawer: [0.32, 0.72, 0, 1] as [number, number, number, number],
} as const;

/**
 * iOS-like edge resistance: increasing pull gives diminishing travel.
 * Approximation documented at preetsuthar.me/writing/the-maths-of-ios-scrolling.
 * Unlike multiplying by a constant, it can never escape the view's extent. */
export function rubberBand(distance: number, dimension: number): number {
  if (dimension <= 0) return 0;
  return Math.sign(distance) * dimension * (1 - 1 / (Math.abs(distance) * 0.55 / dimension + 1));
}

/**
 * Named spring presets — physical, interruptible, bounded (no overshoot
 * circus). motion/react retargets these on state change, so a sheet that
 * is dismissed mid-open leaves instantly instead of finishing first.
 */
export const SPRING = {
  /** Sheets and structural surfaces: the existing OverlaySheet feel. */
  sheet: { stiffness: 400, damping: 31 },
  /** Command palette / popovers: duration-bounded spring, no drift. */
  panel: { type: 'spring', bounce: 0.12, duration: 0.38 } as const,
  /** Small direct-manipulation feedback (toggles, chips, thumbnails). */
  snap: { stiffness: 500, damping: 40 },
} as const;

/** Fades use the standard curve with the short ladder — never a spring. */
export const fade = (duration: number = DUR.short) => ({ duration: duration / 1000, ease: EASE.out });
