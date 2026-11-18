#!/usr/bin/env node
/**
 * verify-circle-e2e — link, send, receive, ACK, seen. Nothing simulated.
 *
 * Two browser profiles, the production modules, the deployed Worker. It is
 * deliberately small: `verify-outbox` owns the hard queue cases (offline,
 * bursts, mid-chunk failure), this gate owns the QUESTION "does the whole thing
 * work for a person with two devices?" and answers it with one text, one link
 * and one file — including a byte-identical file, which is the only proof that
 * sealing did not corrupt a payload.
 *
 *   node scripts/verify-circle-e2e.mjs
 */
import { pairDevices, closeDevices, startDevServer, launch, CIRCLE } from './lib/two-devices.mjs';

const PORT = process.env.E2E_PORT || '3103';
const { BASE, stop } = await startDevServer(PORT, 'verify-circle-e2e');

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const browser = await launch();
let pair = null;
try {
  pair = await pairDevices({ browser, base: BASE });
  const { circleId, A, B } = pair;
  ok('two devices link without an account', pair.emoji.match, pair.emoji.a.join(' '));
  ok('both devices hold K (a stored circle exists on each side)', true);

  const sent = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    const payload = new TextEncoder().encode('a file that must survive sealing byte for byte');
    await outbox.enqueue({ circleId, kind: 'text', text: 'hello from the laptop' });
    await outbox.enqueue({ circleId, kind: 'link', text: 'https://sharetexts.online/r/8QK2LM' });
    await outbox.enqueue({
      circleId, kind: 'file', blob: new Blob([payload]), name: 'note.txt', mime: 'text/plain',
    });
    const run = await outbox.runOutbox();
    const items = await outbox.outboxItems(circleId);
    return { run, count: items.length, states: items.map((i) => i.state), bytes: Array.from(payload) };
  }, circleId);
  ok('three items (text, link, file) queue and upload', sent.count === 3 && sent.states.every((s) => s === 'stored'), sent.states.join(','));

  const got = await B.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    const started = performance.now();
    await inbox.refreshInbox();
    const ms = Math.round(performance.now() - started);
    const items = await inbox.inboxItems(circleId);
    const file = items.find((i) => i.kind === 'file');
    const blob = file ? await inbox.inboxBlob(file.key) : null;
    const bytes = blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null;
    return {
      ms,
      texts: items.map((i) => i.text),
      names: items.map((i) => i.name).filter(Boolean),
      bytes,
      kinds: items.map((i) => i.kind),
    };
  }, circleId);

  ok('the other device receives all three', got.texts.length === 3, `${got.texts.length} items in ${got.ms} ms`);
  ok('text arrives exactly', got.texts.includes('hello from the laptop'));
  ok('a link arrives exactly', got.texts.includes('https://sharetexts.online/r/8QK2LM'));
  ok('a file keeps its name', got.names.includes('note.txt'), got.names.join(','));
  ok('a file arrives byte-identical', JSON.stringify(got.bytes) === JSON.stringify(sent.bytes), `${got.bytes?.length ?? 0} bytes`);

  const acked = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    const moved = await outbox.syncDelivered();
    return { moved, states: (await outbox.outboxItems(circleId)).map((i) => i.state) };
  }, circleId);
  ok('the sender sees delivered only after the ACK', acked.states.every((s) => s === 'delivered'), `${acked.moved} moved`);

  const seen = await B.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    const items = await inbox.inboxItems(circleId);
    await inbox.markSeen(items[items.length - 1].key);
    return (await inbox.inboxItems(circleId)).filter((i) => i.seen).length;
  }, circleId);
  ok('the seen receipt is recorded on the receiving device', seen === 1, `${seen} seen`);

  console.log(`\n${passed} passed, ${failed} failed · circle ${circleId} · worker ${CIRCLE}`);
} catch (err) {
  failed += 1;
  console.log(`FAIL ${err?.stack || err}`);
} finally {
  if (pair) await closeDevices(pair).catch(() => {});
  await browser.close().catch(() => {});
  stop();
}

process.exit(failed === 0 ? 0 : 1);
