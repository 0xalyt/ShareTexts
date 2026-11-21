import assert from 'node:assert/strict';
import { launchBrowser, URL, readLiveCode } from './lib.mjs';

const browser = await launchBrowser();
try {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const A = await a.newPage();
  const B = await b.newPage();
  await A.goto(URL);
  await A.getByTestId('home-send').click();
  const code = await readLiveCode(A);
  await B.goto(URL);
  await B.getByTestId('home-receive').click();
  await B.getByTestId('join-code-input').locator('input').first().fill(code);
  await B.getByTestId('composer').first().waitFor();

  for (const scenario of ['metadata-first', 'hash-first', 'hash-before-render', 'late-hash', 'empty', 'mismatch', 'missing-hash']) {
    const id = await B.evaluate(async scenario => {
      const { sha256Hex } = await import('/src/lib/session/fileIntegrity.ts');
      const pm = window.__sharetextDebug.peerManager();
      const id = crypto.randomUUID();
      const transferId = crypto.randomUUID();
      const blob = new Blob([scenario === 'empty' ? '' : 'integrity regression']);
      const checksum = scenario === 'mismatch' ? '0'.repeat(64) : await sha256Hex(blob);
      const metadata = () => pm.onMessage(JSON.stringify({
        id, sender: 'partner', text: '', timestamp: Date.now(),
        attachment: { id: transferId, name: `${scenario}.txt`, type: 'file', size: blob.size, status: 'sending' },
      }));
      const hash = () => pm.onFileHash(transferId, checksum);
      if (scenario === 'hash-first') hash();
      metadata();
      if (scenario === 'metadata-first') await new Promise(resolve => setTimeout(resolve, 0));
      if (!['hash-first', 'late-hash', 'missing-hash'].includes(scenario)) hash();
      pm.onFileComplete(transferId, blob);
      if (scenario === 'late-hash') {
        await new Promise(resolve => setTimeout(resolve, 4500));
        hash();
      }
      return id;
    }, scenario);
    await B.waitForFunction(({ id, scenario }) => {
      const a = window.__sharetextDebug.getMessages().find(m => m.id === id)?.attachment;
      return scenario === 'mismatch' ? a?.status === 'failed' && a.note === 'checksum-mismatch' && a.verified === false
        : scenario === 'missing-hash' ? a?.status === 'complete' && !a.verified
        : a?.status === 'complete' && a.verified === true;
    }, { id, scenario }, { timeout: 10000 });
    const result = await B.evaluate(id => {
      const a = window.__sharetextDebug.getMessages().find(m => m.id === id).attachment;
      return { status: a.status, verified: a.verified === true };
    }, id);
    assert.equal(result.verified, !['mismatch', 'missing-hash'].includes(scenario));
    console.log(`${scenario}: status=${result.status}, verified=${result.verified}`);
  }
  console.log('PASS: integrity handles checksum/metadata/completion ordering without a render or deadline dependency');
} finally {
  await browser.close();
}
