import { useId, useState } from 'react';
import { ArrowRight, Check, Clock3, FileText, Laptop, Link, Smartphone } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

/** Below-the-fold product vignettes. Deliberately not clickable mock controls:
 * these illustrate pairing, an arrived note, and an expiring shelf. The real
 * actions remain in the hero and the Temporary Spaces story. All example data
 * is inside an aria-hidden illustration, never exposed as live session state. */
export function PairingDetail() {
  const { t } = useI18n();
  return <div className="landing-detail landing-pair-detail" aria-hidden="true">
    <div className="landing-detail-browser"><span /><span /><span /><b>sharetexts.online</b></div>
    <div className="landing-pair-devices">
      <div className="landing-mini-device">
        <div className="landing-mini-label"><Laptop /><span>{t('home.send')}</span></div>
        <div className="landing-example-code" dir="ltr">482<span>716</span></div>
        <div className="landing-code-line" />
      </div>
      <div className="landing-pair-link"><ArrowRight /></div>
      <div className="landing-mini-device">
        <div className="landing-mini-label"><Smartphone /><span>{t('home.receive')}</span></div>
        <div className="landing-code-cells" dir="ltr">{'482716'.split('').map((digit, i) => <span key={i}>{digit}</span>)}</div>
        <div className="landing-mini-confirm"><Check /></div>
      </div>
    </div>
  </div>;
}

export function TransferDetail() {
  const { t } = useI18n();
  return <div className="landing-detail landing-transfer-detail" aria-hidden="true">
    <div className="landing-transfer-receipt">
      <div className="landing-receipt-note">{t('demo.handoff.note')}</div>
      <div className="landing-receipt-files">
        <div className="landing-file-paper"><FileText /><span>PDF</span></div>
        <div className="landing-file-paper landing-link-paper"><Link /><span>sharetexts.online</span></div>
      </div>
      <div className="landing-receipt-status"><Check /><span>{t('demo.handoff.received')}</span></div>
    </div>
  </div>;
}

export function SpaceDetail() {
  const { t } = useI18n();
  const id = useId();
  const [preview, setPreview] = useState({ open: true, animate: false });
  return <figure className="landing-space-preview" aria-labelledby={`${id}-caption`}>
    <div className="landing-space-window" data-open={preview.open} data-animate={preview.animate}>
      <div className="landing-space-window-header" aria-hidden="true">
        <span>{t('home.space.example')}</span>
        <span><Clock3 /><span className="landing-space-preview-status">
          <span data-active={preview.open}>{t('space.retention')}</span>
          <span data-active={!preview.open}>{t('home.space.expired')}</span>
        </span></span>
      </div>
      {/* Sample content is never uploaded. Both layers stay mounted so rapid
          reversals retarget the fade; keyboard and reduced-motion are instant. */}
      <div id={`${id}-example`} className="landing-space-stage" aria-hidden="true">
        <div className="landing-space-open">
          <div className="landing-space-note"><FileText /><p>{t('home.space.note')}</p><span>{t('space.addedByYou')}</span></div>
          <div className="landing-space-link"><Link /><div><strong>{t('nav.docs')}</strong><bdi dir="ltr">sharetexts.online/docs</bdi></div></div>
          <div className="landing-space-devices"><Laptop /><span /><Smartphone /></div>
        </div>
        <div className="landing-space-closed"><Clock3 /><strong>{t('space.closedTitle')}</strong><p>{t('space.closedBody')}</p></div>
      </div>
      <div className="landing-space-switch" role="group" aria-label={t('home.space.preview')}>
        {[true, false].map(open => <button key={String(open)} type="button" className="landing-quiet-button" aria-controls={`${id}-example`} aria-pressed={preview.open === open} onClick={event => setPreview({ open, animate: event.detail > 0 })}>
          {t(open ? 'home.space.open' : 'home.space.closed')}
        </button>)}
      </div>
    </div>
    <figcaption id={`${id}-caption`}>{t('home.space.preview')}</figcaption>
    <span className="sr-only" role="status">{t(preview.open ? 'home.space.open' : 'space.closedBody')}</span>
  </figure>;
}
