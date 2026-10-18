// Live probe for the C fan-out failure. Mirrors verify-multi-device.mjs steps
// 1:1 up to the text fan-out, then dumps diagnostics from every page.
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await launchBrowser();
  const mk = async (n, logs) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (n === 'A' || /error|failed|warn/i.test(t) || /sched|link_ensure|offer|answer|relay|initiate/i.test(t)) logs.push(`[${n}] ${t}`);
    });
    page.on('pageerror', (e) => logs.push(`[${n}:ERROR] ${e.message}`));
    return page;
  };
  const L = [];
  const A = await mk('A', L);
  const B = await mk('B', L);
  const C = await mk('C', L);

  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);
  console.log('code', code);

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');

  await C.goto(URL, { waitUntil: 'networkidle' });
  await C.getByRole('button', { name: 'Receive' }).first().click();
  const { TOTP } = await import('otpauth');
  const stored = await A.evaluate(() => localStorage.getItem('sharetext.session.v1'));
  const { secret, createdAt } = JSON.parse(stored);
  const totp = new TOTP({ issuer: 'ShareText', label: 'Session', algorithm: 'SHA1', digits: 6, period: 40, secret });
  const freshCode = totp.generate({ timestamp: Date.now() - (createdAt || 0) });
  await C.locator('input[inputmode="numeric"]').fill(freshCode);
  await waitForChat(C, 'C');
  await sleep(2500);

  // Dump rosters as each page sees them.
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) {
    const r = await p.evaluate(() => {
      const anyWin = window;
      return {
        body: document.body.innerText.slice(0, 120).replace(/\n/g, ' | '),
      };
    });
    console.log(n, 'state', JSON.stringify(r));
  }

  // A opens picker, selects both, closes, sends.
  await A.getByTestId('recipient-row').getByRole('button').first().click();
  await sleep(400);
  const options = A.getByRole('option');
  console.log('option count', await options.count());
  await options.nth(0).click();
  await options.nth(1).click();
  await sleep(300);
  await A.getByRole('button', { name: 'Close' }).click().catch(async () => {
    await A.getByTestId('recipient-row').getByRole('button').first().click();
  });
  await sleep(250);
  await A.locator('textarea').first().fill('Probe fan-out text');
  const recipsBefore = await A.evaluate(() => ({
    recipients: (window.__sharetextDebug?.getMessages?.() && null) ?? null,
    sess: (window.__sharetextDebug?.session?.() ?? null),
  }));
  console.log('pre-send debug:', JSON.stringify(recipsBefore));
  const bodyNow = await bodyText(A);
  const stripMatch = bodyNow.match(/To: [^\n]*/);
  console.log('composer strip:', stripMatch ? stripMatch[0] : '(none)');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  for (const at of [3000, 8000, 14000]) {
    await sleep(at === 3000 ? 3000 : at - (at === 8000 ? 3000 : 8000));
    const msgs = await A.evaluate(() => (window.__sharetextDebug?.getMessages?.() || []).map((m) => ({
      id: m.id?.slice(0, 8),
      text: (m.text || '').slice(0, 24),
      textRecipients: m.textRecipients,
      recs: m.attachment?.recipients,
    })));
    console.log(`A t+${at}ms messages:`, JSON.stringify(msgs));
    if ((await bodyText(C)).includes('Probe fan-out text')) { console.log('C got it at t+' + at); break; }
  }

  console.log('B got text:', (await bodyText(B)).includes('Probe fan-out text'));
  console.log('C got text:', (await bodyText(C)).includes('Probe fan-out text'));
  console.log('A summary:', /Sent to all|Sending to/.test(await bodyText(A)));

  // PCM link states on A.
  const pcmState = await A.evaluate(() => {
    const dbg = window.__sharetextDebug;
    return (dbg?.pcmLinks?.() || []).map((id) => id.slice(0, 8));
  }).catch((e) => 'err:' + String(e).slice(0, 60));
  console.log('A pcm links:', JSON.stringify(pcmState));

  // Deep state via the debug hook (DEV only).
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) {
    const st = await p.evaluate(() => {
      const dbg = window.__sharetextDebug;
      const pm = dbg?.peerManager?.();
      return {
        hasPm: !!pm,
        bound: pm?.boundId ?? null,
        dc: pm?.getDataChannel?.()?.readyState ?? null,
      };
    }).catch((e) => ({ err: String(e).slice(0, 80) }));
    console.log(n, 'pm-state', JSON.stringify(st));
  }

  console.log('\n--- DIAG (last 80) ---');
  for (const line of L.slice(-80)) console.log(line);
  await browser.close();
}

main().catch((e) => { console.error('PROBE FAILED', e); process.exit(1); });
