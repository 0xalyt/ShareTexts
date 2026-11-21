import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Image as ImageIcon, File as FileIcon, Video as VideoIcon, Music, Type as TypeIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { useMotionPreference } from '../lib/useMotionPreference';
import { DUR, EASE, SPRING } from '../lib/motion/tokens';

// Escape closes the menu; re-focuses the + button so keyboard users stay put.
function useEscapeToClose(isOpen: boolean, onClose: () => void, triggerRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, triggerRef]);
}

type PanelMode = 'closed' | 'menu';

export function AttachmentTrigger({ isOpen, onToggle, buttonRef }: {
  isOpen: boolean;
  onToggle: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  return (
    <button
      ref={buttonRef} type="button" data-testid="add-attachment"
      // Keep pointerdown: waiting for a synthetic click reintroduces the
      // mobile open/close race. Native keyboard/AT activation has detail 0.
      onPointerDown={e => { e.preventDefault(); onToggle(); }}
      onClick={e => { if (e.detail === 0) onToggle(); }}
      onKeyDown={e => { if (e.key === 'ArrowDown' && !isOpen) { e.preventDefault(); onToggle(); } }}
      onContextMenu={e => e.preventDefault()}
      aria-label={t('attach.add')} aria-haspopup="menu" aria-expanded={isOpen}
      className="min-w-[44px] min-h-[44px] w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 bg-white dark:bg-apple-tile-2 border border-apple-divider/70 dark:border-white/[0.08] shadow-sm text-apple-ink dark:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-3 transition-colors active:scale-[0.96] select-none [touch-action:manipulation] [-webkit-touch-callout:none]"
    >
      <Plus className={cn('w-5 h-5 transition-transform', isOpen && 'rotate-45')} style={{ transitionDuration: 'var(--st-dur-short)' }} />
    </button>
  );
}

interface AttachmentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'image' | 'file' | 'video' | 'audio') => void;
  /** Optional: reveal the formatting row. It lives here now, not in the
   *  composer, so the default view stays one quiet field (DESIGN §19). */
  onFormatting?: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The attachment menu — deliberately simple, and RELIABLE.
 *
 * Grows out of the + button and returns to the same origin. The choices
 * arrive as one group, never a delayed queue. Keyboard/reduced motion are
 * immediate; no action waits for a transition.
 * A transparent backdrop catches outside taps so mobile users can dismiss
 * with one touch anywhere.
 *
 * Two hard-won reliability rules (the "tapping + does nothing" mobile bug):
 *
 *  1. The menu mounts IMMEDIATELY with `isOpen` — it is anchored with pure
 *     CSS to the composer row (absolute, above the + button), never with a
 *     getBoundingClientRect measured in a follow-up effect. The old flow
 *     needed a second render to compute the rect; the same tap's synthetic
 *     click closed the panel before that render ever committed, so the menu
 *     never appeared at all.
 *
 *  2. The backdrop's dismiss handler is ARMED only after the opening
 *     gesture has fully ended (settle delay). The pointerdown that opens
 *     the menu is followed by a synthetic click that lands on the freshly
 *     mounted backdrop in several mobile browsers — an un-armed backdrop
 *     swallowed the menu 16ms after it opened.
 */
export function AttachmentPanel({ isOpen, onClose, onSelectType, onFormatting, buttonRef }: AttachmentPanelProps) {
  const { t } = useI18n();
  const reduced = useMotionPreference();
  const quiet = reduced || document.documentElement.dataset.motionIntent === 'keyboard';
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (isOpen && document.documentElement.dataset.motionIntent === 'keyboard') {
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
  }, [isOpen]);
  useEscapeToClose(isOpen, onClose, buttonRef);

  // Dismiss arming: ignore every pointer event until `SETTLE_MS` after the
  // menu opened — that window contains the opening gesture's own synthetic
  // click. After it, one touch anywhere closes the menu.
  const armedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) { armedRef.current = false; return; }
    const SETTLE_MS = 400;
    const t = setTimeout(() => { armedRef.current = true; }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [isOpen]);
  const dismiss = useCallback(() => { if (armedRef.current) onClose(); }, [onClose]);

  const handleSelect = (type: 'image' | 'file' | 'video' | 'audio') => {
    onSelectType(type);
    onClose();
  };

  return (
    <>
      {/* Transparent backdrop — catches outside taps/clicks to close. */}
      <AnimatePresence custom={quiet}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: quiet ? 0 : DUR.micro / 1000 }}
            className="fixed inset-0 z-40"
            onClick={dismiss}
            onPointerDown={dismiss}
          />
        )}
      </AnimatePresence>

      {/* The menu — anchored with CSS to the composer row, so it mounts on
          the very render that flips `isOpen`. The + button (z-[45] while
          open) keeps the row's stacking context above the backdrop. */}
      <AnimatePresence custom={quiet}>
        {isOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={t('attach.add')}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                onClose(); buttonRef.current?.focus({ preventScroll: true });
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
              e.preventDefault();
              const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
                : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus({ preventScroll: true });
            }}
            initial={quiet ? false : { opacity: 0, y: 6, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={(immediate: boolean) => ({
              opacity: 0, y: immediate ? 0 : 6, scale: immediate ? 1 : .96,
              transition: immediate ? { duration: 0 } : {
                type: 'spring', ...SPRING.snap, opacity: { duration: DUR.micro / 1000 },
              },
            })}
            transition={quiet ? { duration: 0 } : {
              type: 'spring', ...SPRING.snap, opacity: { duration: DUR.short / 1000, ease: EASE.out },
            }}
            style={{ transformOrigin: '22px calc(100% + 8px)' }}
            data-testid="attachment-panel"
            className="absolute bottom-[calc(100%+8px)] left-0 z-50 min-w-[210px] p-1.5 bg-white dark:bg-apple-tile-2 border border-black/[0.08] dark:border-white/[0.08] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] rounded-[16px] overflow-hidden"
          >
            <MenuItem
              icon={<ImageIcon className="w-[18px] h-[18px]" />}
              label={t('attach.photos')}
              onClick={() => handleSelect('image')}
            />
            <MenuItem
              icon={<VideoIcon className="w-[18px] h-[18px]" />}
              label={t('attach.video')}
              onClick={() => handleSelect('video')}
            />
            <MenuItem
              icon={<Music className="w-[18px] h-[18px]" />}
              label={t('attach.audio')}
              onClick={() => handleSelect('audio')}
            />
            <MenuItem
              icon={<FileIcon className="w-[18px] h-[18px]" />}
              label={t('attach.files')}
              onClick={() => handleSelect('file')}
            />
            {onFormatting && (
              <MenuItem
                icon={<TypeIcon className="w-[18px] h-[18px]" />}
                label={t('edit.group')}
                onClick={() => { onFormatting(); onClose(); }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-[12px] group/menuitem",
        "hover:bg-black/[0.05] dark:hover:bg-white/[0.06]",
        "transition-colors duration-150 text-left"
      )}
    >
      <span className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center text-apple-ink dark:text-white/85 shrink-0">
        {icon}
      </span>
      <span className="text-[16px] font-semibold text-apple-ink dark:text-white">{label}</span>
    </button>
  );
}
