import React from 'react';
import { ArrowLeft, ArrowRight, Monitor, Smartphone } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import './task-surfaces.css';

/** A quiet map of the handoff. The dotted route is a possibility, not a
 * connected-state indicator; no green light until the connection is real. */
export function PairingGuide({ receiving = false }: { receiving?: boolean }) {
  const { t } = useI18n();
  const Arrow = receiving ? ArrowLeft : ArrowRight;
  return (
    <div className="st-pair-guide" aria-hidden="true">
      <div className="st-pair-device">
        <span className="st-pair-tile"><Monitor strokeWidth={1.5} /></span>
        <span>{t('connect.thisDevice')}</span>
      </div>
      <div className="st-pair-route"><span /><Arrow className="h-4 w-4 shrink-0" /><span /></div>
      <div className="st-pair-device">
        <span className="st-pair-tile st-pair-tile-other"><Smartphone strokeWidth={1.5} /></span>
        <span>{t('connect.otherDevice')}</span>
      </div>
    </div>
  );
}
