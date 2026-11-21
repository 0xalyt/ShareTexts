/**
 * Circle device keys — generated once per browser profile, stored so the
 * private halves never leave it.
 *
 * Two key pairs, both P-256: ECDSA for signatures (membership log, request
 * auth) and ECDH for the key exchange that wraps the circle key. Private keys
 * are generated with `extractable: false`, so even code running on this page
 * cannot read them back out — the CryptoKey handles are all anyone gets.
 *
 * Everything here is lazy: nothing imports this module statically, so the
 * crypto never reaches the entry chunk (checked by
 * `scripts/verify-circle-crypto.mjs`).
 */
import { deviceIdFromSignPub, exportPublicSpki, generateDeviceKeys } from './seal';

const DB_NAME = 'sharetext-keys';
const DB_VERSION = 1;
const STORE = 'device';
const RECORD_ID = 'self';

export interface DeviceIdentity {
  deviceId: string;
  signPub: string;
  dhPub: string;
  sign: CryptoKey;
  dh: CryptoKey;
  label: string;
}

interface StoredIdentity {
  id: string;
  deviceId: string;
  signPub: string;
  dhPub: string;
  sign: CryptoKey;
  dh: CryptoKey;
  label: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRecord(): Promise<StoredIdentity | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => resolve((req.result as StoredIdentity) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeRecord(record: StoredIdentity): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Can this browser keep a Circle at all? Three conditions, all cheap: IndexedDB
 * exists, structured clone accepts a non-extractable CryptoKey, and we are not
 * in a mode that throws storage away on close. A device that fails is
 * guest-only, and the UI says so in plain words rather than pretending.
 */
export async function isCircleCapable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) return false;
  try {
    const probe = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits'],
    );
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: '__probe', key: probe.privateKey });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to keep this site's data. Safari may evict a normal site's
 * storage after about seven days without a visit; the installed Home Screen
 * app is exempt, which is why the install matters. The answer is remembered so
 * Settings can show the truth instead of a promise.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function defaultLabel(): string {
  const ua = navigator.userAgent;
  const platform = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac OS X/i.test(ua)
        ? 'Mac'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Browser';
  const browser = /Firefox/i.test(ua)
    ? 'Firefox'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /Chrome|CriOS/i.test(ua)
        ? 'Chrome'
        : /Safari/i.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${platform} · ${browser}`;
}

let identityMemo: Promise<DeviceIdentity> | null = null;

/**
 * Load this browser's identity, creating it on first use.
 *
 * One identity per browser profile, no matter how many callers ask at once.
 * Two first-time callers used to each generate a key pair and each write it;
 * the last write won the store while the first caller went on signing with
 * keys nobody else would ever see again. Inside a tab the callers now share
 * one promise, and across tabs a Web Lock makes the read-then-create atomic.
 */
export function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  if (!identityMemo) {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    identityMemo = (locks ? locks.request('sharetext-device-identity', loadOrCreateIdentity) : loadOrCreateIdentity())
      .catch((err) => {
        identityMemo = null;
        throw err;
      });
  }
  return identityMemo;
}

async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  const existing = await readRecord();
  if (existing) {
    return {
      deviceId: existing.deviceId,
      signPub: existing.signPub,
      dhPub: existing.dhPub,
      sign: existing.sign,
      dh: existing.dh,
      label: existing.label,
    };
  }

  const pairs = await generateDeviceKeys();
  const signPub = await exportPublicSpki(pairs.sign.publicKey);
  const dhPub = await exportPublicSpki(pairs.dh.publicKey);
  const record: StoredIdentity = {
    id: RECORD_ID,
    deviceId: await deviceIdFromSignPub(signPub),
    signPub,
    dhPub,
    sign: pairs.sign.privateKey,
    dh: pairs.dh.privateKey,
    label: defaultLabel(),
    createdAt: Date.now(),
  };
  await writeRecord(record);
  return {
    deviceId: record.deviceId,
    signPub: record.signPub,
    dhPub: record.dhPub,
    sign: record.sign,
    dh: record.dh,
    label: record.label,
  };
}

/** Rename this device. The label is stored encrypted on the server, never raw. */
export async function renameDevice(label: string): Promise<void> {
  const existing = await readRecord();
  if (!existing) return;
  await writeRecord({ ...existing, label: label.trim().slice(0, 40) });
  identityMemo = null;
}
