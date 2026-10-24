import { useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Edge-aware scroll fade (the craft.gustavofior "Scroll Fades" behavior):
 * writes the two mask stops of `.st-scroll-fade-y` from the element's own
 * scroll position, so ONLY the edge that still has content behind it fades —
 * the top fade grows over the first FADE px of scrolling, the bottom fade
 * shrinks back to 0 over the last FADE px.
 *
 * Done in JS rather than a scroll-driven animation because of the case the
 * article's own CSS fallback gets wrong: with a pure-CSS timeline a container
 * that never overflows sits at progress 0 forever, which pins the bottom fade
 * open over a short list — the "last row looks half hidden" lie. Here a
 * non-scrolling box computes max <= 0 and keeps BOTH stops at 0: no fade at
 * all, which is the honest read.
 *
 * The element is held in STATE, not read from a ref inside a `[]` effect:
 * every consumer here lives in an always-mounted component while the
 * scrollable div mounts later behind AnimatePresence — a ref read at
 * effect time would be null forever (the effect never re-runs on attach).
 * Store-then-effect re-runs the setup exactly when the node appears and
 * tears it down when it goes, whichever mount timing React picks.
 *
 * Recomputes on scroll (rAF-throttled), on box resize (ResizeObserver), and
 * on content growth (MutationObserver — a list appending rows must re-arm the
 * fades without a scroll event first).
 */
const FADE = 40; // px — the ~2.5rem edge the article uses

export function useScrollFade<T extends HTMLElement>(): Dispatch<SetStateAction<T | null>> {
  const [el, setEl] = useState<T | null>(null);

  useLayoutEffect(() => {
    if (!el) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const max = el.scrollHeight - el.clientHeight;
      const start = max > 0 ? Math.min(Math.max(el.scrollTop, 0) / FADE, 1) * FADE : 0;
      const end = max > 0 ? Math.min(Math.max(max - el.scrollTop, 0) / FADE, 1) * FADE : 0;
      el.style.setProperty('--st-fade-start', `${Math.round(start)}px`);
      el.style.setProperty('--st-fade-end', `${Math.round(end)}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener('scroll', schedule);
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      el.style.removeProperty('--st-fade-start');
      el.style.removeProperty('--st-fade-end');
    };
  }, [el]);

  return setEl;
}
