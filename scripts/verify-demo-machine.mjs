// F22-B (retargeted): the landing hero is a FILM now, at every width.
//
// This gate used to pin the visitor-driven DOM transfer machine. That machine
// no longer ships on the landing — HeroDeviceDemo survives only as the source
// component the film is rendered from — so the contract worth pinning is the
// hero that IS on the page:
//   · exactly one visible hero surface per viewport, and it is the film
//   · the film loads, is muted, loops, and carries its poster
//   · it plays while on screen and stops when it is not
//   · reduced motion gets the poster and never starts playback
//   · the retired demo mounts nowhere on the landing
// Run: node scripts/verify-demo-machine.mjs  (URL env var, e.g. http://localhost:3010)
import { launchBrowser, URL, sleep } from './lib.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name); console.log('  ✗', name); } };

/** The hero's own facts, read from the DOM rather than from assumptions. */
const hero = (page) => page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-testid="hero-demo"]')];
  const vis = nodes.filter((n) => n.getBoundingClientRect().width > 0);
  // Both slots mount the film; the off-screen copy is display:none, never plays,
  // and reading it would make every playback check below look stalled.
  const v = vis[0]?.querySelector('video') ?? null;
  return {
    states: nodes.map((n) => n.getAttribute('data-state')),
    visCount: vis.length,
    visState: vis[0]?.getAttribute('data-state') ?? '',
    src: v ? new URL(v.currentSrc || v.src, location.href).pathname : '',
    paused: v?.paused ?? null,
    muted: v?.muted ?? null,
    loop: v?.loop ?? null,
    poster: !!v?.getAttribute('poster'),
    t: v ? +v.currentTime.toFixed(1) : -1,
    dur: v ? +v.duration.toFixed(1) : -1,
    top: Math.round(vis[0]?.getBoundingClientRect().top ?? 0),
    playing: [...document.querySelectorAll('video')].filter((x) => !x.paused).length,
  };
});

const browser = await launchBrowser();

// ── A. The film is the hero, and it is the only hero, at every width ─────
{
  console.log('A. the hero is the film');
  for (const width of [1440, 1024, 834, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'networkidle' });
    await sleep(900);
    const h = await hero(p);
    ok(h.visCount === 1 && h.visState === 'film', `${width}px: exactly one visible hero, and it is the film (${h.states.join('/') || 'none'})`);
    ok(h.src === '/film/sharetexts-hero.mp4', `${width}px: the hero serves the film encode`);
    await ctx.close();
  }
}

// ── B. What the film does while it is on screen ──────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1500);
  const a = await hero(p);
  await sleep(1500);
  const b = await hero(p);
  console.log('B. playback');
  ok(a.muted === true, 'the hero is muted (autoplay policy, and the web encode has no audio)');
  ok(a.loop === true, 'the hero loops');
  ok(a.poster, 'the hero carries a poster frame');
  // The hero is a LOOP, so a pair of samples can straddle the seam and read
  // as backwards (8.6s → 0.1s). What "playing" means for a loop is progress
  // modulo its duration.
  const span = a.dur > 0 ? a.dur : 10;
  const advance = (b.t - a.t + span) % span;
  ok(a.paused === false && advance > 0.2, `the hero plays (t ${a.t}s → ${b.t}s across a ${span}s loop)`);
  // The phone slot mounts the same film and is display:none at this width; a
  // second playing copy would mean it is downloading and decoding the file for
  // nobody.
  ok(a.playing === 1, `only the visible copy plays (${a.playing} playing video(s))`);
  await ctx.close();
}

// ── C. Off screen it stops, back on screen it resumes ────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1200);
  // The landing scrolls in its own container, so window.scrollTo is a no-op
  // here; only real wheel input moves it (and only that path is worth testing).
  await p.mouse.wheel(0, 4000);
  await sleep(1300);
  console.log('C. on-screen only');
  const off = await hero(p);
  ok(off.paused === true && off.top < 0, `scrolling past the hero pauses it (top ${off.top}px, paused ${off.paused})`);
  await p.mouse.wheel(0, -6000);
  await sleep(1400);
  const back = await hero(p);
  ok(back.paused === false, 'scrolling back resumes it');
  await ctx.close();
}

// ── D. Reduced motion: the poster, never playback ────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2000);
  const r = await hero(p);
  console.log('D. reduced motion');
  ok(r.paused === true, 'reduced motion never starts playback');
  ok(r.poster, 'reduced motion shows the poster frame');
  await ctx.close();
}

// ── E. The retired demo is gone from the landing ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(900);
  console.log('E. the retired demo');
  ok(!(await p.evaluate(() => !!document.querySelector('[data-testid="demo-caption"]'))), 'no demo caption mounts on the landing');
  ok(!(await p.evaluate(() => !!document.querySelector('[data-testid="demo-rail"]'))), 'no demo rail mounts on the landing');
  ok(!(await p.evaluate(() => !!document.querySelector('[data-testid="demo-restart"]'))), 'no demo Restart mounts on the landing');
  await ctx.close();
}

await browser.close();
console.log(`\nverify-demo-machine: ${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
