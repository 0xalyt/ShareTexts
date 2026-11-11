import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring, useTransform,
} from 'motion/react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import type { MsgKey } from '../lib/messages/types';
import { LaptopFrame } from './mockups/LaptopFrame';
import { PhoneFrame, PhoneStatusBar } from './mockups/PhoneFrame';
import { ShareTextsLogo } from './ShareTextsLogo';
import { SpinLoader } from './SpinLoader';
import { TactileButton } from './TactileButton';
import {
  CheckCheck as CheckDouble, Lock, Paperclip, Send as PaperPlane,
} from 'lucide-react';

/**
 * HeroDeviceDemo — the transfer, up close.
 *
 * The old scene was a whole desktop app shrunk into a 331px canvas: a
 * sidebar, a thread, a composer and a room-code card, all rendered at 7–8px
 * type. It was accurate and it read as a miniature — nobody can tell what a
 * 7px row says at arm's length, so the picture became texture instead of
 * proof. Premium product shots do the opposite: crop hard to the one surface
 * that carries the story and set its type LARGER than production so it
 * survives the scale-down.
 *
 * So this scene is two surfaces, both legible:
 *
 *   the window   the sender's room, seen as a desktop app window — real
 *                title bar, real pairing code, the payload composed
 *   the phone    the receiver, cropped by the bottom edge of the stage
 *                (a device bleeding out of frame reads as an object in a
 *                room; a device floating whole reads as a diagram)
 *
 * Between them the only thing that moves: the beam, and the packet on it.
 *
 * The states are unchanged from the old machine, because they were right:
 *
 *   open       both surfaces at rest, the payload composed in the window
 *   connecting the phone types the code in; the beam draws
 *   sending    the packet crosses — window to phone
 *   received   it lands, the chip ticks, the phone takes the hit
 *   done       the room closes; nothing is kept; the loop comes back round
 *
 * Interaction: the stage tracks the pointer, tilting the two surfaces by
 * different amounts so the gap between them has depth, and the surfaces ride
 * a soft spotlight. The rail under the stage is the loop's own clock — one
 * segment per beat, the live one filling as the beat plays — and clicking a
 * segment jumps to that beat. Pointer-only, and deliberately aria-hidden: a
 * keyboard user gets the real value (the caption, as a live region) without
 * four extra tab stops inside an illustration.
 *
 * Reduced motion gets the payoff still (`received`), not the empty opening:
 * the still should show the product working, and a still cannot replay
 * itself, so it keeps a Restart.
 */
export type DemoPhase = 'open' | 'connecting' | 'sending' | 'received' | 'done';

/** The caption per state — the same key the surfaces derive from. */
const CAPTIONS: Record<DemoPhase, MsgKey> = {
  open: 'demo.h1',
  connecting: 'demo.h2',
  sending: 'demo.h5',
  received: 'demo.h6',
  done: 'demo.h7',
};

/** Where the machine walks on its own, and how long each beat is worth. The
 *  dwell at `done` is the longest in the cycle: the pause after the room
 *  closes is the point being made. */
const AUTO: Record<DemoPhase, { next: DemoPhase; ms: number }> = {
  open: { next: 'connecting', ms: 2200 },
  connecting: { next: 'sending', ms: 1900 },
  sending: { next: 'received', ms: 1600 },
  received: { next: 'done', ms: 2600 },
  done: { next: 'open', ms: 3600 },
};

/** The rail's beats — `done` is the loop's rest, not a beat of its own. */
const STEPS: DemoPhase[] = ['open', 'connecting', 'sending', 'received'];

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.55, 0, 0.2, 1] as const;

/** The six digits the phone types in. One source for both surfaces. */
const CODE = ['4', '1', '8', '3', '0', '2'] as const;

/** A fine pointer is what tilting is for. Touch has no hover to read, and a
 *  tilt driven by a finger is a wobble under the thumb. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return fine;
}

type Box = { x: number; y: number; w: number; h: number };

export function HeroDeviceDemo({
  variant = 'full',
  className,
}: {
  /**
   * `full`    window + phone side by side (the desktop hero)
   * `stacked` the same two surfaces, window above and phone below-right, for
   *           a phone's hero — the story needs both ends of the transfer
   * `phone`   phone only (kept for the narrow landscape crop)
   */
  variant?: 'full' | 'stacked' | 'phone';
  className?: string;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const fine = useFinePointer();

  // Reduced motion opens on the payoff: the still has to show the product
  // having done its job, not an empty room waiting for a tap. Motion opens
  // mid-action — the packet already in flight — because the first frame is
  // the only frame a lot of visitors will ever see, and "a room waiting for
  // a code" is the emptiest one in the loop.
  const [phase, setPhase] = useState<DemoPhase>(reduced ? 'received' : 'sending');
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [beat, setBeat] = useState(0); // the packet's own bounce counter

  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<{ w: number; h: number; a: Box; b: Box } | null>(null);
  // Side-by-side needs width. Below it the window's thread is too short to
  // hold a two-line bubble, so the composition stacks instead of squeezing.
  const [wide, setWide] = useState(true);

  const running = !reduced && onScreen && tabVisible;

  /* ── the clock ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!running) return;
    const auto = AUTO[phase];
    const timer = setTimeout(() => setPhase(auto.next), auto.ms);
    return () => clearTimeout(timer);
  }, [running, phase]);

  /* ── pause off screen / in a background tab ─────────────────────────── */
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ── pointer tilt + spotlight ───────────────────────────────────────── */
  const px = useMotionValue(0); // -0.5 … 0.5
  const py = useMotionValue(0);
  const tiltY = useSpring(useTransform(px, (v) => v * 7), { stiffness: 120, damping: 18, mass: 0.5 });
  const tiltX = useSpring(useTransform(py, (v) => v * -5), { stiffness: 120, damping: 18, mass: 0.5 });
  const tiltWindowX = useTransform(tiltX, (v) => v * 0.55);
  const tiltWindowY = useTransform(tiltY, (v) => v * 0.55);

  const onStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!fine || reduced) return;
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      px.set(nx);
      py.set(ny);
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
      el.style.setProperty('--spot', '1');
    },
    [fine, reduced, px, py],
  );

  const onStagePointerLeave = useCallback(() => {
    px.set(0);
    py.set(0);
    stageRef.current?.style.setProperty('--spot', '0');
  }, [px, py]);

  /* ── measure the two surfaces: the beam is drawn between real edges ─── */
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    const phone = phoneRef.current;
    if (!stage || !win || !phone) return;
    const s = stage.getBoundingClientRect();
    if (!s.width || !s.height) return;
    const isWide = s.width >= 480;
    setWide((prev) => (prev === isWide ? prev : isWide));
    const w = win.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const toBox = (r: DOMRect): Box => ({
      x: r.left - s.left,
      y: r.top - s.top,
      w: r.width,
      h: r.height,
    });
    const a = toBox(w);
    const b = toBox(p);
    setGeom((prev) => {
      if (prev && prev.w === s.width && prev.h === s.height
        && Math.abs(prev.a.y - a.y) < 1 && Math.abs(prev.b.y - b.y) < 1) return prev;
      return { w: s.width, h: s.height, a, b };
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    for (const el of [stageRef.current, windowRef.current, phoneRef.current]) {
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [measure, variant, phase]);

  /* ── derived ────────────────────────────────────────────────────────── */
  const linked = phase !== 'open';
  const sent = phase === 'sending' || phase === 'received' || phase === 'done';
  const flying = phase === 'sending';
  const arrived = phase === 'received' || phase === 'done';
  const closed = phase === 'done';

  // Arrival nudge: one small downward hit on the whole stage, the way a phone
  // moves in the hand when something lands. Re-keyed per arrival so a loop
  // that runs for an hour still ticks each time.
  useEffect(() => {
    if (arrived) setBeat((n) => n + 1);
  }, [arrived]);

  const beam = useMemo(() => {
    if (!geom || variant === 'phone') return null;
    const { a, b } = geom;
    const start = { x: a.x + a.w + 3, y: a.y + a.h * 0.52 };
    const end = { x: b.x + b.w * 0.07, y: b.y + b.h * 0.3 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const stacked = Math.abs(dy) > Math.abs(dx);
    // Two control points: a flat S across the gap on the side-by-side scene,
    // a relaxed arc down the page when the phone sits under the window.
    const c1 = stacked
      ? { x: start.x + dx * 0.18, y: start.y + dy * 0.55 }
      : { x: start.x + dx * 0.5, y: start.y };
    const c2 = stacked
      ? { x: start.x + dx * 0.82, y: start.y + dy * 0.5 }
      : { x: start.x + dx * 0.5, y: end.y };
    return {
      d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
      start,
      end,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  }, [geom, variant]);

  const caption = t(CAPTIONS[phase]);
  const stepIndex = STEPS.indexOf(phase === 'done' ? 'received' : phase);

  const restart = () => setPhase('sending');

  // The desktop scene is a lit panel — an object on the page, not a drawing of
  // one. White window and white phone on a white page had no material
  // contrast at all; on ink they read as two screens that are switched on.
  // A two-up scene needs width to stay legible; under 560px it becomes the
  // stacked composition the phone hero already uses, which never has to
  // overlap one device on top of another device's text.
  const panel = variant === 'full' && wide;
  const stacked = variant === 'stacked' || (variant === 'full' && !wide);
  // On a stage that is wide enough for two surfaces but not generous, the
  // window takes a bigger share: its screen has to be tall enough to hold a
  // two-line bubble without clipping it.
  const roomy = (geom?.w ?? 0) >= 560;

  /* ── the rail: the loop's clock ─────────────────────────────────────── */
  const railBlock = (
    <div
      aria-hidden
      className={cn('flex items-center', panel ? 'mt-2.5 gap-1' : 'mt-5 gap-1.5 sm:mt-6')}
      data-testid="demo-rail"
    >
      {STEPS.map((step, i) => {
        const done = i < stepIndex || phase === 'done';
        const active = i === stepIndex && phase !== 'done';
        return (
          <button
            key={step}
            type="button"
            tabIndex={-1}
            onClick={() => setPhase(step)}
            className="group relative h-6 flex-1 cursor-pointer rounded-full outline-none"
            aria-label={t(CAPTIONS[step])}
          >
            <span
              className={cn(
                'absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full',
                panel ? 'bg-white/[0.13]' : 'bg-black/[0.07] dark:bg-white/[0.10]',
              )}
            >
              {active ? (
                <motion.span
                  key={phase}
                  className="absolute inset-y-0 left-0 rounded-full bg-ember"
                  initial={{ width: reduced ? '100%' : '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: reduced ? 0 : AUTO[step].ms / 1000, ease: 'linear' }}
                />
              ) : (
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full',
                    done ? 'w-full bg-ember/45' : 'w-0',
                  )}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  /* ── the caption: state output, never decoration ───────────────────── */
  const captionBlock = (
    <div
      className={panel ? 'relative min-h-[1.45em]' : 'relative mt-2.5 min-h-[1.6em]'}
      role="status"
      // A looping caption in a live region is an announcement every few
      // seconds, forever. The words stay in the tree; only the automatic
      // announcements are off while the loop drives itself.
      aria-live={running ? 'off' : 'polite'}
      data-testid="demo-caption"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
          transition={{ duration: reduced ? 0 : 0.34, ease: EASE }}
          className="absolute inset-x-0 top-0"
        >
          <p
            className={cn(
              'font-medium leading-snug',
              panel
                ? 'text-left text-[13.5px] font-medium leading-snug text-white'
                : 'text-center text-[13px] text-apple-ink-muted dark:text-white/55',
            )}
          >
            {caption}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  // A still cannot replay itself, so only the still keeps a control.
  const restartNode = (
    <TactileButton
      variant="secondary"
      size="md"
      onClick={restart}
      data-testid="demo-restart"
      className="min-w-[104px]"
    >
      {t('demo.restart')}
    </TactileButton>
  );

  return (
    <div
      ref={hostRef}
      className={cn('w-full select-none', className)}
      data-testid="hero-demo"
      data-state={phase}
      role="group"
      aria-label={t('demo.title')}
    >
      {/* ── the stage ─────────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        onPointerMove={onStagePointerMove}
        onPointerLeave={onStagePointerLeave}
        style={{ '--spot': '0' } as React.CSSProperties}
        className={cn(
          'relative w-full',
          // Aspect is the composition's, not a video's: the window owns the
          // top-left, the phone the bottom-right, and the phone is allowed to
          // run past the floor.
          panel
            ? cn(
                'aspect-[16/10] overflow-hidden rounded-[26px]',
                'bg-[radial-gradient(125%_110%_at_18%_0%,#2b241c_0%,#191412_52%,#100d0c_100%)]',
                'ring-1 ring-black/50',
                'shadow-[0_60px_100px_-52px_rgba(20,16,10,0.72),0_16px_36px_-26px_rgba(20,16,10,0.5)]',
                'dark:bg-[radial-gradient(125%_110%_at_18%_0%,#1c1b20_0%,#111014_55%,#0b0a0d_100%)]',
                'dark:ring-white/[0.08] dark:shadow-[0_60px_100px_-52px_rgba(0,0,0,0.9)]',
              )
            : stacked
              ? 'aspect-[1/1.5]'
              : 'aspect-[9/19.5] max-w-[210px] mx-auto',
        )}
      >
        {/* Ambient bloom: warm light under the two objects, so they sit in a
            room instead of on a white page. Pointer-transparent. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute left-[6%] top-[16%] h-[46%] w-[52%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(240,100,19,0.13),rgba(240,100,19,0)_70%)] blur-[6px] motion-safe:animate-[st-bloom_9s_ease-in-out_infinite]" />
          <div className="absolute bottom-[4%] right-[2%] h-[52%] w-[44%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(255,171,48,0.16),rgba(255,171,48,0)_70%)] blur-[8px] motion-safe:animate-[st-bloom_11s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 hidden dark:block bg-[radial-gradient(ellipse_at_50%_40%,rgba(251,146,67,0.10),transparent_65%)]" />
          {/* The panel's own light: a warm wash from the top-left and a cold
              fall-off at the bottom-right, so the ink reads as a lit surface
              rather than a flat fill. */}
          {panel && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(70%_58%_at_12%_2%,rgba(240,100,19,0.11),transparent_60%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14)_22%,rgba(255,255,255,0.14)_70%,transparent)]" />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.05]" />
              <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_120%,rgba(0,0,0,0.55),transparent_58%)]" />
            </>
          )}
        </div>

        {/* Spotlight: follows the pointer, barely there — it is what makes a
            static composition feel lit rather than printed. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[var(--spot)] transition-opacity duration-500"
          style={{
            background:
              'radial-gradient(220px circle at var(--mx, 50%) var(--my, 40%), rgba(240,100,19,0.10), transparent 68%)',
          }}
        />

        {/* The beam. Drawn between the two surfaces' measured edges, so it
            stays attached at every width instead of relying on magic
            percentages that drift the moment a frame changes size. */}
        {beam && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
            viewBox={`0 0 ${Math.max(geom?.w ?? 1, 1)} ${Math.max(geom?.h ?? 1, 1)}`}
            fill="none"
          >
            {/* Bed: the channel that exists once the two ends are paired. */}
            <motion.path
              d={beam.d}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="2.5 3.5"
              className={panel ? 'text-white/25' : 'text-apple-ink/55 dark:text-white/40'}
              initial={false}
              animate={{ pathLength: linked ? 1 : 0, opacity: linked ? 1 : 0 }}
              transition={{ duration: 0.9, ease: EASE }}
            />
            {/* The live line: a short ember pulse that rides the channel the
                moment the packet leaves. */}
            {linked && (
              <motion.path
                d={beam.d}
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="9 91"
                className="text-ember"
                initial={{ strokeDashoffset: 100, opacity: 0 }}
                animate={
                  flying
                    ? { strokeDashoffset: [100, 0], opacity: [0, 1, 1, 0] }
                    : { strokeDashoffset: 100, opacity: 0 }
                }
                transition={{ duration: 1.45, ease: EASE_IN_OUT, times: [0, 0.1, 0.86, 1] }}
              />
            )}
            {/* End caps: the two addresses on the wire. */}
            <motion.circle
              cx={beam.start.x}
              cy={beam.start.y}
              r={3.5}
              className="fill-ember"
              initial={false}
              animate={{ opacity: linked ? 1 : 0, scale: linked ? 1 : 0.6 }}
              transition={{ duration: 0.4, ease: EASE, delay: linked ? 0.55 : 0 }}
              style={{ transformOrigin: `${beam.start.x}px ${beam.start.y}px` }}
            />
            <motion.circle
              cx={beam.end.x}
              cy={beam.end.y}
              r={3.5}
              className="fill-ember"
              initial={false}
              animate={{ opacity: linked ? 1 : 0, scale: linked ? 1 : 0.6 }}
              transition={{ duration: 0.4, ease: EASE, delay: linked ? 0.65 : 0 }}
              style={{ transformOrigin: `${beam.end.x}px ${beam.end.y}px` }}
            />
          </svg>
        )}

        {/* The window: the sender's room, crowded up into the top-left. */}
        {variant !== 'phone' && (
          <motion.div
            className={cn(
              'absolute z-20',
              stacked
                ? 'left-[2%] top-0 w-[86%]'
                : cn('left-[6%] top-[11%]', roomy ? 'w-[54%]' : 'w-[62%] top-[9%]'),
            )}
            style={{ rotateX: tiltWindowX, rotateY: tiltWindowY, transformPerspective: 1100 }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[6%] -bottom-[10px] h-[22px] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(20,16,10,0.20),transparent_72%)] blur-[7px] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6),transparent_72%)]"
            />
            <LaptopFrame label={t('demo.laptopAlt')}>
              <div ref={windowRef} className="h-full w-full">
                <RoomWindow
                  linked={linked}
                  sent={sent}
                  arrived={arrived}
                  closed={closed}
                  compact={stacked || (geom?.a.w ?? 999) < 320}
                />
              </div>
            </LaptopFrame>
          </motion.div>
        )}

        {/* The packet: a file card that leaves the composer and lands as a
            bubble. Transform-only, and it dissolves into the thing that
            receives it — the hand-off reads as one event, not two. */}
        {variant !== 'phone' && beam && (
          <motion.div
            aria-hidden
            key={`packet-${beat}-${phase}`}
            className="pointer-events-none absolute left-0 top-0 z-30"
            initial={false}
            animate={
              flying
                ? {
                    x: [beam.start.x, beam.mid.x, beam.end.x],
                    y: [beam.start.y, beam.mid.y, beam.end.y],
                    opacity: [0, 1, 1, 1],
                    scale: [0.92, 1.04, 0.92, 0.86],
                  }
                : { x: arrived ? beam.end.x : beam.start.x, y: arrived ? beam.end.y : beam.start.y, opacity: 0, scale: 0.9 }
            }
            transition={
              flying
                ? { duration: 1.45, ease: EASE_IN_OUT, times: [0, 0.12, 0.8, 1] }
                : { duration: 0.2, ease: EASE }
            }
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-1.5 rounded-[9px] border border-black/[0.06] bg-white/95 py-[5px] pl-[5px] pr-2 shadow-[0_10px_24px_-10px_rgba(20,16,10,0.6)] backdrop-blur-sm dark:border-white/10 dark:bg-night-800/95">
                <span className="flex h-[17px] w-[17px] items-center justify-center rounded-[6px] bg-ember text-[7px] font-bold leading-none text-white">PDF</span>
                <span className="text-[10px] font-semibold leading-none text-apple-ink dark:text-white">plan.pdf</span>
                <SpinLoader size={10} className="text-ember" />
              </div>
            </div>
          </motion.div>
        )}

        {/* The phone: the receiver, larger than life, cropped by the floor. */}
        <motion.div
          className={cn(
            'absolute z-20',
            variant === 'phone'
              ? 'inset-0'
              : stacked
                ? 'bottom-0 left-[28%] w-[44%]'
                : roomy
                  ? 'bottom-[6%] right-[6%] w-[25%]'
                  : 'bottom-[5%] right-[4%] w-[23%]',
          )}
          style={
            variant === 'phone'
              ? undefined
              : { rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }
          }
        >
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[10%] -bottom-[8px] h-[18px] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(20,16,10,0.24),transparent_70%)] blur-[6px] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.65),transparent_70%)]"
            />
            <div ref={phoneRef}>
              <PhoneFrame label={t('demo.phoneAlt')}>
                <PhoneScreen
                  joined={linked}
                  typing={phase === 'connecting'}
                  flying={flying}
                  arrived={arrived}
                  closed={closed}
                  bump={arrived ? beat : 0}
                />
              </PhoneFrame>
            </div>
          </div>
        </motion.div>

        {/* On the panel the words live inside the frame, bottom-left, under
            the window — the phone owns the bottom-right, so the composition
            runs diagonally instead of a device picture with a caption
            stapled underneath it. */}
        {panel && (
          <div className="pointer-events-none absolute bottom-[7%] left-[6%] z-40 w-[46%]">
            {captionBlock}
            <div className="pointer-events-auto">{railBlock}</div>
          </div>
        )}
      </div>

      {/* Below the stage, the words say what the picture just did. */}
      {!panel && railBlock}
      {!panel && captionBlock}

      {/* The control belongs to the picture, so it sits under it — never
          inside the frame, where it would eat the composition. */}
      {reduced && <div className="mt-4 flex justify-center">{restartNode}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   The two surfaces
   ──────────────────────────────────────────────────────────────────────── */

/** The six digits, as the app shows them: one tile each. Sized for the
 *  surface it sits on rather than one compromised size for both. */
function PairCode({
  filled,
  size = 'md',
  highlight = false,
  stagger = false,
}: {
  filled: number;
  size?: 'sm' | 'md';
  /** The sender's code is the beat's focal point: it gets an ember ring. */
  highlight?: boolean;
  /** Light the tiles one at a time — the joiner typing the code in. */
  stagger?: boolean;
}) {
  return (
    <div className={cn('grid grid-cols-6', size === 'md' ? 'gap-[3px]' : 'gap-[3px]')}>
      {CODE.map((d, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            style={{ transitionDelay: `${stagger && on ? i * 150 : 0}ms` }}
            className={cn(
              'flex items-center justify-center rounded-[5px] font-semibold tabular-nums transition-colors duration-300',
              size === 'md' ? 'h-[19px] text-[10px]' : 'h-[17px] text-[9.5px]',
              on
                ? cn(
                    'bg-white dark:bg-white/[0.10]',
                    highlight
                      ? 'ring-1 ring-ember/45 dark:ring-ember/40'
                      : 'ring-1 ring-apple-divider/80 dark:ring-white/[0.14]',
                  )
                : 'bg-black/[0.055] ring-1 ring-transparent dark:bg-white/[0.06]',
            )}
          >
            {on && (
              <motion.span
                initial={{ opacity: 0, y: -2, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: stagger ? i * 0.15 : 0, type: 'spring', stiffness: 520, damping: 28 }}
              >
                {d}
              </motion.span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * RoomWindow — the sender's room as a desktop app window.
 *
 * A window, not a dashboard: traffic lights, the room it is in, the payload
 * and the composer. Everything else (the sidebar the old scene had) was the
 * miniature's problem — a crop is what makes the type legible.
 */
function RoomWindow({
  compact = false,
  linked, sent, arrived, closed,
}: {
  linked: boolean;
  sent: boolean;
  arrived: boolean;
  closed: boolean;
  /** The stacked composition gives the window a shorter screen; the payload
   *  has to fit inside it, so the file chip draws at its small size. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const note = t('demo.note');

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white text-apple-ink dark:bg-night-900 dark:text-white">
      {/* Title bar */}
      <div className="flex h-[27px] shrink-0 items-center gap-2 border-b border-black/[0.07] bg-apple-parchment/70 px-2.5 dark:border-white/[0.07] dark:bg-white/[0.03]">
        <span className="flex items-center gap-[4.5px]">
          <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[#febc2e]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-1 flex min-w-0 items-center gap-1.5">
          <ShareTextsLogo size={11} />
          <span className="truncate font-display text-[10px] font-bold tracking-[-0.02em]">ShareTexts</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <AnimatePresence initial={false}>
            {linked && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="flex items-center gap-[3px] rounded-full bg-status-success/12 px-1.5 py-[2px] text-[8px] font-semibold text-status-success-ink dark:bg-status-success/15 dark:text-status-success-ink-dark"
              >
                <span className="h-[4px] w-[4px] rounded-full bg-status-success" />
                2
              </motion.span>
            )}
          </AnimatePresence>
          <span className="flex items-center gap-[3px] rounded-full bg-black/[0.05] px-1.5 py-[3px] text-[8px] font-semibold text-apple-ink-muted dark:bg-white/[0.07] dark:text-white/55">
            <Lock className="h-[7px] w-[7px]" />
            {t('demo.encrypted')}
          </span>
        </span>
      </div>

      {/* Room header: the code is the only thing this window has to explain. */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-black/[0.05] px-3 py-1.5 dark:border-white/[0.06]">
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold leading-tight">{t('demo.room')}</span>
          <span className="block truncate text-[8.5px] leading-tight text-apple-ink-muted dark:text-white/40">
            {linked ? t('demo.twoDevices') : t('demo.oneDevice')}
          </span>
        </span>
        <span className="ml-auto w-[104px] shrink-0">
          <PairCode filled={6} highlight={!linked} />
        </span>
      </div>

      {/* Thread */}
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-3 py-1">
        <AnimatePresence initial={false}>
          {!sent ? (
            <motion.div
              key="starters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="flex flex-1 flex-col items-center justify-center gap-1.5"
            >
              <div className="flex flex-wrap items-center justify-center gap-1">
                {(['chat.suggest.hi', 'chat.suggest.photo', 'chat.suggest.link'] as MsgKey[]).map((k) => (
                  <span
                    key={k}
                    className="flex h-[20px] items-center rounded-full border border-black/[0.07] bg-white px-2 text-[9.5px] font-semibold text-apple-ink/65 shadow-[0_1px_2px_rgba(20,16,10,0.04)] dark:border-white/[0.10] dark:bg-white/[0.05] dark:text-white/60"
                  >
                    {t(k)}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="payload"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="flex shrink-0 flex-col items-end gap-1"
            >
              <span className="max-w-[78%] rounded-[11px] rounded-br-[3px] bg-ember px-2.5 py-1 text-[11px] leading-snug text-white shadow-[0_3px_10px_-4px_rgba(240,100,19,0.6)]">
                {note}
              </span>
              <FileChip arrived={arrived} compact={compact} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Composer — the payload, composed and waiting. */}
      <div className="shrink-0 border-t border-black/[0.06] px-2.5 py-2 dark:border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-black/[0.045] px-2.5 py-[6px] dark:bg-white/[0.06]">
            <Paperclip className="h-[10px] w-[10px] shrink-0 text-apple-ink-muted dark:text-white/40" />
            <span className="min-w-0 flex-1 truncate text-[11px] leading-none">
              {sent ? (
                <span className="text-apple-ink-muted dark:text-white/35">{t('demo.placeholder')}</span>
              ) : (
                note
              )}
            </span>
            {!sent && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-ember/10 px-1.5 py-[3px] text-[8.5px] font-semibold leading-none text-ember dark:bg-ember/[0.16] dark:text-azure-400">
                plan.pdf
              </span>
            )}
          </span>
          <motion.span
            animate={
              sent
                ? { scale: 1, backgroundColor: 'rgba(20,18,14,0.16)' }
                : { scale: [1, 1.06, 1], backgroundColor: '#f06413' /* motion literal: framer cannot tween var() */ }
            }
            transition={
              sent
                ? { type: 'spring', stiffness: 380, damping: 26 }
                : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
            }
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-white"
          >
            <PaperPlane className="h-[11px] w-[11px]" />
          </motion.span>
        </div>
      </div>

      <RoomClosedVeil closed={closed} />
    </div>
  );
}

function PhoneScreen({
  joined, typing, flying, arrived, closed, bump,
}: {
  joined: boolean;
  typing: boolean;
  flying: boolean;
  arrived: boolean;
  closed: boolean;
  /** Bumps on every arrival: one small physical tick, not a shake. */
  bump: number;
}) {
  const { t } = useI18n();

  return (
    <div className="relative h-full w-full bg-apple-canvas dark:bg-night-900">
      <motion.div
        key={`bump-${bump}`}
        animate={bump ? { y: [0, 1.5, 0] } : { y: 0 }}
        transition={{ duration: 0.34, ease: [0.3, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
        className="flex h-full w-full flex-col"
      >
        <PhoneStatusBar />

        <AnimatePresence mode="popLayout" initial={false}>
          {!joined ? (
            <motion.div
              key="join"
              initial={false}
              exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
              transition={{ duration: 0.24, ease: EASE }}
              className="flex min-h-0 flex-1 flex-col justify-center px-[7%] pb-[8%]"
            >
              <div className="flex items-center gap-1 pb-[6%]">
                <span className="font-display text-[9px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white">ShareTexts</span>
              </div>
              <span className="text-[11px] font-semibold leading-tight text-apple-ink dark:text-white">{t('demo.joinTitle')}</span>
              <span className="mt-1 text-[8.5px] leading-tight text-apple-ink-muted dark:text-white/45">{t('demo.joinHint')}</span>
              <div className="mt-[7%]">
                <PairCode filled={typing ? 6 : 0} size="sm" stagger />
              </div>
              <span
                className={cn(
                  'mt-[8%] flex items-center justify-center rounded-full py-[6px] text-[9px] font-semibold transition-colors duration-300',
                  typing
                    ? 'bg-ember text-white'
                    : 'bg-black/[0.06] text-apple-ink-muted dark:bg-white/[0.07] dark:text-white/40',
                )}
              >
                {t('demo.join')}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="room"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center gap-1.5 border-b border-apple-divider/70 px-[7%] py-[4%] dark:border-white/[0.07]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-semibold leading-tight text-apple-ink dark:text-white">{t('demo.room')}</span>
                  <span className="flex items-center gap-[3px] text-[8px] leading-tight text-status-success-ink dark:text-status-success-ink-dark">
                    <span className="h-[4px] w-[4px] rounded-full bg-status-success" />
                    {t('demo.connected')}
                  </span>
                </span>
                <span className="h-[4px] w-[4px] rounded-full bg-apple-ink-muted/40 dark:bg-white/30" />
                <span className="h-[4px] w-[4px] rounded-full bg-apple-ink-muted/40 dark:bg-white/30" />
              </div>

              {/* Thread */}
              <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-[6%] py-[5%]">
                <AnimatePresence initial={false}>
                  {flying && (
                    <motion.span
                      key="receiving"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mb-1 flex items-center gap-1 self-center rounded-full bg-white px-2 py-[3px] text-[8px] font-medium text-apple-ink-muted shadow-[0_1px_3px_rgba(20,16,10,0.08)] dark:bg-white/[0.08] dark:text-white/60"
                    >
                      <SpinLoader size={8} className="text-ember" />
                      {t('demo.receiving')}
                    </motion.span>
                  )}
                  {arrived && (
                    <>
                      <motion.span
                        key="note-in"
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 29 }}
                        className="max-w-[88%] self-start rounded-[11px] rounded-bl-[3px] bg-white px-2.5 py-1.5 text-[10.5px] leading-snug text-apple-ink shadow-[0_2px_6px_-2px_rgba(20,16,10,0.14)] dark:bg-white/[0.09] dark:text-white"
                      >
                        {t('demo.note')}
                      </motion.span>
                      <motion.div
                        key="file-in"
                        initial={{ opacity: 0, y: 10, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 29, delay: 0.07 }}
                        className="self-start"
                      >
                        <FileChip side="in" compact />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer */}
              <div className="flex shrink-0 items-center gap-1.5 border-t border-apple-divider/70 px-[6%] py-[4%] dark:border-white/[0.07]">
                <span className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-black/[0.045] px-2 py-[5px] text-[8.5px] text-apple-ink-muted dark:bg-white/[0.06] dark:text-white/35">
                  <Paperclip className="h-[8px] w-[8px] shrink-0" />
                  <span className="truncate">{t('demo.placeholder')}</span>
                </span>
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-black/[0.08] text-apple-ink-muted dark:bg-white/[0.09] dark:text-white/40">
                  <PaperPlane className="h-[9px] w-[9px]" />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <RoomClosedVeil closed={closed} />
    </div>
  );
}

/**
 * The file the story sends — one component, both sides of the transfer.
 *
 * `side="out"` carries the live states (spinner in flight, tick after) and
 * wears the sender's ember; `side="in"` is the same object after it landed,
 * quiet and tick-free — a receiver does not need to be told it worked twice.
 * Same geometry on both ends, so the hand-off reads as one object that moved
 * rather than two that resemble each other.
 */
function FileChip({
  arrived = false,
  side = 'out',
  compact = false,
}: {
  arrived?: boolean;
  side?: 'out' | 'in';
  compact?: boolean;
}) {
  const out = side === 'out';
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 shadow-[0_2px_8px_-3px_rgba(20,16,10,0.3)]',
        out ? 'bg-ember text-white' : 'bg-white text-apple-ink dark:bg-white/[0.09] dark:text-white',
        compact
          ? 'rounded-[11px] rounded-bl-[3px] px-2 py-1.5'
          : 'rounded-[11px] rounded-br-[3px] px-2.5 py-[7px]',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-[5px] font-bold leading-none',
          compact ? 'h-[15px] w-[15px] text-[6px]' : 'h-[17px] w-[17px] text-[6.5px]',
          out ? 'bg-white/25' : 'bg-ember/12 text-ember',
        )}
      >
        PDF
      </span>
      <span className={cn('font-semibold leading-none', compact ? 'text-[9.5px]' : 'text-[10.5px]')}>plan.pdf</span>
      {/* No invented byte count — this is a controlled demo, not a transfer
          log. The sender's chip says what the state IS; the receiver's says
          nothing, because arrival is already told by the thread. */}
      {out && (
        <AnimatePresence mode="wait" initial={false}>
          {arrived ? (
            <motion.span key="tick" className="flex leading-none" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
              <CheckDouble className={compact ? 'h-[9px] w-[9px]' : 'h-[10px] w-[10px]'} />
            </motion.span>
          ) : (
            <motion.span key="ring" className="flex leading-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SpinLoader size={compact ? 9 : 10} />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </span>
  );
}

/** The done beat: the room empties and dims — nothing is kept. A RESTING
 *  veil, not a whiteout: the room stays legible while the pill does the
 *  talking, and the loop reopens the machine from `open`. */
function RoomClosedVeil({ closed }: { closed: boolean }) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {closed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute inset-0 flex items-center justify-center bg-apple-canvas/45 dark:bg-night-950/55"
        >
          {/* Dark side: a white stamp needs INK-dark text — but
              --color-apple-ink FLIPS to near-white inside .dark, so the token
              here is the canvas (which stays at the night-page value in dark
              scope). text-apple-ink here rendered white-on-white. */}
          <span className="rounded-full bg-apple-ink/85 px-2.5 py-1 text-[9px] font-semibold text-white dark:bg-white/90 dark:text-apple-canvas">
            {t('demo.closed')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HeroDeviceDemo;
