import React, { useEffect, useState } from 'react';
import { FileText, Check } from 'lucide-react';
import { DemoScreen } from '../components/landing/HandoffDemo';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { useI18n } from '../lib/i18n';
import './launch-film.css';

export const LAUNCH_DURATION = 12.7;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
// Quintic smoothstep has zero velocity AND acceleration at both endpoints.
const at = (t: number, start: number, duration: number) => {
  const p = clamp((t - start) / duration);
  return p * p * p * (p * (p * 6 - 15) + 10);
};

/** A 12.7-second product illustration, not a live transfer or speed claim.
 * Reference: Serena #27, Grok Bot / Action Button. Keep its white cyclorama,
 * macro → physical handoff → quiet type → mark cadence, not its phone OS,
 * hardware feature, brand or soundtrack. Every pixel is driven by one clock.
 */
export function LaunchFilm() {
  const [t, setT] = useState(0);
  const { t: message } = useI18n();
  useEffect(() => {
    window.__film = async (time: number) => {
      setT(Math.max(0, Math.min(LAUNCH_DURATION, time)));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    };
    return () => { delete window.__film; };
  }, []);

  const rise = at(t, 0, 0.65);
  const orbit = at(t, 1.45, 1.05);
  const receive = at(t, 3.1, 0.55);
  const wide = at(t, 4.25, 1.1);
  const exit = at(t, 5.7, 0.25);
  const flight = at(t, 2.0, 1.3);
  const phoneX = mix(mix(480, -180, orbit), 230, wide);
  const phoneY = mix(mix(mix(330, -20, rise), -20, orbit), 320, wide);
  const phoneScale = mix(mix(1.8, 1.05, orbit), 0.56, wide);
  const laptopX = mix(mix(2100, 710, at(t, 2.35, 1)), 610, wide);
  const laptopY = mix(105, 180, wide);
  const laptopScale = mix(1.12, 0.87, wide);
  const typing = at(t, 6.0, 0.4);
  const second = at(t, 6.65, 0.4);
  const typeOut = at(t, 8.85, 0.3);
  const markIn = at(t, 9.2, 0.5);
  const lockup = at(t, 9.8, 0.55);
  const reset = at(t, 12.35, 0.35);

  return <div className="launch-stage" style={{ opacity: 1 - reset }}>
    <div className="launch-set" style={{ opacity: at(t, 0, 0.18) * (1 - exit) }}>
      <div className="launch-phone" style={{ transform: `translate3d(${phoneX}px,${phoneY}px,0) scale(${phoneScale}) rotateY(${mix(-34 * orbit, -9, wide)}deg)` }}>
        <div className="launch-phone-edge" />
        <div className="launch-phone-body">
          <div className="launch-phone-glass"><DemoScreen phone step={t < 3.55 ? 3 : 4} progress={at(t, 0.4, 3.15)} /><span className="launch-island" /><span className="launch-home" /></div>
          <div className="launch-glass-reflection" />
        </div>
      </div>
      <div className="launch-laptop" style={{ transform: `translate3d(${laptopX}px,${laptopY}px,0) scale(${laptopScale}) rotateY(${mix(12, -5, wide)}deg)` }}>
        <div className="launch-lid"><span className="launch-camera" /><div className="launch-browser"><span /><span /><span /><small>sharetexts.online</small></div>
          <div className="launch-laptop-glass"><DemoScreen step={receive > 0.6 ? 4 : 1} /></div>
          <span className="launch-arrived" style={{ opacity: receive * (1 - wide), transform: `translateY(${mix(18, 0, receive)}px)` }}><Check />{message('demo.handoff.received')}</span>
        </div><div className="launch-deck"><span /></div>
      </div>
      <div className="launch-packet" style={{ opacity: at(t, 1.9, 0.2) * (1 - at(t, 3.15, 0.25)), transform: `translate3d(${mix(420, 1120, flight)}px,${mix(505, 410, flight) - Math.sin(flight * Math.PI) * 105}px,0) rotate(${mix(-14, 0, flight)}deg) scale(${mix(0.65, 1, at(t, 1.9, 0.4))})` }}><FileText strokeWidth={1.4} /></div>
    </div>
    <div className="launch-copy" style={{ opacity: typing * (1 - typeOut), transform: `translateY(${mix(18, 0, typing)}px)` }}>
      <div style={{ transform: `translateY(${mix(45, 0, second)}px)` }}>{message('film.from')}</div>
      <div style={{ opacity: second, transform: `translateY(${mix(18, 0, second)}px)` }}>{message('film.to')}</div>
    </div>
    <div className="launch-brand" style={{ opacity: markIn, transform: `translateY(${mix(16, 0, markIn)}px)` }}>
      <div style={{ transform: `translateX(${mix(165, 0, lockup)}px) rotate(${mix(-32, 0, markIn)}deg)` }}><ShareTextsLogo size={106} /></div>
      <span style={{ opacity: lockup, clipPath: `inset(0 ${100 * (1 - lockup)}% 0 0)`, transform: `translateX(${mix(-15, 0, lockup)}px)` }}>ShareTexts</span>
    </div>
  </div>;
}
