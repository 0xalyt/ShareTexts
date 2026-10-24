// verify-emoji.mjs — the DESIGN.md §7 artwork gate (promoted from the
// scratch _probe-emoji-render.mjs, now with the native-build check).
//
// Needs a real pair on a live dev server (the composer exists only once a
// second device joins) — same flow as verify-reactions.
//
// Checks, in order (any FAIL → exit 1):
//   1. The six public/emoji-apple/*.png are served 200 image/png.
//   2. The picker shows six <img> and every one decoded (naturalWidth > 0,
//      the 160×160 restored source).
//   3. A reaction chip contains an <img> wearing the same artwork.
//   4. With /emoji-apple/** aborted, the chip falls back to the native
//      character (never a blank) — the §7 failure path.
//   5. NATIVE BUILD: `vite build --outDir .tmp-native` with
//      VITE_EMOJI_SET=native, served by the real production server from a
//      temp root: no <img src*="emoji-apple"> exists anywhere (picker open)
//      and the chip shows the native character. .tmp-native* is deleted
//      afterwards.
// Plus: both devices stay console-clean (the deliberate emoji-apple aborts
// and the native build's loud "no signaling env" production warning are
// allowed; anything else fails the gate).
//
// Proof screenshots (DESIGN.md §0.8): audit/p1a/
//   emoji-picker-{390x844,1440x900}-{light,dark}.png  (picker open)
//   emoji-chip-{light,dark}.png                       (the artwork on a chip)
//
//   URL=http://localhost:3012 node scripts/verify-emoji.mjs   (default 3012)
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const BASE = (process.env.URL || 'http://localhost:3012').replace(/\/$/, '');
const ROOT = process.cwd();
const EMOJI_DIR = path.join(ROOT, 'public', 'emoji-apple');
const PROOF_DIR = path.join(ROOT, 'audit', 'p1a');
const TMP_BUILD = path.join(ROOT, '.tmp-native');
const TMP_ROOT = path.join(ROOT, '.tmp-native-root');

let failures = 0;
const out = (ok, name, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});
async function waitHealth(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

/** Windows hands transient EPERM to deletes/renames while a just-killed
 *  child still holds the directory (it was that child's cwd). Retry — and
 *  if it never yields, leave it: the .gitignore temp rule covers it and the
 *  next run clears both folders before building. */
async function rmDeep(p) {
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rm(p, { recursive: true, force: true });
      return true;
    } catch {
      await sleep(300 * (i + 1));
    }
  }
  return false;
}

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: pageerror: ${e.message}`));
};

/** The verified two-device room flow (create on A, /s/<code> join on B).
 *  `base` defaults to the main dev server; the native check passes the temp
 *  server's origin — without it the "native" flow would silently re-test
 *  the apple build on BASE (the bug this line fixes). */
async function pairDevices(pa, pb, base = BASE) {
  await pa.goto(base, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid]', { timeout: 20000 });
  await pa.getByTestId('home-send').click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);
  await pb.goto(base, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1500);
  await pb.evaluate((code) => { location.href = '/s/' + code; }, short);
  await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
}

const setTheme = (page, theme) => page.evaluate((t) => {
  document.documentElement.classList.toggle('dark', t === 'dark');
}, theme);

let nativeServer = null;
try {
  await fs.mkdir(PROOF_DIR, { recursive: true });

  // ── 1. the six PNGs are served 200 image/png ─────────────────────────────
  const names = (await fs.readdir(EMOJI_DIR)).filter((n) => n.endsWith('.png')).sort();
  out(names.length === 6, 'public/emoji-apple holds exactly six PNGs', `count=${names.length}`);
  for (const n of names) {
    let status = 0; let ct = '';
    try {
      const res = await fetch(`${BASE}/emoji-apple/${n}`);
      status = res.status;
      ct = res.headers.get('content-type') || '';
      await res.arrayBuffer();
    } catch (e) { ct = e.message; }
    out(status === 200 && ct.includes('image/png'), `served 200 image/png: ${n}`, `${status} ${ct}`);
  }

  // ── pair, message ────────────────────────────────────────────────────────
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();
  watch(pa, 'A');
  watch(pb, 'B');

  await pairDevices(pa, pb);
  await pa.getByTestId('composer').fill('emoji artwork gate');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=emoji artwork gate', { timeout: 15000 });
  await pa.waitForTimeout(800);

  // ── 2. picker: six controls, each a decoded Apple PNG ────────────────────
  await pb.locator('button[aria-label="React"]').first().click();
  await pb.waitForSelector('button[aria-label^="React with"]', { timeout: 10000 });
  const picker = await pb.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="React with"]')].map((b) => {
      const img = b.querySelector('img');
      return {
        label: b.getAttribute('aria-label'),
        src: img ? img.getAttribute('src') : null,
        natural: img ? img.naturalWidth : 0,
      };
    })
  );
  out(picker.length === 6, 'picker shows the six reactions', `count=${picker.length}`);
  const allApple = picker.every((p) => p.src && p.src.startsWith('/emoji-apple/') && p.src.endsWith('.png'));
  out(allApple, 'every picker reaction renders an /emoji-apple/*.png <img>',
    allApple ? '' : JSON.stringify(picker.filter((p) => !(p.src && p.src.startsWith('/emoji-apple/'))).slice(0, 2)));
  const decoded = picker.filter((p) => p.natural > 0).length;
  out(decoded === picker.length, 'every picker PNG decoded (naturalWidth > 0)', `${decoded}/${picker.length}`);
  out(picker.every((p) => p.natural === 160), 'artwork is the restored 160×160 source',
    [...new Set(picker.map((p) => p.natural))].join(','));

  // ── 3. the chip wears the same artwork ──────────────────────────────────
  await pb.locator('button[aria-label="React with ❤️"]').last().click();
  await pa.waitForSelector('[data-testid^="reaction-chip-"]', { timeout: 10000 });
  const chip = await pa.evaluate(() => {
    const c = document.querySelector('[data-testid^="reaction-chip-"]');
    const img = c ? c.querySelector('img') : null;
    return {
      testid: c ? c.getAttribute('data-testid') : null,
      src: img ? img.getAttribute('src') : null,
      natural: img ? img.naturalWidth : 0,
      label: c ? c.getAttribute('aria-label') : null,
    };
  });
  out(chip.src === '/emoji-apple/red-heart_2764-fe0f.png' && chip.natural > 0,
    'reaction chip contains the decoded heart <img>', `${chip.src} (${chip.natural}px)`);
  out((chip.label || '').includes('❤️'), 'chip accessible name still carries the character', chip.label);

  // A second reaction (🔥) → burst artwork shares <Emoji>, more on screen.
  await pb.locator('button[aria-label="React with 🔥"]').last().click();
  await pa.waitForTimeout(400);
  const imgs = await pa.evaluate(() =>
    [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('src') || '').startsWith('/emoji-apple/')).length
  );
  out(imgs >= 2, 'on-screen Apple emoji images after two reactions', `imgs=${imgs}`);

  // ── proof screenshots (picker on B, chip on A) ──────────────────────────
  let shots = 0;
  const shoot = async (page, file, opts) => {
    try {
      await page.screenshot({ path: path.join(PROOF_DIR, file), animations: 'disabled', ...opts });
      shots++;
      return true;
    } catch (e) {
      out(false, `screenshot ${file}`, e.message);
      return false;
    }
  };
  const pickerOpen = async (page) => (await page.locator('button[aria-label^="React with"]').count()) > 0;
  for (const theme of ['light', 'dark']) {
    await setTheme(pb, theme);
    for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await pb.setViewportSize(vp);
      await sleep(250);
      if (!(await pickerOpen(pb))) {
        await pb.locator('button[aria-label="React"]').first().click();
        await pb.waitForSelector('button[aria-label^="React with"]', { timeout: 10000 });
      }
      await shoot(pb, `emoji-picker-${vp.width}x${vp.height}-${theme}.png`);
    }
  }
  await setTheme(pb, 'light');
  await pb.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['light', 'dark']) {
    await setTheme(pa, theme);
    await sleep(250);
    try {
      await pa.locator('[data-testid^="reaction-chip-"]').first()
        .screenshot({ path: path.join(PROOF_DIR, `emoji-chip-${theme}.png`), animations: 'disabled' });
      shots++;
    } catch (e) {
      out(false, `screenshot emoji-chip-${theme}.png`, e.message);
    }
  }
  await setTheme(pa, 'light');
  out(shots === 6, 'proof screenshots written to audit/p1a/', `${shots}/6`);

  // ── 4. §7 failure path: artwork 404s → native character, not a blank ────
  const aborts = [];
  await ctxA.route('**/emoji-apple/**', (route) => {
    aborts.push(route.request().url());
    return route.abort();
  });
  await pa.reload({ waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid^="reaction-chip-"]', { timeout: 20000 });
  await pa.waitForTimeout(600);
  const fb = await pa.evaluate(() => {
    const c = document.querySelector('[data-testid^="reaction-chip-"]');
    return { text: c ? c.textContent : '', imgs: c ? c.querySelectorAll('img').length : 0 };
  });
  out(aborts.length > 0, 'image requests really were blocked', `blocked=${aborts.length}`);
  out(fb.text.includes('❤️'), 'failed artwork falls back to the native character (§7)',
    `text=${JSON.stringify(fb.text)} imgs=${fb.imgs}`);
  await ctxA.unroute('**/emoji-apple/**');

  // Console cleanliness across both devices: the deliberate aborts and the
  // native build's production-config warning are the only allowed errors.
  const realErrors = errors.filter((e) =>
    !/emoji-apple|ERR_FAILED/i.test(e) &&
    !/Neither VITE_SIGNALING_URL nor VITE_SOCKET_URL is set/i.test(e));
  out(realErrors.length === 0, 'no console errors during the apple render run',
    realErrors.slice(0, 3).join(' | '));

  await ctxA.close();
  await ctxB.close();

  // ── 5. native build: no emoji-apple <img> anywhere, chip = native char ──
  // 5a. build once into .tmp-native (VITE_EMOJI_SET=native). The signaling
  //     env vars are blanked on purpose: .env.production pins every build to
  //     the remote Cloudflare worker, which rejects localhost origins — an
  //     empty value falls through resolveEndpoints() to same-origin, i.e.
  //     the temp server started below (process env beats .env files in Vite).
  const build = spawnSync('npx vite build --outDir .tmp-native', {
    shell: true,
    env: { ...process.env, VITE_EMOJI_SET: 'native', VITE_SIGNALING_URL: '', VITE_SOCKET_URL: '' },
    encoding: 'utf8',
  });
  out(build.status === 0, 'native build (VITE_EMOJI_SET=native → .tmp-native)',
    build.status === 0 ? '' : `status=${build.status}\n${(build.stderr || '').split('\n').slice(-8).join('\n')}`);

  if (build.status === 0) {
    // 5b. serve it with the REAL production server from a temp root, so the
    //     page origin IS the signaling origin (same-origin socket.io).
    const serverBundle = path.join(ROOT, 'dist', 'server.cjs');
    out(await fs.access(serverBundle).then(() => true).catch(() => false),
      'dist/server.cjs present to serve the native build', 'run `npm run build` first if missing');
    await rmDeep(TMP_ROOT);
    await fs.mkdir(TMP_ROOT, { recursive: true });
    // Move the build into the temp root. Windows hands out transient EPERM
    // on directory renames (indexer/AV holding a handle right after the
    // build), so retry, then fall back to a copy — never crash the gate.
    const dest = path.join(TMP_ROOT, 'dist');
    let moved = false;
    for (let i = 0; i < 4 && !moved; i++) {
      try {
        await fs.rename(TMP_BUILD, dest);
        moved = true;
      } catch (e) {
        if (i === 3) break;
        await sleep(400 * (i + 1));
      }
    }
    if (!moved) {
      await fs.cp(TMP_BUILD, dest, { recursive: true });
      await fs.rm(TMP_BUILD, { recursive: true, force: true });
      moved = true;
    }
    out(moved, 'native build moved into the temp server root', dest);
    const port = await freePort();
    nativeServer = spawn(process.execPath, [serverBundle], {
      cwd: TMP_ROOT,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
      stdio: 'pipe',
    });
    const up = await waitHealth(`http://localhost:${port}/health`);
    out(up, `native build served by production server (:${port})`, up ? '' : 'health never answered');

    if (up) {
      const NBASE = `http://localhost:${port}`;
      const ctxN1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const ctxN2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const na = await ctxN1.newPage();
      const nb = await ctxN2.newPage();
      const nErrors = [];
      na.on('console', (m) => { if (m.type() === 'error') nErrors.push(`A: ${m.text()}`); });
      na.on('pageerror', (e) => nErrors.push(`A: pageerror: ${e.message}`));
      nb.on('console', (m) => { if (m.type() === 'error') nErrors.push(`B: ${m.text()}`); });
      nb.on('pageerror', (e) => nErrors.push(`B: pageerror: ${e.message}`));
      try {
        await pairDevices(na, nb, NBASE);
        await na.getByTestId('composer').fill('native emoji gate');
        await na.keyboard.press('Enter');
        await nb.waitForSelector('text=native emoji gate', { timeout: 15000 });
        await na.waitForTimeout(800);

        await nb.locator('button[aria-label="React"]').first().click();
        await nb.waitForSelector('button[aria-label^="React with"]', { timeout: 10000 });

        const nativeState = await nb.evaluate(() => ({
          appleImgs: [...document.querySelectorAll('img')]
            .filter((i) => (i.getAttribute('src') || '').includes('emoji-apple')).length,
          pickerBtns: [...document.querySelectorAll('button[aria-label^="React with"]')].length,
          pickerImgs: [...document.querySelectorAll('button[aria-label^="React with"] img')].length,
          pickerText: [...document.querySelectorAll('button[aria-label^="React with"]')]
            .map((b) => b.textContent).join(' '),
        }));
        out(nativeState.appleImgs === 0,
          'native build: no <img src*="emoji-apple"> exists (picker open)',
          `appleImgs=${nativeState.appleImgs}`);
        out(nativeState.pickerBtns === 6 && nativeState.pickerImgs === 0,
          'native build: six picker controls, zero <img> — native glyphs in text',
          `btns=${nativeState.pickerBtns} imgs=${nativeState.pickerImgs} text=${JSON.stringify(nativeState.pickerText.slice(0, 40))}`);

        await nb.locator('button[aria-label="React with ❤️"]').last().click();
        await na.waitForSelector('[data-testid^="reaction-chip-"]', { timeout: 10000 });
        const nChip = await na.evaluate(() => {
          const c = document.querySelector('[data-testid^="reaction-chip-"]');
          return {
            imgs: c ? c.querySelectorAll('img').length : 0,
            label: c ? c.getAttribute('aria-label') : '',
            text: c ? c.textContent : '',
            appleImgs: [...document.querySelectorAll('img')]
              .filter((i) => (i.getAttribute('src') || '').includes('emoji-apple')).length,
          };
        });
        out(nChip.imgs === 0 && nChip.appleImgs === 0,
          'native build: chip renders no <img> at all', `imgs=${nChip.imgs} apple=${nChip.appleImgs}`);
        out(`${nChip.label} ${nChip.text}`.includes('❤️'),
          'native build: chip shows the native character',
          `label=${nChip.label} text=${JSON.stringify(nChip.text)}`);

        // Native console: allowed the loud production-config warning only.
        const nReal = nErrors.filter((e) =>
          !/Neither VITE_SIGNALING_URL nor VITE_SOCKET_URL is set/i.test(e));
        out(nReal.length === 0, 'native build: no unexpected console errors',
          nReal.slice(0, 3).join(' | '));
      } catch (e) {
        out(false, 'native build room flow', e.message);
      } finally {
        await ctxN1.close();
        await ctxN2.close();
      }
    }
  }
} finally {
  if (nativeServer) nativeServer.kill();
  // The prompt's temp folders never survive a run (pass or fail); give the
  // killed server a beat to release its cwd handle before deleting them.
  if (nativeServer) await sleep(500);
  await rmDeep(TMP_BUILD);
  await rmDeep(TMP_ROOT);
  await browser.close();
}

console.log(`\n[verify-emoji] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
