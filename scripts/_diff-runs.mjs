// STEP 4b: pixel diff run1 vs run2. Reports per-file differing-pixel count,
// share and the bounding box of the differences (the noise regions).
import sharp from 'sharp';
import fs from 'fs';
const A = 'audit/baseline', B = 'audit/baseline-run2';
const files = fs.readdirSync(A).filter(f => f.endsWith('.png')).sort();
const out = [];
for (const f of files) {
  const p2 = `${B}/${f}`;
  if (!fs.existsSync(p2)) { out.push({ f, status: 'MISSING_IN_RUN2' }); continue; }
  const a = await sharp(`${A}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(p2).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    out.push({ f, status: `SIZE ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}` }); continue;
  }
  const { data: da, info } = a; const { data: db } = b;
  const ch = info.channels; const W = info.width, H = info.height;
  let n = 0, minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch;
    if (Math.abs(da[i]-db[i]) > 8 || Math.abs(da[i+1]-db[i+1]) > 8 || Math.abs(da[i+2]-db[i+2]) > 8) {
      n++; if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y;
    }
  }
  const share = n / (W*H);
  out.push({ f, n, share: +(share*100).toFixed(3), box: n ? [minX,minY,maxX,maxY] : null });
}
const clean = out.filter(o => o.status === undefined && o.n === 0);
const noisy = out.filter(o => o.status === undefined && o.n > 0);
const bad = out.filter(o => o.status);
console.log(`CLEAN (pixel-identical, >8/threshold): ${clean.length}`);
console.log(`NOISY: ${noisy.length}`);
for (const o of noisy.sort((a,b)=>b.share-a.share)) console.log(`  ${o.share.toFixed(3)}% ${o.f} box=${o.box}`);
if (bad.length) { console.log('PROBLEMS:'); for (const o of bad) console.log(' ', o.f, o.status); }
fs.writeFileSync('audit/noise-floor.json', JSON.stringify(out, null, 1));
