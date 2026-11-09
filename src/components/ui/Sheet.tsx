import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { hapticTick } from '../../lib/haptics';
import { DUR, SPRING } from '../../lib/motion/tokens';
import { cn } from '../../lib/utils';

/**
 * Sheet — the app's ONE overlay surface, and the only place that knows how a
 * sheet physically behaves.
 *
 * It is a real bottom sheet, not a card that happens to sit at the bottom:
 *
 *   · GRAB IT. Drag the handle (or the body of a sheet that has nothing to
 *     scroll) and it tracks your finger 1:1. Pull UP and it grows to show
 *     more — the bottom edge stays planted, so the top edge rises like a
 *     native sheet instead of the whole panel floating away.
 *   · LET IT GO. Release with speed and it leaves; release slowly past a
 *     third of its height and it leaves; release before either and it
 *     springs home from where it is.
 *   · ONE TICK. A single short haptic fires as the drag crosses the point of
 *     no return, and only once per gesture — feedback at the moment the
 *     decision flips, not a buzz per pixel.
 *   · THE ROOM DIMS WITH YOU. Backdrop opacity follows the drag, so the page
 *     behind tells you how close you are to dismissing.
 *   · SCROLLING WINS. If the content can scroll and is not at the top, a
 *     drag belongs to the content. The sheet only takes over at the top,
 *     which is what stops "I tried to scroll up and it closed".
 *
 * Around that it owns the boring, easy-to-get-wrong parts every overlay needs
 * and that used to be copy-pasted into four of them: portal to <body> (so a
 * room's stacking context can never trap it), body scroll lock with
 * scrollbar-gutter compensation, Escape, backdrop click, focus trap and
 * focus return, `role="dialog"` + `aria-modal`, safe-area padding, and the
 * centered-dialog presentation on ≥sm.
 *
 * Two layers on purpose: the outer motion element owns enter/exit (a
 * percentage spring), the inner element owns the finger (pixel transform,
 * written imperatively). Mixing both into one element is how sheets end up
 * fighting their own animation.
 */
export type SheetProps = {
  open: boolean;
  onClose(): void;
  /** Accessible name, or use `labelledBy` to point at a visible heading. */
  label?: string;
  labelledBy?: string;
  /** Desktop max width in px (mobile is always full-bleed). */
  maxWidth?: number;
  /** Stacking order. Confirmations sit above the sheet that raised them. */
  z?: number;
  testId?: string;
  closeButton?: boolean;
  /** `panel` scrolls the whole panel (short content); `none` = flex column. */
  scroll?: 'panel' | 'none';
  /** Keep children mounted while closed (live engines that must not restart). */
  keepMounted?: boolean;
  /** Disable the drag gesture (e.g. a sheet that is itself a keyboard form). */
  draggable?: boolean;
  panelClassName?: string;
  children: React.ReactNode;
};

/* ── body scroll lock ──────────────────────────────────────────────────────
 * Reference counted: Saved can open ConfirmSheet on top of itself, and the
 * inner sheet closing must not unlock the page under the outer one. */
let lockCount = 0;
let savedOverflow = '';
let savedPadding = '';

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount > 1) return;
  const root = document.documentElement;
  savedOverflow = root.style.overflow;
  savedPadding = root.style.paddingRight;
  const bar = window.innerWidth - root.clientWidth;
  root.style.overflow = 'hidden';
  // Compensate for the vanished scrollbar so the page behind does not shift
  // sideways when a sheet opens — a 15px jump on every open is the classic
  // tell that a modal was bolted on.
  if (bar > 0) root.style.paddingRight = `${bar}px`;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  const root = document.documentElement;
  root.style.overflow = savedOverflow;
  root.style.paddingRight = savedPadding;
}

const vh = () => (typeof window === 'undefined' ? 800 : window.innerHeight);

/**
 * Where the sheet's top edge starts, and how tall it may become.
 *
 * 86/94 rather than half/full: these sheets hold a menu or a list, and the
 * old rest height cut the last row mid-word on a normal phone — a clipped
 * row reads as a rendering bug, not as "scroll for more". Content shorter
 * than the ceiling is unaffected, so a three-row sheet still hugs its
 * content; only tall content uses the extra room.
 */
const restMax = () => Math.round(vh() * 0.86);
const fullMax = () => Math.round(vh() * 0.94);

export function Sheet({
  open,
  onClose,
  label,
  labelledBy,
  maxWidth = 440,
  z = 80,
  testId,
  closeButton = true,
  scroll = 'panel',
  keepMounted = false,
  draggable = true,
  panelClassName,
  children,
}: SheetProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const trapRef = useFocusTrap(open);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  /** Heights in px, mirrored into inline styles. Kept in a ref because they
   *  change per frame and must never trigger a React render. */
  const physics = useRef({ y: 0, max: restMax() });

  // The trap's ref object is what callers expect; keep it pointing at the
  // panel we actually render.
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      (trapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [trapRef],
  );

  const paint = useCallback((nextY: number, nextMax: number) => {
    physics.current.y = nextY;
    physics.current.max = nextMax;
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = nextY === 0 ? '' : `translate3d(0, ${nextY}px, 0)`;
    el.style.maxHeight = `${Math.round(nextMax)}px`;
  }, []);

  // Fresh sheet on every open: home position, resting height. Layout effect
  // so the resting cap is already painted on the first frame — a sheet that
  // paints full height and then shrinks is a visible flinch.
  useLayoutEffect(() => {
    if (!open) return;
    physics.current = { y: 0, max: restMax() };
    const el = panelRef.current;
    if (el) {
      el.style.transform = '';
      el.style.maxHeight = `${physics.current.max}px`;
    }
    const bd = backdropRef.current;
    if (bd) bd.style.opacity = '';
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* ── drag ─────────────────────────────────────────────────────────────── */
  const gesture = useRef<{
    id: number;
    startY: number;
    startX: number;
    startT: number;
    startMax: number;
    /** Distance already travelled when the finger landed. Non-zero only when
     *  the sheet was caught mid-return, and the reason catching it does not
     *  jump: the drag continues from where the panel actually is on screen. */
    base: number;
    fromHandle: boolean;
    decided: boolean;
    ticked: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!open || !draggable || reduced) return;
    // Mouse drags are text selection on desktop; the dialog dismisses with
    // the ✕, Escape or the backdrop instead.
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    const panel = e.currentTarget;
    const target = e.target as HTMLElement;
    const fromHandle = !!target.closest('[data-sheet-handle]');
    if (
      !fromHandle &&
      target.closest('button, a, input, textarea, select, label, [role="switch"], [contenteditable="true"], [data-sheet-no-drag]')
    ) {
      return;
    }
    const scroller = (panel.querySelector('[data-sheet-scroll]') as HTMLElement | null) ?? panel;
    const scrollable = scroller.scrollHeight > scroller.clientHeight + 2;
    // A body drag belongs to the content whenever the content can move.
    if (!fromHandle && scrollable && scroller.scrollTop > 0) return;

    /* Catch it mid-flight. A sheet that is springing home is a moving object,
       so the press has to freeze it where it is and adopt that offset as the
       new origin — otherwise the panel snaps to its resting place under the
       finger and the whole gesture restarts from zero. `pause` first (so the
       frame we read is the frame that is painted), then cancel so our own
       transform takes over; `m42` is the translateY framer wrote. */
    let base = 0;
    const el = panelRef.current;
    if (el) {
      const moving = el.getAnimations();
      if (moving.length) {
        for (const a of moving) a.pause();
        const t = getComputedStyle(el).transform;
        base = t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
        for (const a of moving) a.cancel();
      }
    }

    gesture.current = {
      id: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      startT: performance.now(),
      startMax: physics.current.max,
      base,
      fromHandle,
      decided: false,
      ticked: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const raw = e.clientY - g.startY;
    // What the panel should be showing, including anything it had already
    // travelled when the finger arrived. Never above rest: there is no
    // content hiding above the sheet's home position.
    const dy = Math.max(0, g.base + raw);
    const dx = e.clientX - g.startX;

    if (!g.decided) {
      if (Math.abs(dy) < 7 && Math.abs(dx) < 7) return;
      // Horizontal intent (a swipe, a selection) is not a sheet drag. Neither
      // is pulling up from a body that has content above it to scroll.
      if (Math.abs(dx) > Math.abs(raw)) { gesture.current = null; return; }
      if (raw < 0 && !g.fromHandle) { gesture.current = null; return; }
      g.decided = true;
      const el = panelRef.current;
      if (el) el.style.willChange = 'transform, max-height';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    }

    if (raw < 0) {
      // Pull up: the top edge rises until the ceiling, then resists, so the
      // gesture never dead-ends hard against a limit.
      const limit = fullMax();
      const want = g.startMax - raw;
      if (want <= limit) paint(0, want);
      else paint((raw + (limit - g.startMax)) * 0.18, limit);
      return;
    }

    paint(dy, physics.current.max);
    const el = panelRef.current;
    const height = el?.offsetHeight || restMax();
    const dist = Math.min(160, Math.max(76, height * 0.3));
    const progress = Math.min(1, dy / dist);
    const bd = backdropRef.current;
    if (bd) bd.style.opacity = String(Math.max(0.08, 1 - progress * 0.92));
    if (!g.ticked && progress >= 1) {
      g.ticked = true;
      hapticTick();
    } else if (g.ticked && progress < 0.9) {
      // Dragged back above the line: re-arm, so the tick always marks the
      // crossing rather than the first moment we happened to see it.
      g.ticked = false;
    }
  };

  const endGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || e.pointerId !== g.id) return;
    const el = panelRef.current;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (el) el.style.willChange = '';
    if (!g.decided) return;

    const raw = e.clientY - g.startY;
    const dt = Math.max(1, performance.now() - g.startT);
    const velocity = raw / dt; // px/ms, positive = downward
    /* Where a flick would coast to, not where the finger happened to stop.
       Without this a short, fast downward flick that released just above the
       threshold felt dead, and a nudge upward could never reach the ceiling.
       160ms of coast is the projection at ~0.998 deceleration over the
       distances a sheet actually travels. */
    const landed = Math.max(0, g.base + raw + velocity * 160);
    const bd = backdropRef.current;

    const home = () => {
      if (!el) return;
      animate(el, { y: 0 }, SPRING.sheet);
      if (bd) animate(bd, { opacity: 1 }, { duration: DUR.short / 1000 });
      physics.current.y = 0;
    };

    if (cancelled) {
      home();
      if (el) animate(el, { maxHeight: `${g.startMax}px` }, SPRING.sheet);
      physics.current.max = g.startMax;
      return;
    }

    if (raw > 0 || g.base > 0) {
      const height = el?.offsetHeight || restMax();
      const threshold = Math.min(160, Math.max(76, height * 0.3));
      const fling = velocity > 0.5 && raw > 40;
      if (landed > threshold || fling) {
        onClose();
        return;
      }
      home();
      return;
    }

    // Pull-up release: past a third of the available growth it stays open
    // wider; a short nudge just springs back.
    const grew = physics.current.max - g.startMax;
    const room = fullMax() - g.startMax;
    const projected = grew + Math.abs(velocity) * 160;
    const next = (grew > Math.max(24, room * 0.35) || projected > room * 0.5) ? fullMax() : g.startMax;
    if (el) animate(el, { maxHeight: `${next}px` }, SPRING.sheet);
    physics.current.max = next;
    home();
  };

  const backdrop = (
    <motion.div
      ref={backdropRef}
      className="absolute inset-0 bg-black/36"
      initial={{ opacity: 0 }}
      // A held sheet is mounted forever, so this must follow `open` —
      // otherwise the dim wash stays painted over the app while the sheet is
      // shut.
      animate={{ opacity: open ? 1 : 0 }}
      exit={{ opacity: 0 }}
      style={{ pointerEvents: open ? undefined : 'none' }}
      transition={{ duration: DUR.short / 1000 }}
      onClick={open ? onClose : undefined}
    />
  );

  const panelClass = [
    'relative w-full bg-apple-canvas dark:bg-surface-dark border border-apple-divider/60 dark:border-white/[0.08] shadow-sheet sm:shadow-2xl',
    'rounded-t-[24px] sm:rounded-[20px]',
    scroll === 'panel'
      ? 'p-5 sm:p-6 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-6 overflow-y-auto overscroll-contain'
      : 'flex flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),14px)] sm:pb-0',
    panelClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {/* Drag handle. Its hit area is the full width of the sheet and taller
          than the pill (data-sheet-handle), so "grab the sheet" works even
          when the thumb lands beside the line — and it is the one region
          where a drag can never be mistaken for a scroll. */}
      <div
        data-sheet-handle
        aria-hidden
        className="sm:hidden shrink-0 flex justify-center items-end pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none"
      >
        <span className="w-9 h-1 rounded-full bg-black/20 dark:bg-white/25" />
      </div>
      {closeButton && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          data-sheet-no-drag
          className="absolute top-3.5 right-3.5 z-10 w-10 h-10 -m-1 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-90 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {children}
    </>
  );

  // The panel is a plain element: the outer motion node owns enter/exit and
  // this one owns the finger. Keeping them separate is what lets a drag start
  // mid-animation without the two writing to the same transform.
  const panel = (held: boolean) => (
    <div
      ref={setPanel}
      role="dialog"
      aria-modal={held ? open || undefined : true}
      aria-label={label}
      aria-labelledby={labelledBy}
      // The dialog itself is where focus starts: a screen reader announces
      // "dialog, Settings" straight away and nothing inside gets a ring of
      // focus the user never asked for. Tab moves into the content.
      data-autofocus
      tabIndex={-1}
      style={{ maxHeight: physics.current.max, maxWidth }}
      className={cn(panelClass, 'outline-none')}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e, false)}
      onPointerCancel={(e) => endGesture(e, true)}
    >
      {inner}
    </div>
  );

  if (keepMounted) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
        style={{ zIndex: z, pointerEvents: open ? undefined : 'none' }}
        aria-hidden={open ? undefined : true}
        data-held={open ? undefined : 'closed'}
      >
        {backdrop}
        <motion.div
          className="w-full flex justify-center sm:block"
          animate={{ y: open ? 0 : '100%', opacity: open ? 1 : 0.4 }}
          transition={SPRING.sheet}
          style={{ visibility: open ? 'visible' : 'hidden', maxWidth }}
        >
          {panel(true)}
        </motion.div>
      </div>,
      typeof document !== 'undefined' ? document.body : null,
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: z }}>
          {backdrop}
          <motion.div
            className="w-full flex justify-center sm:block"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.35 }}
            transition={SPRING.sheet}
            style={{ maxWidth }}
          >
            {panel(false)}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null,
  );
}
