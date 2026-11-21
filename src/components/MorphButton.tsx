import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionPreference } from '../lib/useMotionPreference';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * MorphButton — the dissolve "Dynamic Island" pill, on the web.
 *
 * The recipe this ports (react-native-dissolve's MorphButton) is three beats:
 *
 *   1. FOLD   the pill contracts into a round loader — width and radius
 *             travel together, the label shrinks away at the same time.
 *   2. HOLD   a spinner sits in the circle while the work is in flight.
 *   3. OPEN   the pill springs back out as the done state (check + label),
 *             holds a beat, and settles back to its resting label.
 *
 * The dissolve build gets its feel from Reanimated springs on the native
 * thread. This app is a Vite + React web app with no Expo runtime, so the
 * same motion is rebuilt from what is already here: `motion/react` (a real
 * dependency of this project) drives width, radius and content with true
 * springs, and CSS paints every layer. No RN, Skia, NativeWind or Expo
 * package is installed — none of them can run in this bundle.
 *
 * Springs are CRITICALLY DAMPED by construction: damping = 2·√(stiffness ·
 * mass), the value at which an oscillator returns without overshooting. The
 * shape settles once, crisply — it never bounces past its own edge.
 *
 * Geometry: the button box never resizes, so nothing around it reflows. Only
 * the painted surface (`.morph-btn__surface`) contracts; the label keeps
 * defining the resting width through an invisible sizer, which is what keeps
 * the shape honest at any font size, language or zoom level.
 *
 * Two ways to drive it:
 *   · uncontrolled — `onPress` returns a promise; the button owns idle →
 *     loading → done → idle (the dissolve API).
 *   · controlled   — pass `state`; the caller owns the phase (the connect
 *     card's busy flag). `onPress` still fires on tap.
 */

export type MorphState = 'idle' | 'loading' | 'done';

/** 2·√(420·1) ≈ 41.0 — the no-overshoot point for this stiffness. */
const SHAPE_SPRING = { type: 'spring', stiffness: 420, damping: 41, mass: 1 } as const;
/** Same rule at a quicker stiffness: 2·√(520·1) ≈ 45.6. */
const CONTENT_SPRING = { type: 'spring', stiffness: 520, damping: 45.6, mass: 1 } as const;

/** How long the done state holds before the pill settles back. */
const HOLD_DONE_MS = 1500;

export interface MorphButtonProps {
  /** The resting label. */
  label: string;
  /** The done label. Omit for a check-only done state. */
  doneLabel?: string;
  /**
   * Announced while loading (and shown to nobody else — the circle is the
   * visible progress). Without it the accessible name stays the resting one.
   */
  loadingLabel?: string;
  /** Leading glyph in the resting state. */
  icon?: React.ReactNode;
  /** Leading glyph in the done state. Defaults to a check. */
  doneIcon?: React.ReactNode;
  /** Controlled phase. When absent the button runs its own state machine. */
  state?: MorphState;
  /** Tap handler. Return a promise in uncontrolled mode to drive the morph. */
  onPress?: () => void | Promise<void>;
  /** Fixed resting width, when the visible label changes in place. */
  widthLabel?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  /** Resting corner radius in px. The loading state always rounds to a circle. */
  radius?: number;
  /** How long the done state holds. */
  holdDoneMs?: number;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

export function MorphButton({
  label,
  doneLabel,
  loadingLabel,
  icon,
  doneIcon,
  state,
  onPress,
  widthLabel,
  disabled = false,
  type = 'button',
  radius = 999,
  holdDoneMs = HOLD_DONE_MS,
  className,
  'data-testid': testId,
  'aria-label': ariaLabel,
  ref,
}: MorphButtonProps) {
  const reduce = useMotionPreference();
  const innerRef = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const generation = useRef(0);

  /** Resting box, measured — the surface animates in px from here. */
  const [box, setBox] = useState({ w: 0, h: 52 });
  const [ownPhase, setOwnPhase] = useState<MorphState>('idle');
  const phase = state ?? ownPhase;
  const collapsed = phase === 'loading';

  const attachRef = useCallback((node: HTMLButtonElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  }, [ref]);

  // Measure once mounted (before first paint) and again whenever the resting
  // width changes — a language switch, a zoom change, a resized pane.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    running.current = false;
    setOwnPhase('idle');
  }, []);

  const handleClick = useCallback(async () => {
    if (disabled || collapsed || running.current) return;
    // Controlled: the caller owns the phase; the tap is just the tap.
    if (state !== undefined) {
      void onPress?.();
      return;
    }
    if (!onPress) return;

    if (timer.current) clearTimeout(timer.current);
    running.current = true;
    const request = ++generation.current;
    setOwnPhase('loading');
    try {
      await onPress();
    } catch {
      if (request !== generation.current) return;
      // A failed action must give the button back, not strand it in a circle.
      running.current = false;
      setOwnPhase('idle');
      return;
    }
    if (request !== generation.current) return;
    // Feedback follows the operation, never a minimum animation runtime.
    // The success hold is visual only: another action can interrupt it.
    running.current = false;
    setOwnPhase('done');
    timer.current = setTimeout(settle, holdDoneMs);
  }, [collapsed, disabled, holdDoneMs, onPress, settle, state]);

  const currentLabel =
    phase === 'loading' ? loadingLabel ?? label : phase === 'done' ? doneLabel ?? label : label;
  const contentTransition = reduce ? { duration: 0 } : CONTENT_SPRING;
  const shapeTransition = reduce ? { duration: 0 } : SHAPE_SPRING;

  return (
    <button
      ref={attachRef}
      type={type}
      disabled={disabled}
      onClick={handleClick}
      aria-label={ariaLabel ?? currentLabel}
      aria-busy={collapsed || undefined}
      data-testid={testId}
      data-morph-state={phase}
      /* The focus ring follows the resting shape, not the stylesheet default. */
      style={{ borderRadius: radius }}
      className={cn('morph-btn', className)}
    >
      {/* The painted shape. Width and radius travel together, so the pill
          folds into a circle instead of merely shrinking its contents. */}
      <motion.span
        aria-hidden
        className="morph-btn__surface"
        initial={false}
        animate={{
          width: collapsed ? box.h : box.w,
          borderRadius: collapsed ? box.h / 2 : radius,
        }}
        transition={shapeTransition}
      />

      {/* Invisible, but it is what gives the button its width — the layers
          above are out of flow, so text, icons and translations all size the
          resting pill exactly as they would have in normal flow. */}
      <span className="morph-btn__sizer" aria-hidden>
        {icon}
        {widthLabel ?? label}
      </span>

      <AnimatePresence initial={false}>
        <motion.span
          key={phase}
          className="morph-btn__layer"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={contentTransition}
        >
          {phase === 'loading' ? (
            <span className="morph-btn__spinner" aria-hidden />
          ) : phase === 'done' ? (
            <>
              {doneIcon ?? <Check className="morph-btn__glyph" strokeWidth={3} aria-hidden />}
              {doneLabel && <span>{doneLabel}</span>}
            </>
          ) : (
            <>
              {icon}
              <span>{label}</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>

      {/* The circle has no room for words; the same sentence still reaches
          assistive tech while the work is in flight. */}
      {collapsed && loadingLabel && (
        <span className="sr-only" role="status">{loadingLabel}</span>
      )}
    </button>
  );
}

export default MorphButton;
