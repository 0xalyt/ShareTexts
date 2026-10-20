import React, { useState, useEffect, useId } from 'react';
import { ShareTextsLogo } from './ShareTextsLogo';
import { OtpInput } from './spaceui/OtpInput';
import { useI18n } from '../lib/i18n';

/**
 * LiveCodeInput — the join-code screen, on the Metalforge-style capsule.
 *
 * The real OtpInput (vendored at spaceui/OtpInput.tsx) owns the slot
 * mechanics AND the interaction beats: the pill that expands into six
 * adjoining cells on mount, the rolling digit settle, the per-cell blinking
 * caret behind the active cell's dark outline, paste/SMS-autofill
 * fill-forward, the contiguity guard, the error shake that also wipes and
 * refocuses, and the green accepted state. This wrapper keeps the join flow
 * around it: the verifying state, the numeric-only note, and the honest
 * error message.
 *
 * State is COORDINATED, not duplicated: the parent (SingleScreenApp) owns
 * the real verification — isJoining while the join promise is in flight,
 * error when it is rejected, accepted when it resolves. This component only
 * renders those states; it never submits on its own.
 */
export function LiveCodeInput({
  onComplete,
  isJoining,
  error,
  accepted = false,
}: {
  onComplete: (code: string) => void;
  isJoining: boolean;
  error?: string | null;
  /** True once the server accepted the code — the capsule turns green. */
  accepted?: boolean;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  // REJECTION → RETRY: the error prop only clears when the next attempt
  // starts, so the STATUS (which paints every cell danger-tinted) has to
  // retire the moment the user edits — the shake+clear already told the
  // story; a persistently red capsule while retyping would punish the retry.
  // A NEW rejection resets this, so shake + message fire again if needed.
  const [editingRetry, setEditingRetry] = useState(false);
  useEffect(() => { setEditingRetry(false); }, [error]);

  // The desktop and mobile layouts can both mount pairing surfaces (other
  // views reuse this component), so a hardcoded id would appear twice in the
  // DOM — breaking label association and letting autoFocus land on the hidden
  // copy. useId keeps every instance's id unique.
  const inputId = useId();

  // Exactly-once submission: OtpInput fires onComplete the moment the last
  // slot fills; the parent's synchronous joiningRef closes the same-tick
  // window a second event could slip through.
  const handleComplete = (val: string) => {
    if (val.length === 6) onComplete(val);
  };

  const status: 'idle' | 'error' | 'success' = accepted
    ? 'success'
    : error && !editingRetry
      ? 'error'
      : 'idle';

  const handleChange = (val: string) => {
    setCode(val);
    if (error) setEditingRetry(true);
  };

  return (
    <div className="flex flex-col items-center relative w-full">
      <span id={inputId} className="sr-only">{t('code.sixDigits')}</span>

      <OtpInput
        length={6}
        value={code}
        onChange={handleChange}
        onComplete={handleComplete}
        disabled={isJoining}
        autoFocus
        status={status}
        size="md"
        slotLabel={(index) => t('code.digitOf', { n: index + 1 })}
      />

      {/* Screen-reader progress mirrors what the cells show visually — the
          capsule itself is the sighted user's progress bar now. */}
      <div role="status" className="sr-only">
        {t('code.digitsOf', { n: code.length })}
      </div>

      {/* REJECTED — the message is the accessible half of OtpInput's
          shake+clear: the row wipes itself and refocuses, the words say why.
          No separate Retry button: the field is already empty and focused,
          typing IS the retry. */}
      {error && (
        <div role="alert" className="mt-4 text-center">
          <p className="text-[13px] sm:text-[16px] text-status-danger font-medium">{error}</p>
        </div>
      )}

      {/* PENDING — verification in flight. The capsule is locked (disabled);
          this line names what is happening instead of a silent freeze. */}
      {isJoining && (
        <div role="status" className="flex flex-col items-center justify-center mt-5">
          <ShareTextsLogo size={20} motion="connecting" />
          <p className="mt-2 text-[16px] font-medium text-apple-ink-muted dark:text-white/60">{t('code.verifying')}</p>
        </div>
      )}

      {/* ACCEPTED — spoken, not just painted: the cells turn green (OtpInput)
          and the live region says so before the room takes over. */}
      {accepted && (
        <p role="status" className="sr-only">{t('code.accepted')}</p>
      )}
    </div>
  );
}
