"use client";

// ---------------------------------------------------------------------------
// OtpInput — the join-code capsule, on Metalforge "code" duty.
// ---------------------------------------------------------------------------
// Base: port of rareui.com/components/otpinput (the real `OtpInput` source,
// MIT + Commons Clause with attribution — credited in README). The INTERACTION
// layer is still Rare UI's, shipped faithfully: per-slot hidden inputs behind
// rolling digits, paste/SMS-autofill fill-forward, the contiguity guard
// (clicking past the first gap lands ON the gap), Backspace-then-step-back,
// and the error shake.
//
// The PRESENTATION is the Metalforge "code" interaction (the reference:
// "one key splits into cells, digits roll in; a wrong code shakes and
// clears, a right one turns green"):
//   · on mount the control EXPANDS from a compact pill into six adjoining
//     rounded cells inside one capsule — the "key splits into cells" beat;
//   · the active cell wears a clear dark outline with a blinking caret;
//   · digits roll in vertically as they are typed;
//   · status='error' shakes the row, tints the cells, and clears+refocuses
//     (the clear lives here so the wipe and the caret reset land together);
//   · status='success' turns every cell green.
//
// Adaptations: the join code is digits-only (numbers pattern), numeric
// labels come from the app's i18n, and the capsule scales up on md+ to match
// the room's pairing tile (52px cells on phones, 56px on small desktops).
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState, type ComponentProps } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

const PATTERNS = {
  numbers: /^[0-9]$/,
  letters: /^[a-zA-Z]$/,
  both: /^[a-zA-Z0-9]$/,
} as const;

const SIZES = {
  sm: {
    box: 'h-10 rounded-[10px]',
    text: 'text-base',
    caret: 'h-5',
    gap: 'gap-1',
    pad: 'p-1',
    width: 150,
  },
  md: {
    box: 'h-[52px] rounded-[14px] sm:h-14',
    text: 'text-2xl sm:text-3xl',
    caret: 'h-7 sm:h-9',
    gap: 'gap-1.5 sm:gap-2',
    pad: 'p-1.5 sm:p-2',
    width: 196,
  },
  lg: {
    box: 'h-14 rounded-[16px]',
    text: 'text-xl',
    caret: 'h-7',
    gap: 'gap-1.5',
    pad: 'p-1.5',
    width: 220,
  },
} as const;

// Three cell surfaces, mirroring the reference: filled cells read parchment,
// the active cell goes white behind a dark inset outline, and status paints
// the whole row (green = accepted, danger-soft = rejected). Dark-mode alphas
// stay inside the frozen vocabulary (0.04/0.08/0.12 — verify-visual-system §7).
const cellState = (
  filled: boolean,
  active: boolean,
  status: 'idle' | 'success' | 'error',
) => {
  if (status === 'success') return 'bg-status-success';
  if (status === 'error') return 'bg-status-danger-soft dark:bg-status-danger/[0.08]';
  if (active)
    return 'bg-white dark:bg-white/[0.12] shadow-[inset_0_0_0_2px_var(--color-apple-ink)] dark:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.85)]';
  return filled
    ? 'bg-apple-parchment dark:bg-white/[0.08]'
    : 'bg-apple-parchment/60 dark:bg-white/[0.04]';
};

const ROLL_SPRING = { type: 'spring', stiffness: 500, damping: 34 } as const;
const BLINK = {
  duration: 1.1,
  times: [0, 0.5, 0.5, 1],
  repeat: Infinity,
  ease: 'linear' as const,
};

const ROLL = {
  initial: { y: '110%' },
  exit: (cleared: boolean) => ({ y: cleared ? '110%' : '-110%' }),
};

const SHAKE = [0, -8, 8, -8, 8, 0];

const toSlots = (code: string, length: number) =>
  Array.from({ length }, (_, i) => code[i] ?? '');

export type OtpStatus = 'idle' | 'success' | 'error';

export type OtpInputProps = Omit<
  ComponentProps<'div'>,
  'onChange' | 'value' | 'defaultValue'
> & {
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  type?: keyof typeof PATTERNS;
  size?: keyof typeof SIZES;
  status?: OtpStatus;
  mask?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  slotClassName?: string;
  /** Accessibility label for each slot (localized, e.g. "Digit 1 of 6"). */
  slotLabel?: (index: number, length: number) => string;
};

export function OtpInput({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  type = 'numbers',
  size = 'md',
  status = 'idle',
  mask = false,
  disabled,
  autoFocus,
  className,
  slotClassName,
  slotLabel,
  ...props
}: OtpInputProps) {
  const [uncontrolled, setUncontrolled] = useState(() =>
    toSlots(defaultValue, length),
  );
  const [cleared, setCleared] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // the slot the user deliberately moved to, so a full code only changes on purpose
  const editingAt = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  // padded, not joined: joining would close a gap left by a mid-code backspace
  const slots =
    value === undefined
      ? Array.from({ length }, (_, i) => uncontrolled[i] ?? '')
      : toSlots(value, length);
  const numeric = type === 'numbers';
  const scale = SIZES[size];

  const commit = (next: string[]) => {
    if (value === undefined) setUncontrolled(next);
    const code = next.join('');
    onChange?.(code);
    if (next.every(Boolean)) onComplete?.(code);
  };

  const setCharAt = (index: number, char: string) => {
    setCleared(!char);
    commit(slots.map((slot, i) => (i === index ? char : slot)));
  };

  const focusAt = (index: number) => {
    const input = inputs.current[Math.min(Math.max(index, 0), length - 1)];
    input?.focus();
    input?.select();
  };

  const fill = (index: number, chars: string[]) => {
    const room = Math.min(chars.length, length - index);
    const next = [...slots];
    chars.slice(0, room).forEach((char, i) => {
      next[index + i] = char;
    });
    setCleared(false);
    commit(next);
    editingAt.current = null;
    focusAt(index + room);
  };

  // REJECTION BEAT: the row was just told the code was refused. Wipe every
  // slot and put the caret back on the first cell in the SAME commit —
  // shake, clear, refocus, ready for the retry: one deterministic gesture.
  const prevStatus = useRef<OtpStatus>(status);
  useEffect(() => {
    if (status === 'error' && prevStatus.current !== 'error') {
      if (slots.some(Boolean)) {
        setCleared(true);
        commit(Array.from({ length }, () => ''));
      }
      focusAt(0);
    }
    prevStatus.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleChange = (index: number, raw: string) => {
    const chars = raw.split('').filter((char) => PATTERNS[type].test(char));
    if (!chars.length) return;

    // typing into a filled slot appends, so keep only the new character
    const typed =
      chars.length === 1
        ? chars[0]
        : chars.length === 2 && chars[0] === slots[index]
          ? chars[1]
          : null;

    if (typed === null) {
      // anything longer arrived at once: a paste or an SMS autofill
      fill(index, chars);
      return;
    }

    if (slots.every(Boolean) && editingAt.current !== index) return;

    setCharAt(index, typed);
    editingAt.current = null;
    focusAt(index + 1);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => {
        editingAt.current = Math.max(index - 1, 0);
        focusAt(index - 1);
      },
      ArrowRight: () => {
        editingAt.current = Math.min(index + 1, length - 1);
        focusAt(index + 1);
      },
      Backspace: () => {
        if (slots[index]) {
          setCharAt(index, '');
        } else if (index > 0) {
          setCharAt(index - 1, '');
          focusAt(index - 1);
        }
      },
    };

    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const handlePaste = (
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData('text')
      .split('')
      .filter((char) => PATTERNS[type].test(char));
    if (pasted.length) fill(index, pasted);
  };

  // clicking past the first gap lands on the gap, so a code stays contiguous
  const handlePointerDown = (
    index: number,
    event: React.PointerEvent<HTMLInputElement>,
  ) => {
    const firstEmpty = slots.findIndex((slot) => !slot);
    const target = firstEmpty === -1 ? index : Math.min(index, firstEmpty);
    editingAt.current = target;
    if (target === index) return;
    event.preventDefault();
    focusAt(target);
  };

  // The active cell — the one wearing the dark outline — is the first empty
  // slot, or the last slot while a full code is being edited in place.
  const activeIndex = slots.findIndex((slot) => !slot);

  return (
    <div
      data-slot="otp-input"
      data-status={status}
      data-testid="join-code-input"
      className={cn('relative w-full flex justify-center', className)}
      {...props}
    >
      <motion.div
        /* EXPANSION BEAT: the control enters as a compact pill and widens
           into the six-cell capsule — the reference's "one key splits into
           cells". Width animates px → 100% (motion measures the element);
           reduced motion skips straight to the open capsule. */
        initial={reduceMotion ? false : { width: scale.width, opacity: 0 }}
        animate={{ width: '100%', opacity: 1 }}
        transition={{
          opacity: { duration: 0.18 },
          width: reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 420, damping: 34 },
        }}
        data-slot="otp-input-row"
        className={cn(
          'relative flex w-full items-center rounded-full',
          scale.gap,
          scale.pad,
          'bg-white dark:bg-surface-dark border border-apple-divider/60 dark:border-white/10 shadow-card',
        )}
        onFocus={(event) => {
          // React's autoFocus fires focus() during commit — BEFORE the ref
          // array is populated (refs attach after the commit's focus call),
          // so inputs.current.indexOf() returns -1 there and the caret would
          // never light up until the first manual focus move. The slot index
          // travels on the input itself, so the mount focus recovers it.
          const target = event.target as HTMLInputElement;
          const byRef = inputs.current.indexOf(target);
          const byAttr = Number((target as HTMLInputElement).dataset.slotIndex);
          setFocused(Number.isInteger(byAttr) ? byAttr : byRef);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setFocused(null);
          }
        }}
      >
        {/* SHAKE LANE: the whole capsule answers a rejected code. */}
        <motion.div
          animate={{ x: status === 'error' && !reduceMotion ? SHAKE : 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          data-slot="otp-input-shake"
          className={cn('relative flex w-full items-center', scale.gap)}
        >
          {slots.map((slot, index) => (
            <div
              key={index}
              data-slot="otp-input-cell"
              data-filled={Boolean(slot)}
              className="relative min-w-0 flex-1"
            >
              <input
                ref={(el) => {
                  inputs.current[index] = el;
                }}
                data-slot="otp-input-slot"
                data-slot-index={index}
                data-filled={Boolean(slot)}
                value={slot}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
                onPointerDown={(event) => handlePointerDown(index, event)}
                onFocus={(event) => event.target.select()}
                type={mask ? 'password' : 'text'}
                inputMode={numeric ? 'numeric' : 'text'}
                autoCapitalize={numeric ? undefined : 'characters'}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                autoFocus={autoFocus && index === 0}
                disabled={disabled}
                aria-label={
                  slotLabel
                    ? slotLabel(index, length)
                    : `${numeric ? 'Digit' : 'Character'} ${index + 1} of ${length}`
                }
                className={cn(
                  'w-full text-center font-semibold tabular-nums caret-transparent outline-none',
                  'text-apple-ink dark:text-white',
                  scale.box,
                  scale.text,
                  cellState(
                    Boolean(slot),
                    status === 'idle' && (focused === index || (focused === null && index === activeIndex)),
                    status,
                  ),
                  slotClassName,
                )}
              />

              <span className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
                <AnimatePresence initial={false} custom={cleared}>
                  {slot && (
                    <motion.span
                      key={`${index}-${slot}`}
                      custom={cleared}
                      variants={ROLL}
                      initial={reduceMotion ? false : 'initial'}
                      animate={{ y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : 'exit'}
                      transition={reduceMotion ? { duration: 0 } : ROLL_SPRING}
                      data-slot="otp-input-char"
                      className={cn(
                        'font-bold tracking-tight leading-none select-none',
                        status === 'success'
                          ? 'text-white'
                          : 'text-apple-ink dark:text-white',
                        scale.text,
                      )}
                    >
                      {mask ? '•' : slot}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* PER-CELL CARET: a blinking bar in the active empty cell —
                    the reference's caret. The dark outline already says which
                    cell is live, so no bar slides between slots. */}
                {status === 'idle' &&
                  !slot &&
                  !disabled &&
                  focused === index && (
                    <motion.span
                      aria-hidden
                      data-slot="otp-input-caret"
                      animate={{ opacity: [1, 1, 0, 0] }}
                      transition={BLINK}
                      className={cn(
                        'absolute w-[2px] rounded-full bg-apple-ink dark:bg-white',
                        scale.caret,
                      )}
                    />
                  )}
              </span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

export default OtpInput;
