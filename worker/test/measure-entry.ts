// Measurement-only entry (scripts/measure-do-usage.mjs). Wraps every Durable
// Object entry point so each invocation logs one `[do-meter]` line with its
// class, kind and wall time. Never deployed.
import worker, { Room, Registry, Metrics, Stats, Lobby, Space, Circle } from '../src/index';

const KINDS = ['fetch', 'alarm', 'webSocketMessage', 'webSocketClose', 'webSocketError'] as const;

function meter(cls: { prototype: object; name: string }, name: string) {
  const proto = cls.prototype as Record<string, unknown>;
  for (const kind of KINDS) {
    const orig = proto[kind];
    if (typeof orig !== 'function') continue;
    proto[kind] = async function (this: unknown, ...args: unknown[]) {
      const t0 = Date.now();
      try {
        return await (orig as (...a: unknown[]) => unknown).apply(this, args);
      } finally {
        console.log(`[do-meter] ${name} ${kind} ${Date.now() - t0}`);
      }
    };
  }
}

meter(Room, 'Room');
meter(Registry, 'Registry');
meter(Metrics, 'Metrics');
meter(Stats, 'Stats');
meter(Lobby, 'Lobby');
meter(Space, 'Space');
meter(Circle, 'Circle');

export { Room, Registry, Metrics, Stats, Lobby, Space, Circle };
export default worker;
