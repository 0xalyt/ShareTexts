/** Deterministic 1080p/60 film. Requires dev server + Blender 4.5 LTS + ffmpeg + Chrome.
 * node scripts/render-launch-film.mjs probe | render
 * Intermediates stay in ignored film/out. No reference media is redistributed.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { build } from 'vite';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const THEME = process.env.FILM_THEME === 'dark' ? 'dark' : 'light';
const PASS = `launch-v5-${THEME}`;
const CUT = `sharetexts-${PASS}`;
const OUT = path.resolve(`film/out/${PASS}`);
const query = `mode=launch&theme=${THEME}`;
const WEB = path.resolve('public/film');
const FONT = path.resolve(process.env.FILM_FONT_FILE || 'public/fonts/AlloVariable.woff2');
if (!existsSync(FONT)) throw new Error('Full AlloVariable.woff2 is required; set FILM_FONT_FILE to its local path');
const FPS = 60;
const DURATION = 16.8;
const probes = process.env.FILM_BENCH ? Array.from({ length: 16 }, (_, i) => i / FPS) : [0, 1.2, 2.45, 3.1, 3.9, 4.95, 6, 7.2, 8.4, 9.45, 10.8, 11.8, 12.6, 13.9, 14.7, 15.8];
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
  for (const [start, freq] of [[0.12, 220], [1.95, 330], [2.85, 660], [5.6, 392], [6.45, 784], [9.7, 440], [10.55, 880]]) tone(start, 0.35, freq, 0.065);
  for (const [delay, freq] of [[0, 261.63], [0.12, 329.63], [0.23, 392]]) tone(15.2 + delay, 1.3, freq, 0.07);
  tone(0.15, 14.8, 130.81, 0.018);
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
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US', colorScheme: THEME });
  await context.route('**/fonts/AlloVariable.woff2', route => route.fulfill({ path: FONT, contentType: 'font/woff2' }));
  await context.addInitScript(theme => { localStorage.setItem('sharetext.locale', 'en'); localStorage.setItem('sharetext.theme', theme); }, THEME);
  if (!existsSync(path.join(OUT, 'native-ui.json'))) throw new Error('Run scripts/capture-launch-ui.mjs against the local app and Worker first');
  const signature = createHash('sha256').update(THEME).update(readFileSync('film/blender_studio.py')).digest('hex');
  const cacheFile = path.join(OUT, 'model-build.json');
  const cached = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
  if (cached?.signature !== signature || !existsSync(path.join(OUT, 'studio.glb'))) {
    execFileSync(process.env.FILM_BLENDER || 'blender', ['-b', '-t', '8', '--python', 'film/blender_studio.py', '--', '--theme', THEME, '--textures', OUT, '--out', OUT, '--model-only'], { stdio: 'inherit' });
    writeFileSync(cacheFile, JSON.stringify({ signature }));
  }
  // An isolated authoring build, never dist/: no dev HMR can navigate the
  // browser midway through the pass. Only the resulting movie ships.
  const site = path.join(OUT, 'site');
  await build({ publicDir: false, logLevel: 'warn', build: { outDir: site, emptyOutDir: true, manifest: false, rollupOptions: { input: path.resolve('film.html') } } });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.woff2': 'font/woff2' };
  studioServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = pathname.startsWith('/film/out/') ? path.resolve('.', '.' + pathname) : path.join(site, pathname);
    if (pathname.startsWith('/film/out/') && !file.startsWith(path.resolve('film/out') + path.sep)) { response.writeHead(404).end(); return; }
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
  await page.goto(`${captureBase}/film.html?${query}`, { waitUntil: 'networkidle', timeout: 180000 });
  await Promise.race([page.waitForFunction(() => typeof window.__film === 'function', null, { timeout: 180000 }), initializationError]);
  await page.evaluate(async root => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  }, `/film/out/${PASS}`);
  const capture = async (time, file) => {
    const begin = Date.now();
    await page.evaluate(time => window.__film(time), time);
    const rendered = Date.now();
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 96, animations: 'disabled' });
    if (mode === 'probe') console.log(`Frame ${time}: seek ${rendered-begin}ms / screenshot ${Date.now()-rendered}ms`);
    if (errors.length) throw new Error(errors.join('\n'));
  };
  for (const time of probes) await capture(time, `probe-${time}.jpg`);
  // A representative static composition, not a blank first frame or an ad card.
  await page.evaluate(() => window.__film(0));
  await page.screenshot({ path: path.join(WEB, `${CUT}-poster.jpg`), type: 'jpeg', quality: 91 });
  if (mode === 'render') {
    for (let i = 0; i < Math.round(FPS * DURATION); i++) {
      await capture(i === Math.round(FPS * DURATION) - 1 ? 0 : i / FPS, `f${String(i).padStart(5, '0')}.jpg`);
      if (i % 60 === 0) console.log(`Captured ${i}/${FPS * DURATION}`);
    }
  }
} finally { await browser.close(); if (studioServer) await new Promise(resolve => studioServer.close(resolve)); }
if (mode === 'render') {
  const audio = soundtrack();
  const source = ['-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg')];
  const codec = ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-frames:v', String(Math.round(FPS*DURATION))];
  ffmpeg([...source, '-vf', 'scale=1440:810:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '23', '-an', path.join(WEB, `${CUT}.mp4`)]);
  ffmpeg([...source, '-i', audio, '-vf', 'scale=1920:1080:out_color_matrix=bt709:out_range=tv', ...codec, '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-t', String(DURATION), path.join(WEB, `${CUT}-full.mp4`)]);
  for (const file of [`${CUT}.mp4`, `${CUT}-full.mp4`]) console.log(`${file}: ${(statSync(path.join(WEB, file)).size / 1024 / 1024).toFixed(2)} MiB`);
}
console.log(`Studio ${mode} complete. Probes: ${OUT}`);
