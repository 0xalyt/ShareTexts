import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from './messages/en';
import { LANGS, type Lang, type Dir } from './messages/registry';
import type { MsgKey } from './messages/types';

/**
 * The language engine.
 *
 * Three jobs, in the order a reader meets them:
 *   1. Decide the language from `navigator.languages`, in a ladder that a real
 *      speaker would recognise: exact tag, then language + script, then
 *      language + region (which is how zh-TW means Traditional), then the bare
 *      language, then the next candidate, then English.
 *   2. Look strings up through the locale → its variant base → English, so a
 *      half-finished variant shows its parent's words instead of holes.
 *   3. Tell the document which way to write: `dir` comes from the registry, and
 *      <html lang/dir> is updated with the full tag, which is what a screen
 *      reader needs to pick the right voice.
 */
export type { Lang, Dir } from './messages/registry';
export { LANGS } from './messages/registry';

type Dict = Partial<Record<MsgKey, string>>;

/**
 * English is the fallback every lookup ends at, so it is the one dictionary in
 * the entry chunk. The other ten are ~111 KB gzip of strings between them —
 * downloaded by the handful of people who read those languages, and by nobody
 * else. They load on demand (P7 STEP 1b).
 *
 * A dictionary is applied by mutating DICTS in place, so every `t` closure
 * already in flight sees it on its next call; the provider re-renders because
 * its own `lang` state only commits after the load resolves.
 */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>> = {
  es: () => import('./messages/es'),
  fr: () => import('./messages/fr'),
  de: () => import('./messages/de'),
  'pt-BR': () => import('./messages/pt-BR'),
  'pt-PT': () => import('./messages/pt-PT'),
  hi: () => import('./messages/hi'),
  ja: () => import('./messages/ja'),
  'zh-Hans': () => import('./messages/zh-Hans'),
  'zh-Hant': () => import('./messages/zh-Hant'),
  ar: () => import('./messages/ar'),
};

const DICTS: Partial<Record<Lang, Dict>> = { en };
const INFLIGHT = new Map<Lang, Promise<void>>();

/**
 * Load a locale and its variant parent (pt-PT reads pt-BR for the keys it has
 * not translated yet; zh-Hant reads zh-Hans). Never rejects: a dictionary that
 * fails to fetch leaves English in place, which is the same ladder a missing
 * key already walks.
 */
export function ensureLocale(lang: Lang): Promise<void> {
  const have = INFLIGHT.get(lang);
  if (have) return have;
  const loader = lang === 'en' ? undefined : LOADERS[lang as Exclude<Lang, 'en'>];
  if (!loader) return Promise.resolve();
  const next = loader()
    .then((mod) => {
      DICTS[lang] = (mod.default ?? mod) as Dict;
      const base = BY_BASE.get(lang);
      if (base) return ensureLocale(base as Lang);
      return undefined;
    })
    .then(() => undefined)
    .catch(() => undefined);
  INFLIGHT.set(lang, next);
  return next;
}

/** Every writing direction the engine can produce. Right-to-left today: Arabic;
 *  the code names the other three so a locale can never be added without a
 *  direction, and Hebrew, Persian and Urdu resolve correctly the day their
 *  dictionaries land. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

const BY_CODE = new Map<string, (typeof LANGS)[number]>(LANGS.map((l) => [l.code.toLowerCase(), l]));
const BY_BASE = new Map<string, string | undefined>(LANGS.map((l) => [l.code, l.base]));
const LANG_STORE = 'sharetext.locale';

/** Scripts for languages where one code covers two of them. */
const SCRIPT_OF_REGION: Record<string, 'Hans' | 'Hant'> = {
  cn: 'Hans', sg: 'Hans', my: 'Hans',
  tw: 'Hant', hk: 'Hant', mo: 'Hant',
};

/**
 * Resolve one BCP 47 tag to a shipped locale.
 * Exact tag → language + script → language + region → bare language.
 */
/** Bare codes older builds stored before zh and pt were split by script and
 *  standard. Kept as a named map so the ladder below stays one shape. */
const ALIAS: Record<string, Lang> = { pt: 'pt-BR', zh: 'zh-Hans' };

export function resolveLang(tag: string): Lang | null {
  const raw = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return null;

  const exact = BY_CODE.get(raw);
  if (exact) return exact.code;

  const alias = ALIAS[raw];
  if (alias) return alias;

  const parts = raw.split('-');
  const lang = parts[0];
  const script = parts.find((p) => p.length === 4 && /^[a-z]{4}$/.test(p));
  const region = parts.find((p) => p.length === 2 && /^[a-z]{2}$/.test(p) && p !== lang);

  if (script) {
    const byScript = BY_CODE.get(`${lang}-${script}`);
    if (byScript) return byScript.code;
  }
  if (region) {
    const byRegion = BY_CODE.get(`${lang}-${region}`);
    if (byRegion) return byRegion.code;
    if (lang === 'zh') {
      const s = SCRIPT_OF_REGION[region];
      if (s) return s === 'Hant' ? 'zh-Hant' : 'zh-Hans';
    }
  }
  const byLang = BY_CODE.get(lang);
  if (byLang) return byLang.code;
  return null;
}

/** The device's own answer, ignoring any saved choice. */
export function deviceLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const list =
    typeof navigator !== 'undefined'
      ? Array.from(navigator.languages?.length ? navigator.languages : [navigator.language])
      : [];
  for (const tag of list) {
    const hit = tag ? resolveLang(tag) : null;
    if (hit) return hit;
  }
  return 'en';
}

/** A saved choice wins; otherwise the device answers. */
function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANG_STORE);
    if (saved) {
      // Older builds stored the bare 'zh' and 'pt'; resolveLang maps those.
      const hit = resolveLang(saved);
      if (hit) return hit;
    }
  } catch { /* private mode */ }
  return deviceLang();
}

function metaOf(lang: Lang) {
  return BY_CODE.get(lang.toLowerCase()) ?? LANGS[0];
}

/** Locale → its variant bases → English. A dictionary that has not loaded yet
 *  is simply not in the chain, so a lookup falls through to English instead of
 *  throwing — the boot path awaits the load, so this is a safety net. */
function chain(lang: Lang): Dict[] {
  const out: Dict[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = lang;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const dict = DICTS[cur as Lang];
    if (dict) out.push(dict);
    cur = BY_BASE.get(cur);
  }
  out.push(en);
  return out;
}

/** The locale the first paint will use — resolved before React mounts, by the
 *  same ladder every later call uses. */
export function bootLocale(): Lang {
  return detectLang();
}

export interface I18nApi {
  lang: Lang;
  dir: Dir;
  /** True when the language follows the device (no stored choice). */
  auto: boolean;
  /** True while the locale is a draft the owner has not promoted. */
  beta: boolean;
  /** Translate key → active locale → its bases → English → the key itself. */
  t: (key: MsgKey, params?: Record<string, string | number>) => string;
  /**
   * A count through Intl.PluralRules: `${base}.${category}` when the locale has
   * that form, then `${base}.other`, then the base key. A language with more
   * plural forms than the dictionary carries falls back to `.other` — never to
   * a category name.
   */
  tCount: (base: string, n: number, params?: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
  /** Drop the stored choice and follow the device again. */
  useDeviceLanguage: () => void;
}

const I18nContext = createContext<I18nApi | null>(null);

function fill(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  let out = s;
  for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

function lookup(lang: Lang, key: string): string | undefined {
  for (const dict of chain(lang)) {
    const hit = dict[key as MsgKey];
    if (hit) return hit;
  }
  return undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  // "Automatic" means exactly one thing: no key in storage.
  const [auto, setAuto] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(LANG_STORE);
    } catch {
      return true;
    }
  });

  // <html lang/dir> follows the active locale. The tag is the full one
  // (zh-Hant, pt-BR) so a screen reader picks the right voice and :lang() can
  // match a variant; dir comes from the registry, not from a second list.
  useEffect(() => {
    const el = document.documentElement;
    const dir = metaOf(lang).dir;
    if (el.lang !== lang) el.lang = lang;
    if (el.dir !== dir) el.dir = dir;
    try {
      if (auto) localStorage.removeItem(LANG_STORE);
      else localStorage.setItem(LANG_STORE, lang);
    } catch { /* private mode */ }
  }, [lang, auto]);

  const api = useMemo<I18nApi>(() => {
    const t: I18nApi['t'] = (key, params) => fill(lookup(lang, key) ?? key, params);
    const tCount: I18nApi['tCount'] = (base, n, params) => {
      let cat = 'other';
      try {
        cat = new Intl.PluralRules(lang).select(n);
      } catch { /* very old browser: 'other' is always safe */ }
      const raw = lookup(lang, `${base}.${cat}`) ?? lookup(lang, `${base}.other`) ?? lookup(lang, base) ?? String(n);
      return fill(raw, { n, count: n, ...params });
    };
    return {
      lang,
      dir: metaOf(lang).dir,
      auto,
      beta: metaOf(lang).status !== 'reviewed',
      t,
      tCount,
      setLang: (l: Lang) => {
        setAuto(false);
        // The switch lands when the words are here, not before: committing
        // `lang` first would repaint the current screen in English for the
        // length of a chunk fetch.
        if (l === 'en' || DICTS[l]) {
          setLangState(l);
          return;
        }
        void ensureLocale(l).then(() => setLangState(l));
      },
      useDeviceLanguage: () => {
        try { localStorage.removeItem(LANG_STORE); } catch { /* private mode */ }
        setAuto(true);
        setLangState(deviceLang());
      },
    };
  }, [lang, auto]);

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Tolerate usage outside the provider (error boundaries etc.) with an
    // English passthrough — never crash rendering over a missing provider.
    return {
      lang: 'en',
      dir: 'ltr',
      auto: true,
      beta: false,
      t: (key, params) => fill((en as Record<string, string>)[key] ?? key, params),
      tCount: (base, n, params) => fill((en as Record<string, string>)[base] ?? String(n), { n, count: n, ...params }),
      setLang: () => {},
      useDeviceLanguage: () => {},
    };
  }
  return ctx;
}
