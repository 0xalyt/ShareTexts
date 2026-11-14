#!/usr/bin/env node
/**
 * verify-claims — the product's words, checked against what the code allows.
 *
 * Reads docs/claims.forbidden.json and scans the files each rule claims to
 * cover. A hit fails the gate with file:line and the rule's reason, so the
 * person fixing it knows WHY the sentence is off-limits, not just that a
 * regex matched.
 *
 * Opting out is possible but never silent: append `claims-ok: <reason>` to the
 * line and the gate prints every exemption it honoured. A silent exemption is
 * how a false claim survives a linter.
 *
 *   node scripts/verify-claims.mjs [--quiet]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const RULES = JSON.parse(readFileSync(join(ROOT, 'docs/claims.forbidden.json'), 'utf8')).rules;
const quiet = process.argv.includes('--quiet');

/** Expand a scope entry into concrete files. Directories are walked. */
function expand(scope) {
  const out = [];
  for (const entry of scope) {
    const abs = join(ROOT, entry);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const f of readdirSync(abs)) {
        if (/\.(ts|tsx|html|md|txt)$/.test(f)) out.push(join(entry, f));
      }
    } else {
      out.push(entry);
    }
  }
  return out;
}

const findings = [];
const exemptions = [];
const checked = new Set();

for (const rule of RULES) {
  const re = new RegExp(rule.pattern, 'i');
  for (const rel of expand(rule.scope)) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    checked.add(rel);
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      const ok = line.match(/claims-ok:\s*(.+?)\s*(\*\/|-->|$)/);
      if (ok) {
        exemptions.push({ rule: rule.id, where: `${rel}:${i + 1}`, reason: ok[1].slice(0, 90) });
        return;
      }
      findings.push({ rule: rule.id, where: `${rel}:${i + 1}`, reason: rule.reason, text: line.trim().slice(0, 160) });
    });
  }
}

if (!quiet) {
  for (const ex of exemptions) console.log(`  exempt  [${ex.rule}] ${ex.where} — ${ex.reason}`);
}

if (findings.length) {
  console.error(`\n[verify-claims] ${findings.length} forbidden claim(s) in ${checked.size} file(s):\n`);
  for (const f of findings) {
    console.error(`  ✗ [${f.rule}] ${f.where}`);
    console.error(`      text:   ${f.text}`);
    console.error(`      why:    ${f.reason}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`[verify-claims] clean — ${RULES.length} rules over ${checked.size} file(s), ${exemptions.length} declared exemption(s)`);
