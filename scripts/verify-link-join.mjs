#!/usr/bin/env node
/**
 * verify-link-join — the /s/<code> link and QR route, measured across the
 * cases a phone actually meets.
 *
 * The owner saw a link/QR join fail with nothing to explain it. This gate
 * reproduces every case it can, and fails on the two behaviours that made
 * that failure unreadable:
 *
 *   1. a link that could not be resolved (offline, slow, socket down) used to
 *      say "this link isn't active anymore" — blaming the room for a broken
 *      connection. It must say it could not reach the room, and offer a retry.
 *   2. a dead link offered only "Close", which is not a way forward. It must
 *      offer the six-digit route, and that action must open it.
 *
 * Cases this environment cannot produce (a stale service worker, a stale
 * cached index.html, a room that is full) print NOT VERIFIED with the reason.
 *
 *   BASE_URL=http://localhost:3081 node scripts/verify-link-join.mjs
 */
import { chromium, firefox, webkit } from 'playwright';
import { resolveChrome } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3010';
const exe = resolveChrome();
const results = [];
const out = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const skip = (name, why) => console.log(`NOT VERIFIED ${name} — ${why}`);

const launch = async (type) => {
  try {
    if (type === 'chromium') return await chromium.launch(exe ? { executablePath: exe } : {});
    return await type.launch();
  } catch {
    return null;
  }
};

const browser = await launch('chromium');

/** A room, plus the share link its creator shows. */
async function roomWithLink(ctxOptions = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...ctxOptions });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.getByRole('button', { name: /^send$/i }).first().click();
  await p.getByTestId('send-screen').waitFor({ timeout: 30000 });
  await p.getByTestId('pairing-code').waitFor({ timeout: 20000 });
  // The link lives behind the third segment (code / QR / link) — the way a
  // person reaches it, rather than reading the URL out of the DOM.
  await p
    .locator('#send-segments-tab-link')
    .click({ timeout: 15000 })
    .catch(async () => { await p.getByRole('tab', { name: /link/i }).click(); });
  await p.getByTestId('share-link').waitFor({ timeout: 15000 });
  const link = await p.locator('[title^="http"]').first().getAttribute('title');
  return { ctx, p, link };
}

const joined = async (page) =>
  page
    .locator('textarea')
    .first()
    .waitFor({ timeout: 25000 })
    .then(() => true)
    .catch(() => false);

const noticeFacts = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="dead-link"]');
    if (!el) return null;
    const action = document.querySelector('[data-testid="dead-link-action"]');
    return {
      kind: el.getAttribute('data-kind'),
      text: el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      action: action?.textContent?.trim() ?? '',
    };
  });

/* ── 1. the link, direction A → B ───────────────────────────────────────── */
{
  const { ctx, link } = await roomWithLink();
  const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await bCtx.newPage();
  await b.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ok = await joined(b);
  out('a /s/ link opens the room on the other device', ok, link?.replace(BASE, ''));
  await bCtx.close();
  await ctx.close();
}

/* ── 2. the QR payload (link + ?c=…) ────────────────────────────────────── */
{
  const { ctx, link } = await roomWithLink();
  const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await bCtx.newPage();
  const qrUrl = `${link}?c=428913`;
  await b.goto(qrUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ok = await joined(b);
  out('a QR payload (link + ?c=) still joins', ok, qrUrl.replace(BASE, ''));
  await bCtx.close();
  await ctx.close();
}

/* ── 3. clock skew on the opener ────────────────────────────────────────── */
{
  const { ctx, link } = await roomWithLink();
  const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await bCtx.addInitScript('(() => { const real = Date.now.bind(Date); Date.now = () => real() + 120000; })();');
  const b = await bCtx.newPage();
  await b.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ok = await joined(b);
  const text = await b.evaluate(() => document.body.textContent || '');
  const explained = /expired|clock|time|ask for a new/i.test(text);
  out('a link opened by a device 2 min ahead still joins or says why',
    ok || explained, ok ? 'joined' : 'did not join, and the screen said why');
  await bCtx.close();
  await ctx.close();
}

/* ── 4. an in-app browser ───────────────────────────────────────────────── */
{
  const UA =
    'Mozilla/5.0 (Linux; Android 11; Redmi 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.1';
  const { ctx, link } = await roomWithLink();
  const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
  const b = await bCtx.newPage();
  await b.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ok = await joined(b);
  const notice = await b.evaluate(() => {
    const el = document.querySelector('[data-testid="inapp-notice"]');
    return el ? el.textContent?.replace(/\s+/g, ' ').trim() : null;
  });
  out('inside WhatsApp the link joins, or explains itself with one action',
    ok || Boolean(notice), ok ? 'joined' : `notice: ${notice ?? 'none'}`);
  await bCtx.close();
  await ctx.close();
}

/* ── 5. a dead link ─────────────────────────────────────────────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/s/deadbeef`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shown = await p.getByTestId('dead-link').waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  const facts = shown ? await noticeFacts(p) : null;
  out('a dead link says the room is gone', facts?.kind === 'dead', facts?.text?.slice(0, 80));

  let opened = false;
  if (facts?.action) {
    await p.getByTestId('dead-link-action').click();
    opened = await p.getByTestId('receive-screen').waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  }
  out("the dead link's one action is the six-digit route, and it opens it",
    /six|digit|code/i.test(facts?.action ?? '') && opened,
    `action: "${facts?.action}", opened: ${opened}`);
  await ctx.close();
}

/* ── 6. a room we cannot ask about (signaling socket dead) ──────────────── */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  // The resolve rides the signaling socket. Killing it is the closest this
  // environment gets to "no route": the ack never arrives, the resolve times
  // out, and the screen has to be honest about which failure this is.
  await p.routeWebSocket(/.*/, (ws) => ws.close());
  await p.route('**/api/**', (r) => r.abort());
  await p.goto(`${BASE}/s/deadbeef`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shown = await p.getByTestId('dead-link').waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
  const facts = shown ? await noticeFacts(p) : null;
  out('a link we could not resolve says so, and offers a retry',
    facts?.kind === 'unreachable' && /again/i.test(facts?.action ?? ''),
    facts ? `kind=${facts.kind}, action="${facts.action}"` : 'no notice appeared');
  out('it never blames the room for a connection failure',
    Boolean(facts) && !/isn't active|isn\u2019t active|not active/i.test(facts.text),
    facts?.text?.slice(0, 90));
  await ctx.close();
}

/* ── 7. other engines ───────────────────────────────────────────────────── */
for (const [name, type] of [['webkit', webkit], ['firefox', firefox]]) {
  const other = await launch(type);
  if (!other) {
    skip(`the link joins in ${name}`, `${name} is not installed for Playwright on this machine`);
    continue;
  }
  try {
    const ctxA = await other.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctxA.newPage();
    await a.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await a.getByRole('button', { name: /^send$/i }).first().click();
    await a.getByTestId('pairing-code').waitFor({ timeout: 30000 });
    const link = await a.locator('[title^="http"]').first().getAttribute('title');
    const ctxB = await other.newContext({ viewport: { width: 390, height: 844 } });
    const b = await ctxB.newPage();
    await b.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ok = await joined(b);
    out(`the link joins in ${name}`, ok, link?.replace(BASE, ''));
    await ctxB.close();
    await ctxA.close();
  } catch (err) {
    out(`the link joins in ${name}`, false, String(err).slice(0, 120));
  } finally {
    await other.close();
  }
}

/* ── what this environment cannot produce ───────────────────────────────── */
skip('a stale service worker serving an old shell', 'the dev server registers no service worker; needs two production builds');
skip('a stale cached index.html', 'needs a controlled CDN cache; a local server cannot reproduce it');
skip('a link opened after the room idle TTL', 'the TTL outlasts a gate run; /s/deadbeef exercises the same branch');
skip('the room is full', 'needs six devices past the roster cap; not produced here');

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
