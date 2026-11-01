// verify-primitives.mjs — the §18 primitives, measured instead of eyeballed.
//
// Runs against the dev server because the gallery lives at /__kit (dev only,
// §2g) — the kit is the one page that renders every primitive at once. The
// same primitives are then re-checked where they really ship: Home's header
// capsule and its rows.
//
//   node scripts/verify-primitives.mjs            # http://localhost:3010
//   URL=http://localhost:3010 node scripts/verify-primitives.mjs
//
// Checks
//   1. every .press / .glass control is at least 44×44 (the new floor; the
//      repo's older 40px floor still applies to things §18 did not touch)
//   2. the focus ring is really painted when the keyboard reaches a control
//   3. :active on a .press control computes scale(--st-press-scale) = 0.975
//   4. .no-glass and prefers-reduced-transparency hand over a solid fill
//      (computed backdrop-filter: none)
//   5. reduced motion leaves no transition longer than 160 ms
import { launchBrowser, URL, sleep } from './lib.mjs';

const results = [];
const out = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const MIN = 44;

/** Every control that opts into the new grammar, with its box. */
const CONTROL_BOXES = () => {
  const nodes = [...document.querySelectorAll('.press, .glass, .glass-capsule')];
  const seen = new Set();
  const boxes = [];
  for (const node of nodes) {
    const control = node.matches('button, a, [role="button"], [role="switch"], [role="tab"]')
      ? node
      : node.closest('button, a, [role="button"], [role="switch"], [role="tab"]');
    if (!control || seen.has(control)) continue;
    seen.add(control);
    const r = control.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    boxes.push({
      name: (control.getAttribute('aria-label') || control.textContent.trim() || '(icon)').slice(0, 34),
      cls: control.className.toString().split(' ').filter(c => /press|glass/.test(c)).join('.'),
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  return boxes;
};

const browser = await launchBrowser();
try {
  /* ── 1 + 2 + 3. Boxes, focus ring, press scale — on the kit ──────────── */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL + '/__kit', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.press', { timeout: 15000 });
  await sleep(500);

  const boxes = await page.evaluate(CONTROL_BOXES);
  const small = boxes.filter(b => b.w < MIN || b.h < MIN);
  out(`kit: every .press/.glass control is at least ${MIN}×${MIN}`,
    boxes.length >= 10 && small.length === 0,
    `${boxes.length} controls${small.length ? '; under-size: ' + JSON.stringify(small.slice(0, 4)) : ''}`);

  // Focus ring: tab until a .press control owns focus, then compare paint.
  const ring = await (async () => {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.matches('button, a, [role="button"], [role="switch"], [role="tab"]')) return null;
        if (!el.matches('.press, .glass, .glass-capsule') && !el.closest('.glass-capsule')) return null;
        const cs = getComputedStyle(el);
        const paint = [cs.outlineStyle, cs.outlineWidth, cs.boxShadow].join('|');
        return {
          paint,
          visible: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) || cs.boxShadow !== 'none',
          name: (el.getAttribute('aria-label') || el.textContent.trim() || '(icon)').slice(0, 24),
        };
      });
      if (r) return r;
    }
    return null;
  })();
  out('kit: the keyboard focus ring is painted on a control', !!ring && ring.visible,
    ring ? `${ring.name} → ${ring.paint}` : 'no control took focus');

  // :active → scale(0.975). Pressed with the real mouse so :active is real.
  const pressTarget = page.locator('.press').first();
  const targetBox = await pressTarget.boundingBox();
  let pressScale = null;
  if (targetBox) {
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.down();
    await sleep(140);
    pressScale = await page.evaluate(() => {
      const el = document.querySelector('.press');
      if (!el) return null;
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { a: +m.a.toFixed(3), d: +m.d.toFixed(3) };
    });
    await page.mouse.up();
  }
  out('kit: pressing a .press control scales it to 0.975', !!pressScale && pressScale.a === 0.975 && pressScale.d === 0.975,
    JSON.stringify(pressScale));
  await ctx.close();

  /* ── 4. Solid fallbacks ──────────────────────────────────────────────── */
  const glassOf = (page) => page.evaluate(() => {
    const el = document.querySelector('.glass-capsule, .glass');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, webkit: cs.webkitBackdropFilter, bg: cs.backgroundColor };
  });

  {
    // html.no-glass — what a low-memory phone gets (§2b).
    const ctxN = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctxN.newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.glass-capsule, .glass', { timeout: 15000 });
    const solidBefore = await glassOf(p);
    await p.evaluate(() => document.documentElement.classList.add('no-glass'));
    await sleep(250);
    const solidAfter = await glassOf(p);
    out('html.no-glass: glass falls back to a solid fill (no blur)',
      !!solidAfter && solidAfter.filter === 'none' && solidBefore && solidBefore.filter !== 'none',
      JSON.stringify({ before: solidBefore && solidBefore.filter, after: solidAfter && solidAfter.filter }));
    await p.evaluate(() => document.documentElement.classList.remove('no-glass'));
    await ctxN.close();
  }

  {
    // prefers-reduced-transparency — the OS switch, not ours.
    const ctxR = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctxR.newPage();
    const cdp = await ctxR.newCDPSession(p);
    let supported = true;
    try {
      await cdp.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
      });
    } catch { supported = false; }
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.glass-capsule, .glass', { timeout: 15000 });
    await sleep(300);
    const r = await glassOf(p);
    if (supported) {
      out('prefers-reduced-transparency: glass falls back to a solid fill', !!r && r.filter === 'none',
        JSON.stringify(r && { filter: r.filter }));
    } else {
      out('prefers-reduced-transparency: emulation available', false, 'CDP refused the media feature');
    }
    await ctxR.close();
  }

  /* ── 5. Reduced motion: nothing is left to wait for ──────────────────── */
  {
    const ctxRm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await ctxRm.newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.getByTestId('home-send').waitFor({ timeout: 15000 });
    await sleep(300);
    const slow = await p.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.press, .glass, .glass-capsule, [class*="route-screen"], .sheet')) {
        const cs = getComputedStyle(el);
        const durations = cs.transitionDuration.split(',').map(v => parseFloat(v) * (v.includes('ms') ? 1 : 1000));
        for (const d of durations) {
          if (d > 160) bad.push({
            name: (el.getAttribute('aria-label') || el.className.toString().split(' ')[0]).slice(0, 30),
            d,
          });
        }
      }
      return bad.slice(0, 6);
    });
    out('reduced motion: no primitive transition runs longer than 160 ms', slow.length === 0,
      slow.length ? JSON.stringify(slow) : '');
    await ctxRm.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r).length;
console.log(`\nverify-primitives: ${results.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
