import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode } from 'lucide-react';
import { OtpInput } from '../spaceui/OtpInput';
import { haptic } from '../../lib/haptics';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * ReceiveScreen — the join side of the hand-over (§18, P3).
 *
 * Six flat cells on the canvas (no capsule, no card): the code is the whole
 * screen, so the field is the object. The fifth-digit gap marks the 3+3
 * grouping the sender shows, so reading across two devices is a straight
 * comparison.
 *
 * The screen never submits on its own twice: `OtpInput` fires once on the
 * sixth digit and the parent's joining guard owns the rest. A rejected code
 * shakes (280 ms), wipes and refocuses — the field is ready for the retry, so
 * the words explain instead of adding a button to press.
 */

export type ReceiveError = { text: string; kind: 'code' | 'expired' | 'offline' };

export function ReceiveScreen({
  onComplete,
  isJoining,
  error,
  accepted = false,
  onScan,
}: {
  onComplete: (code: string) => void;
  isJoining: boolean;
  error: ReceiveError | null;
  accepted?: boolean;
  onScan: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [editingRetry, setEditingRetry] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A new rejection retires the "already editing" flag, so the shake and the
  // message fire again for the next attempt.
  useEffect(() => setEditingRetry(false), [error]);

  // The MESSAGE lives until the next attempt; only the cell tint retires as
  // soon as the user starts retyping (a red field while typing punishes the retry).
  const failed = Boolean(error && error.kind === 'code');
  const wrong = failed && !editingRetry;
  useEffect(() => {
    if (wrong) haptic('error');
  }, [wrong]);

  /* Keyboard safety (§18): on a phone the visual viewport shrinks when the
     keyboard opens — in portrait AND in landscape, where it leaves almost no
     room. Reserve exactly the overlap, and keep the field in view. */
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboard(overlap > 80 ? overlap : 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setCode(value);
      if (error) setEditingRetry(true);
    },
    [error],
  );

  const submit = useCallback(() => {
    if (code.length === 6 && !isJoining) onComplete(code);
  }, [code, isJoining, onComplete]);

  const full = code.length === 6;

  return (
    <div
      ref={rootRef}
      className="w-full max-w-[480px] mx-auto flex flex-col h-[calc(100dvh-82px)]"
      style={keyboard ? { paddingBottom: keyboard } : undefined}
      data-testid="receive-screen"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain room-scroll">
        <h2 className="text-[32px] font-bold leading-[1.14] tracking-[-0.02em] text-apple-ink dark:text-white [@media(max-height:520px)]:text-[22px] [@media(max-height:520px)]:leading-none">
          {t('receive.titleShort')}
        </h2>
        <p className="mt-2 text-[15px] leading-snug text-apple-ink-muted dark:text-white/70 [@media(max-height:520px)]:mt-0.5 [@media(max-height:520px)]:text-[12px]">
          {t('receive.subtitle')}
        </p>

        {/* The cells sit on the canvas by themselves — no card around them. */}
        <div className="mt-8 [@media(max-height:520px)]:mt-3">
          <OtpInput
            variant="flat"
            length={6}
            value={code}
            onChange={handleChange}
            onComplete={onComplete}
            disabled={isJoining || accepted}
            autoFocus
            status={accepted ? 'success' : wrong ? 'error' : 'idle'}
            slotLabel={(index) => t('code.digitOf', { n: index + 1 })}
          />
        </div>

        {/* Screen-reader progress mirrors the cells: the field itself is the sighted progress bar. */}
        <div role="status" className="sr-only">{t('code.digitsOf', { n: code.length })}</div>

        {/* One action, visible from the start, disabled until the code is
            whole — the field's own auto-submit is the fast path, this is the
            explicable one. While joining, the label stays in place. */}
        <button
          onClick={submit}
          disabled={!full || isJoining || accepted}
          aria-describedby="receive-status"
          className={cn(
            'press mt-6 w-full min-h-[52px] rounded-[16px] text-[17px] font-semibold transition-colors [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:min-h-[44px]',
            // Disabled is a NEUTRAL fill, not a faded ember: white on 40% orange
            // measured 3.21:1, and a grey button is unmistakably not tappable.
            full && !isJoining
              ? 'bg-[#f06413] text-white'
              : 'bg-apple-parchment dark:bg-white/[0.10] text-apple-ink dark:text-white/70',
          )}
          data-testid="receive-join"
        >
          {isJoining ? t('receive.joining') : t('receive.join')}
        </button>

        <div id="receive-status" className="min-h-[20px]">
          {failed && (
            <p
              role="alert"
              className="mt-3 text-center text-[13px] font-medium text-status-danger-ink dark:text-status-danger-ink-dark [text-wrap:balance]"
              data-testid="receive-error"
            >
              {t('receive.wrongCode')}
            </p>
          )}
          {error && error.kind !== 'code' && (
            <p
              role="alert"
              className="mt-3 text-center text-[13px] font-medium text-status-danger-ink dark:text-status-danger-ink-dark [text-wrap:balance]"
              data-testid="receive-error"
            >
              {error.text}
            </p>
          )}
        </div>

        <button
          onClick={onScan}
          className="press mt-4 w-full min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 text-[16px] font-semibold text-apple-ink dark:text-white"
          data-testid="receive-scan"
        >
          <QrCode className="w-4 h-4 text-apple-ink-muted dark:text-white/70" aria-hidden /> {t('receive.scan')}
        </button>

        <p className="mt-4 text-center text-[12px] text-apple-ink-muted dark:text-white/70">{t('receive.note')}</p>
        {accepted && <p role="status" className="sr-only">{t('code.accepted')}</p>}
      </div>
    </div>
  );
}

export default ReceiveScreen;
