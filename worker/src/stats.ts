import { DurableObject } from 'cloudflare:workers';
import { json, type Env } from './types';

/**
 * Stats — an approximate live count of seated devices ("N people using").
 *
 * Rooms report their current seated-peer count (an absolute value, keyed by
 * room) after every seat/leave transition, so the counter self-heals: a
 * missed or duplicate event never drifts permanently, because the next event
 * for that room rewrites its true value. `users` is the running sum.
 *
 * This powers a public social-proof widget on the landing page — it reveals
 * only a single aggregate number, never room ids, codes, contents, or IPs.
 * The number is deliberately approximate: it is best-effort per event, and a
 * crashed/evicted DO restarts from zero.
 */
/** How long the Metrics lifetime rooms counter is reused for /stats. */
const ROOMS_CREATED_TTL_MS = 30_000;

export class Stats extends DurableObject<Env> {

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/event' && request.method === 'POST') {
      return this.event(request);
    }
    // Internal only (index.ts calls it); never exposed on a public route.
    // Generated once, so sharding is stable across Worker isolates even
    // before the owner sets LOBBY_SALT.
    if (url.pathname === '/lobby-salt') {
      let salt = await this.ctx.storage.get<string>('lobbySalt');
      if (!salt) {
        salt = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await this.ctx.storage.put('lobbySalt', salt);
      }
      return json({ salt });
    }

    if (url.pathname === '/' || url.pathname === '/stats') {
      const users = (await this.ctx.storage.get<number>('users')) ?? 0;
      return json({
        service: 'sharetext-signaling-cf',
        users,
        updated_at: new Date().toISOString(),
        note: 'approximate live count of seated devices',
        roomsCreated: await this.roomsCreatedCount(),
      });
    }
    return json({ error: 'not found' }, 404);
  }

  /** Lifetime rooms created, read from the Metrics DO at most once per
   *  ROOMS_CREATED_TTL_MS. Prefers the durable lifetime counter (never rolls
   *  off with the 48h metric buckets); falls back to the window total. The
   *  cached copy lives in storage because an idle object is evicted between
   *  polls. */
  private async roomsCreatedCount(): Promise<number> {
    const now = Date.now();
    const cached = await this.ctx.storage.get<{ value: number; at: number }>('roomsCreated');
    if (cached && now - cached.at < ROOMS_CREATED_TTL_MS) return cached.value;
    let value = cached?.value ?? 0;
    try {
      if (this.env.METRICS) {
        const res = await this.env.METRICS.get(this.env.METRICS.idFromName('metrics')).fetch(new Request('https://internal/metrics'));
        if (res.ok) {
          const data = await res.json() as { totals?: Record<string, number>; lifetime_rooms_created?: number };
          value = Math.max(data.lifetime_rooms_created ?? 0, data.totals?.['rooms.created'] ?? 0);
        }
      }
    } catch { /* keep the last known value */ }
    await this.ctx.storage.put('roomsCreated', { value, at: now });
    return value;
  }

  private async event(request: Request): Promise<Response> {
    let body: { roomId?: unknown; count?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    if (typeof body.roomId !== 'string' || typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 0) {
      return json({ error: 'bad request' }, 400);
    }
    const key = 'room:' + body.roomId;
    const prev = (await this.ctx.storage.get<number>(key)) ?? 0;
    let users = (await this.ctx.storage.get<number>('users')) ?? 0;
    if (body.count === 0) {
      if (prev > 0) {
        await this.ctx.storage.delete(key);
        await this.ctx.storage.put('users', Math.max(0, users - prev));
      }
    } else if (body.count !== prev) {
      await this.ctx.storage.put(key, body.count);
      await this.ctx.storage.put('users', Math.max(0, users - prev + body.count));
    }
    return json({ ok: true });
  }
}
