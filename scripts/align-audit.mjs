#!/usr/bin/env node
/**
 * align-audit — measure the things the eye notices before it can name them.
 *
 * Three families, because they fail differently:
 *   · icon + label rows: the icon's optical centre vs the text's, and whether
 *     labels across rows share a column (a 1 px drift reads as a wobble).
 *   · avatar + name rows: the avatar's centre vs the name's cap-height centre.
 *   · numbers: whether a stats row uses tabular figures at all — proportional
 *     digits make "11" narrower than "20" and the column dances on update.
 *
 * Plus the optical cases: a glyph inside a circle (a play triangle is
 * left-heavy and must sit ~1 px right of geometric centre) and a hanging
 * quotation mark.
 *
 *   BASE_URL=http://localhost:3110 node scripts/align-audit.mjs before
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readLiveCode } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const tag = process.argv[2] || 'run';
const out = 'audit/align';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const M = await mobile.newPage();
await M.goto(BASE, { waitUntil: 'domcontentloaded' });
await M.waitForTimeout(1000);
await M.getByTestId('home-send').click();
await M.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
const code = await readLiveCode(M);

const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const D = await desk.newPage();
await D.goto(BASE, { waitUntil: 'domcontentloaded' });
await D.waitForTimeout(1000);
await D.getByRole('button', { name: 'Receive' }).click();
await D.waitForTimeout(400);
await D.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
await D.locator('[data-app-state="connected"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await M.getByTestId('composer').first().waitFor({ timeout: 20000 });

for (const t of ['Alignment sample', 'https://example.com/a/rather/long/path/for/this/test', 'Second message']) {
  await M.getByTestId('composer').first().fill(t);
  await M.getByTestId('send').first().click();
  await M.waitForTimeout(400);
}
await D.waitForTimeout(1200);

/** Generic row probe: every element that holds an SVG and a text node. */
const probe = async (page) => page.evaluate(() => {
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const rows = [];
  document.querySelectorAll('button, a, li, div').forEach((el) => {
    if (el.children.length > 3) return;
    const svg = el.querySelector(':scope > svg, :scope > span > svg');
    if (!svg) return;
    const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const label = textNodes[0]?.parentElement;
    const span = [...el.children].find((c) => c.tagName === 'SPAN' && (c.textContent || '').trim().length > 1);
    const target = label || span;
    if (!target) return;
    const ir = svg.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!ir.width || !tr.width) return;
    rows.push({
      kind: 'icon+label',
      name: (el.textContent || '').trim().slice(0, 26),
      dx: +(centre(ir).x - centre(tr).x).toFixed(1),
      dy: +(centre(ir).y - centre(tr).y).toFixed(1),
      iconLeft: +ir.left.toFixed(1),
      labelLeft: +tr.left.toFixed(1),
      iconW: +ir.width.toFixed(1),
    });
  });

  // Numbers: does the stats row use tabular figures?
  const numerics = [];
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (!/^\d[\d,.\s]*$/.test(t)) return;
    const cs = getComputedStyle(el);
    numerics.push({ t, family: cs.fontVariantNumeric, features: cs.fontFeatureSettings });
  });

  // A glyph in a circle: geometric vs optical centre.
  const circles = [];
  document.querySelectorAll('button, span, div').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.borderRadius === '0px') return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - r.height) > 1.5 || r.width < 28 || r.width > 64) return;
    const g = el.querySelector(':scope > svg');
    if (!g) return;
    const gr = g.getBoundingClientRect();
    circles.push({
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 22),
      size: Math.round(r.width),
      dx: +(((gr.left + gr.width / 2) - (r.left + r.width / 2))).toFixed(1),
      dy: +(((gr.top + gr.height / 2) - (r.top + r.height / 2))).toFixed(1),
    });
  });

  return { rows, numerics: numerics.slice(0, 12), circles: circles.slice(0, 14) };
});

const m = await probe(M);
const d = await probe(D);

const report = (label, r) => {
  console.log(`\n── ${label} ──`);
  const off = r.rows.filter((x) => Math.abs(x.dy) > 1 || Math.abs(x.dx) > 1);
  console.log(`icon+label rows: ${r.rows.length}, off-centre: ${off.length}`);
  off.slice(0, 8).forEach((x) => console.log(`   dy ${x.dy}  dx ${x.dx}  “${x.name}”`));
  const circleOff = r.circles.filter((x) => Math.abs(x.dx) > 1 || Math.abs(x.dy) > 1);
  console.log(`circle glyphs: ${r.circles.length}, off-centre: ${circleOff.length}`);
  circleOff.slice(0, 8).forEach((x) => console.log(`   ${x.size}px  dx ${x.dx}  dy ${x.dy}  “${x.name}”`));
  const weird = r.numerics.filter((n) => !/tabular/.test(n.family) && !/tnum/.test(n.features));
  console.log(`numeric runs: ${r.numerics.length}, not tabular: ${weird.length} ${JSON.stringify(weird.slice(0, 5))}`);
};

report('mobile 390', m);
report('desktop 1440', d);

await M.screenshot({ path: `${out}/${tag}-mobile.png`, fullPage: false });
await D.screenshot({ path: `${out}/${tag}-desktop.png`, fullPage: false });
writeFileSync(`${out}/${tag}.json`, JSON.stringify({ mobile: m, desktop: d }, null, 1));
await browser.close();
console.log(`\nshots: ${out}/${tag}-mobile.png , ${out}/${tag}-desktop.png`);
