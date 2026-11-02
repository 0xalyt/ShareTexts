/**
 * ConnectHandshake — the connect moment (§18, P3).
 *
 * Two devices, one line. That is the whole scene, reduced to what it means:
 *
 *   connecting — two 48px circles (24px Lucide glyphs: phone and screen) with
 *                a hairline between them that DRAWS itself in 600 ms, linear.
 *                Nothing moves, nothing pulses, nothing loops.
 *   connected  — the same line settles SOLID and green, a check badge scales
 *                in once (280 ms, one shot), and the status word changes from
 *                "Connecting…" to the truth about the route: "Same network"
 *                or "Through ShareTexts". No rings, no confetti, no second
 *                flourish: the moment is the line arriving.
 *
 * The status word is ONE element with a fixed height and no crossfade — a
 * label that flashes or re-lays-out while a connection settles reads as
 * instability at exactly the wrong second. Reduced motion keeps every fact
 * and drops the performance: the line is simply there, the badge fades in
 * 120 ms instead of scaling.
 */
import React from 'react';
import { Check, Monitor, Smartphone } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

export type HandshakePhase = 'searching' | 'connecting' | 'connected';
export type LinkRoute = 'local' | 'direct' | 'relay';

interface ConnectHandshakeProps {
  phase: HandshakePhase;
  /** Glyph for THIS device. */
  localIcon?: 'phone' | 'monitor';
  /** Name shown under the partner circle once it is known. */
  partnerName?: string | null;
  /** Hide the scene's own status line when the surface already states it. */
  quiet?: boolean;
  /** How the two devices actually reach each other — decides the success
   *  word. Omitted means "not known yet", and the copy stays generic. */
  route?: LinkRoute;
}

const GLYPH_BOX = 48;
const LINE = 88;

export function ConnectHandshake({ phase, localIcon = 'phone', partnerName, quiet = false, route }: ConnectHandshakeProps) {
  const { t } = useI18n();
  const connected = phase === 'connected';
  const LocalIcon = localIcon === 'phone' ? Smartphone : Monitor;
  const PartnerIcon = localIcon === 'phone' ? Monitor : Smartphone;

  const status = connected
    ? route === 'relay'
      ? t('connect.throughShareTexts')
      : t('connect.sameNetwork')
    : t('connect.linking');

  return (
    <div
      className="flex w-full select-none flex-col items-center"
      data-testid="connect-handshake"
      data-phase={phase}
      data-route={route ?? 'unknown'}
    >
      <div className="relative flex items-center justify-center">
        <DeviceCircle icon={LocalIcon} tone={connected ? 'settled' : 'linking'} />

        {/* The line. It draws from the left circle to the right one in 600 ms,
            then holds — and simply turns solid when the link is live. */}
        <svg
          width={LINE}
          height={GLYPH_BOX}
          viewBox={`0 0 ${LINE} ${GLYPH_BOX}`}
          aria-hidden="true"
          className="shrink-0"
          data-testid="connect-line"
        >
          <line
            x1="0"
            y1={GLYPH_BOX / 2}
            x2={LINE}
            y2={GLYPH_BOX / 2}
            strokeDasharray={LINE}
            strokeWidth={2}
            strokeLinecap="round"
            className={cn(
              'st-connect-line',
              connected ? 'stroke-status-success' : 'stroke-apple-ink/25 dark:stroke-white/30',
            )}
            data-connected={connected ? 'true' : 'false'}
          />
        </svg>

        <DeviceCircle icon={PartnerIcon} tone={connected ? 'settled' : 'waiting'} />

        {/* The badge lands on the middle of the line, once. */}
        {connected && (
          <span
            aria-hidden="true"
            data-testid="connect-check"
            className="st-connect-check absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-status-success shadow-[0_2px_8px_-2px_rgba(52,199,89,0.5)]"
          >
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      {!quiet && (
        <div className="mt-4 flex flex-col items-center">
          {/* Fixed height, no crossfade, no key swap: the word changes in
              place, so the block never flashes or jumps. */}
          <p
            aria-live="polite"
            className="min-h-[18px] min-w-[120px] text-center text-[13px] font-semibold text-apple-ink dark:text-white/85"
            data-testid="connect-status"
          >
            {status}
          </p>
          {connected && partnerName ? (
            <p className="mt-0.5 max-w-[220px] truncate text-center text-[13px] text-apple-ink-muted dark:text-white/70">
              {partnerName}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DeviceCircle({ icon: Icon, tone }: { icon: React.ComponentType<{ className?: string }>; tone: 'linking' | 'waiting' | 'settled' }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: GLYPH_BOX, height: GLYPH_BOX }}
      className={cn(
        'relative z-10 flex shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
        tone === 'settled'
          ? 'border-status-success/30 bg-status-success/[0.08] text-status-success'
          : 'border-black/[0.08] bg-white text-apple-ink-muted dark:border-white/12 dark:bg-white/[0.06] dark:text-white/70',
      )}
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}

export default ConnectHandshake;
