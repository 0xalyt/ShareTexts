import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QrArt } from '../qr/QrArt';
import { AnimatePresence } from 'motion/react';
import { Check, Copy, Link2, QrCode, Share2, WifiOff } from 'lucide-react';
import { Segmented } from '../ui/Segmented';
import { generateTOTP, getTOTPRemainingSeconds } from '../../lib/totp';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * SendScreen — the code hand-over (§18, P3).
 *
 * One screen, one next step: the room code, one instruction, and a single
 * status line that tells the truth about the other device. The three ways to
 * hand the code over (Code / QR / Link) are a MODE switch, not three screens:
 * the thumb slides 240 ms and the body crossfades 190 ms, and the choice is
 * remembered for the session so a Back-and-forth does not reset it.
 *
 * The caption under the digits is the real remaining time of the code window
 * (m:ss, from `totp.ts`): the window is anchored to the room's creation and
 * runs 90 s, and the parent re-anchors it when it empties — which is why the
 * digits can swap in place under the reader instead of asking for a new code.
 *
 * `?sendState=expired|offline` (development only) pins the two rare states so
 * the screenshot harness can photograph them; it is inert in a production
 * build.
 */

export type SendError = { text: string; icon: 'offline' | 'server' | 'time' | 'info' };

type Segment = 'code' | 'qr' | 'link';
const SEGMENT_KEY = 'sharetext.sendSegment';

/** The join code, drawn — dots, rounded finders, the mark in the middle. */
function QrPlate({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="mx-auto flex w-[252px] justify-center rounded-[30px] shadow-[0_22px_46px_-28px_rgba(11,11,12,0.55)] ring-1 ring-black/[0.06] dark:ring-white/10"
      data-testid="qr-plate"
    >
      <QrArt value={value} size={252} label={label} />
    </div>
  );
}

export function SendScreen({
  secret,
  createdAt,
  isCreating,
  error,
  partnerConnecting,
  onRefreshCode,
  onRetry,
  onNewCode,
  onCopyCode,
  shareUrl,
  onShareLink,
  linkCopied,
}: {
  secret?: string;
  createdAt?: number;
  isCreating: boolean;
  error: SendError | null;
  partnerConnecting: boolean;
  onRefreshCode?: () => void;
  onRetry?: () => void;
  onNewCode?: () => void;
  onCopyCode: () => void;
  shareUrl: string;
  onShareLink: () => void;
  linkCopied: boolean;
}) {
  const { t } = useI18n();

  // Development-only state pin (see the header comment).
  const pinned = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('sendState') : null;
  const shownError: SendError | null =
    pinned === 'offline' ? { text: t('send.offline'), icon: 'offline' } : error;

  const [justCopied, setJustCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopy = useCallback(() => {
    onCopyCode();
    setJustCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setJustCopied(false), 1500);
  }, [onCopyCode]);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const [segment, setSegment] = useState<Segment>(() => {
    try {
      const saved = sessionStorage.getItem(SEGMENT_KEY);
      if (saved === 'code' || saved === 'qr' || saved === 'link') return saved;
    } catch {
      /* private mode */
    }
    return 'code';
  });
  const choose = useCallback((next: Segment) => {
    setSegment(next);
    try {
      sessionStorage.setItem(SEGMENT_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  /* ── The code, and the truth about its window ─────────────────────────── */
  const [code, setCode] = useState(() => (secret ? generateTOTP(secret, createdAt) : ''));
  const [remaining, setRemaining] = useState(() => getTOTPRemainingSeconds(createdAt));

  useEffect(() => {
    if (!secret) {
      setCode('');
      return;
    }
    setCode(generateTOTP(secret, createdAt));
    const id = setInterval(() => {
      setCode((prev) => {
        const next = generateTOTP(secret, createdAt);
        return prev === next ? prev : next;
      });
      setRemaining(getTOTPRemainingSeconds(createdAt));
    }, 250);
    return () => clearInterval(id);
  }, [secret, createdAt]);

  // Re-anchor the window when it empties, so the digits never sit on an
  // expired code while this screen is open.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!onRefreshCode) return;
    if (remaining > 0.25) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    onRefreshCode();
  }, [remaining, onRefreshCode]);

  const expired =
    pinned === 'expired' ||
    shownError?.icon === 'time' ||
    (remaining <= 0.05 && !onRefreshCode);
  const urgent = remaining <= 15;
  const mmss = useMemo(() => {
    const total = Math.max(0, Math.ceil(remaining));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }, [remaining]);

  /* Screen readers hear the digits separately, in two groups of three. */
  const spokenCode = code ? `${code.slice(0, 3).split('').join(' ')}, ${code.slice(3).split('').join(' ')}` : '';

  const body = (
    <>
      {/* ── Code ─────────────────────────────────────────────────────── */}
      {segment === 'code' && (
        <div key="code" className="animate-[st-fade-in_var(--st-t-mode)_var(--st-ease-enter)_both]">
          <div
            className={cn(
              'rounded-2xl bg-apple-parchment dark:bg-apple-tile-1 px-5 py-5 [@media(max-height:520px)]:py-2 [@media(max-height:520px)]:px-4',
              'transition-opacity duration-200',
              expired && 'opacity-50',
            )}
            data-testid="send-code-card"
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-apple-ink-muted dark:text-white/70">
              {t('send.roomCode')}
            </p>
            <div
              className="mt-2.5 flex items-baseline justify-center gap-x-5 select-all [@media(max-height:520px)]:mt-1"
              role="group"
              aria-label={spokenCode ? `${t('code.pairingAria')}: ${spokenCode}` : t('code.pairingAria')}
              data-testid="pairing-code"
            >
              {[0, 3].map((start) => (
                <span key={start} className="flex items-baseline gap-x-1">
                  {code
                    .slice(start, start + 3)
                    .split('')
                    .map((d, i) => (
                      <span
                        key={`${start}-${i}-${d}`}
                        aria-hidden
                        className="font-bold tabular-nums leading-none text-[44px] sm:text-[48px] tracking-[-0.02em] text-apple-ink dark:text-white [@media(max-height:520px)]:text-[30px]"
                      >
                        {d}
                      </span>
                    ))}
                </span>
              ))}
            </div>
            <p
              className={cn(
                'mt-3 text-center text-[13px] font-medium tabular-nums [@media(max-height:520px)]:mt-1 [@media(max-height:520px)]:text-[12px]',
                expired || urgent ? 'text-status-warning-ink dark:text-status-warning-ink-dark' : 'text-apple-ink-muted dark:text-white/70',
              )}
              data-testid="code-validity"
            >
              {expired ? t('send.expired') : t('send.validFor', { t: mmss })}
            </p>
          </div>

          {expired ? (
            <button
              onClick={onNewCode}
              className="press mt-3 w-full min-h-[44px] rounded-[14px] bg-[#f06413] text-white text-[16px] font-semibold [@media(max-height:520px)]:mt-1.5 [@media(max-height:520px)]:min-h-[34px] [@media(max-height:520px)]:text-[14px]"
              data-testid="new-code"
            >
              {t('send.newCode')}
            </button>
          ) : (
            <button
              onClick={handleCopy}
              disabled={!code}
              className="press mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[14px] border border-apple-divider dark:border-white/12 bg-white dark:bg-white/[0.06] text-[15px] font-semibold text-apple-ink dark:text-white disabled:opacity-40 [@media(max-height:520px)]:mt-2 [@media(max-height:520px)]:min-h-[38px] [@media(max-height:520px)]:text-[14px]"
              data-testid="copy-code"
            >
              {justCopied ? <Check className="w-4 h-4 text-status-success" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
              {justCopied ? t('create.copied') : t('create.copyCode')}
            </button>
          )}
        </div>
      )}

      {/* ── QR ───────────────────────────────────────────────────────── */}
      {segment === 'qr' && (
        <div key="qr" className="animate-[st-fade-in_var(--st-t-mode)_var(--st-ease-enter)_both]">
          <QrPlate value={shareUrl} label={t('qr.art.label')} />
          <p className="mt-3 text-center text-[13px] text-apple-ink-muted dark:text-white/70">{t('send.qrCaption')}</p>
        </div>
      )}

      {/* ── Link ─────────────────────────────────────────────────────── */}
      {segment === 'link' && (
        <div key="link" className="animate-[st-fade-in_var(--st-t-mode)_var(--st-ease-enter)_both]">
          <div className="flex items-center gap-3 rounded-2xl bg-apple-parchment dark:bg-apple-tile-1 px-4 py-3.5 min-h-[52px]">
            <Link2 className="w-4 h-4 shrink-0 text-apple-ink-muted dark:text-white/70" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-[15px] text-apple-ink dark:text-white" title={shareUrl}>
              {shareUrl}
            </p>
          </div>
          <button
            onClick={onShareLink}
            className="press mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[14px] border border-apple-divider dark:border-white/12 bg-white dark:bg-white/[0.06] text-[15px] font-semibold text-apple-ink dark:text-white"
            data-testid="share-link"
          >
            {linkCopied ? <Check className="w-4 h-4 text-status-success" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
            {linkCopied ? t('create.copied') : t('create.shareLink')}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col h-[calc(100dvh-82px)]" data-testid="send-screen">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain room-scroll">
      <h2 className="text-[32px] font-bold leading-[1.14] tracking-[-0.02em] text-apple-ink dark:text-white [@media(max-height:520px)]:text-[22px] [@media(max-height:520px)]:leading-none">
        {t('send.title')}
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-apple-ink-muted dark:text-white/70 [@media(max-height:520px)]:mt-0.5 [@media(max-height:520px)]:text-[12px]">{t('send.subtitle')}</p>

      {isCreating && !secret ? (
        <div className="flex flex-col items-center py-12" aria-live="polite">
          <span aria-hidden className="w-2 h-2 rounded-full bg-ember animate-pulse" />
          <p className="mt-3 text-[15px] font-medium text-apple-ink-muted dark:text-white/70">{t('create.creating')}</p>
        </div>
      ) : (
        <>
          <Segmented<Segment>
            className="mt-6 [@media(max-height:520px)]:mt-2.5"
            label={t('send.tabsLabel')}
            value={segment}
            onChange={choose}
            testId="send-segments"
            options={[
              { value: 'code', label: t('send.tab.code') },
              { value: 'qr', label: t('send.tab.qr'), ariaLabel: t('send.tab.qr') },
              { value: 'link', label: t('send.tab.link') },
            ]}
          />
          <div className="mt-5 [@media(max-height:520px)]:mt-2">
            <AnimatePresence mode="wait" initial={false}>
              {body}
            </AnimatePresence>
          </div>

          {/* Unreachable server: the code stays visible (a joiner may still be
              typing it) and the alert offers one way forward. */}
          {shownError && (
            <div
              role="status"
              className="mt-4 flex items-start gap-3 rounded-2xl bg-status-danger-soft px-4 py-3.5"
              data-testid="send-offline"
            >
              <WifiOff className="mt-0.5 w-4 h-4 shrink-0 text-status-danger-ink dark:text-status-danger-ink-dark" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug text-apple-ink dark:text-white/85">{shownError.text}</p>
                <button
                  onClick={onRetry}
                  className="press mt-2 min-h-[36px] text-[14px] font-semibold text-[#c2410c] dark:text-[#ffb340] underline underline-offset-2"
                  data-testid="send-retry"
                >
                  {t('common.tryAgain')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      </div>

      {/* ── Status, pinned to the bottom of the pane ─────────────────── */}
      <div
        className="shrink-0 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] bg-apple-canvas dark:bg-night-900 [@media(max-height:520px)]:pt-2"
        aria-live="polite"
        data-testid="send-status"
      >
        <div className="flex items-center justify-center gap-2.5 rounded-full bg-white/72 dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/12 px-4 min-h-[44px]">
          <span aria-hidden className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-status-success animate-[st-live-dot_1.4s_ease-in-out_infinite]" />
            <span className="relative w-2 h-2 rounded-full bg-status-success" />
          </span>
          <span className="text-[13px] font-medium text-apple-ink dark:text-white/85">
            {partnerConnecting ? t('send.connecting') : t('send.waiting')}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SendScreen;
