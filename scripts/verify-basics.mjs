#!/usr/bin/env node
/**
 * verify-basics — the four things that were wrong before the polish.
 *
 *   > make important stuff bigger
 *   > stop using six separate corners
 *   > align your elements
 *   > fix your spacing
 *
 * Each line is measured, not asserted in prose:
 *
 *   1. IMPORTANT STUFF IS BIGGER. The hero line is the largest thing on the
 *      page at 1440 (≥ 44 px) and every section heading is smaller than it and
 *      no smaller than 30 px — a hierarchy you can read from the numbers.
 *   2. ONE CORNER RADIUS SCALE. The landing may use at most four distinct
 *      border radii (DESIGN.md §0.12: 8 / 12 / 16 / 24, plus pills).
 *   3. ALIGNED. Every landing section shares one content column: same left
 *      edge, same width, within 2 px. The old page had sections drifting by
 *      6–18 px because each one carried its own wrapper.
 *   4. SPACING. Every section's vertical padding is a multiple of 4, sections
 *      are at least 48 px apart, and the primary action is at least 48 px tall.
 *
 *   BASE_URL=http://localhost:3010 node scripts/verify-basics.mjs
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
let failures = 0;
const out = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('h1').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(600);

const facts = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  /* 1 · radii */
  const radii = new Map();
  for (const el of main.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const raw = cs.borderTopLeftRadius;
    if (!raw || raw === '0px') continue;
    const px = parseFloat(raw);
    // Pills and circles are full-round by intent; they are not part of the
    // corner scale and never read as "a different corner".
    if (/%$/.test(raw) || px >= 999 || px >= Math.min(el.clientWidth, el.clientHeight) / 2) continue;
    radii.set(raw, (radii.get(raw) || 0) + 1);
  }

  /* 2 · hierarchy */
  const px = (el) => parseFloat(getComputedStyle(el).fontSize);
  const h1 = main.querySelector('h1');
  const h2s = [...main.querySelectorAll('h2')].filter(visible);

  /* 3 · one content column */
  const sections = [...main.querySelectorAll('section')].filter(visible);
  const cols = sections.map((s) => {
    const r = s.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width) };
  });

  /* 4 · rhythm */
  const pads = sections.map((s) => {
    const cs = getComputedStyle(s);
    return { top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom) };
  });
  const gaps = sections.slice(1).map((s, i) => {
    const prev = sections[i].getBoundingClientRect();
    return Math.round(s.getBoundingClientRect().top - prev.bottom);
  });
  const cta = main.querySelector('[data-testid="home-send"]');
  const ctaRect = cta ? cta.getBoundingClientRect() : null;

  return {
    radii: [...radii.entries()].sort((a, b) => b[1] - a[1]),
    h1: h1 ? px(h1) : null,
    h1Text: h1 ? h1.textContent.trim().slice(0, 40) : null,
    h2: h2s.map(px),
    cols,
    pads,
    gaps,
    cta: ctaRect ? { h: Math.round(ctaRect.height), font: px(cta) } : null,
  };
});

/* ── 1 · one radius scale ─────────────────────────────────────────────── */
out(
  'the landing uses one corner scale (≤ 4 radii)',
  facts.radii.length <= 4,
  facts.radii.map(([r, n]) => `${r}×${n}`).join(' ') || 'none',
);

/* ── 2 · important stuff is bigger ────────────────────────────────────── */
out('the hero line is ≥ 44 px at 1440', facts.h1 !== null && facts.h1 >= 44, facts.h1 ? `${facts.h1}px “${facts.h1Text}…”` : 'no h1');
out('every section heading is ≥ 30 px', facts.h2.length > 0 && facts.h2.every((n) => n >= 30), facts.h2.map((n) => `${n}px`).join(' '));
out('the hero is the largest line on the page', facts.h1 !== null && facts.h2.every((n) => n < facts.h1), `h1 ${facts.h1}px vs h2 ${Math.max(...facts.h2)}px`);

/* ── 3 · aligned ──────────────────────────────────────────────────────── */
const lefts = facts.cols.map((c) => c.left);
const widths = facts.cols.map((c) => c.width);
const spreadL = Math.max(...lefts) - Math.min(...lefts);
const spreadW = Math.max(...widths) - Math.min(...widths);
out('every section starts on the same left edge', spreadL <= 2, `${facts.cols.length} sections, spread ${spreadL}px`);
out('every section is the same width', spreadW <= 2, `spread ${spreadW}px`);

/* ── 4 · spacing ──────────────────────────────────────────────────────── */
const offGrid = facts.pads.filter((p) => p.top % 4 !== 0 || p.bottom % 4 !== 0);
out('section padding sits on a 4 px grid', offGrid.length === 0, offGrid.length ? JSON.stringify(offGrid) : 'all multiples of 4');
// Adjacent sections sit flush (padding, not margins, makes the space), so
// the measure is the padding on each side of the seam, not the gap between
// two boxes that intentionally touch.
const seams = facts.pads.slice(0, -1).map((p, i) => p.bottom + facts.pads[i + 1].top);
out('sections are at least 48 px apart', seams.every((g) => g >= 48), `seams ${seams.join(', ')}`);
out('the primary action is ≥ 48 px tall', !!facts.cta && facts.cta.h >= 48, facts.cta ? `${facts.cta.h}px tall, ${facts.cta.font}px label` : 'not found');

/* ── phone: the same rules, at 390 ─────────────────────────────────────── */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const phone = await page.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const h1 = main.querySelector('h1');
  const btn = main.querySelector('[data-testid="home-send"]');
  const r = btn ? btn.getBoundingClientRect() : null;
  const overflow = [...main.querySelectorAll('*')].some((el) => {
    const b = el.getBoundingClientRect();
    // A marquee has off-canvas copies by design. Check their clipping window
    // rather than treating invisible, contained artwork as page overflow.
    const marquee = el.closest('.landing-browser-marquee');
    if (marquee && el !== marquee && getComputedStyle(marquee).overflowX === 'hidden') {
      const clip = marquee.getBoundingClientRect();
      if (clip.left >= 0 && clip.right <= innerWidth) return false;
    }
    return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed';
  });
  return {
    h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : null,
    cta: r ? Math.round(r.height) : null,
    overflow,
  };
});
out('the hero line is ≥ 34 px on a phone', phone.h1 !== null && phone.h1 >= 34, `${phone.h1}px`);
out('the primary action is ≥ 48 px tall on a phone', phone.cta !== null && phone.cta >= 48, `${phone.cta}px`);
out('nothing on the landing overflows the phone width', phone.overflow === false);

await browser.close();
console.log(failures ? `\n[verify-basics] ${failures} failure(s)` : '\n[verify-basics] clean — bigger, fewer corners, aligned, on a grid');
process.exit(failures ? 1 : 0);
