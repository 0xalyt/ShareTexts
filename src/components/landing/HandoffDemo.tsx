import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Monitor, Pause, Play, Smartphone } from 'lucide-react';
import { PhoneFrame, PhoneStatusBar } from '../mockups/PhoneFrame';
import { LaptopFrame } from '../mockups/LaptopFrame';
import { ShareTextsLogo } from '../ShareTextsLogo';
import { useI18n } from '../../lib/i18n';
import './handoff-demo.css';

const STEPS = ['open', 'pair', 'text', 'file', 'save'] as const;
const STEP_MS = 3400;

/** An explicitly labelled illustration, not a pretend live transfer. One
 * clock owns both screens and the caption; only real room UI uses real bytes.
 * No frames, videos, network requests or per-frame React renders are needed. */
function DemoScreen({ phone = false, step }: { phone?: boolean; step: number }) {
  const { t } = useI18n();
  const connected = step > 0;
  const hasText = step >= 2;
  const hasFile = step >= 3;
  const complete = step === 4;
  return (
    <div className={`handoff-screen ${phone ? 'handoff-screen-phone' : ''}`}>
      {phone && <PhoneStatusBar />}
      <div className="handoff-appbar"><ShareTextsLogo className="handoff-mark" /><strong>ShareTexts</strong><span className="handoff-status-dot" data-connected={connected} /></div>
      {connected ? <>
        <div className="handoff-peer">{phone ? <Monitor /> : <Smartphone />}<span>{t(phone ? 'demo.handoff.laptop' : 'demo.handoff.phone')}<small>{t('demo.handoff.connected')}</small></span><Check /></div>
        <div className="handoff-feed">
          <span className="handoff-feed-label">{t('demo.handoff.today')}</span>
          <div className="handoff-message" data-shown={hasText}><span>{t('demo.handoff.note')}</span><small>{t(phone ? 'demo.handoff.sent' : 'demo.handoff.received')}<Check /></small></div>
          <div className="handoff-file" data-shown={hasFile}>
            <span className="handoff-file-icon"><FileText /></span>
            <div><strong>Weekend.pdf</strong><small>{complete ? t(phone ? 'demo.handoff.sent' : 'demo.handoff.received') : t(phone ? 'status.sendingShort' : 'status.receivingShort')} · 2.4 MB</small></div>
            {complete && <Check className="handoff-done" />}
            <span className="handoff-progress"><span style={{ transform: `scaleX(${complete ? 1 : 0.64})` }} /></span>
          </div>
          {!phone && <span className="handoff-save" data-shown={complete}>{t('demo.handoff.saveFile')}<ArrowRight /></span>}
          {!hasText && <div className="handoff-ready"><span><Check /></span>{t('demo.handoff.ready')}</div>}
        </div>
        <div className="handoff-composer"><span>{t('demo.handoff.placeholder')}</span><span><ArrowRight /></span></div>
      </> : <div className="handoff-pairing">
        <span className="handoff-pair-icon">{phone ? <Smartphone /> : <Monitor />}</span>
        <strong>{t(phone ? 'demo.handoff.enterCode' : 'demo.handoff.yourCode')}</strong>
        <span className="handoff-code" dir="ltr">482 619</span>
        <small>{t(phone ? 'demo.handoff.codeFromLaptop' : 'demo.handoff.openOtherDevice')}</small>
        <span className="handoff-pair-action">{phone ? t('demo.handoff.join') : <><Copy />{t('demo.handoff.copyCode')}</>}</span>
      </div>}
    </div>
  );
}

export function HandoffDemo() {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saveData] = useState(() => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData));
  const [manualPlay, setManualPlay] = useState(false);
  const running = playing && visible && pageVisible && (!(reduced || saveData) || manualPlay);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { setReduced(mq.matches); setManualPlay(false); };
    const visibility = () => setPageVisible(!document.hidden);
    mq.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    if (root.current) io.observe(root.current);
    return () => {
      mq.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  const hasText = step >= 2;
  const active = STEPS[step];

  return (
    <figure ref={root} className="handoff-demo" data-testid="hero-demo" data-state={active} aria-label={t('demo.handoff.title')}>
      <div className="handoff-demo-top"><span>{t('demo.handoff.eyebrow')}</span><span>{t('demo.handoff.illustration')}</span></div>
      <div className="handoff-stage" aria-hidden="true">
        <div className="handoff-laptop"><LaptopFrame><DemoScreen step={step} /></LaptopFrame></div>
        <div className="handoff-phone"><PhoneFrame><DemoScreen phone step={step} /></PhoneFrame></div>
        <div className="handoff-bridge" data-active={hasText}><ArrowLeft /></div>
      </div>
      <figcaption className="handoff-caption">
        <span className="handoff-step-number" aria-hidden="true">0{step + 1}<span>/ 05</span></span>
        <div className="handoff-copy" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
          {STEPS.map((name, i) => <div key={name} data-active={step === i} aria-hidden={step !== i}><p className="handoff-caption-title">{t(`demo.handoff.${name}.title`)}</p><p>{t(`demo.handoff.${name}.body`)}</p></div>)}
        </div>
      </figcaption>
      <div className="handoff-controls">
        <div className="handoff-steps" role="group" aria-label={t('demo.handoff.steps')}>
          {STEPS.map((name, i) => <button key={name} type="button" onClick={() => { setStep(i); setPlaying(false); }} aria-label={`${t('demo.handoff.steps')} ${i + 1} / ${STEPS.length}`} title={t(`demo.handoff.${name}.title`)} aria-pressed={step === i}><span data-active={step === i} /></button>)}
        </div>
        <button className="handoff-play" type="button" onClick={() => { if (running) { setPlaying(false); } else { setPlaying(true); setManualPlay(true); } }} aria-label={t(running ? 'demo.handoff.pause' : 'demo.handoff.play')}>
          {running ? <Pause /> : <Play />}<span>{t(running ? 'demo.handoff.pause' : 'demo.handoff.play')}</span>
        </button>
      </div>
      <a className="handoff-film-link" href="/film/sharetexts-hero-v3.mp4" target="_blank" rel="noreferrer">{t('demo.handoff.watchFilm')}<ArrowRight aria-hidden="true" /></a>
    </figure>
  );
}
