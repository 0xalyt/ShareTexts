import React from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { FileTypeIcon } from './FileTypeIcon';
import { useMotionPreference } from '../lib/useMotionPreference';
import { DUR, SPRING } from '../lib/motion/tokens';

/** Keep the file recognizable through the handoff. Only a real completed
 * attachment (with bytes available) earns the stamp. The spring retargets
 * from the current picture; restored/history cards don't replay a flourish. */
export function TransferStamp({ name, mimeType, complete }: { name: string; mimeType?: string; complete: boolean }) {
  const reduced = useMotionPreference();
  const quiet = reduced || document.documentElement.dataset.motionIntent === 'keyboard';
  return (
    <span className="st-transfer-stamp" data-complete={complete} data-testid="transfer-stamp" aria-hidden="true">
      <FileTypeIcon name={name} mimeType={mimeType} size={20} />
      <motion.span
        className="st-transfer-stamp-check"
        initial={false}
        animate={{ opacity: complete ? 1 : 0, scale: quiet || complete ? 1 : .85 }}
        transition={quiet ? { duration: 0 } : {
          scale: { type: 'spring', ...SPRING.snap },
          opacity: { duration: DUR.micro / 1000 },
        }}
      ><Check strokeWidth={2.8} /></motion.span>
    </span>
  );
}
