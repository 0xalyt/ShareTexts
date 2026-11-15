import { DurableObject } from 'cloudflare:workers';
import { json, type Env } from './types';
import { CIRCLE_LIMITS as L } from './limits';

/**
 * Circle — the mailbox Durable Object for linked devices.
 *
 * The server is a post office, not a reader. It stores sealed chunks, the
 * per-device wraps of a key it never sees, a hash-chained membership log whose
 * every entry is signed by a device, and the acks that let a sender forget an
 * item. It does not store names, kinds, or plaintext — the item header lives
 * *inside* chunk 0's ciphertext (ADR 0001).
 *
 * Authentication (ADR "Request authentication"): every request carries
 *   X-ST-Device, X-ST-Time, X-ST-Nonce, X-ST-Sig
 * where Sig is ECDSA P-256 over `METHOD \n PATH \n sha256(body) \n time \n nonce`.
 * The DO checks the ±60 s window, a 5-minute nonce window, that the device is a
 * member, and the signature against that member's stored public key. A pending
 * joiner authenticates with the key it is *submitting* plus a live inviteId —
 * that is the only request allowed to speak before membership exists.
 *
 * Storage (the same DO KV the Room/Space classes use; SQLite-backed in
 * production, per wrangler's `new_sqlite_classes`):
 *   meta                       → CircleMeta
 *   member:<deviceId>          → MemberRecord
 *   wrap:<deviceId>:<epoch>    → WrapRecord
 *   log:<seq>                  → LogEntry   (+ meta.logSeq)
 *   invite:<inviteId>          → InviteRecord
 *   code:<CODE>                → inviteId
 *   item:<itemId>              → ItemMeta
 *   chunk:<itemId>:<idx>       → ArrayBuffer
 *   nonce:<deviceId>:<nonce>   → timestamp
 *
 * Expiry is server-authoritative and lazy: a read drops what is past
 * `expiresAt`, so an idle circle costs nothing and a stale item can never be
 * served.
 */

export interface CircleMeta {
  circleId: string;
  createdAt: number;
  epoch: number;
  logSeq: number;
  items: number;
}

interface MemberRecord {
  deviceId: string;
  signPub: string;
  ecdhPub: string;
  joinedAt: number;
  invitedBy?: string;
}

interface WrapRecord {
  deviceId: string;
  epoch: number;
  wrapped: string;
  wrappedBy: string;
  sig: string;
}

interface LogEntry {
  seq: number;
  kind: string;
  body: string;
  sig: string;
  signer: string;
  ts: number;
}

interface InviteRecord {
  inviteId: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

interface ItemMeta {
  itemId: string;
  fromDevice: string;
  epoch: number;
  size: number;
  chunks: number;
  createdAt: number;
  expiresAt: number;
  acks: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^[a-z0-9]{8,40}$/i;
const MAX_STRING = 8192;

const b64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

export class Circle extends DurableObject<Env> {
  private meta: CircleMeta | null = null;

  private async load(): Promise<CircleMeta> {
    if (!this.meta) {
      this.meta = (await this.ctx.storage.get<CircleMeta>('meta')) ?? null;
    }
    return this.meta as CircleMeta;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const circleId = url.pathname.match(/^\/circle\/([0-9a-f-]{36})/i)?.[1] ?? '';
    if (!UUID_RE.test(circleId)) return json({ error: 'BAD_CIRCLE' }, 400);

    const path = url.pathname.replace(/^\/circle\/[0-9a-f-]+/i, '') || '/';
    const method = request.method;

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > L.bodyBytes) return json({ error: 'TOO_LARGE' }, 413);

    // ONE read of the body for the whole request. Cloning a request whose body
    // is a Node string/buffer leaves the original unusable in some runtimes, so
    // the bytes are taken here and handed to auth and handlers alike.
    const rawBody = method === 'GET' || method === 'DELETE'
      ? new Uint8Array(0)
      : new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > L.bodyBytes) return json({ error: 'TOO_LARGE' }, 413);

    const existing = await this.load();

    try {
      // ── Creation: the first device establishes the circle ──────────────
      if (path === '/create' && method === 'POST') {
        if (existing) return json({ error: 'EXISTS' }, 409);
        const body = this.parse<{ deviceId: string; signPub: string; ecdhPub: string }>(rawBody);
        if (!body || !DEVICE_RE.test(body.deviceId || '')) return json({ error: 'BAD_DEVICE' }, 400);
        if (!body.signPub || !body.ecdhPub) return json({ error: 'BAD_KEYS' }, 400);
        const meta: CircleMeta = { circleId, createdAt: Date.now(), epoch: 1, logSeq: 0, items: 0 };
        const member: MemberRecord = {
          deviceId: body.deviceId,
          signPub: body.signPub,
          ecdhPub: body.ecdhPub,
          joinedAt: meta.createdAt,
        };
        await this.ctx.storage.put('meta', meta);
        await this.ctx.storage.put(`member:${member.deviceId}`, member);
        this.meta = meta;
        return json({ circleId, epoch: 1, createdAt: meta.createdAt });
      }

      if (!existing) return json({ error: 'NO_CIRCLE' }, 404);
      this.meta = existing;

      // ── Join: the only unauthenticated-as-member request ───────────────
      if (path === '/join' && method === 'POST') {
        return await this.handleJoin(request, url, existing, rawBody);
      }

      // Signatures bind the path the CLIENT sent ("PATH" in the ADR), not the
      // route tail this DO matched — otherwise a client and server disagree.
      const auth = await this.authenticate(request, method, url.pathname, existing, rawBody);
      if ('response' in auth) return auth.response;
      const deviceId = auth.deviceId;

      if (path === '/invite' && method === 'POST') return await this.handleInvite(deviceId, existing);
      if (path === '/members' && method === 'GET') return await this.handleMembers(existing);
      if (path === '/approve' && method === 'POST') return await this.handleApprove(rawBody, deviceId, existing);
      if (path === '/log' && method === 'POST') return await this.handleLogAppend(rawBody, deviceId, existing);
      if (path === '/log' && method === 'GET') return await this.handleLogRead(url, existing);
      if (path === '/items' && method === 'GET') return await this.handleItems(existing);

      const chunkPut = path.match(/^\/item\/([0-9a-f-]{36})\/chunk\/(\d{1,3})$/i);
      if (chunkPut && method === 'PUT') {
        return await this.handleChunkPut(request, rawBody, deviceId, existing, chunkPut[1], Number(chunkPut[2]));
      }
      if (chunkPut && method === 'GET') {
        return await this.handleChunkGet(deviceId, existing, chunkPut[1], Number(chunkPut[2]));
      }
      const itemPath = path.match(/^\/item\/([0-9a-f-]{36})$/i);
      if (itemPath && method === 'POST') return await this.handleAck(rawBody, deviceId, existing, itemPath[1]);
      if (itemPath && method === 'DELETE') return await this.handleDelete(deviceId, existing, itemPath[1]);

      return json({ error: 'NOT_FOUND' }, 404);
    } catch (err) {
      // Never echo internals: a mailbox that explains itself helps an attacker.
      console.error('[circle] failed', (err as Error)?.message ?? 'error');
      return json({ error: 'FAILED' }, 500);
    }
  }

  // ── handlers ────────────────────────────────────────────────────────────────

  private async handleInvite(deviceId: string, meta: CircleMeta): Promise<Response> {
    const invites = await this.ctx.storage.list<InviteRecord>({ prefix: 'invite:' });
    const live = [...invites.values()].filter((i) => i.expiresAt > Date.now() && !i.usedAt);
    if (live.length >= L.invitesPerCircle) return json({ error: 'TOO_MANY_INVITES' }, 429);

    const raw = crypto.getRandomValues(new Uint8Array(16));
    const joinSecret = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
    const inviteId = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joinSecret)));
    // 8 characters from a 32-symbol alphabet: readable, not guessable.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
    const now = Date.now();
    const invite: InviteRecord = { inviteId, code, createdAt: now, expiresAt: now + L.inviteTtlMs, usedAt: null };
    await this.ctx.storage.put(`invite:${inviteId}`, invite);
    await this.ctx.storage.put(`code:${code}`, inviteId);
    return json({ inviteId, code, expiresAt: invite.expiresAt, invitedBy: deviceId, circleId: meta.circleId });
  }

  private async handleJoin(request: Request, url: URL, meta: CircleMeta, rawBody: Uint8Array): Promise<Response> {
    const body = this.parse<{
      inviteId: string; code: string; deviceId: string; signPub: string; ecdhPub: string;
    }>(rawBody);
    if (!body) return json({ error: 'BAD_BODY' }, 400);
    if (!DEVICE_RE.test(body.deviceId || '')) return json({ error: 'BAD_DEVICE' }, 400);

    const inviteId = String(body.inviteId || '').toLowerCase();
    const invite = /^[0-9a-f]{64}$/.test(inviteId)
      ? await this.ctx.storage.get<InviteRecord>(`invite:${inviteId}`)
      : null;
    const byCode = body.code ? await this.ctx.storage.get<string>(`code:${String(body.code).toUpperCase()}`) : null;
    const resolved = invite ?? (byCode ? await this.ctx.storage.get<InviteRecord>(`invite:${byCode}`) : null);
    if (!resolved) return json({ error: 'NO_INVITE' }, 404);
    if (resolved.usedAt) return json({ error: 'INVITE_USED' }, 410);
    if (resolved.expiresAt <= Date.now()) return json({ error: 'INVITE_EXPIRED' }, 410);
    // A code alone never approves anything: the joiner still has to be approved
    // by a member, after the four emoji match.
    if (body.code && resolved.code !== String(body.code).toUpperCase()) return json({ error: 'BAD_CODE' }, 403);

    const sig = request.headers.get('x-st-sig') || '';
    const time = Number(request.headers.get('x-st-time') || '0');
    const nonce = request.headers.get('x-st-nonce') || '';
    if (!sig || !nonce || Math.abs(Date.now() - time) > L.clockSkewMs) {
      return json({ error: 'UNAUTHENTICATED' }, 401);
    }
    const ok = await verifySig(body.signPub, sig, request.method, url.pathname, rawBody, time, nonce);
    if (!ok) return json({ error: 'BAD_SIGNATURE' }, 401);
    if (await this.nonceSeen(body.deviceId, nonce)) return json({ error: 'REPLAY' }, 409);

    const now = Date.now();
    const members = await this.ctx.storage.list<MemberRecord>({ prefix: 'member:' });
    if (members.size >= L.membersPerCircle) return json({ error: 'CIRCLE_FULL' }, 409);
    const pending: MemberRecord = {
      deviceId: body.deviceId,
      signPub: body.signPub,
      ecdhPub: body.ecdhPub,
      joinedAt: now,
      invitedBy: resolved.inviteId,
    };
    // A pending device is *not* a member: approval is what writes membership.
    await this.ctx.storage.put(`pending:${body.deviceId}`, pending);
    return json({
      pending: true,
      circleId: meta.circleId,
      epoch: meta.epoch,
      // Both sides derive the same four emoji from ECDH + joinSecret; the
      // server only relays the transcript hash so neither side can be replayed
      // a different key by this very server.
      transcript: hex(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${meta.circleId}:${resolved.inviteId}:${body.deviceId}`),
      )),
      members: members.size,
    });
  }

  private async handleMembers(meta: CircleMeta): Promise<Response> {
    const members = await this.ctx.storage.list<MemberRecord>({ prefix: 'member:' });
    const wraps = await this.ctx.storage.list<WrapRecord>({ prefix: 'wrap:' });
    return json({
      circleId: meta.circleId,
      epoch: meta.epoch,
      members: [...members.values()].map((m) => ({
        deviceId: m.deviceId, signPub: m.signPub, ecdhPub: m.ecdhPub, joinedAt: m.joinedAt,
      })),
      wraps: [...wraps.values()],
    });
  }

  private async handleApprove(rawBody: Uint8Array, approver: string, meta: CircleMeta): Promise<Response> {
    const body = this.parse<{ deviceId: string; wrapped: string; sig: string }>(rawBody);
    if (!body || !DEVICE_RE.test(body.deviceId || '')) return json({ error: 'BAD_DEVICE' }, 400);
    const pending = await this.ctx.storage.get<MemberRecord>(`pending:${body.deviceId}`);
    if (!pending) return json({ error: 'NO_PENDING' }, 404);

    await this.ctx.storage.put(`member:${pending.deviceId}`, { ...pending, invitedBy: approver });
    await this.ctx.storage.delete(`pending:${pending.deviceId}`);
    const wrap: WrapRecord = {
      deviceId: pending.deviceId, epoch: meta.epoch, wrapped: String(body.wrapped || ''),
      wrappedBy: approver, sig: String(body.sig || ''),
    };
    await this.ctx.storage.put(`wrap:${wrap.deviceId}:${wrap.epoch}`, wrap);
    // The invite that let this device in is spent: one invite, one device.
    if (pending.invitedBy) {
      const inv = await this.ctx.storage.get<InviteRecord>(`invite:${pending.invitedBy}`);
      if (inv) await this.ctx.storage.put(`invite:${inv.inviteId}`, { ...inv, usedAt: Date.now() });
    }
    return json({ ok: true, deviceId: pending.deviceId, epoch: wrap.epoch });
  }

  private async handleLogAppend(rawBody: Uint8Array, signer: string, meta: CircleMeta): Promise<Response> {
    const body = this.parse<{ kind: string; body: string; sig: string; ts: number }>(rawBody);
    if (!body || !body.kind || !body.sig) return json({ error: 'BAD_ENTRY' }, 400);
    if (meta.logSeq >= L.logEntries) return json({ error: 'LOG_FULL' }, 507);
    const seq = meta.logSeq + 1;
    const entry: LogEntry = {
      seq, kind: String(body.kind).slice(0, 32), body: String(body.body || '').slice(0, MAX_STRING),
      sig: String(body.sig), signer, ts: Number(body.ts) || Date.now(),
    };
    await this.ctx.storage.put(`log:${seq}`, entry);
    await this.ctx.storage.put('meta', { ...meta, logSeq: seq });
    this.meta = { ...meta, logSeq: seq };
    return json({ ok: true, seq });
  }

  private async handleLogRead(url: URL, meta: CircleMeta): Promise<Response> {
    const since = Math.max(0, Number(url.searchParams.get('since') || '0'));
    const all = await this.ctx.storage.list<LogEntry>({ prefix: 'log:' });
    const entries = [...all.values()].filter((e) => e.seq > since).sort((a, b) => a.seq - b.seq);
    return json({ seq: meta.logSeq, entries });
  }

  private async handleItems(meta: CircleMeta): Promise<Response> {
    const all = await this.ctx.storage.list<ItemMeta>({ prefix: 'item:' });
    const now = Date.now();
    const live: ItemMeta[] = [];
    for (const item of all.values()) {
      if (item.expiresAt <= now) {
        await this.dropItem(item);
        continue;
      }
      live.push(item);
    }
    return json({
      items: live.sort((a, b) => b.createdAt - a.createdAt).map((i) => ({
        itemId: i.itemId, fromDevice: i.fromDevice, epoch: i.epoch,
        size: i.size, chunks: i.chunks, createdAt: i.createdAt, acked: i.acks,
      })),
    });
  }

  private async handleChunkPut(
    request: Request, rawBody: Uint8Array, fromDevice: string, meta: CircleMeta, itemId: string, idx: number,
  ): Promise<Response> {
    if (!UUID_RE.test(itemId)) return json({ error: 'BAD_ITEM' }, 400);
    const existing = await this.ctx.storage.get<ItemMeta>(`item:${itemId}`);
    const chunks = Number(request.headers.get('x-st-chunks') || '0');
    const epoch = Number(request.headers.get('x-st-epoch') || '0');
    if (existing && existing.fromDevice !== fromDevice) return json({ error: 'NOT_YOURS' }, 403);
    if (!existing) {
      if (meta.items >= L.itemsPerCircle) return json({ error: 'ITEM_CAP' }, 507);
      if (!Number.isInteger(chunks) || chunks < 1 || chunks > L.chunksPerItem) return json({ error: 'BAD_CHUNKS' }, 400);
      if (idx !== 0) return json({ error: 'NO_ITEM' }, 404);
      const now = Date.now();
      const created: ItemMeta = {
        itemId, fromDevice, epoch: epoch || meta.epoch,
        size: Number(request.headers.get('x-st-size') || '0'),
        chunks, createdAt: now, expiresAt: now + L.itemTtlMs, acks: [],
      };
      await this.ctx.storage.put(`item:${itemId}`, created);
      await this.ctx.storage.put('meta', { ...meta, items: meta.items + 1 });
      this.meta = { ...meta, items: meta.items + 1 };
    }
    if (rawBody.byteLength === 0) return json({ error: 'EMPTY' }, 400);
    if (rawBody.byteLength > L.chunkBytes) return json({ error: 'TOO_LARGE' }, 413);
    // A fresh, dedicated buffer: never a view into a request's memory.
    const buf = rawBody.slice().buffer;
    await this.ctx.storage.put(`chunk:${itemId}:${idx}`, buf);
    return json({ ok: true, idx, bytes: rawBody.byteLength });
  }

  private async handleChunkGet(
    _deviceId: string, _meta: CircleMeta, itemId: string, idx: number,
  ): Promise<Response> {
    const item = await this.ctx.storage.get<ItemMeta>(`item:${itemId}`);
    if (!item) return json({ error: 'NO_ITEM' }, 404);
    if (item.expiresAt <= Date.now()) {
      await this.dropItem(item);
      return json({ error: 'EXPIRED' }, 410);
    }
    const chunk = await this.ctx.storage.get<ArrayBuffer>(`chunk:${itemId}:${idx}`);
    if (!chunk) return json({ error: 'NO_CHUNK' }, 404);
    return new Response(chunk, {
      headers: {
        'content-type': 'application/octet-stream',
        'x-st-chunks': String(item.chunks),
        'x-st-epoch': String(item.epoch),
        'cache-control': 'no-store',
      },
    });
  }

  private async handleAck(
    rawBody: Uint8Array, deviceId: string, _meta: CircleMeta, itemId: string,
  ): Promise<Response> {
    const body = this.parse<{ ack?: boolean }>(rawBody);
    const item = await this.ctx.storage.get<ItemMeta>(`item:${itemId}`);
    if (!item) return json({ error: 'NO_ITEM' }, 404);
    if (body?.ack === false) {
      await this.ctx.storage.put(`item:${itemId}`, { ...item, acks: item.acks.filter((d) => d !== deviceId) });
      return json({ ok: true });
    }
    if (!item.acks.includes(deviceId)) {
      await this.ctx.storage.put(`item:${itemId}`, { ...item, acks: [...item.acks, deviceId] });
    }
    return json({ ok: true });
  }

  private async handleDelete(deviceId: string, _meta: CircleMeta, itemId: string): Promise<Response> {
    const item = await this.ctx.storage.get<ItemMeta>(`item:${itemId}`);
    if (!item) return json({ error: 'NO_ITEM' }, 404);
    if (item.fromDevice !== deviceId) return json({ error: 'NOT_YOURS' }, 403);
    await this.dropItem(item);
    return json({ ok: true });
  }

  private async dropItem(item: ItemMeta): Promise<void> {
    for (let i = 0; i < item.chunks; i++) await this.ctx.storage.delete(`chunk:${item.itemId}:${i}`);
    await this.ctx.storage.delete(`item:${item.itemId}`);
    const meta = await this.load();
    if (meta) {
      const next = { ...meta, items: Math.max(0, meta.items - 1) };
      await this.ctx.storage.put('meta', next);
      this.meta = next;
    }
  }

  // ── authentication ──────────────────────────────────────────────────────────

  private async authenticate(
    request: Request, method: string, path: string, meta: CircleMeta, rawBody: Uint8Array,
  ): Promise<{ deviceId: string } | { response: Response }> {
    const deviceId = (request.headers.get('x-st-device') || '').toLowerCase();
    const time = Number(request.headers.get('x-st-time') || '0');
    const nonce = request.headers.get('x-st-nonce') || '';
    const sig = request.headers.get('x-st-sig') || '';
    if (!DEVICE_RE.test(deviceId) || !sig || !nonce) return { response: json({ error: 'UNAUTHENTICATED' }, 401) };
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > L.clockSkewMs) {
      return { response: json({ error: 'STALE' }, 401) };
    }
    const member = await this.ctx.storage.get<MemberRecord>(`member:${deviceId}`);
    if (!member) return { response: json({ error: 'NOT_A_MEMBER' }, 403) };
    if (await this.nonceSeen(deviceId, nonce)) return { response: json({ error: 'REPLAY' }, 409) };

    // The body is hashed as BYTES: a 1 MiB sealed chunk is not text, and a
    // text decode would change the digest on one side of the wire.
    const ok = await verifySig(member.signPub, sig, method, path, rawBody, time, nonce);
    if (!ok) return { response: json({ error: 'BAD_SIGNATURE' }, 401) };
    void meta;
    return { deviceId };
  }

  private async nonceSeen(deviceId: string, nonce: string): Promise<boolean> {
    const key = `nonce:${deviceId}:${nonce.slice(0, 64)}`;
    const seen = await this.ctx.storage.get<number>(key);
    if (seen && Date.now() - seen < L.nonceWindowMs) return true;
    await this.ctx.storage.put(key, Date.now());
    return false;
  }

  private parse<T>(raw: Uint8Array): T | null {
    if (!raw.byteLength) return null;
    try {
      return JSON.parse(new TextDecoder().decode(raw)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Verify one request signature over `METHOD \n PATH \n sha256(body) \n time \n nonce`.
 *
 * The body is hashed as bytes, never decoded: a mailbox should not care what a
 * signature is attached to beyond "the same bytes I received".
 */
export async function verifySig(
  signPubB64: string, sigB64: string, method: string, path: string, body: Uint8Array, time: number, nonce: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'spki', b64(signPubB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const digest = hex(await crypto.subtle.digest('SHA-256', body));
    const message = `${method}\n${path}\n${digest}\n${time}\n${nonce}`;
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, b64(sigB64), new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}
