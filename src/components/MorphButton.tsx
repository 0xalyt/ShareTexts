import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionPreference } from '../lib/useMotionPreference';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

/** Stable-size action feedback. Labels crossfade in the same box; loading
 * and success never animate width, radius, or surrounding layout. The API
 * remains compatible with controlled and promise-driven actions. */

export type MorphState = 'idle' | 'loading' | 'done';

const CONTENT_FADE = { duration: 0.2 };

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const generation = useRef(0);

  const [ownPhase, setOwnPhase] = useState<MorphState>('idle');
  const phase = state ?? ownPhase;
  const collapsed = phase === 'loading';

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
  const contentTransition = reduce ? { duration: 0 } : CONTENT_FADE;

  return (
    <button
      ref={ref}
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
      <span aria-hidden className="morph-btn__surface" />
      {/* Both translations contribute their natural width; a longer Copied
          label cannot move the control or escape its fixed feedback box. */}
      <span className="morph-btn__sizer" aria-hidden>
        <span>{icon}{widthLabel ?? label}</span>
        <span>{doneIcon ?? <Check className="morph-btn__glyph" aria-hidden />}{doneLabel ?? label}</span>
      </span>

      <AnimatePresence initial={false}>
        <motion.span
          key={phase}
          className="morph-btn__layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
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

      {/* Busy information remains available without relying on motion. */}
      {collapsed && loadingLabel && (
        <span className="sr-only" role="status">{loadingLabel}</span>
      )}
    </button>
  );
}

export default MorphButton;
