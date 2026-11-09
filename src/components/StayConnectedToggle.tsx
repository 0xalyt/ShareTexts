import React from 'react';
import { Infinity as InfinityIcon } from 'lucide-react';
import { useSession } from '../lib/SessionContext';
import { useI18n } from '../lib/i18n';
import { StandardSwitch } from './StandardSwitch';
import { hapticTick } from '../lib/haptics';
import { cn } from '../lib/utils';

/**
 * StayConnectedToggle — flips the room-wide "keep this room alive" promise.
 *
 * Both seated devices render this control; the server is the source of truth
 * and echoes the new state to the WHOLE room (stay_connected_state), so the
 * two badges can never disagree. Optimistic paint keeps the switch instant.
 *
 * A Stay Connected room is exempt from every server expiry sweep — it lives
 * until one device explicitly disconnects. The switch lives in the connection
 * details sheet (ChatView) and the desktop summary pane (SingleScreenApp).
 */
export function StayConnectedToggle({ className }: { className?: string }) {
  const { session, setStayConnected } = useSession();
  const { t } = useI18n();
  const on = session.stayConnected;

  return (
    /* A SETTINGS ROW, not a card: it lives inside the details card, and a
       bordered tile inside a bordered tile was reading as a second panel
       wrapped around a switch (the "why is there a box in my box" look).
       The whole row is the target — thumb, label and switch — because a
       26px-tall switch on a phone is the kind of control people miss by
       8px, and a missed tap on a room-lifetime setting is expensive. */
    <div
      className={cn(
        'group flex items-center gap-3 min-h-[56px] px-1 py-2.5',
        className
      )}
    >
      {/* The label half is a SECOND, larger tap target for the same state.
          It is aria-hidden and untabbable on purpose: the switch beside it is
          the one control a screen reader (or the keyboard) ever meets, so the
          duplicate can never announce the setting twice. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          hapticTick();
          setStayConnected(!on);
        }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] text-left outline-none"
      >
        <span
          className={cn(
            'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-[background-color,color] duration-300 ease-out',
            on
              ? 'bg-ember/[0.12] text-ember dark:bg-ember/20 dark:text-ember-400'
              : 'bg-black/[0.055] text-apple-ink-muted dark:bg-white/[0.07] dark:text-white/45'
          )}
        >
          <InfinityIcon className="w-[18px] h-[18px]" strokeWidth={2} />
        </span>
        <span className="flex flex-col min-w-0 leading-tight">
          <span className="st-label text-apple-ink dark:text-white">{t('stay.title')}</span>
          <span className="mt-0.5 text-[12px] font-medium leading-snug text-apple-ink-muted dark:text-white/55">
            {t('stay.hint')}
          </span>
        </span>
      </button>
      {/* THE standard switch — ThemeToggle's geometry, one silhouette app-wide.
          It keeps its own drag/tap handling; the row only adds a second, larger
          way in, so both work and neither steals the other's gesture. */}
      <StandardSwitch
        checked={on}
        onChange={(next) => setStayConnected(next)}
        ariaLabel={t('stay.title')}
        testId="stay-connected-toggle"
      />
    </div>
  );
}

/**
 * StayBadge — quiet header chip shown while the room's Stay Connected promise
 * is live. Purely informational; the toggle in the details sheet manages it.
 */
export function StayBadge({ className, onOpenDetails }: { className?: string; onOpenDetails?: () => void }) {
  const { session } = useSession();
  const { t } = useI18n();
  if (!session.stayConnected) return null;
  const chip = (
    <span
      role="status"
      aria-label={t('stay.badge')}
      title={t('stay.badge')}
      data-testid="stay-badge"
      className={cn(
        'shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-ember/10 dark:bg-azure-400/15 text-ember dark:text-azure-400',
        className
      )}
    >
      <InfinityIcon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
    </span>
  );
  // Wrapped in a real button when the header can open the details sheet:
  // keyboard/touch users get a 44px target and an obvious path to the toggle.
  if (!onOpenDetails) return chip;
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      aria-label={t('stay.badge')}
      title={t('stay.badge')}
      data-testid="stay-badge"
      className="shrink-0 w-11 h-11 -m-2 flex items-center justify-center rounded-full active:scale-90 transition-transform"
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center bg-ember/10 dark:bg-azure-400/15 text-ember dark:text-azure-400"
      >
        <InfinityIcon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
      </span>
    </button>
  );
}
