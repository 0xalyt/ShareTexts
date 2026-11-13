import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/**
 * The three Detent pieces, ported rather than installed.
 *
 * `shadcn add` would have pulled a `@/components/detent` tree, its own theme
 * variables and a second component system beside the one this app documents.
 * What actually shipped is the *behaviour* of each, rebuilt on our tokens
 * (`apple-*`, `ember`, `status-*`) with motion (already a dependency):
 *
 *   HaloBands      — concentric bands whose light follows the pointer; the
 *                    colour restarts at every curved edge, which is what makes
 *                    one glow read as glass instead of a blur.
 *   Announcement   — the pill above a headline: a line of light runs round it
 *                    once when you reach for it, and the tag rolls from what
 *                    this is ("New") to what pressing does ("Read").
 *   UploadFolder   — files hovering tip the folder open; what lands falls in
 *                    as stacked sheets.
 */

/* ─────────────────────────────── halo ──────────────────────────────────── */

export type HaloPalette = { core: string; mid: string; edge: string };

/** Ember first (the brand), then the two supporting accents. */
export const HALOS: HaloPalette[] = [
  { core: '#ffb07a', mid: '#f06413', edge: '#ffd9bd' },
  { core: '#8ff5c8', mid: '#36c8d8', edge: '#c6f2ff' },
  { core: '#c6a4ff', mid: '#6f95ff', edge: '#e6dbff' },
];

const BANDS = [
  { w: 132, h: 180, speed: 3.4 },
  { w: 108, h: 164, speed: 2.7 },
  { w: 88, h: 150, speed: 2.1 },
];

/**
 * HaloBands — decorative. It must never eat a pointer event or a tab stop, so
 * it renders nothing focusable and nothing interactive; the palette cycles on
 * a click that lands on it, and `pressToChange` is off by default for exactly
 * that reason.
 */
export function HaloBands({
  className,
  style,
  palettes = HALOS,
  defaultPalette = 0,
  pressToChange = false,
  hole = true,
}: {
  className?: string;
  style?: React.CSSProperties;
  palettes?: HaloPalette[];
  defaultPalette?: number;
  pressToChange?: boolean;
  /** The pale core that turns the bands into a ring. Off when a real, opaque
   *  surface (a card) is already sitting in the middle. */
  hole?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState(defaultPalette);
  const pointer = useRef<number | null>(null);
  const light = useRef<number[]>(BANDS.map(() => 50));
  const glows = useRef<Array<HTMLDivElement | null>>([]);
  const reduce = useReducedMotion();
  const p = palettes[palette] ?? palettes[0];

  useEffect(() => {
    const el = box.current;
    if (!el || reduce) return;
    let raf = 0;
    let seen = true;
    let last = performance.now();
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; });
    io.observe(el);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (seen) {
        const t = now / 1000;
        BANDS.forEach((b, i) => {
          // -1 → +1 around the resting position, so the bands drift without
          // ever showing their own (straight) edges.
          const aim = pointer.current ?? 50 + Math.sin(t * 0.42 + i * 0.7) * 15;
          light.current[i] += (aim - light.current[i]) * (1 - Math.exp(-dt * b.speed));
          const shift = Math.max(-0.12, Math.min(0.12, (light.current[i] - 50) / 420));
          const move = `translate3d(-50%, calc(-50% + ${(shift * 100).toFixed(2)}px), 0)`;
          const band = glows.current[i];
          if (band) band.style.transform = move;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [reduce]);

  return (
    <div
      ref={box}
      aria-hidden
      style={style}
      onPointerMove={(e) => {
        const r = box.current?.getBoundingClientRect();
        if (r) pointer.current = ((e.clientY - r.top) / r.height) * 100;
      }}
      onPointerLeave={() => { pointer.current = null; }}
      onPointerDown={() => {
        if (pressToChange) setPalette((n) => (n + 1) % palettes.length);
      }}
      // No `relative` here: callers position this absolutely, and Tailwind emits
      // `.relative` after `.absolute`, so a stray `relative` would win and the
      // box would collapse to zero height.
      className={`isolate overflow-hidden ${className ?? ''}`}
    >
      {BANDS.map((b, i) => (
        <div
          key={i}
          ref={(node) => { glows.current[i] = node; }}
          className="absolute left-1/2 top-1/2 overflow-hidden rounded-[50%] bg-apple-canvas dark:bg-night-900"
          style={{
            width: `${b.w}%`,
            height: `${b.h}%`,
            transform: 'translate3d(-50%, -50%, 0)',
          }}
        >
          {/* The light is painted well inside its tile: a gradient that fades
              before the clip, so no straight edge ever shows. */}
          <div
            className="absolute"
            style={{
              inset: '-34%',
              background: `radial-gradient(closest-side at 50% ${i % 2 ? 42 : 60}%, ${p.core} 0%, ${p.mid} 46%, transparent 82%)`,
              opacity: 0.85,
            }}
          />
        </div>
      ))}
      {hole && (
        <div className="absolute left-1/2 top-1/2 h-[138%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-apple-canvas dark:bg-night-900" />
      )}
    </div>
  );
}

/* ──────────────────────────── announcement ─────────────────────────────── */

/* The light that runs round the pill.
 *
 * It used to spin the ELEMENT, which is wrong for this shape: the pill is a
 * rounded rectangle, not a circle, so rotating it swung the ring outside the
 * border — the light visibly broke away at the top and bottom edges on every
 * hover, and a long pill showed it most. Only the gradient's starting angle
 * is animated now, with the geometry left exactly where the border is. That
 * needs an animatable angle, hence the registered property; it costs nothing
 * on browsers without `@property` — the ring still fades in on hover, it just
 * does not travel. */
const RING_CSS = `
@property --st-ann-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.st-announce-ring {
  background: conic-gradient(from var(--st-ann-angle), transparent 0 62%, rgba(240,100,19,0.9) 84%, transparent 100%);
  opacity: .38;
  transition: opacity 220ms ease-out;
}
/* The light now travels all the time — it is the pill saying "this is new",
   not a hover reward. Hover makes it brighter and faster, so the pointer still
   gets an answer, but the announcement is alive before anyone touches it.
   Under reduced motion it stays as a still, lit edge: the motion is the
   decoration here, not the information. */
@media (prefers-reduced-motion: no-preference) {
  .st-announce-ring {
    animation: st-announce-run 3.4s linear infinite;
  }
  .st-announce:hover .st-announce-ring,
  .st-announce:focus-within .st-announce-ring {
    opacity: .85;
    animation-duration: 1.6s;
  }
  @keyframes st-announce-run {
    from { --st-ann-angle: 0deg; }
    to   { --st-ann-angle: 360deg; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .st-announce-ring { opacity: .3; }
  .st-announce:hover .st-announce-ring,
  .st-announce:focus-within .st-announce-ring { opacity: .7; }
}
`;

/**
 * Announcement — one quiet pill above the headline.
 *
 * It is a LINK, not a banner: the tag rolls from what it is to what pressing
 * it does, so the label never has to explain the action separately. The light
 * that runs round it only exists on hover/focus and only without reduced
 * motion — decoration must never be the only thing that tells you it is
 * interactive.
 */
export function Announcement({
  children,
  href,
  tag,
  action,
  hoverText,
  className,
}: {
  children: React.ReactNode;
  href: string;
  tag: string;
  action: string;
  /** The "what changed" line, shown while the pill is hovered or focused. */
  hoverText?: string;
  className?: string;
}) {
  const [near, setNear] = useState(false);
  const reduce = useReducedMotion();
  return (
    <div
      onPointerEnter={() => setNear(true)}
      onPointerLeave={() => setNear(false)}
      onFocus={() => setNear(true)}
      onBlur={() => setNear(false)}
      className={`st-announce group relative inline-flex h-9 max-w-full items-center rounded-full border border-black/[0.08] bg-white pl-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_28px_-20px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.99] dark:border-white/[0.13] dark:bg-white/[0.07] dark:shadow-[0_9px_26px_-18px_rgba(0,0,0,0.9)] ${className ?? ''}`}
    >
      <style>{RING_CSS}</style>
      <span
        className="st-announce-ring pointer-events-none absolute -inset-px rounded-full"
        style={{
          // The gradient itself lives in RING_CSS so the angle can be animated;
          // only the ring-shaped mask belongs here.
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: 1,
        }}
        aria-hidden
      />
      <a
        href={href}
        className="flex min-w-0 items-center gap-2 rounded-full pr-2.5 text-[13px] font-medium text-apple-ink outline-none focus-visible:ring-2 focus-visible:ring-ember/50 dark:text-white/90"
      >
        {/* Both words live in the chip at all times, stacked in one grid cell,
            so the chip is always as wide as the longer of the two. Swapping
            ONE of them meant the pill resized mid-hover — "New" is narrower
            than "Read", so the whole announcement, and the headline centred
            under it, shifted horizontally as you reached for it. A hover
            must never move the thing it is hovering. */}
        <span className="grid h-7 shrink-0 place-items-center overflow-hidden rounded-full bg-apple-ink px-2.5 text-[12px] font-semibold text-white dark:bg-white/[0.16]">
          {([['tag', tag], ['action', action]] as const).map(([key, label]) => {
            const active = (key === 'action') === near;
            return (
              <motion.span
                key={key}
                aria-hidden={!active}
                initial={false}
                animate={
                  reduce
                    ? { opacity: active ? 1 : 0 }
                    : { y: active ? 0 : key === 'action' ? '70%' : '-70%', opacity: active ? 1 : 0 }
                }
                transition={reduce ? { duration: 0.12 } : { type: 'spring', bounce: 0, duration: 0.3 }}
                className="whitespace-pre [grid-area:1/1]"
              >
                {label}
              </motion.span>
            );
          })}
        </span>
        {/* Two messages stacked in one cell, so swapping on hover cannot
            resize the pill and push the headline around. The second one is
            the "what changed" line; the first is the standing promise. */}
        <span className="grid min-w-0 grid-cols-1">
          {[
            { key: 'title', text: children },
            ...(hoverText ? [{ key: 'news', text: hoverText }] : []),
          ].map(({ key, text }) => {
            const active = key === 'title' ? !near || !hoverText : near;
            return (
              <motion.span
                key={key}
                aria-hidden={!active}
                initial={false}
                animate={reduce ? { opacity: active ? 1 : 0 } : { y: active ? 0 : '60%', opacity: active ? 1 : 0 }}
                transition={reduce ? { duration: 0.12 } : { type: 'spring', bounce: 0, duration: 0.32 }}
                className="truncate [grid-area:1/1]"
              >
                {text}
              </motion.span>
            );
          })}
        </span>
        {/* Two marks in one cell: the resting chevron, and the arrow that
            replaces it once the pill is being read. Both occupy the same box,
            so nothing shifts when they swap. */}
        <span className="relative ml-0.5 grid h-3 w-3 shrink-0 place-items-center text-apple-ink-muted dark:text-white/45">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`[grid-area:1/1] h-3 w-3 transition-opacity duration-150 ${near ? 'opacity-0' : 'opacity-100'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span
            aria-hidden
            className={`[grid-area:1/1] text-[12px] font-semibold leading-none transition-opacity duration-150 ${near ? 'opacity-100' : 'opacity-0'}`}
          >
            →
          </span>
        </span>
      </a>
    </div>
  );
}

/* ────────────────────────────── upload ─────────────────────────────────── */

/**
 * UploadFolder — the drag target, drawn as a folder that tips open.
 *
 * The dashed rectangle it replaces said "drop here" in a box; this says it in
 * an object whose lid is already lifting, and the sheets that fall in show
 * what will actually travel. Purely presentational: the drop itself stays on
 * the pane that owns the gesture, so nothing about sending moved.
 */
export function UploadFolder({
  files = 3,
  open = true,
  className,
}: {
  files?: number;
  open?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={className} aria-hidden>
      <div className="relative h-[104px] w-[132px]">
        {/* Back of the folder, with its tab. */}
        <div className="absolute inset-x-0 bottom-0 top-[10px] rounded-[16px] bg-apple-parchment dark:bg-apple-tile-1" />
        <div className="absolute left-3 top-0 h-4 w-14 rounded-t-[10px] bg-apple-parchment dark:bg-apple-tile-1" />
        {/* Sheets — they rise with the lid, staggered, like paper in a folder. */}
        <AnimatePresence>
          {open && Array.from({ length: Math.min(3, Math.max(1, files)) }).map((_, i) => (
            <motion.div
              key={i}
              initial={reduce ? { opacity: 1 } : { y: 16, opacity: 0, rotate: 0 }}
              animate={reduce ? { opacity: 1 } : { y: -10 - i * 7, opacity: 1, rotate: (i - 1) * 5 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26, delay: i * 0.045 }}
              className="absolute left-1/2 top-4 h-[62px] w-[74px] -translate-x-1/2 rounded-[8px] bg-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.28)] dark:bg-apple-tile-3"
              style={{ zIndex: 1 }}
            >
              <span className="absolute left-3 right-3 top-3 h-1.5 rounded-full bg-black/[0.08] dark:bg-white/15" />
              <span className="absolute left-3 right-6 top-6 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10" />
            </motion.div>
          ))}
        </AnimatePresence>
        {/* Front flap, hinged at the bottom edge. */}
        <motion.div
          initial={false}
          animate={{ rotateX: open ? -22 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          style={{ transformOrigin: 'bottom center', transformPerspective: 700, zIndex: 2 }}
          className="absolute inset-x-0 bottom-0 h-[64px] rounded-[14px] bg-gradient-to-b from-[#ffd2b0] to-ember/85 shadow-[0_-2px_8px_-4px_rgba(240,100,19,0.5)] dark:from-[#7a3a12] dark:to-[#b64f10]"
        >
          <span className="absolute inset-x-0 top-2 mx-auto h-1 w-8 rounded-full bg-white/45" />
        </motion.div>
      </div>
    </div>
  );
}
