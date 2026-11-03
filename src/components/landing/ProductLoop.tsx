/* Product loops — the real product, recorded, played only when it is worth
 * playing.
 *
 * DESIGN.md §20b: poster first; muted, loop, playsinline; preload="none"; plays
 * only while at least 50% visible; pauses when hidden; under
 * prefers-reduced-motion or Save-Data the poster is the final state and nothing
 * downloads; width and height always set so the section never shifts.
 *
 * The media itself is written by scripts/record-loops.mjs into
 * public/media/loops/ and announced here through src/lib/loops.generated.ts, so
 * "the recording is missing" is a build-time fact (null) rather than a broken
 * <video> on the page. A story with no recording yet renders its words alone.
 */
import { useEffect, useRef, useState } from 'react';
import { LOOPS, type LoopName } from '../../lib/loops.generated';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Save-Data means the visitor asked for fewer bytes; a loop is the first
 *  thing to drop. */
function saveDataOn(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return Boolean(c?.saveData);
  } catch {
    return false;
  }
}

export function ProductLoop({ name, label }: { name: LoopName; label: string }) {
  const loop = LOOPS[name];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(false);
  const [staticOnly] = useState(() => prefersReducedMotion() || saveDataOn());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (staticOnly || !loop) return;
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.intersectionRatio >= 0.5);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [staticOnly, loop]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (inView && !staticOnly) {
      // The bytes are fetched here — not on mount — so nothing loads before
      // the visitor scrolls near the section.
      if (!ready) {
        el.preload = 'auto';
        setReady(true);
      }
      void el.play().catch(() => { /* autoplay refused: the poster stays */ });
    } else {
      el.pause();
    }
  }, [inView, staticOnly, ready]);

  if (!loop) return null;

  return (
    <div
      className="relative overflow-hidden rounded-[16px] border border-black/[0.08] bg-apple-parchment dark:border-white/[0.10] dark:bg-white/[0.04]"
      style={{ aspectRatio: `${loop.width} / ${loop.height}` }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        width={loop.width}
        height={loop.height}
        poster={loop.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
      >
        <source src={loop.webm} type="video/webm" />
        <source src={loop.mp4} type="video/mp4" />
      </video>
    </div>
  );
}
