/** Deterministic 1080p/60 studio film. Requires dev server + ffmpeg + Chrome.
 * node scripts/render-launch-film.mjs probe | render
 * Intermediates stay in ignored film/out. No reference media is redistributed.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'vite';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const OUT = path.resolve('film/out/launch-v2');
const WEB = path.resolve('public/film');
const FPS = 60;
const DURATION = 12.7;
const probes = [0, 0.7, 1.5, 1.9, 2.3, 2.7, 3.2, 3.65, 3.8, 4.7, 5.35, 5.9, 6.5, 7.4, 9.1, 9.7, 10.6, 12.7];
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
  for (const [start, freq] of [[0.12, 220], [1.75, 330], [2.1, 440], [3.72, 660], [6.05, 520], [6.7, 620]]) tone(start, 0.45, freq, 0.11);
  for (const [delay, freq] of [[0, 261.63], [0.12, 329.63], [0.23, 392]]) tone(8.8 + delay, 2.3, freq, 0.09);
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

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
let studioServer;
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'light' });
  await context.addInitScript(() => { localStorage.setItem('sharetext.locale', 'en'); localStorage.setItem('sharetext.theme', 'light'); });
  // Capture real React screen content independently from the hardware, at the
  // display's own aspect ratio. The same geometry maps its file icon into 3D,
  // so the packet departs and arrives at the actual UI, not a guessed point.
  const meta = {};
  for (const name of ['phone-sending', 'phone-complete', 'laptop-empty', 'laptop-complete']) {
    const phone = name.startsWith('phone');
    const screen = await browser.newContext({ viewport: { width: phone ? 402 : 1512, height: phone ? 874 : 982 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await screen.addInitScript(() => { localStorage.setItem('sharetext.locale', 'en'); localStorage.setItem('sharetext.theme', 'light'); });
    const page = await screen.newPage();
    await page.goto(`${BASE}/film.html?mode=launch&texture=${name}`, { waitUntil: 'networkidle' });
    const element = page.locator('[data-film-texture]');
    await element.waitFor(); await page.evaluate(() => document.fonts.ready);
    await element.screenshot({ path: path.join(OUT, `screen-${name}.png`), animations: 'disabled' });
    const box = await page.locator('.handoff-file-icon').boundingBox();
    meta[name] = { u: (box.x + box.width / 2) / (phone ? 402 : 1512), v: 1 - (box.y + box.height / 2) / (phone ? 874 : 982) };
    await screen.close();
  }
  writeFileSync(path.join(OUT, 'textures.json'), JSON.stringify(meta));
  // An isolated authoring build, never dist/: no dev HMR can navigate the
  // browser midway through the pass. Only the resulting movie ships.
  const site = path.join(OUT, 'site');
  await build({ publicDir: false, logLevel: 'warn', build: { outDir: site, emptyOutDir: true, manifest: false, rollupOptions: { input: path.resolve('film.html') } } });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
  studioServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = pathname.startsWith('/film/out/launch-v2/') ? path.join(OUT, path.basename(pathname)) : path.join(site, pathname);
    if (!existsSync(file)) file = path.join(path.resolve('public'), pathname);
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    createReadStream(file).pipe(response);
  });
  await new Promise(resolve => studioServer.listen(0, '127.0.0.1', resolve));
  const captureBase = `http://127.0.0.1:${studioServer.address().port}`;
  console.log('Display textures and isolated studio build ready');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const initializationError = new Promise((_, reject) => page.on('pageerror', reject));
  await page.goto(`${captureBase}/film.html?mode=launch`, { waitUntil: 'networkidle', timeout: 180000 });
  await Promise.race([page.waitForFunction(() => typeof window.__film === 'function', null, { timeout: 180000 }), initializationError]);
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
  await page.evaluate(() => window.__film(3.05));
  await page.screenshot({ path: path.join(WEB, 'sharetexts-launch-v2-poster.jpg'), type: 'jpeg', quality: 91 });
  if (mode === 'render') {
    for (let i = 0; i < Math.round(FPS * DURATION); i++) {
      await capture(i / FPS, `f${String(i).padStart(5, '0')}.jpg`);
      if (i % 60 === 0) console.log(`Captured ${i}/${FPS * DURATION}`);
    }
  }
} finally { await browser.close(); if (studioServer) await new Promise(resolve => studioServer.close(resolve)); }
if (mode === 'render') {
  const audio = soundtrack();
  const source = ['-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg')];
  const codec = ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-color_range', 'tv', '-movflags', '+faststart'];
  ffmpeg([...source, '-vf', 'scale=1440:810:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '23', '-an', path.join(WEB, 'sharetexts-launch-v2.mp4')]);
  ffmpeg([...source, '-i', audio, '-vf', 'scale=1920:1080:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-t', String(DURATION), path.join(WEB, 'sharetexts-launch-v2-full.mp4')]);
  for (const file of ['sharetexts-launch-v2.mp4', 'sharetexts-launch-v2-full.mp4']) console.log(`${file}: ${(statSync(path.join(WEB, file)).size / 1024 / 1024).toFixed(2)} MiB`);
}
console.log(`Studio ${mode} complete. Probes: ${OUT}`);
