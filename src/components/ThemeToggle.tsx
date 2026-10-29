import React from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * ThemeToggle — the theme control, as a single morphing glyph.
 *
 * Why an icon and not a switch: a 56×26 switch in a toolbar of 40px glyph
 * buttons reads as a settings row that fell into the header — it was the
 * loudest object on the landing and the only one whose state you had to
 * decode ("is this switch about dark mode, or about something on?"). The
 * owner's call: one icon, like every other control in that row, that
 * MORPHS between the two states it controls.
 *
 * The morph: the sun's disc shrinks into the moon's crescent while the
 * whole glyph rotates a quarter turn. Both layers are always in the DOM
 * (opacity + rotate + scale), so the change is a cross-dissolve of two
 * shapes rather than two icons swapping — no pop, no layout shift.
 *
 * Contract:
 *   SLOT   40×40 (the header's uniform control slot)
 *   GLYPH  18×18, strokeWidth 1.5 (the header icon ladder)
 *   A11y   role="switch" + aria-checked, Enter/Space, visible focus ring
 */
const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={t('settings.darkLight')}
      title={t('settings.darkLight')}
      data-testid="theme-toggle"
      onClick={toggle}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 shrink-0 rounded-full',
        'text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white',
        'hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-[0.94]',
        'transition-[color,background-color,transform] duration-150 ease-out motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-ink/25 dark:focus-visible:ring-white/40',
        className,
      )}
    >
      <span
        aria-hidden
        className="relative flex items-center justify-center w-[18px] h-[18px]"
      >
        {/* SUN — disc + eight rays. Leaves by scaling down and rotating out. */}
        <motion.svg
          viewBox="0 0 24 24"
          className="absolute inset-0 w-[18px] h-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={false}
          animate={{
            opacity: isDark ? 0 : 1,
            rotate: isDark ? -90 : 0,
            scale: isDark ? 0.55 : 1,
          }}
          transition={SPRING}
        >
          <circle cx="12" cy="12" r="4.1" />
          <path d="M12 2.4v2" />
          <path d="M12 19.6v2" />
          <path d="M2.4 12h2" />
          <path d="M19.6 12h2" />
          <path d="M5.2 5.2 6.6 6.6" />
          <path d="M17.4 17.4 18.8 18.8" />
          <path d="M18.8 5.2 17.4 6.6" />
          <path d="M6.6 17.4 5.2 18.8" />
        </motion.svg>
        {/* MOON — arrives by growing out of the sun's own rotation. */}
        <motion.svg
          viewBox="0 0 24 24"
          className="absolute inset-0 w-[18px] h-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{
            opacity: isDark ? 1 : 0,
            rotate: isDark ? 0 : 90,
            scale: isDark ? 1 : 0.55,
          }}
          transition={SPRING}
        >
          <path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6Z" />
        </motion.svg>
      </span>
      {/* The state in words for assistive tech (aria-checked alone leaves
          "what does on mean?" open on a theme control). */}
      <span className="sr-only">{isDark ? t('settings.dark') : t('settings.light')}</span>
    </button>
  );
}
