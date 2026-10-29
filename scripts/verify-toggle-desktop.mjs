import { chromium } from 'playwright';
const BASE = process.env.URL || 'http://localhost:3010';
let failures = 0;
const out = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="switch"]', { timeout: 15000 });
  // The tracker chip only renders once the ACTIVE signaling backend answers
  // /stats — a cross-origin fetch measured at 1.1–2.0s (three runs). A fixed
  // 1800ms sample raced it and went red three times while every assertion
  // below stayed true. Wait for the chip itself (the element under test),
  // bounded, then assert its geometry/count/color exactly as before — this
  // de-races the wait, not the checks.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('div')].some(d =>
      d.children.length >= 2 && /connections made so far/i.test(d.textContent) && d.textContent.length < 60),
    { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  // 1. Theme control on desktop. The header no longer carries a 56×26
  //    switch (retired: it read as a settings row dropped into a toolbar).
  //    The contract now is ONE 40×40 icon slot holding an 18×18 morphing
  //    sun/moon glyph — ThemeToggle.tsx's docblock. Measured, not assumed.
  const tg = await page.evaluate(() => {
    const sw = document.querySelector('[data-testid="theme-toggle"]');
    if (!sw) return null;
    const r = sw.getBoundingClientRect();
    // Computed CSS width, NOT getBoundingClientRect: the inactive glyph is
    // scaled to 0.55 as part of the morph, and a rendered box would measure
    // that transform instead of the 18px slot both glyphs share.
    const glyphs = [...sw.querySelectorAll('svg')].map(s => {
      const cs = getComputedStyle(s);
      return {
        w: +parseFloat(cs.width).toFixed(1), h: +parseFloat(cs.height).toFixed(1),
        opacity: cs.opacity,
      };
    });
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      role: sw.getAttribute('role'), checked: sw.getAttribute('aria-checked'),
      glyphs,
    };
  });
  out('desktop-theme-control-40x40', !!tg && Math.abs(tg.w - 40) < 1.5 && Math.abs(tg.h - 40) < 1.5, JSON.stringify(tg && { w: tg.w, h: tg.h }));
  out('theme-control-holds-a-switch-role', !!tg && tg.role === 'switch' && /^(true|false)$/.test(tg.checked || ''), tg && `${tg.role}/${tg.checked}`);
  out('theme-glyphs-are-18x18-sun-and-moon', !!tg && tg.glyphs.length === 2 && tg.glyphs.every(g => Math.abs(g.w - 18) < 1.5 && Math.abs(g.h - 18) < 1.5), JSON.stringify(tg && tg.glyphs));
  // Exactly one glyph is visible in either state (the morph is a cross-fade).
  out('exactly-one-theme-glyph-visible', !!tg && tg.glyphs.filter(g => +g.opacity > 0.5).length === 1, tg && JSON.stringify(tg.glyphs.map(g => g.opacity)));

  // 2. Live tracker: ABOVE the buttons (headline → subline → tracker →
  //    Send/Receive), left-aligned with the subline, count ≥ 113, white
  //    label token in dark.
  const tk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter(d => d.children.length >= 2 && /rooms made so far/i.test(d.textContent) && d.textContent.length < 60).pop();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const btns = [...document.querySelectorAll('button')].filter(b => /send|receive/i.test(b.textContent) && b.querySelector('svg'));
    const btn = btns[btns.length - 1];
    const br = btn ? btn.getBoundingClientRect() : null;
    const label = el.lastElementChild, count = el.children[1];
    const leftSibling = el.previousElementSibling ? el.previousElementSibling.getBoundingClientRect() : null;
    return {
      y: Math.round(r.y), bottom: Math.round(r.bottom), x: Math.round(r.x),
      count: count.textContent, countWeight: getComputedStyle(count).fontWeight,
      labelColor: getComputedStyle(label).color,
      btnTop: br ? Math.round(br.top) : null,
      alignDiff: leftSibling ? Math.round(r.x - leftSibling.x) : null,
    };
  });
  out('desktop-tracker-above-buttons-left-aligned', !!tk && tk.bottom <= tk.btnTop && Math.abs(tk.alignDiff) < 8, JSON.stringify(tk));
  out('desktop-tracker-count-113-plus', !!tk && parseInt((tk?.count || '').replace(/[^0-9]/g, '')) >= 113, tk?.count);
  // Dark label = the white token at 50% — Chrome serializes translucent
  // whites as oklab(0.99… / 0.5), opaque ones as rgb(255, 255, 255).
  out('desktop-tracker-label-white-in-dark', !!tk && /^(rgb\(255, 255, 255\)|oklab\(0\.99)/.test(tk?.labelColor || ''), tk?.labelColor);

  // 3. Header rhythm: the four utility glyphs live in ONE capsule, and the
  //    theme glyph sits just outside it. Both gaps must stay on the same
  //    tight grid, or the row reads as two unrelated groups.
  const gap = await page.evaluate(() => {
    const sw = document.querySelector('[data-testid="theme-toggle"]');
    const cluster = sw?.parentElement;
    if (!cluster) return null;
    const capsule = [...cluster.children].find(c => c !== sw);
    const items = [...(capsule ? capsule.children : []), ...(capsule ? [sw] : [])]
      .map(k => { const r = k.getBoundingClientRect(); return { x: r.x, r: r.x + r.width }; });
    const gaps = [];
    for (let i = 1; i < items.length; i++) gaps.push(+(items[i].x - items[i - 1].r).toFixed(1));
    return { gaps, capsuleItems: capsule ? capsule.children.length : 0 };
  });
  out('desktop-tool-cluster-has-4-glyphs', !!gap && gap.capsuleItems === 4, JSON.stringify(gap));
  // Inside the capsule: 2px. Between the capsule and the theme glyph: a
  // deliberate 8–16px breath, so "tools" and "state" never fuse into one
  // row of five equal marks.
  out('desktop-header-gaps-tight', !!gap && gap.gaps.length >= 4
    && gap.gaps.slice(0, -1).every(g => g <= 8.5)
    && gap.gaps.at(-1) >= 8 && gap.gaps.at(-1) <= 16, JSON.stringify(gap && gap.gaps));

  // 4. Hero heading + the shipped <title> (product decision: the landing tab
  //    and every share card read "AirDrop for everyone — ShareTexts"; other
  //    routes keep their own task titles via seo-routes / Docs / Legal).
  const meta = await page.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, title: document.title }));
  out('hero-heading-restored', /Move anything/i.test(meta.h1 || ''), meta.h1);
  out('site-title-airdrop-for-everyone', /^AirDrop for everyone — ShareTexts$/.test(meta.title), meta.title);

  out('no-page-errors', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (e) {
  out('FATAL', false, e.message.slice(0, 200));
} finally {
  await browser.close();
}
// Gate the run: this suite used to print FAILs and still exit 0.
process.exit(failures === 0 ? 0 : 1);
