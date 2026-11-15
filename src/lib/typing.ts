/**
 * Typing state — OD-4's one ephemeral control frame, both ends.
 *
 * The frame is `{ kind: 'typing', state: 'start' | 'stop' }` and nothing else:
 * no text, no length, no timing beyond what the network already reveals. It is
 * never stored and never logged; the receiver forgets it on a timer, so a lost
 * `stop` degrades into silence instead of a peer who "types" forever.
 *
 * The numbers are the owner's, not invented here:
 *   idleStart  3 s — first keystroke after this quiet period opens a burst
 *   refresh    3 s — while typing, at most one refresh frame per window
 *   stopAfter  4 s — silence closes the burst
 *   ttl        6 s — the receiver drops the state even if `stop` never arrives
 */
export const TYPING_TIMING = {
  idleStart: 3000,
  refresh: 3000,
  stopAfter: 4000,
  ttl: 6000,
} as const;

export type TypingFrame = { kind: 'typing'; state: 'start' | 'stop' };

export function isTypingFrame(value: unknown): value is TypingFrame {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: unknown; state?: unknown };
  return v.kind === 'typing' && (v.state === 'start' || v.state === 'stop');
}

export interface TypingSender {
  /** Call on every keystroke. Sends `start` at most once per refresh window. */
  pulse: () => void;
  /** Call on send, blur or clearing the field. Sends `stop` immediately. */
  stop: () => void;
  /** True while the peer has been told we are typing. */
  active: () => boolean;
}

/**
 * The sending side. It is deliberately dumb about the textarea: it knows
 * "something happened" and "nothing happened for a while", never what was
 * typed. `send` is injected so the engine owns the transport.
 */
export function createTypingSender(send: (state: 'start' | 'stop') => void): TypingSender {
  let typing = false;
  let lastSent = 0;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = (state: 'start' | 'stop') => {
    try {
      send(state);
    } catch {
      /* a closed channel is not an error: the peer's TTL covers it */
    }
  };

  return {
    pulse() {
      const now = Date.now();
      if (!typing || now - lastSent >= TYPING_TIMING.refresh) {
        emit('start');
        typing = true;
        lastSent = now;
      }
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        if (typing) {
          emit('stop');
          typing = false;
        }
      }, TYPING_TIMING.stopAfter);
    },
    stop() {
      if (stopTimer) clearTimeout(stopTimer);
      if (typing) {
        emit('stop');
        typing = false;
      }
    },
    active: () => typing,
  };
}

/** The receiving side's clock: show while fresh, hide on its own afterwards. */
export function typingIsLive(until: number, now = Date.now()): boolean {
  return until > now;
}

/** "Show when I'm typing" — default ON, per OD-4. Off means send nothing. */
const PREF_KEY = 'sharetext.typingIndicator';

export function typingIndicatorEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTypingIndicatorEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, 'off');
  } catch {
    /* private mode: the default stands */
  }
}
