// The one list of locales the app can show.
//
// This module is deliberately data-only: the app imports it, and
// scripts/verify-locales.mjs parses it, so the gate and the runtime can never
// disagree about which locales exist, what they inherit, or their direction.
// Adding a language = a row here + a dictionary file with its own STATUS.
import * as meta from './meta';

/**
 * Locale codes are real BCP 47 tags. `zh` was one language and is two scripts;
 * `pt` was one language and is two standards. Tags keep them apart.
 */
export type Lang =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt-BR'
  | 'pt-PT'
  | 'hi'
  | 'ja'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'ar';

export type Dir = 'ltr' | 'rtl';

export interface LangMeta {
  code: Lang;
  /** The language's own name — the only label a speaker can find. */
  native: string;
  /** Its name in English, for reports and gates. */
  english: string;
  dir: Dir;
  /** Variant parent: keys it does not carry come from here, then English. */
  base?: Lang;
  /** 'draft' until the owner promotes the locale file's own STATUS. */
  status: 'draft' | 'reviewed';
}

export const LANGS: LangMeta[] = [
  { code: 'en', native: 'English', english: 'English', dir: 'ltr', status: 'reviewed' },
  { code: 'es', native: 'Español', english: 'Spanish', dir: 'ltr', status: meta.es.status },
  { code: 'fr', native: 'Français', english: 'French', dir: 'ltr', status: meta.fr.status },
  { code: 'de', native: 'Deutsch', english: 'German', dir: 'ltr', status: meta.de.status },
  { code: 'pt-BR', native: 'Português (Brasil)', english: 'Portuguese, Brazil', dir: 'ltr', status: meta.ptBR.status },
  { code: 'pt-PT', native: 'Português (Portugal)', english: 'Portuguese, Portugal', dir: 'ltr', base: 'pt-BR', status: meta.ptPT.status },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', dir: 'ltr', status: meta.hi.status },
  { code: 'ja', native: '日本語', english: 'Japanese', dir: 'ltr', status: meta.ja.status },
  { code: 'zh-Hans', native: '简体中文', english: 'Chinese, Simplified', dir: 'ltr', status: meta.zhHans.status },
  { code: 'zh-Hant', native: '繁體中文', english: 'Chinese, Traditional', dir: 'ltr', base: 'zh-Hans', status: meta.zhHant.status },
  { code: 'ar', native: 'العربية', english: 'Arabic', dir: 'rtl', status: meta.ar.status },
];
