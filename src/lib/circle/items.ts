/**
 * items.ts — one item, sealed into chunks, and the reverse.
 *
 * An item is the unit the mailbox carries: a short header plus a payload (text
 * bytes, or a file's bytes). The header travels INSIDE the ciphertext, which is
 * the whole point of ADR 0001: the server sees a size, a chunk count and a
 * sender, never a kind, a name or a line of text.
 *
 * Wire format, per chunk:
 *
 *     iv (12) || ts (8, float64 LE) || ciphertext || tag (16)
 *
 * `ts` is in the clear on purpose: it is an AAD input (see `buildAad`), and the
 * receiving device must derive the same AAD before it can open the chunk. A
 * tampered timestamp is not a leak — it is a tag failure. Nothing secret is in
 * those eight bytes, and the header inside chunk 0 carries the same value.
 *
 * The plaintext stream is:
 *
 *     u32 headerLen (LE) || header JSON || payload bytes
 *
 * so one decoder serves text, links, photos and files, and a truncated upload
 * cannot be mistaken for a shorter item.
 */
import {
  buildAad, deriveItemKey, openChunk, sealChunk, randomBytes,
} from './seal';

/**
 * Plaintext per chunk. The Worker caps one sealed chunk at 1 MiB; 4 KiB of
 * headroom covers the IV, the tag and the timestamp without ever landing on
 * `TOO_LARGE` for a chunk that is exactly at the cap.
 */
export const CHUNK_BYTES = 1024 * 1024 - 4096;

const TS_BYTES = 8;
const IV_BYTES = 12;
const HEAD_BYTES = 4;

export type ItemKind = 'text' | 'link' | 'file' | 'photo';

export interface ItemHeader {
  v: 1;
  kind: ItemKind;
  /** When the sender sealed it. Also travels in the AAD (see the module note). */
  ts: number;
  /** File name, for kinds that have one. */
  name?: string;
  /** MIME type, for kinds that have one. */
  mime?: string;
  /** Payload length in bytes. */
  bytes: number;
  /** SHA-256 of the payload, hex — lets a receiver prove what it got. */
  sha256?: string;
}

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * UUIDv7: time-ordered, so the mailbox lists a thread in the order it happened
 * even when two items are sealed in the same millisecond. `crypto.randomUUID()`
 * is v4 and sorts arbitrarily, which is exactly what a chat timeline must not.
 */
export function newItemId(now = Date.now()): string {
  const b = randomBytes(16);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function packItem(header: ItemHeader, payload: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(HEAD_BYTES + head.length + payload.length);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, HEAD_BYTES);
  out.set(payload, HEAD_BYTES + head.length);
  return out;
}

export function unpackItem(stream: Uint8Array): { header: ItemHeader; payload: Uint8Array } {
  if (stream.length < HEAD_BYTES) throw new Error('BAD_ITEM');
  const headLen = new DataView(stream.buffer, stream.byteOffset, stream.byteLength).getUint32(0, true);
  const start = HEAD_BYTES + headLen;
  if (start > stream.length) throw new Error('BAD_ITEM');
  const header = JSON.parse(new TextDecoder().decode(stream.subarray(HEAD_BYTES, start))) as ItemHeader;
  if (header?.v !== 1) throw new Error('BAD_ITEM');
  return { header, payload: stream.subarray(start) };
}

export interface SealArgs {
  circleKey: CryptoKey;
  circleId: string;
  fromDeviceId: string;
  epoch: number;
  itemId: string;
  header: ItemHeader;
  payload: Uint8Array;
}

/** Seal an item into as many chunks as it needs. Deterministic in shape. */
export async function sealItem(args: SealArgs): Promise<{ chunks: Uint8Array[]; size: number }> {
  const key = await deriveItemKey(args.circleKey, args.itemId);
  const stream = packItem(args.header, args.payload);
  const count = Math.max(1, Math.ceil(stream.length / CHUNK_BYTES));
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const slice = stream.subarray(i * CHUNK_BYTES, Math.min(stream.length, (i + 1) * CHUNK_BYTES));
    const aad = buildAad({
      circleId: args.circleId,
      itemId: args.itemId,
      fromDeviceId: args.fromDeviceId,
      epoch: args.epoch,
      ts: args.header.ts,
      chunkIndex: i,
      chunkCount: count,
    });
    const sealed = await sealChunk(key, slice, aad);
    const wire = new Uint8Array(IV_BYTES + TS_BYTES + sealed.ct.length);
    wire.set(sealed.iv, 0);
    new DataView(wire.buffer, wire.byteOffset, wire.byteLength).setFloat64(IV_BYTES, args.header.ts, true);
    wire.set(sealed.ct, IV_BYTES + TS_BYTES);
    chunks.push(wire);
  }
  return { chunks, size: stream.length };
}

export interface OpenArgs {
  circleKey: CryptoKey;
  circleId: string;
  fromDeviceId: string;
  epoch: number;
  itemId: string;
  /** In chunk order, exactly as fetched. */
  chunks: Uint8Array[];
}

/**
 * Open an item. Throws on tampering, on a wrong key, and on a short read: a
 * partial item must never be shown as a shorter one.
 */
export async function openItem(args: OpenArgs): Promise<{ header: ItemHeader; payload: Uint8Array }> {
  const key = await deriveItemKey(args.circleKey, args.itemId);
  const count = args.chunks.length;
  if (count < 1) throw new Error('NO_CHUNKS');
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const wire = args.chunks[i];
    if (wire.length < IV_BYTES + TS_BYTES) throw new Error('BAD_CHUNK');
    const iv = wire.subarray(0, IV_BYTES);
    const ts = new DataView(wire.buffer, wire.byteOffset + IV_BYTES, TS_BYTES).getFloat64(0, true);
    const ct = wire.subarray(IV_BYTES + TS_BYTES);
    const aad = buildAad({
      circleId: args.circleId,
      itemId: args.itemId,
      fromDeviceId: args.fromDeviceId,
      epoch: args.epoch,
      ts,
      chunkIndex: i,
      chunkCount: count,
    });
    // Named, not swallowed: `OperationError` from WebCrypto means the AAD did
    // not match, and a caller needs to know WHICH chunk said so to tell an
    // interrupted upload from a tampered one.
    let pt: Uint8Array;
    try {
      pt = await openChunk(key, { iv, ct }, aad);
    } catch {
      throw new Error(`AUTH_CHUNK_${i}`);
    }
    parts.push(pt);
    total += pt.length;
  }
  const stream = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    stream.set(p, at);
    at += p.length;
  }
  const opened = unpackItem(stream);
  if (opened.header.bytes !== opened.payload.length) throw new Error('SHORT_ITEM');
  if (opened.header.sha256) {
    let digest: string;
    try {
      digest = hex(await crypto.subtle.digest('SHA-256', opened.payload));
    } catch {
      throw new Error('DIGEST_FAILED');
    }
    if (digest !== opened.header.sha256) throw new Error('BAD_DIGEST');
  }
  return opened;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
