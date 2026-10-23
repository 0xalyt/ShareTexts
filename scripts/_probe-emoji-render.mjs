// _probe-emoji-render.mjs — does DESIGN.md §7 hold in the browser?
//
// The reactions gate proves the room semantics; this proves the ARTWORK: in
// default (VITE_EMOJI_SET unset = apple) mode every reaction control must
// render <img src="/emoji-apple/*.png"> that has actually decoded
// (naturalWidth > 0, source 160×160), on the picker and the message chip,
// with the page console-clean throughout. Needs a real pair (composer only
// exists once a second device joins), same flow as verify-reactions.
//
//   URL=http://localhost:3012 node scripts/_probe-emoji-render.mjs
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3012';
let failures = 0;
const out = (ok, name, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: pageerror: ${e.message}`));
};

try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();
  watch(pa, 'A');
  watch(pb, 'B');

  // ── pair ────────────────────────────────────────────────────────────────
  await pa.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('[data-testid]', { timeout: 20000 });
  await pa.getByTestId('home-send').click();
  await pa.waitForFunction(() => !!localStorage.getItem('sharetext.session.v1'), null, { timeout: 20000 });
  const { roomId } = await pa.evaluate(() => JSON.parse(localStorage.getItem('sharetext.session.v1')));
  const short = roomId.replace(/-/g, '').slice(0, 8);

  await pb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pb.waitForTimeout(1500);
  await pb.evaluate((code) => { location.href = '/s/' + code; }, short);

  await pa.waitForSelector('[data-testid="composer"]', { timeout: 30000 });
  await pb.waitForSelector('[data-testid="composer"]', { timeout: 30000 });

  await pa.getByTestId('composer').fill('emoji artwork probe');
  await pa.keyboard.press('Enter');
  await pb.waitForSelector('text=emoji artwork probe', { timeout: 15000 });
  await pa.waitForTimeout(800);

  // ── 1. picker: six controls, each a decoded Apple PNG ────────────────────
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

  // ── 2. drop ❤️ — the chip must wear the same artwork ─────────────────────
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
    'message chip renders the decoded heart PNG', `${chip.src} (${chip.natural}px)`);
  out((chip.label || '').includes('❤️'), 'chip accessible name still carries the character', chip.label);

  // ── 3. a second reaction → more artwork on screen (burst shares <Emoji>) ─
  await pb.locator('button[aria-label="React with 🔥"]').last().click();
  await pa.waitForTimeout(400);
  const imgs = await pa.evaluate(() =>
    [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('src') || '').startsWith('/emoji-apple/')).length
  );
  out(imgs >= 2, 'on-screen Apple emoji images after two reactions', `imgs=${imgs}`);

  // ── 4. §7 failure path: artwork 404s → native character, not a blank ─────
  // Abort every /emoji-apple/ request, reload A (room state survives — the
  // chips come back from the server) and require the heart to appear as text.
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

  // ── 5. console cleanliness across both devices ───────────────────────────
  // The step-4 aborts generate a deliberate "Failed to load resource" line;
  // everything else must stay silent.
  const realErrors = errors.filter((e) => !/emoji-apple|ERR_FAILED/i.test(e));
  out(realErrors.length === 0, 'no console errors during the render probe',
    realErrors.slice(0, 3).join(' | '));

  await ctxA.close();
  await ctxB.close();
} finally {
  await browser.close();
}

console.log(`\n[_probe-emoji-render] ${failures === 0 ? 'GREEN' : `${failures} FAILURE(S)`} against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
