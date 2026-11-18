import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * useTriggerOrigin — a floating panel grows out of the control that opened it.
 *
 * Menus, palettes, popovers and tooltips used to scale up from their own
 * centre, which draws the eye to a point that is not where the click was: a
 * panel hanging off the top-right of the header appeared to fly in from
 * mid-air, and a tooltip above a glyph grew out of its middle instead of off
 * the button underneath it.
 *
 * The origin is measured, not guessed: the anchor's centre is projected into
 * the panel's own box, clamped to its edges (a trigger outside the panel — a
 * menu that opens upward — still gives a clean edge origin). Both rects are
 * read in a layout effect, after the panel has mounted and before paint, so
 * the first frame already has the right origin and there is no flicker.
 *
 * The anchor is either the ref you pass (the trigger button) or, when the
 * panel opens from a keyboard shortcut, whatever had focus at that moment.
 */
export function useTriggerOrigin(
  open: boolean,
  anchorRef?: RefObject<HTMLElement | null>,
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [origin, setOrigin] = useState<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setOrigin(undefined);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const anchor =
      anchorRef?.current ??
      (typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null);
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return;

    const p = panel.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    if (!p.width || !p.height) return;
    if (!a.width && !a.height) return;

    const x = clamp(a.left + a.width / 2 - p.left, 0, p.width);
    const y = clamp(a.top + a.height / 2 - p.top, 0, p.height);
    setOrigin(`${Math.round(x)}px ${Math.round(y)}px`);
  }, [open, anchorRef]);

  return { panelRef, origin } as const;
}

export default useTriggerOrigin;
