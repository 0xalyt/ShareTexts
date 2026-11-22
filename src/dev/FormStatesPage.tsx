import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ReceiveScreen, type ReceiveError } from '../components/receive/ReceiveScreen';

/**
 * Dev-only gallery for the receive form: /__kit/form.
 *
 * Not shipped. The point is to see the four states of ONE form in one place —
 * filled and ready, one bad field, a server failure, and the request in flight
 * — at the same width, so the questions "did anything move?", "is the error
 * next to the field?", "is the button honest?" are answered by comparing
 * rather than by remembering.
 *
 * Each card fills its field the way a person does (a paste of six digits) and
 * only then flips state on a short delay, so the rejection beat, the wipe and
 * the focus move all run for real instead of being posed.
 */

const CODE = '428913';

function usePrefilledCode(code: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = ref.current?.querySelector<HTMLInputElement>('[data-testid="join-code-input"] input');
    if (!input) return;
    const data = new DataTransfer();
    data.setData('text', code);
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, [code]);
  return ref;
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      className="h-[560px] overflow-hidden rounded-[24px] border border-apple-divider/60 bg-white px-3 pt-4 dark:border-white/10 dark:bg-[#1b1b1f]"
      data-testid="demo-card"
      data-label={label}
    >
      <p className="mb-1 text-[11px] font-semibold tracking-normal text-apple-ink-muted dark:text-white/65">
        {label}
      </p>
      {children}
    </section>
  );
}

function Panel({
  label,
  error,
  joining,
}: {
  label: string;
  error?: ReceiveError;
  joining?: boolean;
}) {
  const ref = usePrefilledCode(CODE);
  const [current, setCurrent] = useState<ReceiveError | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    if (error) timers.push(window.setTimeout(() => setCurrent(error), 160));
    if (joining) timers.push(window.setTimeout(() => setInFlight(true), 260));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [error, joining]);

  return (
    <Card label={label}>
      <div ref={ref}>
        <ReceiveScreen
          onComplete={() => {}}
          isJoining={inFlight}
          error={current}
          onScan={() => {}}
        />
      </div>
    </Card>
  );
}

const SERVER: ReceiveError = {
  kind: 'offline',
  text: "ShareTexts isn't responding right now. Give it a moment and try again.",
};

export function FormStatesPage() {
  return (
    <main className="min-h-screen bg-apple-canvas px-3 py-10 font-sans text-apple-ink min-[820px]:px-6 dark:bg-[#101013] dark:text-white">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">
          Receive form — validation, one place
        </h1>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-snug text-apple-ink-muted dark:text-white/70">
          The error is the field's: it sits under the field, inside a slot that is the same height with
          a message or without one, so the button below never moves. Focus returns to the first cell
          when the code is the problem, and stays on the button when the network is. The label is
          always visible.
        </p>

        <div className="mt-8 grid gap-6 min-[820px]:grid-cols-2">
          <Panel label="Happy path" />
          <Panel label="One field error" error={{ kind: 'code', text: '' }} />
          <Panel label="Server error" error={SERVER} />
          <Panel label="Request in flight" joining />
        </div>

        <p className="mt-8 text-[12px] text-apple-ink-muted dark:text-white/65">
          Dev only (/__kit/form). Not shipped in a production build.
        </p>
      </div>
    </main>
  );
}

export default FormStatesPage;
