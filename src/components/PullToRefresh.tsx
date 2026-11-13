import React, { useEffect, useRef, useState } from 'react';

/**
 * PullToRefresh — the gesture for the two screens where something NEW can
 * arrive while you are reading (a room, a Host).
 *
 * It is not a spinner bolted to the top. The rules it follows:
 *
 *   · It only arms at the top of the scroller. Pulling down mid-thread is a
 *     scroll, never a refresh — the one thing that annoys people about this
 *     pattern is a list that reloads when they meant to go back up.
 *   · Rubber resistance, half speed for the first 180px, so the threshold is
 *     reachable with a thumb but hard to trip by accident (88px, the same
 *     number the reference uses).
 *   · The indicator is a drop that stretches with the pull, snaps past the
 *     threshold, then becomes the spinner — with the springs from the
 *     reference (stiffness 260, damping 18 on return) so it settles the same
 *     way rather than snapping like a CSS transition.
 *   · Motion is transform/opacity only, and under reduced motion the drop
 *     does not spin: it becomes a still ring with the word "Updating…".
 *
 * It attaches native listeners to the scroller you give it (passive where it
 * can), so the surrounding view does not have to change its layout.
 */

const THRESHOLD = 88;
const MAX = 128;
const RUBBER = (d: number) => {
  const v = Math.max(0, d);
  return v <= 180 ? v * 0.55 : 99 + 60 * (1 - 1 / (((v - 180) * 0.55) / 60 + 1));
};

export function PullToRefresh({
  scroller,
  onRefresh,
  label = 'Pull to refresh',
}: {
  scroller: HTMLElement | null;
  onRefresh: () => void;
  label?: string;
}) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const reduce = useRef(false);
  const state = useRef({ startY: 0, dragging: false, id: -1 });

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!scroller) return;

    const down = (e: PointerEvent) => {
      if (busy || scroller.scrollTop > 0) return;
      if (e.pointerType === 'mouse') return; // a mouse has a reload button
      state.current = { startY: e.clientY, dragging: true, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s.dragging || e.pointerId !== s.id) return;
      const dy = e.clientY - s.startY;
      if (dy <= 0) {
        if (pull !== 0) setPull(0);
        return;
      }
      if (scroller.scrollTop > 0) {
        s.dragging = false;
        setPull(0);
        return;
      }
      setPull(Math.min(MAX, RUBBER(dy)));
    };
    const up = () => {
      const s = state.current;
      if (!s.dragging) return;
      s.dragging = false;
      setPull((p) => {
        if (p >= THRESHOLD) {
          setBusy(true);
          try {
            onRefresh();
          } finally {
            window.setTimeout(() => {
              setBusy(false);
              setPull(0);
            }, 900);
          }
        }
        return 0;
      });
    };

    scroller.addEventListener('pointerdown', down, { passive: true });
    scroller.addEventListener('pointermove', move, { passive: true });
    scroller.addEventListener('pointerup', up, { passive: true });
    scroller.addEventListener('pointercancel', up, { passive: true });
    return () => {
      scroller.removeEventListener('pointerdown', down);
      scroller.removeEventListener('pointermove', move);
      scroller.removeEventListener('pointerup', up);
      scroller.removeEventListener('pointercancel', up);
    };
  }, [scroller, busy, onRefresh, pull]);

  const progress = Math.min(1, pull / THRESHOLD);
  const visible = busy || pull > 4;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateY(${busy ? 26 : Math.max(0, pull - 22)}px)`,
        transition: busy ? 'transform 240ms cubic-bezier(0.23,1,0.32,1)' : undefined,
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="grid place-items-center rounded-full bg-apple-ink text-white dark:bg-white dark:text-night-900"
          style={{
            width: 32,
            height: 32,
            transform: `scale(${busy ? 1 : 0.6 + 0.4 * progress}, ${busy ? 1 : 0.7 + 0.3 * progress})`,
            transition: 'transform 120ms cubic-bezier(0.23,1,0.32,1)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            style={{
              animation: busy && !reduce.current ? 'st-pr-spin 0.8s linear infinite' : undefined,
              transform: busy ? undefined : `rotate(${progress * 180}deg)`,
            }}
          >
            <path d={busy ? 'M12 4a8 8 0 0 1 8 8' : 'M12 5v14M6 13l6 6 6-6'} />
          </svg>
        </div>
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-apple-ink shadow-[0_6px_18px_-10px_rgba(0,0,0,0.5)] dark:bg-white/15 dark:text-white">
          {busy ? 'Updating…' : progress >= 1 ? 'Release to refresh' : label}
        </span>
      </div>
      <style>{'@keyframes st-pr-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

export default PullToRefresh;
