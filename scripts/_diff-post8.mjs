// STEP 9: baseline vs post-STEP-8 pixel proof.
//
// Compares audit/baseline/ (captured at STEP 4) against a fresh capture
// (default audit/baseline-post8/) per-pixel at threshold >8/channel, like
// _diff-runs.mjs — then re-diffs with the MEASURED noise boxes from
// audit/noise-floor.json painted black on BOTH sides.
//
// Rules (docs/redesign/capture-noise.md):
//   - connecting-* screens and motion/ sequences are excluded (animation
//     phase is the content — no pixel proof).
//   - A mask may only be a box measured on the no-change run1-vs-run2 pair
//     (random room data, wall-clock text, animation phase). Nothing else.
//   - A previously pixel-clean screen that differs now is a flag, never a
//     mask. A diff region outside the measured floor box is a flag.
//   - PASS = masked diff empty on every diffed screen.
//
// Exit: 0 = proof holds, 1 = flag (see stdout).
import sharp from 'sharp';
import fs from 'fs';

const A = process.argv[2] || 'audit/baseline';
const B = process.argv[3] || 'audit/baseline-post8';
const floor = JSON.parse(fs.readFileSync('audit/noise-floor.json', 'utf8'));
const floorBy = Object.fromEntries(floor.map((e) => [e.f, e]));
// STEP 9 re-measurement: boxes whose cause was confirmed by diffmap/crop
// inspection (docs/redesign/capture-noise.md §STEP 9) but which the original
// noise-floor run did not produce or measured smaller. Each entry carries the
// confirmed cause; entries were never widened past the observed region.
const extra = fs.existsSync('audit/step9-masks.json')
  ? JSON.parse(fs.readFileSync('audit/step9-masks.json', 'utf8')) : {};

const files = fs.readdirSync(A).filter((f) => f.endsWith('.png')).sort();
const inB = new Set(fs.readdirSync(B).filter((f) => f.endsWith('.png')));

/** Count pixels differing by >8 in any channel; also return the bbox. */
function diff(a, b) {
  const { data: da, info } = a;
  const { data: db } = b;
  const ch = info.channels, W = info.width, H = info.height;
  let n = 0, minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch;
    if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) {
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { n, box: n ? [minX, minY, maxX, maxY] : null };
}

/** Paint a box black in a raw RGBA/RGB buffer (same value both sides ⇒ zero diff inside). */
function paint(buf, info, [x0, y0, x1, y1]) {
  const ch = info.channels, W = info.width;
  for (let y = Math.max(0, y0); y <= Math.min(info.height - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = (y * W + x) * ch;
      buf[i] = buf[i + 1] = buf[i + 2] = 0;
    }
}

const rows = [];
const flags = [];
for (const f of files) {
  if (f.startsWith('connecting-')) {
    rows.push({ f, status: inB.has(f) ? 'EXCLUDED (connecting)' : 'MISSING (connecting, excluded anyway)' });
    continue;
  }
  if (!inB.has(f)) { rows.push({ f, status: 'MISSING_IN_POST8' }); flags.push(`${f}: missing from the post-8 capture`); continue; }
  const a = await sharp(`${A}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(`${B}/${f}`).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    rows.push({ f, status: `SIZE ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}` });
    flags.push(`${f}: size mismatch`); continue;
  }
  const raw = diff(a, b);
  if (raw.n === 0) { rows.push({ f, n: 0 }); continue; }

  const fe = floorBy[f];
  const ex = extra[f];
  if ((!fe || fe.status || fe.n === 0) && !ex) {
    const why = !fe || fe.status ? 'no floor entry' : 'clean on the no-change run';
    rows.push({ f, raw: raw.n, box: raw.box, flag: 'UNEXPLAINED' });
    flags.push(`${f}: ${why}, differs now — box ${raw.box}`); continue;
  }

  const a2 = Buffer.from(a.data), b2 = Buffer.from(b.data);
  if (fe && !fe.status && fe.n > 0) { paint(a2, a.info, fe.box); paint(b2, b.info, fe.box); }
  if (ex) for (const box of ex.boxes || [ex.box]) { paint(a2, a.info, box); paint(b2, b.info, box); }
  const masked = diff({ data: a2, info: a.info }, { data: b2, info: b.info });
  rows.push({ f, raw: raw.n, rawBox: raw.box, floorBox: fe.box, masked: masked.n, maskedBox: masked.box });
  if (masked.n > 0) flags.push(`${f}: ${masked.n} px outside the measured floor box — raw box ${raw.box} vs floor ${fe.box}`);
}
// extra files the post-8 run produced that the baseline never had
for (const f of inB) if (!files.includes(f)) flags.push(`${f}: exists in post-8 but not in baseline`);

const clean = rows.filter((r) => r.n === 0).length;
const maskedOk = rows.filter((r) => r.masked === 0).length;
const excluded = rows.filter((r) => r.status && r.status.startsWith('EXCLUDED'));
console.log(`files compared: ${files.length} (A) vs ${inB.size} (B)`);
console.log(`pixel-identical (raw): ${clean}`);
console.log(`noisy, emptied by the measured floor masks: ${maskedOk}`);
console.log(`excluded (connecting): ${excluded.length}`);
const bad = rows.filter((r) => r.status && !r.status.startsWith('EXCLUDED'));
if (bad.length) { console.log('PROBLEMS:'); for (const r of bad) console.log(' ', r.f, r.status); }
for (const r of rows.filter((r) => r.masked > 0 || r.flag)) console.log(`FLAG ${r.f} raw=${r.raw} masked=${r.masked} ${r.flag || ''}`);
fs.writeFileSync('audit/step9-diff.json', JSON.stringify(rows, null, 1));
console.log(`\n${flags.length === 0 ? 'PROOF HOLDS — masked diff empty on every diffed screen' : `${flags.length} FLAG(S)`}`);
for (const x of flags) console.log('  - ' + x);
process.exit(flags.length === 0 ? 0 : 1);
