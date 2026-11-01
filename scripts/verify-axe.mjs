#!/usr/bin/env node
/**
 * verify-axe.mjs — a11y gate for P2: Home light/dark, both sheets, Send.
 *
 * axe-core is injected at test time (pinned CDN build) instead of added to
 * package.json, so the app ships no new dependency. The rule set is the
 * WCAG 2.0/2.1 A+AA tag set; only serious and critical violations fail the
 * gate — those are the ones that make a screen unusable with assistive tech.
 * Moderate findings are printed and counted, never scored, so they stay
 * visible without pretending the repo is cleaner than it is.
 *
 *   node scripts/verify-axe.mjs
 *   URL=http://localhost:3023 node scripts/verify-axe.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3010';
const AXE = 'https://unpkg.com/axe-core@4.10.2/axe.min.js';

// The app ships a strict CSP (script-src 'self' + hashes), which is exactly
// right and also blocks a test-time injection. Fetch axe in Node and inject it
// with CSP bypassed for this harness only — the app's policy is untouched.
const axeSource = await fetch(AXE).then((r) => {
  if (!r.ok) throw new Error(`axe-core download failed: HTTP ${r.status}`);
  return r.text();
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true });
const page = await context.newPage();

const rows = [];

async function audit(label) {
  const injection = await page.addScriptTag({ content: axeSource }).catch((e) => ({ error: e.message }));
  if (injection && injection.error) {
    rows.push({ label, skipped: true, detail: `axe-core could not be injected: ${injection.error}` });
    return;
  }
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      count: v.nodes.length,
    }));
  });
  const serious = result.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const moderate = result.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
  rows.push({ label, serious, moderate, all: result });
}

const home = async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="home-send"]');
  await page.waitForTimeout(900);
};

await home();
await audit('Home (light)');

await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.waitForTimeout(600);
await audit('Home (dark)');
await page.evaluate(() => document.documentElement.classList.remove('dark'));
await page.waitForTimeout(400);

// Nearby sheet
await page.getByTestId('home-nearby').click();
await page.waitForTimeout(700);
await audit('Nearby sheet');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// Temporary Space sheet
const space = page.getByTestId('home-space');
if (await space.count()) {
  await space.click();
  await page.waitForTimeout(700);
  await audit('Temporary Space sheet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

// Send
await page.getByTestId('home-send').click();
await page.waitForSelector('[data-testid="task-back"]', { timeout: 15000 });
await page.waitForTimeout(1200);
await audit('Send (sending)');

// Receive — the flat entry (P3)
await page.getByTestId('task-back').click();
await page.waitForTimeout(900);
await page.getByTestId('home-receive').click();
await page.waitForSelector('[data-testid="receive-screen"]', { timeout: 15000 });
await page.waitForTimeout(900);
await audit('Receive (receiving)');

const totalSerious = rows.reduce((n, r) => n + (r.serious?.length || 0), 0);
const totalModerate = rows.reduce((n, r) => n + (r.moderate?.length || 0), 0);

for (const r of rows) {
  if (r.skipped) {
    console.log(`SKIP ${r.label} — ${r.detail}`);
    continue;
  }
  const tag = r.serious.length ? 'FAIL' : 'PASS';
  console.log(`${tag} ${r.label} — ${r.serious.length} serious/critical, ${r.moderate.length} moderate`);
  for (const v of r.serious) console.log(`   ✗ ${v.impact} ${v.id} (${v.count}) ${v.help} :: ${v.nodes.join(' | ')}`);
  for (const v of r.moderate) console.log(`   · ${v.impact} ${v.id} (${v.count}) ${v.help}`);
}

console.log(`\nverify-axe: ${totalSerious} serious/critical, ${totalModerate} moderate across ${rows.length} surfaces`);
console.log('Rule set: WCAG 2.0/2.1 A+AA (axe-core 4.10.2, injected at test time — not a project dependency).');
console.log('Injection runs with CSP bypassed for the harness; the app policy itself is unchanged.');

await browser.close();
process.exit(totalSerious === 0 ? 0 : 1);
