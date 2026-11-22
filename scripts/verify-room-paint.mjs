#!/usr/bin/env node
/**
 * verify-room-paint — the room's first frame is the whole room.
 *
 * This exists because of 0ebc470. A performance commit moved `RoomRail` and
 * `PresenceDock` behind `lazy()` with `Suspense fallback={null}`, and nothing
 * caught it: the desktop room at 1024 px rendered a line with no rail, no room
 * list and no way out for a frame or two, then popped them in. `verify-desktop`
 * measured 500 ms after a resize and happened to miss the window on wide
 * screens and hit it on 1024. A gate that depends on being lucky is not a gate.
 *
 * So this watches frames instead of waiting for a timer:
 *
 *   · a requestAnimationFrame sampler is installed before the page loads and
 *     records, per frame, whether the thread, the rail, the presence dock and
 *     the composer are on screen;
 *   · the first frame that shows the thread is the room's first frame, and the
 *     other three must exist in THAT frame — not after it;
 *   · layout shift is summed over room entry, and anything above 0.02 fails;
 *   · a static pass fails the build if `Suspense fallback={null}` ever wraps a
 *     component that can paint in that first frame.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-room-paint.mjs
 */
import { readFileSync } from 'node:fs';
import { launchBrowser, readLiveCode } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const failures = [];
const out = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(`${name}${extra ? ` (${extra})` : ''}`);
};

/** Components that can be on screen in the first frame of a room. A null
 *  fallback around any of these is the bug this gate exists for. */
const FIRST_PAINT = ['RoomRail', 'PresenceDock', 'ChatView', 'SystemAlert'];

/** Static half: find every `Suspense fallback={null}` and name its child. */
function staticNullFallbacks() {
  const src = readFileSync('src/views/SingleScreenApp.tsx', 'utf8');
  const bad = [];
  const re = /<Suspense\s+fallback=\{\s*null\s*\}\s*>\s*<([A-Z][\w]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (FIRST_PAINT.includes(m[1])) bad.push(m[1]);
  }
  return bad;
}

const SAMPLER = () => {
  window.__stFrames = [];
  window.__stShifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) window.__stShifts.push({ t: e.startTime, v: e.value });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* older engine: the frame check still runs */ }
  const tick = () => {
    const q = (s) => document.querySelector(s);
    window.__stFrames.push({
      t: performance.now(),
      thread: !!q('[role="log"]'),
      // The desktop room only exists with this pane; it is the signal that the
      // layout has switched, so "the first room frame" means the first frame of
      // the DESKTOP room rather than a phone layout caught mid-resize.
      panel: !!q('[data-testid="room-panel"]'),
      rail: !!q('[data-testid="room-rail"]'),
      rooms: document.querySelectorAll('[data-testid="rail-room"]').length,
      dock: !!q('[data-testid="presence-dock"]'),
      composer: !!q('textarea'),
    });
    if (window.__stFrames.length < 2400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const browser = await launchBrowser();

async function pairRoom() {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.addInitScript(SAMPLER);
  await a.goto(BASE, { waitUntil: 'domcontentloaded' });
  await b.goto(BASE, { waitUntil: 'domcontentloaded' });
  await a.getByRole('button', { name: /^send$/i }).first().click();
  await b.getByRole('button', { name: /^receive$/i }).first().click();
  const code = await readLiveCode(a);
  await b.getByTestId('join-code-input').locator('input').first().fill(code);
  await a.locator('textarea').first().waitFor({ timeout: 25000 });
  await b.locator('textarea').first().waitFor({ timeout: 25000 });
  return { a, b, ctxA, ctxB };
}

for (const [w, h] of [[1024, 768], [1440, 900]]) {
  const { a, ctxA, ctxB } = await pairRoom();

  // A message first, so the room has content the moment it is measured.
  const ta = a.locator('textarea').first();
  await ta.fill('Room entry, frame by frame.');
  await a.waitForFunction(() => {
    const s = document.querySelector('[aria-label="Send"]');
    return !!s && !s.disabled;
  }, null, { timeout: 20000 });
  await ta.press('Enter');
  await a.waitForTimeout(1000);

  // The entry we measure is the one a person sees when the window is already
  // this wide — a resize, not a fresh load, so the layout is the desktop one.
  await a.evaluate(() => { window.__stFrames = []; window.__stShifts = []; });
  await a.setViewportSize({ width: w, height: h });
  await a.waitForTimeout(1500);

  const { frames, shifts } = await a.evaluate(() => ({
    frames: window.__stFrames || [],
    shifts: window.__stShifts || [],
  }));

  const first = frames.findIndex((f) => f.panel && f.thread);
  if (first < 0) {
    out(`${w}×${h} — the desktop room painted`, false, 'the room pane never appeared');
    await ctxA.close();
    await ctxB.close();
    continue;
  }
  const at = frames[first];
  const railVisibility = await a.locator('#main-content .route-stack').evaluate(el => getComputedStyle(el).contentVisibility);
  out(`${w}×${h} — the room rail is not virtualized`, railVisibility === 'visible', railVisibility);
  const later = (key) => frames.findIndex((f) => f[key]);
  const settle = (key) => Math.max(0, later(key) - first);

  out(`${w}×${h} — the rail is in the first room frame`, at.rail, `rail at +${settle('rail')} frame(s), rail rooms in-frame: ${at.rooms}`);
  out(`${w}×${h} — the room list is in the first room frame`, at.rooms >= 1, `${at.rooms} room(s)`);
  out(`${w}×${h} — the presence dock is in the first room frame`, at.dock, `dock at +${settle('dock')} frame(s)`);
  out(`${w}×${h} — the composer is in the first room frame`, at.composer, `composer at +${settle('composer')} frame(s)`);

  // Layout shift over the entry window only.
  const t0 = at.t;
  const cls = shifts.filter((s) => s.t >= t0 - 16 && s.t <= t0 + 1200).reduce((n, s) => n + s.v, 0);
  out(`${w}×${h} — room entry shifts less than 0.02`, cls <= 0.02, `CLS ${cls.toFixed(4)}`);

  await ctxA.close();
  await ctxB.close();
}

{
  const { a, b, ctxA, ctxB } = await pairRoom();
  for (const event of ['visibilitychange', 'beforeunload']) {
    const text = `Flush received history on ${event}.`;
    await a.locator('textarea').first().fill(text);
    await a.locator('textarea').first().press('Enter');
    await b.getByText(text, { exact: true }).waitFor({ timeout: 20000 });
    const persisted = await b.evaluate(({ event, text }) => {
      const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      try {
        if (event === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event(event));
        } else window.dispatchEvent(new Event(event));
        return JSON.parse(localStorage.getItem('sharetext.session.v1'))?.messages?.some(m => m.text === text);
      } finally {
        if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
        else delete document.visibilityState;
      }
    }, { event, text });
    out(`${event} synchronously persists the latest received message`, persisted);
  }
  const text = 'Persist this message before the receiving tab closes.';
  await a.locator('textarea').first().fill(text);
  await a.locator('textarea').first().press('Enter');
  await b.getByText(text, { exact: true }).waitFor({ timeout: 20000 });
  await b.close();
  const reopened = await ctxB.newPage();
  await reopened.goto(BASE, { waitUntil: 'domcontentloaded' });
  const restored = await reopened.getByText(text, { exact: true }).waitFor({ timeout: 25000 }).then(() => true, () => false);
  out('a received message survives immediately closing and reopening its tab', restored);
  await ctxA.close();
  await ctxB.close();
}

{
  const context = await browser.newContext();
  const older = await context.newPage();
  await older.goto(BASE, { waitUntil: 'domcontentloaded' });
  await older.getByTestId('home-send').click();
  await older.getByTestId('pairing-code').waitFor({ timeout: 45000 });
  await older.waitForTimeout(500);
  const firstRoom = await older.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')).roomId);
  await older.evaluate(() => localStorage.removeItem('sharetext.session.v1'));
  const newer = await context.newPage();
  await newer.goto(BASE, { waitUntil: 'domcontentloaded' });
  await newer.getByTestId('home-send').click();
  await newer.getByTestId('pairing-code').waitFor({ timeout: 45000 });
  await newer.waitForTimeout(500);
  const currentRoom = await newer.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')).roomId);
  out('two tabs have created different rooms', firstRoom !== currentRoom);
  await older.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const storedRoom = () => newer.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')).roomId);
  out('hiding an idle older tab preserves the newer stored room', await storedRoom() === currentRoom);
  await older.close();
  out('closing an idle older tab preserves the newer stored room', await storedRoom() === currentRoom);
  await context.close();
}

/* ── static: a null fallback around a first-paint surface ───────────────── */
const bad = staticNullFallbacks();
out('no Suspense fallback={null} wraps a first-paint surface', bad.length === 0,
  bad.length ? bad.join(', ') : 'none found');

await browser.close();

if (failures.length) {
  console.error(`\n[verify-room-paint] ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n[verify-room-paint] clean — the first room frame is the whole room');
