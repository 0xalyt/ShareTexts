/**
 * Haptics — reserved for the moments that matter.
 *
 * Restraint is the design: vibration is NOT a texture on every tap. The
 * everyday answer to a tap is the press itself (styles/apple-dna.css). The
 * motor only speaks at the two peaks — "someone's here" and "it arrived" —
 * plus the firm beat that says something went wrong.
 *
 * Platforms: navigator.vibrate is Chromium-on-Android. iOS Safari ignores it
 * entirely, so nothing here fires on an iPhone; `HAPTICS_IOS` stays false
 * until the owner has tested a device (DESIGN.md §18). Every call is a
 * guarded no-throw enhancement.
 */

export type HapticEvent = 'tap' | 'select' | 'success' | 'error';

/** Master switch (Settings exposes it in P3). '0' silences everything. */
export const HAPTICS_STORE = 'sharetext.haptics';

/** iOS has no web haptics API — leave the flag false until it is tested. */
export const HAPTICS_IOS = false;

const PATTERNS: Record<HapticEvent, number | number[]> = {
  tap: 8,
  select: 6,
  success: [10, 30, 10],
  error: [24, 40, 24],
};

/** Events that are ON by default. Taps are texture; the owner asked for them
 *  to stay quiet unless they opt in. */
const DEFAULT_ON: Record<HapticEvent, boolean> = {
  tap: false,
  select: true,
  success: true,
  error: true,
};

function prefEnabled(event: HapticEvent): boolean {
  try {
    const master = localStorage.getItem(HAPTICS_STORE);
    if (master === '0') return false;
    const perEvent = localStorage.getItem(`${HAPTICS_STORE}.${event}`);
    if (perEvent === '1') return true;
    if (perEvent === '0') return false;
  } catch { /* private mode — fall through to the defaults */ }
  return DEFAULT_ON[event];
}

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    // Chrome refuses vibrate() before the page has been touched at all (and
    // logs a console error while refusing). Ask the activation API first so
    // the call is never made, instead of being made and rejected.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (activation && activation.hasBeenActive === false) return;
    navigator.vibrate(pattern);
  } catch { /* never let feedback break an action */ }
}

/**
 * Fire one named haptic. Call it inside a user gesture (a tap handler), not
 * from an effect — browsers require activation, and a motor that buzzes
 * without a touch reads as a bug rather than as feedback.
 */
export function haptic(event: HapticEvent): void {
  if (typeof window === 'undefined') return;
  if (reducedMotion()) return;
  if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !HAPTICS_IOS) return;
  if (!prefEnabled(event)) return;
  vibrate(PATTERNS[event]);
}

/** Rising pulse — a device connected (the AirDrop moment). Once per room. */
export const hapticSuccess = () => haptic('success');

/** Quieter double-tick — a transfer arrived intact. */
export const hapticArrive = () => haptic('success');

/** The shortest beat we can ask for — shared state changing under the eyes. */
export const hapticTick = () => haptic('select');

/** Explicit tap texture, for a surface that opts in (off by default). */
export const hapticTap = () => haptic('tap');
