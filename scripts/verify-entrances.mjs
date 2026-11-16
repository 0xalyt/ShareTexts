#!/usr/bin/env node
/**
 * verify-entrances — nothing appears out of nothing.
 *
 * An entrance that starts at scale(0) (or 0.2, or 0.5) is a pop: the element
 * is absent, then it is present, and the eye reads a flicker rather than an
 * arrival. The rule is a floor of 0.9 plus opacity, on the published out
 * curve, under 300ms for ordinary UI.
 *
 * This scans the source rather than a built page, because the offending
 * value is a literal in a props object — and a regex over the tree is the one
 * check that keeps it from creeping back in during the next feature.
 *
 * Exceptions are listed with the reason they are exceptions: an expanding
 * ripple, a burst particle or a looping loader is not an entrance.
 *
 *   node scripts/verify-entrances.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');
const FLOOR = 0.9;

/** keyframe / selector → why a sub-floor scale is correct there */
const ALLOWED = new Map([
  ['st-ring', 'one-shot arrival ripple that EXPANDS outward — the scale is the wave, not the element appearing'],
  ['st-radar-ping', 'looping radar wave, expands from 0.62 and fades'],
  ['st-halo', 'looping halo wave, expands and fades'],
  ['st-logo-wave', 'looping loader wave around the logo'],
  ['st-logo-ring', 'looping loader ring around the logo'],
  ['device-link-glow', 'looping 14px glow pulse beside the link diagram'],
  ['emoji-particle', 'burst particle that flies and scales up; it is a particle, not a surface'],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const bad = [];
const exempt = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  // ── TSX: initial={{ … scale: 0.x … }} ────────────────────────────────────
  if (/\.tsx?$/.test(file)) {
    const re = /initial=\{\{([^}]*)\}\}/g;
    let m;
    while ((m = re.exec(text))) {
      const body = m[1];
      const s = /scale:\s*(-?[0-9.]+)/.exec(body);
      if (!s) continue;
      const v = Number(s[1]);
      if (!Number.isFinite(v) || v >= FLOOR) continue;
      const line = text.slice(0, m.index).split('\n').length;
      // An element that is a pulse, a particle or a loop is allowed to start
      // tiny — say so on the line above it, with the reason.
      const near = text.slice(Math.max(0, m.index - 420), m.index);
      const waive = /entrance-exempt:\s*([^\n*]+)/.exec(near);
      if (waive) {
        exempt.push({ file: rel, line, value: v, keyframe: waive[1].trim() });
        continue;
      }
      bad.push({ file: rel, line, value: v, snippet: `initial={{${body.trim().slice(0, 64)}…}}` });
    }
  }

  // ── CSS: a 0% / from block that starts a surface below the floor ─────────
  if (file.endsWith('.css')) {
    const re = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(text))) {
      const [, name, body] = m;
      const start = /(?:^|\n)\s*(?:0%|from)\s*\{([^}]*)\}/.exec(body);
      if (!start) continue;
      const s = /scale\(\s*(-?[0-9.]+)\s*\)/.exec(start[1]);
      if (!s) continue;
      const v = Number(s[1]);
      if (v >= FLOOR) continue;
      const entry = { file: rel, keyframe: name, value: v };
      if (ALLOWED.has(name)) exempt.push(entry);
      else bad.push({ ...entry, snippet: start[1].trim() });
    }
  }
}

for (const e of exempt) {
  const why = ALLOWED.get(e.keyframe) ?? e.keyframe;
  console.log(`SKIP ${e.file}${e.line ? `:${e.line}` : ''} — ${e.value} — ${why}`);
}

if (bad.length) {
  console.log('');
  for (const b of bad) {
    console.log(`FAIL ${b.file}:${b.line ?? ''} ${b.keyframe ?? ''} scale ${b.value} — ${b.snippet}`);
  }
  console.log(`\n${bad.length} entrance(s) below ${FLOOR}. Start at ${FLOOR} or higher, with opacity, ease-out.`);
  process.exit(1);
}

console.log(`\nOK — every entrance starts at scale ≥ ${FLOOR} (${exempt.length} ripple/particle exceptions).`);
