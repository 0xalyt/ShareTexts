import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { haptic } from '../lib/haptics';

/**
 * PullToRefresh — the pull-to-refresh for the two screens where something NEW
 * can land while you are reading (a room thread, a Host).
 *
 * The dissolve recipe, on the web:
 *
 *   · PULL      grains drift in from scattered positions and gather into a
 *               ring, 1:1 with the finger. Below the threshold the pull is
 *               literal — the list moves exactly as far as the thumb.
 *   · PAST      beyond the threshold the gesture goes rubber — half the
 *               distance (0.5), so the ring stops chasing the finger and the
 *               threshold can’t be tripped by a flick.
 *   · TICK      at the threshold the ring closes with one rigid tick (a short
 *               snap plus the select haptic): the gesture is armed.
 *   · RELEASE   past it, the ring spins and the list is HELD under it while
 *               `onRefresh` runs.
 *   · SETTLE    when the promise lands, rows already on screen glide to their
 *               new places, the list eases back to the top, and any row that
 *               appeared is built in from the ring’s grains.
 *   · NOTHING   no new rows, or `onRefresh` threw: the grains fall away as
 *               dust and the list simply returns.
 *   · EARLY     released before the threshold, the grains scatter back out.
 *
 * It only arms at the very top of the scroller (a pull mid-thread is a scroll,
 * never a refresh), only for touch and pen (a mouse has a reload button), and
 * it attaches passive listeners to the scroller you give it, so the host keeps
 * its own layout and scroll physics.
 *
 * What counts as an item: elements carrying `data-pull-item="<stable id>"`.
 * Ids present when the refresh starts are remembered; any other id is new.
 *
 * The dissolve original runs the particles in Skia on the native thread. This
 * app is a Vite + React web build with no Expo runtime, so the grains are DOM
 * dots animated per frame from the gesture, and the item choreography uses
 * FLIP over the real layout — which is why it works for any layout: rows, a
 * grid, wrapped cards of different heights.
 */

const THRESHOLD = 88;
const PAST_THRESHOLD = 0.5;
const MAX = 176;
/** Where the list is held while the work runs. */
const HOLD = 68;
const BOX = 44;
const RING_R = 14;
const COUNT = 14;
const CALM = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Phase = 'idle' | 'pulling' | 'ready' | 'busy' | 'settling';

/** Deterministic scatter: the same bashful cloud every time you pull. */
const GRAINS = Array.from({ length: COUNT }, (_, i) => {
  const a = (i / COUNT) * Math.PI * 2;
  return {
    ring: { x: Math.cos(a) * RING_R, y: Math.sin(a) * RING_R },
    scatter: {
      x: Math.cos(a * 2.3) * (24 + ((i * 13) % 10)) + (((i * 37) % 11) - 5),
      y: Math.sin(a * 1.7) * (16 + ((i * 7) % 8)) - 3,
    },
    spin: ((i * 53) % 160) - 80,
  };
});

export interface PullToRefreshProps {
  /** The scroll container the gesture listens to. */
  scroller: HTMLElement | null;
  /** The work. Resolve when it is done; a rejection reads as “nothing new”. */
  onRefresh: () => void | Promise<unknown>;
  /** Kept for callers that named the gesture; no longer rendered as a label. */
  label?: string;
  className?: string;
}

export function PullToRefresh({ scroller, onRefresh, className }: PullToRefreshProps) {
  const { t } = useI18n();
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const pullRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const raf = useRef(0);
  const reduce = useRef(false);
  const ticked = useRef(false);
  const gesture = useRef({ active: false, id: -1, startY: 0 });
  const ringRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const shifted = useRef(new Map<HTMLElement, string>());

  /** rAF-throttled pull: a finger can fire 120 moves a second, React should not. */
  const queue = useCallback((value: number) => {
    pullRef.current = value;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setPull(pullRef.current);
    });
  }, []);

  /**
   * Move the list under the indicator. Only the scroller's children are
   * touched (the indicator marks itself `data-ptr`), and every original inline
   * transform is put back, so nothing the host set is lost.
   */
  const shift = useCallback((px: number, animate = false) => {
    const el = scroller;
    if (!el) return;
    for (const kid of Array.from(el.children) as HTMLElement[]) {
      if (kid.dataset.ptr !== undefined) continue;
      if (!shifted.current.has(kid)) shifted.current.set(kid, kid.style.transform);
      kid.style.transition = animate ? `transform 420ms ${CALM}` : 'none';
      kid.style.transform = px ? `translate3d(0, ${px}px, 0)` : (shifted.current.get(kid) ?? '');
    }
    if (!px && animate) {
      window.setTimeout(() => {
        for (const kid of Array.from(el.children) as HTMLElement[]) {
          if (kid.dataset.ptr !== undefined) continue;
          if ((shifted.current.get(kid) ?? '') === '') kid.style.transform = '';
          kid.style.transition = '';
        }
        shifted.current.clear();
      }, 460);
    }
  }, [scroller]);

  /** Released early (or the scroll won): the grains scatter back out. */
  const settleBack = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    phaseRef.current = 'settling';
    setPhase('settling');
    shift(0, true);
    queue(0);
    window.setTimeout(() => {
      phaseRef.current = 'idle';
      setPhase('idle');
      ticked.current = false;
    }, reduce.current ? 0 : 380);
  }, [queue, shift]);

  /** The pause that lets React commit the refreshed list before we measure it. */
  const twoFrames = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') return resolve();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const items = (): HTMLElement[] =>
    Array.from(scroller?.querySelectorAll<HTMLElement>('[data-pull-item]') ?? []);

  /** Nothing new: the ring lets go and the grains fall as dust. */
  const dust = useCallback(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const grains = Array.from(ring.querySelectorAll('.ptr__grain')) as HTMLElement[];
    for (const grain of grains) {
      const drift = ((Array.from(ring.children).indexOf(grain) * 37) % 30) - 15;
      grain.animate(
        [
          { transform: grain.style.transform, opacity: 1 },
          { transform: `${grain.style.transform} translate3d(${drift}px, 52px, 0) scale(0.4)`, opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      );
    }
  }, []);

  /** New rows are built in from the grains that just gathered. */
  const buildIn = useCallback((fresh: HTMLElement[]) => {
    fresh.forEach((el, i) => {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 520, easing: CALM, delay: i * 45, fill: 'backwards' },
      );
    });
  }, []);

  /** A few grains leave the ring and land on the first new row. */
  const flyTo = useCallback((target: HTMLElement) => {
    const ring = ringRef.current;
    const box = indicatorRef.current?.getBoundingClientRect();
    if (!ring || !box) return;
    const rect = target.getBoundingClientRect();
    const dx = rect.left + Math.min(48, rect.width / 2) - (box.left + box.width / 2);
    const dy = rect.top + Math.min(24, rect.height / 2) - (box.top + box.height / 2);
    const grains = (Array.from(ring.querySelectorAll('.ptr__grain')) as HTMLElement[]).slice(0, 6);
    grains.forEach((grain, i) => {
      grain.animate(
        [
          { transform: grain.style.transform, opacity: 1 },
          { transform: `${grain.style.transform} translate3d(${dx}px, ${dy}px, 0) scale(0.5)`, opacity: 0 },
        ],
        { duration: 460, easing: CALM, delay: i * 28, fill: 'forwards' },
      );
    });
  }, []);

  const runRefresh = useCallback(async () => {
    if (phaseRef.current === 'busy') return;
    phaseRef.current = 'busy';
    setPhase('busy');
    shift(HOLD, true);
    queue(HOLD);

    /** Ids and on-screen tops at the moment the refresh starts. */
    const before = new Map<string, number>();
    for (const el of items()) {
      const id = el.getAttribute('data-pull-item');
      if (id) before.set(id, el.getBoundingClientRect().top);
    }

    let failed = false;
    try {
      await onRefresh();
    } catch {
      failed = true;
    }

    await twoFrames();

    const fresh: HTMLElement[] = [];
    const glide: Array<{ el: HTMLElement; dy: number }> = [];
    for (const el of items()) {
      const id = el.getAttribute('data-pull-item');
      if (!id) continue;
      if (!before.has(id)) {
        fresh.push(el);
        continue;
      }
      // Both measurements are taken under the same HOLD, so the delta is the
      // real layout move — the row's own travels, not the list easing back.
      const dy = el.getBoundingClientRect().top - (before.get(id) ?? 0);
      if (Math.abs(dy) > 1) glide.push({ el, dy });
    }

    if (!reduce.current) {
      if (failed || fresh.length === 0) dust();
      else {
        buildIn(fresh);
        flyTo(fresh[0]);
      }
      for (const { el, dy } of glide) {
        el.animate(
          [{ transform: `translateY(${-dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 460, easing: CALM, fill: 'backwards' },
        );
      }
    }

    // The list eases back under the ring while the rows move.
    phaseRef.current = 'settling';
    setPhase('settling');
    shift(0, true);
    queue(0);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, reduce.current ? 0 : 460);
    });
    // Dust/fly animations fill forwards; release them so the ring is whole
    // again on the next pull (React's own values take back over).
    const settled = Array.from(ringRef.current?.querySelectorAll('.ptr__grain') ?? []) as HTMLElement[];
    for (const grain of settled) {
      for (const anim of grain.getAnimations()) anim.cancel();
    }
    phaseRef.current = 'idle';
    setPhase('idle');
    ticked.current = false;
  }, [buildIn, dust, flyTo, onRefresh, queue, shift]);

  useEffect(() => {
    if (!scroller) return undefined;
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (phaseRef.current === 'busy' || phaseRef.current === 'settling') return;
      if (scroller.scrollTop > 0) return;
      gesture.current = { active: true, id: e.pointerId, startY: e.clientY };
    };

    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g.active || e.pointerId !== g.id) return;

      // The scroll won (or the finger went up): give the list back.
      if (scroller.scrollTop > 0 || e.clientY - g.startY <= 0) {
        if (e.clientY - g.startY <= 0 && scroller.scrollTop <= 0) {
          if (pullRef.current !== 0) {
            queue(0);
            shift(0);
          }
          if (phaseRef.current === 'pulling' || phaseRef.current === 'ready') {
            phaseRef.current = 'idle';
            setPhase('idle');
            ticked.current = false;
          }
          return;
        }
        g.active = false;
        if (pullRef.current !== 0) {
          settleBack();
        }
        return;
      }

      const raw = Math.min(MAX, e.clientY - g.startY);
      // 1:1 to the threshold, then rubber at half speed — the ring stops
      // chasing the finger, so arming takes intent rather than momentum.
      const value = raw <= THRESHOLD ? raw : THRESHOLD + (raw - THRESHOLD) * PAST_THRESHOLD;
      queue(value);
      shift(value);

      const next: Phase = value >= THRESHOLD ? 'ready' : 'pulling';
      if (next !== phaseRef.current) {
        if (phaseRef.current === 'busy' || phaseRef.current === 'settling') return;
        phaseRef.current = next;
        setPhase(next);
        if (next === 'ready' && !ticked.current) {
          ticked.current = true;
          haptic('select');
        }
        if (next === 'pulling') ticked.current = false;
      }
    };

    const up = () => {
      const g = gesture.current;
      if (!g.active) return;
      g.active = false;
      if (phaseRef.current === 'ready') void runRefresh();
      else if (phaseRef.current === 'pulling') settleBack();
    };

    const cancel = () => {
      const g = gesture.current;
      if (!g.active) return;
      g.active = false;
      if (phaseRef.current === 'pulling' || phaseRef.current === 'ready') settleBack();
    };

    scroller.addEventListener('pointerdown', down, { passive: true });
    scroller.addEventListener('pointermove', move, { passive: true });
    scroller.addEventListener('pointerup', up, { passive: true });
    scroller.addEventListener('pointercancel', cancel, { passive: true });
    return () => {
      scroller.removeEventListener('pointerdown', down);
      scroller.removeEventListener('pointermove', move);
      scroller.removeEventListener('pointerup', up);
      scroller.removeEventListener('pointercancel', cancel);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [queue, runRefresh, scroller, settleBack, shift]);

  // Never leave the host's own transforms behind if we unmount mid-gesture.
  useEffect(() => () => {
    const map = shifted.current;
    for (const [el, original] of map) {
      el.style.transform = original;
      el.style.transition = '';
    }
    map.clear();
  }, []);

  const progress = Math.max(0, Math.min(1, pull / THRESHOLD));
  const busy = phase === 'busy';
  const held = busy || phase === 'settling';
  const visible = pull > 2 || held;
  // The gather is literally 1:1 with the pull — halfway down the threshold the
  // cloud is halfway home — so the ring reads as something the finger builds.
  // While the work runs it is already closed, not left mid-gather at the hold.
  const gathered = held ? 1 : progress;
  const closed = progress >= 1 || held;

  return (
    <div
      ref={indicatorRef}
      data-ptr=""
      aria-hidden={!busy}
      className={`ptr${phase === 'settling' ? ' ptr--settling' : ''}${className ? ` ${className}` : ''}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate3d(0, ${Math.max(0, pull / 2 - BOX / 2)}px, 0)`,
        transition: held ? `transform 420ms ${CALM}, opacity 220ms linear` : undefined,
      }}
    >
      <div
        ref={ringRef}
        className={`ptr__ring${phase === 'ready' ? ' ptr__ring--armed' : ''}`}
        style={{ width: BOX, height: BOX }}
      >
        {/* The circle the grains close onto: it exists only from the
            threshold on, and becomes the spinner while the work runs. */}
        <span
          className={`ptr__track${busy ? ' ptr__track--spin' : ''}`}
          aria-hidden
          style={{
            opacity: closed ? 1 : 0,
            transform: `scale(${closed ? 1 : 0.86})`,
            transition: reduce.current ? undefined : `opacity 120ms linear, transform 160ms ${CALM}`,
          }}
        />
        {GRAINS.map((grain, i) => {
          const x = grain.scatter.x + (grain.ring.x - grain.scatter.x) * gathered;
          const y = grain.scatter.y + (grain.ring.y - grain.scatter.y) * gathered;
          return (
            <span
              key={i}
              className="ptr__grain"
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) rotate(${grain.spin * (1 - gathered)}deg)`,
                opacity: 0.35 + 0.65 * gathered,
              }}
            />
          );
        })}
      </div>
      {busy && <span className="sr-only" role="status">{t('code.refresh')}</span>}
    </div>
  );
}

export default PullToRefresh;
