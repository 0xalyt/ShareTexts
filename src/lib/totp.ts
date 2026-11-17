import { totpAt } from './totp-sha1';

/**
 * Pairing code window: 90 seconds, anchored to the room's creation time.
 *
 * Codes are generated with `timestamp = now - createdAt`, so window N covers
 * [createdAt + N·90s, createdAt + (N+1)·90s). The creator lands on the
 * "Connect your other device" screen right after creating, so the first code
 * is always a full 90 seconds — it never "refreshes in a few seconds"
 * because you walked into the middle of a wall-clock window. The worker and
 * Node server validate with the same anchor (±2 window), so both devices
 * always agree on the current code.
 */
const PERIOD = 90; // seconds per code window (generous so the code doesn't refresh while being typed)

export function generateTOTP(secret: string, createdAt?: number): string {
  // Shift the epoch to the room's creation time. Without createdAt (legacy
  // sessions mid-rollout) this degrades to wall-clock — same formula.
  const ts = createdAt ? Date.now() - createdAt : Date.now();
  return totpAt(secret, Math.floor(ts / 1000 / PERIOD));
}

/** Ring progress 0..1 within the current window. */
export function getTOTPProgress(createdAt?: number): number {
  const now = Date.now();
  const anchor = createdAt ?? 0;
  return (((now - anchor) / 1000) % PERIOD) / PERIOD;
}

/** Whole seconds left in the current window (ceil, so 40 → 1). */
export function getTOTPRemainingSeconds(createdAt?: number): number {
  const now = Date.now();
  const anchor = createdAt ?? 0;
  return PERIOD - (((now - anchor) / 1000) % PERIOD);
}

