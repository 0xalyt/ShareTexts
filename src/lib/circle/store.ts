/**
 * store.ts — the circle this browser belongs to.
 *
 * One IndexedDB record per circle: the id, the epoch, K imported for use, and
 * K's bytes **sealed under this device's wrap key**. The raw K is never
 * written. That is OD-10: a stolen IndexedDB dump used to be a stolen circle,
 * because `keyRaw` sat next to the import.
 *
 * The wrap key is an AES-GCM CryptoKey generated once per device, stored
 * non-extractable — the browser will use it but will not hand out its bytes, so
 * a dump of IndexedDB yields a `CryptoKey` handle with no material behind it.
 * K is unwrapped only for the two moments that need its bytes (wrapping K for a
 * device being linked, and rotating the epoch), and the buffer is zeroed right
 * after.
 *
 * A record written by the previous version (v1, with `keyRaw`) is migrated on
 * first read: sealed, re-written without the raw field, and the migration is
 * the only time those bytes leave memory.
 */
import { importCircleKey } from './seal';

const DB_NAME = 'sharetext-circle';
const DB_VERSION = 2;
const STORE = 'circles';
const DEVICE_STORE = 'device';
const WRAP_ID = 'wrap';

export interface SealedKey {
  /** AES-GCM IV, 12 bytes. Fresh for every write. */
  iv: Uint8Array;
  /** Ciphertext of K under the device wrap key. */
  ct: ArrayBuffer;
}

export interface StoredCircle {
  circleId: string;
  epoch: number;
  createdAt: number;
  /** K, imported for sealing and opening items. Never extractable. */
  key: CryptoKey;
  /** K's bytes, sealed. Present on every record written by this version. */
  keySealed?: SealedKey;
  /** Only ever present on a v1 record, and only until the next read. */
  keyRaw?: Uint8Array;
  /** Last time anything arrived from another device. */
  lastSeenAt?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'circleId' });
      if (!db.objectStoreNames.contains(DEVICE_STORE)) db.createObjectStore(DEVICE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest, storeName = STORE): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const req = run(t.objectStore(storeName));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/* ── the device wrap key ────────────────────────────────────────────────── */

let wrapKeyMemo: Promise<CryptoKey> | null = null;

async function readWrapKey(): Promise<CryptoKey | null> {
  const rec = await tx<{ id: string; key: CryptoKey } | undefined>(
    'readonly',
    (s) => s.get(WRAP_ID),
    DEVICE_STORE,
  );
  return rec && rec.key instanceof CryptoKey ? rec.key : null;
}

/**
 * The per-device wrap key. Generated once, non-extractable: an attacker with
 * the database gets a handle they cannot export, not 32 bytes.
 */
export function getWrapKey(): Promise<CryptoKey> {
  if (!wrapKeyMemo) {
    wrapKeyMemo = (async () => {
      const existing = await readWrapKey();
      if (existing) return existing;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      await tx('readwrite', (s) => s.put({ id: WRAP_ID, key }), DEVICE_STORE);
      return key;
    })();
  }
  return wrapKeyMemo;
}

/** Key bytes are bound to their circle and epoch: a swapped record cannot open. */
function aadFor(circleId: string, epoch: number): Uint8Array {
  return new TextEncoder().encode(`${circleId}|${epoch}`);
}

async function sealBytes(circleId: string, epoch: number, bytes: Uint8Array): Promise<SealedKey> {
  const wrap = await getWrapKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadFor(circleId, epoch) }, wrap, bytes);
  return { iv, ct };
}

async function openBytes(rec: StoredCircle): Promise<Uint8Array | null> {
  if (!rec.keySealed) return null;
  const wrap = await getWrapKey();
  try {
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: rec.keySealed.iv, additionalData: aadFor(rec.circleId, rec.epoch) },
      wrap,
      rec.keySealed.ct,
    );
    return new Uint8Array(buf);
  } catch {
    // Wrong device, wrong epoch, or a tampered record. Not a crash.
    return null;
  }
}

/* ── circles ────────────────────────────────────────────────────────────── */

/**
 * Persist a circle. `keyRaw` is accepted from the pairing code and is sealed
 * here — the record that reaches IndexedDB never contains it.
 */
export async function saveCircle(circle: StoredCircle): Promise<void> {
  const { keyRaw, ...rest } = circle;
  const sealed = rest.keySealed ?? (keyRaw ? await sealBytes(rest.circleId, rest.epoch, keyRaw) : null);
  if (keyRaw) keyRaw.fill(0);
  await tx('readwrite', (s) => s.put({ ...rest, keySealed: sealed }));
}

/**
 * Read a circle. A v1 record (raw `keyRaw`, no `keySealed`) is migrated here,
 * once: sealed under the wrap key, written back without the raw bytes.
 */
export async function loadCircle(circleId: string): Promise<StoredCircle | null> {
  const rec = await tx<StoredCircle | undefined>('readonly', (s) => s.get(circleId));
  if (!rec) return null;
  if (rec.keyRaw && !rec.keySealed) {
    const sealed = await sealBytes(rec.circleId, rec.epoch, rec.keyRaw);
    rec.keyRaw.fill(0);
    const migrated: StoredCircle = { ...rec, keySealed: sealed };
    delete migrated.keyRaw;
    await tx('readwrite', (s) => s.put(migrated));
    return migrated;
  }
  return rec;
}

export async function listCircles(): Promise<StoredCircle[]> {
  const all = await tx<StoredCircle[]>('readonly', (s) => s.getAll());
  const out: StoredCircle[] = [];
  for (const rec of all) {
    // listCircles is a read path too; a v1 record must not survive it either.
    const migrated = rec.keyRaw ? await loadCircle(rec.circleId) : rec;
    if (migrated) out.push(migrated);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Forget a circle on this device. The mailbox is left alone; the other
 *  devices still hold their own copies, and an unlink is a signed removal. */
export async function forgetCircle(circleId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(circleId));
}

/**
 * K's bytes, for the two operations that genuinely need them: wrapping K for a
 * device being linked, and rotating the epoch. The caller MUST zero the buffer.
 */
export async function circleKeyBytes(circleId: string): Promise<Uint8Array | null> {
  const rec = await loadCircle(circleId);
  if (!rec) return null;
  return openBytes(rec);
}

/** Unwrap, use, wipe. The only sanctioned way to touch K's bytes. */
export async function withCircleKey<T>(circleId: string, fn: (bytes: Uint8Array) => Promise<T>): Promise<T | null> {
  const bytes = await circleKeyBytes(circleId);
  if (!bytes) return null;
  try {
    return await fn(bytes);
  } finally {
    bytes.fill(0);
  }
}

/** Re-open a stored circle with K imported (after a reload, keys are objects). */
export async function openStoredCircle(circleId: string): Promise<StoredCircle | null> {
  const rec = await loadCircle(circleId);
  if (!rec) return null;
  if (!(rec.key instanceof CryptoKey) || !rec.keySealed) {
    // A cleared or partially-scanned record is a recovery case, not a crash.
    return null;
  }
  return rec;
}
