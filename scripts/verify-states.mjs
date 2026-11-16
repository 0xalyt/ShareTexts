#!/usr/bin/env node
/**
 * verify-states — empty, loading and error are one family.
 *
 * Measured on the dev states gallery (/__kit/states) and on the real sheet:
 *
 *   · all three exist, and all three use the same frame height, so the data
 *     landing fills the frame instead of moving the chrome around it
 *   · each says what is going on (title) and what to do (body)
 *   · empty and error carry exactly one action; loading carries none but is
 *     announced busy
 *   · loading draws row-shaped skeletons (not a centred word in a void)
 *   · the real empty state's action closes the sheet — a door, not a dead end
 *   · reduced motion: the loading glyph does not spin
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-states.mjs
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const results = [];
const out = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const panelFacts = (page) =>
  page.evaluate(() => {
    const ids = ['demo-empty', 'demo-loading', 'demo-error'];
    return ids.map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return { id, missing: true };
      const rect = el.getBoundingClientRect();
      const buttons = Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim());
      const skeletons = el.querySelectorAll('.st-skeleton').length;
      const title = el.querySelector('p')?.textContent?.trim() ?? '';
      const ps = Array.from(el.querySelectorAll('p')).map((p) => p.textContent?.trim() ?? '');
      return {
        id,
        kind: el.getAttribute('data-state'),
        h: Math.round(rect.height),
        role: el.getAttribute('role'),
        busy: el.getAttribute('aria-busy'),
        buttons,
        skeletons,
        title,
        body: ps[1] ?? '',
      };
    });
  });

/* ── the gallery ────────────────────────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/__kit/states`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('demo-empty').waitFor({ timeout: 20000 });
await page.waitForTimeout(300);

const facts = await panelFacts(page);
const [empty, loading, error] = facts;

out('all three states render', facts.every((f) => !f.missing && f.kind), facts.map((f) => f.kind).join('/'));
out('every state names what is going on', facts.every((f) => f.title.length > 8), facts.map((f) => f.title.slice(0, 24)).join(' | '));
out('every state says what to do next', facts.every((f) => f.body.length > 20), facts.map((f) => String(f.body.length)).join('/'));
out('empty offers one action', empty?.buttons?.length === 1, JSON.stringify(empty?.buttons));
out('error offers one action (the fix)', error?.buttons?.length === 1, JSON.stringify(error?.buttons));
out('loading has no action and is announced busy',
  loading?.buttons?.length === 0 && loading?.busy === 'true' && loading?.role === 'status',
  `buttons=${loading?.buttons?.length} busy=${loading?.busy} role=${loading?.role}`);
out('loading reserves row geometry with a row-shaped ghost', (loading?.skeletons ?? 0) >= 3, `bars=${loading?.skeletons}`);

const heights = facts.map((f) => f.h);
out('one frame: all three states have the same height',
  new Set(heights).size === 1, heights.join('px / ') + 'px');

/* ── reduced motion: the loading glyph does not spin ────────────────────── */
const calmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const calm = await calmCtx.newPage();
await calm.goto(`${BASE}/__kit/states`, { waitUntil: 'domcontentloaded' });
await calm.getByTestId('demo-loading').waitFor({ timeout: 20000 });
const spin = await calm.evaluate(() => {
  const svg = document.querySelector('[data-testid="demo-loading"] svg');
  return svg ? getComputedStyle(svg).animationName : 'none';
});
out('reduced motion: the loading glyph is still', spin === 'none', String(spin));

/* ── the real sheet: empty is a door ───────────────────────────────────── */
const appCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const app = await appCtx.newPage();
await app.goto(BASE, { waitUntil: 'domcontentloaded' });
await app.evaluate(async () => {
  try { localStorage.clear(); } catch { /* ignore */ }
  const dbs = (await indexedDB.databases?.()) ?? [];
  await Promise.all(dbs.map((d) => d.name && indexedDB.deleteDatabase(d.name)));
});
await app.reload({ waitUntil: 'domcontentloaded' });
await app.getByTestId('header-more').click();
await app.waitForTimeout(500);
await app.getByTestId('more-saved').click();
await app.getByTestId('saved-empty').waitFor({ timeout: 15000 });

const realEmpty = await app.evaluate(() => {
  const el = document.querySelector('[data-testid="saved-empty"]');
  const btns = Array.from(el.querySelectorAll('button'));
  return {
    title: el.querySelector('p')?.textContent?.trim() ?? '',
    body: Array.from(el.querySelectorAll('p'))[1]?.textContent?.trim() ?? '',
    actions: btns.map((b) => b.textContent?.trim()),
  };
});
out('the real empty state names the place and invites the action',
  realEmpty.title.length > 6 && realEmpty.actions.length === 1,
  `${JSON.stringify(realEmpty.title)} → ${JSON.stringify(realEmpty.actions)}`);

await app.getByTestId('saved-empty-cta').click();
await app.waitForTimeout(500);
const closed = await app.evaluate(() => !document.querySelector('[data-testid="saved-empty"]'));
out('the empty state\'s action takes you somewhere (closes the sheet)', closed);

await appCtx.close();
await calmCtx.close();
await ctx.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
