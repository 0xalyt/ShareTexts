/**
 * useMeasure — watch an element's content-box size with ResizeObserver.
 *
 * Pairs with <Expandable>/<FitWidth>: the ref goes on the INNER div (the one
 * sized by its content), the animate prop on the OUTER wrapper. Measuring and
 * animating the same element creates a loop (animation → resize → measure →
 * animation…), so the two are always separate by construction here.
 *
 * No dependency: react-use-measure does the same thing with extras we don't
 * need (debouncing, scroll tracking). Browser ResizeObserver fires without
 * layout thrash and is supported everywhere we ship (Safari 13.1+).
 */
import { useCallback, useEffect, useState } from 'react';

export interface Bounds {
  width: number;
  height: number;
}

export function useMeasure<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  Bounds,
] {
  const [element, setElement] = useState<T | null>(null);
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 });

  // Ref callback (not an object ref) so the observer re-attaches whenever the
  // node changes; the callback identity is stable, so React never calls it
  // with null-then-node on every render.
  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, bounds];
}
