// capture-baseline.mjs — the P0 screenshot matrix.
//
// Args:
//   --base  <url>   default http://localhost:3012 (auto-starts `npm run dev`
//                   with PORT set if a localhost base is unreachable)
//   --out   <dir>   default audit/baseline
//   --only  <screen> capture a single screen name (skips auto-start ordering)
//   --static        DETERMINISTIC mode — the only mode a pixel diff may use.
//                   Freezes every input a screenshot can leak:
//                     · context: locale 'en-US', timezoneId 'UTC',
//                       deviceScaleFactor 1, reducedMotion 'reduce'
//                     · page.clock.setFixedTime(2026-10-22T10:00:00Z) —
//                       Date only, timers keep running (clock.install +
//                       pauseAt would freeze animations and break rendering).
//                       Static screens freeze at page creation; the room flow
//                       freezes AFTER pairing, because the pairing code is a
//                       TOTP the server validates against its own clock.
//                     · screenshot: animations 'disabled', caret 'hide'
//                     · seeded mulberry32 in Math.random / crypto.
//                       getRandomValues, so client-made codes and names are
//                       identical run to run (server-made codes stay random
//                       and are masked by audit/static-masks.json)
//                     · incoming presence_list is pinned empty so server-TTL
//                       device presence cannot shift the landing layout
//                   Motion sequences are skipped in --static: animation
//                   phase is their content, and they are never diffed.
// File name: <screen>-<viewport>-<theme>.png   viewport like 390x844.
// Also writes <out>/console.txt (errors+warnings per screen) and
// <out>/motion/<name>/frame-XX.png (6 s @ 12 fps sequences, once, at
// 1440x900 light — see docs/redesign/capture-noise.md).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRoom, joinRoom, watchConsole } from './lib/flow.mjs';
import { sleep, launchBrowser, waitForChat } from './lib.mjs';

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
};
let BASE = arg('--base', 'http://localhost:3012');
const OUT = resolve(arg('--out', 'audit/baseline'));
const ONLY = arg('--only', null);
// --combo <vpLabel>-<theme> re-shoots ONE viewport×theme pair into an existing
// output dir. A cold dev server can time out a combo's first navigation (30 s
// goto) without touching any other sheet; without this flag the only repair
// was another 144-shot run.
const COMBO = arg('--combo', null);
const STATIC = argv.includes('--static');
const STATIC_TIME = new Date('2026-10-22T10:00:00Z');
// Pinned space lifetime, anchored to the frozen clock. The dev space backend
// stamps createdAt/expiresAt with the SERVER's real clock, so the countdown
// chip ("in 4d 15h") and the recent-space card drifted run-to-run (real time
// advances between runs). Rewriting the HTTP responses to these fixed values
// (see the ctx.route pin in mkContext) makes every space screen byte-identical.
const STATIC_PIN_CREATED = STATIC_TIME.getTime() - 86_400_000;            // 1d before frozen now
const STATIC_PIN_EXPIRES = STATIC_TIME.getTime() + 4 * 86_400_000 + 15 * 3_600_000; // 4d15h after
// Per-context seed. Contexts are created in a fixed loop order, so the
// sequence is identical across runs, while two contexts (device A vs B) never
// share a seed — a colliding client-made id would make the server treat two
// devices as one.
let ctxSeed = 0xc0ffee;
let ctxOrdinal = 0;
// Space codes need a fresh namespace per capture process because the dev
// Space backend keeps code registrations in memory for the life of its server.
// Reusing one deterministic code per viewport/theme made run 2 collide with
// run 1's still-active spaces. The rendered code chip is masked to its own
// small named box; all other inputs remain fixed.
const CAPTURE_RUN_SEED = (Number(process.env.STATIC_RUN_SEED) || (Date.now() ^ (process.pid << 16))) >>> 0;

// Deterministic space code — keyed to the COMBO (viewport × theme), not to
// process history. A full capture can be repeated with STATIC_RUN_SEED; use a
// different seed for the second pass because the dev backend keeps live space
// codes in memory across runs. Each combo still reuses one code across retries.
// The server-issued header chip is the only variable box on this screen and is
// covered by a small named mask in audit/static-masks.json.
// The app's REAL alphabet (src/lib/space/spaceCode.ts): 27 chars — 8 is
// excluded with B, so a code containing 8 answers 400 Bad Request.
const SPACE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ234679';
function comboSpaceCode(vp, theme) {
  let state = (0x5eed1234 ^ CAPTURE_RUN_SEED) >>> 0;
  for (const ch of `${vp.label}|${theme}`) {
    state = (Math.imul(state, 31) + ch.charCodeAt(0)) >>> 0;
  }
  const nextRand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 8 },
    () => SPACE_ALPHABET[Math.floor(nextRand() * SPACE_ALPHABET.length)]).join('');
}

const VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },   // phone portrait
  { label: '844x390', width: 844, height: 390 },   // phone landscape
  { label: '820x1180', width: 820, height: 1180 }, // tablet
  { label: '1440x900', width: 1440, height: 900 }, // desktop
];
const THEMES = ['light', 'dark'];

const consoleSink = [];
let currentLabel = '?';
const log = (msg) => { consoleSink.push(`[${currentLabel}] ${msg}`); };

// ── dev-server auto-start (localhost bases only) ──────────────────────────
async function ensureServer(url) {
  let up = false;
  try { up = (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok; } catch { up = false; }
  if (up) return null;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    throw new Error(`base ${url} unreachable and not localhost — refusing to start a server for it`);
  }
  const port = new URL(url).port || '3012';
  console.log(`[capture] ${url} down — starting dev server on PORT=${port}…`);
  const child = spawn('npm', ['run', 'dev'], {
    shell: true, detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: port },
  });
  child.unref();
  writeFileSync(join(OUT, 'devserver.pid'), String(child.pid));
  for (let i = 0; i < 60; i++) {
    await sleep(1500);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return child; } catch { /* retry */ }
  }
  throw new Error(`dev server did not come up on ${url} in 90s (pid ${child.pid})`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'motion'), { recursive: true });
await ensureServer(BASE);

// ── helpers ───────────────────────────────────────────────────────────────
// Deterministic render flags — the ONLY mode a pixel diff may use. LCD/subpixel
// text AA and Skia's GPU rasterizer are the last source of 1-px run-to-run
// noise on gradient/rounded edges (measured: off-by-one on settings/reaction/
// message bubbles). These force grayscale AA, a fixed colour profile, hinted
// fonts off, and no scrollbar, so the same DOM rasterises byte-identically.
const STATIC_RENDER_ARGS = [
  // One rasterizer path for every run: with GPU init free to race, one
  // process can raster via GPU and the next via software, and the two
  // differ by ±1/255 on fractional-scale edges (measured: 277 px on the
  // landing's phone-glass corner, stable box run to run).
  '--disable-gpu',
  // Residual cross-process jitter lives on glyph/border edges at fractional
  // coordinates (measured: code tiles at y=565.45, ±1 on tile borders, 39–90
  // px per screen; DOM rects and k are identical run to run, so the variance
  // is in raster, not layout). Force the deterministic full-tile software path.
  '--disable-partial-raster',
  '--disable-gpu-rasterization',
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-skia-runtime-opts',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  // Chromium treats a page on localhost calling localhost as a Local Network
  // Access request and blocks it behind a permission prompt that headless
  // never grants. Intermittently that killed the signaling WebSocket
  // (console.txt: `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` on
  // ws://localhost:3012/socket.io/), which aborted whole combos with
  // "space create did not navigate after retries" and made the connecting
  // panel unreachable. Disabling the check is an environment pin, like
  // --disable-gpu: it changes no product code.
  '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
];
const browser = await launchBrowser(STATIC ? STATIC_RENDER_ARGS : []);

/** Fresh context with theme+locale pre-set and the colour scheme emulated. */
async function mkContext(vp, theme) {
  const contextOrdinal = ++ctxOrdinal;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: theme,
    locale: STATIC ? 'en-US' : 'en',
    ...(STATIC ? { timezoneId: 'UTC', deviceScaleFactor: 1, reducedMotion: 'reduce' } : {}),
  });
  if (STATIC) await ctx.setOffline(false);
  await ctx.addInitScript(([th]) => {
    try { localStorage.setItem('sharetext.theme', th); } catch { /* private mode */ }
    try { localStorage.setItem('sharetext.locale', 'en'); } catch { /* private mode */ }
  }, [theme]);
  if (STATIC) {
    // Pin the nearby list to empty — the landing's "Available · N devices"
    // rows are OTHER clients' server-TTL presence (nearby.ts, 90 s TTL), so
    // the row count differs run to run and cascades into layout height: the
    // hero's laptop mock is centred against the left column, so one extra row
    // shifts the whole right column ~18 px (measured: 195996 px / 15 % on
    // landing-1440x900-dark, unmaskable because a shift moves unmasked
    // content). socket.io-parser hands the event payload to JSON.parse as
    // `["presence_list", …]` verbatim (node_modules/socket.io-parser
    // build/cjs/index.js tryParse), so rewriting exactly that prefix to an
    // empty devices array leaves every other packet untouched and the UI
    // renders its honest empty state (parsePresenceList → []). Room pairing
    // and messages never travel through presence_list.
    // Pin socket-delivered truth the same way: socket.io-parser hands each
    // event payload to JSON.parse verbatim (`["space_sync", …]`), so
    // rewriting expiresAt/createdAt there stops the 1 Hz sync from
    // overwriting the HTTP-pinned lifetime with the SERVER's real clock
    // (measured: "Closes in 6d 4h · 02:50 PM" vs "6d 5h · 03:14 PM" — the
    // countdown chip is fed from snapshot.expiresAt, which space_sync
    // rewrites on every tick; useSpaceClient.ts:85).
    await ctx.addInitScript(([created, expires]) => {
      try {
        const orig = JSON.parse;
        JSON.parse = (text, reviver) => {
          if (typeof text === 'string') {
            if (text.startsWith('["presence_list"')) {
              return ['presence_list', { devices: [] }];
            }
            if (text.startsWith('["space_event"')) {
              const parsed = orig(text, reviver);
              try {
                const event = Array.isArray(parsed) ? parsed[1] : null;
                const payload = event?.event === 'space_sync' ? event.payload : null;
                if (payload && typeof payload === 'object') {
                  if (typeof payload.expiresAt === 'number') payload.expiresAt = expires;
                  if (typeof payload.createdAt === 'number') payload.createdAt = created;
                }
              } catch { /* keep the parsed payload as-is */ }
              return parsed;
            }
            if (text.startsWith('["space_sync"')) {
              const parsed = orig(text, reviver);
              try {
                const payload = Array.isArray(parsed) ? parsed[1] : null;
                if (payload && typeof payload === 'object') {
                  if (typeof payload.expiresAt === 'number') payload.expiresAt = expires;
                  if (typeof payload.createdAt === 'number') payload.createdAt = created;
                }
              } catch { /* keep the parsed payload as-is */ }
              return parsed;
            }
          }
          return orig(text, reviver);
        };
      } catch { /* frozen realm */ }
    }, [STATIC_PIN_CREATED, STATIC_PIN_EXPIRES]);
    // Pin the link classification. The header's route line is chosen ONCE, on
    // the peer's first 'connected' event, from `getStats()`:
    // webrtc.ts determineConnectionType() looks for a succeeded candidate
    // pair and, when the snapshot is taken mid-negotiation, keeps the generic
    // "Connected" label for the life of the room (it only re-runs on a state
    // change). Under a loaded machine that race fires often enough to move the
    // header between runs (measured: 479 px @390x844, 2990 px @820x1180 on
    // every room screen of two combos). Waiting for a succeeded pair before
    // handing the snapshot back makes the classification land every time, so
    // both passes paint "Same network".
    await ctx.addInitScript(() => {
      try {
        const PC = window.RTCPeerConnection;
        if (!PC || !PC.prototype || !PC.prototype.getStats) return;
        const orig = PC.prototype.getStats;
        PC.prototype.getStats = async function (...args) {
          for (let i = 0; i < 40; i++) {
            const stats = await orig.apply(this, args);
            let ok = false;
            try {
              stats.forEach((r) => {
                if (r && r.type === 'candidate-pair' && r.state === 'succeeded') ok = true;
              });
            } catch { /* snapshot mid-flight — try again */ }
            if (ok) return stats;
            await new Promise((r) => setTimeout(r, 50));
          }
          return orig.apply(this, args);
        };
      } catch { /* no WebRTC in this build — nothing to pin */ }
    });
    // Kill backdrop-filter in --static mode. Glass cards (backdrop-blur-2xl)
    // are Chromium's one non-bit-stable compositing op across processes: the
    // blur samples the layer behind on raster threads whose scheduling varies
    // run to run, so pixels inside glass wobble by ±1/255 (measured: 277 px
    // of d=1 on the landing's demo chips, 1–3 px on message-bubble edges —
    // ~30 screens failed raw on this alone). Cards use white/95 + blur, so
    // dropping the blur loses almost nothing visually while every pixel
    // becomes reproducible. Same spirit as the render args in lib.mjs.
    await ctx.addInitScript(() => {
      const apply = () => {
        try {
          const root = document.documentElement;
          if (!root) return false;
          let st = document.getElementById('st-static-plain-glass');
          if (!st) {
            st = document.createElement('style');
            st.id = 'st-static-plain-glass';
            root.appendChild(st);
          }
          st.textContent =
            '*,*::before,*::after{backdrop-filter:none!important;' +
            '-webkit-backdrop-filter:none!important;}';
          return true;
        } catch { return false; }
      };
      if (!apply()) {
        let mo;
        mo = new MutationObserver(() => { if (apply()) mo.disconnect(); });
        mo.observe(document, { childList: true, subtree: true });
      }
      // Belt and braces: re-assert once parsing completes (idempotent — the
      // style node already exists, only its text is refreshed).
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    });
    // Seeded PRNG — runs before any page script. Self-contained: Playwright
    // serialises the function, so it may not close over module scope.
    await ctx.addInitScript((seed) => {
      let s = seed >>> 0;
      const next = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try { Math.random = next; } catch { /* frozen realm */ }
      try {
        const g = globalThis.crypto;
        if (g && g.getRandomValues) {
          g.getRandomValues = (arr) => {
            const bits = (arr.BYTES_PER_ELEMENT || 1) * 8;
            const max = bits >= 32 ? 4294967296 : 2 ** bits;
            for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(next() * max);
            return arr;
          };
        }
      } catch { /* crypto sealed — Math.random seed still applies */ }
    }, ctxSeed++);
    // ── deterministic HTTP pins ────────────────────────────────────────
    // Two endpoints feed numbers the screenshots render but whose server
    // truth is non-deterministic across runs. Pinning them at the context
    // level (applies to every page) is the same technique as the presence_list
    // JSON.parse pin above — it freezes the INPUT, never the app's rendering.
    //  · /stats  → the landing tracker's "N rooms made" (server lifetime
    //    total that accumulates run-to-run; shifted the counter digits on
    //    landing / language-menu / offline-banner / space-create / space-join).
    //  · /space  → the space snapshot's createdAt/expiresAt (server real
    //    clock; drifted the countdown chip and the recent-space card).
    // The create screen's availability debounce is a gate, not the thing
    // under test in this visual proof. Fulfill it locally so each combo does
    // not consume the dev backend's shared 30-attempt/minute IP throttle.
    // The subsequent create POST still validates the format and rejects code
    // collisions; each process uses a fresh run seed for its code namespace.
    await ctx.route('**/stats*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service: 'sharetext-signaling',
        generated_at: STATIC_TIME.toISOString(),
        uptime_s: 0,
        note: 'pinned for --static determinism',
        totals: { 'rooms.created': 1422 },
        users: 2,
        roomsCreated: 1422,
      }),
    }));
    // ── the connecting-panel gate ─────────────────────────────────────
    // The connecting screen is a TRANSIENT: it ends the moment the peer's
    // channel opens. The app signals over a WebSocket (socket.ts tries
    // 'websocket' first), and one WS trip carries the join ack, the offer and
    // the channel-open in a few milliseconds — faster than any post-hoc shot
    // gate. Both full runs caught the panel already gone (measured: 99.96 %
    // on connecting-844x390-dark, 29 % on 390x844-light; the console.txt
    // trail read `panel=false composer=true`).
    // So the gate sits IN the socket, on the server→client direction, and it
    // is an INPUT pin, not a mask: the frame carrying the join ack ("roomId")
    // is delivered — the panel mounts in its honest 'connecting' phase — and
    // every frame after it is queued until release(), which is what stops the
    // offer from opening the channel mid-shot. Client→server frames always
    // pass. A 15 s auto-release keeps a missed shot from hanging the run.
    const gate = {
      delay: 0,
      timer: null,
      arm_(ms = 4000) {
        gate.delay = ms;
        if (gate.timer) clearTimeout(gate.timer);
        gate.timer = setTimeout(gate.release, ms + 11000); // safety: never pin a socket
      },
      release() {
        gate.delay = 0;
        if (gate.timer) { clearTimeout(gate.timer); gate.timer = null; }
      },
    };
    ctx.__socketGate = gate;
    if (STATIC) {
      await ctx.routeWebSocket('**/socket.io/**', (ws) => {
        const server = ws.connectToServer();
        // Pacing, not blocking: every frame in both directions is delivered
        // `delay` ms late (equal timeouts keep the order). Nothing is dropped
        // and no state is invented — the same signaling, just slow enough for
        // the connecting panel to be on screen when the shutter opens.
        ws.onMessage((m) => {
          if (gate.delay > 0) { setTimeout(() => server.send(m), gate.delay); return; }
          server.send(m);
        });
        server.onMessage((m) => {
          if (gate.delay > 0) { setTimeout(() => ws.send(m), gate.delay); return; }
          ws.send(m);
        });
      });
    }
    // Polling fallback (a socket that could not upgrade) is paced the same way.
    await ctx.route('**/socket.io/**', async (route) => {
      if (gate.delay > 0) await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await ctx.route('**/space/**', async (route) => {
      // Playwright routes are LIFO: the broad space response pin below would
      // otherwise take this request before the dedicated fixture handler.
      // Serve the create-sheet availability gate locally so complete matrix
      // runs do not consume the dev server's shared per-IP code throttle.
      if (new URL(route.request().url()).pathname === '/space-code/check') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available: true }),
        });
      }
      try {
        const res = await route.fetch();
        const ct = res.headers()['content-type'] || '';
        if (!ct.includes('json')) return route.fulfill({ response: res });
        let body = await res.text();
        try {
          const obj = JSON.parse(body);
          if (obj && typeof obj === 'object' && typeof obj.expiresAt === 'number') {
            if (typeof obj.createdAt === 'number') obj.createdAt = STATIC_PIN_CREATED;
            obj.expiresAt = STATIC_PIN_EXPIRES;
            body = JSON.stringify(obj);
          }
        } catch { /* not our JSON shape — pass through */ }
        return route.fulfill({ response: res, body });
      } catch {
        return route.continue();
      }
    });
  }
  return ctx;
}

/** --static: freeze Date (timers keep running).
 *
 *  WHEN to freeze matters: the 6-digit pairing code is an RFC-6238 TOTP the
 *  SERVER validates against its own clock (server.ts:1124, worker/src/room.ts:
 *  830). A page whose Date sits three days in the past computes a code the
 *  server rejects, so BOTH devices stall on the pairing screen and no room
 *  shot is ever taken (measured: 8/8 room flows failed with a page-start
 *  freeze). So the room flow freezes only AFTER the two devices are connected
 *  — everything a visitor sees from `empty-room` onward is still frozen, and
 *  the code tiles + countdown ring on the pairing screens stay on the real
 *  clock (they are random/second-ticking anyway and carry a mask).
 *
 *  Static screens never pair, so they freeze at page creation. */
async function freeze(page) {
  if (STATIC) await page.clock.setFixedTime(STATIC_TIME);
  return page;
}

const shots = [];
let onlyDone = false; // set once --only's target shot is written, so the
                      // caller can bail instead of walking postrequisite steps
async function shot(page, screen, vp, theme) {
  if (ONLY && ONLY !== screen) return;
  const file = `${screen}-${vp.label}-${theme}.png`;
  if (STATIC) {
    // Hover residue: the element under the last click can still be :hover at
    // shot time (measured: the reaction chip's remove × rendered in one run
    // only — 109 px on reaction-added-1440x900-light). Park the pointer OUTSIDE
    // the viewport so nothing matches :hover in either run.
    await page.mouse.move(-60, -60).catch(() => {});
    await page.waitForTimeout(150).catch(() => {});
  }
  await page.screenshot({
    path: join(OUT, file),
    ...(STATIC ? { animations: 'disabled', caret: 'hide' } : {}),
  });
  shots.push(file);
  onlyDone = ONLY !== null; // meaningful only in --only mode: without this
                            // guard a full run bails after its first room shot
  console.log(`  shot ${file}`);
}

/** networkidle + 800 ms per the brief, with a hard cap so a live socket
 *  (dev HMR /stats poll) can't stall the run forever. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await sleep(800);
}
async function gotoShot(page, path, screen, vp, theme) {
  if (ONLY && ONLY !== screen) return; // --only skips the whole step, not just the shot
  currentLabel = `${screen}@${vp.label}/${theme}`;
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await settle(page);
  if (STATIC && screen === 'landing') {
    // Offline state is context-emulated and may briefly start false on a
    // freshly launched browser (measured: the otherwise-identical 390/1440
    // landing pair differed only by the 15 KB offline pill in one run).
    // Explicitly hold the context online and wait for React to remove the
    // banner before capturing a landing screen. This is an input-state gate,
    // not a mask: a real offline regression remains visible in normal mode.
    await page.context().setOffline(false);
    // navigator.onLine can lag the context emulation for a frame or two; a
    // timeout here used to abort the WHOLE combo (run D lost the 1440x900
    // dark sheet to it). The banner check below is the real condition.
    await page.waitForFunction(() => navigator.onLine, null, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="offline-banner"]'),
      null, { timeout: 5000 });
    // The nearby search grace (SEARCH_GRACE_MS = 12 s, NearbyDevices.tsx)
    // flips the hint line "Waiting for another device…" → "Both devices need
    // ShareTexts open" on a real timer measured from mount. settle() lands
    // anywhere from ~1 s to ~9 s after load, so one run shot before the flip
    // and the other after it (measured: 1439 px of text difference on
    // landing-1440x900-dark). Wait until BOTH runs are past the flip: the
    // expired variant is permanent (presence_list is pinned empty, so no
    // device ever resets it), so gating on it is a stable end state — and it
    // is later than every entrance spring, so nothing is mid-fade either.
    const expired = page.locator('[data-testid="nearby-searching"]')
      .getByText('Both devices need ShareTexts open');
    await expired.waitFor({ timeout: 30000 });
    await sleep(400);
  }
  await shot(page, screen, vp, theme);
}

/** In-app state: wait for trigger, settle frames, shoot. */
async function stateShot(page, fn, screen, vp, theme, settleMs = 600) {
  if (ONLY && ONLY !== screen) return;
  currentLabel = `${screen}@${vp.label}/${theme}`;
  await fn();
  await sleep(settleMs);
  await shot(page, screen, vp, theme);
}

const IMG = resolve('public/demo/photo-4x3.jpg'); // real repo image for the upload screen

const STATIC_SCREENS = ['landing', 'language-menu', 'docs', '404',
  'space-create', 'space-join', 'space-room', 'offline-banner'];
const ROOM_SCREENS = ['pairing', 'enter-code', 'connecting', 'empty-room',
  'room-with-messages', 'image-message', 'reaction-picker-open',
  'reaction-added', 'settings', 'room-ended'];
// --only gates whole GROUPS too: without this, --only landing would still
// walk the full two-device room flow for every viewport × theme (minutes of
// work whose screenshots are discarded).
const groupWant = (list) => !ONLY || list.includes(ONLY);

// ── the two screen groups ────────────────────────────────────────────────
/** Static screens — one page, no room needed. */
async function staticScreens(vp, theme) {
  if (!groupWant(STATIC_SCREENS)) return;
  onlyDone = false; // per-combo: a shot from the previous viewport×theme
                    // must not bail this one out early
  const ctx = await mkContext(vp, theme);
  const page = await freeze(await ctx.newPage());
  watchConsole(page, log, 'static');

  await gotoShot(page, '/', 'landing', vp, theme);

  // language menu (header listbox)
  await stateShot(page, async () => {
    const btn = page.locator('[aria-haspopup="listbox"]').first();
    await btn.waitFor({ timeout: 8000 });
    await btn.click();
    await page.locator('[role="listbox"]').first().waitFor({ timeout: 5000 });
  }, 'language-menu', vp, theme);

  await gotoShot(page, '/docs', 'docs', vp, theme);
  await gotoShot(page, '/definitely-not-a-page', '404', vp, theme);

  // Temporary Space: create sheet, join sheet, then a real space room
  await gotoShot(page, '/space/create', 'space-create', vp, theme);
  await gotoShot(page, '/space/join', 'space-join', vp, theme);
  await stateShot(page, async () => {
    // The combo's ONE code — computed once, reused by every retry below so
    // attempt count can never desync run1's chip from run2's (see
    // comboSpaceCode).
    const spaceCode = comboSpaceCode(vp, theme);
    // The previous shot left us on /space/join — the create sheet's input
    // only exists on /space/create, so navigate back before waiting for it.
    await page.goto(BASE + '/space/create', { waitUntil: 'domcontentloaded' });
    // Valid space code: exactly 8 chars from the app's REAL alphabet
    // (src/lib/space/spaceCode.ts — 27 chars; 8 is excluded with B, so a
    // code containing 8 answers 400 Bad Request).
    const inputSel = '[data-testid="space-code-input"]';
    await page.waitForSelector(inputSel, { timeout: 10000 });
    let entered = false;
    let windowWaits = 0;
    for (let attempt = 0; attempt < 5 && !entered; attempt++) {
      // Dev-backend throttle: /space-code/check answers 429 after 30 attempts
      // per rolling 60 s window (devSpaceBackend CODE_LIMIT/CODE_WINDOW_MS),
      // and the count carries across back-to-back capture runs — run2 of a
      // pair inherited run1's attempts and the sheet swapped its input for
      // "Too many attempts" (measured: 4 combos failed at page.fill). The
      // message is not guaranteed: run2 of the next pair got a 429 with the
      // input still visible and no text, so the click no-opped 3 times.
      // The window is server-side time: detect the text OR a bare failed
      // navigation, wait it out, reload, retry.
      const inputThere = await page.locator(inputSel).isVisible().catch(() => false);
      const throttleText = await page.locator('text=Too many attempts').count().catch(() => 0);
      if ((!inputThere || throttleText > 0 || attempt > 0) && windowWaits < 3) {
        windowWaits++;
        log(`WARN space-code throttle/failed create (attempt ${attempt}) — waiting out the 60s window`);
        await sleep(65000);
        await page.goto(BASE + '/space/create', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(inputSel, { timeout: 15000 });
      }
      await page.fill(inputSel, spaceCode);
      await sleep(1200); // availability debounce + roundtrip
      await page.click('[data-testid="space-create-cta"]');
      entered = await page.waitForURL(/\/space\/[0-9a-f-]{36}#k=/, { timeout: 15000 })
        .then(() => true).catch(() => false);
      if (!entered) await page.waitForSelector(inputSel, { timeout: 5000 }).catch(() => {});
    }
    if (!entered) throw new Error('space create did not navigate after retries');
    // The code chip is `hidden sm:inline-flex` — invisible below 640px — so
    // wait for a members/users chip that is visible at every viewport.
    await page.waitForSelector(
      '[data-testid="space-members"], [data-testid="space-devices"]',
      { timeout: 15000 });
  }, 'space-room', vp, theme);

  // offline banner (reuses this page: land, go offline, wait for the banner)
  if (!ONLY || ONLY === 'offline-banner') {
    currentLabel = `offline-banner@${vp.label}/${theme}`;
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await ctx.setOffline(true);
    const banner = page.locator('[data-testid="offline-banner"]');
    await banner.waitFor({ timeout: 8000 })
      .catch(() => log('WARN offline-banner not visible within 8s'));
    // The banner slides in with a JS spring — animations:'disabled' only
    // freezes CSS, so an immediate shot caught different spring phases
    // (measured: 187660 px / 13.5 % on offline-banner-1440x900-light).
    // Poll its box until it stops moving, then give the spring time to land.
    {
      let last = null, stable = 0, waited = 0;
      while (waited < 5000 && stable < 600) {
        const box = await banner.boundingBox().catch(() => null);
        const key = box ? `${box.x},${box.y},${box.width},${box.height}` : null;
        stable = key && key === last ? stable + 200 : 0;
        last = key;
        await sleep(200); waited += 200;
      }
    }
    await sleep(300);
    await shot(page, 'offline-banner', vp, theme);
    await ctx.setOffline(false);
  }

  await ctx.close();
}

/**
 * Wait for a connected room to reach its SETTLED state before a room shot.
 * Two transients poisoned room screenshots run-to-run:
 *  · a mid-shot reconnect swaps in the fallback name "Paired device", the
 *    "Reconnecting…" subtitle and drops the pane's headline entirely
 *    (measured: 36415 px / 2.7 % on empty-room-1440x900-dark);
 *  · the route label flips "Relay" vs "Same network" under the second
 *    device's name while the peer's identity is still resyncing (measured:
 *    ~970 px on five 1440x900-dark room screens: image-message,
 *    room-with-messages, reaction-*, settings).
 * Both settle when the peer re-seats and the header repaints. Gate on: no
 * /Reconnecting/ anywhere AND the full body text unchanged for 900 ms. The
 * connected room carries no ticking text (PairingMini/LiveCodeDisplay render
 * only in pairing and the details popover), so stability is reachable; a
 * 12 s timeout logs a WARN and shoots anyway instead of failing the combo.
 */
async function settleRoom(page) {
  let last = null, stableSince = Date.now(), waited = 0;
  while (waited < 12000) {
    const txt = await page.evaluate(() => (document.body ? document.body.innerText : ''))
      .catch(() => null);
    if (txt === null) { await sleep(300); waited += 300; continue; }
    const reconnecting = /reconnecting/i.test(txt);
    // The header's route line starts as the generic "Connected" and only
    // resolves to "Same network" / "Relay" once the link is classified
    // (ChatView connectionType 'connecting' → 'direct'|'relay'). Run C shot
    // the resolved label, run D the generic one, on every room screen of two
    // combos (measured: 479 px @390x844-dark, 2990 px @820x1180-light).
    // Requiring the resolved label pins the settled state instead.
    const routeResolved = /(Same network|Relay)/.test(txt);
    if (!reconnecting && routeResolved && txt === last) {
      if (Date.now() - stableSince >= 900) return true;
    } else {
      last = txt; stableSince = Date.now();
    }
    await sleep(300); waited += 300;
  }
  log('WARN room never settled (Reconnecting?) within 12s — shooting anyway');
  return false;
}

/** Room screens — the verified two-device flow, walked state by state. */
async function roomScreens(vp, theme) {
  if (!groupWant(ROOM_SCREENS)) return;
  onlyDone = false; // per-combo (see staticScreens)
  const ctxA = await mkContext(vp, theme);
  const ctxB = await mkContext(vp, theme);
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  watchConsole(A, log, 'A');
  watchConsole(B, log, 'B');

  // pairing (sender)
  currentLabel = `pairing@${vp.label}/${theme}`;
  const { code } = await createRoom(A, BASE);
  await sleep(600);
  await shot(A, 'pairing', vp, theme);
  if (onlyDone) return; // --only pairing: done — no join, no message walk

  // enter code (receiver, empty)
  currentLabel = `enter-code@${vp.label}/${theme}`;
  await B.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(B);
  await B.waitForSelector('[data-testid="home-receive"]', { timeout: 20000 });
  await B.click('[data-testid="home-receive"]');
  await B.locator('input[inputmode="numeric"], input[type="tel"]').first().waitFor({ timeout: 8000 });
  await sleep(400);
  await shot(B, 'enter-code', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // connecting — type the code and try to catch the panel mid-handshake
  currentLabel = `connecting@${vp.label}/${theme}`;
  // Pin the panel: hold every socket hop the joiner starts after its join
  // POST, so the channel cannot open while we shoot (see the gate in
  // mkContext). Released in the finally below — a missed panel must not
  // leave the room's signaling frozen.
  // Pace the CREATOR's socket, not the joiner's: the panel disappears only
  // when the peer's offer opens the channel, so a slow offer is what keeps
  // the joiner's own join flow untouched and the panel on screen.
  ctxA.__socketGate?.arm_();
  await B.locator('input').first().click();
  await B.keyboard.type(code, { delay: 60 });
  const caughtConnecting = await B.waitForSelector('[data-testid="connecting-panel"]', { timeout: 6000 })
    .then(() => true).catch(() => false);
  if (caughtConnecting) {
    // The receiving panel is still exiting its 0.2 s fade when the connecting
    // panel mounts; while it occupies layout the connecting panel sits ~430 px
    // lower (measured: 5/8 connecting screens differed, up to 64192 px). Wait
    // for the code input to leave the DOM — layout is then settled — before the
    // shot, so both runs shoot the same settled frame.
    await B.waitForSelector('input[inputmode="numeric"], input[type="tel"]',
      { state: 'detached', timeout: 4000 }).catch(() => {});
    await sleep(250);
    // The shot must show the connecting BEAT, not its aftermath: if the
    // handshake had already opened, data-phase would read "connected".
    const state = await B.evaluate(() => ({
      phase: document.querySelector('[data-testid="connect-handshake"]')?.getAttribute('data-phase') ?? null,
      panel: !!document.querySelector('[data-testid="connecting-panel"]'),
      composer: !!document.querySelector('[data-testid="composer"]'),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    })).catch(() => null);
    log(`  connecting-state phase=${state?.phase} panel=${state?.panel} composer=${state?.composer} | ${state?.text}`);
    if (state?.phase !== 'connecting') {
      log(`WARN connecting panel phase=${state?.phase} at shot (gate armed=${ctxB.__socketGate?.armed})`);
    }
    await shot(B, 'connecting', vp, theme);
  }
  else log('WARN connecting-panel missed (transition faster than capture)');
  ctxA.__socketGate?.release();
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // empty room (connected, nothing sent yet)
  currentLabel = `empty-room@${vp.label}/${theme}`;
  await waitForChat(A, 'A');
  await waitForChat(B, 'B');
  await A.waitForSelector('[data-testid="composer"]', { timeout: 20000 });
  // The CREATOR shows a 1600ms auto-dismissing "connected" celebration
  // (SingleScreenApp) that covers the room panel. waitForChat passes the
  // instant the composer mounts — which is DURING that beat — so a fixed
  // sleep raced the dismissal: under full-matrix load (two headless browsers
  // janking the main thread) the beat's setTimeout fell past the sleep and
  // the shot caught the celebration instead of the room (measured: 1 of 8
  // empty-room screens landed on the wrong side, 100378px / 7.7% diff).
  // Gate on a signal that only exists once the beat is gone: the Disconnect
  // control lives in the room-controls rail, never in the celebration.
  if (!ONLY || ONLY === 'empty-room') {
    await A.locator('[data-testid="end-session"]').first().waitFor({ timeout: 8000 })
      .catch(() => log('WARN room panel (end-session) not up — celebration may still cover it'));
    // The connected toast ("Connected to Windows PC 2") auto-dismisses on a
    // 2.8 s wall-clock timer (ChatView setShowConnected(false)) — our shot at
    // connect+~2.7 s straddled that boundary under load: one run showed the
    // toast, the other did not (measured at empty-room AND room-with-
    // messages). It fires once per room, so waiting it out here clears every
    // later shot too.
    await A.locator('[role="status"]').filter({ hasText: 'Connected to' })
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => log('WARN connected toast never observed gone'));
  }
  // Settle the header/pane BEFORE the first room shot (see settleRoom).
  await settleRoom(A);
  // Paired on the real clock (TOTP) — freeze now for every screen below.
  await freeze(A);
  await freeze(B);
  await sleep(800);
  await shot(A, 'empty-room', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // room with messages
  currentLabel = `room-with-messages@${vp.label}/${theme}`;
  await A.fill('[data-testid="composer"]', 'first message for the baseline');
  await A.keyboard.press('Enter');
  await B.waitForSelector('text=first message for the baseline', { timeout: 15000 });
  await A.fill('[data-testid="composer"]', 'second message, timestamps will be masked');
  await A.keyboard.press('Enter');
  await A.waitForSelector('text=second message, timestamps will be masked', { timeout: 15000 });
  await settleRoom(A);
  await sleep(900);
  await shot(A, 'room-with-messages', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // image message (upload through the real file input)
  currentLabel = `image-message@${vp.label}/${theme}`;
  await A.locator('input[multiple]:not([accept])').setInputFiles(IMG);
  // wait until the transfer completes (image preview or Sent label)
  await A.waitForSelector('[data-testid="composer"]', { timeout: 5000 }).catch(() => {});
  // …and until the image row itself has echoed back — three messages means
  // three meta strips (msg-time), and every chat <img> must be decoded. The
  // socket echo sits ~1.5 s later under the polling delay pin, so the old
  // fixed 4 s sleep alone could shoot before the row landed under load.
  await A.waitForFunction(
    () => document.querySelectorAll('[data-testid="msg-time"]').length >= 3
      && [...document.querySelectorAll('img')].every((i) => i.complete),
    null, { timeout: 15000 }).catch(() => log('WARN image row not observed — falling back to the sleep'));
  await settleRoom(A);
  await sleep(600);
  await shot(A, 'image-message', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }

  // reaction picker open → reaction added
  currentLabel = `reaction-picker-open@${vp.label}/${theme}`;
  const reactBtn = A.locator('button[aria-label="React"]').first();
  const haveReact = await reactBtn.waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
  if (haveReact) {
    await reactBtn.click();
    await settleRoom(A);
    await sleep(500);
    await shot(A, 'reaction-picker-open', vp, theme);
    currentLabel = `reaction-added@${vp.label}/${theme}`;
    await A.locator('button[aria-label="React with ❤️"]').last().click().catch(() =>
      log('WARN could not click React with ❤️'));
    await A.waitForFunction(() => !!document.querySelector('[data-testid^="reaction-chip-"]'),
      null, { timeout: 8000 }).catch(() => log('WARN reaction chip did not appear'));
    await settleRoom(A);
    await sleep(600);
    await shot(A, 'reaction-added', vp, theme);
    if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }
  } else {
    log('WARN React button not found — picker/added screens missed');
  }

  // settings (room header gear)
  currentLabel = `settings@${vp.label}/${theme}`;
  await A.locator('[data-testid="open-settings"]').first().click().catch(() =>
    log('WARN open-settings not found'));
  await A.locator('[data-testid="settings-overlay"]').waitFor({ timeout: 6000 })
    .catch(() => log('WARN settings overlay did not open'));
  await settleRoom(A);
  await sleep(700);
  await shot(A, 'settings', vp, theme);
  if (onlyDone) { await ctxA.close(); await ctxB.close(); return; }
  await A.keyboard.press('Escape');
  await sleep(400);

  // room ended — shoot the disconnect toast on the landing page.
  //
  // WHY NOT THE OBVIOUS PATH: the settings-close Escape already mounts a
  // disconnect sheet. ChatView's Escape handler peels the settings layer and
  // returns (`hadLayer`), but SingleScreenApp's handler checks only ITS OWN
  // showSettings state (false) — so the same keypress opens its
  // confirmation, whose fixed inset-0 backdrop then covers the header's
  // `button[data-testid="end-session"]` (measured: strict click timed out
  // with "dialog intercepts pointer events" in 6/8 combos). And at desktop
  // widths the header button isn't visible at all (the room's control is
  // the left rail's slide-to-confirm `div`), so waiting for it just times
  // out ("end-session button not found" in 2/8 combos).
  //
  // Deterministic path, in order of what's actually on screen:
  //  1. reuse the already-open sheet (the common case);
  //  2. else click the header Disconnect (visible, uncovered);
  //  3. else press Escape (room-level handler opens the confirmation; both
  //     apps may answer — two stacked sheets, the LAST in DOM paints on top
  //     and confirming it ends the session for both, bugs.md B-double-sheet).
  // ConfirmActions renders Cancel first and the destructive Disconnect
  // second, so the topmost sheet's LAST button is the confirm. The session
  // end returns to landing with the disconnect toast — we shoot THERE and
  // never poll the roster, so the socket-reconnect ghost-seat race ("2
  // devices" vs "4 devices / 1 connecting" in run2) can't touch this shot.
  currentLabel = `room-ended@${vp.label}/${theme}`;
  const sheet = A.locator('div[role="dialog"][aria-label="Disconnect"]');
  let sheetOpen = await sheet.first().isVisible().catch(() => false);
  if (!sheetOpen) {
    const endBtn = A.locator('button[data-testid="end-session"]').first();
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click({ timeout: 8000 }).catch(() => {});
      sheetOpen = await sheet.first().waitFor({ timeout: 4000 })
        .then(() => true).catch(() => false);
    }
  }
  if (!sheetOpen) {
    await A.keyboard.press('Escape');
    sheetOpen = await sheet.first().waitFor({ timeout: 4000 })
      .then(() => true).catch(() => false);
  }
  if (sheetOpen) {
    await sleep(250); // entrance spring settles; rAF focus lands on confirm
    await sheet.last().locator('button').last().click({ timeout: 8000 })
      .catch(() => log('WARN disconnect confirm click missed'));
    await A.locator('[data-testid="disconnect-toast"]').waitFor({ timeout: 8000 })
      .catch(() => log('WARN disconnect-toast not visible'));
    // The landing hero + tracker re-mount with a framer-motion fade (delay
    // 0.4s + 0.5s). animations:'disabled' only freezes CSS, not JS-driven
    // motion, so wait for the fade to complete (≈0.9s) — still well inside
    // the toast's 5.5s lifetime — before the shot.
    await sleep(1500);
    await shot(A, 'room-ended', vp, theme);
  } else {
    log('WARN disconnect confirm never opened — room-ended shot skipped');
  }

  await ctxA.close();
  await ctxB.close();
}

// ── main matrix ───────────────────────────────────────────────────────────
// One failed combo must not throw away the rest of the baseline: each
// viewport × theme runs inside its own try/catch, failures are recorded in
// console.txt, and the process exits 1 at the end if anything failed.
const comboFailures = [];
for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    if (COMBO && COMBO !== `${vp.label}-${theme}`) continue;
    console.log(`[capture] ${vp.label} × ${theme}`);
    try {
      await staticScreens(vp, theme);
    } catch (e) {
      comboFailures.push(`static ${vp.label}×${theme}: ${e.message}`);
      log(`ERROR static ${vp.label}×${theme}: ${e.message}`);
      console.error(`  !! static ${vp.label} × ${theme} failed — ${e.message}`);
    }
    try {
      await roomScreens(vp, theme);
    } catch (e) {
      comboFailures.push(`room ${vp.label}×${theme}: ${e.message}`);
      log(`ERROR room ${vp.label}×${theme}: ${e.message}`);
      console.error(`  !! room ${vp.label} × ${theme} failed — ${e.message}`);
    }
  }
}

// ── motion sequences (once, 1440x900 light) ──────────────────────────────
async function motionFrames() {
  const vp = { label: '1440x900', width: 1440, height: 900 };
  const theme = 'light';
  const FPS = 12, DURATION = 6000, COUNT = (DURATION / 1000) * FPS; // 72 frames
  const capture = async (name, trigger) => {
    const dir = join(OUT, 'motion', name);
    mkdirSync(dir, { recursive: true });
    const ctx = await mkContext(vp, theme);
    const page = await ctx.newPage();
    currentLabel = `motion/${name}`;
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const t0 = Date.now();
    trigger(page).catch(() => {});
    for (let i = 0; i < COUNT; i++) {
      const due = t0 + i * (1000 / FPS);
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
      await page.screenshot({ path: join(dir, `frame-${String(i + 1).padStart(2, '0')}.png`) });
    }
    await ctx.close();
    console.log(`  motion ${name}: ${COUNT} frames`);
  };

  // the landing demo, started by its own Send control (never self-plays)
  await capture('landing-demo', async (page) => {
    await page.locator('[data-testid="demo-send"]').first().click({ timeout: 5000 });
  });
  // the moment two devices connect: frames start the instant B submits code
  await capture('connect', async (page) => {
    const ctxB = await mkContext(vp, theme);
    const B = await ctxB.newPage();
    const { code } = await createRoom(page, BASE);
    await B.goto(BASE, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('[data-testid="home-receive"]', { timeout: 20000 });
    await B.click('[data-testid="home-receive"]');
    await B.locator('input').first().waitFor({ timeout: 8000 });
    await B.locator('input').first().click();
    await B.keyboard.type(code, { delay: 40 });
    await waitForChat(B, 'B').finally(() => ctxB.close());
  });
}
if (!ONLY && !STATIC && !COMBO) await motionFrames();

// ── report ────────────────────────────────────────────────────────────────
const report = consoleSink.length ? consoleSink.join('\n') + '\n'
  : 'no console errors or warnings captured\n';
if (!COMBO) {
  writeFileSync(join(OUT, 'console.txt'), report);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(
    { base: BASE, static: STATIC, fixedTime: STATIC ? STATIC_TIME.toISOString() : null,
      count: shots.length, shots, comboFailures }, null, 1));
}
console.log(`[capture] done — ${shots.length} screenshots → ${OUT}`);
if (comboFailures.length) {
  console.error(`[capture] ${comboFailures.length} combo failure(s):\n  - ${comboFailures.join('\n  - ')}`);
}
await browser.close();
process.exit(comboFailures.length ? 1 : 0);
