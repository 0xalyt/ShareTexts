/** Landing story and audit regressions. Run with verify-browser.mjs handoff. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { get as getHTTP } from 'node:http';
import { get as getHTTPS } from 'node:https';
import { launchBrowser, clickStable } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const browser = await launchBrowser();
const states = ['open', 'pair', 'text', 'file', 'save'];
const check = (name, condition) => { assert.ok(condition, name); console.log(`PASS ${name}`); };
const policy = (headers = {}) => new Promise((resolve, reject) => {
  const get = BASE.startsWith('https:') ? getHTTPS : getHTTP;
  get(BASE, { headers }, response => {
    response.resume();
    resolve(response.headers['content-security-policy'] || '');
  }).on('error', reject);
});
mkdirSync('audit/tmp', { recursive: true });
try {
  const external = await policy({ Host: 'sharetexts.online' });
  check('public-origin CSP still requires HTTPS', external.includes('upgrade-insecure-requests'));
  const proxied = await policy({ 'X-Forwarded-Proto': 'https' });
  check('proxied requests retain the HTTPS directive', proxied.includes('upgrade-insecure-requests'));
  const local = await policy();
  check('loopback HTTP does not force HTTPS', !local.includes('upgrade-insecure-requests'));
  const directives = value => value.split(';').filter(s => s !== 'upgrade-insecure-requests').sort().join(';');
  check('loopback retains every other CSP directive', directives(local) === directives(external));

  for (const locale of ['en', 'es', 'ar']) {
    for (const width of [320, 390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript((lang) => localStorage.setItem('sharetext.locale', lang), locale);
      const page = await ctx.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const demo = page.getByTestId('hero-demo');
      await demo.waitFor();
      await demo.scrollIntoViewIfNeeded();
      const heights = [];
      for (const [i, state] of states.entries()) {
        await demo.locator('.handoff-steps button').nth(i).click();
        assert.equal(await demo.getAttribute('data-state'), state);
        assert.equal(await demo.locator('.handoff-copy > [aria-hidden="false"]').count(), 1);
        heights.push((await demo.boundingBox()).height);
        const facts = await demo.evaluate(el => {
          const r = el.getBoundingClientRect();
          return {
            clipped: [...el.querySelectorAll('button')].some(b => { const br = b.getBoundingClientRect(); return br.left < r.left - 1 || br.right > r.right + 1 || br.width < 40 || br.height < 40; }),
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        check(`${locale}/${width}/${state}: controls fit and remain tappable`, !facts.clipped && !facts.overflow);
      }
      check(`${locale}/${width}: no layout jump between captions`, Math.max(...heights) - Math.min(...heights) < 2);
      if (locale === 'en') {
        await demo.locator('.handoff-steps button').nth(2).click();
        await page.locator('h1').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `audit/tmp/handoff-${width}.png`, fullPage: false });
      } else {
        check(`${locale}/${width}: headline is localized`, !(await page.locator('h1').innerText()).includes('Share'));
      }
      check(`${locale}/${width}: no runtime errors`, errors.length === 0);
      await ctx.close();
    }
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const demo = page.getByTestId('hero-demo');
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3600);
  check('reduced motion does not autoplay', await demo.getAttribute('data-state') === 'open');
  await demo.getByRole('button', { name: 'Play demo', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-demo"]')?.getAttribute('data-state') === 'pair');
  await demo.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.waitForTimeout(3600);
  check('manual play is available, and pause holds the story', await demo.getAttribute('data-state') === 'pair');

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('Device name');
  await page.getByRole('option', { name: /Device name/i }).click();
  const name = page.getByTestId('settings-device-input');
  await name.waitFor();
  await page.waitForTimeout(200);
  check('device name command opens and focuses editing', await name.evaluate(el => el === document.activeElement));
  await name.fill('My test laptop');
  await name.press('Enter');
  assert.equal(await page.getByTestId('settings-device-name').innerText(), 'My test laptop');
  const toggle = page.getByTestId('settings-no-glass');
  const before = await toggle.getAttribute('aria-checked');
  await toggle.focus();
  await page.keyboard.press('Space');
  check('shared settings switch works from the keyboard', await toggle.getAttribute('aria-checked') !== before);
  const bounds = await toggle.evaluate(el => {
    const track = el.firstElementChild.getBoundingClientRect();
    const thumb = el.firstElementChild.firstElementChild.getBoundingClientRect();
    return thumb.left >= track.left && thumb.right <= track.right && thumb.top >= track.top && thumb.bottom <= track.bottom;
  });
  check('settings thumb stays within its track', bounds);
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('space');
  await page.getByRole('option', { name: /Create space/i }).click();
  const duration = page.getByTestId('space-create-duration');
  await duration.waitFor();
  check('expiry is visible without optional settings', await duration.isVisible() && !(await page.getByTestId('space-create-optional').getAttribute('open')));
  const day = duration.locator('input[value="86400000"]');
  check('default expiry is selected', await day.isChecked());
  await day.focus();
  await page.keyboard.press('ArrowRight');
  check('expiry uses native keyboard radio navigation', !(await day.isChecked()));
  await ctx.close();

  const phone = await browser.newContext({ viewport: { width: 320, height: 720 }, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  await p.goto(BASE);
  const action = await p.getByTestId('home-receive').boundingBox();
  check('mobile sharing action is visible before scrolling', action && action.y + action.height <= 720);
  await clickStable(p, p.getByTestId('home-receive'));
  const inputs = p.getByTestId('join-code-input').locator('input');
  await inputs.last().waitFor();
  const fits = await inputs.evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 0; }));
  check('all six receive digits fit at 320px', fits && await inputs.count() === 6);
  await phone.close();
} finally {
  await browser.close();
}
console.log('\n[verify-handoff] all checks passed');
