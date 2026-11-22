import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { launchBrowser, URL } from './lib.mjs';

const worker = process.env.VITE_SIGNALING_URL || 'http://localhost:8787';
const bundle = readdirSync('dist/assets').filter(name => name.endsWith('.js'))
  .map(name => readFileSync(`dist/assets/${name}`, 'utf8')).join('\n');
assert.ok(bundle.includes(worker), 'built bundle includes local Worker');
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const production = [];
  page.on('request', request => {
    if (new globalThis.URL(request.url()).hostname === 'sharetext-signaling.alighttt.workers.dev') production.push(request.url());
  });
  const stats = page.waitForResponse(response => response.url() === `${worker}/stats` && response.ok());
  const socket = page.waitForEvent('websocket', { predicate: ws => ws.url().startsWith(worker.replace('http:', 'ws:') + '/lobby') });
  await page.goto(URL);
  await Promise.all([stats, socket]);
  assert.equal(await page.evaluate(() => window.__stSignalingHttpBase()), worker);
  await page.waitForTimeout(4000);
  assert.deepEqual(production, [], 'no production boot probes or fallback requests');
  console.log('PASS built bundle and runtime stats/lobby target local Worker; no production requests');
} finally {
  await browser.close();
}
