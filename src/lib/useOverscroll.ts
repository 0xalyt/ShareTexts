import { useEffect, type RefObject } from 'react';

/**
 * useOverscroll — the iOS rubber band, on the app's own scrollers.
 *
 * Why the browser's bounce is not enough: with `overscroll-behavior: contain`
 * (which we set so a pull can never reload the page or chain to the body) a
 * scroller simply STOPS at its edge. Stopping dead is the difference between
 * "a web page" and "a surface" — the finger hits a wall with no answer.
 *
 * iOS uses a hyperbola, not a logarithm:
 *
 *     offset = (1 − 1 / (c·x/d + 1)) · d      with c = 0.55
 *
 * where x is how far the finger has pulled and d is the height of the screen.
 * Two properties make it feel right and are worth stating plainly:
 *
 *   · it starts almost 1:1 — at x = 0 the derivative is c, so the first few
 *     pixels move with the finger and the surface never feels stuck, then
 *   · it asymptotes at d — you can pull forever and the content never travels
 *     more than one screen. It resists more the harder you pull, without a
 *     visible limit.
 *
 * On release the content springs home. The spring is a critically damped
 * numeric one (see below), not a CSS easing: an ease-out starts slowly and
 * decelerates from the first frame, which reads as "animated", while a spring
 * leaves fast and settles — which reads as "it went back".
 *
 * Scope and safety:
 *   · touch/pen only — a mouse wheel has momentum handling of its own, and a
 *     translated container under a wheel would fight it
 *   · disabled under prefers-reduced-motion (a moving viewport is a vestibular
 *     trigger; the content still scrolls, it just stops at the edge)
 *   · only translates the scroller's FIRST ELEMENT CHILD, so sticky headers,
 *     fixed chrome and anything portalled outside stay put
 *   · the transform is cleared on every release, including a cancelled touch,
 *     a scroll that starts mid-gesture, or unmount — it can never be left
 *     applied to a live scroller.
 */

/** iOS's constant. Pull harder than this and the surface just resists more. */
const C = 0.55;
/** Vertical travel under which a gesture is a tap, not a pull. */
const SLOP = 4;
/** A spring stiff enough to read as "snap back", soft enough not to bounce.
 *  damping = 2·√(k·m) is critical damping for this stiffness. */
const SPRING = { stiffness: 520, damping: 46, mass: 1 };

const rubber = (x: number, d: number): number => {
  if (x <= 0) return 0;
  return (1 - 1 / ((C * x) / d + 1)) * d;
};

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useOverscroll(
  scrollRef: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !enabled) return;
    const content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;

    let startY = 0;
    let startX = 0;
    let pulling = false; // we have taken the gesture
    let direction: 1 | -1 = 1; // 1 = pulling down past the top
    let raf = 0;

    const setOffset = (offset: number) => {
      content.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`;
    };

    const stopSettle = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Critically damped spring for one scalar, integrated on rAF. 260ms is
    // the worst case for the largest pull; small pulls finish much sooner,
    // which is what makes the gesture feel proportional rather than timed.
    const springBack = () => {
      stopSettle();
      const from = direction * (parseFloat(content.dataset.stOffset || '0') || 0);
      if (!from) return;
      const k = SPRING.stiffness;
      // Critically damped: hits zero fast without overshooting the edge, which
      // is the difference between "it went back" and "it bounced".
      const cDamp = SPRING.damping;
      let v = 0;
      let x = from;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.032, (now - last) / 1000);
        last = now;
        const a = -k * x - cDamp * v;
        v += a * dt;
        x += v * dt;
        if (Math.abs(x) < 0.4 && Math.abs(v) < 4) {
          setOffset(0);
          content.dataset.stOffset = '';
          content.style.willChange = '';
          stopSettle();
          return;
        }
        setOffset(x);
        content.dataset.stOffset = String(Math.abs(x));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (prefersReduced()) return;
      stopSettle();
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = false;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Checked here too, not only on touchstart: a gesture that began before
      // the preference was read (or a start we skipped) must not pull.
      if (prefersReduced()) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      const edge = atTop ? 1 : atBottom ? -1 : 0;

      if (!pulling) {
        if (edge === 0) return;
        if (Math.abs(dy) < SLOP) return;
        // Horizontal intent (a swipe, a page change) is not a pull.
        if (Math.abs(dx) > Math.abs(dy)) return;
        if (edge === 1 && dy <= 0) return;
        if (edge === -1 && dy >= 0) return;
        pulling = true;
        direction = edge as 1 | -1;
        content.style.willChange = 'transform';
      }

      // The gesture is ours from here: stop the native scroll/rubber band so
      // the two cannot run at once and double the movement.
      e.preventDefault();
      const d = scroller.clientHeight || 1;
      const x = Math.abs(dy);
      const offset = rubber(x, d);
      setOffset(direction * offset);
      content.dataset.stOffset = String(offset);
    };

    const end = () => {
      if (!pulling) return;
      pulling = false;
      springBack();
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', end, { passive: true });
    scroller.addEventListener('touchcancel', end, { passive: true });

    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', end);
      scroller.removeEventListener('touchcancel', end);
      stopSettle();
      content.style.transform = '';
      content.style.willChange = '';
      delete content.dataset.stOffset;
    };
  }, [scrollRef, enabled]);
}
