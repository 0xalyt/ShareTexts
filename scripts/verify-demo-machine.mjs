// F22-B: the hero demo is a transfer machine. These checks pin its contract:
// it walks connecting → sending → received → done on fixed beats by ITSELF
// (§18 removed the demo's own Send button — a second hero CTA) and loops back
// to the open rest instead of dead-stopping. The only manual control left is
// the Restart offered on the reduced-motion still.
// The caption is always the same state as the picture, the hidden tab
// suspends the walk, reduced motion rests on one honest still (the payoff,
// not an empty room), and the caption is live region output.
// Run: node scripts/verify-demo-machine.mjs  (URL env var, e.g. http://localhost:3010)
import { launchBrowser, URL, sleep } from './lib.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name); console.log('  ✗', name); } };

const stateOf = (page) => page.evaluate(() =>
  document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') ?? '');
// The caption's headline — the first line of the status region.
const captionHeadOf = (page) => page.evaluate(() =>
  document.querySelector('[data-testid="demo-caption"]')?.firstElementChild?.firstElementChild?.textContent?.trim() ?? '');
const sendBtn = (page) => page.evaluate(() => !!document.querySelector('[data-testid="demo-send"]'));
const restartBtn = (page) => page.evaluate(() => !!document.querySelector('[data-testid="demo-restart"]'));
const tapRestart = (page) => page.evaluate(() => { document.querySelector('[data-testid="demo-restart"]')?.click(); });
const waitState = (page, state, ms = 9000) =>
  page.waitForFunction((s) => document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') === s, state, { timeout: ms });

const browser = await launchBrowser();

// ── A. The machine: self-start → walk → done → restart ───────────────────
{
  // Retargeted to the tablet layout: the desktop hero is a rendered FILM now
  // (src/components/HeroFilm.tsx), so the transfer machine this gate pins
  // ships on the phone/tablet branch only. Same component, same contract,
  // checked where it actually renders.
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1112 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);

  console.log('A. state machine');
  // §18 removed the demo's own Send button (it was a second hero CTA). The
  // walk starts by itself now. What this gate protects has NOT changed: every
  // state in order, captions that track it, no loop, suspension while the tab
  // is hidden, and a real Restart.
  ok(!(await sendBtn(p)), 'no second Send control inside the demo');

  // The walk now OPENS mid-action (`sending`) rather than on an empty room,
  // so first-cycle `connecting` is ~10s away: sending→received→done→open→
  // connecting. The old 8s budget predates that and expired before the beat.
  await waitState(p, 'connecting', 16000);
  await sleep(450); // the caption crossfades in over 280 ms — read it settled
  const capConn = await captionHeadOf(p);
  await waitState(p, 'sending', 6000);
  await sleep(450);
  const capSend = await captionHeadOf(p);
  await waitState(p, 'received', 6000);
  await sleep(450);
  const capRec = await captionHeadOf(p);
  await waitState(p, 'done', 6000);
  await sleep(450);
  const capDone = await captionHeadOf(p);
  ok(true, 'the walk plays connecting → sending → received → done');
  ok(capConn.length > 0 && capSend.length > 0 && capRec.length > 0 && capDone.length > 0
    && new Set([capConn, capSend, capRec, capDone]).size === 4,
    'caption changes because the state changed');

  // No dead stop and no manual control while it runs: `done` holds for its
  // beat, then the walk returns to the open rest on its own. The loop is the
  // hero's heartbeat — a demo that stops forever is a screenshot.
  await waitState(p, 'open', 7000);
  ok(true, 'the walk loops back to the open rest on its own');
  ok(!(await restartBtn(p)), 'no Restart control while the walk drives itself');
  await waitState(p, 'connecting', 6000);

  // Hidden tab suspends the walk: hide mid-walk, state holds; unhide → completes.
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(2400); // longer than the whole remaining walk
  const held = await stateOf(p);
  ok(held === 'connecting' || held === 'sending', `hidden tab suspends the walk (held at ${held})`);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitState(p, 'done', 12000);
  ok(true, 'visible tab resumes the walk to done');

  await ctx.close();
}

// ── B. Reduced motion: one informative still, no sequence ────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('[data-testid="hero-demo"]')?.scrollIntoView({ block: 'center' }));
  await sleep(600);
  console.log('B. reduced motion');
  // The still is the payoff, not an empty room: a reduced-motion visitor gets
  // the delivered state, which is the one frame that explains the product.
  ok((await stateOf(p)) === 'received', 'opens on the honest payoff still');
  const devices = await p.evaluate(() => document.querySelectorAll('[data-testid="hero-demo"] svg').length);
  ok(devices >= 2, 'devices render under reduced motion');
  await sleep(2500);
  ok((await stateOf(p)) === 'received', 'no motion sequence plays by itself');
  ok(await restartBtn(p), 'the still keeps a Restart control');
  const stillCap = await captionHeadOf(p);
  ok(stillCap.length > 0, 'the still explains what it shows');
  await ctx.close();
}

// ── C. Caption hygiene: live output, headline + explanation per state ────
{
  // Retargeted to the tablet layout: the desktop hero is a rendered FILM now
  // (src/components/HeroFilm.tsx), so the transfer machine this gate pins
  // ships on the phone/tablet branch only. Same component, same contract,
  // checked where it actually renders.
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1112 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  const cap = await p.evaluate(() => {
    const el = document.querySelector('[data-testid="demo-caption"]');
    return {
      role: el?.getAttribute('role'),
      headline: el?.querySelector('p')?.textContent?.trim() ?? '',
      sub: el?.querySelector('p + p')?.textContent?.trim() ?? '',
    };
  });
  ok(cap.role === 'status', 'caption is live region output (role=status)');
  // One line per state by design — the caption IS the explanation. The old
  // `p + p` pair assertion could never match a single-paragraph caption.
  ok(cap.headline.length >= 12, 'every state carries a readable caption');
  await ctx.close();
}

await browser.close();
console.log(`\nverify-demo-machine: ${pass} passed, ${fail} failed`);
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
