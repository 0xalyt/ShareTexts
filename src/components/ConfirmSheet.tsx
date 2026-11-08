import React, { useRef, useEffect } from 'react';
import { useIsPresent } from 'motion/react';
import { Sheet } from './ui/Sheet';

/**
 * The two action buttons, as a CHILD of the sheet's AnimatePresence so
 * `useIsPresent` reports the sheet's presence.
 *
 * While the sheet slides out it is still mounted — and still clickable — for
 * the whole spring. Without this guard a second tap in that window fires
 * onConfirm again, which on a destructive sheet means "Disconnect" or
 * "Clear all" runs twice. `isPresent` flips false the instant exit begins,
 * so we drop the handlers then; the buttons also stop responding to hover,
 * which reads correctly as "this is already happening".
 */
function ConfirmActions({
  confirmLabel,
  cancelLabel,
  destructive,
  confirmRef,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isPresent = useIsPresent();
  const gate = (fn: () => void) => () => {
    if (isPresent) fn();
  };
  return (
    <div className="px-4 pb-3 pt-2 flex flex-col-reverse sm:flex-col gap-2">
      <button
        type="button"
        onClick={gate(onCancel)}
        className="w-full min-h-[46px] rounded-[14px] bg-black/[0.045] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.11] text-[16px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98] disabled:opacity-60"
        disabled={!isPresent}
      >
        {cancelLabel}
      </button>
      <button
        ref={confirmRef}
        type="button"
        data-autofocus
        onClick={gate(onConfirm)}
        disabled={!isPresent}
        className={
          destructive
            ? 'w-full min-h-[46px] rounded-[14px] bg-status-danger hover:bg-status-danger-strong text-[16px] font-semibold text-white transition-colors active:scale-[0.98] disabled:opacity-60'
            : 'w-full min-h-[46px] rounded-[14px] bg-ember hover:bg-brand-strong text-[16px] font-semibold text-white transition-colors active:scale-[0.98] disabled:opacity-60'
        }
      >
        {confirmLabel}
      </button>
    </div>
  );
}

/**
 * ConfirmSheet — one decision, in the app's sheet grammar.
 *
 * Slides up from the bottom edge on mobile (thumb-reach, iOS action-sheet
 * grammar, and now pull-down-or-throw to cancel); on ≥sm screens it becomes
 * a centered compact dialog, which is the desktop-appropriate form of the
 * same decision. Backdrop click, Escape, dragging it away or Cancel all
 * dismiss; the destructive action confirms. Focus is trapped while open and
 * restored on close; the destructive button is armed by default.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Destructive sheets are the one place focus should land on the armed
  // action rather than the first control, so the keyboard path matches the
  // visual emphasis. Escape is owned by the sheet container.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      label={title}
      maxWidth={380}
      z={90}
      closeButton={false}
      scroll="none"
      testId="confirm-sheet"
    >
      <div className="px-6 pt-2 sm:pt-5 pb-1 text-center">
        <h3 className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{title}</h3>
        {body && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/55">{body}</p>
        )}
      </div>
      <ConfirmActions
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        confirmRef={confirmRef}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Sheet>
  );
}
