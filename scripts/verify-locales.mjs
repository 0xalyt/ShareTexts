// Locale gate (P6 STEP 1c).
//
// The app can show eleven locales. This gate is what stops the eleventh from
// being quietly broken:
//
//   1. STATUS. Every locale file declares its own status. A locale that claims
//      'reviewed' while still carrying English is a lie shown to a reader, so
//      the gate fails it.
//   2. Coverage. How many keys the locale actually translates, and how many it
//      inherits from its variant base or from English. Printed every run — the
//      number is the backlog, not a secret.
//   3. Placeholders. Every {placeholder} in English must appear in the locale's
//      version of the same key, and nothing else may appear. A lost {name} is
//      a sentence with a hole in twenty languages.
//   4. English copies. A key whose value is byte-identical to English is
//      untranslated. Those are allowed only on an explicit, per-locale
//      allow-list (`docs/redesign/i18n-allowlist.json`) — a ratchet: the list
//      may shrink, never grow. `--update-allowlist` rewrites it so the current
//      state becomes the baseline; that is a deliberate act, in its own commit.
//   5. Registry sanity. Variant bases must exist, directions must be known, and
//      no locale may inherit from itself.
//
// Run: node scripts/verify-locales.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'src/lib/messages';
const ALLOW = 'docs/redesign/i18n-allowlist.json';
const updateAllow = process.argv.includes('--update-allowlist');

const problems = [];
const warn = [];

// ── dictionary parsing ────────────────────────────────────────────────────
/** Read `'key': 'value',` entries from a message file, unescaping as we go. */
function parseDict(file) {
  const src = readFileSync(`${DIR}/${file}`, 'utf8');
  const out = new Map();
  // Entries are single-line: key, colon, a quoted value, optional trailing comma.
  const re = /^\s*(['"])([A-Za-z0-9_.]+)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3\s*,?\s*$/gm;
  let m;
  while ((m = re.exec(src))) {
    const value = m[4]
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\u2019/g, '’')
      .replace(/\\n/g, ' ');
    out.set(m[2], value);
  }
  const status = /export const STATUS = '(draft|reviewed)'/.exec(src)?.[1];
  return { keys: out, status, src };
}

// ── registry (the one list of locales) ────────────────────────────────────
const registrySrc = readFileSync(`${DIR}/registry.ts`, 'utf8');
const locales = [];
{
  const re = /code:\s*'([^']+)',\s*native:\s*'([^']*)',\s*english:\s*'([^']*)',\s*dir:\s*'(ltr|rtl)'(?:,\s*base:\s*'([^']+)')?/g;
  let m;
  while ((m = re.exec(registrySrc))) {
    locales.push({ code: m[1], native: m[2], english: m[3], dir: m[4], base: m[5] || null });
  }
}
if (locales.length < 2) problems.push('registry.ts: parsed no locales — parser is broken');

const byCode = new Map(locales.map((l) => [l.code, l]));
for (const l of locales) {
  if (l.base) {
    if (!byCode.has(l.base)) problems.push(`registry: ${l.code} inherits from unknown locale "${l.base}"`);
    if (l.base === l.code) problems.push(`registry: ${l.code} inherits from itself`);
  }
  if (!['ltr', 'rtl'].includes(l.dir)) problems.push(`registry: ${l.code} has unknown direction "${l.dir}"`);
}

// The source dictionary: every key the app asks for.
const en = parseDict('en.ts');
const enKeys = [...en.keys.keys()];
if (enKeys.length < 500) problems.push(`en.ts: parsed only ${enKeys.length} keys — parser is broken`);

// ── per-locale checks ─────────────────────────────────────────────────────
const allow = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, 'utf8')) : {};
const nextAllow = {};
const summary = [];

for (const locale of locales) {
  const file = `${locale.code}.ts`;
  const { keys, status } = parseDict(file);
  if (locale.code === 'en') {
    summary.push({ code: 'en', status: 'source', coverage: 'source', own: enKeys.length, total: enKeys.length, english: 0 });
    continue;
  }
  if (!status) {
    problems.push(`${file}: no STATUS export — a locale must say whether it is draft or reviewed`);
  }

  // resolve through the variant chain, exactly as the runtime does
  const resolved = (key) => {
    let cur = locale.code;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const dict = cur === 'en' ? en.keys : parseDict(`${cur}.ts`).keys;
      if (dict.has(key)) return { value: dict.get(key), from: cur };
      cur = byCode.get(cur)?.base ?? null;
    }
    if (en.keys.has(key)) return { value: en.keys.get(key), from: 'en' };
    return null;
  };

  // 3. placeholders, on the keys this locale itself carries
  const ph = (s) => new Set([...s.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]));
  for (const [key, value] of keys) {
    const base = en.keys.get(key);
    if (base === undefined) {
      warn.push(`${file}: "${key}" is not an English key (dead translation)`);
      continue;
    }
    const want = ph(base);
    const got = ph(value);
    for (const p of want) if (!got.has(p)) problems.push(`${file} ${key}: missing {${p}}`);
    for (const p of got) if (!want.has(p)) problems.push(`${file} ${key}: unknown placeholder {${p}}`);
  }

  // 4. English copies: identical value, and the value is words
  const englishKeys = [];
  for (const key of enKeys) {
    const r = resolved(key);
    if (!r) {
      problems.push(`${file}: no value for "${key}" anywhere in the chain`);
      continue;
    }
    const baseValue = en.keys.get(key);
    const looksEnglish = r.from === 'en' || (r.value === baseValue && /[A-Za-z]{3}/.test(r.value) && r.value.length > 3);
    if (looksEnglish) englishKeys.push(key);
  }

  const allowed = new Set(allow[locale.code] || []);
  const fresh = englishKeys.filter((k) => !allowed.has(k));
  nextAllow[locale.code] = englishKeys;
  if (fresh.length) {
    problems.push(
      `${file}: ${fresh.length} untranslated English string(s) not on the allow-list — ` +
        `first: ${fresh.slice(0, 5).map((k) => `"${k}"`).join(', ')}`,
    );
  }
  if (status === 'reviewed' && englishKeys.length > 0) {
    problems.push(`${file}: claims STATUS reviewed but ${englishKeys.length} key(s) are still English`);
  }

  const own = [...keys.keys()].filter((k) => en.keys.has(k)).length;
  summary.push({
    code: locale.code,
    status: status || 'MISSING',
    coverage: `${Math.round((own / enKeys.length) * 100)}%`,
    own,
    total: enKeys.length,
    english: englishKeys.length,
  });
}

// ── report ────────────────────────────────────────────────────────────────
const pad = (v, n) => String(v).padEnd(n);
console.log('locale      status    own keys   coverage   still English');
for (const s of summary) {
  console.log(
    `${pad(s.code, 12)}${pad(s.status, 10)}${pad(s.own, 11)}${pad(s.coverage, 11)}${s.english}`,
  );
}
for (const w of warn) console.log(`  note: ${w}`);

if (updateAllow) {
  writeFileSync(ALLOW, `${JSON.stringify(nextAllow, null, 2)}\n`);
  console.log(`\nallow-list written: ${ALLOW}`);
}

if (problems.length) {
  console.error(`\nverify-locales: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  if (problems.length > 40) console.error(`  …and ${problems.length - 40} more`);
  process.exit(1);
}

console.log(`\nverify-locales: ${locales.length} locales green`);
