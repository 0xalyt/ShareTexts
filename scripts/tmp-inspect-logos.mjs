// Temporary: measure the ink bbox of each supplied logo artwork so the
// header lockup can size mark-vs-wordmark to the real geometry.
import { chromium } from 'playwright';
import fs from 'fs';

const files = [
  ['5f531fc1-039a-4360-80e3-65c04e574bb0', 'black-glyph-on-white'],
  ['bb6c8e57-b0f2-4de5-9020-1f5385e6484e', 'white-glyph-on-orange'],
  ['4a304fc0-c41a-4f70-86b6-c555939d3812', 'orange-glyph-on-white'],
  ['3a2d89c2-d2ed-4a5f-a8c6-5c1ceea05e2f', 'cream-glyph-on-black'],
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [id, name] of files) {
  const buf = fs.readFileSync(`C:\\Users\\garvd\\Downloads\\${id}.png`);
  const dataUri = 'data:image/png;base64,' + buf.toString('base64');
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
    // Background = corner pixel; ink = any pixel whose RGB differs by > 24.
    const bg = [d[0], d[1], d[2]];
    const diff = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    let minX = w, minY = h, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        if (diff((y * w + xx) * 4) > 48) {
          ink++;
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      w, h, bg,
      bbox: { minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 },
      wRatio: (maxX - minX + 1) / w,
      hRatio: (maxY - minY + 1) / h,
      cx: ((minX + maxX) / 2) / w,
      cy: ((minY + maxY) / 2) / h,
      inkPct: (ink / (w * h)) * 100,
    };
  }, dataUri);
  console.log(name, JSON.stringify(r, null, 1));
}

await browser.close();
