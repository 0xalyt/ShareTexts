/**
 * store.ts — the circle this browser belongs to.
 *
 * One IndexedDB record per circle: the id, the epoch, K imported for use, and
 * the raw K that the inviting device needs in order to wrap it for a new
 * device. Notifications and the service worker read the same record, so the
 * key never has to be re-derived from a secret the server holds (it holds
 * none).
 *
 * Honest note, recorded in M3-report.md and the ADR: keeping `keyRaw` in
 * IndexedDB is what lets this device LINK another one later without the server
 * ever seeing K. The non-extractable `key` is what encrypts and decrypts
 * everything; `keyRaw` exists only for the wrap step.
 */
import { importCircleKey } from './seal';

const DB_NAME = 'sharetext-circle';
const DB_VERSION = 1;
const STORE = 'circles';

export interface StoredCircle {
  circleId: string;
  epoch: number;
  createdAt: number;
  /** K, imported for sealing and opening items. */
  key: CryptoKey;
  /** K's bytes, used only to wrap K for a device that is being linked. */
  keyRaw: Uint8Array;
  /** Last time anything arrived from another device. */
  lastSeenAt?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'circleId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveCircle(circle: StoredCircle): Promise<void> {
  await tx('readwrite', (s) => s.put(circle));
}

export async function loadCircle(circleId: string): Promise<StoredCircle | null> {
  return (await tx<StoredCircle | undefined>('readonly', (s) => s.get(circleId))) ?? null;
}

export async function listCircles(): Promise<StoredCircle[]> {
  const all = await tx<StoredCircle[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Forget a circle on this device. The mailbox is left alone; the other
 *  devices still hold their own copies, and an unlink is a signed removal. */
export async function forgetCircle(circleId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(circleId));
}

/** Re-open a stored circle with K imported (after a reload, keys are objects). */
export async function openStoredCircle(circleId: string): Promise<StoredCircle | null> {
  const rec = await loadCircle(circleId);
  if (!rec) return null;
  if (!(rec.key instanceof CryptoKey) || !rec.keyRaw) {
    // A cleared or partially-scanned record is a recovery case, not a crash.
    return null;
  }
  return { ...rec, key: rec.key ?? (await importCircleKey(rec.keyRaw)) };
}
