import React from 'react';
import { ArrowUp } from 'lucide-react';

type MessageComposerProps = {
  inputRef: React.Ref<HTMLTextAreaElement>;
  input: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { 'data-testid'?: string };
  onSend: React.MouseEventHandler<HTMLButtonElement>;
  sendDisabled: boolean;
  sendLabel: string;
  sendTestId: string;
};

/** Shared editing row. Each transport owns its draft, files and send rules. */
export function MessageComposer({ inputRef, input, onSend, sendDisabled, sendLabel, sendTestId }: MessageComposerProps) {
  return (
    <div className="relative flex items-end gap-1.5 pl-2.5 pr-[5px]">
      <textarea
        ref={inputRef}
        rows={1}
        {...input}
        className="flex-1 min-w-0 min-h-[44px] max-h-[30vh] resize-none bg-transparent py-[9px] pl-2 pr-0.5 text-apple-ink dark:text-white placeholder:text-apple-ink-muted/70 dark:placeholder:text-white/35 focus:outline-none text-[16px] leading-[26px] st-verbatim placeholder-shown:whitespace-nowrap placeholder-shown:text-ellipsis placeholder-shown:overflow-hidden"
      />
      <button
        type="button"
        data-testid={sendTestId}
        onClick={onSend}
        disabled={sendDisabled}
        aria-label={sendLabel}
        className="st-send-button w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 text-white bg-ember hover:bg-brand-strong disabled:bg-apple-hairline dark:disabled:bg-white/15 disabled:shadow-none disabled:text-apple-ink-muted/60 dark:disabled:text-white/30 shadow-[0_1px_3px_rgba(240,100,19,0.35)]"
      >
        <ArrowUp className="w-5 h-5" strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
