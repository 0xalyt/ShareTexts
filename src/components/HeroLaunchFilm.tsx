import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Download, Pause, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import './landing/hero-film.css';

type Connection = EventTarget & { saveData?: boolean };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
const MOVIE = '/film/sharetexts-launch-v2.mp4';
const FULL_MOVIE = '/film/sharetexts-launch-v2-full.mp4';
const POSTER = '/film/sharetexts-launch-v2-poster.jpg';

/** Pre-rendered film; no media request until visible. Motion/data preferences
 * require explicit play. Visibility pauses preserve the visitor's choice. */
export function HeroLaunchFilm({ className }: { className?: string }) {
  const { t } = useI18n();
  const summaryId = useId();
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saveData, setSaveData] = useState(() => Boolean(connection()?.saveData));
  const [choice, setChoice] = useState<'auto' | 'play' | 'pause'>('auto');
  const [loaded, setLoaded] = useState(false);
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
  useEffect(() => {
    const el = video.current;
    if (!el || !loaded || !shouldPlay) { el?.pause(); return; }
    void el.play().catch(() => setPlaying(false));
    return () => el.pause();
  }, [loaded, shouldPlay]);

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
        <video ref={video} src={loaded ? MOVIE : undefined} poster={POSTER}
          muted loop playsInline preload="none" width="1440" height="810"
          aria-label={t('film.title')} aria-describedby={summaryId}
          onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }} />
        {failed && <img className="hero-film-fallback" src={POSTER} alt="" width="1440" height="810" />}
        {!failed && <button className="hero-film-play" type="button" onClick={toggle} aria-label={t(playing ? 'film.pause' : 'film.play')} title={t(playing ? 'film.pause' : 'film.play')}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>}
      </div>
      <figcaption className="hero-film-caption">
        <span className="hero-film-eyebrow">{t('film.label')}</span>
        <p id={summaryId} className="sr-only">{t('film.summary')}</p>
        <div className="hero-film-actions">
          <a className="hero-film-watch" href={FULL_MOVIE} target="_blank" rel="noreferrer">{t('film.watch')}<ArrowUpRight aria-hidden="true" /></a>
          <a className="hero-film-download" href={FULL_MOVIE} download="ShareTexts-launch.mp4" aria-label={t('film.download')} title={t('film.download')}><Download aria-hidden="true" /></a>
        </div>
      </figcaption>
    </figure>
  );
}
