import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Segmented — one shared thumb, slid by CSS (§18).
 *
 * The thumb is a single element positioned over the selected tab, so the
 * control cannot grow two moving parts and the labels never animate their
 * own boxes. Selection lives with the caller (React state), which is what
 * lets a mode survive a Back.
 *
 * Keyboard: Left/Right move between tabs, Home/End jump to the ends, and
 * the tabs are a proper tablist (`aria-selected`, one tab in the tab order).
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
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
  testId?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!active) return;
    setThumb({ x: active.offsetLeft, w: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, value, options.length]);
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
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={cn('segmented', className)}
    >
      <span className="segmented-thumb" aria-hidden style={{ transform: `translateX(${thumb.x - 3}px)`, width: thumb.w }} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
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
