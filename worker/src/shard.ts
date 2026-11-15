/**
 * shard.ts — which "nearby" a device belongs to, without ever keeping its IP.
 *
 * The Lobby used to be ONE global Durable Object: every open ShareTexts tab on
 * earth shared a 24-slot pool, so "nearby" meant "online". Presence is now
 * addressed by a shard derived from the network the device arrives from:
 *
 *   networkKey = IPv4 address, or the /64 prefix of an IPv6 address
 *   shard      = HMAC-SHA256(dailySalt, networkKey)  → 32 hex chars
 *
 * Two consequences, both intended:
 *   · devices on the same network land in the same shard and can see each
 *     other; devices on different networks cannot see each other at all;
 *   · the raw IP is used for the HMAC input and then dropped. It is never
 *     stored in the Durable Object, never logged, and cannot be recovered from
 *     the shard without the day's salt.
 *
 * The salt rotates every UTC day, so yesterday's shard id says nothing about
 * today's. If `LOBBY_SALT` is not configured, a random salt is generated once
 * and kept in the Stats Durable Object — the sharding still works, it just
 * stops being secret from someone who can read that object.
 */

export const LOBBY_SHARD_CAPACITY = 64;
export const LOCAL_DEV_SHARD = 'local-dev';

/** IPv4 → itself; IPv6 → its /64 prefix. Everything else → null. */
export function networkKey(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // A forwarded list names the originating hop first; a port is not a network
  // (and must not be mistaken for the last group of an IPv6 address).
  const value = (ip.split(',')[0] ?? '')
    .trim()
    .toLowerCase()
    .replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');
  if (!value || value === 'unknown') return null;

  // IPv4, optionally with a port or an IPv4-mapped IPv6 prefix.
  const v4 = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) return v4[1];

  if (value.includes(':')) {
    const mapped = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return mapped[1];
    const [head] = value.split('%');
    const groups = head.split(':');
    const expanded = head.includes('::')
      ? (() => {
          const [left, right] = head.split('::');
          const l = left ? left.split(':') : [];
          const r = right ? right.split(':') : [];
          return [...l, ...new Array(Math.max(0, 8 - l.length - r.length)).fill('0'), ...r];
        })()
      : groups;
    const first4 = expanded.slice(0, 4).map((g) => (g || '0').replace(/^0+(?=.)/, ''));
    if (first4.length < 4) return null;
    return `${first4.join(':')}::/64`;
  }
  return null;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The salt for one UTC day. Never returned to a client. */
export async function dailySalt(secret: string, now = Date.now()): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  return hmacHex(secret, `st/lobby-salt/v1|${day}`);
}

/**
 * The shard id for a request. Deterministic within a day, unlinkable across
 * days, and computed from the network key only.
 */
export async function shardFor(ip: string | null | undefined, secret: string, now = Date.now()): Promise<string> {
  const key = networkKey(ip);
  if (!key) return LOCAL_DEV_SHARD;
  const salt = await dailySalt(secret, now);
  return (await hmacHex(salt, key)).slice(0, 32);
}
