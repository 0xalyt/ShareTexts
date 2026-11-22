/** 24s reference-inspired editorial film. No service, GPU model or paid API.
 * Capture native sources first; then: node scripts/render-reference-film.mjs probe|render
 * FILM_THEME=dark / FILM_FRAMING=phone select the other compositions.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'vite';
import path from 'node:path';

const theme = process.env.FILM_THEME === 'dark' ? 'dark' : 'light';
const phone = process.env.FILM_FRAMING === 'phone';
const family = `reference-v6-${theme}${phone ? '-mobile' : ''}`;
const out = path.resolve(`film/out/${family}`);
const web = path.resolve('public/film');
const mode = process.argv[2] || 'probe';
if (!['probe', 'render'].includes(mode)) throw Error('Use probe or render');
const duration = 24, fps = Number(process.env.FILM_FPS || 60);
if (![24, 30, 60].includes(fps)) throw Error('FILM_FPS must be 24, 30 or 60');
// Optional incremental recapture for an explicitly bounded editorial change.
// All other source frames must already exist; never silently encode holes.
const range = process.env.FILM_RANGE?.split(':').map(Number) || [0, duration];
if (range.length !== 2 || range.some(t => !Number.isFinite(t)) || range[0] < 0 || range[1] > duration || range[0] >= range[1]) throw Error('FILM_RANGE must be start:end seconds within 0:24');
const probes = [0, .65, 1.3, 2.3, 3.65, 4.8, 5.5, 6.65, 7.5, 8.5, 9.8, 11.2, 12.8, 13.8, 14.8, 15.7, 16.8, 17.8, 19.2, 20.4, 21.8, 22.7, 23.6];
mkdirSync(out, { recursive: true });
mkdirSync(web, { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// A locally synthesized score: soft sixteenth-note plucks, a warm bassline,
// transition air and an ending chord. No borrowed recordings or samples.
function soundtrack() {
  const rate = 44100, pcm = new Float64Array(rate * duration);
  const tone = (start, length, frequency, gain, kind = 'pluck') => {
    for (let j = 0; j < Math.floor(length * rate); j++) {
      const x = j / rate, i = Math.floor(start * rate) + j;
      if (i >= pcm.length) break;
      const env = Math.min(1, x / .012) * Math.exp(-x * (kind === 'pad' ? 1.8 : 7) / length) * Math.min(1, (length - x) / .08);
      const wave = Math.sin(2 * Math.PI * frequency * x) + .15 * Math.sin(4 * Math.PI * frequency * x);
      pcm[i] += env * gain * wave;
    }
  };
  const notes = [261.626, 329.628, 391.995, 523.251, 440, 329.628, 391.995, 293.665];
  for (let i = 0; i < 56; i++) {
    const start = .25 + i * .375;
    tone(start, .55, notes[i % notes.length], i % 4 === 0 ? .075 : .038);
    if (i % 4 === 0) tone(start, 1.25, [130.813, 110, 146.832, 130.813][Math.floor(i / 4) % 4], .065, 'pad');
  }
  for (const [start, freq] of [[1.55, 783.99], [5.15, 659.25], [8.15, 783.99], [11.05, 523.25], [13.4, 659.25], [18.6, 783.99]]) tone(start, .8, freq, .05);
  for (const [i, freq] of [261.626, 329.628, 391.995, 523.251].entries()) tone(21.1 + i * .1, 2.5, freq, .055, 'pad');
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.round(Math.tanh(pcm[i]) * 32767), 44 + i * 2);
  const file = path.join(out, 'original-score.wav'); writeFileSync(file, wav); return file;
}

const site = path.join(out, 'site');
await build({ publicDir: false, logLevel: 'warn', build: { outDir: site, emptyOutDir: true, manifest: false, rollupOptions: { input: path.resolve('film.html') } } });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = pathname.startsWith('/film/out/') ? path.resolve('.', '.' + pathname) : path.join(site, pathname);
  if (pathname.startsWith('/film/out/') && !file.startsWith(path.resolve('film/out') + path.sep)) { response.writeHead(404).end(); return; }
  if (!existsSync(file)) file = path.join(path.resolve('public'), pathname);
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: phone ? 1440 : 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: theme });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/film.html?mode=reference&theme=${theme}${phone ? '&framing=phone' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__film === 'function');
  await page.evaluate(() => document.fonts.ready);
  const capture = async (t, file) => {
    await page.evaluate(t => window.__film(t), t);
    if (errors.length) throw Error(errors.join('\n'));
    await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 95, animations: 'disabled' });
  };
  for (const t of probes) await capture(t, `probe-${t}.jpg`);
  await capture(0, 'poster-source.jpg');
  ffmpeg(['-i', path.join(out, 'poster-source.jpg'), '-vf', `scale=${phone ? '960:720' : '1440:810'}`, '-q:v', '3', '-frames:v', '1', path.join(web, `sharetexts-${family}-poster.jpg`)]);
  if (statSync(path.join(web, `sharetexts-${family}-poster.jpg`)).size > 150_000) throw Error('Poster exceeds 150 KB budget');
  if (mode === 'render') {
    for (let i = 0; i < duration * fps; i++) {
      const file = `f${String(i).padStart(5, '0')}.jpg`;
      if (i / fps >= range[0] && i / fps < range[1]) await capture(i === duration * fps - 1 ? 0 : i / fps, file);
      else if (!existsSync(path.join(out, file))) throw Error(`Incremental render missing ${file}; run a full render first`);
      if (i % fps === 0) console.log(`${family}: ${i / fps}/${duration}s`);
    }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

if (mode === 'render') {
  const input = ['-framerate', String(fps), '-i', path.join(out, 'f%05d.jpg')];
  const codec = ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709', '-movflags', '+faststart'];
  const movie = path.join(web, `sharetexts-${family}.mp4`);
  // Two-pass ABR gives every mutually-exclusive cut the same hard budget.
  const pass = path.join(out, 'encode-pass');
  const filter = ['-vf', `scale=${phone ? '960:720' : '1440:810'}:out_color_matrix=bt709:out_range=tv`];
  ffmpeg([...input, ...filter, ...codec, '-b:v', '900k', '-pass', '1', '-passlogfile', pass, '-an', '-f', 'mp4', '/dev/null']);
  ffmpeg([...input, ...filter, ...codec, '-b:v', '900k', '-pass', '2', '-passlogfile', pass, '-an', movie]);
  if (statSync(movie).size >= 3_000_000) throw Error(`Inline movie exceeds budget: ${statSync(movie).size}`);
  if (!phone) ffmpeg([...input, '-i', soundtrack(), ...codec, '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-t', String(duration), path.join(web, `sharetexts-${family}-full.mp4`)]);
  console.log(`${movie}: ${statSync(movie).size} bytes`);
}
console.log(`${mode} complete: ${out}`);
