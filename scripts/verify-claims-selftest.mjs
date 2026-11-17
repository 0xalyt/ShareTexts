#!/usr/bin/env node
/**
 * verify-claims-selftest — a forbid rule that cannot match is decoration.
 *
 * `verify-claims.mjs` scans the repo and passes when nothing matches. If a new
 * rule's regex is subtly wrong, it also passes — silently, forever. This test
 * feeds each rule a sentence it must reject and a sentence it must accept, so
 * "the gate is green" means the gate can tell the difference.
 *
 *   node scripts/verify-claims-selftest.mjs
 */
import { readFileSync } from 'node:fs';

const RULES = JSON.parse(readFileSync('docs/claims.forbidden.json', 'utf8')).rules;
const byId = new Map(RULES.map((r) => [r.id, new RegExp(r.pattern, 'i')]));

const CASES = [
  ['nearby-appears', 'It appears under Available while ShareTexts is open on both devices; otherwise connect with a code.', true],
  ['nearby-appears', 'The other device appears automatically while ShareTexts is open on both.', true],
  ['nearby-appears', 'Turn on Nearby for 10 minutes on your other device and it appears here.', false],
  ['nearby-while-open', 'Nearby devices appear while ShareTexts is open on them.', true],
  ['nearby-while-open', 'Visible while ShareTexts is open', true],
  ['nearby-while-open', 'Devices on the same network can see this one until it ends', false],
  ['nearby-while-open', 'Turn on Nearby for 10 minutes on your other device and it appears here.', false],
];

let fail = 0;
for (const [id, text, shouldMatch] of CASES) {
  const re = byId.get(id);
  if (!re) {
    console.log(`FAIL [${id}] rule is missing from docs/claims.forbidden.json`);
    fail += 1;
    continue;
  }
  const matched = re.test(text);
  const ok = matched === shouldMatch;
  if (!ok) fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${shouldMatch ? 'rejects' : 'accepts'} “${text.slice(0, 60)}…”`);
}

console.log(`\n${CASES.length - fail}/${CASES.length} checks passed`);
process.exit(fail ? 1 : 0);
