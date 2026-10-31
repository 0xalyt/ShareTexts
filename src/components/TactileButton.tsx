import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { cn } from '../lib/utils';

/**
 * TactileButton — the app's one button (§6, §18).
 *
 * Rebuilt on the grammar instead of a private one: a flat brand-orange fill
 * with a 3px darker edge (primary), a hairline surface (secondary), or a
 * word with no box (tertiary). No gradient, no sheen, no glow — those were
 * the "tactile" costume, and they made one control look like a different
 * product from the rest of the app.
 *
 * The press is the shape: primary moves down 2px and its edge shrinks 3→1px
 * in 60 ms; everything else scales .975. Both are CSS (styles/apple-dna.css),
 * so pressing never queues work on the main thread.
 *
 * In-place state changes keep the width the label had, so Send → Sending →
 * Sent never makes the layout twitch, and the spinner only appears if the
 * work outlives 300 ms (Doherty).
 */

type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface TactileButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  /** Truthful in-flight state: spinner replaces the icon, button is busy. */
  loading?: boolean;
  /** Brief confirmation state: check replaces the icon. */
  success?: boolean;
  /** Renders an <a> instead of a <button> — same anatomy, navigates. */
  href?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
  type?: 'button' | 'submit' | 'reset';
}

/** The four contract roles, keyed by the names call sites already use. */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'st-btn--primary',
  // `soft` was a second orange fill with a gradient. It is the primary now;
  // the name survives so ~20 call sites keep working.
  soft: 'st-btn--primary',
  secondary: 'st-btn--secondary',
  // `ghost` was a hover-washed rectangle. Tertiary is a word, not a box.
  ghost: 'st-btn--tertiary',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'st-btn--sm',
  md: 'st-btn--md',
  lg: 'st-btn--lg',
};

export function TactileButton({
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'left',
  loading = false,
  success = false,
  href,
  children,
  className,
  disabled,
  ...props
}: TactileButtonProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [lockedWidth, setLockedWidth] = useState<number | null>(null);
  // A spinner that appears for 80 ms is a flicker, not feedback.
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!loading) { setShowSpinner(false); return; }
    const t = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(t);
  }, [loading]);

  // Freeze the box while the label changes, so a state swap is not a jump.
  useEffect(() => {
    if (!loading && !success) { setLockedWidth(null); return; }
    const el = ref.current;
    if (el && lockedWidth === null) setLockedWidth(el.getBoundingClientRect().width);
  }, [loading, success, lockedWidth]);

  const inactive = disabled || loading;
  const Comp: React.ElementType = href ? 'a' : 'button';
  const busyGlyph = showSpinner;

  return (
    <Comp
      ref={ref as React.Ref<any>}
      {...(href ? { href } : { disabled: inactive, type: props.type ?? 'button' })}
      {...(href ? {} : { onClick: props.onClick })}
      aria-busy={loading || undefined}
      data-testid={props['data-testid']}
      className={cn(
        'st-btn',
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        className,
      )}
      style={lockedWidth !== null ? { minWidth: Math.ceil(lockedWidth) } : undefined}
    >
      {(icon || busyGlyph || success) && iconPosition === 'left' && (
        <span className="flex shrink-0 items-center justify-center leading-none">
          {busyGlyph ? (
            <SpinLoader size={Math.round(1.05 * 16)} className={variant === 'secondary' ? 'text-ember dark:text-azure-400' : 'text-white'} aria-hidden />
          ) : success ? (
            <Check className="h-[1.05em] w-[1.05em]" strokeWidth={2.5} aria-hidden />
          ) : (
            icon
          )}
        </span>
      )}
      <span className="flex items-center leading-none">{children}</span>
      {(icon || busyGlyph || success) && iconPosition === 'right' && (
        <span className="flex shrink-0 items-center justify-center leading-none">
          {busyGlyph ? (
            <SpinLoader size={Math.round(1.05 * 16)} className={variant === 'secondary' ? 'text-ember dark:text-azure-400' : 'text-white'} aria-hidden />
          ) : success ? (
            <Check className="h-[1.05em] w-[1.05em]" strokeWidth={2.5} aria-hidden />
          ) : (
            icon
          )}
        </span>
      )}
    </Comp>
  );
}
