// STEP 9 investigation helper: crop the same region from baseline and post8
// so the flagged diff region can be inspected visually side by side.
// Usage: node scripts/_probe-step9-crops.mjs <file.png> <x0> <y0> <x1> <y1> [pad]
import sharp from 'sharp';
import fs from 'fs';

const [f, x0, y0, x1, y1, padS] = process.argv.slice(2);
const pad = Number(padS ?? 24);
const mk = (side, dir) => sharp(`${dir}/${f}`).extract({
  left: Math.max(0, +x0 - pad), top: Math.max(0, +y0 - pad),
  width: Math.min(4000, +x1 - +x0 + pad * 2), height: Math.min(4000, +y1 - +y0 + pad * 2),
}).png().toFile(`audit/step9-crops/${f}.${side}.png`);
fs.mkdirSync('audit/step9-crops', { recursive: true });
await mk('base', 'audit/baseline');
await mk('post8', 'audit/baseline-post8');
console.log(`wrote audit/step9-crops/${f}.base.png and .post8.png`);
