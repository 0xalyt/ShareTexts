import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Segmented — one thumb, and it travels.
 *
 * The selected state is a SINGLE indicator that moves from the old tab to the
 * new one on `--st-ease-move` in 200ms. Not two pills crossfading: a crossfade
 * reads as two separate things lighting up, and the eye cannot tell which one
 * is now selected while it happens. One object with a position is a slide, and
 * a slide is a statement.
 *
 * The labels never animate their own boxes; only the colour underneath the
 * thumb changes. Width is measured, not guessed, so an icon tab and a word tab
 * can sit in the same control.
 *
 * Keyboard: it is a real tablist. Left/Right (and Up/Down) move with wrapping,
 * Home/End jump to the ends, focus follows the selection, and exactly one tab
 * is in the tab order at a time. Each tab names the panel it controls.
 *
 * Reduced motion: the thumb is placed, not flung — the CSS transition is
 * switched off and the selection still updates instantly.
 */
export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Accessible name when the label is a glyph only. */
  ariaLabel?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  testId,
  id,
  panelId,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
  testId?: string;
  /** Base id; tabs become `${id}-tab-${value}` so a panel can label itself. */
  id?: string;
  /** The panel each tab controls — this is what `aria-controls` needs. */
  panelId?: (v: T) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [placed, setPlaced] = useState(false);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!active) return;
    setThumb({ x: active.offsetLeft, w: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, value, options.length]);

  // The first placement is not a move. Without this the thumb is drawn at
  // x=0 with a transition on, and the control appears to slide in from the
  // left edge on every mount.
  useLayoutEffect(() => {
    if (!thumb || placed) return;
    const raf = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(raf);
  }, [thumb, placed]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    const tabs = wrapRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  };

  return (
    <div
      ref={wrapRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={cn('segmented', className)}
    >
      <span
        className="segmented-thumb"
        aria-hidden="true"
        data-testid={testId ? `${testId}-thumb` : undefined}
        style={{
          transform: `translateX(${(thumb?.x ?? 0) - 3}px)`,
          width: thumb?.w ?? 0,
          // Paired with the mount guard above: no travel until there is a
          // previous position worth travelling from.
          ...(placed ? {} : { transition: 'none' }),
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          id={id ? `${id}-tab-${o.value}` : undefined}
          /* Only the selected tab points at a panel: the others have none
             mounted, and aria-controls to a missing id is a broken reference
             that screen readers report as "controls nothing". */
          aria-controls={o.value === value ? panelId?.(o.value) : undefined}
          aria-selected={o.value === value}
          aria-label={o.ariaLabel}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
