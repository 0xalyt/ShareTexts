/**
 * Circle sealing — the only cryptography the Circle adds.
 *
 * WebCrypto only: no third-party crypto library, so there is nothing to audit
 * except this file. Everything here is isomorphic (browser and Node) and free
 * of DOM APIs, which is what lets `scripts/verify-circle-crypto.mjs` run the
 * exact production code under Node instead of a re-implementation.
 *
 * The rules the gates enforce:
 *   - AES-256-GCM for every byte a person typed.
 *   - HKDF-SHA-256 for every derived key; never a bare hash.
 *   - AAD binds a chunk to its circle, item, sender, epoch, time and position,
 *     so a valid ciphertext cannot be moved anywhere it does not belong.
 *   - `K` is imported non-extractable: it can be used, never read back out.
 */

const enc = new TextEncoder();

export const AAD_SEP = '|';
export const INFO_ITEM = 'st/item/v1';
export const INFO_WRAP = 'st/wrap/v1';
export const INFO_SAS = 'st/sas/v1';

/* ── encoding ──────────────────────────────────────────────────────────── */

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(text: string): Uint8Array {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/* ── key derivation ────────────────────────────────────────────────────── */

/** HKDF-SHA-256 → AES-256-GCM key. */
export async function deriveAesKey(
  ikm: BufferSource,
  salt: BufferSource,
  info: string,
  extractable = false,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: enc.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/**
 * The circle key `K`, imported as an HKDF base key so it can be used but never
 * exported. WebCrypto will not derive from a key it cannot read, so K is only
 * ever an HMAC/HKDF handle — there is no code path that turns it back into
 * bytes, and the raw value exists only in the wrap/unwrap call that produced
 * or consumed it.
 */
export function importCircleKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
}

/** HKDF from an already-imported base key (used for K → item keys). */
export async function deriveAesKeyFromBase(
  base: CryptoKey,
  salt: BufferSource,
  info: string,
  extractable = false,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/** Per-item key: HKDF(K, salt = itemId, info = "st/item/v1"). */
export function deriveItemKey(circleKey: CryptoKey, itemId: string): Promise<CryptoKey> {
  return deriveAesKeyFromBase(circleKey, enc.encode(itemId), INFO_ITEM);
}

/* ── sealing ───────────────────────────────────────────────────────────── */

export interface AadParts {
  circleId: string;
  itemId: string;
  fromDeviceId: string;
  epoch: number;
  ts: number;
  chunkIndex: number;
  chunkCount: number;
}

/**
 * AAD is a fixed field order joined by "|". Every field is either an id we
 * control or a number, and none may contain the separator — ids are base32 and
 * item ids are UUIDs, so the encoding is unambiguous.
 */
export function buildAad(p: AadParts): Uint8Array {
  return enc.encode(
    [p.circleId, p.itemId, p.fromDeviceId, p.epoch, p.ts, p.chunkIndex, p.chunkCount].join(AAD_SEP),
  );
}

export interface SealedChunk {
  iv: Uint8Array;
  ct: Uint8Array;
}

/**
 * Seal one chunk. `iv` is a parameter only so the known-answer vectors can pin
 * it; production always passes nothing and a fresh random IV is generated.
 */
export async function sealChunk(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
  iv: Uint8Array = randomBytes(12),
): Promise<SealedChunk> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext);
  return { iv, ct: new Uint8Array(ct) };
}

export async function openChunk(
  key: CryptoKey,
  sealed: SealedChunk,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.iv, additionalData: aad },
    key,
    sealed.ct,
  );
  return new Uint8Array(pt);
}

/* ── device keys ───────────────────────────────────────────────────────── */

export const CURVE = { name: 'ECDSA', namedCurve: 'P-256' } as const;
export const DH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface DeviceKeyPairs {
  sign: CryptoKeyPair;
  dh: CryptoKeyPair;
}

export async function generateDeviceKeys(): Promise<DeviceKeyPairs> {
  const sign = (await crypto.subtle.generateKey(CURVE, false, ['sign', 'verify'])) as CryptoKeyPair;
  const dh = (await crypto.subtle.generateKey(DH, false, ['deriveKey', 'deriveBits'])) as CryptoKeyPair;
  return { sign, dh };
}

export async function exportPublicSpki(key: CryptoKey): Promise<string> {
  return b64u(await crypto.subtle.exportKey('spki', key));
}

export async function importPublicSpki(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromB64u(spki), CURVE, true, ['verify']);
}

export async function importDhPublic(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromB64u(spki), DH, true, []);
}

/** deviceId = first 20 chars of base32(SHA-256(sign SPKI)). */
export async function deviceIdFromSignPub(signPubSpki: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', fromB64u(signPubSpki));
  return base32(new Uint8Array(digest)).slice(0, 20);
}

/* ── wrapping K for a device ───────────────────────────────────────────── */

export interface WrappedKey {
  iv: Uint8Array;
  ct: Uint8Array;
}

async function wrapKeyFor(
  myDhPriv: CryptoKey,
  theirDhPub: CryptoKey,
  circleId: string,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirDhPub }, myDhPriv, 256);
  return deriveAesKey(shared, enc.encode(circleId), INFO_WRAP);
}

/** Wrap `K` for one member device. `K` must be extractable exactly here. */
export async function wrapCircleKey(
  myDhPriv: CryptoKey,
  theirDhPubSpki: string,
  circleKeyRaw: Uint8Array,
  circleId: string,
  iv: Uint8Array = randomBytes(12),
): Promise<WrappedKey> {
  const theirDhPub = await importDhPublic(theirDhPubSpki);
  const wrapKey = await wrapKeyFor(myDhPriv, theirDhPub, circleId);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, circleKeyRaw);
  return { iv, ct: new Uint8Array(ct) };
}

export async function unwrapCircleKey(
  myDhPriv: CryptoKey,
  theirDhPubSpki: string,
  wrapped: WrappedKey,
  circleId: string,
): Promise<CryptoKey> {
  const raw = await unwrapCircleKeyRaw(myDhPriv, theirDhPubSpki, wrapped, circleId);
  const key = await importCircleKey(raw);
  // Imported non-extractable: usable, never readable. The buffer WebCrypto
  // took is a copy, so wiping ours leaves no readable K behind.
  raw.fill(0);
  return key;
}

/**
 * The same unwrap, returning K's bytes.
 *
 * A joining device needs them exactly once: to seal its own copy of K under its
 * own wrap key (OD-10). Nothing else may hold this result — the caller MUST
 * zero it, which is what `store.saveCircle({ keyRaw })` does for the app.
 */
export async function unwrapCircleKeyRaw(
  myDhPriv: CryptoKey,
  theirDhPubSpki: string,
  wrapped: WrappedKey,
  circleId: string,
): Promise<Uint8Array> {
  const theirDhPub = await importDhPublic(theirDhPubSpki);
  const wrapKey = await wrapKeyFor(myDhPriv, theirDhPub, circleId);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapped.iv },
    wrapKey,
    wrapped.ct,
  );
  return new Uint8Array(raw);
}

/* ── short authentication string ───────────────────────────────────────── */

/** The 64-emoji table the SAS draws from. Fixed order — never reorder. */
export const SAS_TABLE = [
  '🐶','🐱','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦉','🦄',
  '🐝','🦋','🐢','🐙','🦀','🐬','🐳','🦈','🌵','🌲','🍀','🌻','🌹','🍄','🌊','⭐',
  '🌙','☀️','🔥','❄️','⚡','🌈','☁️','🌪️','🍎','🍌','🍇','🍓','🍉','🍕','🍔','🍩',
  '🎈','🎁','🎨','🎲','🎸','🎺','🥁','⚽','🏀','🎯','🚀','🚲','✈️','🚗','⛵','🏰',
] as const;

/**
 * Four emoji both people can compare out loud. Derived from the DH shared
 * secret BETWEEN the two devices plus the join secret plus the transcript, so
 * a server that swaps a key mid-pairing produces four different emoji on the
 * two screens even though both key exchanges "succeeded".
 */
export async function shortAuthString(
  myDhPriv: CryptoKey,
  theirDhPubSpki: string,
  joinSecret: string,
  transcriptHash: string,
): Promise<string[]> {
  const theirDhPub = await importDhPublic(theirDhPubSpki);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirDhPub }, myDhPriv, 256);
  const ikm = new Uint8Array(shared.byteLength + 32);
  ikm.set(new Uint8Array(shared), 0);
  ikm.set(fromB64u(joinSecret).slice(0, 32), shared.byteLength);
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(transcriptHash),
      info: enc.encode(INFO_SAS),
    },
    base,
    4 * 8,
  );
  // One byte per emoji, reduced into the table without a modulo bias in
  // practice: 256 / 64 = 4 exactly, so `byte % 64` is uniform here.
  return [...new Uint8Array(bits)].map((b) => SAS_TABLE[b % SAS_TABLE.length]);
}

/* ── membership log ────────────────────────────────────────────────────── */

export interface LogEntry {
  seq: number;
  kind: 'add_device' | 'remove_device' | 'rotate';
  body: string;
  signer: string;
  ts: number;
  sig: string;
  prev: string;
  hash: string;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Hash of everything except the signature — this is what gets signed. */
export async function entryDigest(e: Omit<LogEntry, 'sig' | 'hash'>): Promise<string> {
  const payload = [e.seq, e.kind, e.body, e.signer, e.ts, e.prev].join(AAD_SEP);
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(payload)));
}

export async function signEntry(
  signPriv: CryptoKey,
  e: Omit<LogEntry, 'sig' | 'hash'>,
): Promise<LogEntry> {
  const digest = await entryDigest(e);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signPriv, enc.encode(digest));
  return { ...e, sig: b64u(sig), hash: digest };
}

export interface ChainProblem {
  seq: number;
  reason: 'bad_signature' | 'broken_link' | 'wrong_seq';
}

/**
 * Verify the whole chain before trusting any member. `resolveSigner` returns
 * the SPKI of the device that supposedly signed seq N — for the first entry it
 * is the device that created the circle; after that it must be a member the
 * chain itself has already admitted.
 */
export async function verifyChain(
  entries: LogEntry[],
  resolveSigner: (seq: number) => Promise<string> | string,
): Promise<ChainProblem[]> {
  const problems: ChainProblem[] = [];
  let prevHash = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expected = { seq: i, kind: e.kind, body: e.body, signer: e.signer, ts: e.ts, prev: prevHash };
    const digest = await entryDigest(expected);
    if (e.seq !== i) problems.push({ seq: i, reason: 'wrong_seq' });
    if (e.prev !== prevHash || e.hash !== digest) problems.push({ seq: i, reason: 'broken_link' });
    else {
      const spki = await resolveSigner(i);
      const pub = await importPublicSpki(spki);
      const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pub,
        fromB64u(e.sig),
        enc.encode(digest),
      );
      if (!ok) problems.push({ seq: i, reason: 'bad_signature' });
    }
    prevHash = e.hash;
  }
  return problems;
}
