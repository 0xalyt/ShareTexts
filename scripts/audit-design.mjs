/**
 * audit-design.mjs — measure the interface against the design rules we now
 * claim to follow (`.claude/skills/landing-page-design`, plus the product's
 * own DESIGN.md/APPLE-DNA.md where the two disagree).
 *
 * The useful part of a rule is the part a machine can check. This walks the
 * real surfaces and reports, per screen:
 *
 *   tiny text      font-size below the legibility floor (11px)
 *   touch targets  interactive boxes under 44x44 on a phone viewport
 *   one side       a card with a border on some sides but not all
 *   radius         an inner radius that ignores the outer-radius-minus-gap rule
 *   overflow       horizontal scroll at 390px
 *   dead link      href="#" / empty / javascript:
 *   alt text       <img> without alt
 *   gradient       a large element painted with a background gradient
 *
 *   node scripts/audit-design.mjs            (dev server on :3010)
 *   URL=http://localhost:3010 node scripts/audit-design.mjs
 *
 * Exit code is 1 only when a BLOCKING class fails (overflow, dead links,
 * missing alt). Everything else is reported as a count with examples, because
 * "553 off-scale sizes" is a design decision to make, not a gate to fail.
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';

/** Runs inside the page: returns every finding for the current DOM. */
function collect(rules) {
  const out = { tiny: [], touch: [], oneSided: [], radius: [], overflow: null, dead: [], noAlt: [], gradients: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
    // Decorative art (a drawn phone, a device mock) is not interface text, and
    // an sr-only skip link is only 1x1 until it is focused.
    if (el.closest('[aria-hidden="true"]')) return false;
    if (el.classList.contains('sr-only')) return false;
    return true;
  };
  const describe = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 90);
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return { tag: el.tagName.toLowerCase(), text, cls };
  };

  const scope = rules.scope ? document.querySelector(rules.scope) : document.body;
  for (const el of (scope || document.body).querySelectorAll('*')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    // tiny text: only leaf-ish nodes that actually paint text
    if (el.childElementCount === 0 && (el.textContent || '').trim()) {
      const size = parseFloat(s.fontSize);
      if (size < rules.minFont) out.tiny.push({ ...describe(el), size });
    }

    if (el.matches('button, a[href], [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
      if (r.width < rules.minTouch || r.height < rules.minTouch) {
        out.touch.push({ ...describe(el), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }

    // one-side borders on rounded cards
    const rawRadius = parseFloat(s.borderTopLeftRadius) || 0;
    const radius = rawRadius > 1000 ? 0 : rawRadius;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(
      (side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none',
    );
    if (radius >= 8 && sides.length > 0 && sides.length < 4) {
      out.oneSided.push({ ...describe(el), sides: sides.join('+') });
    }

    // nested radius: parent rounded, child rounded, gap small, child too round
    if (radius >= 12) {
      const parent = el.parentElement;
      if (parent) {
        const ps = getComputedStyle(parent);
        const pr = parseFloat(ps.borderTopLeftRadius) || 0;
        const pad = parseFloat(ps.paddingTop) || 0;
        if (pr >= 12 && pad > 0 && pad < 32) {
          const want = pr - pad;
          if (want > 2 && Math.abs(radius - want) > 6) {
            out.radius.push({ ...describe(el), outer: pr, gap: pad, want, got: radius });
          }
        }
        void ps;
      }
    }

    // large gradient backgrounds
    if (s.backgroundImage.includes('gradient') && r.width * r.height > 20000) {
      out.gradients.push({ ...describe(el), area: Math.round(r.width * r.height) });
    }
  }

  for (const a of (scope || document.body).querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (href === null) continue;
    if (href === '#' || href === '' || href.startsWith('javascript:')) out.dead.push(describe(a));
  }
  for (const img of (scope || document.body).querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) out.noAlt.push(describe(img));
  }

  out.overflow =
    document.documentElement.scrollWidth > window.innerWidth + 1
      ? { doc: document.documentElement.scrollWidth, view: window.innerWidth }
      : null;
  return out;
}

const browser = await chromium.launch();

const RULES = { minFont: 11, minTouch: 44 };
const blocking = [];


/** Pair two pages so the room chrome (header, composer, status) exists. */
async function withRoom(fn) {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await a.newPage();
  const guest = await b.newPage();
  await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await host.waitForSelector('[data-testid="home-send"]');
  await host.getByTestId('home-send').click();
  // The digits are separate aria-hidden spans, so read the whole group.
  await host.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
  const code = await host.locator('[data-testid="pairing-code"]').innerText({ timeout: 15000 });
  const digits = (code || '').replace(/\D/g, '');
  await guest.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await guest.waitForSelector('[data-testid="home-receive"]');
  await guest.getByTestId('home-receive').click();
  await guest.waitForTimeout(700);
  await guest.keyboard.type(digits);
  await guest.waitForSelector('[data-testid="open-settings"]', { timeout: 25000 });
  try {
    await fn(guest);
  } finally {
    await a.close();
    await b.close();
  }
}

async function audit(label, prepare) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await prepare(page);
  await page.waitForTimeout(350);
  const found = await page.evaluate(collect, RULES);
  const n = (v) => (Array.isArray(v) ? v.length : 0);
  console.log(`\n── ${label}`);
  console.log(
    `   tiny text ${n(found.tiny)}   touch ${n(found.touch)}   one-side border ${n(found.oneSided)}   ` +
      `nested radius ${n(found.radius)}   gradient ${n(found.gradients)}   dead link ${n(found.dead)}   img no alt ${n(found.noAlt)}`,
  );
  if (found.overflow) {
    console.log(`   OVERFLOW ${found.overflow.doc} > ${found.overflow.view}`);
    blocking.push(`${label}: horizontal overflow`);
  }
  if (found.dead.length) blocking.push(`${label}: ${found.dead.length} dead link(s)`);
  if (found.noAlt.length) blocking.push(`${label}: ${found.noAlt.length} image(s) without alt`);

  const show = (name, list, extra) => {
    if (!list.length) return;
    console.log(`   ${name}:`);
    for (const item of list.slice(0, 6)) {
      console.log(`     ${JSON.stringify({ ...item, ...(extra ? extra(item) : {}) })}`);
    }
    if (list.length > 6) console.log(`     … ${list.length - 6} more`);
  };
  show('tiny text', found.tiny, (i) => ({ size: i.size }));
  show('touch', found.touch, (i) => ({ w: i.w, h: i.h }));
  show('one-side', found.oneSided);
  show('radius', found.radius, (i) => ({ outer: i.outer, gap: i.gap, want: i.want, got: i.got }));
  show('gradient', found.gradients, (i) => ({ area: i.area }));
  await ctx.close();
  return found;
}

await withRoom(async (guest) => {
  const found = await guest.evaluate(collect, RULES);
  console.log('\n── room (paired)');
  console.log(
    `   tiny text ${found.tiny.length}   touch ${found.touch.length}   one-side border ${found.oneSided.length}   ` +
      `nested radius ${found.radius.length}   gradient ${found.gradients.length}   dead link ${found.dead.length}   img no alt ${found.noAlt.length}`,
  );
  if (found.overflow) {
    console.log(`   OVERFLOW ${found.overflow.doc} > ${found.overflow.view}`);
    blocking.push('room: horizontal overflow');
  }
  for (const item of found.touch.slice(0, 8)) console.log('     touch', JSON.stringify(item));
  for (const item of found.tiny.slice(0, 6)) console.log('     tiny', JSON.stringify(item));
  for (const item of found.oneSided.slice(0, 6)) console.log('     one-side', JSON.stringify(item));

  await guest.getByTestId('open-settings').click();
  await guest.waitForSelector('[data-testid="settings-overlay"]');
  await guest.waitForTimeout(600);
  const sheet = await guest.evaluate(collect, { ...RULES, scope: '[data-testid="settings-overlay"]' });
  console.log('\n── settings sheet');
  console.log(
    `   tiny text ${sheet.tiny.length}   touch ${sheet.touch.length}   one-side border ${sheet.oneSided.length}   ` +
      `nested radius ${sheet.radius.length}   gradient ${sheet.gradients.length}`,
  );
  for (const item of sheet.touch.slice(0, 8)) console.log('     touch', JSON.stringify(item));
  for (const item of sheet.radius.slice(0, 6)) console.log('     radius', JSON.stringify(item));
});

await audit('home / hero', async (p) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="home-send"]');
});

await audit('send', async (p) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="home-send"]');
  await p.getByTestId('home-send').click();
  await p.waitForSelector('[data-testid="send-screen"]');
});

await audit('receive', async (p) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="home-receive"]');
  await p.getByTestId('home-receive').click();
  await p.waitForTimeout(700);
});

await audit('docs', async (p) => {
  await p.goto(BASE + '/docs', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
});

await audit('privacy', async (p) => {
  await p.goto(BASE + '/privacy', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
});

await browser.close();

console.log(`\n=== audit-design: ${blocking.length ? blocking.length + ' BLOCKING' : 'no blocking failures'} ===`);
for (const b of blocking) console.log('  ✗', b);
process.exit(blocking.length ? 1 : 0);
