/**
 * pairing.ts — the four moves that link two devices.
 *
 *   1. one device creates the circle and holds K,
 *   2. it shows a code / QR / link carrying (circleId, joinSecret) — the
 *      secret lives in a URL fragment, so no browser sends it to a server,
 *   3. the other device joins with its own keys and becomes *pending*,
 *   4. both see four emoji and compare; approving wraps K for the joiner and
 *      appends a signed `add_device` to the chain.
 *
 * The server relays; it never sees the join secret, K, or a way to add a device
 * on its own. A server that swaps a key mid-pairing makes the four emoji differ
 * on the two screens — which is the whole point of step 4.
 *
 * No React, no IndexedDB: `scripts/verify-circle-pairing.mjs` drives these same
 * functions against a real local Worker.
 */
import {
  b64u, fromB64u, importCircleKey, randomBytes, shortAuthString, wrapCircleKey, unwrapCircleKey,
  unwrapCircleKeyRaw, type WrappedKey,
} from './seal';
import { CircleClient, inviteIdFor, newJoinSecret, type CircleMember } from './api';

export interface PairingMaterial {
  circleId: string;
  /** Raw K — held by the inviting device so it can wrap for a new one. */
  keyRaw: Uint8Array;
  /** The same K, imported for use. */
  key: CryptoKey;
}

/** Step 1 — the device that starts the circle. */
export async function createCircle(client: CircleClient, circleId = crypto.randomUUID()): Promise<PairingMaterial> {
  await client.create(circleId);
  const keyRaw = randomBytes(32);
  return { circleId, keyRaw, key: await importCircleKey(keyRaw) };
}

/** Step 2 — a ten-minute, single-use invite carrying the client's secret. */
export async function startInvite(
  client: CircleClient,
  circleId: string,
): Promise<{ joinSecret: string; inviteId: string; code: string; expiresAt: number; fragment: string }> {
  const joinSecret = newJoinSecret();
  const inviteId = await inviteIdFor(joinSecret);
  const invite = await client.invite(circleId, inviteId);
  return {
    joinSecret,
    inviteId,
    code: invite.code,
    expiresAt: invite.expiresAt,
    fragment: `#j=${circleId}.${joinSecret}`,
  };
}

/** Step 3 — the joining device submits its keys and becomes pending. */
export async function joinWithInvite(
  client: CircleClient,
  args: { circleId: string; inviteId: string; code: string },
): Promise<{ transcript: string }> {
  const res = await client.join(args.circleId, { inviteId: args.inviteId, code: args.code });
  return { transcript: res.transcript };
}

/**
 * Step 4a — the four emoji. Both sides derive them from the same three inputs:
 * the DH shared secret between the two devices, the join secret, and the
 * transcript hash the server relayed.
 */
export function comparisonEmoji(
  myDh: CryptoKey,
  theirDhPub: string,
  joinSecret: string,
  transcript: string,
): Promise<string[]> {
  return shortAuthString(myDh, theirDhPub, joinSecret, transcript);
}

/** The inviter's side: who is waiting, and the emoji to compare against. */
export async function pendingJoiner(client: CircleClient, circleId: string): Promise<CircleMember | null> {
  const { pending } = await client.pending(circleId);
  return pending[0] ?? null;
}

export function serializeWrap(wrap: WrappedKey): string {
  return `${b64u(wrap.iv)}.${b64u(wrap.ct)}`;
}

export function parseWrap(serialized: string): WrappedKey {
  const [iv, ct] = serialized.split('.');
  if (!iv || !ct) throw new Error('BAD_WRAP');
  return { iv: fromB64u(iv), ct: fromB64u(ct) };
}

/**
 * Step 4b — approval. Wraps K for the joiner, signs the statement and appends
 * it to the membership chain. Returns the wrap so the caller can cache it.
 */
export async function approveJoiner(args: {
  client: CircleClient;
  material: PairingMaterial;
  joiner: CircleMember;
  myDh: CryptoKey;
  now?: number;
}): Promise<{ wrapped: string; sig: string; epoch: number }> {
  const { client, material, joiner, myDh } = args;
  const wrap = await wrapCircleKey(myDh, joiner.ecdhPub, material.keyRaw, material.circleId);
  const wrapped = serializeWrap(wrap);

  const statement = JSON.stringify({
    kind: 'add_device', circleId: material.circleId, deviceId: joiner.deviceId, at: args.now ?? Date.now(),
  });
  const sig = await client.signLogBody(statement);
  const res = await client.approve(material.circleId, { deviceId: joiner.deviceId, wrapped, sig });
  await client.appendLog(material.circleId, { kind: 'add_device', body: statement, sig, ts: args.now ?? Date.now() });
  return { wrapped, sig, epoch: res.epoch };
}

/** The joiner's side after approval: unwrap K with its own DH private key. */
export function unwrapFromInviter(
  myDh: CryptoKey,
  inviterDhPub: string,
  wrapped: string,
  circleId: string,
): Promise<CryptoKey> {
  return unwrapCircleKey(myDh, inviterDhPub, parseWrap(wrapped), circleId);
}

/**
 * The joiner's side, with K's bytes — the one moment a linked device may hold
 * them, so it can seal its own copy under its wrap key (OD-10). The caller
 * MUST zero the buffer; `store.saveCircle({ keyRaw })` does.
 */
export function unwrapRawFromInviter(
  myDh: CryptoKey,
  inviterDhPub: string,
  wrapped: string,
  circleId: string,
): Promise<Uint8Array> {
  return unwrapCircleKeyRaw(myDh, inviterDhPub, parseWrap(wrapped), circleId);
}

/** Plain sentences for every failure the pairing flow can produce. */
export type PairingProblem =
  | 'NO_INVITE' | 'INVITE_USED' | 'INVITE_EXPIRED' | 'BAD_CODE' | 'MISMATCH'
  | 'NO_NETWORK' | 'STORAGE_NOT_PERSISTENT' | 'UNKNOWN';

export function pairingProblem(code: string): PairingProblem {
  switch (code) {
    case 'NO_INVITE':
    case 'INVITE_USED':
    case 'INVITE_EXPIRED':
    case 'BAD_CODE':
      return code;
    case 'MISMATCH':
      return 'MISMATCH';
    case 'FAILED':
    case 'HTTP_500':
    case 'NETWORK':
      return 'NO_NETWORK';
    default:
      return 'UNKNOWN';
  }
}

/** i18n key for a problem — the UI never invents its own wording. */
export function pairingProblemKey(p: PairingProblem): string {
  switch (p) {
    case 'NO_INVITE': return 'link.err.noInvite';
    case 'INVITE_USED': return 'link.err.used';
    case 'INVITE_EXPIRED': return 'link.err.expired';
    case 'BAD_CODE': return 'link.err.code';
    case 'MISMATCH': return 'link.err.mismatch';
    case 'NO_NETWORK': return 'link.err.network';
    case 'STORAGE_NOT_PERSISTENT': return 'link.err.storage';
    default: return 'link.err.unknown';
  }
}
