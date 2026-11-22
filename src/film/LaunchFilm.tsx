import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { createBlenderStage } from './BlenderStage';
import './launch-film.css';

export const LAUNCH_DURATION = 16.8;
export const filmEase = (t: number, start: number, duration: number) => {
  const p = Math.max(0, Math.min(1, (t - start) / duration));
  return p * p * p * (p * (p * 6 - 15) + 10);
};

/** Offline only. Real product footage, physical camera moves, encoded delivery. */
export function LaunchFilm() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0);
  const dark = new URLSearchParams(location.search).get('theme') === 'dark';
  useEffect(() => {
    let alive = true;
    let stage: Awaited<ReturnType<typeof createBlenderStage>> | undefined;
    document.documentElement.classList.toggle('dark', dark);
    void createBlenderStage(canvas.current!, dark).then(value => {
      stage = value;
      if (!alive) { value.dispose(); return; }
      window.__film = async next => {
        const t = next >= LAUNCH_DURATION ? 0 : Math.max(0, next);
        flushSync(() => setTime(t));
        await value.seek(t);
      };
    }).catch(error => { setTimeout(() => { throw error; }); });
    return () => { alive = false; stage?.dispose(); delete window.__film; };
  }, [dark]);
  const intro = 1 - filmEase(time, .55, .25) + filmEase(time, 16.2, .6);
  const end = filmEase(time, 15.0, .6) * (1 - filmEase(time, 16.2, .6));
  const chapter = time >= .8 && time < 4.4 ? 'Text & links'
    : time >= 4.4 && time < 9.35 ? 'Files & photos'
    : time >= 9.35 && time < 13.8 ? 'Videos' : '';
  const chapterStart = time < 4.4 ? .8 : time < 9.35 ? 4.4 : 9.35;
  const alpha = chapter ? filmEase(time, chapterStart, .18) : 0;
  return <div className="launch-stage native-film" data-film-time={time}>
    <canvas ref={canvas} className="native-film-hardware" />
    <div className="native-film-intro" style={{ opacity: intro }}><span>Text.</span><span>Files.</span><span>Videos.</span></div>
    <div className="native-film-chapter" style={{ opacity: alpha, transform: `translateY(${10 * (1 - alpha)}px)` }}>{chapter}</div>
    <div className="native-film-confirmation" style={{ opacity: filmEase(time, 3.55, .12) * (1 - filmEase(time, 4.25, .15)) }}>✓ Copied</div>
    <div className="native-film-ending" style={{ opacity: end }}>
      <div className="native-film-wordmark"><ShareTextsLogo size={144} /><span>ShareTexts</span></div>
    </div>
  </div>;
}
