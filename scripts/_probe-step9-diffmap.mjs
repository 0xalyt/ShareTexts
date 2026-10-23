// STEP 9 investigation: full-frame diff map — every pixel differing by >8
// between baseline and post8 is painted red over the baseline image.
// Usage: node scripts/_probe-step9-diffmap.mjs <file.png>
import sharp from 'sharp';

const f = process.argv[2];
const a = await sharp(`audit/baseline/${f}`).raw().toBuffer({ resolveWithObject: true });
const b = await sharp(`audit/baseline-post8/${f}`).raw().toBuffer({ resolveWithObject: true });
const { data: da, info } = a;
const { data: db } = b;
const ch = info.channels, W = info.width, H = info.height;
const out = Buffer.from(da);
let n = 0, minY = H, maxY = -1;
const rows = new Map();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * ch;
  if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) {
    n++;
    out[i] = 255; out[i + 1] = 0; out[i + 2] = 0;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    rows.set(y, (rows.get(y) || 0) + 1);
  }
}
const rowSummary = [...rows.entries()].sort((p, q) => p[0] - q[0])
  .map(([y, c]) => `${y}:${c}`).join(' ');
console.log(`${f}: ${n} differing px, rows y=${minY}..${maxY}`);
console.log(`rows (y:count): ${rowSummary.slice(0, 1200)}`);
await sharp(out, { raw: { width: W, height: H, channels: ch } })
  .png().toFile(`audit/step9-crops/${f}.diffmap.png`);
console.log(`wrote audit/step9-crops/${f}.diffmap.png`);
