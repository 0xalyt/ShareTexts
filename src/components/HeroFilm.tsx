import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

/**
 * HeroFilm — the landing hero, as film.
 *
 * A muted, looping 16:9 cut of the real product rather than a live DOM scene:
 * the film carries camera moves, rack focus, sound design and a timed story
 * that a looping component cannot, and it costs the main thread nothing while
 * it plays.
 *
 * Three behaviours matter more than the markup:
 *
 *   · it plays ONLY while it is on screen. A hero video that keeps decoding
 *     after you scroll past it is a battery tax on every visitor for nothing.
 *   · reduced motion gets the poster, not a paused frame 0. Someone who asked
 *     for stillness should see the product working, and a poster of the
 *     payload mid-flight says more than an empty opening frame.
 *   · `muted` + `playsInline` are load-bearing, not decoration: without both,
 *     iOS refuses to autoplay and Safari opens a fullscreen player.
 *
 * The web encode has no audio track (the hero is muted by policy, so shipping
 * 3.4 MB of unheard voiceover would be waste). The full film with sound lives
 * in film/out for anywhere that can play it deliberately.
 */
export function HeroFilm({ className }: { className?: string }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (reduced) {
      el.pause();
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      void el.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      data-testid="hero-demo"
      data-state="film"
      className={cn(
        // Corners are deliberately tight: the film inside is a photograph of a
        // laptop on a desk, and a 26px radius made the whole hero read as a
        // rounded card with a video pasted in it. 10px keeps the frame crisp at
        // every width without turning into a sharp rectangle.
        'relative w-full overflow-hidden rounded-[10px] bg-[#0b0908]',
        'ring-1 ring-black/45 shadow-[0_50px_90px_-54px_rgba(20,16,10,0.66),0_14px_30px_-24px_rgba(20,16,10,0.42)]',
        'dark:ring-white/[0.07] dark:shadow-[0_60px_100px_-52px_rgba(0,0,0,0.9)]',
        className,
      )}
    >
      <video
        ref={videoRef}
        className="block aspect-video w-full select-none"
        src="/film/sharetexts-hero.mp4"
        poster="/film/sharetexts-hero-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-label={t('demo.title')}
      />
    </div>
  );
}

export default HeroFilm;
