#!/usr/bin/env node
/**
 * qa-receive — the visual QA probe for the receive form.
 *
 * Not a pass/fail gate: a measuring instrument. It loads the real screen at a
 * given width and reports what a person would have to squint to find —
 * horizontal overflow, type that collides, hit targets under 44px, and text
 * whose last line is a single orphaned word.
 *
 *   BASE_URL=http://localhost:3081 node scripts/qa-receive.mjs 1280 390
 */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const widths = WIDTHS.length ? WIDTHS : [1280, 390];
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

const probe = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const round = (n) => Math.round(n * 10) / 10;
  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const testid = el.getAttribute('data-testid');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${tag}${testid ? `[${testid}]` : ''}${text ? ` "${text}"` : ''}`;
  };

  /* ── horizontal overflow ─────────────────────────────────────────── */
  const overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.visibility === 'hidden') continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      /* report the outermost offender only */
      if (el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 0.5) continue;
      overflow.push({
        el: describe(el),
        left: round(r.left),
        right: round(r.right),
        overflowBy: round(Math.max(r.right - vw, -r.left)),
      });
    }
  }

  /* ── hit targets ─────────────────────────────────────────────────── */
  const targets = [];
  for (const el of document.querySelectorAll('button, a[href], input, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.classList.contains('sr-only')) continue;
    if (r.width < 44 || r.height < 44) {
      targets.push({ el: describe(el), w: round(r.width), h: round(r.height) });
    }
  }

  /* ── type that collides ──────────────────────────────────────────── */
  const textNodes = [];
  for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,a,label')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(' ');
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    textNodes.push({ el, r, text: own.slice(0, 30), node: describe(el) });
  }
  const overlaps = [];
  for (let i = 0; i < textNodes.length; i += 1) {
    for (let j = i + 1; j < textNodes.length; j += 1) {
      const a = textNodes[i];
      const b = textNodes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 2 && y > 2) {
        overlaps.push({
          a: a.node,
          b: b.node,
          x: round(x),
          y: round(y),
        });
      }
    }
  }

  /* ── orphan wraps: a last line with one short word ───────────────── */
  const orphans = [];
  for (const { el, r, node } of textNodes) {
    const range = document.createRange();
    const words = [];
    const walk = (n) => {
      if (n.nodeType === 3) {
        const text = n.textContent ?? '';
        const re = /\S+/g;
        let m;
        while ((m = re.exec(text))) {
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const rect = range.getBoundingClientRect();
          if (rect.width) words.push({ word: m[0], top: Math.round(rect.top), width: rect.width });
        }
      } else {
        n.childNodes.forEach(walk);
      }
    };
    walk(el);
    if (words.length < 4) continue;
    const rows = [...new Set(words.map((w) => w.top))];
    if (rows.length < 2) continue;
    const lastTop = rows[rows.length - 1];
    const last = words.filter((w) => w.top === lastTop);
    const lastWidth = last.reduce((sum, w) => sum + w.width, 0);
    if (last.length === 1 && lastWidth < r.width * 0.4) {
      orphans.push({
        el: node,
        lines: rows.length,
        word: last[0].word,
        lastLineWidth: round(lastWidth),
        boxWidth: round(r.width),
      });
    }
  }

  return {
    vw,
    vh,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    overflow,
    targets,
    overlaps: overlaps.slice(0, 20),
    orphans,
  };
};

for (const width of widths) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    isMobile: width < 500,
    hasTouch: width < 500,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-receive').click();
  await page.getByTestId('receive-screen').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);

  const empty = await page.evaluate(probe);

  /* the rejected state: six digits the server cannot know */
  await page.getByTestId('join-code-input').locator('input').first().click();
  await page.keyboard.type('000000');
  await page
    .getByTestId('receive-field-error')
    .waitFor({ timeout: 12000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const rejected = await page.evaluate(probe);

  await page.screenshot({ path: `docs/redesign/form/qa-${width}-rejected.png` });
  await ctx.close();

  console.log(`\n===== ${width}px — empty =====`);
  console.log(JSON.stringify(empty, null, 2));
  console.log(`\n===== ${width}px — rejected =====`);
  console.log(JSON.stringify(rejected, null, 2));
}

await browser.close();
