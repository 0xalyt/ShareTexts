#!/usr/bin/env node
// ---------------------------------------------------------------------------
// diff-matrix.mjs — the strict pixel proof for the capture matrix.
//
//   node scripts/diff-matrix.mjs <dirA> <dirB> [--masks file] [--tolerance N]
//
// Compares every top-level <screen>-<viewport>-<theme>.png in <dirA> against
// <dirB> per-pixel. A pixel counts as different when ANY channel differs by
// more than --tolerance (default 0 → byte-exact). Masks paint the SAME solid
// colour (the mask's first pixel) into both images before comparing, so a
// masked box compares equal to itself and its contents are never asserted.
//
// Prints a table (screen | diff px | % | masked?) and, for each unmasked
// diff, the geometry needed to cut a mask: the overall bounding box plus the
// busiest 40 px cells. Exits 1 if any unmasked diff remains.
// ---------------------------------------------------------------------------
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const TOL = Number(opt('tolerance', '0'));
if (pos.length < 2) {
  console.error('usage: node scripts/diff-matrix.mjs <dirA> <dirB> [--masks file] [--tolerance N]');
  process.exit(2);
}
if (!Number.isInteger(TOL) || TOL < 0 || TOL > 255) {
  console.error('--tolerance must be an integer from 0 through 255');
  process.exit(2);
}
const [dirA, dirB] = pos;

function decodePNG(path) {
  const buf = readFileSync(path);
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (tag === 'IDAT') idat.push(data);
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(type)) {
    throw new Error(`${basename(path)}: unsupported PNG (depth=${depth} type=${type} interlace=${interlace})`);
  }
  const ch = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const v = raw[p++];
      const a = x >= ch ? row[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`${basename(path)}: bad filter ${filter}`);
      }
      row[x] = r & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

function loadMasks(file) {
  if (!file) return {};
  if (!existsSync(file)) throw new Error(`mask file not found: ${file}`);
  const masks = JSON.parse(readFileSync(file, 'utf8'));
  if (!masks || typeof masks !== 'object' || Array.isArray(masks)) {
    throw new Error(`mask file must contain an object: ${file}`);
  }
  return masks;
}

/** A mask entry is either a bare array of rects `[[x0,y0,x1,y1], …]` or a
 *  documented `{ "boxes": […], "cause": "…" }` object (audit/*.json keeps
 *  the cause for humans; the tool only needs the boxes). */
function toRects(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.boxes)) return v.boxes;
  return [];
}

function masksFor(filename, masks) {
  const name = filename.endsWith('.png') ? filename.slice(0, -4) : filename;
  const direct = masks[filename] ?? masks[name];
  if (direct) return toRects(direct);
  const out = [];
  for (const [pattern, value] of Object.entries(masks)) {
    if (!pattern.endsWith('*')) continue;
    const prefix = pattern.slice(0, -1).replace(/\.png$/, '');
    if (name.startsWith(prefix)) out.push(...toRects(value));
  }
  return out;
}

function paintMask(img, rects) {
  // Paint every rect with ONE fixed colour in BOTH images. (Filling each
  // image with its own top-left pixel looks equivalent but isn't: if a mask
  // edge lands on different content, the two fills differ and the whole rect
  // reports as a diff — the mask itself becomes the noise it hides.)
  const FILL = [0, 0, 0, 255];
  for (const rect of rects) {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isInteger)) {
      throw new Error(`invalid mask rectangle: ${JSON.stringify(rect)}`);
    }
    const [x0, y0, x1, y1] = rect;
    if (x0 < 0 || y0 < 0 || x1 < x0 || y1 < y0 || x1 >= img.w || y1 >= img.h) {
      throw new Error(`mask rectangle outside ${img.w}x${img.h}: ${JSON.stringify(rect)}`);
    }
    const sx = x0;
    const sy = y0;
    const ex = x1;
    const ey = y1;
    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        const i = (y * img.w + x) * img.ch;
        img.data[i] = FILL[0];
        img.data[i + 1] = FILL[1];
        img.data[i + 2] = FILL[2];
        if (img.ch === 4) img.data[i + 3] = FILL[3];
      }
    }
  }
}

const maskFile = opt('masks', null);
const masks = loadMasks(maskFile);

const filesA = readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
const filesB = readdirSync(dirB).filter((f) => f.endsWith('.png')).sort();
if (filesA.length === 0) throw new Error(`no PNG screenshots found in ${dirA}`);
let bad = 0, changed = 0, identical = 0, masked = 0;
const CELL = 40;
const rows = [];

for (const f of filesA) {
  const pb = join(dirB, f);
  if (!existsSync(pb)) { rows.push([f, 'MISSING IN B', '', '']); bad++; continue; }
  let A, B;
  try { A = decodePNG(join(dirA, f)); B = decodePNG(pb); }
  catch (e) { rows.push([f, `DECODE: ${e.message}`, '', '']); bad++; continue; }
  if (A.w !== B.w || A.h !== B.h || A.ch !== B.ch) {
    rows.push([f, `SIZE ${A.w}x${A.h}x${A.ch} vs ${B.w}x${B.h}x${B.ch}`, '', '']); bad++; continue;
  }
  const rects = masksFor(f, masks);
  if (rects.length) { paintMask(A, rects); paintMask(B, rects); }

  const n = A.w * A.h;
  const mark = new Uint8Array(n);
  let diff = 0;
  const cells = new Map();
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let i = 0; i < n; i++) {
    const o = i * A.ch;
    const d = Math.max(
      Math.abs(A.data[o] - B.data[o]),
      Math.abs(A.data[o + 1] - B.data[o + 1]),
      Math.abs(A.data[o + 2] - B.data[o + 2]),
    );
    if (d > TOL) {
      diff++; mark[i] = 1;
      const x = i % A.w, y = (i / A.w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const key = `${(x / CELL) | 0},${(y / CELL) | 0}`;
      cells.set(key, (cells.get(key) || 0) + 1);
    }
  }
  if (diff === 0) { identical++; rows.push([f, '0', '0.00%', rects.length ? 'masked' : '']); if (rects.length) masked++; continue; }
  changed++;
  const hot = [...cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => `(${k}×${CELL})${v}px`).join(' ');
  rows.push([
    f,
    String(diff),
    `${((diff / n) * 100).toFixed(2)}%`,
    // diff is measured AFTER painting, so anything left is outside the masks
    `${rects.length ? `${rects.length} box(es) painted, diff OUTSIDE them ` : 'no masks '}bbox=[${minX},${minY},${maxX},${maxY}] hot: ${hot}`,
  ]);
  bad++;
}
for (const f of filesB) {
  if (!filesA.includes(f)) {
    rows.push([f, 'MISSING IN A', '', '']);
    bad++;
  }
}

const w0 = Math.max(...rows.map((r) => r[0].length), 6);
console.log('screen'.padEnd(w0) + ' | diff px | %        | notes');
console.log('-'.repeat(w0) + '-|---------|----------|------');
for (const r of rows) console.log(String(r[0]).padEnd(w0) + ' | ' + String(r[1]).padStart(7) + ' | ' + String(r[2]).padEnd(8) + ' | ' + r[3]);
console.log(`\n${identical} identical · ${changed} differ · ${masked} masked · tolerance=${TOL} · masks=${maskFile || '(none)'}`);
if (bad > 0) {
  console.error(`FAIL: ${bad} screen(s) with unmasked differences`);
  process.exit(1);
}
console.log('PASS: every screen byte-identical (masked boxes painted equal)');
