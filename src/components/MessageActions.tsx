/**
 * MessageActions — the tapback strip above a bubble and the action menu below
 * it (DESIGN §19 "Tapbacks").
 *
 * Three ways in, one surface out: a 500 ms long-press on touch, a right-click
 * on a pointer device, or the keyboard-reachable React button. Selection mode
 * is still here, but it is now a row in the menu instead of the meaning of a
 * long-press — a hold should react, not arm a destructive multi-select.
 *
 * Motion comes from the touch point: the strip scales 0.92 → 1 in 180 ms, the
 * menu follows 40 ms later, and under `prefers-reduced-motion` both simply
 * fade. Nothing moves further than 6 px, so nothing feels thrown.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Copy, Download, Share2, CheckSquare, Trash2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { REACTIONS } from '../lib/emoji';
import { cn } from '../lib/utils';

export interface MessageActionsProps {
  open: boolean;
  onClose: () => void;
  /** Where the press happened, for the enter animation's origin. */
  anchor: { x: number; y: number } | null;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onSelect: () => void;
  onDelete?: () => void;
  /** Which side the bubble sits on: the strip hangs from that edge. */
  align: 'left' | 'right';
  /** Own messages can be deleted from this device; a partner's cannot. */
  canDelete: boolean;
}

const STRIP = REACTIONS.slice(0, 6).map((r) => r.char);

export function MessageActions({
  open,
  onClose,
  anchor,
  onReact,
  onCopy,
  onSave,
  onShare,
  onSelect,
  onDelete,
  align,
  canDelete,
}: MessageActionsProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, and a tap anywhere outside closes. Both are the same
  // promise a sheet makes, and this surface is a sheet in spirit.
  // Keyed on `open` alone: MessageCard passes a fresh onClose every render, so
  // it is read through a ref — otherwise each progress tick would re-run this
  // and pull focus back to the first row.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocus = () => {
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = (): HTMLElement[] => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const focusFrame = requestAnimationFrame(() => items()[0]?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); restoreFocus(); return; }
      // Tab means "I'm done": close and let focus go where Tab takes it.
      if (e.key === 'Tab') { onCloseRef.current(); return; }
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (at + 1) % list.length
        : e.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
        : e.key === 'Home' ? 0
        : e.key === 'End' ? list.length - 1
        : -1;
      if (next < 0 || !list.length) return;
      e.preventDefault();
      list[next].focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  if (!open) return null;

  const origin = anchor ? `${anchor.x}px ${anchor.y}px` : align === 'right' ? '100% 100%' : '0% 100%';
  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 } };

  const rows = [
    { key: 'copy', icon: <Copy className="w-4 h-4" />, label: t('msg.copy'), run: onCopy },
    ...(onSave ? [{ key: 'save', icon: <Download className="w-4 h-4" />, label: t('action.download'), run: onSave }] : []),
    ...(onShare ? [{ key: 'share', icon: <Share2 className="w-4 h-4" />, label: t('msg.share'), run: onShare }] : []),
    { key: 'select', icon: <CheckSquare className="w-4 h-4" />, label: t('msg.select'), run: onSelect },
    ...(canDelete && onDelete
      ? [{ key: 'delete', icon: <Trash2 className="w-4 h-4" />, label: t('msg.deleteLocal'), run: onDelete, destructive: true, hint: t('msg.deleteLocalHint') }]
      : []),
  ];

  // Portalled to <body>: the message row is a motion element with a transform,
  // and a transformed ancestor becomes the containing block for a fixed child —
  // the strip would be positioned relative to the bubble and land off-screen.
  return createPortal(
    <div
      ref={rootRef}
      data-testid="message-actions"
      className={cn(
        'fixed z-50 flex flex-col gap-1.5',
        align === 'right' ? 'items-end' : 'items-start',
      )}
      style={{
        // Anchored to the press, clamped so it can never leave the screen on
        // a 320px phone. The strip sits above the menu by stacking order.
        left: Math.max(8, Math.min(anchor?.x ?? 16, (typeof window !== 'undefined' ? window.innerWidth : 390) - 300)),
        top: Math.max(8, Math.min((anchor?.y ?? 120) + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)),
        transformOrigin: origin,
      }}
    >
      {/* Strip ABOVE the menu, both under the bubble: the bubble stays the
          subject, the strip is the fast path, the menu is the full list. */}
      <motion.div
        {...enter}
        transition={{ duration: reduced ? 0.12 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-0.5 rounded-full border border-black/[0.08] bg-white/95 px-1.5 py-1 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.28)] dark:border-white/12 dark:bg-apple-tile-2/95"
        role="group"
        aria-label={t('msg.pickReaction')}
      >
        {STRIP.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onReact(emoji); onClose(); }}
            onClick={(e) => { if (e.detail === 0) { onReact(emoji); onClose(); } }}
            aria-label={t('msg.reactWith', { emoji })}
            data-testid={`tapback-${emoji}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[19px] leading-none transition-transform active:scale-[0.97] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          >
            {emoji}
          </button>
        ))}
      </motion.div>

      <motion.div
        {...enter}
        transition={{ duration: reduced ? 0.12 : 0.18, delay: reduced ? 0 : 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-[188px] overflow-hidden rounded-2xl border border-black/[0.07] bg-white/97 py-1 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.34)] dark:border-white/12 dark:bg-apple-tile-2/97"
        role="menu"
        aria-label={t('msg.actions')}
      >
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            role="menuitem"
            data-testid={`action-${row.key}`}
            onClick={(e) => { row.run(); onClose(); if (e.detail === 0) restoreFocus(); }}
            className={cn(
              'flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors',
              row.destructive
                ? 'text-status-danger hover:bg-status-danger/[0.07]'
                : 'text-apple-ink dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
            )}
          >
            {row.icon}
            <span className="flex-1">{row.label}</span>
          </button>
        ))}
        {canDelete && (
          /* Honest about where it deletes: this device's copy only. The other
             device keeps what it already received — saying "delete" alone
             would imply a recall the protocol cannot do. */
          <p className="px-3.5 pb-2 pt-0.5 text-[11px] leading-snug text-apple-ink-muted dark:text-white/65">
            {t('msg.deleteLocalHint')}
          </p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
