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
  ['close-tab-erases', '關閉分頁，一切即消失。', true],
  ['close-tab-erases', '已儲存的項目保留在瀏覽器中。', false],
  ['nothing-stored', 'No app · No account · Nothing stored', true],
  ['nothing-stored', 'Nothing is ever stored.', true],
  ['nothing-stored', 'No data is stored on any server.', true],
  ['nothing-stored', 'No data is ever stored on any server.', true],
  ['nothing-stored', 'The server never sees your content.', true],
  ['nothing-stored', 'No copy is stored after it finishes.', true],
  ['nothing-stored', 'No files, messages, or metadata are stored on any server.', true],
  ['nothing-stored', 'No server storage', true],
  ['nothing-stored', 'Nothing is kept after the room closes.', true],
  ['nothing-stored', 'Transfers are never stored on a server.', true],
  ['nothing-stored', 'Rooms keep nothing after they close.', true],
  ['nothing-stored', 'Temporary Spaces store content server-side until closed or expired.', false],
  ['nothing-stored', 'Live-room content is not stored server-side. Saved items stay in this browser.', false],
  ['nothing-stored', 'No app · No account · Your devices', false],
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
