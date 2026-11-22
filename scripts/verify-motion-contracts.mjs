#!/usr/bin/env node
/** Isolated component regressions; no signaling/production service required.
 * Run: node scripts/verify-motion-contracts.mjs
 * BROWSERS=chromium,firefox,webkit tests the same contracts across engines.
 * The fixture exists only in this test server, never in the shipped app. */
import assert from 'node:assert/strict';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as engines from 'playwright';

const fixture = `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig, AnimatePresence } from 'motion/react';
import { MotionSurface } from '/src/components/ui/MotionSurface';
import { DUR, SPRING } from '/src/lib/motion/tokens';
import { I18nProvider } from '/src/lib/i18n';
import { NumberTicker } from '/src/components/NumberTicker';
import { MorphButton } from '/src/components/MorphButton';
import { TransferFlight } from '/src/components/TransferFlight';
import { SlideToConfirm } from '/src/components/SlideToConfirm';
import { Segmented } from '/src/components/ui/Segmented';
import { Sheet } from '/src/components/ui/Sheet';
import { PairingGuide } from '/src/components/ui/PairingGuide';
import { ConnectHandshake } from '/src/components/ConnectHandshake';
import { TransferStamp } from '/src/components/TransferStamp';
import { AttachmentPanel, AttachmentTrigger } from '/src/components/AttachmentPanel';
import { initMotionIntent } from '/src/lib/motionIntent';
import '/src/index.css';
import '/src/styles/apple-dna.css';
initMotionIntent();
function Fixture() {
  const [number, setNumber] = useState(209);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('one');
  const [calls, setCalls] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [guide, setGuide] = useState(0);
  const [complete, setComplete] = useState(false);
  const [connected, setConnected] = useState(false);
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState('');
  const [surface, setSurface] = useState(false);
  const trigger = useRef(null);
  const feed = useRef(null);
  const resolve = useRef(null);
  window.contracts = { setNumber, setProgress, setComplete, setConnected, setSurface };
  return <MotionConfig reducedMotion="user"><I18nProvider>
    <main style={{ padding: 16, width: 320 }}>
      <button id="surface-open" onClick={() => setSurface(true)}>Open surface</button>
      <AnimatePresence>{surface && <MotionSurface id="surface" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ type: 'spring', ...SPRING.snap, opacity: { duration: DUR.short / 1000 } }}><button id="surface-close" onClick={() => setSurface(false)}>Close surface</button></MotionSurface>}</AnimatePresence>
      <span id="ticker"><NumberTicker value={number} /></span>
      <MorphButton label="Copy" doneLabel="Copied" loadingLabel="Copying" data-testid="morph"
        onPress={() => { setCalls(n => n + 1); return new Promise(done => { resolve.current = done; }); }} />
      <button id="resolve" onClick={() => resolve.current?.()}>Resolve</button>
      <output id="calls">{calls}</output>
      <Segmented testId="tabs" label="Method" options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} value={tab} onChange={setTab} />
      <SlideToConfirm label="Disconnect" armedLabel="Release" testId="slide" onConfirm={() => setConfirmed(n => n + 1)} />
      <output id="confirmed">{confirmed}</output>
      <button id="open" onClick={() => setOpen(true)}>Open sheet</button>
      <div id="feed" ref={feed} style={{ position: 'relative', height: 240, width: 280, marginTop: 20 }} />
      <TransferFlight feedRef={feed} progress={progress} reverse={false} name="photo.jpg" size={1024} />
      <Sheet open={open} onClose={() => setOpen(false)} label="Test sheet" testId="sheet"><div style={{ height: 400 }}>Sheet content</div></Sheet>
      <section className="st-task" style={{ marginTop: 24 }}>
        <button id="guide" onClick={() => setGuide(n => n + 1)}>Show handoff</button>
        {guide > 0 && <div key={guide}><PairingGuide /><PairingGuide receiving /><ConnectHandshake phase={connected ? 'connected' : 'connecting'} /></div>}
        <TransferStamp name="notes.pdf" complete={complete} />
        <output id="selected">{selected}</output>
        <div style={{ position: 'relative', marginTop: 280 }}>
          <AttachmentTrigger isOpen={menu} onToggle={() => setMenu(v => !v)} buttonRef={trigger} />
          <AttachmentPanel isOpen={menu} onClose={() => setMenu(false)} buttonRef={trigger} onSelectType={setSelected} />
        </div>
      </section>
    </main>
  </I18nProvider></MotionConfig>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`;

const server = await createServer({
  configFile: false,
  plugins: [react(), tailwindcss(), {
    name: 'motion-contract-fixture',
    resolveId(id) { if (id === '/__motion_contracts.tsx') return '\0motion-contracts.tsx'; },
    async load(id) {
      if (id === '\0motion-contracts.tsx') {
        return (await transformWithEsbuild(fixture, 'motion-contracts.tsx', { loader: 'tsx', jsx: 'automatic' })).code;
      }
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__motion_contracts') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml('/__motion_contracts', '<!doctype html><html><body><div id="root"></div><script type="module" src="/__motion_contracts.tsx"></script></body></html>'));
      });
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});

const until = async (read, predicate, message) => {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    if (predicate(await read())) return;
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  assert.fail(message);
};
const phase = page => page.locator('[data-testid="morph"]').getAttribute('data-morph-state');

try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__motion_contracts`;
  for (const engine of (process.env.BROWSERS || 'chromium').split(',')) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForSelector('#ticker');
        if (reducedMotion === 'reduce') {
          assert.equal(await page.locator('#ticker > span > [aria-hidden]').innerText(), '209');
          assert.equal(await page.locator('.num-ticker__strip').count(), 0);
          await page.evaluate(() => window.contracts.setNumber(103));
          await until(() => page.locator('#ticker > span > [aria-hidden]').innerText(), text => text === '103', 'Static digits must update');
        }

        // Keyboard surfaces are immediate, and a later pointer never replays
        // their entry. Every exiting surface releases focus and hit-testing.
        await page.locator('#surface-open').focus();
        await page.keyboard.press('Enter');
        const surface = page.locator('#surface');
        assert.equal(await surface.evaluate(el => getComputedStyle(el).opacity), '1');
        assert.equal(await surface.getAttribute('data-motion-entry'), 'quiet');
        await page.locator('#surface-close').hover();
        assert.equal(await surface.evaluate(el => el.getAnimations().length), 0);
        await page.locator('#surface-close').click();
        await surface.waitFor({ state: 'detached' });
        await page.locator('#surface-open').click();
        await surface.waitFor();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await until(() => surface.evaluate(el => getComputedStyle(el).opacity), opacity => opacity === '1', 'Mounted surface ignored live reduced motion');
        await page.locator('#surface-close').click();
        await until(() => surface.count(), count => count === 0, 'Quiet surface retained an exit delay');
        await page.emulateMedia({ reducedMotion });
        await page.locator('#surface-open').click();
        await surface.waitFor();
        await page.locator('#surface-close').click();
        if (await surface.count()) assert.equal(await surface.evaluate(el => el.inert && getComputedStyle(el).pointerEvents === 'none'), true, 'Exiting surface still owns input');
        await surface.waitFor({ state: 'detached' });

        // No synthetic 520ms loading hold; success must be interruptible.
        await page.locator('[data-testid="morph"]').click();
        assert.equal(await phase(page), 'loading');
        await page.locator('[data-testid="morph"]').click();
        assert.equal(await page.locator('#calls').innerText(), '1');
        await page.locator('#resolve').click();
        await page.waitForFunction(() => document.querySelector('[data-testid="morph"]').dataset.morphState === 'done', null, { timeout: 400 });
        await page.locator('[data-testid="morph"]').click();
        assert.equal(await page.locator('#calls').innerText(), '2');
        await page.locator('#resolve').click();

        await page.getByRole('tab', { name: 'One', exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('tab', { name: 'Two', exact: true }).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('[data-testid="tabs-thumb"]').evaluate(el => getComputedStyle(el).transitionDuration), '0s');

        // Both endpoints and the shallow arc stay inside the feed.
        for (const progress of [0, 0.5, 1]) {
          await page.evaluate(p => window.contracts.setProgress(p), progress);
          await until(async () => {
            const [tile, feed] = await Promise.all([page.locator('[data-testid="transfer-flight"]').boundingBox(), page.locator('#feed').boundingBox()]);
            return { tile, feed };
          }, ({ tile, feed }) => tile && feed && tile.x >= feed.x && tile.x + tile.width <= feed.x + feed.width + 1, 'Flight escaped feed');
        }

        // Cancelling a fully dragged destructive control MUST NOT confirm it.
        const knob = page.locator('[data-testid="slide"] button');
        await knob.evaluate(el => el.addEventListener('pointerdown', event => { el.dataset.pointerId = String(event.pointerId); }, { once: true }));
        const k = await knob.boundingBox();
        await page.mouse.move(k.x + 4, k.y + k.height / 2);
        await page.mouse.down();
        await page.mouse.move(k.x + 280, k.y + k.height / 2, { steps: 5 });
        const pointerId = Number(await knob.getAttribute('data-pointer-id'));
        await knob.dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse' });
        await page.mouse.up();
        assert.equal(await page.locator('#confirmed').innerText(), '0');

        // A keyboard dismissal must unmount a pointer-opened sheet, even
        // when its non-animating outer wrapper changes input modality.
        await page.locator('#open').click();
        await page.getByTestId('sheet').waitFor();
        await page.keyboard.press('Escape');
        await page.getByTestId('sheet').waitFor({ state: 'detached', timeout: 1500 });

        // Direct manipulation remains available with the OS animation toggle off.
        await page.locator('#open').click();
        const handle = page.locator('[data-testid="sheet"] [data-sheet-handle]');
        await handle.waitFor({ state: 'visible' });
        await handle.hover(); // Wait for entrance geometry to settle before grabbing.
        const h = await handle.boundingBox();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 220, { steps: 8 });
        await page.mouse.up();
        await page.waitForSelector('[data-testid="sheet"]', { state: 'detached' });
        await until(() => page.evaluate(() => document.documentElement.style.overflow), value => value !== 'hidden', 'Sheet left scrolling locked');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await until(() => page.locator('.num-ticker__strip').count(), count => count === 0, 'Live reduced-motion preference was ignored');
        await page.emulateMedia({ reducedMotion });

        // Onboarding explains direction once; typing and later pointer use
        // must not replay a keyboard-opened scene.
        await page.locator('#guide').click();
        const guides = page.locator('.st-pair-guide');
        assert.equal(await guides.first().getAttribute('data-motion-enter'), 'true');
        assert.equal(await guides.last().getAttribute('data-receiving'), 'true');
        const paperAnimations = await guides.first().locator('.st-pair-paper').evaluate(el => getComputedStyle(el).animationName);
        assert.equal(paperAnimations, reducedMotion === 'reduce' ? 'none' : 'st-pair-handoff');
        assert.equal(await page.locator('[data-testid="connect-check"]').count(), 0, 'Never show success before connected');
        await page.evaluate(() => window.contracts.setConnected(true));
        await page.locator('[data-testid="connect-check"]').waitFor();
        await page.locator('#guide').focus();
        await page.keyboard.press('Enter');
        assert.equal(await guides.first().getAttribute('data-motion-enter'), 'false');
        await page.locator('[data-testid="transfer-stamp"]').click();
        assert.equal(await guides.first().locator('.st-pair-paper').evaluate(el => getComputedStyle(el).animationName), 'none');

        // Completion changes the mark, not the object's size/type. It is
        // truthful and immediately available with all animation disabled.
        const stamp = page.locator('[data-testid="transfer-stamp"]');
        assert.equal(await stamp.getAttribute('data-complete'), 'false');
        assert.equal(await stamp.locator('.st-transfer-stamp-check').evaluate(el => getComputedStyle(el).opacity), '0');
        const before = await stamp.boundingBox();
        await page.evaluate(() => window.contracts.setComplete(true));
        await until(() => stamp.locator('.st-transfer-stamp-check').evaluate(el => getComputedStyle(el).opacity), value => value === '1', 'Completion stamp did not arrive');
        const after = await stamp.boundingBox();
        assert.equal(before.width, after.width);
        assert.equal(before.height, after.height);
        await page.evaluate(() => window.contracts.setComplete(false));
        await until(() => stamp.locator('.st-transfer-stamp-check').evaluate(el => getComputedStyle(el).opacity), value => value === '0', 'Incomplete file retained success stamp');

        // Pointer menu originates at the +, all choices are actionable as a
        // group. Escape/keyboard paths do not wait through the pointer reveal.
        const trigger = page.getByTestId('add-attachment');
        await trigger.click();
        const menu = page.getByRole('menu');
        await menu.waitFor();
        assert.match(await menu.evaluate(el => getComputedStyle(el).transformOrigin), /^22px /);
        await page.getByRole('menuitem', { name: /files/i }).click();
        assert.equal(await page.locator('#selected').innerText(), 'file');
        // Do not wait for the exit: a departing backdrop must release the
        // actual hit target, or an immediate pointer reopen is swallowed.
        const triggerBox = await trigger.boundingBox();
        await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'Exiting picker swallowed immediate reopen');
        await menu.waitFor();
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'detached' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        assert.equal(await menu.evaluate(el => getComputedStyle(el).opacity), '1');
        assert.equal(await page.getByRole('menuitem').first().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('End');
        assert.equal(await page.getByRole('menuitem').last().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'detached' });
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Space');
        assert.equal(await menu.evaluate(el => getComputedStyle(el).opacity), '1');
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
        console.log(`PASS ${engine} ${reducedMotion}: primitives, live preference, directional/keyboard handoff, truthful stable completion, anchored menu/immediate reopen/keyboard return`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
