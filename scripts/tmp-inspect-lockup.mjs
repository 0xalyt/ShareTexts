// Temporary: inspect the supplied monoline branding attachments — format,
// dims, alpha, background/ink colors, ink bounding box.
import { chromium } from 'playwright';
import fs from 'fs';

const files = [
  ['C:\\Users\\garvd\\AppData\\Local\\Temp\\freebuff-desktop-pastes\\paste-1792252388859-13548.png', 'lockup'],
  ['C:\\Users\\garvd\\AppData\\Local\\Temp\\freebuff-desktop-pastes\\paste-1792253319179-13548.png', 'mark-tile'],
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [file, name] of files) {
  const buf = fs.readFileSync(file);
  const magic = buf.subarray(0, 4).toString('hex');
  // Declare jpeg if ffd8, else png — browser sniffs either way, but report honestly.
  const dataUri = `data:${magic.startsWith('ffd8') ? 'image/jpeg' : 'image/png'};base64,` + buf.toString('base64');
  const r = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const w = c.width, h = c.height;
    const at = (px, py) => { const i = (py * w + px) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    // Transparent OR near-white background? Find ink (dark/opaque-nonwhite) bbox.
    const corner = at(2, 2);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    let darkR = 0, darkG = 0, darkB = 0, darkN = 0; // ink color sample (darkest quartile pixels)
    let maxAlpha = 0;
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        const [r, g, b, a] = at(xx, y);
        if (a > maxAlpha) maxAlpha = a;
        const lum = (r + g + b) / 3;
        const ink = a > 128 ? (lum < 200) : true; // visible non-white pixel
        if (ink && a > 8) {
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (lum < 80) { darkR += r; darkG += g; darkB += b; darkN++; }
        }
      }
    }
    return {
      w, h, corner, maxAlpha,
      hasAlpha: maxAlpha < 255,
      bbox: { minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 },
      aspect: Number(((maxX - minX + 1) / (maxY - minY + 1)).toFixed(3)),
      inkColor: darkN ? [Math.round(darkR / darkN), Math.round(darkG / darkN), Math.round(darkB / darkN)] : null,
      inkSamples: darkN,
    };
  }, dataUri);
  console.log(name, 'magic=' + magic, JSON.stringify(r));
}

await browser.close();
