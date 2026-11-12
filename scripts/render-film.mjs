/**
 * render-film.mjs — the ShareTexts hero film rig.
 *
 * There is no 3D package here, so the film is shot rather than simulated: the
 * real product UI (LaptopApp / PhoneApp in src/film/FilmUI.tsx) is driven by a
 * deterministic clock and captured frame by frame at 1920×1080, then graded by
 * the stage itself and encoded with ffmpeg.
 *
 * Steps:
 *   node scripts/render-film.mjs probe    nine stills to check framing/light
 *   node scripts/render-film.mjs frames   34.0s film  → film/frames
 *   node scripts/render-film.mjs loop     10.0s hero loop → film/frames-loop
 *   node scripts/render-film.mjs audio    voiceover + music + sound design
 *   node scripts/render-film.mjs encode   frames + audio → film/out/*.mp4
 *   node scripts/render-film.mjs web       loop → public/film (+ poster)
 *   node scripts/render-film.mjs all      everything except probe
 *
 * Env: BASE_URL (dev server), FPS, FROM/TO (frame range).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const ROOT = process.cwd();
const FRAMES = path.join(ROOT, 'film', 'frames');
const LOOP_FRAMES = path.join(ROOT, 'film', 'frames-loop');
const AUDIO = path.join(ROOT, 'film', 'audio');
const OUT = path.join(ROOT, 'film', 'out');
const WEB = path.join(ROOT, 'public', 'film');
const FPS = Number(process.env.FPS || 24);
const DURATION = 34.0;
const LOOP = 10.0;

for (const dir of [FRAMES, LOOP_FRAMES, AUDIO, OUT, WEB]) fs.mkdirSync(dir, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const dur = (file) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])
      .toString()
      .trim(),
  );

/* Audio. The hero on the site is muted by policy, so the film has to stand up
   silently: the on-screen story carries every fact, and these tracks are for
   anyone who plays the 1080p file deliberately. The voiceover is TWO reads for
   the same reason as before — one clip long enough to cover 29 seconds would
   force the whole read to hurry, and `-shortest` would then decide the film's
   length from the audio's. */
const VO_BODY = `Open it on both devices. Your other device appears in the room.
One tap, and you are connected. Now send anything.
Text from the phone. A photo. A file. They land on the laptop.
Direct on your network, end to end. Encrypted. Nothing is kept.`;
const VO_TAG = 'ShareTexts. Move anything between your devices.';
const VO_TAG_AT = 29.4;

async function openFilm(browser, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${BASE}/film.html${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__film === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  if (errors.length) throw new Error(`film page errors: ${errors.slice(0, 3).join(' | ')}`);
  return { ctx, page };
}

/** Capture one frame at an exact time.
 *
 * The await is not ceremony: editing a component while a render is in flight
 * makes Vite reload the page, and for a moment `window.__film` does not exist
 * — which used to kill a 20-minute pass at frame 1 with "not a function".
 * Waiting for the hook (and retrying once) makes a reload a hiccup instead. */
async function shoot(page, t, file) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.waitForFunction(() => typeof window.__film === 'function', null, { timeout: 20000 });
      await page.evaluate((time) => window.__film(time), t);
      await page.screenshot({ path: file });
      return;
    } catch (err) {
      if (attempt === 1) throw err;
      console.log(`frame t=${t}s: page not ready (${err.message.split('\n')[0]}), retrying`);
      await page.waitForTimeout(1200);
    }
  }
}

async function probe() {
  const browser = await chromium.launch();
  const { ctx, page } = await openFilm(browser);
  for (const t of [1.4, 4.8, 7.4, 10.6, 12.8, 14.9, 18.8, 23.7, 27.8, 31.2]) {
    const file = path.join(OUT, `probe-${String(t).replace('.', '_')}.png`);
    await shoot(page, t, file);
    console.log(`probe t=${t}s → ${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
  await ctx.close();

  const loop = await openFilm(browser, '?mode=loop');
  for (const t of [0, 3.2, 6.4]) {
    const file = path.join(OUT, `probe-loop-${String(t).replace('.', '_')}.png`);
    await shoot(loop.page, t, file);
    console.log(`probe loop t=${t}s → ${path.basename(file)}`);
  }
  await loop.ctx.close();
  await browser.close();
}

/** Is this a COMPLETE and READABLE png?
 *
 * A kill mid-write leaves frames that pass a size check and then blow up the
 * encoder minutes later ("inflate returned error -3"), which is how a 34 s film
 * ended up two frames short with no error in the render log. IEND alone is not
 * enough — a truncated write can leave a valid tail over damaged IDAT data — so
 * the image data is actually inflated here. ~10 ms a frame.
 */
function pngComplete(file) {
  try {
    const { size } = fs.statSync(file);
    if (size < 20000) return false;
    const buf = fs.readFileSync(file);
    if (buf.subarray(size - 8, size - 4).toString('ascii') !== 'IEND') return false;
    let off = 8;
    const idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
      off += 12 + len;
      if (type === 'IEND') break;
    }
    zlib.inflateSync(Buffer.concat(idat));
    return true;
  } catch {
    return false;
  }
}

async function capture(dir, total, query) {
  const from = Number(process.env.FROM || 0);
  const to = Number(process.env.TO || total);
  const browser = await chromium.launch();
  const { ctx, page } = await openFilm(browser, query);
  const started = Date.now();
  for (let i = from; i < to; i += 1) {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.png`);
    if (pngComplete(file)) continue; // resumable
    await shoot(page, i / FPS, file);
    if (i % 24 === 0) {
      const done = i - from + 1;
      const rate = done / ((Date.now() - started) / 1000);
      const left = Math.round((to - i) / Math.max(rate, 0.5));
      console.log(`frame ${i}/${to} · ${rate.toFixed(1)} fps · ~${left}s left`);
    }
  }
  console.log(`frames: ${path.basename(dir)} ${from}–${to} done`);
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
  return dur(file);
}

function voiceover() {
  const body = speak(VO_BODY, path.join(AUDIO, 'vo-body.wav'), 0);
  const tag = speak(VO_TAG, path.join(AUDIO, 'vo-tag.wav'), -1);
  console.log(`audio: vo-body ${body.toFixed(2)}s · vo-tag ${tag.toFixed(2)}s`);
  if (0.9 + body > VO_TAG_AT) console.log(`WARN vo-body ends at ${(0.9 + body).toFixed(2)}s, past the tag at ${VO_TAG_AT}s`);
  if (VO_TAG_AT + tag > DURATION) console.log(`WARN vo-tag ends at ${(VO_TAG_AT + tag).toFixed(2)}s, past ${DURATION}s`);
}

function music() {
  ff([
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=164.81:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DURATION + 1}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `sine=frequency=329.63:duration=${DURATION + 1}:sample_rate=48000`,
    '-filter_complex',
    '[0:a]volume=0.15[a0];[1:a]volume=0.10[a1];[2:a]volume=0.055[a2];[3:a]volume=0.03[a3];'
      + '[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,'
      + 'lowpass=f=1100,tremolo=f=0.12:d=0.28,volume=0.9,'
      + 'afade=t=in:st=0:d=3.2,afade=t=out:st=27.4:d=3.0',
    path.join(AUDIO, 'music.wav'),
  ]);
  console.log('audio: music.wav');
}

/** Sound design on the beats the picture cuts on: the tap, the link, and each
 *  arrival. Delays are milliseconds and mirror FilmStage's timings exactly. */
function sfx() {
  ff([
    '-f', 'lavfi', '-i', 'sine=frequency=1500:duration=0.06:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=1180:duration=0.07:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.0:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=1.0:sample_rate=48000',
    '-filter_complex',
    '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.20,adelay=7000[a0];'
      + '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.16,adelay=14450[a1];'
      + '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.16,adelay=18350[a2];'
      + '[0:a]afade=t=out:st=0.01:d=0.05,volume=0.14,adelay=23250[a3];'
      + '[1:a]afade=t=out:st=0.04:d=0.9,volume=0.12,adelay=9000[c0];'
      + '[2:a]afade=t=out:st=0.04:d=0.9,volume=0.08,adelay=9000[c1];'
      + '[a0][a1][a2][a3][c0][c1]amix=inputs=6:normalize=0:duration=longest',
    path.join(AUDIO, 'sfx.wav'),
  ]);
  console.log('audio: sfx.wav');
}

function mix() {
  ff([
    '-i', path.join(AUDIO, 'music.wav'),
    '-i', path.join(AUDIO, 'sfx.wav'),
    '-i', path.join(AUDIO, 'vo-body.wav'),
    '-i', path.join(AUDIO, 'vo-tag.wav'),
    '-filter_complex',
    '[2:a]adelay=900:all=1,volume=1.9[vo];'
      + `[3:a]adelay=${Math.round(VO_TAG_AT * 1000)}:all=1,volume=2.0[tag];`
      + '[0:a][1:a][vo][tag]amix=inputs=4:normalize=0:duration=longest,'
      + 'alimiter=limit=0.92,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
    path.join(AUDIO, 'mix.wav'),
  ]);
  console.log('audio: mix.wav');
}

function encodeFilm() {
  const video = path.join(AUDIO, 'video-only.mp4');
  ff([
    '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    video,
  ]);
  const final = path.join(OUT, 'sharetexts-hero-1080p.mp4');
  ff([
    '-i', video, '-i', path.join(AUDIO, 'mix.wav'),
    '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k',
    '-t', dur(video).toFixed(3), '-movflags', '+faststart', final,
  ]);
  console.log(`encode: film/out/sharetexts-hero-1080p.mp4 · ${dur(final).toFixed(2)}s · ${(fs.statSync(final).size / 1048576).toFixed(1)} MB`);
}

/** The web hero: the loop, silent, as small as it can be without the UI type
 *  going soft. CRF 21 against flat UI is where artefacts stop being visible on
 *  a laptop screen; below that the file grows for no picture. */
function web() {
  const mp4 = path.join(WEB, 'sharetexts-hero.mp4');
  ff([
    '-framerate', String(FPS), '-i', path.join(LOOP_FRAMES, 'f%05d.png'),
    '-an', '-c:v', 'libx264', '-preset', 'slower', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '48',
    mp4,
  ]);
  const poster = path.join(WEB, 'sharetexts-hero-poster.jpg');
  ff(['-i', path.join(LOOP_FRAMES, 'f00000.png'), '-frames:v', '1', '-q:v', '3', '-vf', 'scale=1280:-2', poster]);
  console.log(
    `web: public/film/sharetexts-hero.mp4 · ${dur(mp4).toFixed(2)}s · ${(fs.statSync(mp4).size / 1024).toFixed(0)} KB`
    + ` · poster ${(fs.statSync(poster).size / 1024).toFixed(0)} KB`,
  );
}

const step = process.argv[2] || 'all';
if (step === 'probe') await probe();
else if (step === 'frames') await capture(FRAMES, Math.round(DURATION * FPS), '');
else if (step === 'loop') await capture(LOOP_FRAMES, Math.round(LOOP * FPS), '?mode=loop');
else if (step === 'audio') { voiceover(); music(); sfx(); mix(); }
else if (step === 'encode') encodeFilm();
else if (step === 'web') web();
else {
  await capture(FRAMES, Math.round(DURATION * FPS), '');
  await capture(LOOP_FRAMES, Math.round(LOOP * FPS), '?mode=loop');
  voiceover(); music(); sfx(); mix();
  encodeFilm();
  web();
}
