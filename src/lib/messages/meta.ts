// Locale status, read from each dictionary's own `STATUS` export.
//
// The status lives in the locale file, not in a table here, so a translator or
// the owner changes one line in the file they are already editing. The rule
// (DESIGN.md §17, P6): a language is `reviewed` only when the owner promotes
// it. Everything else is a draft, and the Language sheet says so.
//
// P7: this module used to import all ten non-English dictionaries to read that
// one string, which put 160 KB of translations in the entry chunk — Rollup had
// to keep each module because it was also a dynamic entry. The strings are now
// read at build time into `status.generated.ts` (scripts/gen-locale-status.mjs),
// so the rule survives and the dictionaries stay lazy.
import { LOCALE_STATUS } from './status.generated';

export type LocaleStatus = 'draft' | 'reviewed';

/** Wrap a locale's own STATUS so the sheet reads `meta.es.status`. */
const s = (status: LocaleStatus) => ({ status });

export const es = s(LOCALE_STATUS.es);
export const fr = s(LOCALE_STATUS.fr);
export const de = s(LOCALE_STATUS.de);
export const ptBR = s(LOCALE_STATUS['pt-BR']);
export const ptPT = s(LOCALE_STATUS['pt-PT']);
export const hi = s(LOCALE_STATUS.hi);
export const ja = s(LOCALE_STATUS.ja);
export const zhHans = s(LOCALE_STATUS['zh-Hans']);
export const zhHant = s(LOCALE_STATUS['zh-Hant']);
export const ar = s(LOCALE_STATUS.ar);
