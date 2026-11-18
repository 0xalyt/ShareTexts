/**
 * endpoint.ts — where the Circle mailbox lives.
 *
 * The mailbox is the same Cloudflare Worker that carries room signalling, on a
 * different path (`/circle/…`). This tiny module exists so the circle code can
 * read that origin WITHOUT importing `socket.ts`, which would drag socket.io
 * into a lazy chunk that never speaks socket.io.
 *
 * `VITE_SIGNALING_URL` is the documented knob and is honoured here for the same
 * reason: a self-hosted Worker should not need a code change. A production
 * build refuses a localhost override, exactly like the socket does — shipping a
 * bundle that points at someone's laptop is a broken app, not a configuration.
 */
const envUrl = (import.meta.env?.VITE_SIGNALING_URL as string | undefined)?.trim();
const isLocalhost = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(envUrl ?? '');

export const CIRCLE_ORIGIN = (() => {
  const fallback = 'https://sharetext-signaling.alighttt.workers.dev';
  if (!envUrl) return fallback;
  if (isLocalhost && !import.meta.env.DEV) return fallback;
  return envUrl.replace(/\/+$/, '');
})();
