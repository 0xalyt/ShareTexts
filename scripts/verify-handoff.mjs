/** Landing story and audit regressions. Run with verify-browser.mjs handoff. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { get as getHTTP } from 'node:http';
import { get as getHTTPS } from 'node:https';
import { launchBrowser, clickStable, resolveEngine, gotoPage } from './lib.mjs';
import jsQR from 'jsqr';
import { browserDiagnostics } from './browser-diagnostics.mjs';
import { verifyHeroPoster } from './verify-hero-poster.mjs';
import { verifyLandingActivity } from './verify-landing-activity.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const browser = await launchBrowser();
const diagnostics = browserDiagnostics(browser, 'handoff');
const check = (name, condition) => { assert.ok(condition, name); console.log(`PASS ${name}`); };
async function decodeWebsiteQr(page) {
  const pixels = await page.locator('.landing-browser-qr svg').evaluate(async svg => {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 288;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, 288, 288);
    return Array.from(context.getImageData(0, 0, 288, 288).data);
  });
  return jsQR(Uint8ClampedArray.from(pixels), 288, 288)?.data;
}
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

  await verifyHeroPoster(browser, BASE);
  await verifyLandingActivity(browser, BASE);

  // Isolate capabilities from service-worker caching and the live worker's CORS.
  const noRtc = await browser.newContext({ serviceWorkers: 'block' });
  await noRtc.route('**/stats', route => route.fulfill({
    json: { users: 0, roomsCreated: 0 },
    headers: { 'access-control-allow-origin': '*' },
  }));
  await noRtc.route('**/api/event?*', route => route.fulfill({
    status: 204,
    headers: { 'access-control-allow-origin': '*' },
  }));
  await noRtc.addInitScript(() => {
    for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
      Object.defineProperty(window, key, { value: undefined, configurable: true });
    }
    localStorage.setItem('sharetext.locale', 'en');
  });
  const reader = await noRtc.newPage();
  reader.setDefaultTimeout(10_000);
  const readingErrors = [];
  reader.on('pageerror', error => readingErrors.push(error.message));
  for (const path of ['/about', '/docs', '/privacy', '/terms']) {
    await reader.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await reader.getByTestId('site-footer').waitFor();
    check(`${path}: reading needs no WebRTC`, await reader.locator('main h1').count() === 1 && (await reader.locator('main').innerText()).length > 100);
  }
  await reader.goto(BASE, { waitUntil: 'domcontentloaded' });
  await reader.getByRole('heading', { name: "Your browser can't make device-to-device connections", exact: true }).waitFor();
  check('unsupported transfer browsers still get an honest explanation', await reader.getByTestId('home-send').count() === 0);
  assert.deepEqual(readingErrors, [], 'reading without WebRTC has no runtime errors');
  await noRtc.close();

  const englishHeadlines = new Map();
  for (const locale of ['en', 'es', 'ar']) {
    for (const width of [320, 360, 390, 1440]) {
      const ctx = await diagnostics.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript((lang) => localStorage.setItem('sharetext.locale', lang), locale);
      const page = await ctx.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await gotoPage(page, BASE, { waitUntil: 'domcontentloaded' });
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
      // Observe the real built/dev HTML and mounted player, not two copies of
      // an expected version string. A stale or duplicate preload wastes the
      // first high-priority image request even when playback itself works.
      const poster = await demo.evaluate(el => ({
        displayed: el.querySelector('video')?.poster,
        preloads: [...document.querySelectorAll('link[rel~="preload"][as="image"]')]
          .filter(link => new URL(link.href).pathname.startsWith('/film/'))
          .map(link => ({ href: link.href, priority: link.getAttribute('fetchpriority') })),
      }));
      check(`${locale}/${width}: exactly one high-priority preload matches the player poster`,
        Boolean(poster.displayed) && poster.preloads.length === 1 &&
        poster.preloads[0].href === poster.displayed && poster.preloads[0].priority === 'high');
      check(`${locale}/${width}: the film retains its hidden localized description without a visible footer`,
        await media.getAttribute('aria-describedby') === await demo.locator('figcaption.sr-only').getAttribute('id') &&
        (await demo.locator('figcaption.sr-only').innerText()).length > 12 &&
        await demo.locator('a').count() === 0);
      const facts = await demo.evaluate(el => {
        const r = el.getBoundingClientRect();
        const picture = el.querySelector('.hero-film-picture').getBoundingClientRect();
        return {
          // Firefox rounds adjacent DOMRects independently at fractional aspect
          // ratios (a measured 0.000015px overlap at 390px). Ignore only that
          // sub-layout-unit noise; preserve the actual 44/48px target contract.
          clipped: [...el.querySelectorAll('button')].some(b => { const br = b.getBoundingClientRect(); const target = innerWidth < 768 ? 44 : 48; return br.left < r.left - 1 || br.right > r.right + 1 || br.top < picture.bottom - .05 || br.bottom > r.bottom + 1 || br.width < target || br.height < target; }),
          framing: Math.abs(picture.width / picture.height - (innerWidth <= 639 ? 4 / 3 : 16 / 9)) < .02 &&
            el.querySelector('video').poster.includes('-mobile-') === (innerWidth <= 639),
          bare: getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' &&
            parseFloat(getComputedStyle(el).paddingLeft) === 0 &&
            Math.abs(picture.left - r.left) <= 1.1 && Math.abs(picture.right - r.right) <= 1.1,
          joined: el.querySelector('.hero-film-play').getBoundingClientRect().width >= r.width - 4 &&
            parseFloat(getComputedStyle(el.querySelector('.hero-film-controls')).marginTop) === 0,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      check(`${locale}/${width}: the film has no extra backdrop and keeps an attached playback bar below its intact picture`, facts.framing && facts.bare && facts.joined && !facts.clipped && !facts.overflow);
      const proof = page.locator('.landing-proof');
      await proof.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.landing-proof-screen img')].filter(img => getComputedStyle(img).display !== 'none').every(img => img.complete && img.naturalWidth > 0));
      check(`${locale}/${width}: three real product screens explain the same linear handoff`,
        await proof.locator('li').count() === 3 && await proof.locator('button').count() === 0 &&
        await proof.locator('h3').count() === 3);
      check(`${locale}/${width}: the hero has only Send and Receive; alternatives follow the proof`,
        await page.locator('.landing-intro .landing-actions button').count() === 2 &&
        await page.locator('.landing-intro [data-testid="intent-input"], .landing-intro [data-testid="home-rows"]').count() === 0 &&
        await page.locator('.landing-more').evaluate(el => Boolean(document.querySelector('.landing-proof').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)));
      const browsers = page.locator('.landing-browsers');
      const handoff = page.locator('.landing-browser-utility');
      const copyAddress = page.getByTestId('landing-copy-address');
      const defaultCopyLabel = await copyAddress.innerText();
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedWebsite = value; } } }));
      await copyAddress.click();
      await page.waitForFunction(() => Boolean(window.__copiedWebsite));
      check(`${locale}/${width}: copying the website uses the real origin without room credentials`, await page.evaluate(() => window.__copiedWebsite) === new URL(BASE).origin && await copyAddress.innerText() !== defaultCopyLabel);
      const successFeedback = await handoff.getByRole('status').innerText();
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('permission denied'); }; });
      await copyAddress.click();
      check(`${locale}/${width}: clipboard denial never reports success and leaves a fallback`, await copyAddress.innerText() === defaultCopyLabel && (await handoff.getByRole('status').innerText()).length > 12 && await handoff.getByRole('status').innerText() !== successFeedback);
      const websiteQr = page.getByTestId('landing-website-qr');
      if (width < 768) {
        const closedQrLabel = await websiteQr.innerText();
        await websiteQr.click();
        await handoff.getByTestId('qr-art').waitFor();
        check(`${locale}/${width}: the website QR has a named Hide action`, await websiteQr.getAttribute('aria-expanded') === 'true' && await websiteQr.innerText() !== closedQrLabel);
        if (locale === 'en' && width === 320) check('phone QR decodes to the homepage, not a fake room', await decodeWebsiteQr(page) === new URL(BASE).origin);
        await websiteQr.focus();
        await page.keyboard.press('Escape');
        check(`${locale}/${width}: Escape closes QR and restores focus`, await websiteQr.getAttribute('aria-expanded') === 'false' && await websiteQr.evaluate(el => el === document.activeElement));
      } else {
        check(`${locale}/${width}: desktop QR is visible without a click`, await handoff.getByTestId('qr-art').isVisible() && !await websiteQr.isVisible());
        if (locale === 'en') check('desktop QR opens this website without room credentials', await decodeWebsiteQr(page) === new URL(BASE).origin);
      }
      // The proof now precedes this lazy-loaded strip. Scroll it into view
      // before checking decoded images; Firefox does not preload this far down.
      await browsers.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.landing-browser-list:first-child img')].every(img => img.complete && img.naturalWidth > 0));
      check(`${locale}/${width}: the logo-only browser strip stays inside the viewport`, await browsers.locator('.landing-browser-list:not([aria-hidden]) img[alt]').count() === 8 && await browsers.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const logos = [...el.querySelectorAll('.landing-browser-list:first-child img')];
        return bounds.left >= 0 && bounds.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth &&
          logos.every(img => img.complete && img.naturalWidth > 0 && img.alt && getComputedStyle(img).filter.includes('grayscale(1)')) &&
          [...el.querySelectorAll('.landing-browser-list')].every(list => list.textContent.trim() === '');
      }));
      if (locale === 'en') {
        englishHeadlines.set(width, await page.locator('h1').textContent());
        await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
        check(`${width}: the complete headline is still, medium-weight and fits`, await page.locator('h1').evaluate(el => {
          const bounds = el.getBoundingClientRect();
          return el.textContent.trim() === 'Send anything to your other device.' && getComputedStyle(el).fontWeight === '500' &&
            !el.querySelector('.st-word-gradient') && bounds.left >= 0 && bounds.right <= innerWidth;
        }));
        await page.locator('h1').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `audit/tmp/handoff-${width}.png`, fullPage: false });
        await page.getByTestId('home-space').click();
        await page.getByTestId('space-sheet-create').click();
        await page.getByTestId('space-create-duration').waitFor();
        check(`${width}: the quiet alternatives section opens real space creation`, await page.getByTestId('space-create-duration').isVisible());
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
        check(`${locale}/${width}: draft locale falls back to the reviewed English headline`,
          await page.locator('h1').textContent() === englishHeadlines.get(width));
        check(`${locale}/${width}: fallback has English language and writing direction`,
          await page.locator('html').getAttribute('lang') === 'en' &&
          await page.locator('html').getAttribute('dir') === 'ltr');
      }
      if (width >= 768) {
        const languagePopup = page.locator('.landing-nav button[aria-haspopup="listbox"]');
        await clickStable(page, languagePopup);
        await page.evaluate(() => {
          const data = new DataTransfer();
          data.setData('text/plain', 'Keep paste inside this popup');
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        });
        check(`${locale}/${width}: paste respects the visible desktop language listbox`,
          await languagePopup.getAttribute('aria-expanded') === 'true' &&
          !await page.evaluate(() => Boolean(window.__stPendingIntentText || window.__stHomeDropFiles)));
        await page.keyboard.press('Escape');
      }
      const language = page.getByTestId('landing-footer').locator('button[aria-haspopup="dialog"]');
      check(`${locale}/${width}: footer names the current language`, !!(await language.innerText()).trim());
      await clickStable(page, language);
      await page.getByTestId('language-sheet').waitFor({ state: 'visible' });
      const languageFits = await page.getByTestId('language-sheet').evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      });
      check(`${locale}/${width}: the footer language chooser stays in the viewport`, languageFits);
      // LanguageMenu owns its open state outside the parent's sheet flags.
      // A body shortcut must respect that dialog instead of opening Send.
      await page.evaluate(() => {
        const data = new DataTransfer();
        data.setData('text/plain', 'Keep this paste inside the language sheet');
        document.activeElement.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      });
      check(`${locale}/${width}: paste cannot escape a nested language sheet`,
        await page.getByTestId('language-sheet').isVisible() && await page.getByTestId('home-send').count() === 1 &&
        !await page.evaluate(() => Boolean(window.__stPendingIntentText || window.__stHomeDropFiles)));
      await page.keyboard.press('Escape');
      await page.getByTestId('language-sheet').waitFor({ state: 'hidden' });
      // Focus restoration is deferred one frame; a reduced-motion sheet can
      // disappear before that frame. Keep the focus assertion, not the race.
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="landing-footer"] button[aria-haspopup="dialog"]') === document.activeElement,
      null, { timeout: 2000 });
      check(`${locale}/${width}: Escape restores focus to the footer language`, await language.evaluate(el => el === document.activeElement));
      check(`${locale}/${width}: no runtime errors`, errors.length === 0);
      await ctx.close();
    }
  }

  // Theme is a media contract too. In particular, a saved override must not
  // preload the OS's opposite poster. Decode real artwork so a white cut
  // mislabeled "dark" cannot pass just because its filename looks right.
  for (const width of [390, 1440]) {
    for (const [os, saved, expected] of [
      ['light', null, 'light'], ['dark', null, 'dark'],
      ['light', 'dark', 'dark'], ['dark', 'light', 'light'],
    ]) {
      const ctx = await diagnostics.newContext({ viewport: { width, height: 900 }, colorScheme: os, reducedMotion: 'reduce' });
      if (saved) await ctx.addInitScript(theme => localStorage.setItem('sharetext.theme', theme), saved);
      const page = await ctx.newPage();
      if (resolveEngine().name === 'firefox') {
        // Firefox drops context-level color emulation on its first real
        // navigation. Prime plain text (not Firefox's JSON viewer), then establish the OS before
        // the first landing visit; no app/poster has been fetched yet.
        await gotoPage(page, new URL('/robots.txt', BASE).href, { waitUntil: 'domcontentloaded' });
        await page.emulateMedia({ colorScheme: os, reducedMotion: 'reduce' });
      }
      const requests = [];
      page.on('request', request => { if (/\/film\/.*-poster\./.test(request.url())) requests.push(request.url()); });
      await gotoPage(page, BASE, { waitUntil: 'domcontentloaded' });
      const demo = page.getByTestId('hero-demo');
      await demo.waitFor();
      const inspect = () => page.evaluate(() => {
        const video = document.querySelector('[data-testid="hero-demo"] video');
        const links = [...document.querySelectorAll('link[rel~="preload"][as="image"]')]
          .filter(link => new URL(link.href).pathname.startsWith('/film/'));
        return { dark: document.documentElement.classList.contains('dark'), poster: video.poster,
          preload: links.length === 1 ? links[0].href : '', priority: links[0]?.getAttribute('fetchpriority') };
      });
      const state = await inspect();
      const name = `${width}px OS=${os} saved=${saved || 'system'}`;
      check(`${name}: OS precondition is real`, await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches) === (os === 'dark'));
      check(`${name}: the shown theme wins`, state.dark === (expected === 'dark'));
      check(`${name}: poster theme marker matches without pinning a film version`, new URL(state.poster).pathname.includes('-dark') === state.dark);
      check(`${name}: exactly one matching high-priority poster`, state.preload === state.poster && state.priority === 'high');
      check(`${name}: no opposite poster requested at boot`, requests.length > 0 && requests.every(url => url === state.poster));
      const brightness = await page.evaluate(async () => {
        const image = new Image(); image.src = document.querySelector('[data-testid="hero-demo"] video').poster;
        let timer;
        try {
          await Promise.race([image.decode(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Poster decode timed out after 10000ms')), 10000);
          })]);
        } finally { clearTimeout(timer); }
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 9;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 16, 9);
        return [[0, 0], [15, 0], [0, 8], [15, 8]].reduce((sum, [x, y]) => {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          return sum + (pixel[0] + pixel[1] + pixel[2]) / 12;
        }, 0);
      });
      check(`${name}: the real poster belongs to its theme (${brightness.toFixed(1)}/255)`, expected === 'dark' ? brightness < 55 : brightness > 200);
      if (!saved) {
        await page.emulateMedia({ colorScheme: os === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
        await page.waitForFunction(({ wasDark, oldPoster }) => document.documentElement.classList.contains('dark') !== wasDark &&
          document.querySelector('[data-testid="hero-demo"] video').poster !== oldPoster, { wasDark: state.dark, oldPoster: state.poster });
        const changed = await inspect();
        check(`${name}: live OS changes keep poster/preload together`, changed.preload === changed.poster && changed.priority === 'high');
      }
      await demo.locator('.hero-film-play').click();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="hero-demo"] video').getAttribute('src')));
      const assets = await demo.evaluate(el => ({ movie: el.querySelector('video').src, poster: el.querySelector('video').poster }));
      check(`${name}: movie and still use the same cut`, assets.movie === assets.poster.replace('-poster.jpg', '.mp4'));
      // Full exports remain downloadable assets, not landing controls.
      for (const url of [assets.movie, assets.poster.replace(/(?:-mobile)?-poster\.jpg$/, '-full.mp4')]) {
        const file = await page.request.get(url, { headers: { Range: 'bytes=0-63' } });
        check(`${name}: the encoded movie exists (${new URL(url).pathname})`, file.ok() && /video\/mp4/.test(file.headers()['content-type'] || ''));
      }
      await ctx.close();
    }
  }

  const laptop = await diagnostics.newContext({ viewport: { width: 1024, height: 700 }, reducedMotion: 'reduce' });
  const shortPage = await laptop.newPage();
  await gotoPage(shortPage, BASE, { waitUntil: 'domcontentloaded' });
  await shortPage.getByTestId('hero-demo').waitFor();
  await shortPage.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
  const shortLayout = await shortPage.evaluate(() => {
    const send = document.querySelector('[data-testid="home-send"]').getBoundingClientRect();
    const demo = document.querySelector('[data-testid="hero-demo"] .hero-film-picture').getBoundingClientRect();
    const shortcut = document.querySelector('[data-testid="intent-input"]').getBoundingClientRect();
    const heading = document.querySelector('.landing-heading').getBoundingClientRect();
    return heading.bottom <= send.top && send.bottom <= demo.top && demo.bottom <= shortcut.top && send.top >= 0 && send.bottom <= innerHeight &&
      demo.left >= 0 && demo.right <= innerWidth && Math.abs(demo.width / demo.height - 16 / 9) < .02;
  });
  check('short laptop keeps actions in reach and the full-width film after the heading/actions', shortLayout);
  await shortPage.screenshot({ path: 'audit/tmp/landing-1024-700.png' });
  await laptop.close();

  // A command's painted label must agree with its accessible name on the
  // first frame after typing, not disappear through an exit/enter sequence.
  for (const theme of ['light', 'dark']) {
    const typing = await diagnostics.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'no-preference' });
    await typing.addInitScript(value => localStorage.setItem('sharetext.theme', value), theme);
    const entry = await typing.newPage();
    await gotoPage(entry, BASE, { waitUntil: 'domcontentloaded' });
    await entry.getByTestId('intent-input').waitFor();
    await entry.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
    const input = entry.getByTestId('intent-input');
    const button = entry.getByTestId('intent-submit');
    check(`${theme}: browser repeats cover the entire desktop lane at the loop boundary`, await entry.locator('.landing-browser-marquee').evaluate(lane => {
      const track = lane.firstElementChild;
      const cycle = track.firstElementChild.getBoundingClientRect().width;
      return cycle > 0 && track.getBoundingClientRect().width - cycle >= lane.getBoundingClientRect().width;
    }));
    for (const [value, label] of [['', 'Create room'], ['A note', 'Send this'], ['482716', 'Join room'], ['', 'Create room'], ['482', 'Send this'], ['482716', 'Join room'], ['', 'Create room']]) {
      await input.fill(value);
      for (const hover of [false, true]) {
        if (hover) await button.hover();
        else await entry.mouse.move(0, 0);
        const readable = await button.evaluate(async (el, expected) => {
          // Decorative font symbols are spans too. Measure the action label,
          // not the mobile-only, aria-hidden glyph that precedes it.
          const text = el.querySelector('[data-intent-label]');
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
    const dark = await diagnostics.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await dark.addInitScript(() => localStorage.setItem('sharetext.theme', 'dark'));
    const darkPage = await dark.newPage();
    await gotoPage(darkPage, BASE, { waitUntil: 'domcontentloaded' });
    await darkPage.getByTestId('hero-demo').waitFor();
    await darkPage.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
    check(`${width}: dark landing retains its theme without overflow`, await darkPage.evaluate(() =>
      document.documentElement.classList.contains('dark') && document.documentElement.scrollWidth <= innerWidth
    ));
    await darkPage.screenshot({ path: `audit/tmp/landing-dark-${width}.png`, fullPage: false });
    await dark.close();
  }

  const ctx = await diagnostics.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await gotoPage(page, BASE, { waitUntil: 'domcontentloaded' });
  const demo = page.getByTestId('hero-demo');
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3600);
  check('reduced motion does not autoplay', await demo.locator('video').evaluate(el => el.paused && !el.getAttribute('src')));
  // Reproduce a returning visitor's complete MP4 cache entry. WebKit asks for
  // byte ranges after reading metadata; a cached 200 must not answer that seek.
  // The local wrapper uses Vite (which does not auto-register the worker).
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
  const range = await demo.locator('video').evaluate(async el => {
    const movie = el.poster.replace(/-poster\.jpg$/, '.mp4');
    const full = await fetch(movie);
    if (!full.ok) throw new Error(`Film fixture returned ${full.status}`);
    const expected = new Uint8Array(await full.clone().arrayBuffer()).slice(32, 64);
    const fixture = 'film-range-regression';
    try {
      const cache = await caches.open(fixture);
      await cache.put(movie, full);
      const partial = await fetch(movie, { headers: { Range: 'bytes=32-63' } });
      const bytes = new Uint8Array(await partial.arrayBuffer());
      return {
        status: partial.status, contentRange: partial.headers.get('content-range'),
        matches: bytes.length === 32 && bytes.every((byte, i) => byte === expected[i]),
      };
    } finally { await caches.delete(fixture); }
  });
  check('cached films do not replace HTTP byte ranges with a whole 200 response',
    range.status === 206 && /^bytes 32-63\/\d+$/.test(range.contentRange || '') && range.matches);
  await demo.getByRole('button', { name: 'Play film', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="hero-demo"] video')?.currentTime > 0.2);
  const filmHeight = (await demo.boundingBox()).height;
  await demo.getByRole('button', { name: 'Pause film', exact: true }).click();
  const pausedAt = await demo.locator('video').evaluate(el => el.currentTime);
  await page.waitForTimeout(1200);
  check('manual play is available, and pause holds the film', await demo.locator('video').evaluate((el, time) => el.paused && Math.abs(el.currentTime - time) < 0.1, pausedAt));
  check('decoding the film causes no layout shift', Math.abs((await demo.boundingBox()).height - filmHeight) < 2);

  // Both encodes tell the same story at the same time. Resizing must not
  // restart it, override Pause (even with autoplay now permitted), or preload
  // the wrong composition. 1024 also swaps the entire landing layout.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [639, 640, 1023, 1024, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(({ phone, at }) => {
      const video = document.querySelector('[data-testid="hero-demo"] video');
      const preload = [...document.querySelectorAll('link[rel~="preload"][as="image"]')]
        .find(link => new URL(link.href).pathname.startsWith('/film/'));
      return video.poster.includes('-mobile-') === phone && preload?.href === video.poster &&
        video.readyState >= 2 && Math.abs(video.videoWidth / video.videoHeight - (phone ? 4 / 3 : 16 / 9)) < .01 &&
        video.paused && Math.abs(video.currentTime - at) < .12;
    }, { phone: width <= 639, at: pausedAt });
    check(`${width}: framing changes preserve the paused phase and matching preload`, true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });

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
  const expiry = duration.getByRole('combobox');
  check('default expiry is selected', await expiry.inputValue() === '86400000');
  await expiry.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  check('expiry uses native keyboard selection', await expiry.inputValue() === '21600000');
  const firstClosingTime = await duration.locator('[aria-live="polite"]').innerText();
  await expiry.selectOption('604800000');
  check('every lifetime remains available with its closing time',
    await expiry.locator('option').count() === 7 &&
    await expiry.inputValue() === '604800000' &&
    await duration.locator('[aria-live="polite"]').innerText() !== firstClosingTime);
  await ctx.close();

  const phone = await diagnostics.newContext({ viewport: { width: 320, height: 720 }, reducedMotion: 'reduce' });
  const p = await phone.newPage();
  await gotoPage(p, BASE, { waitUntil: 'domcontentloaded' });
  await p.getByTestId('home-receive').waitFor();
  await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
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
} catch (error) {
  await diagnostics.captureFailure(error).catch(e => console.error('Failure diagnostics:', e));
  throw error;
} finally {
  await browser.close();
}
console.log('\n[verify-handoff] all checks passed');
