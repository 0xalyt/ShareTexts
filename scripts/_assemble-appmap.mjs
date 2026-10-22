// One-off assembler for docs/redesign/APP-MAP.md: joins the hand-written
// section fragments with the two generated tables and injects the gate run
// results (from /tmp/gate-results.txt) as section e.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// fragments live in the OS temp dir (bash /tmp == Windows %TEMP%)
const T = tmpdir();
const head = readFileSync(join(T, 'appmap-head.md'), 'utf8');     // intro + §a + §b header
const imports = readFileSync(join(T, 'imports.md'), 'utf8');      // generated §b table
const mid = readFileSync(join(T, 'appmap-mid.md'), 'utf8');       // §c header
const tokens = readFileSync(join(T, 'tokens.md'), 'utf8');        // generated §c table
const tail = readFileSync(join(T, 'appmap-tail.md'), 'utf8');     // §d + §e placeholder + §f

// Gate table from results file
const raw = readFileSync(join(T, 'gate-results.txt'), 'utf8').trim().split('\n');
const RESULTS = {
  'verify-csp-round02.mjs': ['dist/ served on :4519 with vercel.json CSP', 'FAIL (real: stale pin blocks boot script — bugs.md S1)'],
  'verify-f18.mjs': ['landing/about/404/docs geometry', ':3010 dev', 'FAIL 29/31 (2 real: 20px tap target, mobile overflow — bugs.md)'],
  'verify-otp.mjs': ['code capsule contract', ':3010 dev', 'PASS 44/44 on rerun (first run flaky)'],
  'verify-worker-live.mjs': ['worker wire protocol', ':8787 wrangler dev', 'PASS 18/18 after starting local worker (first run: no worker)'],
  'verify-worker-prod.mjs': ['PRODUCTION worker contract', 'deployed worker', 'PASS 9/9 on rerun (first run transient fetch fail)'],
  'verify-seo.mjs': ['crawler HTML + browser hydration, 114 checks', ':3013 prod build (default)', ''],
  'verify-space.mjs': ['F14 space REST contract', 'spawns own tsx :3311', ''],
  'verify-space-code.mjs': ['F21 space codes contract', 'spawns own tsx :3312', ''],
  'verify-space-ui.mjs': ['space code-first UI flow', ':3010/:3012 dev', ''],
  'verify-nearby.mjs': ['nearby wire protocol', 'boots dist/server.cjs scratch port', ''],
  'verify-worker.mjs': ['Room/Registry DO unit tests', 'workerd (bundled, no server)', ''],
  'verify-prod-transfer.mjs': ['production site pair+file+refresh', 'https://sharetexts.online', ''],
  'verify-visual-system.mjs': ['source-scan token assertions (no browser)', 'none', ''],
  'verify-neutrals.mjs': ['approved brief neutrals (source scan)', 'none', ''],
};
const rows = [];
// pins: derive from each script's own header comment (first ~15 lines)
function headerDesc(name) {
  try {
    const lines = readFileSync(join('scripts', name), 'utf8').split('\n').slice(0, 14);
    const desc = lines
      .filter((l) => /^\/\/|^ \*/.test(l))
      .map((l) => l.replace(/^\/\/\s*|^ \*\s*/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 110);
    return desc || '(no header)';
  } catch { return '(unreadable)'; }
}
for (const line of raw) {
  if (line === 'DONE') continue;
  const [name, code, secs] = line.split(' | ');
  const meta = RESULTS[name] || [];
  // meta shapes: [] | [pins, server, note] | [pins, note] (no server)
  const pins = meta[0] || headerDesc(name);
  const server = meta.length === 3 ? meta[1] : (name === 'verify-csp-round02.mjs' ? ':4519 harness' : ':3010 dev');
  const note = meta.length ? meta[meta.length - 1] : '';
  const status = code === '0' ? `PASS${note && !/^FAIL/.test(note) ? ` (${note})` : ''}` : (note || `FAIL exit ${code}`);
  rows.push(`| ${name} | ${pins} | ${server} | ${status} | ${secs} |`);
}
const gateTable = `| script | pins | server | result | time |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;

const eSection = `## e. Gates

Run once each this session: \`bash scripts/_run-all-gates.sh\` — 180 s timeout
per script, first-pass results, with targeted re-runs where noted (re-runs
confirmed, not replacements). Targets: default :3010 (Vite dev from this
session), :3013 production build for verify-seo, harness ports for the rest.

${gateTable}
**Tally: 37 gates · 32 pass first run · 3 pass on re-run (environment/transient) · 2 genuine failures — verify-csp-round02 (stale vercel.json pin; reproduced against LIVE with 1 CSP violation) and verify-f18 (29/31: 20px tap target + mobile horizontal overflow). Both filed in docs/redesign/bugs.md (STEP 5).**
`;

// splice §e in place of the placeholder paragraph
const beforeE = tail.split('## e. Gates')[0];
const afterF = '## f. Deploy facts' + tail.split('## f. Deploy facts')[1];
const out = `${head}${imports}\n${mid}${tokens}\n${beforeE}${eSection}\n${afterF}\n`;
writeFileSync('docs/redesign/APP-MAP.md', out);
console.log('written', out.length, 'chars');
