/**
 * Saved Items — the local library, backed by IndexedDB.
 *
 * WHY: ShareTexts rooms are deliberately temporary, but users repeatedly ask
 * to keep one thing from a session. This store is the ONE persistence layer
 * behind both entry points (landing header + room settings) — a single
 * database, a single collection, no second copy of the collection anywhere.
 *
 * Design rules (from the Saved Items spec):
 *   · Local-only. Nothing here is ever sent to the signaling server or any
 *     other backend. No telemetry, no logging of content.
 *   · Real content, not references. Attachments are copied out of their
 *     (session-scoped) object URL into a durable Blob at save time, so the
 *     item survives room close, peer disconnect, refresh, and restart.
 *   · Write success is only reported after the transaction COMMITTED
 *     (every promise resolves on `tx.oncomplete`, never on request success).
 *   · Dedupe by `originKey`: the same logical item saved twice keeps its
 *     first record (id, savedAt) instead of growing a twin. Different items
 *     with identical text keep their own records — identity is the origin
 *     key, never the content.
 *   · No automatic expiry. Items live until the user removes them, clears
 *     the library, or clears site data (browser policy).
 *   · Records read back from IDB are validated before rendering; corrupt or
 *     unknown-version records are skipped, never rendered as garbage.
 *
 * Identity: `originKey` is `msg:<message id>` — the stable per-device message
 * id. The SAME message saved on two different devices produces two records
 * (each device has its own library; there is no cross-device sync, by design).
 *
 * Follows the transferStore.ts conventions (module-level DB promise, small
 * promise-wrapped helpers) but, unlike that best-effort store, every failure
 * here REJECTS — the UI must never claim an item was saved when it wasn't.
 */

import { pureLinkUrl } from './linkUrl';
import type { ChatMessage } from '../types';

const DB_NAME = 'sharetext-saved';
const DB_VERSION = 1;
const STORE = 'items';
const INDEX_ORIGIN = 'originKey';

/** Bump when the record shape changes; readers skip versions they don't
 *  understand instead of rendering half-migrated data. */
export const SAVED_SCHEMA_VERSION = 1;

export type SavedKind = 'text' | 'link' | 'image' | 'file';
export type SavedErrorCode = 'quota' | 'unavailable' | 'failed';

/** Every failure the store can produce, already classified for the UI. */
export class SavedStoreError extends Error {
  readonly code: SavedErrorCode;
  constructor(code: SavedErrorCode, message: string) {
    super(message);
    this.name = 'SavedStoreError';
    this.code = code;
  }
}

/** One saved item. Fields are sparse by kind — a text item carries `text`,
 *  a link carries `url`/`host`, image/file carry a raw `Blob` (never base64). */
export interface SavedItem {
  id: string;
  version: number;
  kind: SavedKind;
  /** Stable identity of the source message (`msg:<id>`) — dedupe key. */
  originKey: string;
  /** When the user saved it (list order). */
  savedAt: number;
  /** The source message's timestamp — shown as the item's own time. */
  createdAt: number;
  /** Which side it came from ('me' = I sent it). No names, no room ids. */
  sender?: 'me' | 'partner';
  /** Full text (kind 'text') or caption kept alongside an attachment. */
  text?: string;
  /** kind 'link': normalized http(s) URL. */
  url?: string;
  /** kind 'link': hostname, for the quiet preview line. */
  host?: string;
  /** kind 'image' | 'file'. */
  filename?: string;
  mimeType?: string;
  size?: number;
  /** kind 'image' | 'file': the actual bytes. */
  blob?: Blob;
}

export interface SavedItemDraft {
  originKey: string;
  kind: SavedKind;
  createdAt: number;
  sender?: 'me' | 'partner';
  text?: string;
  url?: string;
  host?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  blob?: Blob;
}

/* ------------------------------ validation ------------------------------ */

/** Type guard for records coming OUT of IndexedDB. Anything malformed
 *  (wrong version, missing content for its kind, non-Blob bytes) is
 *  untrusted input and never reaches the UI. */
export function isSavedItem(v: unknown): v is SavedItem {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return false;
  if (typeof r.originKey !== 'string' || r.originKey.length === 0) return false;
  if (r.version !== SAVED_SCHEMA_VERSION) return false;
  if (r.kind !== 'text' && r.kind !== 'link' && r.kind !== 'image' && r.kind !== 'file') return false;
  if (typeof r.savedAt !== 'number' || !Number.isFinite(r.savedAt)) return false;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return false;
  if (r.blob !== undefined && !(r.blob instanceof Blob)) return false;
  if (r.kind === 'text' && typeof r.text !== 'string') return false;
  if (r.kind === 'link' && typeof r.url !== 'string') return false;
  if ((r.kind === 'image' || r.kind === 'file') && !(r.blob instanceof Blob)) return false;
  return true;
}

/* --------------------------- error classification ------------------------ */

export function toStoreError(e: unknown): SavedStoreError {
  if (e instanceof SavedStoreError) return e;
  const err = e as { name?: string; code?: number; message?: string } | null;
  // QuotaExceededError is the spec'd name; code 22 is the legacy alias.
  if (err?.name === 'QuotaExceededError' || err?.code === 22) {
    return new SavedStoreError('quota', err?.message || 'storage quota exceeded');
  }
  // IDB missing or blocked by browser policy → the feature can't run here.
  if (
    typeof indexedDB === 'undefined' ||
    err?.name === 'InvalidStateError' ||
    err?.name === 'SecurityError' ||
    err?.name === 'NotAllowedError'
  ) {
    return new SavedStoreError('unavailable', err?.message || 'IndexedDB unavailable');
  }
  return new SavedStoreError('failed', err?.message || 'storage operation failed');
}

/* -------------------------------- database ------------------------------- */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new SavedStoreError('unavailable', 'IndexedDB unavailable'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(toStoreError(e));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const st = db.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex(INDEX_ORIGIN, 'originKey', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Future upgrades from another tab: drop this handle so the next
      // caller re-opens instead of writing into a stale version.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(toStoreError(req.error));
    req.onblocked = () => reject(new SavedStoreError('unavailable', 'database open blocked'));
  }).catch((e) => {
    dbPromise = null; // next call may retry a fresh open
    throw toStoreError(e);
  });
  dbPromise = p;
  return p;
}

/** Run one request inside a transaction and resolve ONLY on commit —
 *  `req.onsuccess` fires before the write is durable, and "saved" must
 *  mean persisted. */
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    let out!: T;
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(toStoreError(tx.error));
    tx.onabort = () => reject(toStoreError(tx.error || new DOMException('Transaction aborted', 'AbortError')));
  }));
}

/* --------------------------------- writes -------------------------------- */

/** Insert unless this originKey already exists — the existence check and the
 *  put share ONE readwrite transaction, so two rapid saves of the same item
 *  cannot race into duplicates (IDB serializes readwrite transactions on the
 *  same store). Returns the existing record unchanged when already saved. */
function putIfAbsent(draft: SavedItemDraft): Promise<SavedItem> {
  return openDb().then((db) => new Promise<SavedItem>((resolve, reject) => {
    let out: SavedItem;
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const idx = st.index(INDEX_ORIGIN);
    const getReq = idx.get(draft.originKey);
    getReq.onsuccess = () => {
      const found = getReq.result as SavedItem | undefined;
      if (found && isSavedItem(found)) {
        out = found; // already saved — keep the FIRST record (no overwrite)
        return;
      }
      if (found) st.delete(found.id); // corrupt twin → replace it wholesale
      out = {
        ...draft,
        id: newId(),
        version: SAVED_SCHEMA_VERSION,
        savedAt: Date.now(),
      };
      st.put(out);
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(toStoreError(tx.error));
    tx.onabort = () => reject(toStoreError(tx.error || new DOMException('Transaction aborted', 'AbortError')));
  }));
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `sv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function commit(draft: SavedItemDraft): Promise<SavedItem> {
  let item: SavedItem;
  try {
    item = await putIfAbsent(draft);
  } catch (e) {
    throw toStoreError(e);
  }
  await reload();
  return item;
}

/** Save a prepared item. Resolves only after the write committed and the
 *  snapshot refreshed — callers may show "Saved" at that point and not before. */
export function saveItem(draft: SavedItemDraft): Promise<SavedItem> {
  return commit(draft);
}

/** Remove ONE item by id. Rejects (classified) if the delete failed, so the
 *  UI never reports a removal that didn't happen. */
export async function removeItem(id: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
  } catch (e) {
    throw toStoreError(e);
  }
  await reload();
}

/** Clear the whole library. Rejects if the clear failed. Touches ONLY this
 *  database — rooms, transfers, drafts, and every other app store live in
 *  their own databases and are untouched. */
export async function clearSavedItems(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear() as IDBRequest<undefined>);
  } catch (e) {
    throw toStoreError(e);
  }
  await reload();
}

/* --------------------------- save from a message ------------------------- */

/** Dedupe identity of a chat message in the saved library. */
export function savedOriginKey(msg: ChatMessage): string {
  return `msg:${msg.id}`;
}

/**
 * Map a ChatMessage onto a SavedItem and persist it.
 *
 * Attachments: the message's `url` is a SESSION-SCOPED object URL — it dies
 * with the room. We fetch() it here to copy the actual bytes into a Blob that
 * IndexedDB stores natively (no base64, no duplicated buffers beyond the copy
 * the fetch already makes), then persist metadata alongside it.
 *
 * Links: classified with the SAME pureLinkUrl policy the chat renders with,
 * so "what looks like a link in the bubble" and "what the library stores as a
 * link" can never disagree.
 */
export async function saveMessageItem(msg: ChatMessage): Promise<SavedItem> {
  const originKey = savedOriginKey(msg);
  const createdAt = Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now();
  const sender = msg.sender;

  const a = msg.attachment;
  if (a) {
    // Bytes only exist once the transfer is complete AND an object URL is
    // still around (a restored-but-lost file has none — nothing to save).
    if (a.status !== 'complete' || !a.url) {
      throw new SavedStoreError('failed', 'attachment bytes are not available');
    }
    let blob: Blob;
    try {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
    } catch {
      throw new SavedStoreError('failed', 'could not copy attachment bytes');
    }
    if (blob.size === 0) {
      throw new SavedStoreError('failed', 'attachment is empty');
    }
    const caption = (msg.text || '').trim();
    return commit({
      originKey,
      kind: a.type === 'image' ? 'image' : 'file',
      createdAt,
      sender,
      text: caption || undefined,
      filename: a.name || undefined,
      mimeType: a.mimeType || blob.type || undefined,
      size: typeof a.size === 'number' && a.size > 0 ? a.size : blob.size,
      blob,
    });
  }

  const text = msg.text ?? '';
  const url = pureLinkUrl(text);
  if (url) {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* sanitizeUrl already vetted it */ }
    return commit({ originKey, kind: 'link', createdAt, sender, text: text.trim(), url, host });
  }
  if (!text.trim()) {
    throw new SavedStoreError('failed', 'nothing to save');
  }
  return commit({ originKey, kind: 'text', createdAt, sender, text });
}

/* ---------------------- snapshot + subscription (React) ------------------ */

export interface SavedSnapshot {
  items: SavedItem[];
  status: 'loading' | 'ready' | 'error';
  errorCode?: SavedErrorCode;
}

const EMPTY: SavedItem[] = [];
let snap: SavedSnapshot = { items: EMPTY, status: 'loading' };
const listeners = new Set<() => void>();
/** Reloads are chained (never raced) so a refresh triggered by a write that
 *  committed after an earlier refresh started still sees the write. */
let reloadChain: Promise<void> | null = null;

function emit(next: SavedSnapshot): void {
  snap = next;
  listeners.forEach((l) => l());
}

async function readAll(): Promise<SavedItem[]> {
  const all = await run<SavedItem[]>('readonly', (s) => s.getAll() as IDBRequest<SavedItem[]>);
  return (Array.isArray(all) ? all : [])
    .filter(isSavedItem) // drop corrupt/unknown records instead of rendering them
    .sort((a, b) => b.savedAt - a.savedAt); // newest first
}

/** Refresh the snapshot. NEVER rejects — a failed refresh surfaces as an
 *  error state only when nothing has loaded yet; an already-loaded list stays
 *  visible (with the mutation errors reported by the mutators themselves). */
function doReload(): Promise<void> {
  return readAll()
    .then((items) => { emit({ items, status: 'ready' }); })
    .catch((e) => {
      const err = toStoreError(e);
      if (snap.status === 'ready') {
        emit({ items: snap.items, status: 'ready' }); // keep what we know
      } else {
        emit({ items: EMPTY, status: 'error', errorCode: err.code });
      }
    });
}

function reload(): Promise<void> {
  const next = reloadChain ? reloadChain.then(doReload, doReload) : doReload();
  reloadChain = next;
  return next;
}

/** Explicit retry path (error state → "Try again"). */
export function reloadSavedItems(): Promise<void> {
  return reload();
}

export function subscribeSavedItems(listener: () => void): () => void {
  listeners.add(listener);
  if (!reloadChain) void reload(); // first subscriber triggers the load
  return () => { listeners.delete(listener); };
}

/** Stable reference — safe as useSyncExternalStore's getSnapshot. */
export function getSavedSnapshot(): SavedSnapshot {
  return snap;
}

/** Selector helper: is this origin key currently persisted? */
export function hasSavedItem(items: SavedItem[], originKey: string): boolean {
  return items.some((i) => i.originKey === originKey);
}
