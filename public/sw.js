/* ShareTexts service worker — minimal offline-capable shell.
 *
 * Strategy:
 *   - Precache the app shell on install (HTML, manifest, icons).
 *   - Navigations (the app is a single page at "/", including ?join= links):
 *     network-first so the HTML is always fresh, falling back to the cached
 *     shell when offline.
 *   - UNHASHED app files (manifest, favicons, icons, og image): network-first
 *     with a cache fallback. Cache-first here froze branding for returning
 *     visitors — a rebranded manifest/favicon never reached browsers that had
 *     an older copy, and no cache-key bump can be trusted to ship every time.
 *   - Other same-origin GETs (content-hashed assets): cache-first, filling
 *     the cache on first fetch. Cross-origin requests (the signaling
 *     Worker's /health, /lookup, /ws) are never intercepted.
 */
const CACHE = 'sharetexts-v32';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  // Official brand artwork (in-app glyph + footer monoline lockup) —
  // unhashed like the favicons, so the network-first "unhashed" rule below
  // must also cover a future rebrand, and the offline shell must ship the
  // brand, not a broken image.
  '/brand/logo-glyph-orange.webp',
  '/brand/logo-glyph-cream.png',
  '/brand/logo-lockup-monoline.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/og/sharetext-og-icon-v6.jpg',
  '/demo/photo-4x3.jpg',
  // Apple-emoji reaction artwork (P1 STEP 1) — unhashed, so a re-paint of the
  // six faces follows the same network-first "unhashed" rule as the favicons
  // and brand glyphs. Precached so reactions render offline once installed.
  '/emoji-apple/red-heart_2764-fe0f.png',
  '/emoji-apple/thumbs-up_1f44d.png',
  '/emoji-apple/face-with-tears-of-joy_1f602.png',
  '/emoji-apple/face-with-open-mouth_1f62e.png',
  '/emoji-apple/fire_1f525.png',
  '/emoji-apple/folded-hands_1f64f.png',
];

// The build writes dist/precache.json from the Vite manifest: every dynamic
// entry (Room, QR scanner, Settings, Space) with its hash. A deploy renames
// those files, and a tab opened under the previous build would ask for a chunk
// that no longer exists. Precaching them at install means the new worker can
// answer that request from its own cache, and the carried-over cache below
// covers the window before it activates.
async function lazyChunks() {
  try {
    const res = await fetch('/precache.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u.startsWith('/')) : [];
  } catch {
    return []; // a missing manifest must never block the offline shell
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled, not addAll: ONE missing file used to reject the whole
    // install, so the offline shell never arrived and there was no clue why.
    // A shell with 23 of 24 files is an offline app; a rejected install is
    // no offline app at all.
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    const lazy = await lazyChunks();
    if (lazy.length) {
      // One failed chunk must not fail the whole install.
      await Promise.allSettled(lazy.map((url) => cache.add(url)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const stale = (await caches.keys()).filter((k) => k !== CACHE);
    for (const key of stale) {
      const old = await caches.open(key);
      // Carry the previous build's hashed assets forward before dropping its
      // cache: a page that is still open under that build asks for exactly
      // those URLs, and the server no longer has them.
      for (const request of await old.keys()) {
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith('/assets/')) continue;
        if (await cache.match(request)) continue;
        const response = await old.match(request);
        if (response) await cache.put(request, response);
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // PER-URL STALE-WHILE-REVALIDATE: cache each navigated URL under its OWN
    // key and answer from that key. (The previous handler cached every page
    // under '/' — the first public route visited poisoned all others, and the
    // new prerendered route shells (/docs, /privacy, /terms) would never have
    // been served.) The cached copy still paints instantly; fresh HTML is
    // fetched in the background and cached for the next visit.
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached || caches.match('/index.html'));
        // Cached copy answers immediately when present; offline falls back
        // to it too. No cache (first ever visit) waits for the network.
        return cached || network;
      })
    );
    return;
  }

  // Unhashed shell files must track the server: a branding/icon update has
  // to reach every visitor on their next load, online or not.
  const unhashed = SHELL.includes(url.pathname) && url.pathname !== '/';
  if (unhashed) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Hashed assets: cache-first, but a miss must not leave a dead page. A
  // failed fetch falls back to any copy another build left behind, then to
  // the network error (the app's reload guard takes over from there).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Only cache same-origin, successful, non-opaque responses.
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});

// ── Temporary Space reminders (F14) ────────────────────────────────────────
// One push per space per device. The server sends a generic payload:
//   { title, body, spaceId }  — never filenames or content.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* opaque payload */ }
  if (!data || !data.spaceId) return; // unknown push shape — ignore quietly
  event.waitUntil((async () => {
    // Deduplicate: if this space's reminder notification is still showing,
    // replace it rather than stacking duplicates.
    const tag = 'space-reminder-' + data.spaceId;
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const title = typeof data.title === 'string' ? data.title : 'ShareTexts';
    const body = typeof data.body === 'string' ? data.body : 'Your space closes soon.';
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: false, // one reminder; a re-shown tag would be a second buzz
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { spaceId: data.spaceId },
    });
    return clientList.length; // keeps linters honest about the clients read
  })());
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const target = data.spaceId
    ? '/space/' + data.spaceId
    : '/';
  event.waitUntil((async () => {
    // Focus an existing window on this origin if one exists; the app routes
    // itself to the space from its stored credential. Otherwise open fresh —
    // if the credential is gone the app shows the join surface honestly.
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if (client.navigate) {
          try { await client.navigate(target); } catch { /* navigation refused — the focused app is enough */ }
        }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
