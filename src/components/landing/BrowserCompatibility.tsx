import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Pause, Play, QrCode } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

// Desktop shows a website QR without creating a room or a Worker request.
// Phones load the same shared chunk only when requested.
const WebsiteQr = lazy(() => import('../qr/QrArt').then(module => ({ default: module.QrArt })));

const BROWSERS = [
  ['chrome', 'Chrome'], ['safari', 'Safari'], ['firefox', 'Firefox'],
  ['edge', 'Edge'], ['brave', 'Brave'], ['samsung-internet', 'Samsung Internet'],
  ['opera', 'Opera'], ['vivaldi', 'Vivaldi'],
] as const;

/** Real browser marks, not endorsements. Repeated sets are visual only;
 * reduced motion keeps one manually scrollable line, never an animated grid. */
export function BrowserCompatibility() {
  const { t } = useI18n();
  const trackId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let inView = true;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    if (observer) observer.observe(element);
    else sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return (
    <section className="landing-browsers w-full" aria-labelledby="browsers-title">
      <div className="landing-browser-head">
        <h2 id="browsers-title">{t('home.browser.heading')}</h2>
        <button type="button" className="landing-quiet-button landing-marquee-toggle" data-testid="browser-marquee-toggle"
          aria-label={t(paused ? 'action.resume' : 'action.pause')} title={t(paused ? 'action.resume' : 'action.pause')}
          aria-controls={trackId} onClick={() => setPaused(value => !value)}>
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      </div>
      <div ref={viewport} className="landing-browser-marquee" dir="ltr" data-running={visible && !paused} tabIndex={0} role="region" aria-labelledby="browsers-title">
        <div id={trackId} className="landing-browser-track">
          {/* Three sets cover the widest lane even at the last loop frame:
              two sets alone leave a gap when one set is narrower than it. */}
          {[0, 1, 2].map(copy => (
            <ul key={copy} className="landing-browser-list" aria-label={copy ? undefined : t('home.browsers')} aria-hidden={copy > 0 || undefined}>
              {BROWSERS.map(([slug, name]) => <li key={slug}>
                <img src={`/browsers/${slug}.svg`} width="104" height="104" loading="lazy" decoding="async" alt={copy ? '' : name} />
              </li>)}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The second-device tool is useful, but isn't browser compatibility copy. */
export function WebsiteHandoff() {
  const { t } = useI18n();
  const titleId = useId();
  const qrId = useId();
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const qrVisible = desktop || qrOpen;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const address = window.location.origin;
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const sync = () => setDesktop(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2400);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState('copied');
    } catch {
      // Keep the address selectable and QR available when copying is denied.
      setCopyState('error');
    }
  };
  return (
    <aside className="landing-browser-utility" aria-labelledby={titleId} onKeyDown={event => {
      if (event.key === 'Escape' && qrOpen && !desktop) {
        event.stopPropagation();
        setQrOpen(false);
        qrTrigger.current?.focus();
      }
    }}>
        <div className="landing-handoff-address">
          <h3 id={titleId}>{t('home.browser.open')}</h3>
          <div className="landing-site-address"><bdi dir="ltr">{window.location.host}</bdi></div>
        </div>
        <div className="landing-browser-actions">
          <button type="button" className="landing-quiet-button" data-testid="landing-copy-address" onClick={copyAddress}>
            {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span>{t(copyState === 'copied' ? 'space.copied' : 'space.copyLink')}</span>
          </button>
          <button ref={qrTrigger} type="button" className="landing-quiet-button landing-qr-trigger" data-testid="landing-website-qr" aria-expanded={qrVisible} aria-controls={qrId} onClick={() => setQrOpen(value => !value)}>
            <QrCode aria-hidden="true" /><span>{t(qrOpen ? 'home.browser.hideQr' : 'home.browser.qr')}</span>
          </button>
        </div>
        <p role="status" className="landing-browser-feedback">{copyState === 'copied' ? t('command.textCopied') : copyState === 'error' ? t('home.browser.copyFailed') : ''}</p>
        <div id={qrId} hidden={!qrVisible} className="landing-browser-qr">
          {qrVisible && <>
            <Suspense fallback={<span className="landing-qr-loading">{t('common.loading')}</span>}>
              <WebsiteQr value={address} size={144} logo={false} label={t('home.browser.qrHint')} />
            </Suspense>
            <p>{t('home.browser.qrHint')}</p>
          </>}
        </div>
    </aside>
  );
}
