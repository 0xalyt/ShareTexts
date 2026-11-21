import React, { useEffect, useRef, useState } from 'react';
import { DemoScreen } from '../components/landing/HandoffDemo';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { useI18n } from '../lib/i18n';
import { createStudio } from './StudioScene';
import './launch-film.css';

export const LAUNCH_DURATION = 12.7;
export const filmEase = (t: number, start: number, duration: number) => {
  const p = Math.max(0, Math.min(1, (t - start) / duration));
  return p * p * p * (p * (p * 6 - 15) + 10);
};

/** Authoring only. The app ships the encoded movie, never Three.js or a canvas.
 * Original unbranded hardware; the existing product illustration supplies its
 * displays at native aspect ratios. One seekable clock owns every frame. */
export function LaunchFilm() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0);
  const { t } = useI18n();
  const texture = new URLSearchParams(location.search).get('texture');
  useEffect(() => {
    if (texture || !canvas.current) return;
    let live = true;
    let dispose: (() => void) | undefined;
    void createStudio(canvas.current).then(studio => {
      dispose = studio.dispose;
      if (!live) { dispose(); return; }
      window.__film = async next => {
        const clamped = Math.max(0, Math.min(LAUNCH_DURATION, next));
        studio.seek(clamped); setTime(clamped);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      };
      studio.seek(0);
    });
    return () => { live = false; delete window.__film; dispose?.(); };
  }, [texture]);

  if (texture) {
    const phone = texture.startsWith('phone');
    return <div className={`studio-texture ${phone ? 'studio-texture-phone' : 'studio-texture-laptop'}`} data-film-texture>
      {!phone && <div className="studio-browser"><i /><i /><i /><span>sharetexts.online</span></div>}
      <DemoScreen phone={phone} step={texture.endsWith('complete') ? 4 : phone ? 3 : 1} progress={texture.endsWith('complete') ? 1 : 0} />
    </div>;
  }

  const at = (start: number, duration: number) => filmEase(time, start, duration);
  const first = at(5.95, 0.55), second = at(6.65, 0.55), copyOut = at(8.25, 0.3);
  const mark = at(8.65, 0.55), wordmark = at(9.15, 0.55), brandOut = at(11.55, 0.35);
  return <div className="launch-stage">
    <canvas ref={canvas} width="1920" height="1080" className="studio-canvas" style={{ opacity: 1 - at(5.55, 0.55) + at(11.9, 0.65) }} />
    <div className="studio-type" style={{ opacity: 1 - copyOut }}>
      <div><span style={{ transform: `translateY(${104 * (1 - first)}%)` }}>{t('film.from')}</span></div>
      <div><span style={{ transform: `translateY(${104 * (1 - second)}%)`, color: '#ee6417' }}>{t('film.to')}</span></div>
    </div>
    <div className="studio-brand" style={{ opacity: mark * (1 - brandOut), transform: `translateY(${16 * (1 - mark)}px)` }}>
      <div style={{ transform: `translateX(${178 * (1 - wordmark)}px) rotate(${24 * (1 - mark)}deg)` }}><ShareTextsLogo size={130} /></div>
      <span style={{ opacity: wordmark, clipPath: `inset(0 ${100 * (1 - wordmark)}% 0 0)`, transform: `translateX(${-24 * (1 - wordmark)}px)` }}>ShareTexts</span>
    </div>
  </div>;
}
