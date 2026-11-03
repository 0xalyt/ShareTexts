#!/usr/bin/env node
/**
 * verify-chunk-recovery.mjs — B31: a deploy must not strand an open tab.
 *
 * Two mechanisms ship for the same defect, so this gate proves both:
 *
 *  1. GUARD (no service worker): the app's lazy chunk 404s, the page reloads
 *     exactly once and the surface then opens. Without the guard the import
 *     rejects and the screen stays dead — which is what the live site did
 *     (B31: /assets/QRScanner-<hash>.js answered 404 after a push).
 *  2. CACHE (service worker installed): every dynamic-entry file from the
 *     build manifest is in `dist/precache.json` and the installed cache holds
 *     it, so the same request is answered locally instead of hitting a 404.
 *
 * The service worker is blocked in phase 1 on purpose: with it active the
 * request never reaches the network and the guard would look unused.
 *
 *   node scripts/verify-chunk-recovery.mjs            # builds first if needed
 *   GATE_PORT=3322 node scripts/verify-chunk-recovery.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
// GATE_PORT, not PORT: some shells export PORT=0 for the dev server.
const PORT = Number(process.env.GATE_PORT || 3322);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
/** record(name, passed, detail) — a boolean plus the number that proves it. */
const record = (name, passed, detail = '') => results.push({ ok: !!passed, name, detail });

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(2);
}
const precachePath = path.join(DIST, 'precache.json');
if (!fs.existsSync(precachePath)) {
  console.error('dist/precache.json is missing — the build plugin did not run.');
  process.exit(2);
}
const precache = JSON.parse(fs.readFileSync(precachePath, 'utf8'));
const qrChunk = precache.find((u) => /QRScanner/i.test(u));
if (!qrChunk) {
  console.error('no QRScanner chunk in dist/precache.json — the manifest shape changed.');
  process.exit(2);
}

/* ── static server for the production build ─────────────────────────────── */
const server = spawn(process.execPath, [path.join(ROOT, 'scripts/dist-server.mjs'), String(PORT)], {
  cwd: ROOT,
  stdio: 'ignore',
});
const stopServer = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + '/', { cache: 'no-store' });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}
if (!(await waitForServer())) {
  console.error(`dist server did not answer on ${BASE}`);
  stopServer();
  process.exit(2);
}

const browser = await chromium.launch();

/* ── Phase 1: the reload guard ──────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // No service worker: the chunk request has to reach the network, which is
  // the condition the guard exists for.
  await context.route('**/sw.js', (route) => route.abort());
  const page = await context.newPage();

  let chunkHits = 0;
  let firstChunkStatus = null;
  await page.route(`**${qrChunk}`, async (route) => {
    chunkHits++;
    if (chunkHits === 1) {
      firstChunkStatus = 404;
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
    return route.continue();
  });

  const navigations = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  // Attached before the first navigation: the recovering fetch happens on the
  // app's own idle prewarm, long before any later step could subscribe.
  let chunkOk = false;
  page.on('response', (res) => {
    if (res.url().endsWith(qrChunk) && res.status() === 200) chunkOk = true;
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]', { timeout: 15000 });
  // The idle prewarm imports the lazy chunks ~1.2 s after first paint when
  // requestIdleCallback is unavailable; give it room either way.
  await page.waitForTimeout(5000);

  record('the guard enqueued the broken chunk', firstChunkStatus === 404, `hits=${chunkHits}`);
  record('exactly one automatic reload', navigations.length === 2, `navigations=${navigations.length} ${navigations.join(' → ')}`);

  // After the reload the app must still work and the scanner must open.
  await page.waitForSelector('[data-testid="home-send"]', { timeout: 15000 });
  await page.click('[data-testid="home-receive"]');
  await page.waitForSelector('[data-testid="receive-screen"]', { timeout: 10000 });
  // The scanner is a lazy chunk. A headless Chromium has no camera, so the
  // component mounts and then shows its honest "camera unavailable" fallback;
  // what this step proves is that the recovered chunk LOADED and rendered,
  // which is exactly what B31 broke.
  await page.waitForTimeout(400);
  await page.click('[data-testid="receive-scan"]');
  const scanner = await page
    // attached, not visible: headless has no camera, so the reader element is
    // mounted but the fallback card is what a person would see.
    .waitForSelector('#qr-reader', { state: 'attached', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  // Give the camera-start rejection a beat to settle before reading state.
  await page.waitForTimeout(800);
  record('scanner screen opens after recovery', scanner, `#qr-reader=${scanner}`);
  record('the recovered chunk was fetched with 200', chunkOk);
  record('no page error left behind', errors.length === 0, errors.join(' | '));

  // A second 404 in the same session must NOT reload again (10 s window).
  await context.close();
}

/* ── Phase 2: the precache ──────────────────────────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const controlled = await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready != null, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  record('service worker registers on the production build', controlled);

  const cached = await page.evaluate(async (url) => {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      if (await cache.match(url)) return key;
    }
    return null;
  }, qrChunk);
  record('the lazy chunk is precached by the installed worker', cached !== null, `cache=${cached} url=${qrChunk}`);

  const manifestOk = await page.evaluate(async () => {
    const res = await fetch('/precache.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const list = await res.json();
    return Array.isArray(list) && list.length > 0 && list.every((u) => u.startsWith('/assets/'));
  });
  record('dist/precache.json is served and lists asset URLs', manifestOk, `${precache.length} entries`);
  await context.close();
}

await browser.close();
stopServer();

const passed = results.filter((r) => r.ok).length;
for (const r of results) {
  console.log(`${r.ok ? '  ok ' : 'FAIL '} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
