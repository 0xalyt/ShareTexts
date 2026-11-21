import React from 'react';
import { Check } from 'lucide-react';
import { FileTypeIcon } from './FileTypeIcon';

/** Keep the file recognizable through the handoff. Only a real completed
 * attachment (with bytes available) earns the stamp. CSS transitions retarget
 * from the current picture; restored/history cards don't replay a flourish. */
export function TransferStamp({ name, mimeType, complete }: { name: string; mimeType?: string; complete: boolean }) {
  return (
    <span className="st-transfer-stamp" data-complete={complete} data-testid="transfer-stamp" aria-hidden="true">
      <FileTypeIcon name={name} mimeType={mimeType} size={20} />
      <span className="st-transfer-stamp-check"><Check strokeWidth={2.8} /></span>
    </span>
  );
}
