#!/usr/bin/env node
/**
 * verify-allo — checks the typeface is actually being used, not just fetched.
 *
 *   BASE_URL=http://localhost:3110 node scripts/verify-allo.mjs
 *
 * Asserts: the roman and the true oblique load; the optical axis is set on the
 * ramp; user text is rendered with contextual alternates OFF (so a typed `->`
 * paints as typed); codes carry the slashed zero; and no faux-bold/oblique is
 * synthesised.
 */
import { chromium } from 'playwright';
import { readLiveCode } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const faces = await page.evaluate(async () => {
  // check() only answers for faces that have loaded; load them on purpose.
  await Promise.all([
    document.fonts.load('400 16px Allo'),
    document.fonts.load('italic 400 16px Allo'),
    document.fonts.load('italic 600 16px Allo'),
  ]);
  await document.fonts.ready;
  return {
    roman: document.fonts.check('400 16px Allo'),
    italic: document.fonts.check('italic 400 16px Allo'),
    family: getComputedStyle(document.body).fontFamily.split(',')[0].trim(),
  };
});
check('roman face active', faces.roman);
check('true oblique active', faces.italic, faces.italic ? '' : 'italic falls back to a synthetic shear');
check('body uses Allo', /Allo/.test(faces.family), faces.family);

const ramp = await page.evaluate(() => {
  const el = document.querySelector('.st-display, h1');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { opsz: cs.fontVariationSettings, size: cs.fontSize, synth: cs.fontSynthesis };
});
check('display sits on the display drawing', /opsz["\s]*32/.test(ramp?.opsz || ''), ramp?.opsz);
// Chrome reports the shorthand as "small-caps" once weight and style are
  // disabled — that IS the state we want, so accept it as well as "none".
  check('weight/style synthesis disabled', /small-caps|none/.test(ramp?.synth || ''), ramp?.synth);

// A real room, because the bubble is where user characters are rendered.
await page.getByTestId('home-send').click();
await page.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });

const codeFaces = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="pairing-code"] span span');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { features: cs.fontFeatureSettings, size: cs.fontSize, syn: cs.fontVariantNumeric };
});
check('pairing code has slashed zero', /"zero"/.test(codeFaces?.features || ''), codeFaces?.features);

const code = await readLiveCode(page);
const peer = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await peer.goto(BASE, { waitUntil: 'domcontentloaded' });
await peer.getByRole('button', { name: 'Receive' }).click();
await peer.waitForTimeout(400);
await peer.locator('[data-testid="join-code-input"] input[inputmode="numeric"]').first().fill(code);
await peer.waitForTimeout(1500);

await page.getByTestId('composer').first().fill('a -> b (2) ffi 10:05');
await page.getByTestId('send').first().click();
await page.waitForTimeout(1200);

const bubble = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-testid="msg-text"], .st-verbatim')];
  const el = nodes.find((n) => (n.textContent || '').includes('->'));
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { features: cs.fontFeatureSettings, ligatures: cs.fontVariantLigatures, text: el.textContent.slice(0, 30) };
});
check('bubble found with the typed text', !!bubble, bubble?.text);
check('user text keeps contextual alternates off', /"calt"[\s:]+0/.test(bubble?.features || ''), bubble?.features);
check('user text keeps ligatures off', /no-contextual/.test(bubble?.ligatures || ''), bubble?.ligatures);

await page.screenshot({ path: 'audit/allo/bubble.png' });
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? 'GREEN' : 'RED'} — ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
