/** Deterministic 1080p/30 studio film. Requires dev server + ffmpeg + Chrome.
 * node scripts/render-launch-film.mjs probe | render
 * Intermediates stay in ignored film/out. No reference media is redistributed.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const OUT = path.resolve('film/out/launch-v1');
const WEB = path.resolve('public/film');
const FPS = 30;
const DURATION = 12.7;
const probes = [0, 0.7, 1.5, 2.2, 2.6, 3.1, 3.6, 4.7, 5.35, 5.9, 6.5, 7.4, 9.1, 9.7, 10.6, 12.3];
const mode = process.argv[2] || 'probe';
if (!['probe', 'render'].includes(mode)) throw new Error('Use probe or render');
mkdirSync(OUT, { recursive: true });
mkdirSync(WEB, { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// Original, synthesized sound bed: soft tonal movement, dry taps and a resolved
// three-note signature. No borrowed music, voice, samples or paid service.
function soundtrack() {
  const rate = 44100;
  const pcm = new Float64Array(Math.round(rate * DURATION));
  const tone = (start, duration, frequency, gain) => {
    for (let j = 0; j < Math.round(duration * rate); j++) {
      const x = j / rate;
      const i = Math.round(start * rate) + j;
      if (i >= pcm.length) break;
      const envelope = Math.min(1, x / 0.012) * Math.exp(-x * 4 / duration) * Math.min(1, (duration - x) / 0.09);
      pcm[i] += gain * envelope * (Math.sin(2 * Math.PI * frequency * x) + 0.16 * Math.sin(4 * Math.PI * frequency * x));
    }
  };
  for (const [start, freq] of [[0.12, 220], [1.55, 330], [2.1, 440], [3.35, 660], [6.05, 520], [6.7, 620]]) tone(start, 0.45, freq, 0.11);
  for (const [delay, freq] of [[0, 261.63], [0.12, 329.63], [0.23, 392]]) tone(9.25 + delay, 2.3, freq, 0.09);
  tone(0.15, 5.4, 130.81, 0.025);
  tone(6.0, 2.8, 196, 0.018);
  for (let j = 0; j < Math.round(0.65 * rate); j++) {
    const x = j / rate;
    const i = Math.round(2.2 * rate) + j;
    const sweep = Math.sin(2 * Math.PI * (240 * x + 720 * x * x));
    pcm[i] += sweep * Math.sin(Math.PI * x / 0.65) ** 2 * 0.035;
  }
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.round(Math.tanh(pcm[i]) * 32767), 44 + i * 2);
  const file = path.join(OUT, 'original-sound.wav');
  writeFileSync(file, wav);
  return file;
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'light' });
  await context.addInitScript(() => { localStorage.setItem('sharetext.locale', 'en'); localStorage.setItem('sharetext.theme', 'light'); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/film.html?mode=launch`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction(() => typeof window.__film === 'function');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const capture = async (time, file) => {
    await page.evaluate(time => window.__film(time), time);
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 96, animations: 'disabled' });
    if (errors.length) throw new Error(errors.join('\n'));
  };
  for (const time of probes) await capture(time, `probe-${time}.jpg`);
  // A representative static composition, not a blank first frame or an ad card.
  await page.evaluate(() => window.__film(5.35));
  await page.screenshot({ path: path.join(WEB, 'sharetexts-launch-v1-poster.jpg'), type: 'jpeg', quality: 90 });
  if (mode === 'render') {
    for (let i = 0; i < Math.round(FPS * DURATION); i++) {
      await capture(i / FPS, `f${String(i).padStart(5, '0')}.jpg`);
      if (i % 60 === 0) console.log(`Captured ${i}/${FPS * DURATION}`);
    }
  }
} finally { await browser.close(); }
if (mode === 'render') {
  const audio = soundtrack();
  const source = ['-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg')];
  const codec = ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-color_range', 'tv', '-movflags', '+faststart'];
  ffmpeg([...source, '-vf', 'scale=1440:810:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '23', '-an', path.join(WEB, 'sharetexts-launch-v1.mp4')]);
  ffmpeg([...source, '-i', audio, '-vf', 'scale=1920:1080:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-t', String(DURATION), path.join(WEB, 'sharetexts-launch-v1-full.mp4')]);
  for (const file of ['sharetexts-launch-v1.mp4', 'sharetexts-launch-v1-full.mp4']) console.log(`${file}: ${(statSync(path.join(WEB, file)).size / 1024 / 1024).toFixed(2)} MiB`);
}
console.log(`Studio ${mode} complete. Probes: ${OUT}`);
