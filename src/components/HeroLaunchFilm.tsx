import React, { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { heroFilmAssets, heroFilmDarkAssets, heroFilmPhoneMedia } from '../lib/heroFilmAssets';
import './landing/hero-film.css';

type Connection = EventTarget & { saveData?: boolean };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
// Observe what is actually painted, not a second independent theme choice.
// This follows saved overrides, live OS changes and the app's theme switch.
const darkTheme = () => document.documentElement.classList.contains('dark');
const subscribeTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const phoneFraming = () => window.matchMedia(heroFilmPhoneMedia).matches;
const subscribeFraming = (notify: () => void) => {
  const media = window.matchMedia(heroFilmPhoneMedia);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

// The landing swaps its mobile/desktop trees. Keep only playback intent and
// position in their common parent, so a layout change cannot restart a film.
export type HeroFilmPlayback = { phase: number; choice: 'auto' | 'play' | 'pause'; loaded: boolean };

/** Pre-rendered film; no media request until visible. Motion/data preferences
 * require explicit play. Visibility pauses preserve the visitor's choice. */
export function HeroLaunchFilm({ className, playback }: { className?: string; playback: React.RefObject<HeroFilmPlayback> }) {
  const dark = useSyncExternalStore(subscribeTheme, darkTheme, () => false);
  const phone = useSyncExternalStore(subscribeFraming, phoneFraming, () => false);
  const assets = dark ? heroFilmDarkAssets : heroFilmAssets;
  const { movie: MOVIE, poster: POSTER } = phone ? assets.mobile : assets;
  const dimensions = { width: phone ? 960 : 1440, height: phone ? 720 : 810 };
  const { t } = useI18n();
  const summaryId = useId();
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const restoredVideo = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saveData, setSaveData] = useState(() => Boolean(connection()?.saveData));
  const [choice, setChoice] = useState(() => playback.current.choice);
  const [loaded, setLoaded] = useState(() => playback.current.loaded);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const permitted = choice === 'play' || (choice === 'auto' && !reduced && !saveData);
  const shouldPlay = visible && pageVisible && permitted && !failed;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resetOverride = () => setChoice(previous => previous === 'pause' ? 'pause' : 'auto');
    const motion = () => { setReduced(mq.matches); resetOverride(); };
    const data = () => { setSaveData(Boolean(connection()?.saveData)); resetOverride(); };
    const visibility = () => setPageVisible(!document.hidden);
    mq.addEventListener('change', motion);
    connection()?.addEventListener('change', data);
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: [0, 0.25] },
    );
    if (root.current && observer) observer.observe(root.current);
    if (!observer) setVisible(true);
    return () => {
      mq.removeEventListener('change', motion);
      connection()?.removeEventListener('change', data);
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => { if (shouldPlay) setLoaded(true); }, [shouldPlay]);
  useLayoutEffect(() => {
    playback.current.choice = choice;
    playback.current.loaded = loaded;
  }, [choice, loaded, playback]);
  useLayoutEffect(() => {
    const previous = video.current;
    // One resize can swap the cut and then the entire landing tree. An
    // intermediate, not-yet-restored video must not replace the saved phase.
    return () => { if (previous && restoredVideo.current === previous) playback.current.phase = previous.currentTime; };
  }, [MOVIE, playback]);
  useEffect(() => { setFailed(false); setPlaying(false); }, [MOVIE]);
  useEffect(() => {
    const el = video.current;
    if (!el || !loaded || !shouldPlay) { el?.pause(); return; }
    void el.play().catch(() => setPlaying(false));
    return () => el.pause();
  }, [loaded, shouldPlay, MOVIE]);

  const toggle = () => {
    if (playing) { setChoice('pause'); video.current?.pause(); }
    else {
      setChoice('play');
      // Retry a browser-blocked play inside the gesture, even if choice was
      // already play. Autoplay rejection must never create a dead button.
      if (loaded) void video.current?.play().catch(() => setPlaying(false));
    }
  };

  return (
    <figure ref={root} className={cn('hero-film', className)} data-testid="hero-demo" data-state="film" aria-label={t('film.title')}>
      <div className="hero-film-picture">
        <video key={MOVIE} ref={video} src={loaded ? MOVIE : undefined} poster={POSTER}
          muted loop playsInline preload={loaded ? 'metadata' : 'none'} {...dimensions}
          aria-label={t('film.title')} aria-describedby={summaryId}
          onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={event => {
            const el = event.currentTarget;
            const phase = playback.current.phase;
            if (phase > 0 && el.duration > 0) el.currentTime = phase % el.duration;
            restoredVideo.current = el;
          }}
          onError={() => { setFailed(true); setPlaying(false); }} />
        {failed && <img className="hero-film-fallback" src={POSTER} alt="" {...dimensions} />}
      </div>
      <div className="hero-film-controls">
        {!failed && <button className="hero-film-play" type="button" onClick={toggle} aria-label={t(playing ? 'film.pause' : 'film.play')} title={t(playing ? 'film.pause' : 'film.play')}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>}
      </div>
      <figcaption id={summaryId} className="sr-only">
        {t('film.summary')}
      </figcaption>
    </figure>
  );
}
