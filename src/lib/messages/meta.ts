// Locale status, read from each dictionary's own `STATUS` export.
//
// The status lives in the locale file, not in a table here, so a translator or
// the owner changes one line in the file they are already editing. The rule
// (DESIGN.md §17, P6): a language is `reviewed` only when the owner promotes
// it. Everything else is a draft, and the Language sheet says so.
import { STATUS as STATUS_ES } from './es';
import { STATUS as STATUS_FR } from './fr';
import { STATUS as STATUS_DE } from './de';
import { STATUS as STATUS_PT_BR } from './pt-BR';
import { STATUS as STATUS_PT_PT } from './pt-PT';
import { STATUS as STATUS_HI } from './hi';
import { STATUS as STATUS_JA } from './ja';
import { STATUS as STATUS_ZH_HANS } from './zh-Hans';
import { STATUS as STATUS_ZH_HANT } from './zh-Hant';
import { STATUS as STATUS_AR } from './ar';

export type LocaleStatus = 'draft' | 'reviewed';

/** Wrap a locale's own STATUS so the sheet reads `meta.es.status`. */
const s = (status: LocaleStatus) => ({ status });

export const es = s(STATUS_ES);
export const fr = s(STATUS_FR);
export const de = s(STATUS_DE);
export const ptBR = s(STATUS_PT_BR);
export const ptPT = s(STATUS_PT_PT);
export const hi = s(STATUS_HI);
export const ja = s(STATUS_JA);
export const zhHans = s(STATUS_ZH_HANS);
export const zhHant = s(STATUS_ZH_HANT);
export const ar = s(STATUS_AR);
