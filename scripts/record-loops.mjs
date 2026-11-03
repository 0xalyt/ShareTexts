// record-loops.mjs — record the three front-door stories from the real product.
//
// DESIGN.md §20b. One command: drives a phone-viewport browser through Pair,
// Send and Keep, captures each run, and encodes MP4 (H.264), WebM (VP9) and a
// WebP poster into public/media/loops/. It then writes
// src/lib/loops.generated.ts so the landing knows what exists.
//
//   npm run record-loops                # against the dev server
//   URL=http://127.0.0.1:3330 npm run record-loops
//
// Rules kept deliberately:
//   • determinism — fixed device names are NOT invented: the app's own default
//     names are used, and the run is single-device where one device is enough.
//   • no invented content — the text sent is "Hello from the phone", the same
//     string the smoke test uses.
//   • budgets — MP4 ≤ 350 KB, WebM ≤ 300 KB, poster ≤ 40 KB, ≤ 6 s at 30 fps.
//     A recording that misses the budget fails the command instead of shipping.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
const OUT = 'public/media/loops';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'st-loops-'));
const W = 390;
const H = 844;
const DURATION = 6;
const BUDGET = { mp4: 350 * 1024, webm: 300 * 1024, poster: 40 * 1024 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

/** Duration of a recording, in seconds, from ffprobe. */
function duration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  const d = Number(String(out).trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error('cannot read duration of ' + file);
  return d;
}

/** Encode one recording to the three deliverables and check the budget. */
function encode(name, src, offset) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  const webm = path.join(OUT, `${name}.webm`);
  const poster = path.join(OUT, `${name}.webp`);

  // A story must be seen, not skimmed: the output is the run compressed to
  // between 3.5 and 6 seconds, never longer, never a two-second blur.
  const total = duration(src);
  const run = Math.max(0.8, total - offset);
  const outFor = Math.min(DURATION, Math.max(3.5, run * 0.6));
  const speed = run / outFor;
  const filter = `setpts=(PTS-STARTPTS)/${speed.toFixed(3)},fps=30,scale=${W}:${H}:flags=bicubic`;
  const seek = ['-ss', offset.toFixed(2)];
  const trim = ['-t', outFor.toFixed(2)];

  let crf = 30;
  for (;;) {
    ffmpeg([...seek, '-i', src, '-vf', filter, ...trim, '-an', '-c:v', 'libx264', '-profile:v', 'main',
      '-pix_fmt', 'yuv420p', '-crf', String(crf), '-movflags', '+faststart', mp4]);
    if (fs.statSync(mp4).size <= BUDGET.mp4 || crf >= 36) break;
    crf += 2;
  }
  ffmpeg([...seek, '-i', src, '-vf', filter, ...trim, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40',
    '-row-mt', '1', '-deadline', 'good', webm]);
  // Pinned encoder: a .webp output alone lets ffmpeg pick the ANIMATED webp
  // muxer, which fails on a single frame.
  ffmpeg([
    '-ss', (offset + run * 0.92).toFixed(2), '-i', src,
    '-vf', `scale=${W}:${H}:flags=bicubic`,
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', '-f', 'webp', poster,
  ]);

  const sizes = {
    mp4: fs.statSync(mp4).size,
    webm: fs.statSync(webm).size,
    poster: fs.statSync(poster).size,
  };
  const over = Object.entries(sizes).filter(([k, v]) => v > BUDGET[k]);
  if (over.length) {
    throw new Error(
      `${name} over budget: ` + over.map(([k, v]) => `${k}=${Math.round(v / 1024)}KB`).join(' '),
    );
  }
  return { ...sizes, seconds: outFor, speed };
}

/** One scene: open a recording context, run `drive`, close, return the file. */
async function scene(name, drive) {
  const browser = await chromium.launch();
  let mark = null;
  const startStory = () => { mark = Date.now(); };
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: W, height: H } },
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  // Playwright's video begins with the first painted frame of this page; the
  // page's own clock is the closest honest reference for where to cut.
  const videoT0 = Date.now();
  try {
    await drive(page, browser, startStory);
  } finally {
    const video = page.video();
    await ctx.close();
    await browser.close();
    if (video) {
      const p = await video.path();
      fs.copyFileSync(p, path.join(TMP, `${name}.webm`));
    }
  }
  return { file: path.join(TMP, `${name}.webm`), offset: Math.max(0, (mark ?? videoT0) - videoT0) / 1000 };
}

async function openHome(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-send').waitFor({ timeout: 20000 });
  await sleep(600);
}

/** Pair: A shows a code, B types it, both land in the room. */
async function drivePair(page, browser, startStory) {
  const a = page;
  await openHome(a);
  await a.getByTestId('home-send').click();
  await a.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
  startStory();
  await sleep(1200);

  const ctxB = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const b = await ctxB.newPage();
  await b.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await b.getByTestId('home-receive').click();
  await b.waitForSelector('[data-testid="receive-screen"]');
  await sleep(300);
  const code = await a.evaluate(() =>
    [...document.querySelectorAll('[data-testid="pairing-code"] span[aria-hidden]')]
      .map((e) => e.textContent)
      .join(''),
  );
  // Type it at a human pace — this is the moment the loop exists to show.
  for (const digit of code) {
    await b.keyboard.type(digit);
    await sleep(90);
  }
  await a.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  await sleep(1800);
  await ctxB.close();
}

/** Send: paste text, send it, watch it land with the seen tick. */
async function driveSend(page, browser, startStory) {
  await openHome(page);
  await page.getByTestId('home-send').click();
  await page.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
  const code = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="pairing-code"] span[aria-hidden]')]
      .map((e) => e.textContent)
      .join(''),
  );
  const ctxB = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const b = await ctxB.newPage();
  await b.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await b.getByTestId('home-receive').click();
  await b.waitForSelector('[data-testid="receive-screen"]');
  await b.keyboard.type(code);
  await page.waitForSelector('[data-testid="composer"]', { timeout: 25000 });
  startStory();
  await sleep(700);

  const field = page.getByTestId('composer');
  await field.click();
  await field.fill('Hello from the phone');
  await sleep(400);
  await page.getByTestId('send').click();
  await sleep(2000);
  await ctxB.close();
}

/** Keep: create a Temporary Space and show the link it hands back. */
async function driveKeep(page, _browser, startStory) {
  await openHome(page);
  // The hero's space row opens the choose sheet.
  await page.getByText('Temporary Space', { exact: false }).first().click();
  await page.waitForSelector('[data-testid="space-sheet"]', { timeout: 20000 });
  startStory();
  await sleep(500);
  await page.getByTestId('space-sheet-create').click();
  await sleep(400);
  // The story is the space that exists afterwards, so the run has to include
  // the create: the sheet alone would be a picture of a form.
  await page.getByRole('button', { name: /create space/i }).click();
  await sleep(4500);
}

// ── run ────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const media = {};
for (const [name, drive] of [['pair', drivePair], ['send', driveSend], ['keep', driveKeep]]) {
  console.log(`recording ${name}…`);
  const { file, offset } = await scene(name, drive);
  console.log(`  story starts at ${offset.toFixed(1)}s`);
  const sizes = encode(name, file, offset);
  media[name] = sizes;
  console.log(
    `  ${name}: ${sizes.seconds.toFixed(1)}s (${sizes.speed.toFixed(1)}×) mp4 ${Math.round(sizes.mp4 / 1024)}KB · webm ${Math.round(sizes.webm / 1024)}KB · poster ${Math.round(sizes.poster / 1024)}KB`,
  );
}

// ── the manifest the landing reads ─────────────────────────────────────────
const generated = `/* Generated by scripts/record-loops.mjs — written, not edited.
 *
 * Each entry names the poster and the two encodings of one product story. A
 * \`null\` entry means no recording exists yet, and the story renders its words
 * without a frame (DESIGN.md §20b: a missing recording is a build failure, not
 * a blank box — so the page shows nothing rather than an empty card).
 */
export type LoopName = 'pair' | 'send' | 'keep';

export interface LoopMedia {
  poster: string;
  mp4: string;
  webm: string;
  width: number;
  height: number;
}

export const LOOPS: Record<LoopName, LoopMedia | null> = {
${Object.keys(media)
  .map(
    (name) => `  ${name}: {
    poster: '/media/loops/${name}.webp',
    mp4: '/media/loops/${name}.mp4',
    webm: '/media/loops/${name}.webm',
    width: ${W},
    height: ${H},
  },`,
  )
  .join('\n')}
};
`;
fs.writeFileSync('src/lib/loops.generated.ts', generated);
const total = Object.values(media).reduce((n, s) => n + s.mp4 + s.webm + s.poster, 0);
console.log(`total landing media: ${Math.round(total / 1024)} KB (budget 1.2 MB)`);
if (total > 1.2 * 1024 * 1024) throw new Error('landing media over the 1.2 MB budget');
console.log('loops written to', OUT);
