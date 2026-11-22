import React, { useState } from 'react';
import { Download } from 'lucide-react';
import type { ChatMessage } from '../types';
import { useI18n } from '../lib/i18n';
import { sanitizeFilename } from '../lib/utils';
import { cn } from '../lib/utils';
import './room-files.css';


export const RoomFileGroup: React.FC<{ messages: ChatMessage[]; children: React.ReactNode }> = ({ messages, children }) => {
  const { t } = useI18n();
  const [downloadStarted, setDownloadStarted] = useState(false);
  const grouped = messages.length > 1;
  // Plain messages keep their original flex/overlay geometry; only an actual
  // file run needs another layout box around its cards.
  if (!grouped) return <>{children}</>;
  const photos = messages.every(m => m.attachment?.type === 'image');
  const media = messages.every(m => m.attachment?.type === 'image' || m.attachment?.type === 'video');
  const ready = messages.every(m => m.attachment?.status === 'complete' && m.attachment.url);
  return (
    <div data-testid={grouped ? 'room-file-group' : undefined} role={grouped ? 'group' : undefined} className={grouped ? 'st-file-group mt-4 min-w-0 rounded-[24px] border border-black/[0.08] dark:border-white/10 p-3' : undefined}>
      {grouped && <div className="flex min-h-11 items-center justify-between gap-3 px-1">
        <h3 className="text-[14px] font-medium text-apple-ink dark:text-white">{t(photos ? 'batch.photos' : 'batch.files', { count: messages.length })}</h3>
        <button type="button" disabled={!ready} data-testid="save-all-files" className="press flex min-h-11 items-center gap-2 px-2 text-[13px] font-medium text-ember-ink dark:text-ember disabled:opacity-40" onClick={() => {
          // Keep each original byte stream and filename. No zip dependency or
          // second in-memory copy of a potentially multi-gigabyte selection.
          for (const message of messages) {
            const a = message.attachment!;
            const link = document.createElement('a');
            link.href = a.url!;
            link.download = sanitizeFilename(a.name);
            document.body.appendChild(link);
            link.click();
            link.remove();
          }
          setDownloadStarted(true);
        }}><Download className="h-4 w-4" aria-hidden />{t(downloadStarted ? 'action.downloadStarted' : 'batch.saveAll')}</button>
      </div>}
      <div className={cn('min-w-0', grouped && media && 'st-photo-grid grid grid-cols-2 gap-2')}>{children}</div>
    </div>
  );
}
