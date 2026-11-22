/** Offline product-film footage: two REAL ShareTexts clients / local Worker.
 * No fabricated chat state or mocked transfer transport. The camera renderer
 * edits these native UI recordings; only the final encoded film ships.
 * Start the app with VITE_SIGNALING_URL=http://localhost:8787 and a local Worker.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const THEME = process.env.FILM_THEME === 'dark' ? 'dark' : 'light';
const BASE = process.env.FILM_UI_BASE_URL || 'http://localhost:3044';
const OUT = path.resolve(`film/out/launch-v5-${THEME}`);
const FIXTURES = path.resolve('film/out/fixtures');
mkdirSync(OUT, { recursive: true });
const dimensions = { phone: [402, 774], laptop: [1008, 655] };
const metadata = { dimensions, frames: { phone: [], laptop: [] }, states: { phone: {}, laptop: {} }, actions: [], anchors: {}, duration: 16.8 };
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pages = {};
const MESSAGE = 'Look at this view.\nhttps://nasa.gov/earth';
let start = 0;
try {
  for (const actor of ['phone', 'laptop']) {
    const [width, height] = dimensions[actor];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, colorScheme: THEME, locale: 'en-US', acceptDownloads: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addInitScript(({ theme, name }) => {
      localStorage.setItem('sharetext.locale', 'en');
      localStorage.setItem('sharetext.theme', theme);
      localStorage.setItem('sharetext.deviceName', name);
    }, { theme: THEME, name: actor === 'phone' ? 'My phone' : 'My laptop' });
    const page = await context.newPage(); pages[actor] = page;
    page.on('pageerror', error => console.error(`[${actor}] ${error.message}`));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  }
  const source = pages.phone, receiver = pages.laptop;
  await source.getByTestId('home-send').click();
  const codeGroup = source.getByRole('group', { name: 'Pairing code' });
  await codeGroup.waitFor({ timeout: 30000 });
  const code = (await codeGroup.innerText()).replace(/\D/g, '');
  await receiver.getByTestId('home-receive').click();
  await receiver.getByTestId('join-code-input').locator('input').first().fill(code);
  await Promise.all(Object.values(pages).map(page => page.getByTestId('composer').waitFor({ timeout: 30000 })));
  // A real pre-roll exchange, then restore the real session. This is a room
  // already in use, so its first-transfer onboarding doesn't replay on camera.
  await receiver.locator('textarea').first().fill('Ready when you are.');
  await receiver.getByRole('button', { name: 'Send', exact: true }).click();
  await source.getByText('Ready when you are.', { exact: true }).waitFor();
  await Promise.all(Object.values(pages).map(async page => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('composer').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
  }));
  // Let the room's one-time connected toast complete before rolling.
  await new Promise(resolve => setTimeout(resolve, 3300));

  // Device-resolution checkpoints preserve native type and avoid overlapping
  // screenshots competing with the action whose outcome they must capture.
  start = Date.now() / 1000;
  for (const actor of ['phone', 'laptop']) mkdirSync(path.join(OUT, `native-${actor}`), { recursive: true });
  const at = async time => {
    const delay = (start + time) * 1000 - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  };
  // Editorial holds are keyed to VERIFIED DOM states, not a sparse recorder's
  // nearest wall-clock frame. This keeps light/dark cuts on the same outcome.
  const state = async (actor, kind) => {
    await pages[actor].waitForTimeout(280);
    const begin = Date.now() / 1000;
    const bytes = await pages[actor].screenshot({ type: 'jpeg', quality: 98, animations: 'allow', caret: 'hide' });
    const timestamp = (begin + Date.now() / 1000) / 2;
    const file = `native-${actor}/state-${kind}.jpg`;
    writeFileSync(path.join(OUT, file), bytes);
    metadata.frames[actor].push({ timestamp, file });
    metadata.states[actor][kind] = timestamp;
  };
  const row = (page, name) => page.locator('[class~="group/msg"]').filter({ hasText: name }).last();
  const anchor = async (actor, kind, locator) => {
    // Completing a video swaps the pending element for its playable element.
    // Resolve again after that real app commit, rather than keeping a handle
    // to the composer's disappearing preview.
    for (let attempt = 0; ; attempt++) {
      try { await locator.scrollIntoViewIfNeeded(); break; }
      catch (error) { if (attempt >= 4) throw error; await new Promise(resolve => setTimeout(resolve, 80)); }
    }
    const box = await locator.evaluate(element => {
      for (const node of [element, ...element.querySelectorAll('div')]) {
        const r = node.getBoundingClientRect(), style = getComputedStyle(node);
        if (r.width > 125 && r.height > 50 && parseFloat(style.borderTopLeftRadius) >= 12) {
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
    if (point.y < 0 || point.y > dimensions[actor][1]) throw new Error(`Offscreen ${actor}/${kind} anchor`);
    metadata.anchors[`${actor}-${kind}`] = point;
  };
  const click = async (actor, kind, locator) => {
    await locator.waitFor({ state: 'visible' });
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await locator.click();
    metadata.actions.push({ actor, kind, t: Date.now() / 1000 - start, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };
  await Promise.all(['phone', 'laptop'].map(actor => state(actor, 'initial')));
  await at(.85);
  await source.locator('textarea').first().fill(MESSAGE);
  await anchor('phone', 'composer', source.getByTestId('composer'));
  await state('phone', 'text-composed');
  await at(1.95);
  await click('phone', 'send-text', source.getByRole('button', { name: 'Send', exact: true }));
  await receiver.getByText('Look at this view.', { exact: false }).waitFor();
  // Let the real one-time transfer toast dismiss before another message can
  // cancel its timer. No CSS/DOM is hidden or substituted for the film.
  await source.waitForTimeout(5400);
  await receiver.getByText("That's it. It arrived.", { exact: true }).waitFor({ state: 'hidden' });
  await anchor('phone', 'text', row(source, 'Look at this view.'));
  await anchor('laptop', 'text', row(receiver, 'Look at this view.'));
  await state('phone', 'text-sent');
  await state('laptop', 'text-received');
  await at(3.0);
  await click('laptop', 'copy', row(receiver, 'Look at this view.').getByRole('button', { name: 'Copy message', exact: true }));
  await state('laptop', 'text-copied');

  await at(4.4);
  await click('phone', 'attach', source.getByTestId('add-attachment'));
  await at(4.7);
  const [fileChooser] = await Promise.all([
    source.waitForEvent('filechooser'),
    click('phone', 'choose-file', source.getByRole('menuitem', { name: 'Files', exact: true })),
  ]);
  await fileChooser.setFiles(path.join(FIXTURES, 'Earth photos.zip'));
  await at(Math.max(5.6, Date.now() / 1000 - start + 1));
  await state('phone', 'file-staged');
  await click('phone', 'send-files', source.getByRole('button', { name: 'Send', exact: true }));
  await row(receiver, 'Earth photos.zip').getByTestId('transfer-download').waitFor({ timeout: 15000 });
  await anchor('phone', 'file', row(source, 'Earth photos.zip'));
  await anchor('laptop', 'file', row(receiver, 'Earth photos.zip'));
  await state('phone', 'file-sent');
  await state('laptop', 'file-received');
  await at(6.2);
  const [download] = await Promise.all([
    receiver.waitForEvent('download'),
    click('laptop', 'save', row(receiver, 'Earth photos.zip').getByTestId('transfer-download')),
  ]);
  metadata.download = { filename: download.suggestedFilename() };
  await state('laptop', 'file-downloaded');
  await at(6.7);
  await source.locator('input[type=file]').last().setInputFiles(path.join(FIXTURES, 'Earth — NASA.jpg'));
  await at(6.9);
  await click('phone', 'send-photo', source.getByRole('button', { name: 'Send', exact: true }));
  await receiver.getByRole('button', { name: 'View Earth — NASA.jpg', exact: true }).waitFor();
  await anchor('laptop', 'photo', receiver.locator('[class~="group/msg"]').filter({ has: receiver.getByRole('button', { name: 'View Earth — NASA.jpg', exact: true }) }));
  await state('phone', 'photo-sent');
  await state('laptop', 'photo-received');
  // The photograph is visibly a separate, received item BEFORE opening it.
  await at(Date.now() / 1000 - start + 1.1);
  await at(7.2);
  await click('laptop', 'open-photo', receiver.getByRole('button', { name: 'View Earth — NASA.jpg', exact: true }));
  const photoOpenedAt = Date.now() / 1000 - start;
  await state('laptop', 'photo-open');
  await at(Math.max(8.6, photoOpenedAt + 1.1));
  await receiver.keyboard.press('Escape');
  await state('laptop', 'photo-closed');
  await at(9.0);
  await click('phone', 'attach-video', source.getByTestId('add-attachment'));
  await at(9.2);
  const [videoChooser] = await Promise.all([
    source.waitForEvent('filechooser'),
    click('phone', 'choose-video', source.getByRole('menuitem', { name: 'Video', exact: true })),
  ]);
  await videoChooser.setFiles(path.join(FIXTURES, 'Earth — NASA.mp4'));
  await at(Math.max(9.7, Date.now() / 1000 - start + 1));
  await state('phone', 'video-staged');
  await click('phone', 'send-video', source.getByRole('button', { name: 'Send', exact: true }));
  const video = receiver.locator('[class~="group/msg"] video').last();
  await video.waitFor({ timeout: 15000 });
  await video.evaluate(element => element.closest('[class~="group/msg"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await anchor('phone', 'video', source.locator('[class~="group/msg"] video').last());
  await anchor('laptop', 'video', video);
  await anchor('laptop', 'video-card', receiver.locator('[class~="group/msg"]').filter({ has: receiver.locator('video') }).last());
  await state('phone', 'video-sent');
  await state('laptop', 'video-received');
  await at(10.0);
  await click('laptop', 'play', video);
  await video.evaluate(async element => { if (element.paused) await element.play(); });
  const videoStartedAt = Date.now() / 1000 - start;
  await at(videoStartedAt + .35);
  await state('laptop', 'video-playing');
  let take = 0;
  while (Date.now() / 1000 - start < videoStartedAt + 4) await state('laptop', `playback-${take++}`);
  metadata.videoPlayback = await video.evaluate(element => ({ currentTime: element.currentTime, duration: element.duration, paused: element.paused }));
  if (metadata.videoPlayback.currentTime < 2) throw new Error('The received payload did not actually play');
  await state('phone', 'final');
  await state('laptop', 'final');
  for (const actor of ['phone', 'laptop']) {
    metadata.frames[actor] = metadata.frames[actor].map(({ timestamp, file }) => ({ t: timestamp - start, file })).sort((a, b) => a.t - b.t);
    metadata.states[actor] = Object.fromEntries(Object.entries(metadata.states[actor]).map(([kind, timestamp]) => [kind, timestamp - start]));
    if (!metadata.frames[actor].length) throw new Error(`No native ${actor} frames`);
    if (Math.abs(metadata.frames[actor][0].t) > 2) throw new Error('Screencast and edit clock disagree');
  }
  metadata.recordedAt = start;
  metadata.captureVersion = 4;
  writeFileSync(path.join(OUT, 'native-ui.json'), JSON.stringify(metadata));
  console.log(`Native ${THEME} footage: ${metadata.frames.phone.length} phone / ${metadata.frames.laptop.length} laptop frames`);
} finally {
  await browser.close();
}
