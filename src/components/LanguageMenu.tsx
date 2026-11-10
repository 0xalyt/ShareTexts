import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { Sheet } from './ui/Sheet';

/**
 * Language switcher.
 *
 * Two presentations, because the control lives in two different places:
 *
 *   · STANDALONE (the header globe) is a dropdown. There is a whole page
 *     under it, so a short list can hang off the button.
 *   · INLINE (a row inside the More sheet) opens a SHEET, not a dropdown.
 *     It used to open the same dropdown downward from the last row of the
 *     sheet — 404px of list starting at y=828 in an 844px viewport, i.e.
 *     entirely off screen, while the sheet grew a scrollable tail under a
 *     menu nobody could see. A row that lives in a sheet opens a sheet.
 *
 * Everything else is shared: one list, one row rhythm, the check on the
 * active language, arrows + Enter, Escape closes and returns the focus to
 * the trigger.
 */
const ROW = 'w-full flex items-center justify-between gap-2 px-3 rounded-[12px] text-[13px] transition-colors';

export function LanguageMenu({
  className,
  align = 'right',
  inline = false,
}: {
  className?: string;
  align?: 'left' | 'right';
  inline?: boolean;
}) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Keyboard highlight index (-1 = none). Active while navigating.
  const [kbIdx, setKbIdx] = useState(-1);

  const close = () => {
    setOpen(false);
    setSheetOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A dropdown anchored to a button near the bottom of a short viewport is
  // still a dropdown that opens off screen; the sheet used by the inline
  // variant is immune, and the standalone one is clamped to the space under
  // the button instead of a fixed 60vh.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (inline) {
          setSheetOpen(true);
        } else {
          setOpen(true);
          setKbIdx(LANGS.findIndex((l) => l.code === lang));
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setKbIdx((i) => (i + 1) % LANGS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKbIdx((i) => (i - 1 + LANGS.length) % LANGS.length);
    } else if (e.key === 'Enter' && kbIdx >= 0) {
      e.preventDefault();
      setLang(LANGS[kbIdx].code);
      close();
      setKbIdx(-1);
      btnRef.current?.focus();
    }
  };

  const choose = (code: (typeof LANGS)[number]['code']) => {
    setLang(code);
    close();
    setKbIdx(-1);
    btnRef.current?.focus();
  };

  const options = (variant: 'dropdown' | 'sheet') => (
    <>
      {LANGS.map((l, i) => {
        const active = l.code === lang;
        const hovered = kbIdx === i;
        return (
          <li key={l.code} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => choose(l.code)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setKbIdx((idx) => (idx + 1) % LANGS.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setKbIdx((idx) => (idx - 1 + LANGS.length) % LANGS.length);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  choose(l.code);
                }
              }}
              onMouseEnter={() => setKbIdx(i)}
              lang={l.code}
              className={cn(
                ROW,
                variant === 'sheet'
                  ? 'min-h-[52px] px-1 border-b border-apple-divider/70 last:border-0 dark:border-white/[0.08] rounded-none'
                  : 'py-2',
                active
                  ? 'bg-ember/[0.08] dark:bg-ember/[0.13] text-apple-ink dark:text-white font-semibold'
                  : hovered
                    ? 'bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink dark:text-white'
                    : 'text-apple-ink dark:text-white/85',
              )}
            >
              <span className="truncate">{l.native}</span>
              {l.status !== 'reviewed' && (
                <span
                  data-testid={`language-${l.code}-badge`}
                  className="ms-auto shrink-0 rounded-full bg-apple-divider/70 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wide text-apple-ink-muted dark:bg-white/[0.10] dark:text-white/60"
                >
                  Beta
                </span>
              )}
              {active && <Check className="w-3.5 h-3.5 shrink-0 text-ember dark:text-ember" />}
            </button>
          </li>
        );
      })}
    </>
  );

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (inline) {
            setSheetOpen(true);
          } else {
            setOpen((o) => !o);
          }
          setKbIdx(-1);
        }}
        onKeyDown={onKeyDown}
        aria-haspopup={inline ? 'dialog' : 'listbox'}
        aria-expanded={inline ? sheetOpen : open}
        aria-label={t('lang.menu')}
        title={t('lang.menu')}
        className={
          inline
            ? 'press flex min-h-[44px] items-center gap-1.5 pr-2 pl-1 -mr-1 rounded-[12px] text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/70 dark:hover:text-white transition-colors'
            : 'press flex items-center justify-center w-11 h-11 rounded-full text-apple-ink/70 hover:text-apple-ink dark:text-white/70 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors'
        }
      >
        {/* Two triggers, one control. Inline (the More sheet's row) shows the
            current language by name plus a chevron, so the row reads as a
            value, not as a second icon. Standalone is the 44px globe for the
            header capsule. The globe is hand-drawn at the header's
            18px/stroke-1.5 ladder: lucide's `Languages` glyph stacks a CJK
            character under a Latin one, which collapses into a blob at 18px
            and looked like a rendering bug. */}
        {inline ? (
          <>
            <span className="truncate">{LANGS.find((l) => l.code === lang)?.native ?? 'English'}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="w-3.5 h-3.5 opacity-60"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </>
        ) : (
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="w-[18px] h-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.5 12h17" />
            <path d="M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z" />
          </svg>
        )}
      </button>

      {/* The sheet presentation. Nested above the sheet that raised it (z 95
          vs 80) and it is a real sheet, so it arrives from the bottom edge,
          drags, traps focus and closes the way every other surface does. */}
      {inline && (
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          label={t('settings.language')}
          labelledBy="language-sheet-title"
          z={95}
          maxWidth={400}
          testId="language-sheet"
        >
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between gap-3 pr-9">
              <h2
                id="language-sheet-title"
                className="text-[20px] font-semibold tracking-[-0.01em] text-apple-ink dark:text-white"
              >
                {t('settings.language')}
              </h2>
            </div>
            <ul
              role="listbox"
              aria-label={t('lang.menu')}
              className="mt-1 flex flex-col"
            >
              {options('sheet')}
            </ul>
          </div>
        </Sheet>
      )}

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            role="listbox"
            aria-label={t('lang.menu')}
            className={cn(
              'absolute top-[calc(100%+6px)] z-50 mt-1 w-44 rounded-[14px] bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)] p-1.5 max-h-[min(60vh,calc(100dvh-96px))] overflow-y-auto overscroll-contain',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {options('dropdown')}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
