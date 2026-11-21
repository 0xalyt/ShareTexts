import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, QrCode } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

// Only load the QR renderer after a visitor asks for it. This is the website
// address, not a room invitation: opening it never creates or joins a room.
const WebsiteQr = lazy(() => import('../qr/QrArt').then(module => ({ default: module.QrArt })));

const BROWSERS = [
  ['chrome', 'Chrome'], ['safari', 'Safari'], ['firefox', 'Firefox'],
  ['edge', 'Edge'], ['brave', 'Brave'], ['samsung-internet', 'Samsung Internet'],
] as const;

/** Answer the ecosystem objection, then help open the second browser. The
 * logos are compatibility labels, not endorsements or a decorative ticker. */
export function BrowserCompatibility() {
  const { t } = useI18n();
  const qrId = useId();
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const address = window.location.origin;
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
      // Never claim a successful copy when permission was refused. The
      // address remains selectable and the QR is a permission-free fallback.
      setCopyState('error');
    }
  };
  return (
    <section className="landing-browsers w-full" aria-labelledby="browsers-title" onKeyDown={event => {
      if (event.key === 'Escape' && qrOpen) {
        event.stopPropagation();
        setQrOpen(false);
        qrTrigger.current?.focus();
      }
    }}>
      <div className="landing-browser-copy">
        <h2 id="browsers-title">{t('home.browser.heading')}</h2>
        <p>{t('home.browser.body')}</p>
        <ul className="landing-browser-list" aria-label={t('home.browsers')}>
          {BROWSERS.map(([slug, name]) => <li key={slug}>
            <img src={`/browsers/${slug}.svg`} width="24" height="24" loading="lazy" decoding="async" alt="" />
            <span>{name}</span>
          </li>)}
        </ul>
      </div>
      <div className="landing-browser-utility">
        <h3>{t('home.browser.open')}</h3>
        <div className="landing-site-address"><bdi dir="ltr">{window.location.host}</bdi></div>
        <div className="landing-browser-actions">
          <button type="button" className="landing-quiet-button" data-testid="landing-copy-address" onClick={copyAddress}>
            {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span>{t(copyState === 'copied' ? 'space.copied' : 'space.copyLink')}</span>
          </button>
          <button ref={qrTrigger} type="button" className="landing-quiet-button" data-testid="landing-website-qr" aria-expanded={qrOpen} aria-controls={qrId} onClick={() => setQrOpen(value => !value)}>
            <QrCode aria-hidden="true" /><span>{t('home.browser.qr')}</span>
          </button>
        </div>
        <p role="status" className="landing-browser-feedback">{copyState === 'copied' ? t('command.textCopied') : copyState === 'error' ? t('home.browser.copyFailed') : ''}</p>
        <div id={qrId} hidden={!qrOpen} className="landing-browser-qr">
          {qrOpen && <>
            <Suspense fallback={<span className="landing-qr-loading">{t('common.loading')}</span>}>
              <WebsiteQr value={address} size={144} logo={false} label={t('home.browser.qrHint')} />
            </Suspense>
            <p>{t('home.browser.qrHint')}</p>
          </>}
        </div>
      </div>
    </section>
  );
}
