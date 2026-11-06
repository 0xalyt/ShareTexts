// smoke-local.mjs — the pre-push safety net (DESIGN.md §0.10 b2).
//
// Proof that the production bundle still works, before it reaches main:
//   npm run smoke:local              # build + start dist + smoke + stop
//   npm run smoke:local -- --skip-build
//   npm run smoke:local -- --keep    # leave the server up, print its port
//
// Nothing here talks to the live host and nothing shells out with bash
// syntax: the build and the server are direct child processes, the port is
// picked by the OS, and the server is stopped in a finally block, so a
// failing check cannot leak a process.
//
// Checks, in order (any FAIL → exit 1):
//   1. the production build succeeds (unless --skip-build).
//   2. / answers 200 from the real dist server.
//   3. <meta name="sharetexts-build"> matches the current commit.
//   4. the share card is complete, and its og:image resolves *on this
//      server* — the local origin is substituted for the production one, so
//      a new card is testable before it is deployed.
//   5. two devices pair by code, a text arrives, the sender sees its echo.
//   6. a link arrives and renders as a link.
//   7. long-press a bubble and add a reaction (REACTIONS below flips this
//      from WARN to required once STEP 4 has shipped the strip).
//   8. neither page logged a console error.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, openSync } from 'node:fs';
import { chromium } from 'playwright';
import { pairDevices, sendMessage, waitForText, watchConsole } from './lib/flow.mjs';
import { launchBrowser, imageInfo } from './lib.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const SKIP_BUILD = has('--skip-build');
const KEEP = has('--keep');
// STEP 4 turns this on: the reaction strip becomes a required check.
const REACTIONS = false;

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOG_DIR = `${ROOT.replace(/\/$/, '')}/audit/tmp`;
mkdirSync(LOG_DIR, { recursive: true });
const LOG = `${LOG_DIR}/smoke-local-server.log`;

let failures = 0;
const timings = [];
let t0 = Date.now();
const lap = (label) => {
  timings.push({ label, ms: Date.now() - t0 });
  t0 = Date.now();
};
function out(ok, label, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
function warn(label, detail = '') {
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** A port the OS says is free right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
      last = `status ${res.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server never answered (${last})`);
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

// ── 1. build ────────────────────────────────────────────────────────────────
if (!SKIP_BUILD) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  out(build.status === 0, 'production build', `exit ${build.status}`);
  lap('build');
  if (build.status !== 0) {
    console.log('\n[smoke-local] RED — the build failed, nothing else to check');
    process.exit(1);
  }
} else {
  warn('build skipped (--skip-build)');
}

// ── 2. start the real dist server ───────────────────────────────────────────
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const logFd = openSync(LOG, 'w');
const server = spawn(process.execPath, ['dist/server.cjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
});

let browser;
try {
  await waitForServer(BASE);
  out(true, 'dist server answers 200', BASE);
  lap('server up');

  browser = await launchBrowser();
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const sink = [];
  watchConsole(A, sink, 'A');
  watchConsole(B, sink, 'B');

  await A.goto(BASE, { waitUntil: 'domcontentloaded' });

  // ── 3. build marker ──────────────────────────────────────────────────────
  const marker = await A.evaluate(() =>
    document.querySelector('meta[name="sharetexts-build"]')?.getAttribute('content') ?? null);
  const head = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const headSha = (head.stdout || '').trim();
  const markerOk = marker !== null && (marker.startsWith(headSha) || headSha.startsWith(marker.slice(0, 12)));
  out(markerOk, 'build marker matches HEAD', `${marker ?? 'absent'} vs ${headSha}`);

  // ── 4. share card, resolved on THIS origin ───────────────────────────────
  {
    const html = await (await fetch(BASE, { signal: AbortSignal.timeout(15000) })).text();
    const meta = (attr, name) =>
      html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1] ?? '';
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    out(/^ShareTexts — send files and text between any devices, in your browser$/.test(title),
      'share title leads with the product', title);
    out(/^ShareTexts — send files and text between any devices, in your browser$/.test(meta('property', 'og:title')),
      'og:title leads with the product', meta('property', 'og:title'));
    const ogImage = meta('property', 'og:image');
    out(ogImage.startsWith('https://'), 'og:image is absolute', ogImage || 'absent');
    // Versioned by FILENAME, not by query string: WhatsApp's image scraper has
    // been known to drop an og:image that carries `?v=`, which shows the old
    // card while the URL itself still answers 200.
    out(/\/og\/sharetext-og-icon-v\d+\.jpg$/.test(ogImage),
      'og:image is the versioned card, no query string', ogImage || 'absent');
    out(meta('name', 'twitter:card') === 'summary_large_image', 'twitter card is summary_large_image');
    out(meta('property', 'og:image:width') === '1200' && meta('property', 'og:image:height') === '630',
      'og:image declares 1200x630');
    // The card is declared against production, but a local run must not
    // depend on what is deployed — ask this server for the same path.
    const localUrl = ogImage.replace(/^https:\/\/[^/]+/, BASE);
    try {
      const img = await fetch(localUrl, { signal: AbortSignal.timeout(15000) });
      const bytes = Buffer.from(await img.arrayBuffer());
      // PNG or JPEG, but it has to be a real image of the declared size, and
      // light enough for a phone's preview fetcher (scripts/optimize-og.mjs
      // exists because the card once weighed 307 KB, the WhatsApp cliff).
      const info = imageInfo(bytes);
      const kb = Math.round(bytes.length / 1024);
      out(img.ok && info.w === 1200 && info.h === 630 && kb <= 150,
        'og:image serves a real 1200x630 image under 150KB',
        `${img.status} ${img.headers.get('content-type')} ${info.format} ${info.w}x${info.h} ${kb}KB`);
    } catch (e) {
      out(false, 'og:image serves a real 1200x630 image under 150KB', e.message);
    }
    lap('share card');
  }

  // ── 5. pair, text, echo ──────────────────────────────────────────────────
  let paired = false;
  try {
    const { code, msToConnected } = await pairDevices(A, B, BASE);
    paired = true;
    out(true, `two devices paired (code …${code.slice(-3)})`, `${msToConnected} ms to connected`);
  } catch (e) {
    out(false, 'two devices paired', e.message);
  }
  lap('pair');

  if (paired) {
    const TEXT = `local smoke ${Date.now()}`;
    try {
      await sendMessage(A, TEXT);
      const ms = await waitForText(B, TEXT, 15000);
      out(ms !== null, 'text A → B arrived', ms === null ? 'timed out' : `${ms} ms`);
      const echoed = await waitForText(A, TEXT, 5000);
      out(echoed !== null, 'sender sees its own text', echoed === null ? 'missing' : 'ok');
    } catch (e) {
      out(false, 'text A → B arrived', e.message);
    }
    lap('text');

    // ── 6. a link ──────────────────────────────────────────────────────────
    // A link bubble shows a title and a domain, not the raw URL, so the
    // arrival check is an anchor whose href carries the unique path.
    const STAMP = `burn-in-${Date.now()}`;
    const URL_TEXT = `https://example.com/${STAMP}`;
    try {
      await sendMessage(A, URL_TEXT);
      let found = null;
      const tLink = Date.now();
      while (Date.now() - tLink < 15000 && found === null) {
        const hit = await B.evaluate((stamp) => {
          const a = [...document.querySelectorAll('a[href]')].find((n) => (n.getAttribute('href') || '').includes(stamp));
          if (!a) return null;
          return { target: a.getAttribute('target') ?? '', rel: a.getAttribute('rel') ?? '' };
        }, STAMP).catch(() => null);
        if (hit) found = hit;
        else await B.waitForTimeout(250);
      }
      out(found !== null, 'link A → B arrived as an anchor',
        found === null ? 'timed out' : `${Date.now() - tLink} ms target=${found.target || 'self'}`);
    } catch (e) {
      out(false, 'link A → B arrived as an anchor', e.message);
    }
    lap('link');

    // ── 7. reaction (STEP 4) ───────────────────────────────────────────────
    if (REACTIONS) {
      try {
        const bubble = B.locator('[data-testid="bubble"]').last();
        await bubble.waitFor({ timeout: 5000 });
        const box = await bubble.boundingBox();
        await B.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await B.mouse.down();
        await B.waitForTimeout(600);
        await B.mouse.up();
        const strip = B.locator('[data-testid="reaction-strip"]');
        await strip.waitFor({ timeout: 3000 });
        await strip.locator('button').nth(1).click();
        const badge = B.locator('[data-testid="reaction-badge"]').first();
        await badge.waitFor({ timeout: 3000 });
        out(true, 'long-press → reaction badge');
      } catch (e) {
        out(false, 'long-press → reaction badge', e.message.slice(0, 120));
      }
      lap('reaction');
    } else {
      warn('reaction step not enabled yet (STEP 4)');
    }
  } else {
    out(false, 'text A → B arrived', 'skipped — pairing failed');
  }

  // ── 8. console cleanliness ───────────────────────────────────────────────
  const errors = sink.filter((l) => l.includes(' error: ') || l.includes('pageerror'));
  const warnings = sink.filter((l) => !errors.includes(l));
  if (warnings.length) console.log(`note: ${warnings.length} console warning(s):\n${warnings.join('\n')}`);
  out(errors.length === 0, 'no console errors', errors.length ? errors.slice(0, 3).join(' | ') : '');
  lap('console');

  await ctxA.close();
  await ctxB.close();
} catch (e) {
  out(false, 'smoke ran to completion', e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (KEEP) {
    console.log(`\nnote: --keep — server still on ${BASE} (pid ${server.pid})`);
  } else {
    stopServer(server);
  }
}

console.log('\n[smoke-local] timings');
for (const t of timings) console.log(`  ${String(t.ms).padStart(6)} ms  ${t.label}`);
console.log(`\n[smoke-local] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} — server log: ${LOG}`);
process.exit(failures === 0 ? 0 : 1);
