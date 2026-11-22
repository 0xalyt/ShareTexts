/**
 * inbox.ts — what the other device sent, once.
 *
 * The rule is the ACK order: fetch, decrypt, WRITE TO DISK, then ACK. Acking
 * first would tell the sender's device "delivered" for an item this device can
 * still lose to a crash — and the mailbox would then never send it again. So
 * the write comes first, and a device that dies mid-pull simply sees the item
 * again next time.
 *
 * Dedupe is local and unconditional: the record key is (circle, item), so a
 * retried pull after a failed ACK cannot produce two copies in the thread.
 *
 * `GET /pending` on the Worker is the queue of devices waiting to be APPROVED,
 * not a list of waiting items (see `worker/src/circle.ts`). Items are
 * discovered through `/items`, whose `acked[]` is the receipt list — that is
 * what this module reads, and what STEP 3's push payload makes the device
 * check.
 */
import { CircleClient, type CircleItemMeta } from './api';
import { ensureDeviceIdentity } from './keys';
import { listCircles, saveCircle, openStoredCircle } from './store';
import { CIRCLE_ORIGIN } from './endpoint';
import { openItem, type ItemKind } from './items';

const DB = 'sharetext-inbox';
const VERSION = 1;
const ITEMS = 'items';
const PAYLOADS = 'payloads';

/** How many new items one pass will pull. A burst waits for the next trigger. */
const PULL_LIMIT = 50;
/** Items fetched in parallel. Enough to hide latency; not a flood. */
const PULL_CONCURRENCY = 4;
/** Immediate retries for a chunk that failed mid-download. */
const CHUNK_RETRIES = 3;

export interface InboxItem {
  /** `${circleId}:${itemId}` — the dedupe key, and the store's keyPath. */
  key: string;
  circleId: string;
  itemId: string;
  fromDevice: string;
  epoch: number;
  kind: ItemKind;
  name?: string;
  mime?: string;
  size: number;
  /** When the sender sealed it. */
  sentAt: number;
  receivedAt: number;
  seen: boolean;
  /** Text and links live in the record; a file's bytes live beside it. */
  text?: string;
}

export const inboxKey = (circleId: string, itemId: string): string => `${circleId}:${itemId}`;

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(ITEMS)) {
    const store = db.createObjectStore(ITEMS, { keyPath: 'key' });
    store.createIndex('circleId', 'circleId');
  }
  if (!db.objectStoreNames.contains(PAYLOADS)) db.createObjectStore(PAYLOADS, { keyPath: 'key' });
}

async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* Bytes, not a Blob: WebKit private windows refuse to store a Blob in
   IndexedDB. `blob` is how records written before this change read back. */
interface PayloadRecord {
  key: string;
  bytes?: ArrayBuffer;
  type?: string;
  blob?: Blob;
}

async function putRecord(record: InboxItem, payload?: { bytes: ArrayBuffer; type: string }): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const stores = payload ? [ITEMS, PAYLOADS] : [ITEMS];
      const t = db.transaction(stores, 'readwrite');
      t.objectStore(ITEMS).put(record);
      if (payload) t.objectStore(PAYLOADS).put({ key: record.key, ...payload } satisfies PayloadRecord);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Every item this device holds, newest last. */
export async function inboxItems(circleId?: string): Promise<InboxItem[]> {
  const db = await open();
  try {
    const rows = await new Promise<InboxItem[]>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readonly');
      const r = t.objectStore(ITEMS).getAll();
      r.onsuccess = () => resolve(r.result as InboxItem[]);
      r.onerror = () => reject(r.error);
    });
    return rows
      .filter((r) => !circleId || r.circleId === circleId)
      .sort((a, b) => a.sentAt - b.sentAt || a.itemId.localeCompare(b.itemId));
  } finally {
    db.close();
  }
}

export async function hasInboxItem(circleId: string, itemId: string): Promise<boolean> {
  const db = await open();
  try {
    const row = await new Promise<InboxItem | undefined>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readonly');
      const r = t.objectStore(ITEMS).get(inboxKey(circleId, itemId));
      r.onsuccess = () => resolve(r.result as InboxItem | undefined);
      r.onerror = () => reject(r.error);
    });
    return !!row;
  } finally {
    db.close();
  }
}

export async function inboxBlob(key: string): Promise<Blob | null> {
  const db = await open();
  try {
    const rec = await new Promise<PayloadRecord | undefined>((resolve, reject) => {
      const t = db.transaction(PAYLOADS, 'readonly');
      const r = t.objectStore(PAYLOADS).get(key);
      r.onsuccess = () => resolve(r.result as PayloadRecord | undefined);
      r.onerror = () => reject(r.error);
    });
    if (rec?.bytes) return new Blob([rec.bytes], { type: rec.type ?? '' });
    return rec?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function markSeen(key: string): Promise<void> {
  const db = await open();
  try {
    const rec = await new Promise<InboxItem | undefined>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readonly');
      const r = t.objectStore(ITEMS).get(key);
      r.onsuccess = () => resolve(r.result as InboxItem | undefined);
      r.onerror = () => reject(r.error);
    });
    if (!rec || rec.seen) return;
    // A second, separate transaction: one read plus one write inside the same
    // transaction only works by luck, and a closed transaction is an error the
    // person would see as "seen" silently not sticking.
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readwrite');
      t.objectStore(ITEMS).put({ ...rec, seen: true });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function clearInbox(circleId?: string): Promise<void> {
  const db = await open();
  try {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const t = db.transaction(ITEMS, 'readonly');
      const r = t.objectStore(ITEMS).getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([ITEMS, PAYLOADS], 'readwrite');
      for (const k of keys) {
        if (circleId && !String(k).startsWith(`${circleId}:`)) continue;
        t.objectStore(ITEMS).delete(k);
        t.objectStore(PAYLOADS).delete(k);
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/* ── pulling ────────────────────────────────────────────────────────────── */

export interface PullResult {
  circleId: string;
  received: number;
  /** A CircleApiError code when the whole circle could not be read. */
  error?: string;
  /**
   * Item ids this pass could not take, with the reason. Dropping a foreign or
   * tampered item is correct behaviour, but doing it SILENTLY makes "the other
   * device shows nothing" impossible to diagnose from the outside — which is
   * exactly how `verify-outbox` first found this path.
   */
  skipped?: string[];
}

async function fetchChunks(
  client: CircleClient,
  circleId: string,
  itemId: string,
  count: number,
): Promise<Uint8Array[] | null> {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    let got: Uint8Array | null = null;
    for (let attempt = 0; attempt < CHUNK_RETRIES && !got; attempt++) {
      try {
        got = await client.getChunk(circleId, itemId, i);
      } catch {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    if (!got) return null; // a partial item is never stored as a shorter one
    chunks.push(got);
  }
  return chunks;
}

/**
 * Pull every circle this device holds. Cheap when there is nothing to do: one
 * signed `/items` call per circle, no chunk traffic.
 */
export async function pullInbox(): Promise<PullResult[]> {
  const circles = await listCircles();
  if (circles.length === 0) return [];
  const identity = await ensureDeviceIdentity();
  const client = new CircleClient(CIRCLE_ORIGIN, identity);
  const results: PullResult[] = [];

  for (const summary of circles) {
    const circle = await openStoredCircle(summary.circleId);
    if (!circle) {
      results.push({ circleId: summary.circleId, received: 0, error: 'NO_KEY' });
      continue;
    }
    let received = 0;
    const skipped: string[] = [];
    try {
      const { items } = await client.items(circle.circleId);
      const mine = new Set(
        (await inboxItems(circle.circleId)).map((i) => i.itemId),
      );
      const fresh = items
        .filter((m: CircleItemMeta) => m.fromDevice !== identity.deviceId)
        .filter((m: CircleItemMeta) => !m.acked.includes(identity.deviceId))
        .sort((a: CircleItemMeta, b: CircleItemMeta) => a.createdAt - b.createdAt);

      const pullOne = async (meta: CircleItemMeta): Promise<void> => {
        // Already on disk but not acked (the ACK failed last time): finish the
        // receipt instead of downloading the bytes again.
        if (mine.has(meta.itemId)) {
          try {
            await client.ack(circle.circleId, meta.itemId);
          } catch {
            // next pass
          }
          return;
        }
        const chunks = await fetchChunks(client, circle.circleId, meta.itemId, meta.chunks);
        if (!chunks) {
          skipped.push(`chunk:${meta.itemId.slice(0, 8)}`);
          return;
        }
        const opened = await openItem({
          circleKey: circle.key,
          circleId: circle.circleId,
          fromDeviceId: meta.fromDevice,
          epoch: meta.epoch,
          itemId: meta.itemId,
          chunks,
        }).catch((err: unknown) => {
          const e = err as Error & { name?: string };
          skipped.push(`open:${meta.itemId.slice(0, 8)}:${e?.name ?? '?'}:${e?.message || 'no-message'}`);
          return null;
        });
        if (!opened) {
          // A tampered or foreign item is dropped, not shown — and counted, so
          // the surface can say "1 item could not be opened" instead of an
          // empty thread that looks like nothing was ever sent.
          return;
        }

        const text = opened.header.kind === 'text' || opened.header.kind === 'link'
          ? new TextDecoder().decode(opened.payload)
          : undefined;
        const record: InboxItem = {
          key: inboxKey(circle.circleId, meta.itemId),
          circleId: circle.circleId,
          itemId: meta.itemId,
          fromDevice: meta.fromDevice,
          epoch: meta.epoch,
          kind: opened.header.kind,
          name: opened.header.name,
          mime: opened.header.mime,
          size: opened.payload.length,
          sentAt: opened.header.ts,
          receivedAt: Date.now(),
          seen: false,
          text,
        };
        const payload = text === undefined
          ? { bytes: opened.payload.slice().buffer, type: opened.header.mime ?? 'application/octet-stream' }
          : undefined;
        // Disk first, ACK second. This order is the module's whole promise.
        await putRecord(record, payload);
        received += 1;
        try {
          await client.ack(circle.circleId, meta.itemId);
        } catch {
          // The item is safe; the receipt retries on the next pass.
        }
      };

      // Four at a time, not one after another. Every item costs a chunk GET
      // plus an ACK, and a phone with six waiting items would otherwise spend
      // six round trips in series — which is how "within two seconds of
      // opening" turns into five. Four keeps a slow Worker from being flooded
      // while still overlapping the latency that actually dominates.
      const queue = fresh.slice(0, PULL_LIMIT);
      const lanes = Math.min(PULL_CONCURRENCY, queue.length);
      await Promise.all(
        Array.from({ length: lanes }, async () => {
          while (queue.length > 0) {
            const meta = queue.shift();
            if (meta) await pullOne(meta);
          }
        }),
      );

      if (received > 0) {
        await saveCircle({ ...circle, lastSeenAt: Date.now() });
      }
      results.push({ circleId: circle.circleId, received, skipped: skipped.length ? skipped : undefined });
    } catch (err) {
      results.push({
        circleId: circle.circleId,
        received,
        skipped: skipped.length ? skipped : undefined,
        error: (err as { code?: string })?.code ?? 'ERROR',
      });
    }
  }
  return results;
}

/* ── triggers ───────────────────────────────────────────────────────────── */

export type InboxListener = (result: PullResult[]) => void;

/**
 * Files usually land as blobs, and a thread wants to re-render when one does.
 * One module-level set keeps the pull a single flight while every mounted Room
 * hears about it.
 */
const listeners = new Set<InboxListener>();

export function onInboxPull(fn: InboxListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let pulling: Promise<PullResult[]> | null = null;

/** Pull once, shared by every caller and trigger. */
export function refreshInbox(): Promise<PullResult[]> {
  if (pulling) return pulling;
  pulling = pullInbox()
    .then((res) => {
      if (res.some((r) => r.received > 0)) {
        for (const fn of listeners) {
          try {
            fn(res);
          } catch {
            // A broken listener must not stop delivery to the others.
          }
        }
      }
      return res;
    })
    .finally(() => {
      pulling = null;
    });
  return pulling;
}

/** Wire the triggers; returns a stop function the caller owns. */
export function startInbox(): () => void {
  if (typeof window === 'undefined') return () => {};
  let stopped = false;
  const kick = () => {
    if (stopped) return;
    void refreshInbox().catch(() => {});
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  const onMessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'circle-items' || ev.data?.type === 'circle-outbox') kick();
  };

  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', onVisible);
  navigator.serviceWorker?.addEventListener?.('message', onMessage);
  const timer = setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') kick();
  }, 30_000);

  kick();

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', kick);
    window.removeEventListener('focus', kick);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.removeEventListener?.('message', onMessage);
  };
}
