/**
 * make-film-textures.mjs — the materials the film set is made of.
 *
 * CSS gradients can suggest wood; they cannot look like it. What reads as a
 * real surface at 1080p is the boring stuff: long grain lines that wander,
 * pores that catch a little light, and a colour that drifts across the plank
 * instead of being one flat brown. So the two textures this film needs are
 * drawn with a canvas, seeded, and written to public/film/tex/ once — the
 * stage then treats them as photographs.
 *
 *   oak.png    2048×1024  the desk top (horizontal grain, warm walnut)
 *   brushed.png 1024×512  the aluminium for the laptop lid, deck and phone body
 *
 * Both are deterministic: same seed, same file, byte for byte, so a re-render
 * of the film never shifts its materials.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'film', 'tex');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2048, height: 1024 } });

const capture = async (w, h, draw, name) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:#000}canvas{display:block}</style><canvas id="c" width="${w}" height="${h}"></canvas>`);
  const dataUrl = await page.evaluate(draw);
  const buf = Buffer.from(String(dataUrl).split(',')[1], 'base64');
  const file = path.join(OUT, name);
  fs.writeFileSync(file, buf);
  console.log(`${name} · ${w}×${h} · ${(buf.length / 1024).toFixed(0)} KB`);
};

/* ── oak ────────────────────────────────────────────────────────────────── */
await capture(2048, 1024, () => {
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;

  // Seeded so the plank is the same plank on every render.
  let seed = 20261112;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Base: warm walnut, darker at the edges where light falls away.
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#4a3524');
  base.addColorStop(0.42, '#3d2a1c');
  base.addColorStop(1, '#2a1d14');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Colour drift across the plank — a real board is never one tone.
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 160 + rnd() * 420;
    const warm = rnd() > 0.45;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, warm ? 'rgba(120,74,40,0.16)' : 'rgba(24,15,10,0.20)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grain: long wandering lines, denser toward the middle of the board.
  for (let i = 0; i < 520; i += 1) {
    const y0 = rnd() * H;
    const amp = 3 + rnd() * 16;
    const freq = 0.0016 + rnd() * 0.004;
    const phase = rnd() * Math.PI * 2;
    const dark = rnd() > 0.42;
    const alpha = dark ? 0.035 + rnd() * 0.075 : 0.012 + rnd() * 0.03;
    g.strokeStyle = dark ? `rgba(18,11,7,${alpha})` : `rgba(214,168,120,${alpha})`;
    g.lineWidth = 0.5 + rnd() * 2.1;
    g.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.18;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // Pores: short dashes that catch light, the thing gradients always miss.
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 2 + rnd() * 22;
    g.strokeStyle = rnd() > 0.5 ? `rgba(12,8,5,${0.10 + rnd() * 0.22})` : `rgba(226,186,140,${0.04 + rnd() * 0.10})`;
    g.lineWidth = 0.4 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (rnd() - 0.5) * 1.6);
    g.stroke();
  }

  // Fine tooth over everything: without it the surface looks like plastic.
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 13;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}, 'oak.jpg');

/* ── brushed aluminium ──────────────────────────────────────────────────── */
await capture(1024, 512, () => {
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;

  let seed = 77123;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);

  // Brushing: brightness only. The stage multiplies this into the metal
  // gradient, so it must stay neutral — no hue, no colour cast.
  for (let i = 0; i < 4200; i += 1) {
    const y = rnd() * H;
    const v = 108 + rnd() * 116;
    g.strokeStyle = `rgba(${v},${v},${v},${0.10 + rnd() * 0.34})`;
    g.lineWidth = 0.4 + rnd() * 0.9;
    g.beginPath();
    const x0 = rnd() * W;
    const len = W * (0.25 + rnd() * 0.85);
    g.moveTo(x0, y);
    g.lineTo(x0 + len, y + (rnd() - 0.5) * 0.8);
    g.stroke();
  }

  // A couple of broad soft bands, as if the sheet was rolled.
  for (let i = 0; i < 14; i += 1) {
    const y = rnd() * H;
    const h = 18 + rnd() * 60;
    const lg = g.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${0.03 + rnd() * 0.05})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, y, W, h);
  }
  return c.toDataURL('image/jpeg', 0.94);
}, 'brushed.jpg');

await browser.close();
