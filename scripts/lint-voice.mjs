// Voice gate (DESIGN.md §1, §14; P6 STEP 1a).
//
// The contract voice is calm, quick, friendly and honest. This gate reads the
// English dictionary — the source every other locale is drafted from — and
// fails on the habits that break that voice:
//
//   1. Banned words. Marketing filler the contract's anti-slop list names, or
//      words that promise something the product cannot prove.
//   2. Exclamation marks. Never. Warmth comes from words, not volume.
//   3. Sentences over 12 words. If a sentence needs a comma splice to survive,
//      it is two sentences.
//   4. The "No X, no Y, no Z" triad. Once is a rhythm; three times is a tic.
//   5. Emoji inside UI copy (§7: emoji are reactions, never decoration).
//
// Two escape hatches, both narrow and deliberate:
//   • `{placeholder}` and code-ish fragments ({t}, {count}, +, ·) are stripped
//     before the word count, because they are not words.
//   • A line may carry `// voice-ok: <reason>` when the wording is quoted from
//     a third party or is a proper noun. Every use is printed, so the list can
//     never grow quietly.
//
// Run: node scripts/lint-voice.mjs   (exit 1 on any violation)
import { readFileSync } from 'node:fs';

const FILE = 'src/lib/messages/en.ts';

// Words and phrases that are banned outright in user-visible English.
// Kept short on purpose: a long list becomes a game, a short one stays read.
const BANNED = [
  // marketing filler (§14 anti-slop)
  'seamless', 'seamlessly', 'effortless', 'effortlessly', 'blazing', 'lightning-fast',
  'cutting-edge', 'next-generation', 'game-changing', 'world-class', 'best-in-class',
  'state-of-the-art', 'supercharge', 'unlock', 'revolutionise', 'revolutionize',
  'leverage', 'synergy', 'empower', 'elevate', 'immerse', 'immersive', 'delight',
  'hassle-free', 'state of the art', 'magical', 'magic', 'robust', 'ultimate',
  // promises that need proof we do not have
  'instantly', 'instant', 'in seconds', 'never fails', 'guaranteed', 'always free',
  // corporate distance
  'utilize', 'utilise', 'please note', 'kindly', 'sorry for the inconvenience',
  'oops', 'whoops', 'uh oh',
];

// A sentence longer than this fails. 12 is the contract number; the count
// ignores placeholders and code fragments.
const MAX_WORDS = 12;

const SENTENCE_SPLIT = /(?<=[.!?…])\s+/;

/** Strip placeholders, code fragments and typographic furniture. */
function words(s) {
  return s
    .replace(/\{[a-z0-9]+\}/gi, ' ')
    .replace(/[·•]/g, ' ')
    .replace(/\b[A-Za-z0-9_-]+\.(png|jpg|webp|mp4|json|svg)\b/gi, ' ')
    .replace(/[“”"']/g, '')
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w) && w.replace(/[^A-Za-z]/g, '').length > 1);
}

const src = readFileSync(FILE, 'utf8');
const problems = [];

// Dictionary entries look like  'key.name': 'value',  or with double quotes.
// Values may be on one line only — the file has no multi-line entries.
const ENTRY = /^\s*(['"])([A-Za-z0-9_.]+)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3\s*,?\s*(\/\/\s*voice-ok:\s*(.*))?$/;

const lines = src.split('\n');
const seen = new Map();
lines.forEach((line, i) => {
  const m = ENTRY.exec(line);
  if (!m) return;
  const key = m[2];
  const raw = m[4];
  const esc = m[5] ? ` [voice-ok: ${m[6]}]` : '';
  // Undo the TypeScript string escaping the source uses for quotes.
  const text = raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\u2019/g, '’').replace(/\\n/g, ' ');
  const at = `${FILE}:${i + 1} ${key}`;
  seen.set(key, text);
  const lower = text.toLowerCase();

  // 1. banned words / phrases
  for (const bad of BANNED) {
    const re = new RegExp(`(^|[^a-z])${bad.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(lower)) problems.push(`${at}: banned word "${bad}"${esc}`);
  }

  // 2. exclamation marks
  if (text.includes('!')) problems.push(`${at}: exclamation mark${esc}`);

  // 3. sentence length
  for (const s of text.split(SENTENCE_SPLIT)) {
    const n = words(s).length;
    if (n > MAX_WORDS) problems.push(`${at}: ${n}-word sentence — "${s.trim()}"${esc}`);
  }

  // 4. the "No X, no Y, no Z" triad: three or more "no <thing>" clauses.
  const negations = (lower.match(/(^|[\s.,;:—–-])no\s+[a-z]/g) || []).length;
  if (negations >= 3) problems.push(`${at}: ${negations} "no …" clauses in one string${esc}`);

  // 5. emoji as decoration
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) problems.push(`${at}: emoji in copy${esc}`);
});

// Sanity: the parser must actually have read the dictionary, or every check
// above passes vacuously — a gate that checks nothing is worse than no gate.
if (seen.size < 600) {
  console.error(`lint-voice: parsed only ${seen.size} entries from ${FILE} — parser is broken`);
  process.exit(1);
}

// Placeholder parity is a separate concern (verify-locales), but a string that
// lost its {placeholder} while being reworded is a voice bug worth catching here.
for (const [key, text] of seen) {
  const open = (text.match(/\{/g) || []).length;
  const close = (text.match(/\}/g) || []).length;
  if (open !== close) problems.push(`${FILE} ${key}: unbalanced {placeholder}`);
}

const escaped = [...seen.entries()].filter(([, t]) => t.length > 0);

if (problems.length) {
  console.error(`lint-voice: ${problems.length} problem(s) in ${seen.size} strings\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`lint-voice: ${seen.size} strings, ${escaped.length} non-empty — clean`);
