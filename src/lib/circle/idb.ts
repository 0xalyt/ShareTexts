/**
 * idb.ts — the three-line promise wrapper every Circle store needs.
 *
 * IndexedDB is callback-shaped and each store was otherwise writing the same
 * open/transaction/settle dance. This is deliberately tiny: no caching, no
 * schema knowledge, no migration framework. Each store owns its own name,
 * version and shape; this only turns requests into promises and always closes
 * the connection, which is what a phone with three tabs open needs.
 */

export function openDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB_BLOCKED'));
  });
}

export async function idbRequest<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** Read every record in a store. */
export async function idbAll<T>(dbName: string, version: number, store: string, upgrade: (db: IDBDatabase) => void): Promise<T[]> {
  const db = await openDb(dbName, version, upgrade);
  try {
    return await idbRequest<T[]>(db, store, 'readonly', (s) => s.getAll());
  } finally {
    db.close();
  }
}

/** Write one record, and resolve only when the transaction has committed. */
export async function idbPut(
  dbName: string,
  version: number,
  store: string,
  upgrade: (db: IDBDatabase) => void,
  value: unknown,
): Promise<void> {
  const db = await openDb(dbName, version, upgrade);
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function idbDelete(
  dbName: string,
  version: number,
  store: string,
  upgrade: (db: IDBDatabase) => void,
  key: IDBValidKey,
): Promise<void> {
  const db = await openDb(dbName, version, upgrade);
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).delete(key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function idbGet<T>(
  dbName: string,
  version: number,
  store: string,
  upgrade: (db: IDBDatabase) => void,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDb(dbName, version, upgrade);
  try {
    return await idbRequest<T | undefined>(db, store, 'readonly', (s) => s.get(key));
  } finally {
    db.close();
  }
}
