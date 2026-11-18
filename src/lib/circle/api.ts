/**
 * api.ts — the signed client for the Circle mailbox.
 *
 * Every call carries the device's own signature:
 *   X-ST-Device, X-ST-Time, X-ST-Nonce, X-ST-Sig
 * where Sig is ECDSA P-256 over `METHOD \n PATH \n hex(SHA-256(bodyBytes)) \n
 * time \n nonce`. Path is what the server sees (`/circle/<id>/…`), without the
 * query string; the body is hashed as BYTES, so a sealed chunk signs exactly
 * like a JSON call.
 *
 * Nothing here knows about React, IndexedDB or the UI. It takes a base URL and
 * an identity, which is what lets `scripts/verify-circle-pairing.mjs` drive the
 * same module against a real local Worker.
 */
import { b64u, fromB64u } from './seal';

export interface CircleIdentity {
  deviceId: string;
  signPub: string;
  dhPub: string;
  sign: CryptoKey;
}

export class CircleApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'CircleApiError';
  }
}

export interface CircleMember {
  deviceId: string;
  signPub: string;
  ecdhPub: string;
  joinedAt: number;
}

export interface CircleWrap {
  deviceId: string;
  epoch: number;
  wrapped: string;
  wrappedBy: string;
  sig: string;
}

export interface CircleItemMeta {
  itemId: string;
  fromDevice: string;
  epoch: number;
  size: number;
  chunks: number;
  createdAt: number;
  acked: string[];
}

export interface InviteRecord {
  inviteId: string;
  code: string;
  expiresAt: number;
  invitedBy: string;
  circleId: string;
}

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

const SKEW_KEY = 'sharetext.circle.skew';

function readSkew(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SKEW_KEY);
    const n = raw ? Number(raw) : 0;
    // A stored skew older than a day is stale evidence: clocks get fixed, and
    // an ancient offset would make every signature wrong in a new way.
    return Number.isFinite(n) && Math.abs(n) < 24 * 60 * 60 * 1000 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSkew(ms: number): void {
  try {
    globalThis.localStorage?.setItem(SKEW_KEY, String(Math.round(ms)));
  } catch {
    // Private mode, or storage full. The in-memory value still applies.
  }
}

export class CircleClient {
  private readonly identity: CircleIdentity;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  /**
   * Learned from the server when our clock is off (ms to add to Date.now()).
   *
   * Remembered between clients and page loads: without that, every session
   * spends its FIRST mailbox call on a 401 STALE and a retry, which is one
   * extra round trip on the path that has to finish in two seconds. A phone
   * whose clock is a minute off is not rare — it is most of them.
   */
  private skewMs = readSkew();

  constructor(baseUrl: string, identity: CircleIdentity, fetchImpl?: typeof fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.identity = identity;
    this.doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async call<T>(
    method: string,
    circleId: string,
    tail: string,
    body?: { json?: unknown; bytes?: Uint8Array; headers?: Record<string, string> },
    /** Internal: set once the clock has been corrected, so a STALE loop ends. */
    retried = false,
  ): Promise<T> {
    // Signatures bind the PATH, never the query string: the Worker routes on
    // the pathname, and a signed `since` would only make the two sides of the
    // wire disagree about a parameter the server re-derives anyway.
    const path = `/circle/${circleId}${tail}`;
    const signPath = `/circle/${circleId}${tail.split('?')[0]}`;
    const raw = body?.bytes ?? new TextEncoder().encode(body?.json === undefined ? '' : JSON.stringify(body.json));
    // Every phone whose clock drifts a minute would otherwise be locked out.
    const time = Date.now() + this.skewMs;
    const nonce = b64u(crypto.getRandomValues(new Uint8Array(12)));
    const digest = hex(await crypto.subtle.digest('SHA-256', raw));
    const message = `${method}\n${signPath}\n${digest}\n${time}\n${nonce}`;
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, this.identity.sign, new TextEncoder().encode(message),
    );

    const headers: Record<string, string> = {
      'x-st-device': this.identity.deviceId,
      'x-st-time': String(time),
      'x-st-nonce': nonce,
      'x-st-sig': b64u(sig),
      ...(body?.headers ?? {}),
    };
    if (body?.bytes) headers['content-type'] = 'application/octet-stream';
    else headers['content-type'] = 'application/json';

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' ? undefined : raw,
      credentials: 'omit',
    });

    if (!res.ok) {
      let code = `HTTP_${res.status}`;
      let serverNow: number | undefined;
      try {
        const parsed = (await res.json()) as { error?: string; now?: number };
        if (parsed?.error) code = parsed.error;
        if (typeof parsed?.now === 'number') serverNow = parsed.now;
      } catch { /* a body-less error is still an error */ }
      // One correction, one retry: the server just told us what time it is.
      //
      // The retry is a PARAMETER, not a header. It used to send `x-st-retry`,
      // and that header is not in the Worker's Access-Control-Allow-Headers —
      // so the browser refused the retry at the CORS step and every device
      // whose clock was more than a minute off saw "Failed to fetch" on its
      // first mailbox call. `verify-outbox` found this from a real browser;
      // the Node gates could never see it, because Node has no preflight.
      if (code === 'STALE' && serverNow && !retried) {
        this.skewMs = serverNow - Date.now();
        writeSkew(this.skewMs);
        return this.call<T>(method, circleId, tail, body, true);
      }
      throw new CircleApiError(code, res.status);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') || '';
    return (type.includes('application/json') ? await res.json() : await res.arrayBuffer()) as T;
  }

  /** First device. The circle id is chosen HERE, not by the server. */
  create(circleId: string): Promise<{ circleId: string; epoch: number; createdAt: number }> {
    return this.doFetch(`${this.baseUrl}/circle/${circleId}/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: this.identity.deviceId,
        signPub: this.identity.signPub,
        ecdhPub: this.identity.dhPub,
      }),
      credentials: 'omit',
    }).then(async (res) => {
      if (!res.ok) throw new CircleApiError((await res.json().catch(() => ({}))).error ?? `HTTP_${res.status}`, res.status);
      return res.json();
    });
  }

  /** The client owns the join secret; the server only ever sees its hash. */
  invite(circleId: string, inviteId: string): Promise<InviteRecord> {
    return this.call<InviteRecord>('POST', circleId, '/invite', { json: { inviteId } });
  }

  async join(
    circleId: string,
    args: { inviteId: string; code: string },
  ): Promise<{ pending: boolean; circleId: string; epoch: number; transcript: string }> {
    // The joiner is not a member yet, so this request signs with the key it is
    // SUBMITTING — the one request the server allows before membership exists.
    const path = `/circle/${circleId}/join`;
    const body = JSON.stringify({
      inviteId: args.inviteId,
      code: args.code,
      deviceId: this.identity.deviceId,
      signPub: this.identity.signPub,
      ecdhPub: this.identity.dhPub,
    });
    const raw = new TextEncoder().encode(body);
    // Nothing is preserved from the join: on a STALE clock this repeats with
    // the offset the server just told us about.
    for (let round = 0; round < 2; round++) {
      const time = Date.now() + this.skewMs;
      const nonce = b64u(crypto.getRandomValues(new Uint8Array(12)));
      const digest = hex(await crypto.subtle.digest('SHA-256', raw));
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.identity.sign,
        new TextEncoder().encode(`POST\n${path}\n${digest}\n${time}\n${nonce}`),
      );
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-st-device': this.identity.deviceId,
          'x-st-time': String(time),
          'x-st-nonce': nonce,
          'x-st-sig': b64u(sig),
        },
        body: raw,
        credentials: 'omit',
      });
      if (res.ok) return res.json();
      const parsed = (await res.json().catch(() => ({}))) as { error?: string; now?: number };
      // Same clock courtesy as every other call: a phone a minute off must
      // still be able to link.
      if (parsed.error === 'STALE' && typeof parsed.now === 'number' && round === 0) {
        this.skewMs = parsed.now - Date.now();
        continue;
      }
      throw new CircleApiError(parsed.error ?? `HTTP_${res.status}`, res.status);
    }
    throw new CircleApiError('STALE', 401);
  }

  pending(circleId: string): Promise<{ pending: CircleMember[] }> {
    return this.call('GET', circleId, '/pending');
  }

  members(circleId: string): Promise<{ circleId: string; epoch: number; members: CircleMember[]; wraps: CircleWrap[] }> {
    return this.call('GET', circleId, '/members');
  }

  approve(circleId: string, args: { deviceId: string; wrapped: string; sig: string }): Promise<{ ok: boolean; epoch: number }> {
    return this.call('POST', circleId, '/approve', { json: args });
  }

  appendLog(
    circleId: string,
    entry: { kind: string; body: string; sig: string; ts: number },
  ): Promise<{ ok: boolean; seq: number }> {
    return this.call('POST', circleId, '/log', { json: entry });
  }

  readLog(circleId: string, since = 0): Promise<{ seq: number; entries: unknown[] }> {
    return this.call('GET', circleId, `/log?since=${since}`);
  }

  items(circleId: string): Promise<{ items: CircleItemMeta[] }> {
    return this.call('GET', circleId, '/items');
  }

  putChunk(
    circleId: string,
    itemId: string,
    idx: number,
    bytes: Uint8Array,
    meta: { chunks: number; epoch: number; size: number },
  ): Promise<{ ok: boolean; idx: number; bytes: number }> {
    return this.call('PUT', circleId, `/item/${itemId}/chunk/${idx}`, {
      bytes,
      headers: {
        'x-st-chunks': String(meta.chunks),
        'x-st-epoch': String(meta.epoch),
        'x-st-size': String(meta.size),
      },
    });
  }

  async getChunk(circleId: string, itemId: string, idx: number): Promise<Uint8Array> {
    const buf = await this.call<ArrayBuffer>('GET', circleId, `/item/${itemId}/chunk/${idx}`);
    return new Uint8Array(buf);
  }

  /** Withdraw an item this device sent. Only the sender may. */
  deleteItem(circleId: string, itemId: string): Promise<{ ok: boolean }> {
    return this.call('DELETE', circleId, `/item/${itemId}`);
  }

  ack(circleId: string, itemId: string, ack = true): Promise<{ ok: boolean }> {
    return this.call('POST', circleId, `/item/${itemId}`, { json: { ack } });
  }

  /** Sign a membership-log entry body with this device (the chain's half). */
  async signLogBody(body: string): Promise<string> {
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, this.identity.sign, new TextEncoder().encode(body),
    );
    return b64u(sig);
  }
}

/** A 32-byte join secret, base64url — carried in the URL fragment only. */
export function newJoinSecret(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(32)));
}

/** `inviteId = SHA-256(joinSecret)` — the only form the server ever sees. */
export async function inviteIdFor(joinSecret: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', fromB64u(joinSecret)));
}

/** `#j=<circleId>.<joinSecret>` — a fragment, so no browser sends it anywhere. */
export function inviteFragment(circleId: string, joinSecret: string): string {
  return `#j=${circleId}.${joinSecret}`;
}

export function parseInviteFragment(hash: string): { circleId: string; joinSecret: string } | null {
  const m = hash.match(/#?j=([0-9a-f-]{36})\.([A-Za-z0-9_-]{16,64})$/i);
  return m ? { circleId: m[1].toLowerCase(), joinSecret: m[2] } : null;
}
