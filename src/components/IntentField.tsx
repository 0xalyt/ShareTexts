import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ClipboardPaste, KeyRound, SendHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

/**
 * IntentField — one field, and the app works out what you meant.
 *
 * The old entry asked a question first ("Send or Receive?") and only then
 * let you say WHAT you wanted to move. That is backwards: almost everyone
 * arrives already holding the thing — a link, a paragraph, a code someone
 * texted them — and the only real question is whether the app should open a
 * room for it or walk into one.
 *
 * So: you type or paste. Nothing else.
 *
 *   · an empty field            → "Create room"      (same as Send)
 *   · anything that isn't a code → "Send this"       (creates the room, and
 *                                                     the text is already in
 *                                                     the composer when it
 *                                                     opens — the moment the
 *                                                     other device joins,
 *                                                     Send is one tap away)
 *   · a 6-digit room code        → "Join room"
 *
 * Classification is by SHAPE only: six digits, spaces and hyphens ignored —
 * which is exactly the code the other device is showing (the pairing code,
 * not the /s/ link slug or a Temporary Space code). A six-digit number is
 * also a plausible message, so the join state always offers "send it as text
 * instead": the field never guesses on the user's behalf without a way back.
 */

type Intent =
  | { kind: 'empty' }
  | { kind: 'create'; text: string }
  | { kind: 'join'; code: string };

function classify(raw: string): Intent {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };
  const digits = text.replace(/[\s.\-]/g, '');
  if (/^\d{6}$/.test(digits)) return { kind: 'join', code: digits };
  return { kind: 'create', text };
}

export function IntentField({
  onCreate,
  onJoin,
  busy = false,
  className,
}: {
  /** Open a room for this text (it is staged in the composer). Empty string = just open one. */
  onCreate: (text: string) => void;
  /** Join an existing room by its code. */
  onJoin: (code: string) => void;
  /** A room is already being created/joined — the field stays readable but inert. */
  busy?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [value, setValue] = useState('');
  // A code-shaped message the user says is a message, not a code.
  const [asText, setAsText] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const detected = classify(value);
  const intent: Intent = detected.kind === 'join' && asText
    ? { kind: 'create', text: value.trim() }
    : detected;

  // Matching a code is a strong signal, so the field shows it immediately —
  // but the moment the value stops looking like that same code, the
  // "it's text" override is stale and would silently block the next match.
  useEffect(() => { setAsText(false); }, [value]);

  const submit = useCallback(() => {
    if (busy) return;
    if (intent.kind === 'join') onJoin(intent.code);
    else onCreate(intent.kind === 'create' ? intent.text : '');
  }, [busy, intent, onJoin, onCreate]);

  const label = intent.kind === 'join'
    ? t('intent.join')
    : intent.kind === 'create'
      ? t('intent.send')
      : t('intent.create');

  const hint = intent.kind === 'join'
    ? t('intent.hintJoin', { code: `${intent.code.slice(0, 3)} ${intent.code.slice(3)}` })
    : intent.kind === 'create'
      ? t('intent.hintSend')
      : t('intent.hintEmpty');

  // The glyph and the button label both spring with the intent, so the field
  // tells you what it understood before you commit to it.
  const Glyph = intent.kind === 'join' ? KeyRound : intent.kind === 'create' ? SendHorizontal : ClipboardPaste;

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={`${hintId}-input`} className="sr-only">
        {t('intent.label')}
      </label>

      <div
        className={cn(
          'st-lens flex items-center gap-2.5 rounded-full py-1.5 pl-4 pr-1.5 min-h-[56px]',
          'transition-[box-shadow,border-color] duration-200',
          'focus-within:shadow-[0_0_0_3px_rgba(240,100,19,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]',
          'dark:focus-within:shadow-[0_0_0_3px_rgba(120,170,255,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]',
        )}
      >
        <span
          aria-hidden
          className="relative flex h-5 w-5 shrink-0 items-center justify-center text-apple-ink-muted/80 dark:text-white/45"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={Glyph.displayName || intent.kind}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: -4 }}
              transition={{ type: 'spring', stiffness: 480, damping: 30 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Glyph className={cn('h-[18px] w-[18px]', intent.kind === 'join' && 'text-ember dark:text-azure-400')} strokeWidth={1.8} />
            </motion.span>
          </AnimatePresence>
        </span>

        <input
          id={`${hintId}-input`}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') setValue('');
          }}
          disabled={busy}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-describedby={hintId}
          data-testid="intent-input"
          placeholder={t('intent.placeholder')}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-[16px] leading-[26px] font-normal',
            'text-apple-ink dark:text-white',
            'placeholder:text-apple-ink-muted/70 dark:placeholder:text-white/35',
            'focus:outline-none disabled:opacity-60',
            intent.kind === 'join' && 'tnum tracking-[0.02em]',
          )}
        />

        {/* Phones get the glyph alone: the label cost ~120px of a 390px
            field and clipped the prompt. The action is still named for
            assistive tech, and the hint line beneath spells it out. */}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          data-testid="intent-submit"
          aria-label={label}
          className={cn(
            'group relative flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full',
            'sm:w-auto sm:px-4',
            'text-[14px] font-semibold whitespace-nowrap',
            'transition-all duration-200 active:scale-[0.96]',
            'disabled:opacity-60 disabled:active:scale-100',
            intent.kind === 'join'
              ? 'bg-ember text-white shadow-[0_1px_3px_rgba(240,100,19,0.35)] hover:bg-brand-strong'
              : intent.kind === 'create'
                ? 'bg-ember text-white shadow-[0_1px_3px_rgba(240,100,19,0.35)] hover:bg-brand-strong'
                : 'bg-apple-ink/[0.06] text-apple-ink hover:bg-apple-ink/[0.1] dark:bg-white/[0.1] dark:text-white dark:hover:bg-white/[0.14]',
          )}
        >
          <ArrowRight className="h-4 w-4 sm:hidden" strokeWidth={2.4} aria-hidden />
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={label}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              className="hidden sm:block"
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {/* The hint states the CONSEQUENCE in the same words as the button, so
          "what will happen if I press this" is answered before the press. */}
      <div className="mt-2 flex min-h-[18px] items-center justify-center gap-2 px-1 sm:justify-start">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={hint}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            id={hintId}
            className="text-[12px] font-medium text-apple-ink-muted/75 dark:text-white/40 text-center sm:text-left"
          >
            {hint}
          </motion.span>
        </AnimatePresence>
        {detected.kind === 'join' && (
          <button
            type="button"
            onClick={() => { setAsText(true); inputRef.current?.focus(); }}
            data-testid="intent-as-text"
            className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold text-ember underline-offset-2 hover:underline dark:text-azure-400"
          >
            {t('intent.asText')}
          </button>
        )}
      </div>
    </div>
  );
}

export default IntentField;
