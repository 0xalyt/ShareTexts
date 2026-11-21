#!/usr/bin/env node
/** Isolated component regressions; no signaling/production service required.
 * Run: node scripts/verify-motion-contracts.mjs
 * BROWSERS=chromium,firefox,webkit tests the same contracts across engines.
 * The fixture exists only in this test server, never in the shipped app. */
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as engines from 'playwright';

const fixture = `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { I18nProvider } from '/src/lib/i18n';
import { NumberTicker } from '/src/components/NumberTicker';
import { MorphButton } from '/src/components/MorphButton';
import { TransferFlight } from '/src/components/TransferFlight';
import { SlideToConfirm } from '/src/components/SlideToConfirm';
import { Segmented } from '/src/components/ui/Segmented';
import { Sheet } from '/src/components/ui/Sheet';
import '/src/index.css';
import '/src/styles/apple-dna.css';
function Fixture() {
  const [number, setNumber] = useState(209);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('one');
  const [calls, setCalls] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const feed = useRef(null);
  const resolve = useRef(null);
  window.contracts = { setNumber, setProgress };
  return <MotionConfig reducedMotion="user"><I18nProvider>
    <main style={{ padding: 16, width: 320 }}>
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
      <Sheet open={open} onClose={() => setOpen(false)} label="Test sheet" testId="sheet"><p>Sheet content</p></Sheet>
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
    load(id) { if (id === '\0motion-contracts.tsx') return fixture; },
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
        const k = await knob.boundingBox();
        await page.mouse.move(k.x + 4, k.y + k.height / 2);
        await page.mouse.down();
        await page.mouse.move(k.x + 280, k.y + k.height / 2, { steps: 5 });
        await knob.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
        await page.mouse.up();
        assert.equal(await page.locator('#confirmed').innerText(), '0');

        // Direct manipulation remains available with the OS animation toggle off.
        await page.locator('#open').click();
        const handle = page.locator('[data-testid="sheet"] [data-sheet-handle]');
        await handle.waitFor({ state: 'visible' });
        await until(() => page.locator('[data-testid="sheet"]').boundingBox(), box => box && box.y < 800, 'Sheet did not open');
        const h = await handle.boundingBox();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 220, { steps: 8 });
        await page.mouse.up();
        await page.waitForSelector('[data-testid="sheet"]', { state: 'detached' });
        await until(() => page.evaluate(() => document.documentElement.style.overflow), value => value !== 'hidden', 'Sheet left scrolling locked');

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await until(() => page.locator('.num-ticker__strip').count(), count => count === 0, 'Live reduced-motion preference was ignored');
        assert.deepEqual(errors, []);
        console.log(`PASS ${engine} ${reducedMotion}: digits, immediate/repeatable feedback, keyboard tabs, contained flight, gesture cancellation, sheet drag, live preference`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
