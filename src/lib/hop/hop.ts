/**
 * hop.ts — linked devices, as one small API over the Circle engine.
 *
 * The Circle modules (`../circle/*`) already seal, queue, upload, pull and
 * acknowledge. This file is the product on top: one circle per browser
 * ("My devices"), a link that carries everything the second device needs, the
 * four-emoji check, device names, and a merged timeline.
 *
 * The link is `#hop=<circleId>.<joinSecret>.<inviter's ECDH point>`. All three
 * parts live in the URL fragment, which browsers never send to a server. The
 * join secret proves the scanner saw this screen; the point lets the scanner
 * derive the four emoji before anyone has approved anything.
 *
 * Lazy by contract: nothing in the entry chunk imports this file.
 */
import { CircleClient, inviteIdFor, type CircleMember } from '../circle/api';
import { ensureDeviceIdentity, isCircleCapable, requestPersistence, type DeviceIdentity } from '../circle/keys';
import { approveJoiner, comparisonEmoji, createCircle, startInvite, unwrapRawFromInviter } from '../circle/pairing';
import { circleKeyBytes, forgetCircle, listCircles, openStoredCircle, saveCircle } from '../circle/store';
import { b64u, fromB64u, importCircleKey } from '../circle/seal';
import { CIRCLE_ORIGIN } from '../circle/endpoint';
import { cancelItem, enqueue, outboxItems, outboxItemState, retryItem, runOutbox, startOutbox, syncDelivered } from '../circle/outbox';
import { clearInbox, inboxBlob, inboxItems, markSeen, onInboxPull, refreshInbox, startInbox } from '../circle/inbox';
import { idbAll, idbDelete, idbPut } from '../circle/idb';
import type { ItemKind } from '../circle/items';
import type { ItemState } from '../itemState';
import { DEVICE_NAME_KEY } from '../session/deviceIdentity';
import { readHopCache, writeHopCache, type HopDevice, type HopLink } from './flag';

/** The mailbox seals a whole item in memory; bigger files belong to a live room. */
export const HOP_MAX_BYTES = 25 * 1024 * 1024;
const HELLO_MIME = 'application/x-sharetexts-device';
const AUTOCOPY_KEY = 'sharetext.hop.autocopy';
const POLL_MS = 2000;

const SENT_DB = 'sharetext-hop';
const SENT_STORE = 'sent';
const sentUpgrade = (db: IDBDatabase) => {
  if (!db.objectStoreNames.contains(SENT_STORE)) db.createObjectStore(SENT_STORE, { keyPath: 'itemId' });
};

interface SentRecord {
  itemId: string;
  circleId: string;
  kind: ItemKind;
  text?: string;
  name?: string;
  size: number;
  at: number;
}

export type HopProblem =
  | 'UNSUPPORTED' | 'OFFLINE' | 'EXPIRED' | 'USED' | 'MISMATCH' | 'ALREADY_LINKED' | 'FULL' | 'TOO_BIG' | 'STORAGE' | 'UNKNOWN';

export class HopError extends Error {
  constructor(readonly problem: HopProblem) {
    super(problem);
    this.name = 'HopError';
  }
}

function problemOf(err: unknown): HopProblem {
  if (err instanceof HopError) return err.problem;
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'INVITE_EXPIRED' || code === 'NO_INVITE' || code === 'NO_CIRCLE') return 'EXPIRED';
  if (code === 'INVITE_USED') return 'USED';
  if (code === 'CIRCLE_FULL') return 'FULL';
  if (code === 'STORAGE') return 'STORAGE';
  if (code === 'TOO_BIG') return 'TOO_BIG';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'OFFLINE';
  if (err instanceof TypeError) return 'OFFLINE';
  return 'UNKNOWN';
}

/** Run a step and turn whatever it throws into a HopError the UI can word. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw err instanceof HopError ? err : new HopError(problemOf(err));
  }
}

async function ctx(): Promise<{ identity: DeviceIdentity; client: CircleClient }> {
  if (!(await isCircleCapable())) throw new HopError('UNSUPPORTED');
  const identity = await ensureDeviceIdentity();
  return { identity, client: new CircleClient(CIRCLE_ORIGIN, identity) };
}

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

/* A P-256 SPKI is a fixed 26-byte header plus the 65-byte point. Only the
   point travels in the link, which keeps the QR a third smaller. */
const SPKI_P256 = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);
function pointOf(spki: string): string {
  const bytes = fromB64u(spki);
  return bytes.length === 91 ? b64u(bytes.slice(26)) : spki;
}
function spkiOf(point: string): string {
  const bytes = fromB64u(point);
  if (bytes.length !== 65) return point;
  const out = new Uint8Array(91);
  out.set(SPKI_P256);
  out.set(bytes, 26);
  return b64u(out);
}
const sameKey = (a: string, b: string): boolean => {
  const x = fromB64u(a);
  const y = fromB64u(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** Both sides compute this themselves; the server's copy is never trusted. */
async function transcriptFor(circleId: string, inviteId: string, joinerDeviceId: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${circleId}:${inviteId}:${joinerDeviceId}`)));
}

function myLabel(identity: DeviceIdentity): string {
  try {
    const name = localStorage.getItem(DEVICE_NAME_KEY)?.trim();
    if (name) return name.slice(0, 40);
  } catch { /* fall through */ }
  return identity.label;
}

/* ── the circle and its devices ─────────────────────────────────────────── */

async function myCircleId(): Promise<string | null> {
  const cached = readHopCache()?.circleId;
  const circles = await listCircles();
  if (cached && circles.some((c) => c.circleId === cached)) return cached;
  return circles[0]?.circleId ?? null;
}

async function hello(circleId: string): Promise<void> {
  const { identity } = await ctx();
  await enqueue({ circleId, kind: 'text', text: JSON.stringify({ label: myLabel(identity) }), mime: HELLO_MIME });
  void runOutbox().catch(() => {});
}

async function labelsFromInbox(circleId: string): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const item of await inboxItems(circleId)) {
    if (item.mime !== HELLO_MIME || !item.text) continue;
    try {
      const label = String((JSON.parse(item.text) as { label?: string }).label ?? '').trim().slice(0, 40);
      if (label) labels.set(item.fromDevice, label);
    } catch { /* a malformed hello names nobody */ }
  }
  return labels;
}

/**
 * Two laptops of the same kind both call themselves "Linux PC". Number the
 * repeats in the order the devices joined, so every device in the circle
 * reaches the same names ("Linux PC", "Linux PC 2") without renaming anyone.
 */
function distinctLabels(members: Array<{ deviceId: string; label: string; joinedAt: number }>): Map<string, { label: string; raw: string }> {
  const ordered = [...members].sort((a, b) => a.joinedAt - b.joinedAt || a.deviceId.localeCompare(b.deviceId));
  const key = (l: string) => l.trim().toLocaleLowerCase();
  const taken = new Set(ordered.map((m) => key(m.label)));
  const used = new Set<string>();
  const out = new Map<string, { label: string; raw: string }>();
  for (const m of ordered) {
    let label = m.label;
    if (label && used.has(key(label))) {
      let n = 2;
      while (taken.has(key(`${m.label} ${n}`)) || used.has(key(`${m.label} ${n}`))) n += 1;
      label = `${m.label} ${n}`;
    }
    if (label) used.add(key(label));
    out.set(m.deviceId, { label, raw: m.label });
  }
  return out;
}

/**
 * Ask the mailbox who is in the circle and refresh the cached names. A device
 * that sees a new member introduces itself, so the newcomer learns every name
 * without anyone holding a directory.
 */
export async function refreshDevices(): Promise<HopDevice[]> {
  const circleId = await myCircleId();
  if (!circleId) {
    writeHopCache(null);
    return [];
  }
  const previous = readHopCache();
  let devices = previous?.circleId === circleId ? previous.devices : [];
  let introducedAs = previous?.circleId === circleId ? previous.introducedAs : undefined;
  try {
    const { identity, client } = await ctx();
    const { members } = await client.members(circleId);
    const labels = await labelsFromInbox(circleId);
    const others = members.filter((m) => m.deviceId !== identity.deviceId);
    const known = new Set(devices.map((d) => d.deviceId));
    const mine = myLabel(identity);
    if (others.length && (others.some((m) => !known.has(m.deviceId)) || introducedAs !== mine)) {
      // If the hello can't be queued, forget the name so the next refresh tries again.
      introducedAs = await hello(circleId).then(() => mine, () => undefined);
    } else {
      introducedAs = mine;
    }
    labels.set(identity.deviceId, mine);
    const named = distinctLabels(members.map((m) => ({
      ...m,
      label: labels.get(m.deviceId) ?? devices.find((d) => d.deviceId === m.deviceId)?.raw ?? '',
    })));
    devices = others.map((m) => ({ deviceId: m.deviceId, ...named.get(m.deviceId)! }));
  } catch {
    // Offline: the last known list is still the truth as far as we know.
  }
  const unread = (await inboxItems(circleId)).filter((i) => i.mime !== HELLO_MIME && !i.seen).length;
  writeHopCache({ circleId, devices, unread, introducedAs });
  return devices;
}

/* ── linking: the device that shows the code ────────────────────────────── */

export interface HopInvite {
  circleId: string;
  joinSecret: string;
  inviteId: string;
  expiresAt: number;
  link: string;
  /** Newest pending request that existed before this invite; older ones are stale. */
  baseline: number;
}

export function beginInvite(): Promise<HopInvite> {
  return guarded(async () => {
    const { identity, client } = await ctx();
    let circleId = await myCircleId();
    const fresh = async () => {
      const material = await createCircle(client);
      await saveCircle({ circleId: material.circleId, epoch: 1, createdAt: Date.now(), key: material.key, keyRaw: material.keyRaw });
      void requestPersistence();
      return material.circleId;
    };
    if (!circleId) circleId = await fresh();
    let invite;
    try {
      invite = await startInvite(client, circleId);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const others = readHopCache()?.devices.length ?? 0;
      // The mailbox no longer knows a circle nobody else ever joined: start over.
      if ((code !== 'NO_CIRCLE' && code !== 'NOT_A_MEMBER') || others > 0) throw err;
      await forgetCircle(circleId);
      circleId = await fresh();
      invite = await startInvite(client, circleId);
    }
    const { pending } = await client.pending(circleId).catch(() => ({ pending: [] as CircleMember[] }));
    return {
      circleId,
      joinSecret: invite.joinSecret,
      inviteId: invite.inviteId,
      expiresAt: invite.expiresAt,
      link: `${window.location.origin}/#hop=${circleId}.${invite.joinSecret}.${pointOf(identity.dhPub)}`,
      baseline: Math.max(0, ...pending.map((p) => p.joinedAt)),
    };
  });
}

export interface HopJoiner {
  member: CircleMember;
  emoji: string[];
}

/** One look at the mailbox: has a device answered this invite yet? */
export async function findJoiner(invite: HopInvite): Promise<HopJoiner | null> {
  const { identity, client } = await ctx();
  const { pending } = await client.pending(invite.circleId);
  const member = pending.filter((p) => p.joinedAt > invite.baseline).sort((a, b) => b.joinedAt - a.joinedAt)[0];
  if (!member) return null;
  const transcript = await transcriptFor(invite.circleId, invite.inviteId, member.deviceId);
  return { member, emoji: await comparisonEmoji(identity.dh, member.ecdhPub, invite.joinSecret, transcript) };
}

/** The person said the four emoji match: hand the circle key to the new device. */
export function approve(invite: HopInvite, joiner: HopJoiner): Promise<HopDevice[]> {
  return guarded(async () => {
    const { identity, client } = await ctx();
    const circle = await openStoredCircle(invite.circleId);
    const keyRaw = await circleKeyBytes(invite.circleId);
    if (!circle || !keyRaw) throw new HopError('UNKNOWN');
    try {
      await approveJoiner({ client, material: { circleId: invite.circleId, keyRaw, key: circle.key }, joiner: joiner.member, myDh: identity.dh });
    } finally {
      keyRaw.fill(0);
    }
    return linked(invite.circleId);
  });
}

/* ── linking: the device that scanned ───────────────────────────────────── */

export interface HopJoin {
  emoji: string[];
  /** Resolves with the other devices once the first device confirms. */
  done: Promise<HopDevice[]>;
  cancel(): void;
}

export function joinLink(link: HopLink): Promise<HopJoin> {
  return guarded(async () => {
    const { identity, client } = await ctx();
    const existing = await myCircleId();
    if (existing && existing !== link.circleId) {
      if ((readHopCache()?.devices.length ?? 0) > 0) throw new HopError('ALREADY_LINKED');
      await forgetCircle(existing);
    }
    const inviteId = await inviteIdFor(link.joinSecret);
    await client.join(link.circleId, { inviteId, code: '' });
    const inviterSpki = spkiOf(link.point);
    const transcript = await transcriptFor(link.circleId, inviteId, identity.deviceId);
    const emoji = await comparisonEmoji(identity.dh, inviterSpki, link.joinSecret, transcript);

    let cancelled = false;
    const done = guarded(async () => {
      const deadline = Date.now() + 10 * 60 * 1000;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let state;
        try {
          state = await client.members(link.circleId);
        } catch {
          continue; // not approved yet, or a network blip: ask again
        }
        const wrap = state.wraps.filter((w) => w.deviceId === identity.deviceId).sort((a, b) => b.epoch - a.epoch)[0];
        if (!wrap) continue;
        const inviter = state.members.find((m) => m.deviceId === wrap.wrappedBy);
        // The key must come from the device whose screen was scanned.
        if (!inviter || !sameKey(inviter.ecdhPub, inviterSpki)) throw new HopError('MISMATCH');
        const raw = await unwrapRawFromInviter(identity.dh, inviterSpki, wrap.wrapped, link.circleId).catch(() => {
          throw new HopError('MISMATCH');
        });
        const key = await importCircleKey(raw);
        await saveCircle({ circleId: link.circleId, epoch: wrap.epoch, createdAt: Date.now(), key, keyRaw: raw });
        void requestPersistence();
        return linked(link.circleId);
      }
      throw new HopError(cancelled ? 'UNKNOWN' : 'EXPIRED');
    });
    done.catch(() => {});
    return { emoji, done, cancel: () => { cancelled = true; } };
  });
}

async function linked(circleId: string): Promise<HopDevice[]> {
  // An empty list here makes refreshDevices() see the other device as new,
  // which is what sends this device's name across.
  writeHopCache({ circleId, devices: [], unread: 0 });
  startHop();
  return refreshDevices();
}

/** Remove the link, and everything it brought, from this device only. */
export async function unlink(): Promise<void> {
  const circleId = await myCircleId();
  if (!circleId) return;
  for (const item of await outboxItems(circleId)) {
    // A delivered item may already be off the mailbox (tidy); asking the
    // server to delete it again would only be an error.
    if (item.state === 'delivered' || item.state === 'seen') continue;
    await cancelItem(item.itemId).catch(() => {});
  }
  // One circle per browser, so the local queues go with it.
  await Promise.all(['sharetext-outbox', SENT_DB].map((name) => new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  })));
  await clearInbox(circleId);
  await forgetCircle(circleId);
  writeHopCache(null);
  notify();
}

/* ── sending ────────────────────────────────────────────────────────────── */

const URL_RE = /^https?:\/\/\S+$/i;

async function send(args: { kind: ItemKind; text?: string; blob?: Blob; name?: string; mime?: string }): Promise<void> {
  const circleId = await myCircleId();
  if (!circleId) throw new HopError('UNKNOWN');
  const item = await enqueue({ circleId, ...args });
  await idbPut(SENT_DB, 1, SENT_STORE, sentUpgrade, {
    itemId: item.itemId, circleId, kind: args.kind, text: args.text, name: args.name, size: item.size, at: item.createdAt,
  } satisfies SentRecord);
  notify();
  void flush();
}

/**
 * Upload until nothing is due. A pass only sees what was queued when it
 * started, so an item added mid-pass would otherwise wait for the next timer.
 */
async function flush(): Promise<void> {
  for (let pass = 0; pass < 5; pass++) {
    const run = await runOutbox().catch(() => null);
    notify();
    if (!run || run.skipped || run.failed > 0) return;
  }
}

export function sendText(text: string): Promise<void> {
  const clean = text.trim();
  return guarded(() => send({ kind: URL_RE.test(clean) ? 'link' : 'text', text: clean }));
}

export function sendFile(file: File): Promise<void> {
  return guarded(async () => {
    if (file.size > HOP_MAX_BYTES) throw new HopError('TOO_BIG');
    await send({ kind: file.type.startsWith('image/') ? 'photo' : 'file', blob: file, name: file.name, mime: file.type || undefined });
  });
}

export async function retry(itemId: string): Promise<void> {
  await retryItem(itemId);
  notify();
  void flush();
}

/** Take a sent item back: off the mailbox if it got that far, and off this device. */
export async function withdraw(itemId: string): Promise<void> {
  await cancelItem(itemId);
  await idbDelete(SENT_DB, 1, SENT_STORE, sentUpgrade, itemId);
  notify();
}

/* ── the timeline ───────────────────────────────────────────────────────── */

export interface HopEntry {
  id: string;
  dir: 'out' | 'in';
  kind: ItemKind;
  text?: string;
  name?: string;
  mime?: string;
  size: number;
  at: number;
  /** Outgoing only. */
  state?: ItemState;
  /** Incoming only: the sender's name, and the key that opens its bytes. */
  from?: string;
  key?: string;
  seen?: boolean;
}

export async function timeline(): Promise<HopEntry[]> {
  const circleId = await myCircleId();
  if (!circleId) return [];
  const [sent, out, inbox] = await Promise.all([
    idbAll<SentRecord>(SENT_DB, 1, SENT_STORE, sentUpgrade),
    outboxItems(circleId),
    inboxItems(circleId),
  ]);
  const names = new Map((readHopCache()?.devices ?? []).map((d) => [d.deviceId, d.label]));
  const states = new Map(out.map((o) => [o.itemId, outboxItemState(o)]));
  const entries: HopEntry[] = [];
  for (const rec of sent) {
    const state = states.get(rec.itemId);
    if (rec.circleId !== circleId || !state) continue;
    entries.push({ id: rec.itemId, dir: 'out', kind: rec.kind, text: rec.text, name: rec.name, size: rec.size, at: rec.at, state });
  }
  for (const item of inbox) {
    if (item.mime === HELLO_MIME) continue;
    entries.push({
      id: item.itemId, dir: 'in', kind: item.kind, text: item.text, name: item.name, mime: item.mime, size: item.size,
      at: item.sentAt, from: names.get(item.fromDevice) || undefined, key: item.key, seen: item.seen,
    });
  }
  return entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export async function markAllSeen(): Promise<void> {
  const circleId = await myCircleId();
  if (!circleId) return;
  const fresh = (await inboxItems(circleId)).filter((i) => !i.seen);
  if (!fresh.length) return;
  for (const item of fresh) await markSeen(item.key);
  const cache = readHopCache();
  if (cache) writeHopCache({ ...cache, unread: 0 });
}

export const fileOf = (key: string): Promise<Blob | null> => inboxBlob(key);

/* ── auto-copy: asked for once, at the moment it would have helped ──────── */

export type AutoCopy = 'on' | 'off' | 'unasked';

export function autoCopy(): AutoCopy {
  try {
    const v = localStorage.getItem(AUTOCOPY_KEY);
    return v === '1' ? 'on' : v === '0' ? 'off' : 'unasked';
  } catch {
    return 'off';
  }
}

export function setAutoCopy(on: boolean): void {
  try { localStorage.setItem(AUTOCOPY_KEY, on ? '1' : '0'); } catch { /* stays unasked */ }
}

/** Id of the entry the engine copied by itself, so the UI can say so. */
let lastAutoCopied: string | null = null;
export const autoCopiedId = (): string | null => lastAutoCopied;

/* Only text that arrived after this moment is ever copied unasked: opening
   the app must not overwrite the clipboard with something from yesterday. */
let copyFloor = Date.now();

async function copyNewest(): Promise<void> {
  if (autoCopy() !== 'on') return;
  const circleId = await myCircleId();
  if (!circleId) return;
  const fresh = (await inboxItems(circleId))
    .filter((i) => i.mime !== HELLO_MIME && i.text && i.receivedAt > copyFloor)
    .sort((a, b) => a.receivedAt - b.receivedAt)
    .pop();
  if (!fresh?.text) return;
  copyFloor = fresh.receivedAt;
  if (!document.hasFocus()) return;
  try {
    await navigator.clipboard.writeText(fresh.text);
    lastAutoCopied = fresh.itemId;
  } catch {
    // Safari wants a tap for this. The Copy button is still right there.
  }
}

/* ── the engine ─────────────────────────────────────────────────────────── */

const listeners = new Set<() => void>();
function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* one broken listener must not silence the rest */ }
  }
}

/** Fires whenever the timeline or the device list may have changed. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let started = false;

/** Start pulling and sending. Safe to call from every surface; runs once. */
export function startHop(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  onInboxPull(() => {
    void copyNewest().catch(() => {}).then(refreshDevices).then(notify).catch(() => {});
  });
  startInbox();
  startOutbox();
  void refreshDevices().then(notify).catch(() => {});
}

let tidiedAt = 0;

/**
 * Take this device's items off the mailbox once every other device has them.
 * The 30-day expiry is the backstop; this is what keeps a daily habit from
 * filling the circle's 500-item shelf.
 */
async function tidy(): Promise<void> {
  const cache = readHopCache();
  if (!cache?.devices.length || Date.now() - tidiedAt < 60_000) return;
  tidiedAt = Date.now();
  // Only what this device already recorded as delivered: removing an item
  // whose receipt has not been read yet would leave it "waiting" here forever.
  const delivered = new Set(
    (await outboxItems(cache.circleId)).filter((i) => i.state === 'delivered' || i.state === 'seen').map((i) => i.itemId),
  );
  if (!delivered.size) return;
  const { client } = await ctx();
  const { items } = await client.items(cache.circleId);
  const others = cache.devices.map((d) => d.deviceId);
  for (const item of items) {
    if (!delivered.has(item.itemId) || !others.every((id) => item.acked.includes(id))) continue;
    await client.deleteItem(cache.circleId, item.itemId).catch(() => {});
  }
}

/** One round trip now, for a surface that is on screen and wants to be current. */
export async function syncNow(): Promise<void> {
  // Offline there is nobody to ask; the `online` event restarts everything.
  if (navigator.onLine === false) { notify(); return; }
  const receipts = async () => {
    // Asking for receipts costs a request; only ask while one is outstanding.
    const circleId = await myCircleId();
    if (circleId && (await outboxItems(circleId)).some((i) => i.state === 'stored')) await syncDelivered();
  };
  await Promise.allSettled([refreshInbox(), flush().then(receipts)]);
  void tidy().catch(() => {});
  notify();
}
