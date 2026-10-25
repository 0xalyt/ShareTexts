// ---------------------------------------------------------------------------
// format.ts — the ONE place that formats dates, times and numbers (bug B16).
//
// Before this file every call site passed `undefined` (or `[]`) as the
// locale, which hands the decision to the MACHINE's own settings: the same
// app language could render "10:00 AM", "10:00" or "22:00" depending on who
// opened it. Now the string is a function of the APP's active language only.
//
// Two rules make that true:
//   1. One map (LOCALES) from our language codes to CONCRETE BCP-47 locales.
//      The region is deliberate: it pins the hour cycle per language
//      (en-US → 12-hour AM/PM, de-DE → 24-hour), so "the hour cycle comes
//      from the language, never from the machine".
//   2. Every formatter takes `lang: Lang` explicitly — callers get it from
//      useI18n(), so components re-render the moment the language changes.
//      Formatters are built once per language and cached.
//
// scripts/verify-format.mjs renders a real message in every app language
// under BOTH en-US and de-DE browser contexts and asserts the strings match
// Intl.DateTimeFormat(<mapped locale>, …) — and that the two contexts
// produce identical output.
// ---------------------------------------------------------------------------

import type { Lang } from './i18n';

/** One map from the app's language codes to BCP-47 locales. Every formatter
 *  in this file resolves through it — no other code may map lang → locale. */
export const LOCALES: Record<Lang, string> = {
  en: 'en-US',        // 12-hour clock, AM/PM
  es: 'es-ES',        // 24-hour
  fr: 'fr-FR',        // 24-hour
  de: 'de-DE',        // 24-hour
  pt: 'pt-BR',        // 24-hour
  hi: 'hi-IN',        // 12-hour clock
  ja: 'ja-JP',        // 24-hour
  zh: 'zh-Hans-CN',   // 24-hour
  ar: 'ar-EG',        // 12-hour clock, Arabic digits
};

export const localeOf = (lang: Lang): string => LOCALES[lang] ?? LOCALES.en;

interface Formatters {
  time: Intl.DateTimeFormat;        // 10:05 · 10:05 AM
  weekdayTime: Intl.DateTimeFormat; // Mon 10:05 · Mon 10:05 AM
  shortDate: Intl.DateTimeFormat;   // Oct 22
  dayHeading: Intl.DateTimeFormat;  // Thu, Oct 22
  dateTime: Intl.DateTimeFormat;    // Oct 22, 2026, 10:05 AM
  number: Intl.NumberFormat;        // 1,234 · 1.234
}

const CACHE = new Map<string, Formatters>();

/** Built once per language, cached for the app's lifetime. */
function formatters(lang: Lang): Formatters {
  const key = localeOf(lang);
  let f = CACHE.get(key);
  if (!f) {
    f = {
      time: new Intl.DateTimeFormat(key, { hour: '2-digit', minute: '2-digit' }),
      weekdayTime: new Intl.DateTimeFormat(key, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      shortDate: new Intl.DateTimeFormat(key, { month: 'short', day: 'numeric' }),
      dayHeading: new Intl.DateTimeFormat(key, { weekday: 'short', month: 'short', day: 'numeric' }),
      dateTime: new Intl.DateTimeFormat(key, { dateStyle: 'medium', timeStyle: 'short' }),
      number: new Intl.NumberFormat(key),
    };
    CACHE.set(key, f);
  }
  return f;
}

/** An invalid date must never crash a render — the old code had the same
 *  contract (time.ts caught and returned ''). */
const safe = (fn: () => string): string => {
  try { return fn(); } catch { return ''; }
};

/** "10:05" / "10:05 AM" — the message meta strip and every clock time. */
export const fmtTime = (lang: Lang, ts: number | Date): string =>
  safe(() => formatters(lang).time.format(ts));

/** "Oct 22, 2026, 10:05 AM" — saved-item timestamps (medium date + short time). */
export const fmtDateTime = (lang: Lang, ts: number | Date): string =>
  safe(() => formatters(lang).dateTime.format(ts));

/** "Oct 22" — compact dates (durations beyond 72h, stay-room history). */
export const fmtShortDate = (lang: Lang, ts: number | Date): string =>
  safe(() => formatters(lang).shortDate.format(ts));

/** "Mon 10:05" — an end time within three days. */
export const fmtWeekdayTime = (lang: Lang, ts: number | Date): string =>
  safe(() => formatters(lang).weekdayTime.format(ts));

/** "Thu, Oct 22" — date-separator headings in the message list. */
export const fmtDayHeading = (lang: Lang, ts: number | Date): string =>
  safe(() => formatters(lang).dayHeading.format(ts));

/** "1,234" / "1.234" — counts, room totals, transfer tallies. */
export const fmtNumber = (lang: Lang, n: number): string =>
  safe(() => formatters(lang).number.format(n));