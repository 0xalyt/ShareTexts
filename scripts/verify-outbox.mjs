#!/usr/bin/env node
/**
 * verify-outbox — an item survives the tab, and arrives exactly once.
 *
 * Two real browser profiles, the production modules, the deployed Worker:
 *
 *   1. A queues three items while B is closed; A reloads; A goes offline and
 *      comes back; B opens later and gets all three, once, in order.
 *   2. 25 rapid sends: no loss, no duplicates.
 *   3. A chunk fails mid-upload: the pass stops, the next pass resumes at the
 *      chunk that did not land — chunk 0 is never sent twice.
 *   4. The other device's ACK turns `stored` into `delivered`, and only an ACK
 *      does that.
 *
 * It also reports the number the owner asked for: how long B took, from opening
 * the app to holding the queued items.
 *
 *   node scripts/verify-outbox.mjs
 */
import { pairDevices, closeDevices, startDevServer, launch, CIRCLE } from './lib/two-devices.mjs';

const PORT = process.env.OUTBOX_PORT || '3102';
const { BASE, stop } = await startDevServer(PORT, 'verify-outbox');

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
const t0 = Date.now();
try {
  pair = await pairDevices({ browser, base: BASE });
  const { circleId } = pair;
  let { A, B } = pair;

  ok('two devices are linked and compare the same four emoji', pair.emoji.match, pair.emoji.a.join(' '));

  // ── 1. three items queued while B is closed ───────────────────────────────
  // Close the TAB, not the browser profile: a closed context is a wiped
  // device, and "open the app later" means the same phone, not a new one.
  await B.page.close();
  const first = await A.page.evaluate(async ({ circleId }) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    await outbox.enqueue({ circleId, kind: 'text', text: 'one' });
    await outbox.enqueue({ circleId, kind: 'link', text: 'https://example.com/two' });
    await outbox.enqueue({ circleId, kind: 'text', text: 'three' });
    const run = await outbox.runOutbox();
    const items = await outbox.outboxItems(circleId);
    return { run, states: items.map((i) => i.state), count: items.length };
  }, { circleId });
  ok('three items queue and upload while the other device is closed', first.count === 3 && first.states.every((s) => s === 'stored'), first.states.join(','));

  // A reloads: the queue is on disk, not in memory.
  await A.page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    return (await outbox.outboxItems(circleId)).map((i) => i.state);
  }, circleId);
  ok('the queue survives a reload of the sending tab', afterReload.length === 3 && afterReload.every((s) => s === 'stored'), afterReload.join(','));

  // Offline: nothing is consumed, nothing is lost.
  await A.context.setOffline(true);
  const offline = await A.page.evaluate(async ({ circleId }) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    await outbox.enqueue({ circleId, kind: 'text', text: 'four' });
    const run = await outbox.runOutbox();
    const items = await outbox.outboxItems(circleId);
    return { skipped: run.skipped, queued: items.filter((i) => i.state === 'queued').length };
  }, { circleId });
  ok('offline queues instead of failing', offline.skipped === 'offline' && offline.queued === 1, `skipped=${offline.skipped} queued=${offline.queued}`);

  await A.context.setOffline(false);
  const back = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    return outbox.runOutbox();
  }, circleId);
  ok('the queued item goes when the network returns', back.uploaded === 1, `uploaded=${back.uploaded}`);

  // ── B opens later and pulls ───────────────────────────────────────────────
  const bContext = B.context;
  B = await (async () => {
    const page = await bContext.newPage();
    const at = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    return { ...B, page, openedAt: at };
  })();

  const arrival = await B.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    const store = await import('/src/lib/circle/store.ts');
    const keys = await import('/src/lib/circle/keys.ts');
    const api = await import('/src/lib/circle/api.ts');
    const started = performance.now();
    const res = await inbox.refreshInbox();
    const items = await inbox.inboxItems(circleId);
    const diag = { circles: (await store.listCircles()).length, me: (await keys.ensureDeviceIdentity()).deviceId };
    try {
      const client = new api.CircleClient('https://sharetext-signaling.alighttt.workers.dev', await keys.ensureDeviceIdentity());
      const mail = await client.items(circleId);
      diag.mail = mail.items.map((m) => `${m.fromDevice}:${m.acked.length}`);
    } catch (e) {
      diag.mailError = String(e?.code || e);
    }
    return {
      diag,
      ms: Math.round(performance.now() - started),
      received: res.reduce((n, r) => n + r.received, 0),
      texts: items.map((i) => i.text).filter((t) => typeof t === 'string'),
      ids: items.map((i) => i.itemId),
      errors: res.map((r) => r.error).filter(Boolean),
    };
  }, circleId);

  ok('a device that opens later gets every queued item', arrival.texts.length === 4,
    `${arrival.texts.length} items in ${arrival.ms} ms · ${JSON.stringify(arrival.diag)}${arrival.errors.length ? ` · errors ${arrival.errors.join(',')}` : ''}`);
  ok('the items arrive in the order they were sent', arrival.texts.join('|') === 'one|https://example.com/two|three|four', arrival.texts.join('|'));
  ok('nothing arrives twice', new Set(arrival.ids).size === arrival.ids.length, `${arrival.ids.length} ids`);
  // The owner's target is "within 2 s of opening the app". Two numbers, not
  // one, because they have different owners: the pull is this milestone's, the
  // app's boot before the pull is the landing page's. Both are reported, and
  // only the pull is asserted here — the total is measured and written into
  // M4-report.md as it stands, not quietly redefined as a pass.
  const sinceOpen = Date.now() - B.openedAt;
  ok('the pull itself finishes within 2 s', arrival.ms <= 2000,
    `${arrival.ms} ms for ${arrival.texts.length} items`);
  console.log(`INFO  end to end, page open → items on screen: ${sinceOpen} ms (app boot ${sinceOpen - arrival.ms} ms + pull ${arrival.ms} ms)`);

  // ── 2. 25 rapid sends ─────────────────────────────────────────────────────
  const burst = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    for (let i = 0; i < 25; i++) {
      await outbox.enqueue({ circleId, kind: 'text', text: `burst ${i}` });
    }
    const run = await outbox.runOutbox();
    return { uploaded: run.uploaded, failed: run.failed };
  }, circleId);
  const got = await B.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    await inbox.refreshInbox();
    const items = await inbox.inboxItems(circleId);
    const bursts = items.map((i) => i.text).filter((t) => typeof t === 'string' && t.startsWith('burst '));
    return { bursts, unique: new Set(bursts).size, total: items.length };
  }, circleId);
  ok('25 rapid sends upload without loss', burst.uploaded === 25 && burst.failed === 0, `uploaded=${burst.uploaded} failed=${burst.failed}`);
  ok('25 rapid sends arrive once each, in order', got.bursts.length === 25 && got.unique === 25
    && got.bursts.join('|') === Array.from({ length: 25 }, (_, i) => `burst ${i}`).join('|'), `${got.bursts.length} items, ${got.unique} unique`);

  // ── 3. a chunk fails mid-upload, and the next pass resumes ────────────────
  const resume = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');

    // Two and a half megabytes: three sealed chunks.
    const blob = new Blob([new Uint8Array(2_500_000)]);
    const item = await outbox.enqueue({ circleId, kind: 'file', blob, name: 'big.bin', mime: 'application/octet-stream' });

    const original = window.fetch;
    const puts = [];
    window.__failChunk1 = 6;
    window.fetch = (url, init) => {
      const u = String(url);
      if (init && init.method === 'PUT') {
        puts.push(u);
        if (/\/chunk\/1$/.test(u) && window.__failChunk1 > 0) {
          window.__failChunk1 -= 1;
          return Promise.reject(new TypeError('simulated drop'));
        }
      }
      return original(url, init);
    };

    const firstPass = await outbox.runOutbox();
    window.__failChunk1 = 0;
    const midway = (await outbox.outboxItems(circleId)).find((i) => i.itemId === item.itemId);

    // The ladder says 1 s + jitter before the next attempt. Waiting for it is
    // the point: a resume that ignores the backoff would be a different test.
    await new Promise((r) => setTimeout(r, 2000));
    const putsBeforeSecond = puts.length;
    const secondPass = await outbox.runOutbox();
    const done = (await outbox.outboxItems(circleId)).find((i) => i.itemId === item.itemId);
    window.fetch = original;

    // Counted per pass: a clock-skew retry legitimately repeats a PUT, so the
    // claim under test is "the SECOND pass does not restart the upload", not
    // "chunk 0 was PUT exactly once since the beginning of time".
    const chunk0First = puts.slice(0, putsBeforeSecond).filter((u) => /\/chunk\/0$/.test(u)).length;
    const chunk0After = puts.slice(putsBeforeSecond).filter((u) => /\/chunk\/0$/.test(u)).length;
    const chunk1After = puts.slice(putsBeforeSecond).filter((u) => /\/chunk\/1$/.test(u)).length;
    return {
      firstPass,
      secondPass,
      midway: midway && { state: midway.state, doneChunks: midway.doneChunks, chunks: midway.chunks, attempts: midway.attempts },
      finalState: done?.state,
      finalDone: done?.doneChunks,
      total: done?.chunks,
      chunk0First,
      chunk0After,
      chunk1After,
    };
  }, circleId);

  ok('a failed chunk stops the pass instead of lying', resume.midway?.state === 'queued' && resume.midway.doneChunks >= 1,
    `state=${resume.midway?.state} done=${resume.midway?.doneChunks}/${resume.midway?.chunks} attempts=${resume.midway?.attempts}`);
  ok('the next pass resumes and completes the item', resume.finalState === 'stored' && resume.finalDone === resume.total,
    `state=${resume.finalState} ${resume.finalDone}/${resume.total} · pass2 ${JSON.stringify(resume.secondPass)}`);
  ok('the resumed pass starts at the chunk that failed, not at chunk 0', resume.chunk0After === 0 && resume.chunk1After >= 1,
    `chunk0 PUTs after resume=${resume.chunk0After}, chunk1=${resume.chunk1After}, chunk0 before=${resume.chunk0First}`);

  // ── 4. ACK is the only thing that says delivered ──────────────────────────
  // B pulls once more so every uploaded item has genuinely been received; an
  // item the other device has not taken yet must NOT look delivered.
  const late = await B.page.evaluate(async () => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    return inbox.refreshInbox();
  });
  ok('the last uploaded item is picked up by a later pull', late.some((r) => r.received >= 1), JSON.stringify(late.map((r) => r.received)));

  const beforeAck = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    return (await outbox.outboxItems(circleId)).map((i) => i.state);
  }, circleId);
  const ackRun = await A.page.evaluate(async (circleId) => {
    const outbox = await import('/src/lib/circle/outbox.ts');
    const moved = await outbox.syncDelivered();
    return { moved, states: (await outbox.outboxItems(circleId)).map((i) => i.state) };
  }, circleId);
  // Every item that was sitting in the mailbox is delivered now. The queued
  // one is the resume test's item, which never got that far — it must NOT be
  // promoted to delivered by a seller-side guess.
  const storedBefore = beforeAck.filter((s) => s === 'stored' || s === 'delivered').length;
  ok('items the other device ACKed become delivered', ackRun.states.filter((s) => s === 'delivered').length === storedBefore
    && ackRun.states.filter((s) => s === 'queued').length === beforeAck.filter((s) => s === 'queued').length,
  `${ackRun.moved} moved, before=${storedBefore} stored, states=${[...new Set(ackRun.states)].join(',')}`);

  const seen = await B.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    const items = await inbox.inboxItems(circleId);
    await inbox.markSeen(items[0].key);
    const after = await inbox.inboxItems(circleId);
    return after.filter((i) => i.seen).length;
  }, circleId);
  ok('a seen receipt sticks', seen === 1, `${seen} seen`);

  console.log(`\n${passed} passed, ${failed} failed · circle ${circleId} · worker ${CIRCLE} · ${Math.round((Date.now() - t0) / 1000)} s`);
} catch (err) {
  failed += 1;
  console.log(`FAIL ${err?.stack || err}`);
} finally {
  if (pair) await closeDevices(pair).catch(() => {});
  await browser.close().catch(() => {});
  stop();
}

process.exit(failed === 0 ? 0 : 1);
