/**
 * outbox.ts — an item survives the tab.
 *
 * The promise this module keeps: *tap send, close the tab, the thing still
 * goes.* Everything else here exists to make that sentence true on a Redmi 9
 * with a flaky connection:
 *
 *   - the bytes live in IndexedDB before the first byte is uploaded, so a
 *     reload, a crash or a closed tab resumes rather than restarts;
 *   - upload is chunk by chunk, and the record remembers WHICH chunk landed, so
 *     "resume" means the next PUT, not the whole item again;
 *   - a chunk PUT is idempotent by (itemId, index), so a retry after an
 *     ambiguous failure overwrites instead of duplicating;
 *   - retries back off 1, 2, 4, 8, 16, 30 s plus jitter — jitter because every
 *     device in a room retrying on the same second is a thundering herd on a
 *     free Worker;
 *   - six triggers run it: app start, `online`, visibility, a 15 s timer, a
 *     push arrival, and the service worker's `circle-outbox` sync (Chromium
 *     wakes the tab — or a fresh one — when the network returns).
 *
 * State is the mailbox's, not the UI's: `queued → sealing → uploading → stored
 * → delivered → seen`, sideways into `failed`, `paused`, `expired`. The UI
 * shows the M1 vocabulary through `outboxItemState()`, so a person reads
 * "Waiting" and not "uploading(3/17)".
 *
 * No React, no DOM beyond `navigator`/`window` guards: the gate drives this
 * module directly in a real browser.
 */
import { CircleClient, type CircleItemMeta } from './api';
import { ensureDeviceIdentity } from './keys';
import { openStoredCircle } from './store';
import { CIRCLE_ORIGIN } from './endpoint';
import { newItemId, sealItem, sha256Hex, type ItemKind } from './items';
import type { ItemState } from '../itemState';

const DB = 'sharetext-outbox';
const VERSION = 1;
const ITEMS = 'items';
const PAYLOADS = 'payloads';

/** Retry ladder, seconds. The last rung repeats. */
export const OUTBOX_BACKOFF = [1, 2, 4, 8, 16, 30] as const;
/** A queued item leaves the outbox after this long unsent. */
export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Fast retries inside one pass, before the item waits for the ladder. */
const IN_PASS_RETRIES = 2;

export type OutboxState =
  | 'queued'
  | 'sealing'
  | 'uploading'
  | 'stored'
  | 'delivered'
  | 'seen'
  | 'failed'
  | 'paused'
  | 'expired';

export interface OutboxItem {
  itemId: string;
  circleId: string;
  /** The payload store's key. Bytes are never in this record. */
  payloadRef: string;
  kind: ItemKind;
  name?: string;
  mime?: string;
  state: OutboxState;
  /** Total plaintext bytes. */
  size: number;
  chunks: number;
  doneChunks: number;
  attempts: number;
  nextAttemptAt: number;
  expiresAt: number;
  createdAt: number;
  /** A CircleApiError code or a local one (`STORAGE`, `NO_CIRCLE`). */
  error?: string;
}

/* Bytes, not a Blob: WebKit private windows refuse to store a Blob in
   IndexedDB ("Error preparing Blob/File data"), and Hop would stall there.
   `blob` is how records written before this change read back. */
interface PayloadRecord {
  itemId: string;
  bytes?: ArrayBuffer;
  type?: string;
  blob?: Blob;
}

export class OutboxError extends Error {
  constructor(readonly code: 'STORAGE' | 'NO_CIRCLE' | 'TOO_BIG' | 'EMPTY') {
    super(code);
    this.name = 'OutboxError';
  }
}

/* ── storage ────────────────────────────────────────────────────────────── */

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'itemId' });
  if (!db.objectStoreNames.contains(PAYLOADS)) db.createObjectStore(PAYLOADS, { keyPath: 'itemId' });
}

async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allItems(): Promise<OutboxItem[]> {
  const db = await open();
  try {
    const items = await new Promise<OutboxItem[]>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readonly');
      const r = t.objectStore(ITEMS).getAll();
      r.onsuccess = () => resolve(r.result as OutboxItem[]);
      r.onerror = () => reject(r.error);
    });
    return items.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } finally {
    db.close();
  }
}

async function putItem(item: OutboxItem): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readwrite');
      t.objectStore(ITEMS).put(item);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

async function putPayload(itemId: string, bytes: ArrayBuffer, type: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(PAYLOADS, 'readwrite');
      t.objectStore(PAYLOADS).put({ itemId, bytes, type } satisfies PayloadRecord);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

async function readPayload(itemId: string): Promise<Uint8Array | null> {
  const db = await open();
  try {
    const rec = await new Promise<PayloadRecord | undefined>((resolve, reject) => {
      const t = db.transaction(PAYLOADS, 'readonly');
      const r = t.objectStore(PAYLOADS).get(itemId);
      r.onsuccess = () => resolve(r.result as PayloadRecord | undefined);
      r.onerror = () => reject(r.error);
    });
    if (rec?.bytes) return new Uint8Array(rec.bytes);
    return rec?.blob ? new Uint8Array(await rec.blob.arrayBuffer()) : null;
  } finally {
    db.close();
  }
}

async function dropPayload(itemId: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(PAYLOADS, 'readwrite');
      t.objectStore(PAYLOADS).delete(itemId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

async function dropItem(itemId: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([ITEMS, PAYLOADS], 'readwrite');
      t.objectStore(ITEMS).delete(itemId);
      t.objectStore(PAYLOADS).delete(itemId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Refuse before writing, not after: a phone with 40 MB free must not accept a
 * 200 MB file and fail at the last chunk. The check is deliberately blunt — a
 * quota estimate is an estimate, and pretending it is exact is how apps lie.
 */
async function ensureRoom(bytes: number): Promise<void> {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (!est || typeof est.quota !== 'number') return; // unknown: allow, fail honestly later
  const free = est.quota - (est.usage ?? 0);
  if (bytes + 4 * 1024 * 1024 > free) throw new OutboxError('STORAGE');
}

function backoffMs(attempts: number): number {
  // `attempts` is 1 after the FIRST failure, and the first wait is 1 s — so
  // the ladder is indexed from attempts - 1. Indexing from `attempts` made the
  // first retry wait 2 s, which broke the promise of a quick resume on a
  // flaky network (and made `verify-outbox` catch a pass that skipped).
  const rung = OUTBOX_BACKOFF[Math.min(Math.max(attempts - 1, 0), OUTBOX_BACKOFF.length - 1)];
  // Jitter is up to a quarter of the rung: enough to spread a herd, small
  // enough that the promise "within a couple of seconds" still holds.
  return rung * 1000 + Math.floor(Math.random() * (rung * 250));
}

/* ── enqueue ────────────────────────────────────────────────────────────── */

export interface EnqueueArgs {
  circleId: string;
  kind: ItemKind;
  /** For text and links. Ignored when `blob` is given. */
  text?: string;
  blob?: Blob;
  name?: string;
  mime?: string;
  /** Defaults to OUTBOX_TTL_MS. */
  ttlMs?: number;
}

/**
 * Put an item in the outbox. Resolves once the bytes are durable, which is the
 * moment the UI may say "Sent" — not before.
 */
export async function enqueue(args: EnqueueArgs): Promise<OutboxItem> {
  // Text never goes through a Blob: reading one back can fail where text can't.
  const type = args.blob ? args.blob.type : 'text/plain;charset=utf-8';
  const bytes = args.blob ? await args.blob.arrayBuffer() : new TextEncoder().encode(args.text ?? '').buffer;
  const size = bytes.byteLength;
  if (size === 0 && args.kind !== 'text') throw new OutboxError('EMPTY');
  await ensureRoom(size);

  const itemId = newItemId();
  const now = Date.now();
  const record: OutboxItem = {
    itemId,
    circleId: args.circleId,
    payloadRef: `payload:${itemId}`,
    kind: args.kind,
    name: args.name,
    mime: args.mime ?? (type || undefined),
    state: 'queued',
    size,
    chunks: Math.max(1, Math.ceil((size + 512) / (1024 * 1024 - 4096))),
    doneChunks: 0,
    attempts: 0,
    nextAttemptAt: now,
    expiresAt: now + (args.ttlMs ?? OUTBOX_TTL_MS),
    createdAt: now,
  };
  await putPayload(itemId, bytes, type);
  await putItem(record);
  return record;
}

export async function outboxItems(circleId?: string): Promise<OutboxItem[]> {
  const items = await allItems();
  return circleId ? items.filter((i) => i.circleId === circleId) : items;
}

/** The M1 word for an outbox record. One mapping, used by every surface. */
export function outboxItemState(item: OutboxItem): ItemState {
  switch (item.state) {
    case 'queued':
    case 'sealing':
      return 'queued';
    case 'uploading':
      return 'sending';
    case 'stored':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'seen':
      return 'seen';
    case 'paused':
      return 'paused';
    case 'expired':
      return 'expired';
    default:
      return 'failed';
  }
}

/* ── the runner ─────────────────────────────────────────────────────────── */

export interface OutboxRun {
  ran: boolean;
  uploaded: number;
  delivered: number;
  failed: number;
  skipped: 'offline' | 'busy' | 'nothing' | null;
}

let inFlight: Promise<OutboxRun> | null = null;

function chunkWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= IN_PASS_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < IN_PASS_RETRIES) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  })();
}

const codeOf = (err: unknown): string =>
  (err as { code?: string })?.code ?? (err instanceof Error ? err.name : 'ERROR');

/**
 * One pass. Safe to call from every trigger at once: concurrent callers share
 * the pass that is already running instead of sealing the same item twice.
 */
export function runOutbox(now = Date.now()): Promise<OutboxRun> {
  // A trigger that arrives mid-pass joins the pass instead of starting a
  // second one: two passes would seal the same item twice and race on
  // `doneChunks`.
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<OutboxRun> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ran: false, uploaded: 0, delivered: 0, failed: 0, skipped: 'offline' };
    }
    const all = await allItems();
    const due = all.filter(
      (i) => (i.state === 'queued' || i.state === 'uploading' || i.state === 'sealing') && i.nextAttemptAt <= now,
    );
    if (due.length === 0) return { ran: false, uploaded: 0, delivered: 0, failed: 0, skipped: 'nothing' };

    let uploaded = 0;
    let failed = 0;

    // One client per circle: the identity and the circle key are unwrapped
    // once, not once per item.
    const perCircle = new Map<string, { client: CircleClient; key: CryptoKey; deviceId: string; epoch: number } | null>();

    for (const item of due) {
      if (now > item.expiresAt) {
        await putItem({ ...item, state: 'expired' });
        await dropPayload(item.itemId);
        continue;
      }

      let ctx = perCircle.get(item.circleId);
      if (ctx === undefined) {
        try {
          const circle = await openStoredCircle(item.circleId);
          const identity = await ensureDeviceIdentity();
          ctx = circle
            ? { client: new CircleClient(CIRCLE_ORIGIN, identity), key: circle.key, deviceId: identity.deviceId, epoch: circle.epoch }
            : null;
        } catch {
          ctx = null;
        }
        perCircle.set(item.circleId, ctx);
      }
      if (!ctx) {
        // The link is gone on this device. Keep the item (a re-link can still
        // use it) but stop retrying into a void.
        await putItem({ ...item, state: 'paused', error: 'NO_CIRCLE' });
        continue;
      }

      const bytes = await readPayload(item.itemId);
      if (!bytes) {
        await putItem({ ...item, state: 'failed', error: 'NO_PAYLOAD' });
        failed += 1;
        continue;
      }

      // `progress` is the record as it advances. The error path MUST write
      // this, not the stale `item`: writing `item` forgot the chunks that had
      // already landed, so a resumed upload restarted at chunk 0 (found by
      // `verify-outbox`: "chunk 0 is never uploaded twice" went red).
      let progress: OutboxItem = item;
      try {
        await putItem({ ...item, state: 'sealing' });
        const nowTs = Date.now();
        const { chunks } = await sealItem({
          circleKey: ctx.key,
          circleId: item.circleId,
          fromDeviceId: ctx.deviceId,
          epoch: ctx.epoch,
          itemId: item.itemId,
          header: {
            v: 1,
            kind: item.kind,
            ts: nowTs,
            name: item.name,
            mime: item.mime,
            bytes: bytes.length,
            sha256: await sha256Hex(bytes),
          },
          payload: bytes,
        });

        progress = { ...item, state: 'uploading', attempts: 0, nextAttemptAt: 0, chunks: chunks.length };
        await putItem(progress);

        for (let idx = progress.doneChunks; idx < chunks.length; idx++) {
          await chunkWithRetry(() =>
            ctx!.client.putChunk(item.circleId, item.itemId, idx, chunks[idx], {
              chunks: chunks.length,
              epoch: ctx!.epoch,
              size: progress.size,
            }),
          );
          // Written after every chunk: this is the line that makes a 200-chunk
          // upload resume at chunk 187 instead of chunk 0.
          progress = { ...progress, doneChunks: idx + 1 };
          await putItem(progress);
        }

        await putItem({ ...progress, state: 'stored', error: undefined });
        await dropPayload(item.itemId);
        uploaded += 1;
      } catch (err) {
        const attempts = (progress.attempts ?? 0) + 1;
        const hard = attempts >= OUTBOX_BACKOFF.length * 2;
        await putItem({
          ...progress,
          state: hard ? 'failed' : 'queued',
          attempts,
          nextAttemptAt: Date.now() + backoffMs(attempts),
          error: codeOf(err),
        });
        failed += 1;
      }
    }

    return { ran: true, uploaded, delivered: 0, failed, skipped: null };
  })();

  const pass = inFlight;
  return pass.finally(() => {
    if (inFlight === pass) inFlight = null;
  });
}

/**
 * Poll the mailbox for our own items' ACKs and move `stored → delivered`. A
 * receipt is never guessed from "the PUT worked": the other device's ACK is the
 * only evidence an item arrived.
 */
export async function syncDelivered(): Promise<number> {
  const mine = (await allItems()).filter((i) => i.state === 'stored' || i.state === 'delivered');
  if (mine.length === 0) return 0;
  const byCircle = new Map<string, OutboxItem[]>();
  for (const item of mine) {
    const list = byCircle.get(item.circleId) ?? [];
    list.push(item);
    byCircle.set(item.circleId, list);
  }
  let moved = 0;
  for (const [circleId, items] of byCircle) {
    try {
      const circle = await openStoredCircle(circleId);
      if (!circle) continue;
      const identity = await ensureDeviceIdentity();
      const client = new CircleClient(CIRCLE_ORIGIN, identity);
      const { items: meta } = await client.items(circleId);
      const acked = new Map<string, CircleItemMeta>(meta.map((m: CircleItemMeta) => [m.itemId, m]));
      for (const item of items) {
        const m = acked.get(item.itemId);
        if (m && m.acked.some((d) => d !== identity.deviceId) && item.state === 'stored') {
          await putItem({ ...item, state: 'delivered' });
          moved += 1;
        }
      }
    } catch {
      // Offline or the Worker said no: the next pass asks again.
    }
  }
  return moved;
}

/* ── the person's controls ──────────────────────────────────────────────── */

export async function pauseItem(itemId: string): Promise<void> {
  const item = (await allItems()).find((i) => i.itemId === itemId);
  if (!item) return;
  await putItem({ ...item, state: 'paused' });
}

export async function resumeItem(itemId: string): Promise<void> {
  const item = (await allItems()).find((i) => i.itemId === itemId);
  if (!item) return;
  await putItem({ ...item, state: 'queued', attempts: 0, nextAttemptAt: Date.now(), error: undefined });
}

/** Retry keeps the item: a failure is not a deletion. */
export async function retryItem(itemId: string): Promise<void> {
  await resumeItem(itemId);
}

/**
 * Cancel withdraws the ciphertext from the mailbox when it got that far, then
 * forgets the item locally. Best effort on the server side: an offline cancel
 * still must stop the item on this device, or the button lies.
 */
export async function cancelItem(itemId: string): Promise<void> {
  const item = (await allItems()).find((i) => i.itemId === itemId);
  if (!item) return;
  if (item.state === 'stored' || item.state === 'delivered' || item.state === 'uploading') {
    try {
      const circle = await openStoredCircle(item.circleId);
      if (circle) {
        const identity = await ensureDeviceIdentity();
        await new CircleClient(CIRCLE_ORIGIN, identity).deleteItem(item.circleId, item.itemId);
      }
    } catch {
      // The 30-day sweep is the backstop; the local delete is not negotiable.
    }
  }
  await dropItem(itemId);
}

/* ── triggers ───────────────────────────────────────────────────────────── */

/** Ask Chromium to wake us when the network returns, even with the tab shut. */
async function registerSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
    if (sync) await sync.register('circle-outbox');
  } catch {
    // Safari and Firefox have no Background Sync. `online` + the timer cover it.
  }
}

/**
 * Wire every trigger. Returns a stop function; the caller owns the lifetime so
 * a closed room does not keep a 15 s timer alive.
 */
export function startOutbox(): () => void {
  if (typeof window === 'undefined') return () => {};
  let stopped = false;

  const kick = () => {
    if (stopped) return;
    void runOutbox()
      .then(() => syncDelivered())
      .catch(() => {});
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  const onMessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'circle-outbox') kick();
  };

  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.addEventListener?.('message', onMessage);
  const timer = setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') kick();
  }, 15_000);

  void registerSync();
  kick();

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.removeEventListener?.('message', onMessage);
  };
}
