#!/usr/bin/env node
/**
 * verify-icons — every icon the app promises is the file it claims to be.
 *
 * A favicon is the one asset whose failure is invisible in development (the
 * browser caches whatever it first saw) and loud in a tab, on a home screen and
 * in a share sheet. So this checks the contract, not the pixels: every `href`
 * in the shell and every `src` in the manifest resolves, and every PNG carries
 * the width/height its `sizes` attribute advertises.
 *
 * It does not judge the artwork — that needs the owner's source image, which is
 * a separate decision (M1 STEP 3d, question 1).
 *
 *   node scripts/verify-icons.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUB = join(ROOT, 'public');
const problems = [];
const checked = [];

/** PNG dimensions live in the IHDR chunk: 8-byte signature, then w and h. */
function pngSize(abs) {
  const buf = readFileSync(abs);
  if (buf.length < 24 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function resolvePublic(href) {
  const clean = href.split('?')[0].split('#')[0];
  return join(PUB, clean.replace(/^\//, ''));
}

/* ── the shell ─────────────────────────────────────────────────────────── */
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<(?:link|meta)[^>]*>/g)].map((m) => m[0]);
for (const tag of tags) {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  if (!href || !/icon|manifest/i.test(tag)) continue;
  const abs = resolvePublic(href);
  const size = tag.match(/sizes="(\d+)x(\d+)"/);
  if (!existsSync(abs)) {
    problems.push(`index.html references ${href} — file missing`);
    continue;
  }
  checked.push(href);
  if (size && /\.png$/i.test(href)) {
    const dim = pngSize(abs);
    if (!dim) problems.push(`${href} is not a readable PNG`);
    else if (dim.w !== Number(size[1]) || dim.h !== Number(size[2])) {
      problems.push(`${href} claims ${size[1]}x${size[2]} but is ${dim.w}x${dim.h}`);
    }
  }
}

/* ── the manifest ──────────────────────────────────────────────────────── */
const manifestPath = join(PUB, 'manifest.json');
if (!existsSync(manifestPath)) problems.push('public/manifest.json is missing');
else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const icon of manifest.icons ?? []) {
    const abs = resolvePublic(icon.src);
    if (!existsSync(abs)) {
      problems.push(`manifest icon ${icon.src} is missing`);
      continue;
    }
    checked.push(icon.src);
    const [w, h] = String(icon.sizes ?? '').split('x').map(Number);
    if (/\.png$/i.test(icon.src) && w) {
      const dim = pngSize(abs);
      if (!dim) problems.push(`manifest icon ${icon.src} is not a readable PNG`);
      else if (dim.w !== w || dim.h !== h) {
        problems.push(`manifest icon ${icon.src} claims ${icon.sizes} but is ${dim.w}x${dim.h}`);
      }
    }
  }
  // A maskable icon is what a home screen crops to its own shape; without one
  // Android draws the square icon inside a white circle.
  if (!(manifest.icons ?? []).some((i) => /maskable/.test(i.purpose ?? ''))) {
    problems.push('manifest has no maskable icon');
  }
}

/* ── the ICO browsers ask for first ────────────────────────────────────── */
const ico = join(PUB, 'favicon.ico');
if (!existsSync(ico)) problems.push('public/favicon.ico is missing');

if (problems.length) {
  console.error(`\n[verify-icons] ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[verify-icons] clean — ${checked.length} icon reference(s) resolve and match their declared size`);
