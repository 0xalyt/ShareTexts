/**
 * render-film.mjs — the ShareTexts hero film rig.
 *
 * There is no 3D package on this machine, so the film is rendered the honest
 * way instead: the real product UI (the same components the site renders) is
 * driven by a deterministic clock and captured frame by frame at 1920×1080,
 * then encoded with ffmpeg. Every frame is reproducible.
 *
 * Steps (run in order, or `all`):
 *   node scripts/render-film.mjs assets   real landing screens → film/assets
 *   node scripts/render-film.mjs probe    three stills to check framing
 *   node scripts/render-film.mjs frames   full frame sequence → film/frames
 *   node scripts/render-film.mjs audio    voiceover + music + sound design
 *   node scripts/render-film.mjs encode   frames + audio → film/out/*.mp4
 *
 * Env: BASE_URL (dev server), FPS, FROM/TO (frame range).
 */
import { chromium, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const ROOT = process.cwd();
const ASSETS = path.join(ROOT, 'film', 'assets');
const FRAMES = path.join(ROOT, 'film', 'frames');
const AUDIO = path.join(ROOT, 'film', 'audio');
const OUT = path.join(ROOT, 'film', 'out');
const FPS = Number(process.env.FPS || 24);
const DURATION = 36.0;

for (const dir of [ASSETS, FRAMES, AUDIO, OUT]) fs.mkdirSync(dir, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/* The voiceover is TWO reads, not one. A single clip has to be short enough to
   finish before the end card, which forces the whole script to hurry; split, the
   body can take its time and the brand line is placed on the card by
   construction instead of by luck. The first attempt was one 43.2s read against
   a 33.5s film, and `-shortest` cut the closing line without complaining. */
const VO_BODY = `Tired of emailing yourself files, or hunting for cables?
ShareTexts moves text, photos, videos, and any file between any devices, from the browser.
Open it on both devices. Your other device appears. Connect once.
Then send anything. Encrypted. Nothing is kept.
Phone to laptop. iPhone to Windows. Any browser.`;
const VO_TAG = 'ShareTexts. Move anything between your devices.';
const VO_TAG_AT = 30.6; // the end card lands at 30.2

/**
 * The landing screens, captured from the real site in dark mode. The laptop is
 * 1440×900 (exactly the 16:10 glass) and the phone is 390×845 (9:19.5), so each
 * drops into its frame with no letterboxing.
 */
async function assets() {
  const browser = await chromium.launch();

  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(ASSETS, 'landing-laptop.png'),
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await ctx.close();
    console.log('assets: landing-laptop.png 2880×1800');
  }

  {
    const ctx = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 845 },
      deviceScaleFactor: 3,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(ASSETS, 'landing-phone.png'),
      clip: { x: 0, y: 0, width: 390, height: 845 },
    });
    await ctx.close();
    console.log('assets: landing-phone.png 1170×2535');
  }

  await browser.close();
}

async function openFilm(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${BASE}/film.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__film === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  if (errors.length) throw new Error(`film page errors: ${errors.slice(0, 3).join(' | ')}`);
  return { ctx, page };
}

async function shoot(page, t, file) {
  await page.evaluate((time) => window.__film(time), t);
  await page.screenshot({ path: file });
}

async function probe() {
  const browser = await chromium.launch();
  const { ctx, page } = await openFilm(browser);
  for (const t of [1.6, 6.4, 11.0, 14.6, 19.9, 25.0, 28.6, 32.0]) {
    const file = path.join(OUT, `probe-${String(t).replace('.', '_')}.png`);
    await shoot(page, t, file);
    console.log(`probe t=${t}s → ${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
  await ctx.close();
  await browser.close();
}

async function frames() {
  const total = Math.round(DURATION * FPS);
  const from = Number(process.env.FROM || 0);
  const to = Number(process.env.TO || total);
  const browser = await chromium.launch();
  const { ctx, page } = await openFilm(browser);
  const started = Date.now();
  for (let i = from; i < to; i += 1) {
    const file = path.join(FRAMES, `f${String(i).padStart(5, '0')}.png`);
    if (fs.existsSync(file) && fs.statSync(file).size > 2000) continue; // resumable
    await shoot(page, i / FPS, file);
    if (i % 24 === 0) {
      const done = i - from + 1;
      const rate = done / ((Date.now() - started) / 1000);
      const left = Math.round((to - i) / Math.max(rate, 0.5));
      console.log(`frame ${i}/${to} · ${rate.toFixed(1)} fps · ~${left}s left`);
    }
  }
  console.log(`frames: ${from}–${to} done`);
  await ctx.close();
  await browser.close();
}

/** One read, via the OS speech engine (SAPI). A reference track, not a
 *  finished one — a human or premium TTS should replace it. */
function speak(text, file, rate) {
  const txt = file.replace(/\.wav$/, '.txt');
  fs.writeFileSync(txt, text, 'utf8');
  const ps = [
    'Add-Type -AssemblyName System.Speech;',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    '$s.SelectVoice("Microsoft David Desktop");',
    `$s.Rate = ${rate};`,
    '$s.Volume = 100;',
    `$s.SetOutputToWaveFile("${file.replace(/\\/g, '\\\\')}");`,
    `$s.Speak((Get-Content -Raw "${txt.replace(/\\/g, '\\\\')}"));`,
    '$s.Dispose();',
  ].join(' ');
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  return Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])
      .toString()
      .trim(),
  );
}

function voiceover() {
  const body = speak(VO_BODY, path.join(AUDIO, 'vo-body.wav'), 0);
  // The tag is read slower than the body: it is the line the film ends on.
  const tag = speak(VO_TAG, path.join(AUDIO, 'vo-tag.wav'), -1);
  console.log(`audio: vo-body ${body.toFixed(2)}s · vo-tag ${tag.toFixed(2)}s`);
  if (0.65 + body > VO_TAG_AT) {
    console.log(`WARN vo-body ends at ${(0.65 + body).toFixed(2)}s, past the tag at ${VO_TAG_AT}s`);
  }
  if (VO_TAG_AT + tag > DURATION) {
    console.log(`WARN vo-tag ends at ${(VO_TAG_AT + tag).toFixed(2)}s, past the film's ${DURATION}s`);
  }
  return { body, tag };
}

function music() {
  const out = path.join(AUDIO, 'music.wav');
  ff([
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=164.81:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=329.63:duration=${DURATION + 1}:sample_rate=48000`,
    '-filter_complex',
    '[0:a]volume=0.15[a0];[1:a]volume=0.10[a1];[2:a]volume=0.055[a2];[3:a]volume=0.03[a3];'
      + '[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,'
      // tremolo's frequency floor is 0.1 Hz — 0.09 aborts the whole graph
      + 'lowpass=f=1100,tremolo=f=0.12:d=0.28,volume=0.9,'
      + `afade=t=in:st=0:d=3.5,afade=t=out:st=${DURATION - 4}:d=4`,
    out,
  ]);
  console.log('audio: music.wav');
}

function sfx() {
  const out = path.join(AUDIO, 'sfx.wav');
  ff([
    '-f', 'lavfi', '-i', 'sine=frequency=1500:duration=0.06:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=1180:duration=0.07:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.1:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=1.1:sample_rate=48000',
    '-filter_complex',
    '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.20,adelay=13950[a0];'
      + '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.16,adelay=19250[a1];'
      + '[1:a]afade=t=out:st=0.01:d=0.06,volume=0.14,adelay=23600[a2];'
      + '[2:a]afade=t=out:st=0.04:d=1.0,volume=0.13,adelay=15300[c0];'
      + '[3:a]afade=t=out:st=0.04:d=1.0,volume=0.09,adelay=15300[c1];'
      + '[a0][a1][a2][c0][c1]amix=inputs=5:normalize=0:duration=longest',
    out,
  ]);
  console.log('audio: sfx.wav');
}

function mix() {
  const out = path.join(AUDIO, 'mix.wav');
  ff([
    '-i', path.join(AUDIO, 'music.wav'),
    '-i', path.join(AUDIO, 'sfx.wav'),
    '-i', path.join(AUDIO, 'vo-body.wav'),
    '-i', path.join(AUDIO, 'vo-tag.wav'),
    '-filter_complex',
    '[2:a]adelay=650:all=1,volume=1.9[vo];'
      + `[3:a]adelay=${Math.round(VO_TAG_AT * 1000)}:all=1,volume=2.0[tag];`
      + '[0:a][1:a][vo][tag]amix=inputs=4:normalize=0:duration=longest,'
      + 'alimiter=limit=0.92,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
    out,
  ]);
  console.log('audio: mix.wav');
}

function encode() {
  const video = path.join(AUDIO, 'video-only.mp4');
  ff([
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    video,
  ]);
  console.log('encode: video-only.mp4');
  const final = path.join(OUT, 'sharetexts-hero-1080p.mp4');
  ff([
    '-i', video,
    '-i', path.join(AUDIO, 'mix.wav'),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    '-movflags', '+faststart',
    final,
  ]);
  const size = fs.statSync(final).size / (1024 * 1024);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', final]).toString().trim();
  console.log(`encode: ${path.relative(ROOT, final)} · ${dur}s · ${size.toFixed(1)} MB`);
}

/** Re-mux the existing video with a fresh audio mix. Video is stream-copied, so
 *  changing the voiceover costs seconds instead of another full encode. */
function mux() {
  const final = path.join(OUT, 'sharetexts-hero-1080p.mp4');
  ff([
    '-i', path.join(AUDIO, 'video-only.mp4'),
    '-i', path.join(AUDIO, 'mix.wav'),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    '-movflags', '+faststart',
    final,
  ]);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', final]).toString().trim();
  const size = fs.statSync(final).size / (1024 * 1024);
  console.log(`mux: ${path.relative(ROOT, final)} · ${dur}s · ${size.toFixed(1)} MB`);
}

const step = process.argv[2] || 'all';
if (step === 'assets') await assets();
else if (step === 'probe') await probe();
else if (step === 'frames') await frames();
else if (step === 'audio') { voiceover(); music(); sfx(); mix(); }
else if (step === 'encode') encode();
else if (step === 'mux') mux();
else {
  await assets();
  voiceover(); music(); sfx(); mix();
  await frames();
  encode();
}
