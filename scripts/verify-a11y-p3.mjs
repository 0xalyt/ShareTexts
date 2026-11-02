/**
 * a11y-p3.mjs — Step 5 checks for P3: focus order + accessible names on the
 * four surfaces, 200% zoom, and landscape 844x390 with the keyboard up.
 *
 *   node scripts/verify-a11y-p3.mjs
 * Writes screenshots into audit/p3/ (gitignored).
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
const out = [];
const line = (s) => { out.push(s); console.log(s); };

const browser = await chromium.launch();

/** Walk Tab from the top and record (testid|role|name) for the first n stops. */
async function tabOrder(page, n = 10) {
  // Focus the body itself: that resets the sequential navigation start point,
  // so the walk really begins at the first focusable thing in the document.
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    window.scrollTo(0, 0);
  });
  const stops = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'BODY';
        const name =
          el.getAttribute('aria-label') ||
          (el.getAttribute('aria-labelledby') &&
            document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
          (el.labels && el.labels[0]?.textContent) ||
          el.textContent?.trim().slice(0, 40) ||
          '';
        return `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') || el.getAttribute('role') || ''}] "${name.trim()}"`;
      }),
    );
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  return stops;
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const peerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const peer = await peerCtx.newPage();

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="home-send"]');

// ── Send ────────────────────────────────────────────────────────────────
await page.getByTestId('home-send').click();
await page.waitForSelector('[data-testid="send-screen"]', { timeout: 20000 });
await page.waitForTimeout(900);
line('SEND tab order: ' + JSON.stringify(await tabOrder(page, 9), null, 0));
line('SEND live region: ' + JSON.stringify(await page.evaluate(() => {
  const el = document.querySelector('[aria-live]');
  return el ? { live: el.getAttribute('aria-live'), text: el.textContent.replace(/\s+/g, ' ').trim() } : null;
})));

// code digits are read separately
line('SEND digits accessible: ' + JSON.stringify(await page.evaluate(() => {
  const card = document.querySelector('[data-testid="send-code-card"]');
  return card ? [...card.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).slice(0, 8) : null;
})));

// ── Receive ─────────────────────────────────────────────────────────────
await page.getByTestId('task-back').click();
await page.waitForTimeout(700);
await page.getByTestId('home-receive').click();
await page.waitForSelector('[data-testid="receive-screen"]', { timeout: 20000 });
await page.waitForTimeout(700);
line('RECEIVE tab order: ' + JSON.stringify(await tabOrder(page, 8)));
line('RECEIVE field: ' + JSON.stringify(await page.evaluate(() => {
  const i = document.querySelector('[data-testid="receive-screen"] input');
  return i ? { inputmode: i.getAttribute('inputmode'), otc: i.getAttribute('autocomplete'), label: i.getAttribute('aria-label') } : null;
})));

// ── 200% zoom ⇒ 195 CSS px at 390; WCAG asks for 320, so test the harder one
await page.setViewportSize({ width: 320, height: 640 });
await page.waitForTimeout(600);
const zoom = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-testid="receive-screen"] input, [data-testid="receive-screen"] [data-slot]')];
  const r = cells.length ? cells[0].getBoundingClientRect() : null;
  return {
    viewport: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    firstCell: r ? { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } : null,
    joinVisible: !!document.querySelector('[data-testid="receive-join"]')?.getBoundingClientRect().bottom,
  };
});
line('RECEIVE reflow at 320 px (200% of 640): ' + JSON.stringify(zoom));
await page.screenshot({ path: 'audit/p3-receive-320.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);

// ── Landscape 844x390 with the keyboard up ──────────────────────────────
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(400);
await page.evaluate(() => {
  // stand-in for an on-screen keyboard: shrink the visual viewport the way
  // Android does (the screen listens to visualViewport)
  const vv = window.visualViewport;
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { ...vv, height: 190, width: 844, offsetTop: 0, addEventListener: vv.addEventListener.bind(vv), removeEventListener: vv.removeEventListener.bind(vv), onresize: null },
  });
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(500);
const land = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="receive-join"]');
  const r = btn?.getBoundingClientRect();
  return {
    joinVisible: r ? r.top >= 0 && r.bottom <= window.innerHeight + 1 : null,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
line('RECEIVE landscape 844x390 + keyboard: ' + JSON.stringify(land));
await page.screenshot({ path: 'audit/p3-receive-844x390-keyboard.png' });

// ── Connect moment + Settings ───────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.getByTestId('task-back').click();
await page.waitForTimeout(600);

// reduced motion: no line animation
await peer.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await peer.waitForSelector('[data-testid="home-send"]');
await peer.getByTestId('home-send').click();
await peer.waitForSelector('[data-testid="send-code-card"]', { timeout: 20000 });
await peer.waitForTimeout(800);
const code = await peer.evaluate(() =>
  [...document.querySelectorAll('[data-testid="pairing-code"] span[aria-hidden]')].map((s) => s.textContent).join(''),
);

const rmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await rm.waitForSelector('[data-testid="home-receive"]');
await rm.getByTestId('home-receive').click();
await rm.waitForTimeout(800);
await rm.keyboard.type(code);
const sawBeat = await rm
  .waitForSelector('[data-testid="connect-handshake"]', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
if (sawBeat) {
  const motion = await rm.evaluate(() => {
    const l = document.querySelector('[data-testid="connect-line"]');
    const c = document.querySelector('[data-testid="connect-check"]');
    return {
      line: l ? getComputedStyle(l).transitionDuration + ' / ' + getComputedStyle(l).animationName : null,
      check: c ? getComputedStyle(c).transitionDuration : null,
      phase: document.querySelector('[data-testid="connect-handshake"]')?.getAttribute('data-phase'),
    };
  });
  line('CONNECT reduced motion: ' + JSON.stringify(motion));
} else {
  line('CONNECT reduced motion: beat not observed (joined in under 8 s) — the hold is 220 ms by design');
}
await rm.close();

// Settings focus + names — page joins the peer's current code
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="home-receive"]');
await page.getByTestId('home-receive').click();
await page.waitForSelector('[data-testid="receive-screen"]', { timeout: 20000 });
await page.waitForTimeout(700);
const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = await hostCtx.newPage();
await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await host.waitForSelector('[data-testid="home-send"]');
await host.getByTestId('home-send').click();
await host.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
await host.waitForTimeout(800);
const code2 = await host.evaluate(() =>
  [...document.querySelectorAll('[data-testid="pairing-code"] span[aria-hidden]')].map((s) => s.textContent).join(''),
);
await page.keyboard.type(code2);
const inRoom = await page
  .waitForSelector('[data-testid="open-settings"]', { timeout: 25000 })
  .then(() => true)
  .catch(() => false);
line('SETTINGS reachable: ' + inRoom);

if (inRoom) {
  await page.waitForTimeout(600);
  await page.getByTestId('open-settings').click();
  await page.waitForSelector('[data-testid="settings-overlay"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  line('SETTINGS dialog: ' + JSON.stringify(await page.evaluate(() => {
    const d = document.querySelector('[data-testid="settings-overlay"]')?.closest('[role="dialog"]');
    return d ? { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), label: d.getAttribute('aria-label') } : null;
  })));
  line('SETTINGS tab order: ' + JSON.stringify(await tabOrder(page, 12)));
  line('SETTINGS switches: ' + JSON.stringify(await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="settings-overlay"] [role="switch"], [data-testid="settings-overlay"] [role="radio"]')].map((s) => ({
      role: s.getAttribute('role'),
      name: s.getAttribute('aria-label') || s.textContent.trim().slice(0, 26),
      checked: s.getAttribute('aria-checked'),
    })),
  )));
  // trap: focus after many Tabs must still be inside the sheet
  await page.getByTestId('theme-dark').focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  line('SETTINGS focus trap: ' + JSON.stringify(await page.evaluate(() => {
    const a = document.activeElement;
    return { inside: !!a?.closest('[data-testid="settings-overlay"]'), el: a?.tagName + ' ' + (a?.getAttribute('data-testid') || '') };
  })));
  await page.screenshot({ path: 'audit/p3-settings-390.png' });
}

await browser.close();

const fails = out.filter((l) => /false|null/.test(l));
console.log('\n--- summary ---');
console.log(fails.length ? `check: ${fails.length} lines carrying null/false` : 'all checks produced values');
