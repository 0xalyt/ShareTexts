import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { waitForInvitation } = await tsImport('../src/lib/invitation.ts', import.meta.url);
const originalTimer = globalThis.setTimeout;
const waits = [];
globalThis.setTimeout = (callback, ms) => { waits.push(ms); queueMicrotask(callback); return 0; };
try {
  let attempts = 0;
  const found = await waitForInvitation(async () => ++attempts < 3 ? 'not_found' : 'registered', result => result === 'not_found');
  assert.equal(found, 'registered');
  assert.deepEqual(waits.splice(0), [500, 1000]);
  attempts = 0;
  await waitForInvitation(async () => { attempts++; return 'not_found'; }, result => result === 'not_found');
  assert.equal(attempts, 7, 'dead invitations have a firm retry bound');
  assert.equal(waits.reduce((sum, value) => sum + value, 0), 10_500);
  waits.length = 0;
  attempts = 0;
  await waitForInvitation(async () => { attempts++; return 'room_full'; }, result => result === 'not_found');
  assert.equal(attempts, 1, 'real refusals do not retry');
  let cancelled = false;
  globalThis.setTimeout = callback => { cancelled = true; queueMicrotask(callback); return 0; };
  attempts = 0;
  await waitForInvitation(async () => { attempts++; return 'not_found'; }, () => !cancelled);
  assert.equal(attempts, 1, 'cancel during the delay prevents further network operations');
  console.log('PASS provisional invitation: registration race, bounded missing-room retry, refusal, cancellation');
} finally { globalThis.setTimeout = originalTimer; }
