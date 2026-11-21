/** Landing story and audit regressions. Run with verify-browser.mjs handoff. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { get as getHTTP } from 'node:http';
import { get as getHTTPS } from 'node:https';
import { launchBrowser, clickStable } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const browser = await launchBrowser();
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
      if (width < 1024) {
        check(`${locale}/${width}: sharing actions precede the demo in reading order`, await demo.evaluate(el =>
          ['home-send', 'home-receive'].every(id => Boolean(
            document.querySelector(`[data-testid="${id}"]`)?.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
          ))
        ));
      }
      await demo.scrollIntoViewIfNeeded();
      // The five-step DOM illustration was deliberately replaced by an
      // encoded launch film. Keep the geometry, reading-order and preference
      // guarantees, but verify the actual media contract rather than steps.
      assert.equal(await demo.getAttribute('data-state'), 'film');
      const media = demo.locator('video');
      check(`${locale}/${width}: reduced motion does not request the film`, await media.getAttribute('src') === null);
      check(`${locale}/${width}: a meaningful still is available`, (await media.getAttribute('poster')).endsWith('-poster.jpg'));
      check(`${locale}/${width}: the film has a localized text alternative`, (await demo.locator('figcaption p').innerText()).length > 12);
      const facts = await demo.evaluate(el => {
        const r = el.getBoundingClientRect();
        return {
          clipped: [...el.querySelectorAll('button')].some(b => { const br = b.getBoundingClientRect(); return br.left < r.left - 1 || br.right > r.right + 1 || br.width < 48 || br.height < 48; }),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      check(`${locale}/${width}: film controls fit and remain tappable`, !facts.clipped && !facts.overflow);
      const guidePair = page.getByTestId('landing-guide-pair');
      const guideSend = page.getByTestId('landing-guide-send');
      check(`${locale}/${width}: handoff guide starts on Pair`, await guidePair.getAttribute('aria-pressed') === 'true' && await guideSend.getAttribute('aria-pressed') === 'false');
      const guideBounds = await page.locator('.landing-guide-frame').boundingBox();
      await guideSend.click();
      check(`${locale}/${width}: selecting Send changes only the illustrative example`, await guideSend.getAttribute('aria-pressed') === 'true' && await page.locator('.landing-guide-layer[data-active="true"] .landing-transfer-detail').count() === 1 && await page.getByTestId('home-send').count() === 1);
      const guideAfter = await page.locator('.landing-guide-frame').boundingBox();
      check(`${locale}/${width}: example switches without resizing or clipping`, Math.abs(guideBounds.width - guideAfter.width) < 1 && Math.abs(guideBounds.height - guideAfter.height) < 1 && guideAfter.x >= 0 && guideAfter.x + guideAfter.width <= width);
      check(`${locale}/${width}: reduced-motion example switches do not animate`, await page.locator('.landing-guide-layer[data-active="true"]').evaluate(el => getComputedStyle(el).transitionDuration === '0s' && getComputedStyle(el).opacity === '1'));
      await guidePair.focus();
      await page.keyboard.press('Space');
      check(`${locale}/${width}: keyboard selects Pair without motion`, await guidePair.getAttribute('aria-pressed') === 'true' && await page.locator('.landing-guide-example').getAttribute('data-animate') === 'false' && await page.locator('.landing-guide-layer[data-active="true"] .landing-pair-detail').count() === 1);
      if (locale === 'en') {
        await page.evaluate(() => document.fonts.ready);
        const longestHeadingFits = await page.locator('h1').evaluate(el => {
          const copy = el.cloneNode(true);
          copy.style.cssText = `position:absolute;visibility:hidden;width:${el.getBoundingClientRect().width}px`;
          el.after(copy);
          const word = copy.querySelector('.st-word-gradient');
          word.textContent = 'Screenshots';
          word.parentElement.style.width = 'auto';
          const line = word.parentElement.parentElement.getBoundingClientRect();
          const fits = line.width <= el.getBoundingClientRect().width + 1;
          copy.remove();
          return fits;
        });
        check(`${width}: the longest rotating headline stays inside its column`, longestHeadingFits);
        await page.locator('h1').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `audit/tmp/handoff-${width}.png`, fullPage: false });
        const later = page.locator('.landing-story-later');
        await later.getByRole('button').click();
        await page.getByTestId('space-create-duration').waitFor();
        check(`${width}: the later-sharing story opens real space creation`, await page.getByTestId('space-create-duration').isVisible());
        await page.keyboard.press('Escape');
        await page.getByTestId('space-create-duration').waitFor({ state: 'hidden' });
        if (width === 1440) {
          await page.locator('.landing-story').evaluate(el => {
            el.scrollIntoView({ block: 'start' });
            let scroller = el.parentElement;
            while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
            scroller?.scrollBy(0, -96);
          });
          await page.screenshot({ path: 'audit/tmp/landing-story-1440.png', fullPage: false });
        }
      } else {
        check(`${locale}/${width}: headline is localized`, !(await page.locator('h1').innerText()).includes('Share'));
      }
      check(`${locale}/${width}: no runtime errors`, errors.length === 0);
      await ctx.close();
    }
  }

  const laptop = await browser.newContext({ viewport: { width: 1024, height: 700 }, reducedMotion: 'reduce' });
  const shortPage = await laptop.newPage();
  await shortPage.goto(BASE);
  await shortPage.getByTestId('hero-demo').waitFor();
  const shortLayout = await shortPage.evaluate(() => {
    const send = document.querySelector('[data-testid="home-send"]').getBoundingClientRect();
    const demo = document.querySelector('[data-testid="hero-demo"]').getBoundingClientRect();
    return send.top >= 0 && send.bottom <= innerHeight && demo.top >= 0 && demo.bottom <= innerHeight;
  });
  check('short laptop keeps sharing and the entire demo in the first viewport', shortLayout);
  await shortPage.screenshot({ path: 'audit/tmp/landing-1024-700.png' });
  await laptop.close();

  // A command's painted label must agree with its accessible name on the
  // first frame after typing, not disappear through an exit/enter sequence.
  for (const theme of ['light', 'dark']) {
    const typing = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'no-preference' });
    await typing.addInitScript(value => localStorage.setItem('sharetext.theme', value), theme);
    const entry = await typing.newPage();
    await entry.goto(BASE);
    const input = entry.getByTestId('intent-input');
    const button = entry.getByTestId('intent-submit');
    for (const [value, label] of [['', 'Create room'], ['A note', 'Send this'], ['482716', 'Join room'], ['', 'Create room'], ['482', 'Send this'], ['482716', 'Join room'], ['', 'Create room']]) {
      await input.fill(value);
      for (const hover of [false, true]) {
        if (hover) await button.hover();
        else await entry.mouse.move(0, 0);
        const readable = await button.evaluate(async (el, expected) => {
          const text = el.querySelector('span');
          if (!text || text.textContent.trim() !== expected || el.getAttribute('aria-label') !== expected) return false;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const paint = canvas.getContext('2d', { willReadFrequently: true });
          const rgba = color => {
            paint.clearRect(0, 0, 1, 1);
            paint.fillStyle = color;
            paint.fillRect(0, 0, 1, 1);
            return [...paint.getImageData(0, 0, 1, 1).data];
          };
          const over = (fg, bg) => fg.slice(0, 3).map((channel, i) => channel * fg[3] / 255 + bg[i] * (1 - fg[3] / 255));
          const luminance = rgb => rgb.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
          const chain = [];
          for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) chain.unshift(ancestor);
          for (let frame = 0; frame < 12; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const style = getComputedStyle(text);
            const box = text.getBoundingClientRect();
            const parent = el.getBoundingClientRect();
            const bg = chain.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
            const a = luminance(over(rgba(style.color), bg));
            const b = luminance(bg);
            const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            if (Number(style.opacity) < .99 || style.visibility !== 'visible' || box.width <= 0 || box.height <= 0 || box.left < parent.left || box.right > parent.right || contrast < 4.5) return { frame, contrast, opacity: style.opacity, visibility: style.visibility, text: box.toJSON(), button: parent.toJSON(), foreground: style.color, background: bg };
          }
          return true;
        }, label);
        if (readable !== true) console.error('Command paint failure:', readable);
        check(`${theme}/${hover ? 'hover' : 'rest'}: command label "${label}" stays painted, unclipped and ≥4.5:1`, readable === true);
      }
    }
    await typing.close();
  }

  for (const width of [390, 1440]) {
    const dark = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await dark.addInitScript(() => localStorage.setItem('sharetext.theme', 'dark'));
    const darkPage = await dark.newPage();
    await darkPage.goto(BASE);
    await darkPage.getByTestId('hero-demo').waitFor();
    check(`${width}: dark landing retains its theme without overflow`, await darkPage.evaluate(() =>
      document.documentElement.classList.contains('dark') && document.documentElement.scrollWidth <= innerWidth
    ));
    await darkPage.screenshot({ path: `audit/tmp/landing-dark-${width}.png`, fullPage: false });
    await dark.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const demo = page.getByTestId('hero-demo');
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3600);
  check('reduced motion does not autoplay', await demo.locator('video').evaluate(el => el.paused && !el.getAttribute('src')));
  await demo.getByRole('button', { name: 'Play film', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-demo"] video')?.currentTime > 0.2);
  const filmHeight = (await demo.boundingBox()).height;
  await demo.getByRole('button', { name: 'Pause film', exact: true }).click();
  const pausedAt = await demo.locator('video').evaluate(el => el.currentTime);
  await page.waitForTimeout(1200);
  check('manual play is available, and pause holds the film', await demo.locator('video').evaluate((el, time) => el.paused && Math.abs(el.currentTime - time) < 0.1, pausedAt));
  check('decoding the film causes no layout shift', Math.abs((await demo.boundingBox()).height - filmHeight) < 2);

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
  await p.getByTestId('home-send').focus();
  await p.keyboard.press('Tab');
  check('mobile Tab goes from Send to Receive', await p.getByTestId('home-receive').evaluate(el => el === document.activeElement));
  let reachedDemo = false;
  for (let i = 0; i < 15 && !reachedDemo; i++) {
    await p.keyboard.press('Tab');
    reachedDemo = await p.getByTestId('hero-demo').evaluate(el => el.contains(document.activeElement));
  }
  check('mobile Tab reaches demo controls after the sharing actions', reachedDemo);
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
