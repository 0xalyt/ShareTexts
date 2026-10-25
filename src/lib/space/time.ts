/** Countdown + closing-time formatting (§7): remaining time first, local
 *  closing time where useful, emphasis that grows as the deadline nears —
 *  no fake urgency. All clock times go through format.ts with the APP's
 *  active language (B16) — never the machine locale. */

import { fmtTime } from '../format';
import type { Lang } from '../i18n';

/** "5h 42m", "2d 3h", "45s". */
export function remainingShort(msLeft: number): string {
  if (msLeft <= 0) return '0m';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Local closing time: "10:40 PM" / "22:40" — shaped by the app language. */
export function closingTime(lang: Lang, expiresAt: number): string {
  return fmtTime(lang, expiresAt);
}

/** Visual emphasis tier: calm → soon → imminent. Pure UI semantics. */
export function urgencyTier(msLeft: number): 'calm' | 'soon' | 'imminent' {
  if (msLeft <= 30 * 60_000) return 'imminent';
  if (msLeft <= 6 * 3_600_000) return 'soon';
  return 'calm';
}
