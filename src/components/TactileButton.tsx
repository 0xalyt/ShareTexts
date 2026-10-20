import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Check } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// TactileButton — the shared ShareTexts action surface.
// ---------------------------------------------------------------------------
// The shared control keeps a quiet raised surface and a short press response.
// Brand colors, loading/success states, shape, and touch sizes stay intact;
// cursor-following shine and heavy bevels are intentionally absent.
// ---------------------------------------------------------------------------

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

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[13px] gap-2 rounded-full min-h-[var(--st-control-sm)]',
  md: 'px-5 py-2.5 text-[16px] gap-2.5 rounded-full min-h-[var(--st-control-md)]',
  lg: 'px-7 py-3.5 text-[16px] gap-3 rounded-full min-h-[var(--st-control-lg)]',
};

// One quiet elevation step per variant. Color and surface remain the existing
// ShareTexts tokens; hover adds a little lift and press settles the label.
const VARIANT_STYLES: Record<ButtonVariant, { base: string; shadowIdle: string; shadowHover: string; shadowPress: string; gradient: string }> = {
  primary: {
    base: 'text-white',
    shadowIdle: '0 1px 2px rgba(68,36,19,0.12), 0 4px 10px rgba(240,100,19,0.10)',
    shadowHover: '0 2px 5px rgba(68,36,19,0.12), 0 8px 18px rgba(240,100,19,0.14)',
    shadowPress: 'inset 0 1px 2px rgba(96,34,2,0.22)',
    gradient: 'var(--st-btn-primary-grad)',
  },
  soft: {
    base: 'text-white',
    shadowIdle: '0 1px 2px rgba(68,36,19,0.10), 0 4px 10px rgba(240,100,19,0.09)',
    shadowHover: '0 2px 5px rgba(68,36,19,0.11), 0 8px 18px rgba(240,100,19,0.13)',
    shadowPress: 'inset 0 1px 2px rgba(112,42,3,0.20)',
    gradient: 'var(--st-btn-soft-grad)',
  },
  secondary: {
    base: 'text-apple-ink dark:text-white',
    shadowIdle: '0 1px 2px rgba(31,27,21,0.06)',
    shadowHover: '0 2px 6px rgba(31,27,21,0.09)',
    shadowPress: 'inset 0 1px 2px rgba(31,27,21,0.08)',
    gradient: 'var(--st-btn-secondary-grad)',
  },
  ghost: {
    base: 'bg-transparent text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-1',
    shadowIdle: '0 0 0 rgba(0,0,0,0)',
    shadowHover: '0 1px 4px rgba(0,0,0,0.06)',
    shadowPress: '0 0 0 rgba(0,0,0,0)',
    gradient: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.03) 100%)',
  },
};

const SURFACE_FILLS: Record<ButtonVariant, string> = {
  // Deepened from bg-ember: white labels on bright ember (3.2:1 light /
  // 2.65:1 dark remap) fail WCAG at label sizes; the token clears 4.5:1
  // with white in BOTH themes (bright brand ember stays in icons/links/
  // artwork, where the 3:1 graphic rule applies).
  primary: 'bg-ember',
  soft: 'bg-azure-500',
  secondary: 'bg-white dark:bg-apple-tile-2',
  ghost: '',
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
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const vs = VARIANT_STYLES[variant];
  const inactive = disabled || loading;

  // Keep the control in place. Only its label settles by one pixel on press.
  const contentY = useSpring(0, { stiffness: 500, damping: 26 });

  const shadowY = useSpring(0, { stiffness: 200, damping: 20 });
  const shadowOpacity = useSpring(1, { stiffness: 200, damping: 20 });

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    if (!isPressed) {
      shadowY.set(2);
      shadowOpacity.set(1);
    }
  }, [shadowY, shadowOpacity, isPressed]);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    contentY.set(0);
    shadowY.set(0);
    shadowOpacity.set(1);
    setIsPressed(false);
  }, [contentY, shadowY, shadowOpacity]);

  const handlePointerDown = useCallback(() => {
    if (inactive) return;
    setIsPressed(true);
    contentY.set(1);
    shadowY.set(0);
    shadowOpacity.set(0.92);
  }, [contentY, shadowY, shadowOpacity, inactive]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (isHovered) {
      contentY.set(0);
      shadowY.set(2);
      shadowOpacity.set(1);
    } else {
      contentY.set(0);
      shadowY.set(0);
      shadowOpacity.set(1);
    }
  }, [contentY, shadowY, shadowOpacity, isHovered]);

  // The in-flight spinner tints with its surface for clear contrast.
  const spinnerClass = variant === 'primary' || variant === 'soft' ? 'text-white' : 'text-ember dark:text-azure-400';

  const boxShadow = useTransform(
    [shadowY, shadowOpacity],
    ([sy, so]: number[]) => {
      const base = isPressed ? vs.shadowPress : isHovered ? vs.shadowHover : vs.shadowIdle;
      if (variant === 'ghost') return base;
      const spread = Math.round(sy);
      return base + `, 0 ${spread}px ${spread * 2}px rgba(0,0,0,${0.05 * so})`;
    }
  );

  const surfaceFill = SURFACE_FILLS[variant];
  // Links and buttons share one anatomy so the same action has one surface.
  const Comp: React.ElementType = href ? motion.a : motion.button;

  return (
    <Comp
      ref={ref as React.Ref<any>}
      {...(href ? { href } : { disabled: inactive })}
      aria-busy={loading || undefined}
      className={cn(
        'relative overflow-hidden font-semibold select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
        'transition-[background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
        SIZE_CLASSES[size],
        vs.base,
        surfaceFill,
        inactive && 'opacity-50 cursor-not-allowed',
        !inactive && 'cursor-pointer',
        className,
      )}
      style={{ touchAction: 'manipulation' as const }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {/* Soft elevation changes on hover and compresses on press. */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{ boxShadow, opacity: shadowOpacity }}
      />

      {/* Surface gradient — light from top, dark from bottom */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-[1]"
        style={{ background: vs.gradient }}
      />

      {/* Content settles 1px on press for a clear, restrained response. */}
      <motion.span
        className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap"
        style={{ y: contentY }}
      >
        {(icon || loading || success) && iconPosition === 'left' && (
          <span className="shrink-0 flex items-center justify-center leading-none">
            {loading ? <SpinLoader size={Math.round(1.15 * 16)} className={spinnerClass} aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
        <span className="leading-none flex items-center">{children}</span>
        {(icon || loading || success) && iconPosition === 'right' && (
          <span className="shrink-0">
            {loading ? <SpinLoader size={Math.round(1.15 * 16)} className={spinnerClass} aria-hidden />
              : success ? <Check className="w-[1.15em] h-[1.15em]" strokeWidth={3} aria-hidden />
              : icon}
          </span>
        )}
      </motion.span>
    </Comp>
  );
}
