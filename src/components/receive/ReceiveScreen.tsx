import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, QrCode } from 'lucide-react';
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

  /* FOCUS MOVES TO THE INVALID FIELD, not to the message. A rejected or dead
     code is the field's problem, so the caret goes back into the first cell and
     the user can retype without hunting. A transport failure is not the field's
     problem — the code may be perfect — so focus stays on the button that
     retries it and we do not pretend the input is what is broken. */
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error || error.kind === 'offline') return;
    fieldRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [error]);

  return (
    <div
      ref={rootRef}
      className="w-full max-w-[480px] mx-auto flex flex-col h-[calc(100dvh-82px)]"
      style={keyboard ? { paddingBottom: keyboard } : undefined}
      data-testid="receive-screen"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain room-scroll">
        <h2 className="text-[34px] font-bold leading-[1.14] tracking-[-0.02em] text-apple-ink dark:text-white [@media(max-height:520px)]:text-[22px] [@media(max-height:520px)]:leading-none">
          {t('receive.titleShort')}
        </h2>
        <p className="mt-2 text-[16px] leading-snug text-apple-ink-muted dark:text-white/70 [@media(max-height:520px)]:mt-0.5 [@media(max-height:520px)]:text-[12px]">
          {t('receive.subtitle')}
        </p>

        {/* The cells sit on the canvas by themselves — no card around them. */}
        <div className="mt-8 [@media(max-height:520px)]:mt-3" ref={fieldRef}>
          {/* A label that is always on screen. Six empty cells say "type" but
              never what to type; the heading above is the screen's name, not
              the field's. */}
          <label
            id="receive-code-label"
            // A label that cannot be clicked is a lost hit area. Six cells look
            // tappable, the words above them are the biggest thing on the
            // screen, and people reach for the words. htmlFor cannot point at a
            // group of inputs, so the label forwards focus to the first cell.
            onClick={() => fieldRef.current?.querySelector('input')?.focus()}
            className="mb-2 block cursor-text text-[13px] font-medium text-apple-ink-muted dark:text-white/70 [@media(max-height:520px)]:mb-1"
          >
            {t('receive.codeLabel')}
          </label>
          {/* The instruction a sighted user gets from the layout, in words for
              a screen reader that lands straight in the first cell. */}
          <span id="receive-code-hint" className="sr-only">{t('receive.hint')}</span>
          <OtpInput
            variant="flat"
            length={6}
            value={code}
            onChange={handleChange}
            onComplete={onComplete}
            disabled={isJoining || accepted}
            autoFocus
            status={accepted ? 'success' : wrong ? 'error' : 'idle'}
            invalid={Boolean(error)}
            describedBy={error ? 'receive-code-hint receive-code-error' : 'receive-code-hint'}
            aria-labelledby="receive-code-label"
            slotLabel={(index) => t('code.digitOf', { n: index + 1 })}
            // The class is added on each rejection and removed the moment the
            // user starts retyping, so the animation restarts per attempt
            // instead of only ever firing once.
            className={wrong ? 'st-shake' : undefined}
          />

          {/* THE ERROR BELONGS TO THE FIELD, so it sits under the field — not in
              a banner above it, and not after the button where the eye is
              already past the thing that is wrong. Its slot is the same height
              whether or not a message is in it, so nothing below moves when an
              error lands and nothing jumps back when the user starts retyping. */}
          <div className="min-h-[42px] pt-2" data-testid="receive-error-slot">
            {/* balanced, not pretty: at 390 the message fits two lines and
                `pretty` still left "new one." alone on the second one. */}
            {error && (
              <p
                id="receive-code-error"
                role="alert"
                data-testid="receive-field-error"
                className="flex items-start gap-1.5 text-[13px] font-medium leading-[1.35] text-status-danger-ink dark:text-status-danger-ink-dark [text-wrap:balance]"
              >
                <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{error.kind === 'code' ? t('receive.wrongCode') : error.text}</span>
              </p>
            )}
          </div>
        </div>

        {/* Screen-reader progress mirrors the cells: the field itself is the sighted progress bar. */}
        <div role="status" className="sr-only">{t('code.digitsOf', { n: code.length })}</div>

        {/* One action, visible from the start, disabled until the code is
            whole — the field's own auto-submit is the fast path, this is the
            explicable one. While joining, the label stays in place. */}
        <button
          onClick={submit}
          disabled={!full || isJoining || accepted}
          aria-busy={isJoining || undefined}
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

        <button
          onClick={onScan}
          className="press mt-4 w-full min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 text-[16px] font-semibold text-apple-ink dark:text-white"
          data-testid="receive-scan"
        >
          <QrCode className="w-4 h-4 text-apple-ink-muted dark:text-white/70" aria-hidden /> {t('receive.scan')}
        </button>

        <p className="mt-4 text-center text-[12px] text-apple-ink-muted dark:text-white/70 [text-wrap:balance]">{t('receive.note')}</p>
        {accepted && <p role="status" className="sr-only">{t('code.accepted')}</p>}
      </div>
    </div>
  );
}

export default ReceiveScreen;
