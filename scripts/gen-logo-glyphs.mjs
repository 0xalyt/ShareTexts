// gen-logo-glyphs — extract the OFFICIAL ShareTexts glyph from the user's
// supplied artwork tiles into transparent, square PNGs for in-app use.
//
// FIDELITY CONTRACT (the whole point of this script):
//  - The four source tiles in public/brand/logo-tile-*.jpg are the user's
//    exact supplied artwork — copied byte-for-byte, never edited.
//  - Extraction is pure alpha unmixing against the tile's own flat field:
//    each pixel is (a·glyph + (1−a)·field), solved for coverage a with the
//    field modeled as a bilinear surface from the four corners and the
//    glyph color as the median of the core pixels. Glyph BODY pixels
//    (a ≥ 0.97) are copied byte-for-byte; only the 1–2px antialiased edge
//    gets a recomputed coverage alpha. The field — including the field that
//    fills the gaps BETWEEN the arcs — becomes fully transparent.
//    No redraw, no trace, no recolor of the glyph.
//  - The output is a SQUARE canvas whose side = inkHeight / 0.72, glyph
//    centered. 0.72 is the box-to-ink ratio the app's lockup geometry is
//    measured against (BrandLockup: 30px box → 21.6px of mark ink against
//    21px of wordmark ink at 27px Geist 700), so replacing the old inline
//    SVG with these files keeps every existing size prop visually identical
//    — only the shape/color changes, never the geometry.
//
// Run: node scripts/gen-logo-glyphs.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'public', 'brand');

const INK_RATIO = 0.72; // ink height / canvas side (geometry contract above)
// The logo displays at ≤44px (≤132 physical at 3× DPR); 256px is 2× of
// that. Delivering the full 954–1194px extraction would cost ~300KB on
// first paint for art the page shows at 30px — same call the landing made
// when it retired the hero image. The artwork's own soft grain is also
// incompressible at full res; averaging it out at 256px is what the eye
// sees anyway. Strokes are ~6% of the canvas, so halving steps cannot
// alias them.
const FINAL = 256;

// Only the two colorways the app actually ships are extracted; the
// ink-on-white and white-on-orange tiles stay as official source art for
// future surfaces (PWA/OG passes) and are referenced by nothing here.
const JOBS = [
  ['logo-tile-orange-on-white.jpg', 'logo-glyph-orange.png'], // light theme
  ['logo-tile-cream-on-black.jpg', 'logo-glyph-cream.png'],   // dark theme
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [srcFile, outFile] of JOBS) {
  const srcPath = path.join(brand, srcFile);
  // JPEG tiles under a .jpg name — decode via data URI (headless Chromium
  // will not fetch file:// subresources).
  const dataUri = 'data:image/jpeg;base64,' + fs.readFileSync(srcPath).toString('base64');

  const result = await page.evaluate(async ({ src, inkRatio, final: FINAL }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const P = ctx.getImageData(0, 0, w, h).data;
    const px = (x, y) => ((y * w + x) * 4);

    // ── Field model F(x,y): bilinear from 32×32 patches at the four corners.
    const PATCH = 32;
    const cornerAvg = (ox, oy) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = oy; y < oy + PATCH; y++) for (let x = ox; x < ox + PATCH; x++) {
        const i = px(x, y); r += P[i]; g += P[i + 1]; b += P[i + 2]; n++;
      }
      return [r / n, g / n, b / n];
    };
    const TL = cornerAvg(0, 0), TR = cornerAvg(w - PATCH, 0);
    const BL = cornerAvg(0, h - PATCH), BR = cornerAvg(w - PATCH, h - PATCH);
    const fieldAt = (x, y) => {
      const u = x / (w - 1), v = y / (h - 1);
      return [0, 1, 2].map(k =>
        (TL[k] * (1 - u) + TR[k] * u) * (1 - v) + (BL[k] * (1 - u) + BR[k] * u) * v
      );
    };

    // ── Pass 1: distance from field, find the deepest-core seed pixel.
    const dist = new Float32Array(w * h);
    let maxDist = 0, seed = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = px(x, y), F = fieldAt(x, y);
        const d = Math.max(Math.abs(P[i] - F[0]), Math.abs(P[i + 1] - F[1]), Math.abs(P[i + 2] - F[2]));
        dist[y * w + x] = d;
        if (d > maxDist) { maxDist = d; seed = i; }
      }
    }

    // ── Pass 2: glyph color G = median of core pixels (dist > 0.75·max).
    //   Sampled every 2px; insertion sort on small arrays keeps it cheap.
    const cores = [[P[seed], P[seed + 1], P[seed + 2]]];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (dist[y * w + x] > 0.75 * maxDist) {
          const i = px(x, y);
          cores.push([P[i], P[i + 1], P[i + 2]]);
        }
      }
    }
    const median = (arr) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };
    const G = [median(cores.map(c0 => c0[0])), median(cores.map(c0 => c0[1])), median(cores.map(c0 => c0[2]))];

    // ── Pass 3: per-pixel coverage. Informative channels only (|G−F| ≥ 24).
    const info = [0, 1, 2].filter(k => Math.abs(G[k] - [TL[k], TR[k], BL[k], BR[k]].reduce((s, v) => s + v, 0) / 4) >= 24);
    if (!info.length) return { error: 'no informative color channel' };
    const out = new Uint8ClampedArray(w * h * 4);
    let inkPixels = 0, partialPixels = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = px(x, y), F = fieldAt(x, y);
        let a = 0;
        for (const k of info) a += Math.max(0, Math.min(1, (P[i + k] - F[k]) / (G[k] - F[k])));
        a /= info.length;
        const o = (y * w + x) * 4;
        if (a <= 0.08) {
          out[o + 3] = 0; // field (incl. interior gaps) → transparent
        } else if (a >= 0.97) {
          // Core: byte-exact source pixel.
          out[o] = P[i]; out[o + 1] = P[i + 1]; out[o + 2] = P[i + 2]; out[o + 3] = 255;
          inkPixels++;
        } else {
          // AA edge: unmix to pure glyph color over transparency.
          out[o] = Math.round((P[i] - (1 - a) * F[0]) / a);
          out[o + 1] = Math.round((P[i + 1] - (1 - a) * F[1]) / a);
          out[o + 2] = Math.round((P[i + 2] - (1 - a) * F[2]) / a);
          out[o + 3] = Math.round(a * 255);
          if (a > 0.5) inkPixels++;
          if (a > 0.15 && a < 0.85) partialPixels++;
        }
      }
    }

    // ── Ink bbox from solid coverage (alpha ≥ 128).
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (out[(y * w + x) * 4 + 3] >= 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { error: 'no ink found' };
    const bw = maxX - minX + 1, bh = maxY - minY + 1;

    // ── Square canvas at the contract ratio, glyph centered, integer offset.
    const side = Math.round(bh / inkRatio);
    if (side < bw + 8) return { error: `glyph wider than canvas (${bw} vs ${side})` };
    const offX = Math.round((side - bw) / 2) - minX;
    const offY = Math.round((side - bh) / 2) - minY;
    const canvas = new Uint8ClampedArray(side * side * 4);
    let placedInk = 0;
    for (let y = 0; y < h; y++) {
      const ty = y + offY;
      if (ty < 0 || ty >= side) continue;
      for (let x = 0; x < w; x++) {
        const tx = x + offX;
        if (tx < 0 || tx >= side) continue;
        const s = (y * w + x) * 4, t = (ty * side + tx) * 4;
        canvas[t] = out[s]; canvas[t + 1] = out[s + 1];
        canvas[t + 2] = out[s + 2]; canvas[t + 3] = out[s + 3];
        if (out[s + 3] >= 128) placedInk++;
      }
    }

    // ── Verify the OUTPUT independently. Fail loudly rather than ship wrong art.
    const errors = [];
    const ratio = bh / side;
    if (Math.abs(ratio - inkRatio) > 0.006) errors.push(`ink ratio ${ratio.toFixed(4)}`);
    const cx = (minX + maxX) / 2 + offX, cy = (minY + maxY) / 2 + offY;
    if (Math.abs(cx - (side - 1) / 2) > 1 || Math.abs(cy - (side - 1) / 2) > 1) errors.push(`not centered (${cx.toFixed(1)},${cy.toFixed(1)})`);
    const cornersTransparent = [[0, 0], [side - 1, 0], [0, side - 1], [side - 1, side - 1]]
      .every(([x, y]) => canvas[(y * side + x) * 4 + 3] === 0);
    if (!cornersTransparent) errors.push('corner not transparent');
    // The field between the arcs must be gone: if it were still opaque the
    // ink would fill its whole bbox, so density inside the bbox collapses
    // toward 1. A healthy glyph sits far lower.
    const density = placedInk / (bw * bh);
    if (density < 0.25 || density > 0.60) errors.push(`bbox ink density ${density.toFixed(2)} (gaps not keyed?)`);
    // AA fringe must stay a thin rim, not half the glyph.
    if (partialPixels > inkPixels * 0.45) errors.push(`too many partial pixels (${partialPixels}/${inkPixels})`);
    if (errors.length) return { error: errors.join('; ') };

    // ── Downscale to the delivered size and RE-VERIFY the shipped pixels.
    const oc = document.createElement('canvas');
    oc.width = side; oc.height = side;
    oc.getContext('2d').putImageData(new ImageData(canvas, side, side), 0, 0);
    // ── Progressive halving down to the delivered size (each 2× step is
    //    the quality-safe way to resample; strokes stay ≥10px wide).
    let srcCanvas = oc;
    while (srcCanvas.width >= FINAL * 2) {
      const half = Math.max(FINAL, Math.round(srcCanvas.width / 2));
      const hc = document.createElement('canvas');
      hc.width = half; hc.height = half;
      const hctx = hc.getContext('2d');
      hctx.imageSmoothingEnabled = true;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(srcCanvas, 0, 0, half, half);
      srcCanvas = hc;
    }
    const fc = document.createElement('canvas');
    fc.width = FINAL; fc.height = FINAL;
    const fctx = fc.getContext('2d', { willReadFrequently: true });
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(srcCanvas, 0, 0, FINAL, FINAL);
    const fd = fctx.getImageData(0, 0, FINAL, FINAL).data;
    let fMinX = FINAL, fMinY = FINAL, fMaxX = -1, fMaxY = -1, fInk = 0;
    for (let y = 0; y < FINAL; y++) {
      for (let x = 0; x < FINAL; x++) {
        if (fd[(y * FINAL + x) * 4 + 3] >= 128) {
          fInk++;
          if (x < fMinX) fMinX = x;
          if (x > fMaxX) fMaxX = x;
          if (y < fMinY) fMinY = y;
          if (y > fMaxY) fMaxY = y;
        }
      }
    }
    const finalErrors = [];
    const fBh = fMaxY - fMinY + 1, fBw = fMaxX - fMinX + 1;
    const fRatio = fBh / FINAL;
    if (Math.abs(fRatio - inkRatio) > 0.01) finalErrors.push(`final ink ratio ${fRatio.toFixed(4)}`);
    const fCx = (fMinX + fMaxX) / 2, fCy = (fMinY + fMaxY) / 2;
    if (Math.abs(fCx - (FINAL - 1) / 2) > 1.5 || Math.abs(fCy - (FINAL - 1) / 2) > 1.5) finalErrors.push('final not centered');
    const fCornersClear = [[0, 0], [FINAL - 1, 0], [0, FINAL - 1], [FINAL - 1, FINAL - 1]]
      .every(([x, y]) => fd[(y * FINAL + x) * 4 + 3] < 64);
    if (!fCornersClear) finalErrors.push('final corner not transparent');
    const fDensity = fInk / (fBw * fBh);
    if (fDensity < 0.25 || fDensity > 0.60) finalErrors.push(`final density ${fDensity.toFixed(2)}`);
    if (finalErrors.length) return { error: 'after downscale: ' + finalErrors.join('; ') };

    return {
      dataUrl: fc.toDataURL('image/png'),
      w, h, side, bw, bh,
      ratio: Number(ratio.toFixed(4)),
      density: Number(density.toFixed(3)),
      final: FINAL,
      fRatio: Number(fRatio.toFixed(4)),
    };
  }, { src: dataUri, inkRatio: INK_RATIO, final: FINAL });

  if (result.error) {
    console.error(`FAIL ${srcFile}: ${result.error}`);
    await browser.close();
    process.exit(1);
  }
  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(brand, outFile), bytes);
  console.log(
    `${outFile}: ${result.final}x${result.final} (extracted from ${result.w}x${result.h} tile @ ${result.ratio} ratio, ` +
    `final ratio ${result.fRatio}, density ${result.density}) ${Math.round(bytes.length / 1024)}KB`
  );
}

await browser.close();
