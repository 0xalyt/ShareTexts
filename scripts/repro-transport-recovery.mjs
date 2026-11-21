import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  for (const mode of (process.env.MODE ? [process.env.MODE] : ['rejected-url', 'no-offer', 'all-rejected'])) {
    const a = await browser.newContext();
    const b = await browser.newContext();
    for (const context of [a, b]) await context.addInitScript(mode => {
      const Native = window.RTCPeerConnection;
      window.transportProbes = { rejected: 0, closed: 0, offers: 0 };
      window.RTCPeerConnection = class extends Native {
        constructor(config) {
          const urls = config?.iceServers?.flatMap(s => Array.isArray(s.urls) ? s.urls : [s.urls]) ?? [];
          if (mode === 'all-rejected' || (mode === 'rejected-url' && urls.some(u => u.includes('?')))) {
            window.transportProbes.rejected++;
            throw new DOMException('Rejected ICE URL', 'SyntaxError');
          }
          super(config);
        }
        close() { window.transportProbes.closed++; super.close(); }
        createOffer(options) {
          window.transportProbes.offers++;
          if (mode === 'no-offer') return new Promise(() => {});
          return super.createOffer(options);
        }
      };
    }, mode);
    const A = await a.newPage();
    const B = await b.newPage();
    await A.goto(URL);
    await A.getByTestId('home-send').click();
    const code = await readLiveCode(A);
    await B.goto(URL);
    await B.getByTestId('home-receive').click();
    await B.getByTestId('join-code-input').locator('input').first().fill(code);
    await B.getByTestId('composer').first().waitFor({ timeout: 15000 });
    await A.getByTestId('composer').first().waitFor({ timeout: 15000 });
    for (const [sender, receiver, text] of [[A, B, `${mode} A to B`], [B, A, `${mode} B to A`]]) {
      await sender.locator('textarea').first().fill(text);
      await sender.getByRole('button', { name: 'Send', exact: true }).click();
      await receiver.getByText(text, { exact: true }).waitFor({ timeout: 15000 });
    }
    if (mode === 'rejected-url') {
      const probes = await A.evaluate(() => window.transportProbes);
      assert.ok(probes.rejected > 0 && probes.closed > 0, JSON.stringify(probes));
    }
    if (mode === 'no-offer' || mode === 'all-rejected') {
      const ready = await A.evaluate(async () => {
        const peer = window.__sharetextDebug.peerManager();
        const before = window.transportProbes.offers;
        const results = await Promise.all([peer.ensureOpen(1000), peer.ensureOpen(1000), peer.ensureOpen(1000)]);
        return { results, before, after: window.transportProbes.offers };
      });
      assert.deepEqual(ready.results, [true, true, true], 'relay must remain usable for queued recipients');
      assert.equal(ready.before, ready.after, 'ready relay must not restart negotiation');
    }
    console.log(`PASS: ${mode} reaches both composers and delivers both directions`);
    await a.close();
    await b.close();
  }
} finally {
  await browser.close();
}
