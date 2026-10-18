// Temporary: inspect the newly supplied PWA icon artwork (dims, alpha,
// corner pixels, glyph presence) before installing it as the icon source.
import { chromium } from 'playwright';
import fs from 'fs';

const file = 'C:\\Users\\garvd\\Downloads\\1000164244.png';
const buf = fs.readFileSync(file);
// Declared as jpeg; the file is JPEG (ffd8ffe0) despite the .png name.
const dataUri = 'data:image/jpeg;base64,' + buf.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
const r = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const at = (px, py) => { const i = (py * c.width + px) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  const w = c.width, h = c.height;
  // Glyph bbox: pixels that are strongly orange (differ from BOTH black and white).
  let minX = w, minY = h, maxX = -1, maxY = -1, orange = 0;
  for (let y = 0; y < h; y += 2) {
    for (let xx = 0; xx < w; xx += 2) {
      const [r, g, b, a] = at(xx, y);
      if (r > 150 && r > b + 60 && g > b && g < r) {
        orange++;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // White squircle extent: bright pixels of any kind.
  let wMinX = w, wMinY = h, wMaxX = -1, wMaxY = -1;
  for (let y = 0; y < h; y += 2) {
    for (let xx = 0; xx < w; xx += 2) {
      const [r, g, b] = at(xx, y);
      if (r > 200 && g > 200 && b > 200) {
        if (xx < wMinX) wMinX = xx;
        if (xx > wMaxX) wMaxX = xx;
        if (y < wMinY) wMinY = y;
        if (y > wMaxY) wMaxY = y;
      }
    }
  }
  return {
    w, h,
    corners: { tl: at(2, 2), tr: at(w - 3, 2), bl: at(2, h - 3), br: at(w - 3, h - 3) },
    center: at(w >> 1, h >> 1),
    orangePx: orange,
    glyphBBox: { minX, minY, maxX, maxY, bw: maxX - minX, bh: maxY - minY },
    glyphCenter: { cx: ((minX + maxX) / 2) / w, cy: ((minY + maxY) / 2) / h },
    squircle: { minX: wMinX, minY: wMinY, maxX: wMaxX, maxY: wMaxY },
    maxAlpha: Math.max(...Array.from({ length: 4000 }, (_, i) => at((i * 7919) % w, ((i * 104729) % h))[3])),
  };
}, dataUri);
console.log(JSON.stringify(r, null, 1));
await browser.close();
