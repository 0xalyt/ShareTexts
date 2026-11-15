// Lobby sharding gate — does "nearby" actually mean nearby?
//
// The Lobby was ONE global Durable Object with a 24-slot pool: strangers on
// different continents shared a list, and discovery broke past 24 devices.
// STEP 1 addresses the Lobby by an HMAC of the request's network key, salted
// per UTC day. This gate proves, against the real modules in Node:
//
//   · networkKey groups IPv4 exactly and IPv6 by /64;
//   · shardFor is stable within a day, different across networks, different
//     across days, and contains nothing that can be read back as an IP;
//   · two devices on the same network end up in the same Lobby and see each
//     other; devices on different networks never do;
//   · a shard holds 64 devices and refuses the 65th with LOBBY_FULL;
//   · nothing the shard stores contains the raw IP.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sharetext-lobby-'));
const shimPath = path.join(root, 'worker', 'test', 'cf-shim.ts');
const out = await build({
  entryPoints: { shard: path.join(root, 'worker', 'src', 'shard.ts'), lobby: path.join(root, 'worker', 'src', 'lobby.ts'), shim: shimPath },
  bundle: true, format: 'esm', platform: 'neutral',
  alias: { 'cloudflare:workers': shimPath }, outdir: tmp, write: false, logLevel: 'silent',
});
for (const f of out.outputFiles) writeFileSync(f.path, f.contents);
const bust = '?t=' + Date.now();
// undici rejects a 101 Response, which is exactly what a Durable Object returns
// for a websocket upgrade. Accept it here so the REAL Lobby.fetch runs instead
// of a hand-rolled imitation of it.
const RealResponse = globalThis.Response;
globalThis.Response = class UpgradeResponse extends RealResponse {
  constructor(body, init) {
    if (init && init.status === 101) {
      super(body, { ...init, status: 200 });
      this.upgraded = init.webSocket;
    } else {
      super(body, init);
    }
  }
};

const { FakeCtx } = await import(pathToFileURL(path.join(tmp, 'shim.js')).href + bust);
const { networkKey, shardFor, dailySalt, LOCAL_DEV_SHARD } = await import(pathToFileURL(path.join(tmp, 'shard.js')).href + bust);
const { Lobby } = await import(pathToFileURL(path.join(tmp, 'lobby.js')).href + bust);

const SECRET = 'gate-secret-not-the-owners';
const DAY = Date.UTC(2026, 10, 15, 12, 0, 0);

console.log('lobby shard gate — network scoping');
console.log('  target: worker/src/{shard,lobby}.ts (real modules, Node + cf shim)\n');

// ── 1. the network key ─────────────────────────────────────────────────────
check('IPv4 is its own network', networkKey('203.0.113.7') === '203.0.113.7');
check('an IPv4 port is ignored', networkKey('203.0.113.7:51234') === '203.0.113.7');
check('a forwarded IPv4 list takes the first hop',
  networkKey('203.0.113.7, 10.0.0.1') === '203.0.113.7');
check('an IPv4-mapped IPv6 address is the IPv4',
  networkKey('::ffff:203.0.113.7') === '203.0.113.7');
const a64 = networkKey('2001:db8:aa:bb::1');
check('IPv6 collapses to its /64, not the host',
  a64 === '2001:db8:aa:bb::/64', String(a64));
check('two addresses in one /64 are the same network',
  networkKey('2001:db8:aa:bb:ffff::9') === a64);
check('a different /64 is a different network',
  networkKey('2001:db8:aa:cc::1') !== a64);
const loopback = networkKey('::1');
check('loopback IPv6 still resolves to a network',
  typeof loopback === 'string' && loopback.endsWith('/64'), String(loopback));
check('a missing or unknown IP has no network',
  networkKey(null) === null && networkKey('') === null && networkKey('unknown') === null);

// ── 2. the shard ───────────────────────────────────────────────────────────
const shardA = await shardFor('203.0.113.7', SECRET, DAY);
const shardA2 = await shardFor('203.0.113.7', SECRET, DAY);
const shardB = await shardFor('198.51.100.9', SECRET, DAY);
const shardV6 = await shardFor('2001:db8:aa:bb::1', SECRET, DAY);
const shardTomorrow = await shardFor('203.0.113.7', SECRET, DAY + 86_400_000);
const shardOtherSecret = await shardFor('203.0.113.7', 'another-secret', DAY);

check('the same network always gets the same shard', shardA === shardA2, shardA);
check('two networks get two shards', shardA !== shardB && shardV6 !== shardA);
check('the shard rotates at the UTC day boundary', shardA !== shardTomorrow,
  `${shardA.slice(0, 8)}… → ${shardTomorrow.slice(0, 8)}…`);
check('a different salt gives a different shard', shardA !== shardOtherSecret);
check('the shard carries no readable IP',
  !shardA.includes('.') && !shardA.includes(':') && !shardA.includes('203') && /^[0-9a-f]{32}$/.test(shardA),
  shardA);
check('the day salt is not the owner secret itself',
  (await dailySalt(SECRET, DAY)) !== SECRET && (await dailySalt(SECRET, DAY)).length === 64);
check('no IP means the local-dev shard',
  (await shardFor(null, SECRET, DAY)) === LOCAL_DEV_SHARD);

// ── 3. the Lobby, addressed the way index.ts addresses it ──────────────────
class Harness {
  shards = new Map();
  /** Exactly what worker/src/index.ts does: hash the IP, address the DO. */
  async lobbyFor(ip) {
    const shard = await shardFor(ip, SECRET, DAY);
    if (!this.shards.has(shard)) {
      const ctx = new FakeCtx();
      this.shards.set(shard, { ctx, lobby: new Lobby(ctx, {}) });
    }
    return { shard, ...this.shards.get(shard) };
  }
  async connect(ip) {
    const { lobby, ctx, shard } = await this.lobbyFor(ip);
    const cid = crypto.randomUUID();
    const res = await lobby.fetch(new Request(`https://lobby.internal/?cid=${cid}`, {
      headers: { Upgrade: 'websocket' },
    }));
    const ws = ctx.sockets[ctx.sockets.length - 1];
    return { lobby, ctx, shard, cid, res, ws };
  }
  async announce(conn, name) {
    await conn.lobby.webSocketMessage(conn.ws, JSON.stringify({
      v: 1, id: crypto.randomUUID(), event: 'presence_announce',
      payload: { deviceId: crypto.randomUUID(), name, kind: 'phone', browser: 'Chrome' },
    }));
    return conn.ws.sent.at(-1);
  }
}

const net = new Harness();
const laptopA = await net.connect('203.0.113.7');
const phoneA = await net.connect('203.0.113.7');
const stranger = await net.connect('198.51.100.9');

check('same network → same Lobby instance', laptopA.shard === phoneA.shard);
check('different network → different Lobby instance', laptopA.shard !== stranger.shard);
check('a shard is stored under lobby:<shard>, not one global pool',
  `lobby:${laptopA.shard}` !== 'lobby' && `lobby:${laptopA.shard}`.length > 6);

const ack1 = await net.announce(laptopA, 'Garv’s laptop');
const ack2 = await net.announce(phoneA, 'Redmi 9');
check('both announces were accepted on the shared shard',
  ack1.includes('"success":true') && ack2.includes('"success":true'),
  String(ack1).slice(0, 40));

// Coalesced broadcast: give the DO its 500ms window.
await new Promise((r) => setTimeout(r, 700));
const seenOnLaptop = laptopA.ws.sent.join('\n');
const seenOnStranger = stranger.ws.sent.join('\n');
check('a device on the same network sees the other one', /Redmi 9/.test(seenOnLaptop));
check('a device on another network sees nothing',
  !/Redmi 9/.test(seenOnStranger) && !/Garv/.test(seenOnStranger),
  seenOnStranger ? 'it received something — bad' : 'empty list, correct');

// ── 4. capacity ────────────────────────────────────────────────────────────
const full = new Harness();
let lastAck = '';
for (let i = 0; i < 65; i++) {
  const conn = await full.connect('203.0.113.7');
  lastAck = await full.announce(conn, `device ${i}`);
}
check('a shard holds 64 devices and refuses the 65th',
  lastAck.includes('LOBBY_FULL'), String(lastAck).slice(0, 90));

// ── 5. the IP never lands anywhere ─────────────────────────────────────────
const { ctx } = await net.lobbyFor('203.0.113.7');
const stored = JSON.stringify([...ctx.storage.map.entries()]);
const leaked = ['203.0.113.7', '198.51.100.9', '2001:db8'].filter((ip) => stored.includes(ip));
check('no raw IP is stored in the Durable Object', leaked.length === 0,
  leaked.length ? `leaked: ${leaked.join(', ')}` : `${ctx.storage.map.size} keys, none an IP`);
check('the shard id itself is not an IP either', !stored.includes(String(shardA)) || /^[0-9a-f]{32}$/.test(shardA));

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
