import React from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useRoomList } from '../lib/useRoomList';
import { useSession } from '../lib/SessionContext';
import { cn } from '../lib/utils';

/**
 * RoomRail — the master list at the top of the desktop left pane.
 *
 * The room's desktop layout already splits into a left pane (identity + stats
 * + controls) and the thread. What it never had was a way to see the room AS a
 * room, so this sits above the stats: where you are, who is here, and one door
 * back out. It is deliberately not a dashboard — no counts, no previews, no
 * invented history. `useRoomList()` returns the rooms that actually exist; when
 * that is one room, the list has one row rather than padding itself with
 * placeholders.
 */
export function RoomRail({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { session } = useSession();
  const { rooms } = useRoomList(session);

  return (
    <section data-testid="room-rail" className={cn('flex flex-col gap-1.5', className)} aria-label={t('rail.title')}>
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-apple-ink-muted dark:text-white/45">
        {t('rail.rooms')}
      </p>
      <ul className="flex flex-col gap-1">
        {rooms.map((room) => (
          <li key={room.id}>
            <div
              data-testid="rail-room"
              aria-current={room.active ? 'true' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-[12px] px-2.5 py-2',
                room.active ? 'bg-ember/[0.07] dark:bg-azure-400/10' : 'hover:bg-black/[0.035] dark:hover:bg-white/[0.05]',
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-ember dark:text-azure-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-apple-ink dark:text-white">
                  {room.label || t('chat.pairedDevice')}
                </span>
              </span>
              <span
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', room.connected ? 'bg-status-success' : 'bg-status-warning')}
                title={room.connected ? t('common.connected') : t('chat.disconnected')}
              >
                <span className="sr-only">{room.connected ? t('common.connected') : t('chat.disconnected')}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <a
        href="/"
        data-testid="rail-new-room"
        className="flex min-h-[36px] items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-apple-ink-muted transition-colors hover:bg-black/[0.04] hover:text-apple-ink dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {t('rail.newRoom')}
      </a>
    </section>
  );
}
