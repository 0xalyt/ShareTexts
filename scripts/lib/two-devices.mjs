/**
 * two-devices.mjs — two real browsers, one linked circle.
 *
 * The M4 gates all need the same expensive setup: a dev server serving the real
 * `src/lib/circle/*.ts`, two isolated browser profiles, and the production
 * pairing flow run end to end so both sides genuinely hold K. Doing that setup
 * four times would mean four chances to disagree about it, so it lives here.
 *
 * Nothing in here re-implements the product: every step calls the shipped
 * module through Vite, in a browser, against the deployed Worker. That is also
 * why the gates measure CORS, IndexedDB and WebCrypto as shipped rather than a
 * Node-friendly imitation of them.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { resolveChrome } from '../lib.mjs';

export const CIRCLE = process.env.CIRCLE_URL || 'https://sharetext-signaling.alighttt.workers.dev';

/**
 * Start the app's own dev server on a gate-owned port. The shell exports
 * `PORT=0`, so every gate that needs a server names its port explicitly.
 */
export async function startDevServer(port, label) {
  mkdirSync('audit/tmp', { recursive: true });
  const logFd = openSync(`audit/tmp/${label}-server.log`, 'a');
  const server = spawn('npm', ['run', 'dev'], {
    shell: true,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', logFd, logFd],
  });
  const BASE = `http://localhost:${port}`;
  const stop = () => {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-server.pid, 'SIGTERM');
      }
    } catch {
      /* already gone */
    }
  };
  let up = false;
  for (let i = 0; i < 90 && !up; i += 1) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) });
      up = res.ok;
    } catch {
      /* not yet */
    }
    if (!up) await sleep(1000);
  }
  if (!up) {
    stop();
    throw new Error(`dev server never answered on ${BASE}`);
  }
  return { BASE, stop };
}

export async function launch() {
  return chromium.launch({ executablePath: resolveChrome() });
}

async function openDevice(browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Wait until a page has the circle modules importable (Vite is serving them). */
async function warm(page) {
  await page.evaluate(async () => {
    await import('/src/lib/circle/keys.ts');
    await import('/src/lib/circle/outbox.ts');
    await import('/src/lib/circle/inbox.ts');
  });
}

/**
 * Create a circle on A, join it from B, approve, and persist K on both sides —
 * the shipped four moves, including the four emoji, which this returns so a
 * caller can assert both screens agreed.
 */
export async function pairDevices({ browser, base }) {
  const A = await openDevice(browser, base);
  const B = await openDevice(browser, base);
  await warm(A.page);
  await warm(B.page);

  const circleId = crypto.randomUUID();

  const a = await A.page.evaluate(async ({ circleId, CIRCLE }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const api = await import('/src/lib/circle/api.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const store = await import('/src/lib/circle/store.ts');
    const id = await keys.ensureDeviceIdentity();
    const client = new api.CircleClient(CIRCLE, id);
    const material = await pairing.createCircle(client, circleId);
    // saveCircle seals K under the device wrap key and zeroes the buffer.
    await store.saveCircle({ circleId, epoch: 1, createdAt: Date.now(), key: material.key, keyRaw: material.keyRaw });
    const invite = await pairing.startInvite(client, circleId);
    return { deviceId: id.deviceId, dhPub: id.dhPub, invite };
  }, { circleId, CIRCLE });

  const b = await B.page.evaluate(async ({ circleId, invite, CIRCLE }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const api = await import('/src/lib/circle/api.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const id = await keys.ensureDeviceIdentity();
    const client = new api.CircleClient(CIRCLE, id);
    const joined = await pairing.joinWithInvite(client, {
      circleId, inviteId: invite.inviteId, code: invite.code,
    });
    return { deviceId: id.deviceId, dhPub: id.dhPub, transcript: joined.transcript };
  }, { circleId, invite: a.invite, CIRCLE });

  const sasA = await A.page.evaluate(async ({ circleId, theirDhPub, joinSecret, transcript }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const id = await keys.ensureDeviceIdentity();
    return pairing.comparisonEmoji(id.dh, theirDhPub, joinSecret, transcript);
  }, { circleId, theirDhPub: b.dhPub, joinSecret: a.invite.joinSecret, transcript: b.transcript });

  const sasB = await B.page.evaluate(async ({ theirDhPub, joinSecret, transcript }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const id = await keys.ensureDeviceIdentity();
    return pairing.comparisonEmoji(id.dh, theirDhPub, joinSecret, transcript);
  }, { theirDhPub: a.dhPub, joinSecret: a.invite.joinSecret, transcript: b.transcript });

  const approval = await A.page.evaluate(async ({ circleId, CIRCLE }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const api = await import('/src/lib/circle/api.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const store = await import('/src/lib/circle/store.ts');
    const id = await keys.ensureDeviceIdentity();
    const client = new api.CircleClient(CIRCLE, id);
    const pending = await pairing.pendingJoiner(client, circleId);
    if (!pending) throw new Error('NO_PENDING');
    const circle = await store.openStoredCircle(circleId);
    const keyRaw = await store.circleKeyBytes(circleId);
    const out = await pairing.approveJoiner({
      client, material: { circleId, keyRaw, key: circle.key }, joiner: pending, myDh: id.dh,
    });
    keyRaw.fill(0);
    return out;
  }, { circleId, CIRCLE });

  const joined = await B.page.evaluate(async ({ circleId, inviterDhPub, wrapped, epoch }) => {
    const keys = await import('/src/lib/circle/keys.ts');
    const pairing = await import('/src/lib/circle/pairing.ts');
    const seal = await import('/src/lib/circle/seal.ts');
    const store = await import('/src/lib/circle/store.ts');
    const id = await keys.ensureDeviceIdentity();
    const raw = await pairing.unwrapRawFromInviter(id.dh, inviterDhPub, wrapped, circleId);
    const key = await seal.importCircleKey(raw);
    // saveCircle seals the copy and wipes `raw`.
    await store.saveCircle({ circleId, epoch, createdAt: Date.now(), key, keyRaw: raw });
    return { deviceId: id.deviceId };
  }, { circleId, inviterDhPub: a.dhPub, wrapped: approval.wrapped, epoch: approval.epoch });

  return {
    circleId,
    A: { ...A, deviceId: a.deviceId },
    B: { ...B, deviceId: joined.deviceId },
    emoji: { a: sasA, b: sasB, match: sasA.join(' ') === sasB.join(' ') },
    invite: a.invite,
  };
}

/** Read the plaintext of one circle item from a page, for assertions. */
export async function inboxSnapshot(device, circleId) {
  return device.page.evaluate(async (circleId) => {
    const inbox = await import('/src/lib/circle/inbox.ts');
    const items = await inbox.inboxItems(circleId);
    return items.map((i) => ({ itemId: i.itemId, kind: i.kind, text: i.text, name: i.name, seen: i.seen, size: i.size }));
  }, circleId);
}

export async function closeDevices(pair) {
  await pair.A.context.close().catch(() => {});
  await pair.B.context.close().catch(() => {});
}
