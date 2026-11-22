import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/lib/space/reminders.ts'], bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'reminder-api', setup(build) {
    build.onResolve({ filter: /^\.\/api$/ }, () => ({ path: 'api', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export const subscribeReminder = async () => { globalThis.saved++; };
      export const unsubscribeReminder = async () => {};
      export const spaceApiBase = () => 'http://localhost:8787';
    ` }));
  } }],
});
const { enableReminder, requestReminderPermission } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let registered = 0;
let queried = 0;
let subscribed = 0;
globalThis.saved = 0;
globalThis.window = { isSecureContext: true, PushManager: {}, Notification: {} };
globalThis.Notification = { permission: 'default', requestPermission: async () => 'default' };
const pushManager = {
  getSubscription: async () => { queried++; return { toJSON: () => ({ endpoint: 'test' }) }; },
  subscribe: async () => { subscribed++; return { toJSON: () => ({ endpoint: 'test' }) }; },
};
const reg = { pushManager };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  serviceWorker: { register: async () => { registered++; return reg; }, ready: Promise.resolve(reg) },
} });

for (const permission of ['default', 'denied']) {
  Notification.permission = permission;
  assert.equal(await requestReminderPermission(), false);
  assert.equal((await enableReminder('space')).ok, false);
}
assert.equal(registered, 0);
assert.equal(queried, 0);
console.log('PASS default/dismissed and denied permission never touch PushManager');

Notification.permission = 'default';
let requested = false;
Notification.requestPermission = () => { requested = true; return Promise.resolve('granted'); };
const pending = requestReminderPermission();
assert.equal(requested, true, 'permission request starts synchronously in the gesture');
assert.equal(await pending, true);
Notification.permission = 'granted';
assert.equal((await enableReminder('space')).ok, true);
assert.equal(saved, 1);
assert.equal(queried, 1);
assert.equal(subscribed, 0);
console.log('PASS granted permission reuses and saves an existing subscription');

pushManager.getSubscription = async () => null;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ publicKey: 'BA' }) });
assert.equal((await enableReminder('space')).ok, true);
assert.equal(subscribed, 1);
assert.equal(saved, 2);
console.log('PASS empty subscription creates and saves a subscription');

pushManager.getSubscription = async () => { throw new Error('push unavailable'); };
assert.equal((await enableReminder('space')).ok, false);
Notification.permission = 'default';
Notification.requestPermission = async () => { throw new Error('permission unavailable'); };
assert.equal(await requestReminderPermission(), false);
delete window.PushManager;
assert.equal(await requestReminderPermission(), false);
assert.equal((await enableReminder('space')).reason, 'unsupported');
console.log('PASS permission errors, push errors and unsupported contexts fall back without throwing');
