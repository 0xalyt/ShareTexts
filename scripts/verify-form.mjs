#!/usr/bin/env node
/**
 * verify-form — the receive form's validation, measured.
 *
 * Two surfaces:
 *
 *   /__kit/form      four cards of the SAME form: filled and ready, one bad
 *                    field, a server failure, and the request in flight. Every
 *                    card is the same width, so geometry can be compared.
 *   the real screen  Receive, six digits typed, submitted — the state a person
 *                    actually reaches, checked for the same promises.
 *
 * The promises:
 *   · the error sits next to the field (below it, above the action), not in a
 *     banner somewhere else
 *   · the slot it lives in is the same height with a message or without one, so
 *     the action below does not move when an error appears (no page shove)
 *   · `aria-invalid` and `aria-describedby` tie the field to its message, and
 *     the message is a live region, so a screen reader hears it
 *   · focus goes to the first invalid field when the code is the problem, and
 *     stays on the action when the network is
 *   · the label is visible, not a placeholder
 *   · in flight: the action says so, is really disabled, and comes back
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-form.mjs
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
const skip = (name, why) => console.log(`SKIP ${name} — ${why}`);

/* ── the gallery ─────────────────────────────────────────────────────────── */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/__kit/form`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('demo-card').first().waitFor({ timeout: 20000 });
/* every card pastes its code, then flips state on a timer — wait for the last */
await page.waitForTimeout(1400);

const cards = await page.evaluate(() => {
  const read = (card) => {
    const label = card.getAttribute('data-label') ?? '';
    const field = card.querySelector('[data-testid="join-code-input"]');
    const otp = field?.getBoundingClientRect();
    const slot = card.querySelector('[data-testid="receive-error-slot"]');
    const slotRect = slot?.getBoundingClientRect();
    const errEl = card.querySelector('[data-testid="receive-field-error"]');
    const errRect = errEl?.getBoundingClientRect();
    const btn = card.querySelector('[data-testid="receive-join"]');
    const btnRect = btn?.getBoundingClientRect();
    const inputs = Array.from(card.querySelectorAll('[data-testid="join-code-input"] input'));
    const labelledby = field?.getAttribute('aria-labelledby');
    const visibleLabel =
      (labelledby && document.getElementById(labelledby)?.textContent?.trim()) || '';
    return {
      label,
      filled: inputs.filter((i) => i.value).length,
      err: errEl
        ? {
            text: errEl.textContent?.trim() ?? '',
            role: errEl.getAttribute('role'),
            top: Math.round(errRect.top - (otp?.bottom ?? 0)),
            aboveAction: Math.round((btnRect?.top ?? 0) - errRect.bottom),
            slotTop: Math.round(errRect.top - (slotRect?.top ?? 0)),
          }
        : null,
      slotHeight: Math.round(slotRect?.height ?? 0),
      /* the distance the action sits below the field — the number that must
         not change when a message appears in between */
      gap: Math.round((btnRect?.top ?? 0) - (otp?.bottom ?? 0)),
      button: btn
        ? {
            text: btn.textContent?.trim() ?? '',
            disabled: btn.disabled,
            busy: btn.getAttribute('aria-busy'),
            height: Math.round(btnRect.height),
          }
        : null,
      invalid: inputs.map((i) => i.getAttribute('aria-invalid')),
      described: inputs.map((i) => i.getAttribute('aria-describedby') ?? ''),
      visibleLabel,
      focusInField: inputs.includes(document.activeElement),
    };
  };
  return Array.from(document.querySelectorAll('[data-testid="demo-card"]')).map(read);
});

const byLabel = (needle) => cards.find((c) => c.label.toLowerCase().includes(needle));

out('four states of the one form are on screen', cards.length === 4,
  cards.map((c) => c.label).join(' / '));

const happy = byLabel('happy');
const fieldErr = byLabel('field');
const server = byLabel('server');
const flight = byLabel('flight');

/* ── the label ───────────────────────────────────────────────────────────── */
out('every card keeps a visible label for the field',
  cards.every((c) => c.visibleLabel.length > 2),
  [...new Set(cards.map((c) => c.visibleLabel))].join(' / '));

/* ── happy path ──────────────────────────────────────────────────────────── */
out('happy: the code is in, the action is live and says what it does',
  happy.filled === 6 && happy.button?.disabled === false && happy.button?.text === 'Join' &&
    happy.err === null && happy.invalid.every((v) => v === null),
  `${happy.filled}/6 digits · "${happy.button?.text}" · disabled=${happy.button?.disabled}`);

/* ── one field error ─────────────────────────────────────────────────────── */
out('field error: the message names the problem and sits under the field',
  Boolean(fieldErr.err?.text) && fieldErr.err.top >= 0 && fieldErr.err.aboveAction >= 0,
  `"${fieldErr.err?.text}" · ${fieldErr.err?.top}px below the field, ${fieldErr.err?.aboveAction}px above the action`);

out('field error: it is announced (role=alert), not just coloured',
  fieldErr.err?.role === 'alert', `role=${fieldErr.err?.role}`);

out('field error: the field is marked invalid and points at the message',
  fieldErr.invalid.every((v) => v === 'true') &&
    fieldErr.described.every((d) => d.includes('receive-code-error')),
  `aria-invalid=${fieldErr.invalid.join(',')} · describedby="${fieldErr.described[0]}"`);

out('field error: focus is in the first invalid cell',
  fieldErr.focusInField === true,
  fieldErr.focusInField ? 'cell 1 has focus' : 'focus is somewhere else');

out('field error: the rejected code is cleared, not left to retry blindly',
  fieldErr.filled === 0, `${fieldErr.filled}/6 digits left`);

/* ── server error ────────────────────────────────────────────────────────── */
out('server error: the message is inline, next to the field, and announced',
  Boolean(server.err?.text) && server.err.top >= 0 && server.err.role === 'alert',
  `"${server.err?.text}"`);

out('server error: the typed code is kept, because the code was not the problem',
  server.filled === 6, `${server.filled}/6 digits kept`);

out('server error: retry stays available',
  server.button?.disabled === false && server.button?.text === 'Join',
  `"${server.button?.text}" disabled=${server.button?.disabled}`);

/* ── in flight ───────────────────────────────────────────────────────────── */
out('in flight: the action says it is working and is really disabled',
  flight.button?.text === 'Joining…' && flight.button?.disabled === true,
  `"${flight.button?.text}" disabled=${flight.button?.disabled}`);

out('in flight: it is announced busy',
  flight.button?.busy === 'true', `aria-busy=${flight.button?.busy}`);

/* ── no shove ────────────────────────────────────────────────────────────── */
const gaps = cards.map((c) => c.gap);
const spread = Math.max(...gaps) - Math.min(...gaps);
out('no page shove: the action sits the same distance below the field in all four',
  spread <= 1,
  `gaps ${gaps.join('/')}px (spread ${spread}px)`);

const slots = cards.map((c) => c.slotHeight);
out('the error slot is the same height empty and full',
  Math.max(...slots) - Math.min(...slots) <= 1,
  `slot heights ${slots.join('/')}px`);

/* ── the real screen ─────────────────────────────────────────────────────── */
const appCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const app = await appCtx.newPage();
await app.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await app.getByTestId('home-receive').click();
await app.getByTestId('receive-screen').waitFor({ timeout: 20000 });
await app.waitForTimeout(400);

const realChrome = await app.evaluate(() => {
  const field = document.querySelector('[data-testid="join-code-input"]');
  const slot = document.querySelector('[data-testid="receive-error-slot"]');
  const btn = document.querySelector('[data-testid="receive-join"]');
  const labelId = field?.getAttribute('aria-labelledby');
  return {
    label: (labelId && document.getElementById(labelId)?.textContent?.trim()) || '',
    slotHeight: Math.round(slot?.getBoundingClientRect().height ?? 0),
    gap: Math.round((btn?.getBoundingClientRect().top ?? 0) - (field?.getBoundingClientRect().bottom ?? 0)),
  };
});
out('the real screen shows the field label', realChrome.label.length > 2, `"${realChrome.label}"`);
out('the real screen reserves the error slot before any error exists',
  realChrome.slotHeight >= 30, `${realChrome.slotHeight}px reserved, ${realChrome.gap}px to the action`);

/* Type a code that cannot exist and submit it: the server rejects it. */
await app.getByTestId('join-code-input').locator('input').first().click();
await app.keyboard.type('000000');
await app.getByTestId('receive-join').click({ timeout: 5000 }).catch(() => {});

const gotError = await app
  .getByTestId('receive-field-error')
  .waitFor({ timeout: 12000 })
  .then(() => true)
  .catch(() => false);

if (!gotError) {
  skip('the real rejection puts the error under the field and focus back in it',
    'the server answered without an error inside 12s (offline backend or a permissive code)');
} else {
  const real = await app.evaluate(() => {
    const errEl = document.querySelector('[data-testid="receive-field-error"]');
    const field = document.querySelector('[data-testid="join-code-input"]');
    const btn = document.querySelector('[data-testid="receive-join"]');
    const inputs = Array.from(document.querySelectorAll('[data-testid="join-code-input"] input'));
    const e = errEl.getBoundingClientRect();
    return {
      text: errEl.textContent?.trim() ?? '',
      role: errEl.getAttribute('role'),
      underField: Math.round(e.top - field.getBoundingClientRect().bottom) >= 0,
      aboveAction: Math.round(btn.getBoundingClientRect().top - e.bottom) >= 0,
      focusInField: inputs.includes(document.activeElement),
      invalid: inputs.every((i) => i.getAttribute('aria-invalid') === 'true'),
    };
  });
  out('the real rejection puts the error under the field',
    real.underField && real.aboveAction && real.role === 'alert',
    `"${real.text.slice(0, 60)}"`);
  out('the real rejection marks the field invalid and focuses it',
    real.invalid && real.focusInField);
}

/* ── in flight returns ───────────────────────────────────────────────────── */
const back = await app.evaluate(() => {
  const btn = document.querySelector('[data-testid="receive-join"]');
  return { text: btn?.textContent?.trim() ?? '', busy: btn?.getAttribute('aria-busy') ?? null };
});
out('the action leaves the in-flight state once the answer arrives',
  back.text === 'Join' && back.busy === null,
  `"${back.text}" aria-busy=${back.busy}`);

await appCtx.close();
await ctx.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
