/**
 * TransferFlight — the flagship moment: during a real send, a compact file
 * tile visibly travels across the room from this device's side to the other
 * device's side, its position driven by actual byte progress (not a decoy).
 *
 * Design language: restrained and physical — one small object, a soft shadow,
 * a gentle mid-flight scale swell, a faint progress line growing from the
 * sender's side. No beams, no particles.
 *
 * Motion rules (per the animate skill):
 *  - tool: Motion (already the app's animation system; MotionConfig
 *    reducedMotion="user" globally disables the transform travel for
 *    users who prefer reduced motion — opacity fades remain).
 *  - properties: transform (translate3d + scaleX) and opacity only — the
 *    overlay is position:fixed, so nothing in the feed reflows while it
 *    flies.
 *  - curve: strong ease-in-out for on-screen movement; each progress tick
 *    RETARGETS the transition from the current value, so fast or slow
 *    transfers both stay smooth and the flight never restarts.
 *  - exits: complete → the object settles into the receiver's card
 *    (shrink + fade); cancel/disconnect → it fades away mid-path.
 */
import { motion } from 'motion/react';
import { useMotionPreference } from '../lib/useMotionPreference';
import { useEffect, useState, type RefObject } from 'react';
import { FileText } from 'lucide-react';
import { DUR, EASE, SPRING } from '../lib/motion/tokens';

const CHIP_W = 148;
const CHIP_H = 40;
/** Band height above the feed bottom — where the newest card lands. */
const BAND_OFFSET = 92;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

interface TransferFlightProps {
  /** The message feed container — its rect defines the travel track. */
  feedRef: RefObject<HTMLDivElement | null>;
  /** Real byte progress 0..1. */
  progress: number;
  /** true when we are the receiver — the tile travels partner → us. */
  reverse: boolean;
  name: string;
  size: number;
}

/** Conic progress ring around the traveling object's icon tile — the
 *  object itself carries the real byte progress, so "how far along" is
 *  readable from the moving thing, not only the faint track line.
 *  Rotation-only + opacity (compositor-safe); 0/1 collapse to a full ring
 *  only at 100%, otherwise a hairline base ring shows the remainder. */
function ProgressRing({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const deg = Math.round(p * 360);
  return (
    <span aria-hidden className="absolute -inset-[3px] rounded-[12px] pointer-events-none">
      {/* base: the not-yet-traveled remainder, whisper-faint */}
      <span
        className="absolute inset-0 rounded-[12px]"
        style={{
          background: `conic-gradient(rgba(240,100,19,0.14) 0deg ${deg}deg, rgba(240,100,19,0.05) ${deg}deg 360deg)`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1.5px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1.5px))',
        }}
      />
      {p >= 1 && (
        <span
          className="absolute inset-0 rounded-[12px]"
          style={{
            background: 'conic-gradient(var(--color-status-success) 0deg 360deg)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1.5px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1.5px))',
          }}
        />
      )}
    </span>
  );
}

export function TransferFlight({ feedRef, progress, reverse, name, size }: TransferFlightProps) {
  const reduced = useMotionPreference();
  const [track, setTrack] = useState<{ from: number; to: number; y: number } | null>(null);

  // Measure the feed once (and on resize): x0 = partner side (left), x1 =
  // this device's side (right). Fixed positioning means scrolling the feed
  // never shifts the flight — no layout work while bytes move.
  useEffect(() => {
    const measure = () => {
      const el = feedRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < CHIP_W + 16) { setTrack(null); return; }
      // Endpoints describe the tile's CENTRE, not its outside edge. The whole
      // object must stay in the feed, even at 0/100% on a narrow phone.
      setTrack({
        from: r.left + 8 + CHIP_W / 2,
        to: r.right - 8 - CHIP_W / 2,
        y: Math.max(r.top + CHIP_H / 2 + 16, r.bottom - BAND_OFFSET),
      });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (feedRef.current) observer?.observe(feedRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [feedRef]);

  if (!track) return null;

  // Travel endpoints: a send leaves from our side (right) toward the
  // partner (left); a receive comes from the partner (left) to us (right).
  const start = reverse ? track.from : track.to;
  const end = reverse ? track.to : track.from;
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const x = start + (end - start) * p;
  const arc = -16 * Math.sin(Math.PI * p);
  // Gentle mid-flight swell — the object approaches, then settles.
  const swell = 1 + 0.05 * Math.sin(Math.PI * p);
  const width = track.to - track.from;
  // The progress line grows FROM the sender's side toward the receiver.
  const lineOrigin = reverse ? 'left' : 'right';

  return (
    <>
      {/* Faint connection line, filled by real progress (transform only). */}
      {!reduced && <motion.div
        aria-hidden
        data-testid="transfer-line"
        className="fixed z-20 pointer-events-none"
        style={{ left: track.from, top: track.y, transformOrigin: lineOrigin }}
        initial={false}
        animate={{ scaleX: p }}
        transition={{ type: 'spring', ...SPRING.snap }}
      >
        <div className="h-px bg-ember/25 dark:bg-azure-400/25" style={{ width }} />
      </motion.div>}

      {/* The traveling object. */}
      <motion.div
        aria-hidden
        data-testid="transfer-flight"
        className="fixed z-30 pointer-events-none"
        // Keep layout placement separate from animated travel. Globally
        // suppressed transforms must never move the tile to viewport (0,0).
        style={{ left: (reduced ? (track.from + track.to) / 2 : track.from) - CHIP_W / 2, top: track.y - CHIP_H / 2, width: CHIP_W }}
        initial={false}
        animate={reduced ? { x: 0, y: 0 } : { x: x - track.from, y: arc }}
        transition={reduced ? { duration: 0 } : { type: 'spring', ...SPRING.snap }}
      >
        <motion.div
          variants={{
            fly: { opacity: 1, scale: 1 },
            settle: { opacity: 0, scale: 0.9 },
            fade: { opacity: 0, scale: 0.86 },
          }}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
          animate={{ opacity: 1, scale: reduced ? 1 : swell }}
          exit={(custom: unknown) => (custom === 'settle' ? 'settle' : 'fade')}
          transition={{ duration: DUR.short / 1000, ease: EASE.out }}
          style={{ height: CHIP_H }}
          className="relative flex items-center gap-2 pl-1.5 pr-2 rounded-[12px] bg-white dark:bg-apple-tile-2 border border-apple-divider dark:border-white/10 shadow-[0_10px_28px_rgba(15,18,32,0.16)]"
        >
          <span className="relative w-7 h-7 rounded-[8px] bg-ember/12 dark:bg-azure-400/14 flex items-center justify-center shrink-0">
            <ProgressRing progress={p} />
            <FileText className="w-3.5 h-3.5 text-brand-strong dark:text-azure-400" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-apple-ink dark:text-white" title={name}>{name}</span>
          <span className="text-[12px] font-medium text-apple-ink-muted/70 dark:text-white/40 whitespace-nowrap tnum">{formatBytes(size)}</span>
        </motion.div>
      </motion.div>
    </>
  );
}