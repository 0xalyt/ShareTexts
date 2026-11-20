import { ArrowRight, Check, FileText, Laptop, Link, Smartphone } from 'lucide-react';
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
  return <div className="landing-space-detail" aria-hidden="true">
    <div className="landing-space-sheet landing-space-sheet-back"><FileText /></div>
    <div className="landing-space-sheet"><Link /><span>sharetexts.online</span><i /><i /></div>
    <div className="landing-space-clock"><svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="16" /><path d="M20 10v10l7 4" /></svg></div>
  </div>;
}
